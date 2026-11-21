const { HttpsError } = require('firebase-functions/v2/https');
const { createHash } = require('node:crypto');
const { FieldPath } = require('firebase-admin/firestore');
const { documentId, rateLimit } = require('./security');
const { accessScope, requireCapability, hasCapability, checkJob } = require('./access');
const { version } = require('./offline');
const { serviceAreaWorkflow, servicePropertySite, propertyAddress } = require('./serviceAreaWorkflows');
const { schedulingHandlers } = require('./scheduling');
const { buildInitialPlan } = require('./recurring');
const { prepareAssignmentException, commitAssignmentException, summary: exceptionSummary } = require('./jobExceptions');
const { appointmentPatch, isEstimateVisit } = require('./shared/appointments');
const { propertyFor, lifecycleFor, customerArchived } = require('./shared/customerLifecycle');
const { prepareAppointmentLinks, commitAppointmentLinks } = require('./appointmentLinks');
const { summarizeManagementAttention } = require('./shared/managementAttention');

const JOB_FIELDS = ['userId', 'companyId', 'customerId', 'customerName', 'customerPhone', 'serviceType', 'serviceCategory', 'title', 'address', 'city', 'state', 'zipCode', 'serviceArea', 'date', 'time', 'windowStart', 'windowEnd', 'estimatedDuration', 'duration', 'priority', 'status', 'assignedTo', 'assignedToUid', 'assignedToName', 'assignmentNeedsAttention', 'assignmentReview', 'rescheduleRequired', 'servicePlanId', 'servicePlanDate', 'workNotes', 'actualWorkDone', 'actualHours', 'completionNotes', 'departureExceptionReason', 'completedAt', 'cancelledAt', 'cancellationReason', 'cancelledBy', 'createdAt', 'updatedAt', 'appointmentKind', 'billable', 'estimateOutcome', 'inquiryId', 'servicePropertyId', 'propertyAccessInstructions'];
const PRICING_FIELDS = ['totalCost', 'estimatedCost', 'laborRate', 'laborHours', 'materialCost', 'materials', 'scopeOfWork', 'notes', 'description', 'servicePlanId'];
const CUSTOMER_FIELDS = ['userId', 'companyId', 'name', 'firstName', 'lastName', 'email', 'emailNormalized', 'phone', 'phoneNumber', 'address', 'city', 'state', 'zipCode', 'postalCode', 'isActive', 'status', 'createdAt', 'updatedAt', 'lastServiceDate', 'totalJobs', 'emailConsent', 'notes', 'serviceInstructions'];
const APPLICATION_FIELDS = ['product', 'epaRegNo', 'activeIngredient', 'amount', 'unit', 'targetPest', 'areaTreated', 'method', 'applicatorLicense', 'notes'];
function customerVersion(value) {
  if (value instanceof Date || typeof value === 'number') {
    const date = value instanceof Date ? value : new Date(Math.abs(value) < 1e11 ? value * 1000 : value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  try {
    const normalized = version(value);
    return typeof normalized === 'string' ? normalized : null;
  } catch { return null; }
}
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
  data = { ...data, ...(servicePropertySite(data) || {}) };
  // JobForm's Notes are shared dispatch instructions (gate codes, pets, access).
  // Keep the editable technician work log separate; legacy mobile clients still
  // receive their workNotes through the notes alias below.
  const dispatchNotes = typeof data.notes === 'string' ? data.notes : '';
  const operational = { reassignmentRequest: exceptionSummary(data.reassignmentRequest), ...(data.visitEvidence && typeof data.visitEvidence === 'object' ? { visitEvidence: pick(data.visitEvidence, ['arrivedAt','departedAt','accessBlockedAt','lastEventAt','lastEventType']) } : {}) };
  if (role === 'owner' || role === 'admin') return { ...data, ...operational, dispatchNotes, id, updatedAt: version(data.updatedAt) };
  const property = data.serviceProperty && typeof data.serviceProperty === 'object' ? { serviceProperty: pick(data.serviceProperty, ['address', 'formattedAddress', 'postalCode', 'latitude', 'longitude', 'validated', 'source', 'unit', 'label', 'propertyId', 'accessInstructions']) } : {};
  const area = hasCapability(role, 'jobs.schedule') && data.serviceAreaEligibility ? { serviceAreaEligibility: pick(data.serviceAreaEligibility, ['status', 'settingsRevision', 'serviceCategory', 'purpose', 'checkedAt', 'exceptionId', 'continuedFromServicePlan']) } : {};
  return { id, ...pick(data, JOB_FIELDS), ...operational, dispatchNotes, ...coordinates(data), ...property, ...area,
    ...(hasCapability(role, 'jobs.pricing') ? pick(data, [...PRICING_FIELDS, 'invoiceBalance']) : { notes: typeof data.workNotes === 'string' ? data.workNotes : '' }) };
}
function projectCustomer(id, data, role) {
  if (role === 'owner' || role === 'admin') return { ...data, lifecycle: lifecycleFor(data), id, updatedAt: customerVersion(data.updatedAt) };
  const fields = role === 'technician' ? ['name', 'firstName', 'lastName', 'phone', 'phoneNumber', 'address', 'city', 'state', 'zipCode', 'postalCode', 'serviceInstructions'] : CUSTOMER_FIELDS;
  return { id, ...pick(data, fields), ...(role !== 'technician' ? { lifecycle: lifecycleFor(data), updatedAt: customerVersion(data.updatedAt) } : {}), ...(data.address && typeof data.address === 'object' ? { address: pick(data.address, ['street', 'line1', 'city', 'state', 'zipCode', 'postalCode']) } : {}), ...coordinates(data) };
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
  const property = servicePropertySite(data);
  if (property) data = { ...data, ...property };
  if (!customer) return data;
  const address = typeof customer.address === 'string' ? customer.address : customer.address?.street || customer.address?.line1;
  return { ...data, customerName: data.customerName || customer.name || [customer.firstName, customer.lastName].filter(Boolean).join(' '), customerPhone: data.customerPhone || customer.phone || customer.phoneNumber || '',
    ...(!property && !data.address ? { address: address || '', city: customer.city || customer.address?.city || '', state: customer.state || customer.address?.state || '', zipCode: customer.zipCode || customer.address?.zipCode || '', ...coordinates(customer) } : {}) };
}
function workDataHandlers(db, config = {}) {
  const serviceAreas = serviceAreaWorkflow(db, config);
  const scheduling = config.scheduling || schedulingHandlers(db);
  const customerInScope = (customer, scope) => customer?.exists && (scope.companyId ? customer.get('companyId') === scope.companyId : !customer.get('companyId') && customer.get('userId') === scope.uid);
  async function assertAddressActor(tx, scope) {
    const deleted = await tx.get(db.doc(`rlAccountDeletions/${scope.uid}`));
    if (deleted.exists) throw new HttpsError('permission-denied', 'This account no longer has access.');
    if (scope.companyId) {
      const company = await tx.get(db.doc(`companies/${scope.companyId}`));
      const current = scope.role === 'owner' ? company : await tx.get(db.doc(`teamMembers/${scope.memberId}`));
      if (!company.exists || !current.exists || (scope.role === 'owner' ? current.get('ownerId') !== scope.uid : current.get('uid') !== scope.uid || current.get('companyId') !== scope.companyId || current.get('status') !== 'active' || current.get('role') !== scope.role)) throw new HttpsError('permission-denied', 'Your customer-management access changed. Refresh before saving.');
    } else {
      const profile = await tx.get(db.doc(`users/${scope.uid}`));
      if (profile.get('rlCompanyId') || profile.get('companyId')) throw new HttpsError('permission-denied', 'Your workspace changed. Refresh before saving.');
    }
  }
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
      if (resource === 'managementAttention') {
        if (!hasCapability(scope.role, 'dispatch.manage')) throw new HttpsError('permission-denied', 'Management attention access is required.');
        const rows = await scoped(db, 'jobs', scope).select('companyId', 'userId', 'customerId', 'customerName', 'customerPhone', 'serviceType', 'serviceCategory', 'address', 'city', 'state', 'zipCode', 'appointmentKind', 'estimateOutcome', 'status', 'date', 'time', 'windowStart', 'windowEnd', 'estimatedDuration', 'duration', 'assignedTo', 'assignedToName', 'reassignmentRequest', 'assignmentNeedsAttention', 'assignmentReview', 'rescheduleRequired', 'schedulingAttention', 'visitEvidence', 'arrivedAt', 'workStartedAt', 'actualStartedAt', 'startedAt', 'deletedAt', 'updatedAt').get();
        const source = rows.docs.map(row => ({ id: row.id, ...row.data() }));
        const attention = summarizeManagementAttention(source, { now: Date.now(), timeZone: scope.company?.get('timeZone') });
        const wanted = new Set(Object.values(attention.jobIds).flat());
        return { attention, jobs: source.filter(row => wanted.has(row.id)).map(row => projectJob(row.id, row, scope.role)) };
      }
      if (!['jobs', 'customers', 'photos', 'serviceLogs'].includes(resource)) throw new HttpsError('invalid-argument', 'Unknown workspace resource.');
      if (resource === 'jobs') {
        if (data.assignedTo !== undefined && data.assignedTo !== 'self') throw new HttpsError('invalid-argument', 'Choose your personal assignments or the company schedule.');
        const personal = data.assignedTo === 'self' && !!scope.companyId;
        const ownIds = new Set([scope.uid, scope.memberId].filter(Boolean));
        if (personal && scope.role === 'owner') {
          const aliases = await db.collection('teamMembers').where('companyId', '==', scope.companyId).where('uid', '==', scope.uid).limit(21).get();
          if (aliases.size > 20) throw new HttpsError('resource-exhausted', 'Your staff identities need review before loading personal work.');
          aliases.docs.forEach(row => ownIds.add(row.id));
        }
        const ownJob = job => !personal || ownIds.has(job.assignedTo) && (!job.assignedToUid || job.assignedToUid === scope.uid);
        const personalIdentity = job => personal ? { ...job, assignedToUid: scope.uid } : job;
        if (data.id) {
          const job = await jobFor(db, scope, data.id);
          if (!ownJob(job.data())) throw new HttpsError('permission-denied', 'This job is not assigned to you.');
          const customer = job.get('customerId') ? await db.doc(`customers/${documentId(job.get('customerId'))}`).get() : null;
          const sameCustomer = customer?.exists && (scope.companyId ? customer.get('companyId') === scope.companyId : !customer.get('companyId') && customer.get('userId') === scope.uid);
          return { job: projectJob(job.id, personalIdentity(withCustomerLocation(job.data(), sameCustomer ? customer.data() : null)), scope.role), customer: sameCustomer ? projectCustomer(customer.id, customer.data(), scope.role) : null };
        }
        let query = scoped(db, resource, scope);
        if (scope.role === 'technician') query = query.where('assignedTo', '==', scope.memberId);
        else if (personal) query = query.where('assignedTo', 'in', [...ownIds]);
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
        const scanned = rows.docs.slice(0, maximum), page = scanned.filter(row => ownJob(row.data())), customerIds = [...new Set(page.filter(row => !row.get('address') && typeof row.get('customerId') === 'string').map(row => row.get('customerId')))];
        const customers = new Map();
        for (let offset = 0; offset < customerIds.length; offset += 100) {
          const records = await db.getAll(...customerIds.slice(offset, offset + 100).map(id => db.doc(`customers/${documentId(id)}`)));
          records.filter(row => row.exists && (scope.companyId ? row.get('companyId') === scope.companyId : !row.get('companyId') && row.get('userId') === scope.uid)).forEach(row => customers.set(row.id, row.data()));
        }
        return { jobs: page.map(row => projectJob(row.id, personalIdentity(withCustomerLocation(row.data(), customers.get(row.get('customerId')))), scope.role)), hasMore: rows.size > maximum, lastDoc: scanned.at(-1)?.id || null };
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
      const scope = await requireCapability(db, request, action === 'assign' ? 'jobs.assign' : ['cancel', 'delete'].includes(action) ? 'jobs.cancel' : 'jobs.schedule');
      await rateLimit(db, 'job-manage', scope.uid, 120);
      if (!['create', 'update', 'delete', 'assign', 'cancel'].includes(action)) throw new HttpsError('invalid-argument', 'Invalid job operation.');
      const recurring = data.recurring;
      if (recurring !== undefined && (action !== 'create' || !recurring || typeof recurring !== 'object' || Array.isArray(recurring))) throw new HttpsError('invalid-argument', 'Choose recurring appointments when creating the first visit. Existing visits are edited individually.');
      let operationRef, operationFingerprint, planRef;
      if (recurring || action === 'create' && data.operationId !== undefined) {
        const operationId = documentId(data.operationId, 'booking operation');
        if (!/^[A-Za-z0-9-]{16,80}$/.test(operationId)) throw new HttpsError('invalid-argument', 'A valid booking operation is required.');
        const key = createHash('sha256').update(`${scope.uid}:${operationId}`).digest('hex');
        operationRef = db.doc(`rlScheduleOperations/${key}`);
        if (recurring) planRef = db.doc(`servicePlans/rl_booking_${key}`);
        operationFingerprint = createHash('sha256').update(JSON.stringify({ companyId: scope.companyId, job: data.job, recurring: recurring || null, saveCustomerAddress: data.saveCustomerAddress || false, expectedCustomerVersion: data.expectedCustomerVersion ?? null })).digest('hex');
      }
      const replayBooking = snapshot => {
        if (!snapshot?.exists) return null;
        if (snapshot.get('actorId') !== scope.uid || (snapshot.get('companyId') || null) !== (scope.companyId || null)) throw new HttpsError('permission-denied', 'This booking belongs to a different workspace.');
        if (snapshot.get('fingerprint') !== operationFingerprint) throw new HttpsError('already-exists', 'The original appointment was already saved. Refresh your jobs before making further changes.');
        return { ...snapshot.get('result'), replayed: true };
      };
      const replay = operationRef ? replayBooking(await operationRef.get()) : null;
      if (replay) return replay;
      if (data.saveCustomerAddress !== undefined && typeof data.saveCustomerAddress !== 'boolean') throw new HttpsError('invalid-argument', 'Choose whether to update the saved customer address.');
      const saveCustomerAddress = data.saveCustomerAddress === true;
      if (saveCustomerAddress && (!['create', 'update'].includes(action) || !hasCapability(scope.role, 'customers.manage'))) throw new HttpsError('permission-denied', 'Customer-management access is required to save this address.');
      if (saveCustomerAddress && (!Object.hasOwn(data, 'expectedCustomerVersion') || data.expectedCustomerVersion !== null && (typeof data.expectedCustomerVersion !== 'string' || data.expectedCustomerVersion.length > 128))) throw new HttpsError('invalid-argument', 'Refresh the selected customer before updating its saved address.');
      const ref = action === 'create' ? recurring ? db.doc(`jobs/${planRef.id}`) : operationRef ? db.doc(`jobs/rl_booking_${operationRef.id}`) : db.collection('jobs').doc() : db.doc(`jobs/${documentId(data.id)}`);
      const input = { ...(data.job || {}) };
      const permitted = [...JOB_FIELDS, ...PRICING_FIELDS, 'latitude', 'longitude', 'workNotes'];
      const patch = action === 'assign' ? { assignedTo: data.memberId || null } : pick(input, permitted.filter(key => !['userId', 'companyId', 'createdAt', 'updatedAt', 'assignedToName', 'assignedToUid', 'assignmentNeedsAttention', 'assignmentReview', 'servicePlanId', 'servicePlanDate', 'cancelledAt', 'cancellationReason', 'cancelledBy'].includes(key)));
      if (patch.status && !['scheduled', 'en-route', 'in-progress', 'completed', 'cancelled'].includes(patch.status)) throw new HttpsError('invalid-argument', 'Invalid job status.');
      if (patch.status === 'cancelled' && !hasCapability(scope.role, 'jobs.cancel')) throw new HttpsError('permission-denied', 'Cancellation access is required.');
      const initial = action === 'create' ? null : await ref.get();
      if (initial) checkJob(scope, initial.data());
      if (action === 'delete' && isEstimateVisit(initial?.data())) throw new HttpsError('failed-precondition', 'Cancel the estimate appointment to preserve its inquiry and visit history.');
      if (action === 'delete' && initial?.get('status') === 'in-progress') throw new HttpsError('failed-precondition', 'An in-progress appointment cannot be permanently deleted. Complete it or return it to scheduled work first.');
      if ((action === 'cancel' || patch.status === 'cancelled') && ['in-progress', 'completed'].includes(initial?.get('status'))) throw new HttpsError('failed-precondition', `A ${initial.get('status')} appointment cannot be cancelled.`);
      if (action === 'cancel' || patch.status === 'cancelled') {
        const cancellationReason = String(data.reason ?? input.cancellationReason ?? '').trim();
        if (cancellationReason.length > 1000) throw new HttpsError('invalid-argument', 'Keep the cancellation reason under 1,000 characters.');
        Object.assign(patch, { status: 'cancelled', cancellationReason, cancelledAt: new Date().toISOString(), cancelledBy: scope.uid });
      }
      Object.assign(patch, appointmentPatch(input, initial?.data() || {}, { create: action === 'create' }));
      if (isEstimateVisit(patch) && recurring) throw new HttpsError('invalid-argument', 'Estimate visits are one-time appointments. Use a service plan for recurring paid work.');
      if (action === 'create' && isEstimateVisit(patch) && !operationRef) throw new HttpsError('invalid-argument', 'A stable booking operation is required for an estimate visit.');
      if (action !== 'create' && ['inquiryId', 'servicePropertyId', 'customerId'].some(key => Object.hasOwn(input, key) && input[key] !== initial.get(key)) && initial.get('inquiryId')) throw new HttpsError('failed-precondition', 'This estimate belongs to its saved inquiry/customer/property. Cancel it and record a new inquiry to change that relationship.');
      if (action === 'update' && initial.get('servicePropertyId') && (Object.hasOwn(input, 'servicePropertyId') ? input.servicePropertyId : initial.get('servicePropertyId')) === initial.get('servicePropertyId') && (input.serviceProperty !== undefined || input.propertyAddress !== undefined || input.address !== undefined)) {
        const normalizedAddress = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
        if (normalizedAddress(propertyAddress(input)) !== normalizedAddress(propertyAddress(initial.data()))) throw new HttpsError('failed-precondition', 'This appointment retains its selected property snapshot. Choose a different saved property, or cancel and schedule a new inquiry visit to change its location.');
      }
      const savedAddress = propertyAddress(input), customerId = patch.customerId || initial?.get('customerId');
      if (saveCustomerAddress && (!customerId || !input.serviceProperty || !savedAddress || savedAddress.length > 278)) throw new HttpsError('invalid-argument', 'Choose a customer and explicitly enter its new service property address.');
      let directoryCustomer, selectedProperty;
      if (patch.customerId || input.servicePropertyId) {
        const customer = await db.doc(`customers/${documentId(customerId)}`).get();
        if (!customer.exists || (scope.companyId ? customer.get('companyId') !== scope.companyId : customer.get('companyId') || customer.get('userId') !== scope.uid)) throw new HttpsError('permission-denied', 'Choose a customer in this workspace.');
        if (action === 'create' && (customerArchived(customer.data()) || lifecycleFor(customer.data()) === 'inactive')) throw new HttpsError('failed-precondition', 'Reactivate this customer before scheduling new work.');
        if (input.servicePropertyId && (action === 'create' || input.servicePropertyId !== initial?.get('servicePropertyId') || customerId !== initial?.get('customerId'))) {
          selectedProperty = propertyFor(customer.data(), documentId(input.servicePropertyId, 'service property'));
          if (!selectedProperty) throw new HttpsError('failed-precondition', 'Choose a saved service property for this customer.');
          directoryCustomer = customer;
          input.serviceProperty = { address: selectedProperty.address };
          // Reuse only the server-recorded owner exception reference. The
          // existing coverage engine rechecks expiry/category/settings/owner.
          if (!input.serviceAreaExceptionId && selectedProperty.serviceAreaExceptionId) input.serviceAreaExceptionId = selectedProperty.serviceAreaExceptionId;
        }
      }
      // Resolve Google once before entering a retried Firestore transaction.
      // Existing status/date/notes edits do not revisit changed boundaries.
      const area = ['create', 'update'].includes(action) ? await serviceAreas.prepare(scope, input, initial?.data() || {}, 'scheduling', action === 'create' || saveCustomerAddress) : null;
      if (area) Object.assign(patch, area.patch);
      if (selectedProperty && area) {
        patch.propertyAccessInstructions = selectedProperty.accessInstructions || '';
        patch.serviceProperty = { ...patch.serviceProperty, propertyId: selectedProperty.id, unit: selectedProperty.unit || '', label: selectedProperty.label || 'other', accessInstructions: selectedProperty.accessInstructions || '' };
      }
      return db.runTransaction(async tx => {
        const previousOperation = operationRef ? replayBooking(await tx.get(operationRef)) : null;
        if (previousOperation) return previousOperation;
        const existing = await tx.get(ref);
        if (action === 'create' && existing.exists) throw new HttpsError('already-exists', 'This booking already exists. Refresh your jobs.');
        if (planRef && (await tx.get(planRef)).exists) throw new HttpsError('already-exists', 'This recurring plan already exists. Refresh your service plans.');
        if (action !== 'create') {
          checkJob(scope, existing.data());
          if (data.expectedVersion !== undefined && version(existing.get('updatedAt')) !== version(data.expectedVersion)) throw new HttpsError('aborted', 'This job changed. Refresh it before saving.');
          if ((area || saveCustomerAddress) && !existing.updateTime.isEqual(initial.updateTime)) throw new HttpsError('aborted', 'This job changed while its service property was being checked. Refresh before saving.');
        }
        let customer;
        if (patch.customerId || saveCustomerAddress) {
          customer = await tx.get(db.doc(`customers/${documentId(patch.customerId || customerId)}`));
          if (!customerInScope(customer, scope)) throw new HttpsError('permission-denied', 'Choose a customer in this workspace.');
        }
        if (saveCustomerAddress) {
          await assertAddressActor(tx, scope);
          if (customerVersion(customer.get('updatedAt')) !== customerVersion(data.expectedCustomerVersion)) throw new HttpsError('aborted', 'The customer changed. Refresh it before saving the permanent address change.');
        }
        await serviceAreas.assertCurrent(tx, area);
        const before = existing.data() || {};
        if (before.status === 'cancelled' && patch.status && patch.status !== 'cancelled') throw new HttpsError('failed-precondition', 'A cancelled appointment remains in history. Schedule a new appointment instead of reactivating it.');
        if (action === 'delete') {
          if (isEstimateVisit(before)) throw new HttpsError('failed-precondition', 'Cancel the estimate appointment to preserve its inquiry and visit history.');
          if (before.status === 'in-progress') throw new HttpsError('failed-precondition', 'An in-progress appointment cannot be permanently deleted. Complete it or return it to scheduled work first.');
          const linkedInvoices = await tx.get(db.collection('invoices').where('jobId', '==', ref.id).limit(1));
          if (!linkedInvoices.empty) throw new HttpsError('failed-precondition', 'This appointment has an invoice and cannot be permanently deleted. Void or remove the invoice first, or cancel the appointment to retain its history.');
        }
        if ((action === 'cancel' || patch.status === 'cancelled') && ['in-progress', 'completed'].includes(before.status)) throw new HttpsError('failed-precondition', `A ${before.status} appointment cannot be cancelled.`);
        const slot = await scheduling.prepare(tx, scope, action === 'delete' ? null : { ...before, ...patch }, { before, jobId: ref.id, reviewStartedWork: data.reviewStartedWork === true });
        if (action !== 'delete' && (!slot.skipped || action === 'create' || action === 'assign')) Object.assign(patch, { assignedTo: slot.assignedTo || null, assignedToName: slot.assignedToName || null, assignedToUid: slot.assignedToUid || null, assignmentNeedsAttention: !slot.assignedTo, assignmentReview: slot.assignedTo ? null : 'This visit needs a technician assignment.' });
        const exceptionChange = action !== 'delete' ? await prepareAssignmentException(tx, db, scope, ref.id, before, { ...before, ...patch }) : null;
        if (exceptionChange) patch.reassignmentRequest = null;
        const links = action === 'delete' ? null : await prepareAppointmentLinks(db, tx, scope, { jobId: ref.id, before, next: { ...before, ...patch }, create: action === 'create', directoryVersion: directoryCustomer?.updateTime });
        let plan;
        if (recurring) {
          plan = buildInitialPlan(scope, { ...patch, customerName: customer?.get('name') || patch.customerName, customerPhone: customer?.get('phone') || customer?.get('phoneNumber') || patch.customerPhone }, recurring);
          if (plan.preferredTechnicianId) {
            const preferred = await scheduling.validateTechnician(tx, scope, plan.preferredTechnicianId);
            if (preferred.id !== slot.assignedTo) throw new HttpsError('invalid-argument', 'The first appointment technician must match the preferred technician for this new plan.');
            plan.preferredTechnicianId = preferred.id; plan.preferredTechnicianUid = preferred.uid;
          } else if (slot.assignedTo) throw new HttpsError('invalid-argument', 'Use the first appointment technician as the preferred technician for this new plan.');
          patch.servicePlanId = planRef.id; patch.servicePlanDate = patch.date;
        }
        const updatedAt = new Date(Math.max(Date.now(), Date.parse(version(existing.get('updatedAt'))) + 1 || 0, saveCustomerAddress ? Date.parse(customerVersion(customer.get('updatedAt'))) + 1 || 0 : 0)).toISOString();
        scheduling.commit(tx, slot);
        commitAssignmentException(tx, exceptionChange, updatedAt);
        commitAppointmentLinks(db, tx, links, updatedAt);
        if (action === 'delete') tx.delete(ref);
        else if (action === 'create') tx.create(ref, { ...patch, userId: scope.uid, ...(scope.companyId ? { companyId: scope.companyId } : {}), status: patch.status || 'scheduled', createdAt: updatedAt, updatedAt });
        else {
          const changes = Object.keys(patch).filter(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(patch[key])).map(key => ({ field: key, label: key, from: before[key] ?? '', to: patch[key] ?? '' }));
          const revision = { at: updatedAt, by: request.auth.token.name || request.auth.token.email || scope.uid, reason: String(input.revisions?.at(-1)?.reason || '').slice(0, 1000), changes, action };
          tx.update(ref, { ...patch, updatedAt, lastModifiedAt: updatedAt, isModified: true, originalDetails: before.originalDetails || pick(before, [...JOB_FIELDS, ...PRICING_FIELDS]), revisions: [...(Array.isArray(before.revisions) ? before.revisions : []), revision] });
        }
        const audit = db.collection('rlAudit').doc();
        tx.create(audit, { action: `job.${action}`, companyId: scope.companyId, actorId: scope.uid, jobId: ref.id, fromMemberId: before.assignedTo || null, toMemberId: patch.assignedTo ?? before.assignedTo ?? null, ...(action === 'cancel' ? { reason: patch.cancellationReason || '' } : {}), createdAt: updatedAt });
        if (plan) {
          tx.create(planRef, { ...plan, lastJobId: ref.id, lastGeneratedFor: patch.date, createdAt: updatedAt, updatedAt });
          tx.create(db.collection('rlAudit').doc(), { action: 'servicePlan.create', companyId: scope.companyId, actorId: scope.uid, servicePlanId: planRef.id, jobId: ref.id, createdAt: updatedAt });
        }
        if (saveCustomerAddress) {
          const property = patch.serviceProperty;
          const validated = property?.validated === true && Number.isFinite(property.latitude) && Number.isFinite(property.longitude);
          const verifiedProperty = area.result.property;
          const addressPatch = { address: property?.address || savedAddress, city: '', state: '', zipCode: '', postalCode: '', latitude: validated ? property.latitude : null, longitude: validated ? property.longitude : null, location: validated ? { latitude: property.latitude, longitude: property.longitude } : null,
            addressValidation: validated ? { source: 'google-address-validation', validatedAt: verifiedProperty.validatedAt, postalCode: verifiedProperty.postalCode, placeId: verifiedProperty.placeId || '' }
              : { source: 'operator-entered', validated: false, status: 'unverified', validatedAt: null, checkedAt: property?.checkedAt || updatedAt, postalCode: '', placeId: '' } };
          const original = Object.fromEntries(['address', 'city', 'state', 'zipCode', 'postalCode', 'latitude', 'longitude', 'location', 'addressValidation'].filter(field => customer.get(field) !== undefined).map(field => [field, customer.get(field)]));
          tx.update(customer.ref, { ...addressPatch, updatedAt });
          tx.create(db.collection('rlAudit').doc(), { action: 'customer.address.update', companyId: scope.companyId, customerId: customer.id, jobId: ref.id, actorId: scope.uid, original, changes: addressPatch, createdAt: updatedAt });
        }
        const result = { id: ref.id, updatedAt, ...(plan ? { servicePlanId: planRef.id, nextServiceDate: plan.nextServiceDate } : {}), ...(area ? { serviceArea: area.result, ...(area.result.internalContinuation ? { addressWarning: area.result.message } : {}) } : {}), ...(saveCustomerAddress ? { customerAddressUpdated: true, customerUpdatedAt: updatedAt } : {}) };
        if (operationRef) tx.create(operationRef, { actorId: scope.uid, companyId: scope.companyId || null, fingerprint: operationFingerprint, result, createdAt: updatedAt });
        return result;
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
        const [user, owned, memberships, invitations, deletion] = await Promise.all([
          tx.get(profile), tx.get(db.collection('companies').where('ownerId', '==', scope.uid).limit(1)),
          tx.get(db.collection('teamMembers').where('uid', '==', scope.uid).limit(1)),
          tx.get(db.collection('teamMembers').where('email', '==', String(request.auth.token.email || '').trim().toLowerCase()).limit(1)),
          tx.get(db.collection('rlAccountDeletions').doc(scope.uid)),
        ]);
        if (deletion.exists) throw new HttpsError('permission-denied', 'This Route Logistics account has been deleted.');
        if (user.get('companyId') || user.get('rlCompanyId') || !owned.empty || !memberships.empty || !invitations.empty) throw new HttpsError('permission-denied', 'Use your existing company or invitation.');
        tx.create(ref, { ownerId: scope.uid, name, services: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        tx.set(profile, { companyId: ref.id, rlCompanyId: ref.id }, { merge: true });
      });
      return { companyId: ref.id };
    },
  };
}
module.exports = { workDataHandlers, projectJob, projectCustomer, projectCompany, customerVersion, JOB_FIELDS, CUSTOMER_FIELDS, APPLICATION_FIELDS };
