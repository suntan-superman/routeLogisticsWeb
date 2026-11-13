const { HttpsError } = require('firebase-functions/v2/https');
const { createHash } = require('node:crypto');
const { FieldPath } = require('firebase-admin/firestore');
const { documentId, rateLimit } = require('./security');
const { accessScope, requireCapability, hasCapability, checkJob } = require('./access');
const { version } = require('./offline');

const JOB_FIELDS = ['userId', 'companyId', 'customerId', 'customerName', 'customerPhone', 'serviceType', 'title', 'address', 'city', 'state', 'zipCode', 'serviceArea', 'date', 'time', 'windowStart', 'windowEnd', 'estimatedDuration', 'duration', 'priority', 'status', 'assignedTo', 'workNotes', 'actualWorkDone', 'actualHours', 'completionNotes', 'completedAt', 'createdAt', 'updatedAt'];
const PRICING_FIELDS = ['totalCost', 'estimatedCost', 'laborRate', 'laborHours', 'materialCost', 'materials', 'scopeOfWork', 'notes', 'description', 'servicePlanId'];
const CUSTOMER_FIELDS = ['userId', 'companyId', 'name', 'firstName', 'lastName', 'email', 'emailNormalized', 'phone', 'phoneNumber', 'address', 'city', 'state', 'zipCode', 'isActive', 'status', 'createdAt', 'updatedAt', 'lastServiceDate', 'totalJobs', 'emailConsent', 'notes', 'serviceInstructions'];
const APPLICATION_FIELDS = ['product', 'epaRegNo', 'activeIngredient', 'amount', 'unit', 'targetPest', 'areaTreated', 'method', 'applicatorLicense', 'notes'];
const primitive = value => value == null || ['string', 'number', 'boolean'].includes(typeof value);
function pick(data, fields) {
  return Object.fromEntries(fields.filter(key => data[key] !== undefined && (primitive(data[key]) || typeof data[key]?.toDate === 'function' || data[key] instanceof Date)).map(key => [key, data[key]?.toDate ? data[key].toDate().toISOString() : data[key] instanceof Date ? data[key].toISOString() : data[key]]));
}
function coordinates(data) {
  const lat = data.latitude ?? data.location?.latitude ?? data.location?.lat;
  const lng = data.longitude ?? data.location?.longitude ?? data.location?.lng;
  return typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { latitude: lat, longitude: lng } : {};
}
function projectJob(id, data, role) {
  if (hasCapability(role, 'reports.financial')) return { ...data, id, updatedAt: version(data.updatedAt) };
  return { id, ...pick(data, JOB_FIELDS), ...coordinates(data), ...(hasCapability(role, 'jobs.pricing') ? pick(data, PRICING_FIELDS) : { notes: typeof data.workNotes === 'string' ? data.workNotes : '' }) };
}
function projectCustomer(id, data, role) {
  if (hasCapability(role, 'reports.financial')) return { ...data, id };
  const fields = role === 'technician' ? ['name', 'firstName', 'lastName', 'phone', 'phoneNumber', 'address', 'city', 'state', 'zipCode', 'serviceInstructions'] : CUSTOMER_FIELDS;
  return { id, ...pick(data, fields), ...(data.address && typeof data.address === 'object' ? { address: pick(data.address, ['street', 'line1', 'city', 'state', 'zipCode']) } : {}), ...coordinates(data) };
}
function projectCompany(id, data, role) {
  if (role === 'owner' || role === 'admin') return { ...data, id };
  return { id, ...pick(data, ['name', 'businessName', 'phone', 'phoneNumber', 'address', 'city', 'state', 'zipCode', 'description', 'logo', 'ownerId', 'timeZone']),
    ...(data.address && typeof data.address === 'object' ? { address: pick(data.address, ['street', 'city', 'state', 'zipCode']) } : {}),
    serviceCategories: (Array.isArray(data.serviceCategories) ? data.serviceCategories : []).filter(value => typeof value === 'string'),
    services: (Array.isArray(data.services) ? data.services : []).map(service => typeof service === 'string' ? service : role === 'technician' ? service?.name : pick(service || {}, ['name', 'description', 'price', 'duration'])).filter(Boolean) };
}
const scoped = (db, collection, scope) => db.collection(collection).where(scope.companyId ? 'companyId' : 'userId', '==', scope.companyId || scope.uid);
async function jobFor(db, scope, id) {
  const snap = await db.doc(`jobs/${documentId(id, 'job')}`).get();
  checkJob(scope, snap.data());
  return snap;
}
function withCustomerLocation(data, customer) {
  if (!customer) return data;
  const address = typeof customer.address === 'string' ? customer.address : customer.address?.street || customer.address?.line1;
  return { ...data, customerName: data.customerName || customer.name || [customer.firstName, customer.lastName].filter(Boolean).join(' '), customerPhone: data.customerPhone || customer.phone || customer.phoneNumber || '',
    ...(!data.address ? { address: address || '', city: customer.city || customer.address?.city || '', state: customer.state || customer.address?.state || '', zipCode: customer.zipCode || customer.address?.zipCode || '', ...coordinates(customer) } : {}) };
}
function workDataHandlers(db) {
  return {
    read: async request => {
      const scope = await accessScope(db, request), data = request.data || {}, resource = data.resource;
      await rateLimit(db, 'work-read', scope.uid, 120);
      if (resource === 'company') return { company: scope.company ? projectCompany(scope.company.id, scope.company.data(), scope.role) : null };
      if (resource === 'customerStats') {
        if (!hasCapability(scope.role, 'customers.manage')) throw new HttpsError('permission-denied', 'Customer management access is required.');
        const rows = await scoped(db, 'customers', scope).select('isActive', 'status', 'deletedAt').get();
        const active = rows.docs.filter(row => row.get('isActive') !== false && !row.get('deletedAt') && !['inactive', 'deleted', 'archived'].includes(row.get('status'))).length;
        return { stats: { totalCustomers: rows.size, activeCustomers: active, inactiveCustomers: rows.size - active } };
      }
      if (!['jobs', 'customers', 'photos', 'serviceLogs'].includes(resource)) throw new HttpsError('invalid-argument', 'Unknown workspace resource.');
      if (resource === 'jobs') {
        if (data.id) {
          const job = await jobFor(db, scope, data.id);
          const customer = job.get('customerId') ? await db.doc(`customers/${documentId(job.get('customerId'))}`).get() : null;
          const sameCustomer = customer?.exists && (scope.companyId ? customer.get('companyId') === scope.companyId : !customer.get('companyId') && customer.get('userId') === scope.uid);
          return { job: projectJob(job.id, withCustomerLocation(job.data(), sameCustomer ? customer.data() : null), scope.role), customer: sameCustomer ? projectCustomer(customer.id, customer.data(), scope.role) : null };
        }
        let query = scoped(db, resource, scope);
        if (scope.role === 'technician') query = query.where('assignedTo', '==', scope.memberId);
        if (data.date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new HttpsError('invalid-argument', 'Choose a service date.'); query = query.where('date', '==', data.date); }
        const range = !data.date && (data.startDate || data.endDate);
        if (range) {
          if (![data.startDate, data.endDate].every(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))) throw new HttpsError('invalid-argument', 'Choose a valid date range.');
          query = query.where('date', '>=', data.startDate).where('date', '<=', data.endDate).orderBy('date');
        }
        if (data.status) query = query.where('status', '==', String(data.status));
        if (data.customerId) query = query.where('customerId', '==', documentId(data.customerId));
        const maximum = Math.max(1, Math.min(Number(data.limit) || 100, 500));
        query = query.orderBy(FieldPath.documentId());
        if (data.after) {
          if (range) { const cursor = await jobFor(db, scope, data.after); query = query.startAfter(cursor.get('date'), cursor.id); }
          else query = query.startAfter(documentId(data.after));
        }
        const rows = await query.limit(maximum + 1).get();
        const page = rows.docs.slice(0, maximum), customerIds = [...new Set(page.filter(row => !row.get('address') && typeof row.get('customerId') === 'string').map(row => row.get('customerId')))];
        const customers = new Map();
        for (let offset = 0; offset < customerIds.length; offset += 100) {
          const records = await db.getAll(...customerIds.slice(offset, offset + 100).map(id => db.doc(`customers/${documentId(id)}`)));
          records.filter(row => row.exists && (scope.companyId ? row.get('companyId') === scope.companyId : !row.get('companyId') && row.get('userId') === scope.uid)).forEach(row => customers.set(row.id, row.data()));
        }
        return { jobs: page.map(row => projectJob(row.id, withCustomerLocation(row.data(), customers.get(row.get('customerId'))), scope.role)), hasMore: rows.size > maximum, lastDoc: page.at(-1)?.id || null };
      }
      if (resource === 'customers') {
        if (scope.role === 'technician') {
          const job = await jobFor(db, scope, data.jobId);
          if (!job.get('customerId') || (data.id && data.id !== job.get('customerId'))) throw new HttpsError('permission-denied', 'This customer is not attached to the assigned job.');
          data.id = job.get('customerId');
        }
        if (data.id) {
          const row = await db.doc(`customers/${documentId(data.id)}`).get();
          if (!row.exists || (scope.companyId ? row.get('companyId') !== scope.companyId : row.get('companyId') || row.get('userId') !== scope.uid)) throw new HttpsError('permission-denied', 'Customer unavailable.');
          return { customer: projectCustomer(row.id, row.data(), scope.role) };
        }
        const maximum = Math.max(1, Math.min(Number(data.limit) || 100, 500));
        let query = scoped(db, resource, scope).orderBy(FieldPath.documentId());
        if (data.after) query = query.startAfter(documentId(data.after));
        const rows = await query.limit(maximum + 1).get();
        const count = (await scoped(db, resource, scope).count().get()).data().count;
        return { customers: rows.docs.slice(0, maximum).map(row => projectCustomer(row.id, row.data(), scope.role)), count, hasMore: rows.size > maximum, lastDoc: rows.docs.slice(0, maximum).at(-1)?.id || null };
      }
      await jobFor(db, scope, data.jobId);
      const rows = await scoped(db, resource, scope).where('jobId', '==', data.jobId).limit(100).get();
      if (resource === 'photos') return { photos: rows.docs.map(row => ({ id: row.id, ...pick(row.data(), ['jobId', 'caption', 'createdAt']) })) };
      return { logs: rows.docs.map(row => ({ id: row.id, ...pick(row.data(), [...APPLICATION_FIELDS, 'jobId', 'applicationDate', 'applicatorName', 'siteAddress', 'createdAt']) })) };
    },
    manageJob: async request => {
      const data = request.data || {}, action = data.action;
      const scope = await requireCapability(db, request, action === 'assign' ? 'jobs.assign' : 'jobs.schedule');
      await rateLimit(db, 'job-manage', scope.uid, 120);
      if (!['create', 'update', 'delete', 'assign'].includes(action)) throw new HttpsError('invalid-argument', 'Invalid job operation.');
      const ref = action === 'create' ? db.collection('jobs').doc() : db.doc(`jobs/${documentId(data.id)}`);
      const input = data.job || {};
      const permitted = [...JOB_FIELDS, ...PRICING_FIELDS, 'latitude', 'longitude', 'workNotes', 'cancelledAt', 'cancellationReason'];
      const patch = action === 'assign' ? { assignedTo: data.memberId || null } : pick(input, permitted.filter(key => !['userId', 'companyId', 'createdAt', 'updatedAt'].includes(key)));
      if (patch.status && !['scheduled', 'en-route', 'in-progress', 'completed', 'cancelled'].includes(patch.status)) throw new HttpsError('invalid-argument', 'Invalid job status.');
      return db.runTransaction(async tx => {
        const existing = await tx.get(ref);
        if (action !== 'create') {
          checkJob(scope, existing.data());
          if (data.expectedVersion !== undefined && version(existing.get('updatedAt')) !== version(data.expectedVersion)) throw new HttpsError('aborted', 'This job changed. Refresh it before saving.');
        }
        if (patch.customerId) {
          const customer = await tx.get(db.doc(`customers/${documentId(patch.customerId)}`));
          if (!customer.exists || (scope.companyId ? customer.get('companyId') !== scope.companyId : customer.get('companyId') || customer.get('userId') !== scope.uid)) throw new HttpsError('permission-denied', 'Choose a customer in this workspace.');
        }
        if (patch.assignedTo && scope.companyId && patch.assignedTo !== scope.company.get('ownerId')) {
          const member = await tx.get(db.doc(`teamMembers/${documentId(patch.assignedTo)}`));
          if (member.get('companyId') !== scope.companyId || member.get('status') !== 'active' || !member.get('uid')) throw new HttpsError('permission-denied', 'Choose an active company member.');
        }
        const updatedAt = new Date(Math.max(Date.now(), Date.parse(version(existing.get('updatedAt'))) + 1 || 0)).toISOString();
        const before = existing.data() || {};
        if (action === 'delete') tx.delete(ref);
        else if (action === 'create') tx.create(ref, { ...patch, userId: scope.uid, ...(scope.companyId ? { companyId: scope.companyId } : {}), status: patch.status || 'scheduled', createdAt: updatedAt, updatedAt });
        else {
          const changes = Object.keys(patch).filter(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(patch[key])).map(key => ({ field: key, label: key, from: before[key] ?? '', to: patch[key] ?? '' }));
          const revision = { at: updatedAt, by: request.auth.token.name || request.auth.token.email || scope.uid, reason: String(input.revisions?.at(-1)?.reason || '').slice(0, 1000), changes, action };
          tx.update(ref, { ...patch, updatedAt, lastModifiedAt: updatedAt, isModified: true, originalDetails: before.originalDetails || pick(before, [...JOB_FIELDS, ...PRICING_FIELDS]), revisions: [...(Array.isArray(before.revisions) ? before.revisions : []), revision] });
        }
        const audit = db.collection('rlAudit').doc();
        tx.create(audit, { action: `job.${action}`, companyId: scope.companyId, actorId: scope.uid, jobId: ref.id, fromMemberId: before.assignedTo || null, toMemberId: patch.assignedTo ?? before.assignedTo ?? null, createdAt: updatedAt });
        return { id: ref.id, updatedAt };
      });
    },
    application: async request => {
      const scope = await requireCapability(db, request, 'jobs.work'), data = request.data || {};
      await rateLimit(db, 'application-write', scope.uid, 60);
      const jobRef = db.doc(`jobs/${documentId(data.jobId)}`), operationId = documentId(data.operationId);
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(operationId)) throw new HttpsError('invalid-argument', 'Invalid operation ID.');
      const fields = pick(data.record || {}, APPLICATION_FIELDS);
      if (!fields.product || !fields.targetPest || !Number.isFinite(Number(fields.amount)) || Number(fields.amount) <= 0) throw new HttpsError('invalid-argument', 'Product, pest and positive quantity are required.');
      if (Object.values(fields).some(value => typeof value === 'string' && value.length > 10000)) throw new HttpsError('invalid-argument', 'Application details are too long.');
      const ref = db.doc(`serviceLogs/${scope.uid}_${operationId}`);
      const fingerprint = createHash('sha256').update(JSON.stringify({ jobId: data.jobId, fields })).digest('hex');
      return db.runTransaction(async tx => {
        const [job, previous] = await Promise.all([tx.get(jobRef), tx.get(ref)]);
        checkJob(scope, job.data());
        if (previous.exists) {
          if (previous.get('fingerprint') !== fingerprint) throw new HttpsError('already-exists', 'This operation ID was already used for different application details.');
          return { id: ref.id };
        }
        const customer = job.get('customerId') ? await tx.get(db.doc(`customers/${documentId(job.get('customerId'))}`)) : null;
        const customerInScope = customer?.exists && (scope.companyId ? customer.get('companyId') === scope.companyId : !customer.get('companyId') && customer.get('userId') === scope.uid);
        const site = withCustomerLocation(job.data(), customerInScope ? customer.data() : null);
        tx.create(ref, { ...fields, fingerprint, userId: scope.uid, ...(scope.companyId ? { companyId: scope.companyId } : {}), jobId: job.id, customerId: job.get('customerId') || null, customerName: site.customerName || '', siteAddress: [site.address, site.city, site.state, site.zipCode].filter(value => typeof value === 'string' && value).join(', '), applicationDate: job.get('date') || '', applicatorName: request.auth.token.name || request.auth.token.email || '', createdAt: new Date().toISOString() });
        return { id: ref.id };
      });
    },
    createCompany: async request => {
      const scope = await accessScope(db, request);
      if (!scope.solo) throw new HttpsError('permission-denied', 'Your account already belongs to a company.');
      const name = String(request.data?.name || '').trim();
      if (!name || name.length > 200) throw new HttpsError('invalid-argument', 'Enter your company name.');
      const ref = db.collection('companies').doc(), profile = db.doc(`users/${scope.uid}`);
      await db.runTransaction(async tx => {
        const [user, owned, memberships, invitations] = await Promise.all([
          tx.get(profile), tx.get(db.collection('companies').where('ownerId', '==', scope.uid).limit(1)),
          tx.get(db.collection('teamMembers').where('uid', '==', scope.uid).limit(1)),
          tx.get(db.collection('teamMembers').where('email', '==', String(request.auth.token.email || '').trim().toLowerCase()).limit(1)),
        ]);
        if (user.get('companyId') || user.get('rlCompanyId') || !owned.empty || !memberships.empty || !invitations.empty) throw new HttpsError('permission-denied', 'Use your existing company or invitation.');
        tx.create(ref, { ownerId: scope.uid, name, services: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        tx.set(profile, { companyId: ref.id, rlCompanyId: ref.id }, { merge: true });
      });
      return { companyId: ref.id };
    },
  };
}
module.exports = { workDataHandlers, projectJob, projectCustomer, projectCompany, JOB_FIELDS, CUSTOMER_FIELDS, APPLICATION_FIELDS };
