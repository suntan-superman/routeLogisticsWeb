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
  accessScope,
  requireCapability,
  hasCapability
} = require('./access');
const {
  hash,
  documentId,
  normalizeEmail,
  validEmail,
  rateLimit
} = require('./security');
const { serviceAreaWorkflow, storedGeometry, propertyAddress } = require('./serviceAreaWorkflows');
const { serviceAreaHandlers } = require('./serviceAreas');
const { validatedCustomerAddress } = require('./customerAddresses');
const { approvedBillingSnapshot } = require('./shared/invoiceMath');
const { lifecycleFor } = require('./shared/customerLifecycle');
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
function estimateTotals(items, taxRate = 0, { allowEmpty = false } = {}) {
  if (!Array.isArray(items) || items.length > 50 || !allowEmpty && !items.length) fail('invalid-argument', 'Include between 1 and 50 labor, material or service lines.');
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
function cleanDraft(data, { allowUnpriced = false } = {}) {
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
    technicianNotes: text('technicianNotes', 3000),
    internalReviewNotes: text('internalReviewNotes', 3000),
    validDays,
    photoIds,
    ...estimateTotals(data.lineItems, data.taxRate ?? 0, { allowEmpty: allowUnpriced })
  };
}
function assertDeliveryReady(estimate) {
  if (!Array.isArray(estimate.lineItems) || !estimate.lineItems.length) fail('failed-precondition', 'Add and save at least one priced labor, material or service line before approving customer delivery.');
  if (!validEmail(estimate.recipient?.email)) fail('failed-precondition', 'Add and save a valid customer email before approving customer delivery.');
}
function estimateTemplateView(row) {
  const value = row.data(), money = input => Number.isFinite(Number(input)) && Number(input) >= 0 ? Number(Number(input).toFixed(2)) : 0,
    hours = Number.isFinite(Number(value.laborHours)) && Number(value.laborHours) > 0 ? Number(Number(value.laborHours).toFixed(3)) : 0,
    laborRate = money(value.laborRate), materialCost = money(value.materialCost), totalCost = money(value.totalCost), lineItems = [];
  if (hours && laborRate) lineItems.push({ kind: 'labor', description: String(value.serviceType || value.name || 'Labor').slice(0, 300), quantity: hours, unitPrice: laborRate });
  if (materialCost) lineItems.push({ kind: 'material', description: String(value.materials || `${value.name || 'Service'} materials`).slice(0, 300), quantity: 1, unitPrice: materialCost });
  if (!lineItems.length && totalCost) lineItems.push({ kind: 'service', description: String(value.name || value.serviceType || 'Service').slice(0, 300), quantity: 1, unitPrice: totalCost });
  return { id: row.id, name: String(value.name || 'Estimate template').slice(0, 200), serviceType: String(value.serviceType || '').slice(0, 200), scopeOfWork: String(value.scopeOfWork || value.description || '').slice(0, 5000), notes: String(value.notes || value.terms || '').slice(0, 3000), validDays: Number.isInteger(value.validityDays) && value.validityDays >= 1 && value.validityDays <= 90 ? value.validityDays : 30, lineItems };
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
  if (estimate.serviceProperty?.address) line(`Service property: ${estimate.serviceProperty.address}`);
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
  const serviceAreas = serviceAreaWorkflow(db, config);
  const scheduling = config.scheduling || require('./scheduling').schedulingHandlers(db);
  const addressValidator = config.serviceAreas || serviceAreaHandlers(db, config);
  const enabled = config.enabled || (() => false),
    emailEnabled = config.emailEnabled || (() => false),
    now = config.now || (() => Date.now()),
    bucket = config.bucketProvider || (() => getStorage().bucket());
  const appUrl = config.appUrl || (() => 'https://route-logistics.com');
  const ref = (name, id) => db.doc(`${name}/${id}`),
    versionRef = (id, version) => ref('rlEstimateVersions', hash(`${id}:${version}`)),
    secretRef = id => ref('rlEstimateApprovalSecrets', id);
  const manages = scope => hasCapability(scope.role, 'estimates.manage');
  const preparesAssigned = scope => hasCapability(scope.role, 'estimates.prepareAssigned');
  const assignedVisit = (scope, job) => !!job && job.companyId === scope.companyId && job.appointmentKind === 'estimate_visit'
    && job.assignedTo === scope.memberId && (!job.assignedToUid || job.assignedToUid === scope.uid)
    && !['cancelled', 'canceled'].includes(job.status);
  async function visitFor(scope, id, tx) {
    const row = tx ? await tx.get(ref('jobs', documentId(id, 'estimate visit'))) : await ref('jobs', documentId(id, 'estimate visit')).get();
    if (!row.exists || (manages(scope) ? row.get('companyId') !== scope.companyId : !assignedVisit(scope, row.data()))) fail('permission-denied', 'This estimate visit is not assigned to your current workspace.');
    if (row.get('appointmentKind') !== 'estimate_visit' || row.get('billable') !== false) fail('failed-precondition', 'Prepare an estimate from a nonbillable estimate visit.');
    return row;
  }
  async function assertEstimateAccess(scope, row, tx) {
    managed(scope, row);
    if (manages(scope)) return;
    if (!preparesAssigned(scope) || row.get('preparedByUid') !== scope.uid || !row.get('sourceVisitId')) fail('permission-denied', 'This estimate is not assigned to you.');
    const visit = await visitFor(scope, row.get('sourceVisitId'), tx);
    if (visit.get('customerId') !== row.get('customerId')) fail('failed-precondition', 'The estimate visit customer changed. Ask management to review the estimate.');
  }
  const taskRef = (id, version, kind = 'review') => ref('rlEstimateTasks', hash(`${id}:${version}:${kind}`));
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
  const staffView = (scope, id, data) => {
    const result = view(id, data);
    if (!manages(scope)) delete result.internalReviewNotes;
    return result;
  };
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
      const scope = await accessScope(db, request),
        data = request.data || {},
        action = data.action;
      if (!manages(scope) && !preparesAssigned(scope)) fail('permission-denied', 'Your role does not allow estimate work.');
      await rateLimit(db, 'estimate-manage', scope.uid, 40);
      if (action === 'list') {
        if (!enabled()) return {
          enabled: false,
          emailEnabled: false,
          estimates: [],
          hasMore: false
        };
        const rows = manages(scope)
          ? await db.collection('estimates').where(scope.companyId ? 'companyId' : 'userId', '==', scope.companyId || scope.uid).orderBy('createdAt', 'desc').limit(101).get()
          : await db.collection('estimates').where('preparedByUid', '==', scope.uid).limit(101).get();
        const templateRows = await db.collection('estimateTemplates').where(scope.companyId ? 'companyId' : 'userId', '==', scope.companyId || scope.uid).limit(101).get();
        const visibleRows = manages(scope) ? rows.docs : (await Promise.all(rows.docs.map(async row => {
          if (!scoped(scope, row.data()) || !row.get('sourceVisitId')) return null;
          const visit = await ref('jobs', row.get('sourceVisitId')).get();
          return visit.exists && assignedVisit(scope, visit.data()) ? row : null;
        }))).filter(Boolean);
        return {
          enabled: true,
          emailEnabled: manages(scope) && emailEnabled(),
          templates: templateRows.docs.filter(row => row.get('isActive') !== false).slice(0, 100).map(estimateTemplateView),
          estimates: visibleRows.slice(0, 100).filter(row => scoped(scope, row.data())).map(row => staffView(scope, row.id, row.data())).sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt)),
          hasMore: rows.size > 100
        };
      }
      enabledCheck();
      if (action === 'visit-context') {
        const visit = await visitFor(scope, data.visitId), existingId = visit.get('estimateId');
        if (existingId) {
          const existing = await ref('estimates', documentId(existingId, 'estimate')).get();
          if (existing.exists) { await assertEstimateAccess(scope, existing); return { estimate: staffView(scope, existing.id, existing.data()), existing: true }; }
        }
        const customer = await ref('customers', documentId(visit.get('customerId'), 'customer')).get();
        if (!customer.exists || !scoped(scope, customer.data())) fail('failed-precondition', 'The estimate visit customer is unavailable.');
        const property = visit.get('serviceProperty') || {};
        return { existing: false, context: {
          sourceVisitId: visit.id, inquiryId: visit.get('inquiryId') || null, customerId: customer.id,
          servicePropertyId: visit.get('servicePropertyId') || null,
          serviceProperty: { address: property.address || visit.get('address') || '' },
          serviceCategory: visit.get('serviceCategory') || '', serviceType: visit.get('serviceType') || '',
          title: `${visit.get('serviceType') || 'Service'} estimate`, customerName: customer.get('name') || visit.get('customerName') || 'Customer'
        } };
      }
      if (action === 'save') {
        const draft = cleanDraft(data.data, { allowUnpriced: !manages(scope) }),
          isNew = !data.estimateId,
          operation = documentId(data.operationId, 'operation');
        if (!/^[A-Za-z0-9_-]{16,80}$/.test(operation)) fail('invalid-argument', 'Use a stable estimate operation ID.');
        const sourceVisitId = data.data.sourceVisitId ? documentId(data.data.sourceVisitId, 'estimate visit') : null;
        if (!manages(scope) && !sourceVisitId) fail('failed-precondition', 'Technician estimates must start from an assigned estimate visit.');
        const visit = sourceVisitId ? await visitFor(scope, sourceVisitId) : null;
        const id = isNew ? sourceVisitId ? hash(`${scope.companyId || scope.uid}:estimate-visit:${sourceVisitId}`) : hash(`${scope.companyId || scope.uid}:${scope.uid}:${operation}`) : documentId(data.estimateId, 'estimate'),
          target = ref('estimates', id),
          operationRef = ref('rlEstimateOperations', hash(`${scope.companyId || scope.uid}:${scope.uid}:${operation}`));
        const fingerprint = hash(JSON.stringify({
          id,
          expectedVersion: data.expectedVersion ?? null,
          draft,
          customerId: data.data.customerId || null,
          prospect: data.data.prospect || null,
          serviceProperty: data.data.serviceProperty || null,
          serviceCategory: data.data.serviceCategory || null,
          serviceAreaExceptionId: data.data.serviceAreaExceptionId || null,
          sourceVisitId,
          inquiryId: data.data.inquiryId || null,
          servicePropertyId: data.data.servicePropertyId || null
        }));
        const [initial, initialOperation] = await Promise.all([target.get(), operationRef.get()]);
        if (initial.exists) await assertEstimateAccess(scope, initial);
        if (initial.exists && !initialOperation.exists) {
          if (initial.get('rlManaged') !== true) fail('failed-precondition', 'Legacy estimates are preserved. Copy their content into a new photo estimate.');
          const locked = manages(scope) ? ['approved', 'converted'] : ['approved', 'converted', 'sent', 'submitted-for-review', 'approved-for-delivery'];
          if (locked.includes(initial.get('status'))) fail('failed-precondition', 'This estimate version is locked. Request changes or create an authorized revision first.');
          if (data.expectedVersion !== initial.get('version')) fail('aborted', 'This estimate changed. Reload before saving your draft.');
        }
        if (!initialOperation.exists && data.data.customerId) {
          const customer = await ref('customers', documentId(data.data.customerId, 'customer')).get();
          if (!customer.exists || !scoped(scope, customer.data()) || customer.get('isActive') === false) fail('permission-denied', 'Choose an active customer from your company.');
        }
        // An assigned estimate visit already carries the company-approved service
        // property. Technicians may quote that visit, but they may not replace or
        // revalidate its property geometry. New standalone estimates still pass
        // through the normal owner/manager service-area workflow.
        const area = initialOperation.exists || sourceVisitId ? null : await serviceAreas.prepare(scope, data.data, initial.data() || {}, 'estimate', !initial.exists);
        return db.runTransaction(async tx => {
          const inquiryId = data.data.inquiryId || initial.get('inquiryId') || visit?.get('inquiryId') || null;
          const [old, previousOperation, secret, currentVisit, currentInquiry] = await Promise.all([tx.get(target), tx.get(operationRef), tx.get(secretRef(id)), sourceVisitId ? tx.get(ref('jobs', sourceVisitId)) : Promise.resolve(null), inquiryId ? tx.get(ref('rlInquiries', inquiryId)) : Promise.resolve(null)]);
          if (previousOperation.exists) {
            if (previousOperation.get('fingerprint') !== fingerprint) fail('already-exists', 'This operation was already used for a different estimate change.');
            await assertEstimateAccess(scope, old, tx);
            return {
              estimate: staffView(scope, id, old.data()),
              existing: true
            };
          }
          if (old.exists) {
            await assertEstimateAccess(scope, old, tx);
            if (old.get('rlManaged') !== true) fail('failed-precondition', 'Legacy estimates are preserved. Copy their content into a new photo estimate.');
            const locked = manages(scope) ? ['approved', 'converted'] : ['approved', 'converted', 'sent', 'submitted-for-review', 'approved-for-delivery'];
            if (locked.includes(old.get('status'))) fail('failed-precondition', 'This estimate version is locked. Request changes or create an authorized revision first.');
            if (data.expectedVersion !== old.get('version')) fail('aborted', 'This estimate changed. Reload before saving your draft.');
          } else if (!isNew) fail('not-found', 'Estimate not found.');
          if (sourceVisitId && (!currentVisit?.exists || (manages(scope) ? currentVisit.get('companyId') !== scope.companyId : !assignedVisit(scope, currentVisit.data())))) fail('permission-denied', 'The estimate visit assignment changed. Reopen it before saving.');
          if (currentVisit?.exists && currentVisit.get('customerId') !== data.data.customerId) fail('failed-precondition', 'Use the customer linked to this estimate visit. Ask management to correct the visit before preparing its estimate.');
          if (old.exists && old.get('sourceVisitId') && sourceVisitId !== old.get('sourceVisitId')) fail('failed-precondition', 'An estimate cannot be moved to a different visit. Open the correct visit instead.');
          if (currentVisit?.exists && (currentVisit.get('inquiryId') || null) !== (inquiryId || null)) fail('failed-precondition', 'The estimate must remain linked to its visit inquiry. Reopen the estimate visit.');
          if (currentVisit?.exists && (currentVisit.get('servicePropertyId') || null) !== (data.data.servicePropertyId || old.get('servicePropertyId') || null)) fail('failed-precondition', 'The estimate must use the service property linked to its visit.');
          if (inquiryId && (!currentInquiry?.exists || !scoped(scope, currentInquiry.data()) || currentInquiry.get('customerId') !== data.data.customerId
            || (currentInquiry.get('servicePropertyId') || null) !== (data.data.servicePropertyId || old.get('servicePropertyId') || null))) fail('failed-precondition', 'The linked inquiry, customer and service property must remain together.');
          if (area && initial.exists && !old.updateTime.isEqual(initial.updateTime)) fail('aborted', 'This estimate changed while its service property was checked. Reload before saving.');
          const contact = await recipient(scope, data.data, tx);
          await photosFor(scope, id, draft.photoIds, tx);
          await serviceAreas.assertCurrent(tx, area);
          const version = (old.get('version') || 0) + 1,
            created = old.get('createdAt') || new Date(now()).toISOString();
          const current = {
            ...draft,
            ...(manages(scope) ? {} : { internalReviewNotes: old.get('internalReviewNotes') || '' }),
            ...contact,
            ...storedGeometry(old.data()),
            ...storedGeometry(currentVisit?.data() || {}),
            ...storedGeometry(area?.patch),
            userId: old.get('userId') || scope.uid,
            ...(scope.companyId ? {
              companyId: scope.companyId
            } : {}),
            rlManaged: true,
            sourceVisitId: sourceVisitId || old.get('sourceVisitId') || null,
            inquiryId: inquiryId || old.get('inquiryId') || null,
            servicePropertyId: data.data.servicePropertyId || old.get('servicePropertyId') || visit?.get('servicePropertyId') || null,
            preparedByUid: old.get('preparedByUid') || scope.uid,
            preparedByMemberId: old.get('preparedByMemberId') || scope.memberId || null,
            preparedByName: old.get('preparedByName') || scope.name || scope.email || '',
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
          if (old.exists && old.get('status') === 'submitted-for-review') tx.set(taskRef(id, old.get('version')), {
            status: 'superseded',
            supersededByVersion: version,
            supersededByUid: scope.uid,
            updatedAt: new Date(now())
          }, { merge: true });
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
          if (current.sourceVisitId) tx.update(ref('jobs', current.sourceVisitId), { estimateId: id, estimateVersion: version, estimateOutcome: 'quote_prepared', updatedAt: new Date(now()).toISOString() });
          if (currentInquiry?.exists && scoped(scope, currentInquiry.data()) && !['closed', 'converted'].includes(currentInquiry.get('status'))) tx.update(currentInquiry.ref, { estimateId: id, estimateVersion: version, status: 'estimate_drafted', revision: (currentInquiry.get('revision') || 0) + 1, updatedAt: new Date(now()) });
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
            estimate: staffView(scope, id, current)
          };
        });
      }
      const id = documentId(data.estimateId, 'estimate'),
        target = ref('estimates', id),
        row = await target.get();
      await assertEstimateAccess(scope, row);
      const estimate = row.data();
      if (action === 'get') {
        const versions = await db.collection('rlEstimateVersions').where('estimateId', '==', id).limit(100).get(),
          photos = estimate.rlManaged ? await photosFor(scope, id, estimate.photoIds || []) : [],
          mail = estimate.rlManaged ? await ref('rlMail', `estimate_${id}_v${estimate.version}`).get() : null,
          canManage = manages(scope);
        return {
          estimate: staffView(scope, id, estimate),
          emailEnabled: canManage && emailEnabled(),
          permissions: {
            canEdit: canManage ? !['approved', 'converted'].includes(estimate.status) : ['draft', 'changes-requested'].includes(estimate.status),
            canSubmit: !manages(scope) && ['draft', 'changes-requested'].includes(estimate.status),
            canReview: canManage && ['draft', 'submitted-for-review'].includes(estimate.status),
            canDeliver: canManage && estimate.status === 'approved-for-delivery' && estimate.approvedForDeliveryVersion === estimate.version
          },
          delivery: mail?.exists ? {status:mail.get('status'),attempts:mail.get('attempts') || 0,failureCode:mail.get('failureCode') || null,sentAt:dateString(mail.get('sentAt')),recipient:normalizeEmail(mail.get('to'))} : null,
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
      if (action === 'submit-review') {
        if (manages(scope) || !['draft', 'changes-requested'].includes(estimate.status)) fail('failed-precondition', 'Only an assigned technician draft can be submitted for review.');
        if (data.expectedVersion !== estimate.version) fail('aborted', 'This estimate changed. Reload before submitting it.');
        return db.runTransaction(async tx => {
          const current = await tx.get(target); await assertEstimateAccess(scope, current, tx);
          if (current.get('version') !== data.expectedVersion || !['draft', 'changes-requested'].includes(current.get('status'))) fail('aborted', 'This estimate changed. Reload before submitting it.');
          const at = new Date(now());
          tx.update(target, { status: 'submitted-for-review', submittedVersion: current.get('version'), submittedAt: at.toISOString(), updatedAt: at.toISOString() });
          tx.set(taskRef(id, current.get('version')), { companyId: scope.companyId, estimateId: id, version: current.get('version'), type: 'estimate-review', status: 'open', preparedByUid: scope.uid, createdAt: at, updatedAt: at });
          tx.create(ref('rlAudit', `estimate_${id}_v${current.get('version')}_submitted`), { action: 'estimate.review-submitted', companyId: scope.companyId, actorId: scope.uid, estimateId: id, version: current.get('version'), createdAt: at });
          return { submitted: true, version: current.get('version') };
        });
      }
      if (action === 'review') {
        if (!manages(scope)) fail('permission-denied', 'Management review permission is required.');
        if (!['approve', 'request-changes'].includes(data.decision) || typeof data.comments !== 'string' || data.comments.length > 3000) fail('invalid-argument', 'Choose approve or request changes and enter valid review comments.');
        if (data.decision === 'request-changes' && !data.comments.trim()) fail('invalid-argument', 'Explain the requested changes.');
        if (data.expectedVersion !== estimate.version) fail('aborted', 'This estimate changed. Reload before reviewing it.');
        return db.runTransaction(async tx => {
          const [current, task] = await Promise.all([tx.get(target), tx.get(taskRef(id, data.expectedVersion))]); managed(scope, current);
          if (current.get('version') !== data.expectedVersion || !['draft', 'submitted-for-review'].includes(current.get('status')) || current.get('status') === 'submitted-for-review' && current.get('submittedVersion') !== current.get('version') || data.decision === 'request-changes' && current.get('status') !== 'submitted-for-review') fail('failed-precondition', 'Review the current immutable version. Changes can be requested only from a technician submission.');
          const at = new Date(now()), approved = data.decision === 'approve';
          if (approved) assertDeliveryReady(current.data());
          tx.update(target, { status: approved ? 'approved-for-delivery' : 'changes-requested', reviewVersion: current.get('version'), approvedForDeliveryVersion: approved ? current.get('version') : null, reviewComments: data.comments.trim(), reviewedByUid: scope.uid, reviewedAt: at.toISOString(), updatedAt: at.toISOString() });
          tx.set(taskRef(id, current.get('version')), { ...(task.exists ? task.data() : {}), companyId: scope.companyId, estimateId: id, version: current.get('version'), type: 'estimate-review', status: approved ? 'approved' : 'changes-requested', comments: data.comments.trim(), reviewedByUid: scope.uid, updatedAt: at }, { merge: true });
          tx.create(ref('rlAudit', `estimate_${id}_v${current.get('version')}_${approved ? 'delivery-approved' : 'changes-requested'}`), { action: approved ? 'estimate.delivery-approved' : 'estimate.changes-requested', companyId: scope.companyId, actorId: scope.uid, estimateId: id, version: current.get('version'), comments: data.comments.trim(), createdAt: at });
          return { status: approved ? 'approved-for-delivery' : 'changes-requested', version: current.get('version') };
        });
      }
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
      if (action === 'pdf') {
        if (!manages(scope)) fail('permission-denied', 'Management permission is required to generate the formal customer estimate PDF.');
        return {
          dataUri: `data:application/pdf;base64,${(await buildPdf(scope, id, estimate)).toString('base64')}`,
          filename: `${estimate.estimateNumber}-v${estimate.version}.pdf`
        };
      }
      if (action === 'deliver') {
        if (!manages(scope)) fail('permission-denied', 'Management approval is required before customer delivery.');
        if (!emailEnabled()) fail('failed-precondition', 'Estimate email delivery is disabled. You can download the PDF for review.');
        if (!['approved-for-delivery', 'sent'].includes(estimate.status) || estimate.status !== 'sent' && estimate.approvedForDeliveryVersion !== estimate.version) fail('failed-precondition', 'Approve this exact estimate version for delivery before sending it.');
        const recipientEmail = normalizeEmail(data.recipientEmail || estimate.recipient.email);
        if (!validEmail(recipientEmail)) fail('invalid-argument', 'Enter a valid estimate recipient email before sending.');
        const mailId = `estimate_${id}_v${estimate.version}`,
          mailRef = ref('rlMail', mailId),
          previous = await mailRef.get();
        if (previous.exists) {
          if (normalizeEmail(previous.get('to')) !== recipientEmail) fail('failed-precondition', 'This estimate version was already queued for a different recipient. Save a new version before sending it elsewhere.');
          return { queued: true, mailId, existing: true };
        }
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
          await assertEstimateAccess(scope, current, tx);
          if (current.get('version') !== estimate.version || !['approved-for-delivery', 'sent'].includes(current.get('status')) || current.get('status') !== 'sent' && current.get('approvedForDeliveryVersion') !== current.get('version')) fail('aborted', 'The quote or its delivery authorization changed before email was queued.');
          if (customer && (!scoped(scope, customer.data()) || customer.get('isActive') === false || customer.get('deletedAt'))) fail('failed-precondition', 'The linked customer is no longer available for estimate delivery.');
          if (old.exists) {
            if (normalizeEmail(old.get('to')) !== recipientEmail) fail('failed-precondition', 'This estimate version was already queued for a different recipient. Save a new version before sending it elsewhere.');
            return { queued: true, mailId, existing: true };
          }
          const expiry = new Date(timestamp(estimate.validUntil));
          tx.set(secretRef(id), {
            companyId: scope.companyId || null,
            userId: estimate.userId,
            estimateId: id,
            version: estimate.version,
            tokenHash,
            status: 'open',
            expiresAt: expiry,
            recipientEmail
          });
          tx.create(mailRef, {
            to: recipientEmail,
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
            estimateRecipient: recipientEmail,
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
            authorizedRole: scope.role,
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
        const [initialJob, initialVersion, initialApproval] = await Promise.all([jobRef.get(), versionRef(id, estimate.version).get(), secretRef(id).get()]);
        let area = null, newCustomerAddress = null;
        if (!initialJob.exists) {
          if (estimate.status !== 'approved' || !initialVersion.exists || initialApproval.get('status') !== 'approved' || initialApproval.get('version') !== estimate.version) fail('failed-precondition', 'This exact estimate version must be approved by its recipient before conversion.');
          const approvedSource = initialVersion.data(), requestedAddress = propertyAddress(schedule), approvedAddress = propertyAddress(approvedSource);
          if (approvedAddress && requestedAddress && requestedAddress.trim().toLowerCase() !== approvedAddress.trim().toLowerCase()) fail('failed-precondition', 'The approved service property cannot be changed during conversion. Save and approve a revised estimate.');
          if (approvedSource.serviceCategory && schedule.serviceCategory && approvedSource.serviceCategory !== schedule.serviceCategory) fail('failed-precondition', 'The approved service category cannot be changed during conversion. Save and approve a revised estimate.');
          const destinationAddress = approvedSource.recipient?.address || '';
          area = await serviceAreas.prepare(scope, {
            serviceProperty: approvedSource.serviceProperty || schedule.serviceProperty || (destinationAddress ? { address: destinationAddress } : undefined),
            serviceCategory: approvedSource.serviceCategory || schedule.serviceCategory || '',
            serviceAreaExceptionId: data.serviceAreaExceptionId || schedule.serviceAreaExceptionId
          }, {}, 'scheduling', true);
          // Copying an approved prospect into a new customer is still a new
          // physical address write; never alter the immutable approved text.
          if (!approvedSource.customerId && !data.customerId && data.createCustomer === true && destinationAddress) newCustomerAddress = validatedCustomerAddress(await addressValidator.validateAddress(scope, destinationAddress));
        }
        return db.runTransaction(async tx => {
          const inquiryId = estimate.inquiryId || null;
          const [current, approval, snapshot, existing, inquiry, followUpTask] = await Promise.all([tx.get(target), tx.get(secretRef(id)), tx.get(versionRef(id, estimate.version)), tx.get(jobRef), inquiryId ? tx.get(ref('rlInquiries', inquiryId)) : Promise.resolve(null), tx.get(taskRef(id, estimate.version, 'customer-decision'))]);
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
            newCustomer = {userId:current.get('userId'),...(scope.companyId ? {companyId:scope.companyId} : {}),name:source.recipient.name,email:source.recipient.email,emailNormalized:source.recipient.email,phone:source.recipient.phone,address:source.recipient.address,city:'',state:'',zipCode:'',...(newCustomerAddress || {}),isActive:true,lifecycle:'active',totalSpent:0,totalJobs:0,lastServiceDate:null,source:'rl-approved-estimate',createdFromEstimateId:id,createdAt:new Date(now()).toISOString(),updatedAt:new Date(now()).toISOString()};
            customer = {id:newId,ref:destination,get:key=>newCustomer[key]};
          } else fail('failed-precondition', 'Select a matching company customer or explicitly create one from this approved prospect.');
          const billingSnapshot = approvedBillingSnapshot(source, { estimateId: id, estimateVersion: source.version, customerId: customer.id });
          const assignedTo = schedule.assignedTo || null;
          await serviceAreas.assertCurrent(tx, area);
          const job = {
            userId: current.get('userId'),
            ...(scope.companyId ? {
              companyId: scope.companyId
            } : {}),
            customerId: customer.id,
            customerName: customer.get('name') || source.recipient.name,
            customerPhone: customer.get('phone') || '',
            address: source.serviceProperty?.address || source.recipient.address,
            ...storedGeometry(source),
            ...(area?.patch || {}),
            serviceType: source.serviceType,
            title: source.title,
            scopeOfWork: source.scopeOfWork,
            notes: String(schedule.notes || source.notes || '').slice(0, 3000),
            date: schedule.date,
            time: schedule.time,
            estimatedDuration: Number(schedule.estimatedDuration ?? 1),
            assignedTo,
            status: 'scheduled',
            estimatedCost: source.total,
            total: source.total,
            totalCost: billingSnapshot.total,
            billingSnapshot,
            estimateId: id,
            estimateVersion: source.version,
            inquiryId: source.inquiryId || null,
            createdAt: new Date(now()).toISOString(),
            updatedAt: new Date(now()).toISOString()
          };
          const reserved = await scheduling.prepare(tx, scope, job, { jobId: jobRef.id });
          Object.assign(job, { assignedTo: reserved.assignedTo || null, assignedToName: reserved.assignedToName || null, assignedToUid: reserved.assignedToUid || null });
          scheduling.commit(tx, reserved);
          if (newCustomer) tx.create(customer.ref, newCustomer);
          else if (lifecycleFor(customer.data()) === 'prospect') {
            tx.update(customer.ref, { lifecycle: 'active', updatedAt: new Date(now()).toISOString() });
            tx.create(ref('rlAudit', `estimate_${id}_customer_active`), { action: 'customer.lifecycle', companyId: scope.companyId || null, customerId: customer.id, actorId: scope.uid, fromLifecycle: 'prospect', toLifecycle: 'active', reason: 'approved-estimate-conversion', estimateId: id, estimateVersion: source.version, createdAt: new Date(now()) });
          }
          tx.create(jobRef, job);
          tx.update(target, {
            status: 'converted',
            convertedJobId: jobId,
            convertedCustomerId: customer.id,
            convertedAt: new Date(now()).toISOString()
          });
          if (inquiry?.exists && scoped(scope, inquiry.data()) && !['closed', 'converted'].includes(inquiry.get('status'))) tx.update(inquiry.ref, { status: 'converted', convertedJobId: jobId, estimateId: id, estimateVersion: source.version, revision: (inquiry.get('revision') || 0) + 1, updatedAt: new Date(now()) });
          if (followUpTask.exists && scoped(scope, followUpTask.data())) tx.update(followUpTask.ref, { status: 'completed', convertedJobId: jobId, updatedAt: new Date(now()) });
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
        if (!row.exists || row.get('rlManaged') !== true || !secret.exists || !['open', 'approved', 'declined', 'revision-requested'].includes(secret.get('status')) || secret.get('version') !== row.get('version') || (secret.get('companyId') || null) !== (row.get('companyId') || null) || secret.get('userId') !== row.get('userId') || !Number.isFinite(timestamp(secret.get('expiresAt'))) || timestamp(secret.get('expiresAt')) <= now() || typeof secret.get('tokenHash') !== 'string' || secret.get('tokenHash').length !== tokenHash.length || !timingSafeEqual(Buffer.from(secret.get('tokenHash')), Buffer.from(tokenHash))) fail('permission-denied', 'This estimate link is invalid, expired or superseded.');
      };
      const validateRecipient = async (row, secret, tx) => {
        if (!validEmail(secret.get('recipientEmail'))) fail('permission-denied','This estimate recipient is invalid. Ask the service provider for a new review link.');
        if (!row.get('customerId')) return;
        const target = ref('customers', documentId(row.get('customerId'), 'customer'));
        const customer = tx ? await tx.get(target) : await target.get();
        if (!customer.exists || !scoped({companyId:row.get('companyId') || null,uid:row.get('userId')},customer.data()) || customer.get('isActive') === false || customer.get('deletedAt')) fail('permission-denied','This estimate recipient changed. Ask the service provider for a new review link.');
      };
      if (['get', 'pdf'].includes(data.action)) {
        const [row, secret] = await Promise.all([target.get(), secretRef(id).get()]);
        validate(row, secret);
        await validateRecipient(row, secret);
        const snapshot = await versionRef(id, row.get('version')).get();
        if (!snapshot.exists || !scoped({companyId:row.get('companyId') || null,uid:row.get('userId')},snapshot.data()) || snapshot.get('totalCents') !== row.get('totalCents')) fail('not-found', 'Estimate version unavailable.');
        const value = snapshot.data(),
          scope = {
            companyId: value.companyId || null,
            uid: value.userId
          };
        if (data.action === 'pdf') return { dataUri: `data:application/pdf;base64,${(await buildPdf(scope, id, value)).toString('base64')}`, filename: `${value.estimateNumber}-v${value.version}.pdf` };
        const
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
            serviceProperty: value.serviceProperty?.address ? { address: value.serviceProperty.address } : null,
            serviceCategory: value.serviceCategory || '',
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
      if (!['approve', 'decline', 'request-revision'].includes(data.action)) fail('invalid-argument', 'Choose approve, decline or request revision.');
      const approving = data.action === 'approve', decisionStatus = approving ? 'approved' : data.action === 'decline' ? 'declined' : 'revision-requested',
        reason = typeof data.reason === 'string' ? data.reason.trim() : '';
      if (approving && (data.acceptedTerms !== true || typeof data.signerName !== 'string' || data.signerName.trim().length < 2 || data.signerName.length > 100)) fail('invalid-argument', 'Enter your name and confirm approval of this estimate version.');
      if (!approving && (reason.length > 2000 || data.action === 'request-revision' && !reason)) fail('invalid-argument', data.action === 'request-revision' ? 'Explain the requested revision.' : 'Enter a valid optional decline reason.');
      return db.runTransaction(async tx => {
        const initial = await tx.get(target), inquiryId = initial.get('inquiryId') || null;
        const [row, secret, inquiry, task] = await Promise.all([Promise.resolve(initial), tx.get(secretRef(id)), inquiryId ? tx.get(ref('rlInquiries', inquiryId)) : Promise.resolve(null), tx.get(taskRef(id, initial.get('version'), 'customer-decision'))]);
        validate(row, secret);
        await validateRecipient(row,secret,tx);
        const version = await tx.get(versionRef(id,row.get('version')));
        if (!version.exists || !scoped({companyId:row.get('companyId') || null,uid:row.get('userId')},version.data()) || version.get('totalCents') !== row.get('totalCents')) fail('failed-precondition','This quote version changed. Ask the provider for a new link.');
        if (secret.get('status') === decisionStatus) return {
          approved: approving,
          decision: decisionStatus,
          existing: true,
          version: row.get('version')
        };
        if (secret.get('status') !== 'open') fail('failed-precondition', 'A decision was already recorded for this estimate version. Contact the provider to request another link.');
        if (row.get('status') !== 'sent') fail('failed-precondition', 'This estimate is not currently open for approval.');
        const at = new Date(now());
        tx.update(secretRef(id), {
          status: decisionStatus,
          decidedAt: at,
          ...(approving ? { approvedAt: at, signerName: data.signerName.trim() } : { reason })
        });
        tx.update(target, {
          status: decisionStatus,
          customerDecision: decisionStatus,
          customerDecisionVersion: row.get('version'),
          customerDecisionAt: at.toISOString(),
          schedulingNeeded: approving,
          ...(approving ? { approvedAt: at.toISOString(), approvalName: data.signerName.trim() } : { customerDecisionReason: reason })
        });
        if (inquiry?.exists && (inquiry.get('companyId') || null) === (row.get('companyId') || null) && !['closed', 'converted'].includes(inquiry.get('status'))) tx.update(inquiry.ref, { status: approving ? 'estimate_approved_scheduling_needed' : data.action === 'decline' ? 'estimate_declined' : 'estimate_revision_requested', estimateId: id, estimateVersion: row.get('version'), revision: (inquiry.get('revision') || 0) + 1, updatedAt: at });
        tx.set(taskRef(id, row.get('version'), 'customer-decision'), { ...(task.exists ? task.data() : {}), companyId: row.get('companyId') || null, estimateId: id, version: row.get('version'), type: approving ? 'estimate-scheduling-needed' : 'estimate-customer-attention', status: 'open', decision: decisionStatus, reason, createdAt: task.exists && task.get('createdAt') || at, updatedAt: at }, { merge: true });
        tx.create(ref('rlAudit', `estimate_${id}_v${row.get('version')}_${decisionStatus}`), {
          action: approving ? 'estimate.customer-approval' : data.action === 'decline' ? 'estimate.customer-decline' : 'estimate.customer-revision-request',
          companyId: row.get('companyId') || null,
          estimateId: id,
          version: row.get('version'),
          ...(approving ? { signerName: data.signerName.trim() } : { reason }),
          totalCents: row.get('totalCents'),
          createdAt: at
        });
        return {
          approved: approving,
          decision: decisionStatus,
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
