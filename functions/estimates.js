const {
  randomBytes,
  timingSafeEqual
} = require('node:crypto');
const {
  HttpsError
} = require('firebase-functions/v2/https');
const {
  getStorage
} = require('firebase-admin/storage');
const {
  PDFDocument,
  StandardFonts,
  rgb
} = require('pdf-lib');
const {
  requireCapability
} = require('./access');
const {
  hash,
  documentId,
  normalizeEmail,
  validEmail,
  rateLimit
} = require('./security');
const PHOTO_LIMIT = 1572864,
  PDF_LIMIT = 10 * 1024 * 1024;
const timestamp = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : Date.parse(value || '');
const dateString = value => Number.isFinite(timestamp(value)) ? new Date(timestamp(value)).toISOString() : null;
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
function decimal(value, places, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !/^[0-9]+(?:\.[0-9]+)?$/.test(String(value))) fail('invalid-argument', `${label} must be a non-negative number.`);
  const [whole, fraction = ''] = String(value).split('.');
  if (fraction.length > places) fail('invalid-argument', `${label} has too many decimal places.`);
  const scaled = BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
  if (scaled > 100000000000n) fail('invalid-argument', `${label} is too large.`);
  return scaled;
}
function estimateTotals(items, taxRate = 0) {
  if (!Array.isArray(items) || !items.length || items.length > 50) fail('invalid-argument', 'Include between 1 and 50 labor, material or service lines.');
  let subtotal = 0n;
  const lineItems = items.map(item => {
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    if (!description || description.length > 300 || !['labor', 'material', 'service'].includes(item.kind)) fail('invalid-argument', 'Each estimate line needs a description and valid kind.');
    const quantity = decimal(item.quantity, 3, 'Quantity'),
      unitPrice = decimal(item.unitPrice, 2, 'Unit price');
    if (quantity === 0n) fail('invalid-argument', 'Line quantities must be greater than zero.');
    const amount = (quantity * unitPrice + 500n) / 1000n;
    subtotal += amount;
    return {
      kind: item.kind,
      description,
      quantity: item.quantity,
      unitPrice: Number(unitPrice) / 100,
      unitPriceCents: Number(unitPrice),
      amountCents: Number(amount)
    };
  });
  const rate = decimal(taxRate, 2, 'Tax rate');
  if (rate > 10000n) fail('invalid-argument', 'Tax rate cannot exceed 100 percent.');
  const tax = (subtotal * rate + 5000n) / 10000n,
    total = subtotal + tax;
  if (total > 1000000000n) fail('invalid-argument', 'Estimate total exceeds the supported limit.');
  return {
    lineItems,
    taxRate: Number(rate) / 100,
    subtotalCents: Number(subtotal),
    taxCents: Number(tax),
    totalCents: Number(total),
    subtotal: Number(subtotal) / 100,
    tax: Number(tax) / 100,
    total: Number(total) / 100
  };
}
function cleanDraft(data) {
  if (!data || typeof data !== 'object') fail('invalid-argument', 'Estimate details are required.');
  const text = (key, max, required = false) => {
    const value = typeof data[key] === 'string' ? data[key].trim() : '';
    if (value.length > max || required && !value) fail('invalid-argument', `Enter a valid ${key}.`);
    return value;
  };
  const validDays = data.validDays ?? 30;
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 90) fail('invalid-argument', 'Estimate validity must be between 1 and 90 days.');
  const photoIds = data.photoIds || [];
  if (!Array.isArray(photoIds) || photoIds.length > 6 || new Set(photoIds).size !== photoIds.length) fail('invalid-argument', 'Attach up to six distinct estimate photos.');
  photoIds.forEach(id => documentId(id, 'photo'));
  return {
    title: text('title', 200, true),
    serviceType: text('serviceType', 200, true),
    scopeOfWork: text('scopeOfWork', 5000),
    notes: text('notes', 3000),
    validDays,
    photoIds,
    ...estimateTotals(data.lineItems, data.taxRate ?? 0)
  };
}
const scoped = (scope, data) => !!data && (scope.companyId ? data.companyId === scope.companyId : !data.companyId && data.userId === scope.uid);
const managed = (scope, row) => {
  if (!row.exists || !scoped(scope, row.data())) fail('permission-denied', 'Estimate is not available in your workspace.');
};
const printable = value => String(value || '').replace(/[^\x20-\x7e\xa0-\xff\n]/g, '?');
async function createEstimatePdf(estimate, company, photos = []) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page, y;
  const next = () => {
    page = pdf.addPage([612, 792]);
    y = 750;
  };
  next();
  const line = (value, {
    size = 11,
    strong = false,
    color = rgb(.12, .16, .18)
  } = {}) => {
    const selected = strong ? bold : font;
    let current = '';
    const words = printable(value).split(/\s+/);
    for (const word of words) {
      const candidate = current ? current + ' ' + word : word;
      if (selected.widthOfTextAtSize(candidate, size) > 520 && current) {
        if (y < 50) next();
        page.drawText(current, {
          x: 44,
          y,
          size,
          font: selected,
          color
        });
        y -= size + 6;
        current = word;
      } else current = candidate;
    }
    if (y < 50) next();
    page.drawText(current, {
      x: 44,
      y,
      size,
      font: selected,
      color
    });
    y -= size + 9;
  };
  line(company.name || company.businessName || 'Route Logistics', {
    size: 22,
    strong: true,
    color: rgb(.02, .4, .27)
  });
  if (company.phone || company.phoneNumber) line(company.phone || company.phoneNumber, {
    size: 10
  });
  line(`Estimate ${estimate.estimateNumber} / version ${estimate.version}`, {
    size: 15,
    strong: true
  });
  line(estimate.title, {
    size: 14,
    strong: true
  });
  line(`Prepared for: ${estimate.recipient.name}`);
  if (estimate.recipient.address) line(estimate.recipient.address);
  line(`Valid until: ${estimate.validUntil.slice(0, 10)}`);
  line('Scope of work', {
    strong: true
  });
  line(estimate.scopeOfWork || estimate.serviceType);
  line('Labor, materials and services', {
    strong: true
  });
  for (const item of estimate.lineItems) line(`${item.description} - ${item.quantity} x $${item.unitPrice.toFixed(2)} = $${(item.amountCents / 100).toFixed(2)}`);
  line(`Subtotal: $${(estimate.subtotalCents / 100).toFixed(2)}`);
  line(`Tax (${estimate.taxRate}%): $${(estimate.taxCents / 100).toFixed(2)}`);
  line(`Total: $${(estimate.totalCents / 100).toFixed(2)} USD`, {
    size: 16,
    strong: true
  });
  if (estimate.notes) {
    line('Notes', {
      strong: true
    });
    line(estimate.notes);
  }
  for (const photo of photos) {
    // pdf-lib's JPEG parser reads from byte zero of the underlying ArrayBuffer.
    // Node Buffers can be slices of a larger pool; give it an exact owned view.
    const image = await pdf.embedJpg(Uint8Array.from(photo.bytes));
    const dimensions = image.scale(Math.min(480 / image.width, 220 / image.height, 1));
    if (y - dimensions.height < 60) next();
    page.drawImage(image, {
      x: 44,
      y: y - dimensions.height,
      width: dimensions.width,
      height: dimensions.height
    });
    y -= dimensions.height + 18;
    if (photo.caption) line(photo.caption, {
      size: 10
    });
  }
  line('Customer approval confirms the scope and quoted total for this version. Scheduling is confirmed separately.', {
    size: 9
  });
  const bytes = Buffer.from(await pdf.save());
  if (bytes.length > PDF_LIMIT) fail('resource-exhausted', 'Estimate PDF is too large. Reduce the attached photos.');
  return bytes;
}
function estimateHandlers(db, config = {}) {
  const enabled = config.enabled || (() => false),
    emailEnabled = config.emailEnabled || (() => false),
    now = config.now || (() => Date.now()),
    bucket = config.bucketProvider || (() => getStorage().bucket());
  const appUrl = config.appUrl || (() => 'https://route-logistics.com');
  const ref = (name, id) => db.doc(`${name}/${id}`),
    versionRef = (id, version) => ref('rlEstimateVersions', hash(`${id}:${version}`)),
    secretRef = id => ref('rlEstimateApprovalSecrets', id);
  const enabledCheck = () => {
    if (!enabled()) fail('failed-precondition', 'Photo estimates are awaiting production configuration.');
  };
  const view = (id, data) => ({
    id,
    ...data,
    legacy: data.rlManaged !== true,
    createdAt: dateString(data.createdAt) || data.createdAt,
    updatedAt: dateString(data.updatedAt) || data.updatedAt
  });
  async function photosFor(scope, id, photoIds, tx) {
    const rows = await Promise.all(photoIds.map(photoId => tx ? tx.get(ref('rlEstimatePhotos', photoId)) : ref('rlEstimatePhotos', photoId).get()));
    for (const row of rows) if (!row.exists || row.get('estimateId') !== id || !scoped(scope, row.data())) fail('permission-denied', 'A selected photo does not belong to this estimate.');
    return rows;
  }
  async function photoBytes(row) {
    const path = row.get('storagePath'),
      prefix = `rlEstimatePhotos/${row.get('companyId') || row.get('userId')}/${row.get('estimateId')}/`;
    if (typeof path !== 'string' || !path.startsWith(prefix) || path.includes('..')) fail('permission-denied', 'Private photo unavailable.');
    const file = bucket().file(path),
      [metadata] = await file.getMetadata();
    if (Number(metadata.size) > PHOTO_LIMIT || metadata.contentType !== 'image/jpeg') fail('failed-precondition', 'Unsupported private estimate photo.');
    const [bytes] = await file.download();
    if (bytes.length > PHOTO_LIMIT || bytes[0] !== 255 || bytes[1] !== 216) fail('failed-precondition', 'Estimate photo is not a valid JPEG.');
    return {
      id: row.id,
      bytes,
      caption: row.get('caption') || ''
    };
  }
  async function buildPdf(scope, id, data) {
    const [company, photos] = await Promise.all([scope.companyId ? ref('companies', scope.companyId).get() : ref('users', scope.uid).get(), photosFor(scope, id, data.photoIds || [])]);
    return createEstimatePdf(data, company.data() || {}, await Promise.all(photos.map(photoBytes)));
  }
  async function recipient(scope, data, tx) {
    if (data.customerId) {
      const id = documentId(data.customerId, 'customer'),
        customer = await tx.get(ref('customers', id));
      if (!customer.exists || !scoped(scope, customer.data()) || customer.get('isActive') === false) fail('permission-denied', 'Choose an active customer from your company.');
      const row = customer.data();
      return {
        customerId: id,
        recipient: {
          name: String(row.name || 'Customer').slice(0, 200),
          email: normalizeEmail(row.email),
          phone: String(row.phone || '').slice(0, 100),
          address: [typeof row.address === 'string' ? row.address : row.address?.street || row.address?.line1,
            row.city || row.address?.city, row.state || row.address?.state, row.zipCode || row.address?.zipCode || row.address?.postalCode].filter(v => typeof v === 'string' && v.trim()).join(', ').slice(0, 500)
        }
      };
    }
    const prospect = data.prospect || {},
      name = String(prospect.name || '').trim(),
      email = normalizeEmail(prospect.email);
    if (!name || name.length > 200 || email && !validEmail(email)) fail('invalid-argument', 'Choose a customer or enter a prospect name and valid email.');
    return {
      customerId: null,
      recipient: {
        name,
        email,
        phone: String(prospect.phone || '').slice(0, 100),
        address: String(prospect.address || '').slice(0, 500)
      }
    };
  }
  return {
    handle: async request => {
      const scope = await requireCapability(db, request, 'estimates.manage'),
        data = request.data || {},
        action = data.action;
      await rateLimit(db, 'estimate-manage', scope.uid, 40);
      if (action === 'list') {
        if (!enabled()) return {
          enabled: false,
          emailEnabled: false,
          estimates: [],
          hasMore: false
        };
        const rows = await db.collection('estimates').where(scope.companyId ? 'companyId' : 'userId', '==', scope.companyId || scope.uid).orderBy('createdAt', 'desc').limit(101).get();
        return {
          enabled: true,
          emailEnabled: emailEnabled(),
          estimates: rows.docs.slice(0, 100).filter(row => scoped(scope, row.data())).map(row => view(row.id, row.data())),
          hasMore: rows.size > 100
        };
      }
      enabledCheck();
      if (action === 'save') {
        const draft = cleanDraft(data.data),
          isNew = !data.estimateId,
          operation = documentId(data.operationId, 'operation');
        if (!/^[A-Za-z0-9_-]{16,80}$/.test(operation)) fail('invalid-argument', 'Use a stable estimate operation ID.');
        const id = isNew ? hash(`${scope.companyId || scope.uid}:${scope.uid}:${operation}`) : documentId(data.estimateId, 'estimate'),
          target = ref('estimates', id),
          operationRef = ref('rlEstimateOperations', hash(`${scope.companyId || scope.uid}:${scope.uid}:${operation}`));
        const fingerprint = hash(JSON.stringify({
          id,
          expectedVersion: data.expectedVersion ?? null,
          draft,
          customerId: data.data.customerId || null,
          prospect: data.data.prospect || null
        }));
        return db.runTransaction(async tx => {
          const [old, previousOperation, secret] = await Promise.all([tx.get(target), tx.get(operationRef), tx.get(secretRef(id))]);
          if (previousOperation.exists) {
            if (previousOperation.get('fingerprint') !== fingerprint) fail('already-exists', 'This operation was already used for a different estimate change.');
            managed(scope, old);
            return {
              estimate: view(id, old.data()),
              existing: true
            };
          }
          if (old.exists) {
            managed(scope, old);
            if (old.get('rlManaged') !== true) fail('failed-precondition', 'Legacy estimates are preserved. Copy their content into a new photo estimate.');
            if (['approved', 'converted'].includes(old.get('status'))) fail('failed-precondition', 'An approved estimate is immutable. Create a new draft for a revised quote.');
            if (data.expectedVersion !== old.get('version')) fail('aborted', 'This estimate changed. Reload before saving your draft.');
          } else if (!isNew) fail('not-found', 'Estimate not found.');
          const contact = await recipient(scope, data.data, tx);
          await photosFor(scope, id, draft.photoIds, tx);
          const version = (old.get('version') || 0) + 1,
            created = old.get('createdAt') || new Date(now()).toISOString();
          const current = {
            ...draft,
            ...contact,
            userId: old.get('userId') || scope.uid,
            ...(scope.companyId ? {
              companyId: scope.companyId
            } : {}),
            rlManaged: true,
            version,
            status: 'draft',
            estimateNumber: old.get('estimateNumber') || `RL-${id.slice(0, 8).toUpperCase()}`,
            estimatedCost: draft.total,
            totalAmount: draft.total,
            createdAt: created,
            updatedAt: new Date(now()).toISOString(),
            validUntil: new Date(now() + draft.validDays * 86400000).toISOString()
          };
          tx.set(target, current);
          tx.create(versionRef(id, version), {
            ...current,
            estimateId: id,
            createdAt: new Date(now()).toISOString()
          });
          tx.create(operationRef, {
            companyId: scope.companyId || null,
            userId: scope.uid,
            estimateId: id,
            version,
            fingerprint,
            createdAt: new Date(now())
          });
          if (secret.exists) tx.update(secretRef(id), {
            status: 'superseded'
          });
          tx.create(ref('rlAudit', `estimate_${id}_v${version}`), {
            action: 'estimate.save',
            companyId: scope.companyId || null,
            actorId: scope.uid,
            estimateId: id,
            version,
            totalCents: current.totalCents,
            createdAt: new Date(now())
          });
          return {
            estimate: view(id, current)
          };
        });
      }
      const id = documentId(data.estimateId, 'estimate'),
        target = ref('estimates', id),
        row = await target.get();
      managed(scope, row);
      const estimate = row.data();
      if (action === 'get') {
        const versions = await db.collection('rlEstimateVersions').where('estimateId', '==', id).limit(100).get(),
          photos = estimate.rlManaged ? await photosFor(scope, id, estimate.photoIds || []) : [],
          mail = estimate.rlManaged ? await ref('rlMail', `estimate_${id}_v${estimate.version}`).get() : null;
        return {
          estimate: view(id, estimate),
          emailEnabled: emailEnabled(),
          delivery: mail?.exists ? {status:mail.get('status'),attempts:mail.get('attempts') || 0,failureCode:mail.get('failureCode') || null,sentAt:dateString(mail.get('sentAt'))} : null,
          versions: versions.docs.map(v => ({
            version: v.get('version'),
            status: v.get('version') === estimate.version ? estimate.status : 'superseded',
            totalCents: v.get('totalCents'),
            createdAt: v.get('createdAt')
          })).sort((a, b) => b.version - a.version),
          photos: photos.map(p => ({
            id: p.id,
            caption: p.get('caption') || ''
          }))
        };
      }
      if (estimate.rlManaged !== true) fail('failed-precondition', 'This legacy estimate is read-only in the photo workflow.');
      if (action === 'photo-upload') {
        if (estimate.status !== 'draft') fail('failed-precondition', 'Save a new draft before attaching photos.');
        const operation = documentId(data.operationId, 'operation');
        if (!/^[A-Za-z0-9_-]{16,80}$/.test(operation) || typeof data.base64 !== 'string' || data.base64.length > Math.ceil(PHOTO_LIMIT * 4 / 3) + 4) fail('invalid-argument', 'Use a JPEG photo no larger than 1.5 MB.');
        const bytes = Buffer.from(data.base64, 'base64');
        if (bytes.length > PHOTO_LIMIT || bytes[0] !== 255 || bytes[1] !== 216) fail('invalid-argument', 'A JPEG photo is required.');
        const photoId = hash(`${scope.companyId || scope.uid}:${scope.uid}:${operation}`),
          photoRef = ref('rlEstimatePhotos', photoId),
          fingerprint = hash(Buffer.concat([Buffer.from(id), bytes, Buffer.from(String(data.caption || ''))])),
          old = await photoRef.get();
        if (old.exists) {
          if (old.get('fingerprint') !== fingerprint) fail('already-exists', 'This photo operation was already used for different content.');
          return {
            id: photoId
          };
        }
        const path = `rlEstimatePhotos/${scope.companyId || scope.uid}/${id}/${photoId}-${fingerprint.slice(0, 16)}.jpg`;
        await bucket().file(path).save(bytes, {
          resumable: false,
          contentType: 'image/jpeg',
          metadata: {
            cacheControl: 'private, no-store'
          }
        });
        await db.runTransaction(async tx => {
          const [current, previous] = await Promise.all([tx.get(target), tx.get(photoRef)]);
          managed(scope, current);
          if (current.get('status') !== 'draft') fail('failed-precondition', 'Estimate changed while uploading. Reopen it before attaching this photo.');
          if (previous.exists) {
            if (previous.get('fingerprint') !== fingerprint) fail('already-exists', 'Photo operation conflicts with an existing photo.');
            return;
          }
          tx.create(photoRef, {
            estimateId: id,
            userId: scope.uid,
            ...(scope.companyId ? {
              companyId: scope.companyId
            } : {}),
            fingerprint,
            storagePath: path,
            caption: String(data.caption || '').slice(0, 500),
            createdAt: new Date(now()).toISOString()
          });
        });
        return {
          id: photoId
        };
      }
      if (action === 'photo-read') {
        const photos = await photosFor(scope, id, [documentId(data.photoId, 'photo')]),
          photo = await photoBytes(photos[0]);
        return {
          dataUri: `data:image/jpeg;base64,${photo.bytes.toString('base64')}`
        };
      }
      if (data.expectedVersion !== estimate.version) fail('aborted', 'This estimate changed. Reload before continuing.');
      if (action === 'pdf') return {
        dataUri: `data:application/pdf;base64,${(await buildPdf(scope, id, estimate)).toString('base64')}`,
        filename: `${estimate.estimateNumber}-v${estimate.version}.pdf`
      };
      if (action === 'deliver') {
        if (!emailEnabled()) fail('failed-precondition', 'Estimate email delivery is disabled. You can download the PDF for review.');
        if (!['draft', 'sent'].includes(estimate.status)) fail('failed-precondition', 'Only an open estimate version can be sent.');
        if (!validEmail(estimate.recipient.email)) fail('failed-precondition', 'Add a valid customer or prospect email before sending.');
        const mailId = `estimate_${id}_v${estimate.version}`,
          mailRef = ref('rlMail', mailId),
          previous = await mailRef.get();
        if (previous.exists) return {
          queued: true,
          mailId,
          existing: true
        };
        const pdf = await buildPdf(scope, id, estimate),
          path = `rlEstimateDocuments/${scope.companyId || estimate.userId}/${id}/v${estimate.version}.pdf`;
        await bucket().file(path).save(pdf, {
          resumable: false,
          contentType: 'application/pdf',
          metadata: {
            cacheControl: 'private, no-store'
          }
        });
        const token = randomBytes(32).toString('hex'),
          tokenHash = hash(token),
          base = String(appUrl()).replace(/\/$/, ''),
          link = `${base}/estimate-approval#id=${id}&token=${token}`;
        return db.runTransaction(async tx => {
          const [current, old, customer] = await Promise.all([tx.get(target), tx.get(mailRef), estimate.customerId ? tx.get(ref('customers', estimate.customerId)) : Promise.resolve(null)]);
          managed(scope, current);
          if (current.get('version') !== estimate.version || !['draft', 'sent'].includes(current.get('status'))) fail('aborted', 'The quote changed before email was queued.');
          if (customer && (!scoped(scope, customer.data()) || normalizeEmail(customer.get('email')) !== estimate.recipient.email)) fail('failed-precondition', 'Customer contact changed. Save a new estimate version before sending.');
          if (old.exists) return {
            queued: true,
            mailId,
            existing: true
          };
          const expiry = new Date(timestamp(estimate.validUntil));
          tx.set(secretRef(id), {
            companyId: scope.companyId || null,
            userId: estimate.userId,
            estimateId: id,
            version: estimate.version,
            tokenHash,
            status: 'open',
            expiresAt: expiry,
            recipientEmail: estimate.recipient.email
          });
          tx.create(mailRef, {
            to: estimate.recipient.email,
            subject: `Estimate ${estimate.estimateNumber} from your service provider`,
            text: `Review the attached estimate PDF and its quoted scope and total.\n\nReview and approve this specific version: ${link}\n\nThis private link expires ${estimate.validUntil.slice(0, 10)}. Contact your provider with questions.`,
            status: 'queued',
            attempts: 0,
            availableAt: now(),
            createdAt: new Date(now()),
            expiresAt: expiry,
            estimateId: id,
            estimateVersion: estimate.version,
            estimateApprovalHash: tokenHash,
            estimatePdfPath: path,
            estimateRecipient: estimate.recipient.email,
            estimateCompanyId: scope.companyId || null,
            estimateSenderUid: scope.uid
          });
          tx.update(target, {
            status: 'sent',
            sentAt: new Date(now()).toISOString(),
            updatedAt: new Date(now()).toISOString()
          });
          tx.create(ref('rlAudit', `estimate_${id}_v${estimate.version}_send`), {
            action: 'estimate.email-queued',
            companyId: scope.companyId || null,
            actorId: scope.uid,
            estimateId: id,
            version: estimate.version,
            createdAt: new Date(now())
          });
          return {
            queued: true,
            mailId
          };
        });
      }
      if (action === 'convert') {
        await requireCapability(db, request, 'jobs.schedule');
        await requireCapability(db, request, 'customers.manage');
        const schedule = data.schedule || {};
        const serviceDate = Date.parse(`${schedule.date}T00:00:00Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.date || '') || !Number.isFinite(serviceDate) || new Date(serviceDate).toISOString().slice(0, 10) !== schedule.date || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(schedule.time || '')) fail('invalid-argument', 'Choose a valid service date and time.');
        if (data.createCustomer === true && data.customerId) fail('invalid-argument', 'Choose an existing customer or explicitly create one, not both.');
        const jobId = `rl_estimate_${id}`,
          jobRef = ref('jobs', jobId);
        return db.runTransaction(async tx => {
          const [current, approval, snapshot, existing] = await Promise.all([tx.get(target), tx.get(secretRef(id)), tx.get(versionRef(id, estimate.version)), tx.get(jobRef)]);
          managed(scope, current);
          if (current.get('version') !== data.expectedVersion) fail('aborted', 'Estimate version changed.');
          if (existing.exists) {
            if (!scoped(scope, existing.data()) || existing.get('estimateId') !== id) fail('already-exists', 'The destination job is unavailable.');
            return {
              jobId,
              existing: true
            };
          }
          if (current.get('status') !== 'approved' || approval.get('status') !== 'approved' || approval.get('version') !== current.get('version') || !approval.get('approvedAt') || !snapshot.exists || snapshot.get('totalCents') !== current.get('totalCents')) fail('failed-precondition', 'This exact estimate version must be approved by its recipient before conversion.');
          const source = snapshot.data();
          let customer, newCustomer = null;
          if (source.customerId || data.customerId) {
            customer = await tx.get(ref('customers', documentId(source.customerId || data.customerId, 'customer')));
            if (!scoped(scope, customer.data()) || customer.get('isActive') === false) fail('permission-denied', 'The approved customer is unavailable.');
            if (!source.customerId && normalizeEmail(customer.get('email')) !== source.recipient.email) fail('failed-precondition', 'The selected customer must match the approved prospect email.');
          } else if (data.createCustomer === true) {
            const newId = `rl_estimate_${id}_customer`, destination = ref('customers', newId);
            const [existingCustomer, matches] = await Promise.all([tx.get(destination), tx.get(db.collection('customers').where(scope.companyId ? 'companyId' : 'userId','==',scope.companyId || scope.uid).where('email','==',source.recipient.email).limit(2))]);
            if (existingCustomer.exists || !matches.empty) fail('failed-precondition', 'A customer already uses this approved email. Select the matching company customer explicitly.');
            newCustomer = {userId:current.get('userId'),...(scope.companyId ? {companyId:scope.companyId} : {}),name:source.recipient.name,email:source.recipient.email,emailNormalized:source.recipient.email,phone:source.recipient.phone,address:source.recipient.address,city:'',state:'',zipCode:'',isActive:true,totalSpent:0,totalJobs:0,lastServiceDate:null,source:'rl-approved-estimate',createdFromEstimateId:id,createdAt:new Date(now()).toISOString(),updatedAt:new Date(now()).toISOString()};
            customer = {id:newId,ref:destination,get:key=>newCustomer[key]};
          } else fail('failed-precondition', 'Select a matching company customer or explicitly create one from this approved prospect.');
          let assignedTo = schedule.assignedTo || null;
          if (assignedTo && scope.companyId) {
            const company = await tx.get(ref('companies', scope.companyId));
            if (assignedTo !== company.get('ownerId')) {
              const member = await tx.get(ref('teamMembers', documentId(assignedTo, 'technician')));
              if (member.get('companyId') !== scope.companyId || member.get('status') !== 'active' || !member.get('uid')) fail('permission-denied', 'Choose an active technician from this company.');
            }
          } else if (assignedTo && assignedTo !== scope.uid) fail('permission-denied', 'Solo jobs cannot be assigned to another workspace.');
          const job = {
            userId: current.get('userId'),
            ...(scope.companyId ? {
              companyId: scope.companyId
            } : {}),
            customerId: customer.id,
            customerName: customer.get('name') || source.recipient.name,
            customerPhone: customer.get('phone') || '',
            address: source.recipient.address,
            serviceType: source.serviceType,
            title: source.title,
            scopeOfWork: source.scopeOfWork,
            notes: String(schedule.notes || source.notes || '').slice(0, 3000),
            date: schedule.date,
            time: schedule.time,
            assignedTo,
            status: 'scheduled',
            estimatedCost: source.total,
            total: source.total,
            estimateId: id,
            estimateVersion: source.version,
            createdAt: new Date(now()).toISOString(),
            updatedAt: new Date(now()).toISOString()
          };
          if (newCustomer) tx.create(customer.ref, newCustomer);
          tx.create(jobRef, job);
          tx.update(target, {
            status: 'converted',
            convertedJobId: jobId,
            convertedCustomerId: customer.id,
            convertedAt: new Date(now()).toISOString()
          });
          tx.create(ref('rlEstimateConversions', id), {
            companyId: scope.companyId || null,
            estimateId: id,
            version: source.version,
            jobId,
            customerId: customer.id,
            actorId: scope.uid,
            createdAt: new Date(now())
          });
          tx.create(ref('rlAudit', `estimate_${id}_converted`), {
            action: 'estimate.convert',
            companyId: scope.companyId || null,
            estimateId: id,
            jobId,
            actorId: scope.uid,
            createdAt: new Date(now())
          });
          return {
            jobId,
            existing: false
          };
        });
      }
      fail('invalid-argument', 'Choose a valid estimate action.');
    },
    approval: async request => {
      enabledCheck();
      const data = request.data || {},
        id = documentId(data.estimateId, 'estimate'),
        token = data.token;
      await rateLimit(db, 'estimate-review', hash(request.rawRequest?.ip || 'unknown'), 30);
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail('permission-denied', 'This estimate link is invalid or expired.');
      const target = ref('estimates', id),
        tokenHash = hash(token);
      const validate = (row, secret) => {
        if (!row.exists || row.get('rlManaged') !== true || !secret.exists || !['open', 'approved'].includes(secret.get('status')) || secret.get('version') !== row.get('version') || (secret.get('companyId') || null) !== (row.get('companyId') || null) || secret.get('userId') !== row.get('userId') || !Number.isFinite(timestamp(secret.get('expiresAt'))) || timestamp(secret.get('expiresAt')) <= now() || typeof secret.get('tokenHash') !== 'string' || secret.get('tokenHash').length !== tokenHash.length || !timingSafeEqual(Buffer.from(secret.get('tokenHash')), Buffer.from(tokenHash))) fail('permission-denied', 'This estimate link is invalid, expired or superseded.');
      };
      const validateRecipient = async (row, tx) => {
        if (!row.get('customerId')) return;
        const target = ref('customers', documentId(row.get('customerId'), 'customer'));
        const customer = tx ? await tx.get(target) : await target.get();
        if (!customer.exists || !scoped({companyId:row.get('companyId') || null,uid:row.get('userId')},customer.data()) || customer.get('isActive') === false || normalizeEmail(customer.get('email')) !== row.get('recipient')?.email) fail('permission-denied','This estimate recipient changed. Ask the service provider for a new review link.');
      };
      if (data.action === 'get') {
        const [row, secret] = await Promise.all([target.get(), secretRef(id).get()]);
        validate(row, secret);
        await validateRecipient(row);
        const snapshot = await versionRef(id, row.get('version')).get();
        if (!snapshot.exists || !scoped({companyId:row.get('companyId') || null,uid:row.get('userId')},snapshot.data()) || snapshot.get('totalCents') !== row.get('totalCents')) fail('not-found', 'Estimate version unavailable.');
        const value = snapshot.data(),
          scope = {
            companyId: value.companyId || null,
            uid: value.userId
          },
          company = scope.companyId ? await ref('companies', scope.companyId).get() : await ref('users', scope.uid).get(),
          photos = await photosFor(scope, id, value.photoIds || []);
        return {
          estimate: {
            id,
            title: value.title,
            estimateNumber: value.estimateNumber,
            version: value.version,
            status: row.get('status'),
            customerName: value.recipient.name,
            serviceType: value.serviceType,
            scopeOfWork: value.scopeOfWork,
            notes: value.notes,
            lineItems: value.lineItems,
            subtotalCents: value.subtotalCents,
            taxCents: value.taxCents,
            totalCents: value.totalCents,
            total: value.total,
            taxRate: value.taxRate,
            validUntil: value.validUntil
          },
          company: {
            name: company.get('name') || company.get('businessName') || 'Your service provider'
          },
          photos: await Promise.all(photos.map(async photo => {
            const image = await photoBytes(photo);
            return {
              id: image.id,
              caption: image.caption,
              dataUri: `data:image/jpeg;base64,${image.bytes.toString('base64')}`
            };
          }))
        };
      }
      if (data.action !== 'approve' || data.acceptedTerms !== true || typeof data.signerName !== 'string' || data.signerName.trim().length < 2 || data.signerName.length > 100) fail('invalid-argument', 'Enter your name and confirm approval of this estimate version.');
      return db.runTransaction(async tx => {
        const [row, secret] = await Promise.all([tx.get(target), tx.get(secretRef(id))]);
        validate(row, secret);
        await validateRecipient(row,tx);
        const version = await tx.get(versionRef(id,row.get('version')));
        if (!version.exists || !scoped({companyId:row.get('companyId') || null,uid:row.get('userId')},version.data()) || version.get('totalCents') !== row.get('totalCents')) fail('failed-precondition','This quote version changed. Ask the provider for a new link.');
        if (secret.get('status') === 'approved') return {
          approved: true,
          existing: true,
          version: row.get('version')
        };
        if (row.get('status') !== 'sent') fail('failed-precondition', 'This estimate is not currently open for approval.');
        tx.update(secretRef(id), {
          status: 'approved',
          approvedAt: new Date(now()),
          signerName: data.signerName.trim()
        });
        tx.update(target, {
          status: 'approved',
          approvedAt: new Date(now()).toISOString(),
          approvalName: data.signerName.trim()
        });
        tx.create(ref('rlAudit', `estimate_${id}_v${row.get('version')}_approved`), {
          action: 'estimate.customer-approval',
          companyId: row.get('companyId') || null,
          estimateId: id,
          version: row.get('version'),
          signerName: data.signerName.trim(),
          totalCents: row.get('totalCents'),
          createdAt: new Date(now())
        });
        return {
          approved: true,
          existing: false,
          version: row.get('version')
        };
      });
    }
  };
}
module.exports = {
  estimateHandlers,
  estimateTotals,
  cleanDraft,
  createEstimatePdf,
  PHOTO_LIMIT,
  PDF_LIMIT
};
