const { HttpsError } = require('firebase-functions/v2/https');
const { documentId, requireAuth, requireManager, rateLimit } = require('./security');
const { requireCapability } = require('./access');
const { version } = require('./offline');
const { serviceAreaWorkflow, storedGeometry, servicePropertySite } = require('./serviceAreaWorkflows');
function nextVisit(plan) {
  const date = String(plan.nextServiceDate || '');
  const start = new Date(`${date}T12:00:00Z`);
  const days = Number(plan.frequencyDays);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== date || !Number.isInteger(days) || days < 1 || days > 3660) throw new HttpsError('failed-precondition', 'Service plan has an invalid date or frequency.');
  if (!plan.active || !plan.customerId || !plan.userId || !Number.isFinite(Number(plan.price || 0)) || Number(plan.price || 0) < 0) throw new HttpsError('failed-precondition', 'Service plan is inactive or incomplete.');
  start.setUTCDate(start.getUTCDate() + days);
  return { date, nextServiceDate: start.toISOString().slice(0, 10) };
}
async function generateVisit(db, id, expectedDate, authorize = async () => {}) {
  const ref = db.collection('servicePlans').doc(documentId(id, 'plan'));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Service plan not found.');
    const plan = snap.data();
    await authorize(plan);
    if (expectedDate && plan.nextServiceDate !== expectedDate) return { skipped: true, nextServiceDate: plan.nextServiceDate };
    const { date, nextServiceDate } = nextVisit(plan);
    const jobRef = db.collection('jobs').doc(`rl_plan_${id}_${date}`);
    const [existing, customer] = await Promise.all([tx.get(jobRef), tx.get(db.collection('customers').doc(documentId(plan.customerId)))]);
    if (!customer.exists || (plan.companyId ? customer.get('companyId') !== plan.companyId : customer.get('userId') !== plan.userId || customer.get('companyId'))) throw new HttpsError('failed-precondition', 'Customer does not belong to this service plan.');
    if (!existing.exists) tx.create(jobRef, {
      userId: plan.userId, ...(plan.companyId ? { companyId: plan.companyId } : {}),
      customerId: plan.customerId, customerName: plan.customerName || customer.get('name') || '',
      customerPhone: plan.customerPhone || '', address: plan.serviceProperty?.address || plan.address || '', serviceType: plan.serviceType || 'Service',
      ...storedGeometry(plan),
      ...(servicePropertySite(plan) || {}),
      ...(plan.serviceAreaEligibility ? { serviceAreaEligibility: { ...plan.serviceAreaEligibility, continuedFromServicePlan: id } } : {}),
      status: 'scheduled', date, time: plan.time || '09:00', totalCost: Number(plan.price || 0), notes: plan.notes || '',
      servicePlanId: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    tx.update(ref, { nextServiceDate, lastJobId: jobRef.id, lastGeneratedFor: date, updatedAt: new Date().toISOString() });
    return { jobId: jobRef.id, nextServiceDate };
  });
}
function recurringHandlers(db, config = {}) {
  const serviceAreas = serviceAreaWorkflow(db, config);
  return {
    manageServicePlan: async request => {
      const scope = await requireCapability(db, request, 'jobs.schedule'), data = request.data || {}, action = data.action;
      await rateLimit(db, 'service-plan-manage', scope.uid, 40);
      if (!['create', 'update'].includes(action)) throw new HttpsError('invalid-argument', 'Choose a service plan action.');
      const target = action === 'create' ? db.collection('servicePlans').doc() : db.doc(`servicePlans/${documentId(data.id, 'service plan')}`), input = data.plan || {};
      const initial = action === 'create' ? null : await target.get(), before = initial?.data() || {};
      const inScope = record => !!record && (scope.companyId ? record.companyId === scope.companyId : !record.companyId && record.userId === scope.uid);
      if (initial && !inScope(before)) throw new HttpsError('permission-denied', 'This service plan is not available in your workspace.');
      const patch = {};
      for (const [key, maximum] of [['customerId', 200], ['serviceType', 200], ['serviceCategory', 200], ['address', 500], ['notes', 3000]]) if (Object.hasOwn(input, key)) {
        if (typeof input[key] !== 'string' || input[key].length > maximum) throw new HttpsError('invalid-argument', `Enter a valid ${key}.`);
        patch[key] = input[key].trim();
      }
      if (Object.hasOwn(input, 'frequencyDays')) {
        const days = Number(input.frequencyDays);
        if (!Number.isInteger(days) || days < 1 || days > 3660) throw new HttpsError('invalid-argument', 'Choose a valid service frequency.');
        patch.frequencyDays = days;
      }
      if (Object.hasOwn(input, 'nextServiceDate')) {
        const date = input.nextServiceDate;
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new HttpsError('invalid-argument', 'Choose a valid first service date.');
        patch.nextServiceDate = date;
      }
      if (Object.hasOwn(input, 'time')) {
        if (typeof input.time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new HttpsError('invalid-argument', 'Choose a valid service time.');
        patch.time = input.time;
      }
      if (Object.hasOwn(input, 'price')) {
        const price = Number(input.price);
        if (!Number.isFinite(price) || price < 0 || price > 100000000) throw new HttpsError('invalid-argument', 'Choose a valid service price.');
        patch.price = price;
      }
      if (Object.hasOwn(input, 'active')) {
        if (typeof input.active !== 'boolean') throw new HttpsError('invalid-argument', 'Choose whether this service plan is active.');
        patch.active = input.active;
      }
      if (action === 'create' && (!patch.customerId || !patch.frequencyDays || !patch.nextServiceDate)) throw new HttpsError('invalid-argument', 'Choose a customer, service frequency and first service date.');
      const customerId = patch.customerId || before.customerId;
      if (action === 'create' || patch.customerId && patch.customerId !== before.customerId) {
        const customer = await db.doc(`customers/${documentId(customerId, 'customer')}`).get();
        if (!customer.exists || !inScope(customer.data()) || customer.get('isActive') === false || customer.get('deletedAt')) throw new HttpsError('permission-denied', 'Choose an active customer from this workspace.');
      }
      const area = await serviceAreas.prepare(scope, input, before, 'scheduling', action === 'create');
      if (area) Object.assign(patch, area.patch);
      return db.runTransaction(async tx => {
        const current = await tx.get(target);
        if (action === 'update' && (!current.exists || !inScope(current.data()))) throw new HttpsError('permission-denied', 'This service plan is not available in your workspace.');
        if (action === 'update' && data.expectedVersion !== undefined && version(current.get('updatedAt')) !== version(data.expectedVersion)) throw new HttpsError('aborted', 'This service plan changed. Refresh before saving.');
        if (area && initial && !current.updateTime.isEqual(initial.updateTime)) throw new HttpsError('aborted', 'This service plan changed while its service property was checked. Refresh before saving.');
        const customer = action === 'create' || patch.customerId && patch.customerId !== current.get('customerId') ? await tx.get(db.doc(`customers/${documentId(customerId, 'customer')}`)) : null;
        if (customer && (!customer.exists || !inScope(customer.data()) || customer.get('isActive') === false || customer.get('deletedAt'))) throw new HttpsError('permission-denied', 'Choose an active customer from this workspace.');
        await serviceAreas.assertCurrent(tx, area);
        const updatedAt = new Date().toISOString();
        if (action === 'create') tx.create(target, { ...patch, userId: scope.uid, ...(scope.companyId ? { companyId: scope.companyId } : {}), customerName: customer.get('name') || '', customerPhone: customer.get('phone') || customer.get('phoneNumber') || '', serviceType: patch.serviceType || 'General Pest Control', time: patch.time || '09:00', price: patch.price || 0, active: patch.active !== false, createdAt: updatedAt, updatedAt });
        else tx.update(target, { ...patch, ...(customer ? { customerName: customer.get('name') || '', customerPhone: customer.get('phone') || customer.get('phoneNumber') || '' } : {}), updatedAt });
        tx.create(db.collection('rlAudit').doc(), { action: `servicePlan.${action}`, companyId: scope.companyId || null, actorId: scope.uid, servicePlanId: target.id, createdAt: updatedAt });
        return { id: target.id, updatedAt, ...(area ? { serviceArea: area.result } : {}) };
      });
    },
    generateServicePlanJob: async (request) => {
      requireAuth(request);
      await rateLimit(db, 'generate-job', request.auth.uid);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(request.data?.expectedDate || '')) throw new HttpsError('invalid-argument', 'Expected visit date is required.');
      return generateVisit(db, request.data?.planId, request.data.expectedDate, (plan) => requireManager(db, request, plan));
    },
    generateRecurringJobs: async () => {
      const today = new Date().toISOString().slice(0, 10);
      let cursor;
      do {
        let query = db.collection('servicePlans').where('active', '==', true).where('nextServiceDate', '<=', today).orderBy('nextServiceDate').limit(200);
        if (cursor) query = query.startAfter(cursor);
        const snap = await query.get();
        for (const plan of snap.docs) {
          try { await generateVisit(db, plan.id, plan.get('nextServiceDate')); }
          catch (error) { console.error('Recurring visit failed', { planId: plan.id, code: error.code || 'unknown' }); }
        }
        cursor = snap.size === 200 ? snap.docs.at(-1) : null;
      } while (cursor);
    },
  };
}
module.exports = { nextVisit, generateVisit, recurringHandlers };
