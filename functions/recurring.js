const { HttpsError } = require('firebase-functions/v2/https');
const { documentId, requireManager, rateLimit } = require('./security');
const { requireCapability } = require('./access');
const { version } = require('./offline');
const { serviceAreaWorkflow, storedGeometry, servicePropertySite } = require('./serviceAreaWorkflows');
const { calendarDate, normalizeRecurrence, nextRecurrenceDate, firstOccurrenceOnOrAfter, frequencyDaysForRule } = require('./recurrenceRules');

function planDuration(value) {
  const duration = value === undefined ? 1 : Number(value);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 24) throw new HttpsError('invalid-argument', 'Choose a service duration greater than zero and no longer than 24 hours.');
  return duration;
}
function todayInZone(timeZone = 'America/Los_Angeles', now = Date.now()) {
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }); }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(now)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function assertFutureStart(date, scope) {
  calendarDate(date);
  if (date < todayInZone(scope.company?.get?.('timeZone') || scope.company?.timeZone)) throw new HttpsError('invalid-argument', 'Choose today or a future date for a new recurring appointment.');
}
function assignmentSettings(input = {}, before = {}) {
  const preferred = Object.hasOwn(input, 'preferredTechnicianId') ? input.preferredTechnicianId : before.preferredTechnicianId || null;
  const preferredTechnicianId = preferred === null || preferred === '' ? null : documentId(preferred, 'preferred technician');
  const assignmentFallback = input.assignmentFallback === undefined ? before.assignmentFallback || 'unassigned' : input.assignmentFallback;
  if (!['unassigned', 'auto'].includes(assignmentFallback)) throw new HttpsError('invalid-argument', 'Choose whether an unavailable preferred technician needs dispatcher review or an available replacement.');
  return { preferredTechnicianId, assignmentFallback };
}
function buildInitialPlan(scope, job, settings = {}) {
  assertFutureStart(job.date, scope);
  const recurrence = normalizeRecurrence(settings.recurrence, job.date);
  const time = job.time || '09:00';
  if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpsError('invalid-argument', 'Choose a valid service time.');
  const price = Number(job.totalCost || 0);
  if (!Number.isFinite(price) || price < 0 || price > 100000000) throw new HttpsError('invalid-argument', 'Choose a valid recurring service price.');
  const preferred = Object.hasOwn(settings, 'preferredTechnicianId') ? settings.preferredTechnicianId : job.assignedTo || null;
  return {
    userId: scope.uid, ...(scope.companyId ? { companyId: scope.companyId } : {}),
    customerId: documentId(job.customerId, 'customer'),
    customerName: String(job.customerName || '').trim().slice(0, 200), customerPhone: String(job.customerPhone || '').trim().slice(0, 100),
    serviceType: String(job.serviceType || 'Service').trim().slice(0, 200), notes: String(job.notes || '').trim().slice(0, 3000),
    address: job.serviceProperty?.address || job.address || '', ...storedGeometry(job), ...(servicePropertySite(job) || {}),
    time, estimatedDuration: planDuration(job.estimatedDuration ?? job.duration), price, active: true,
    recurrence, frequencyDays: frequencyDaysForRule(recurrence), nextServiceDate: nextRecurrenceDate(recurrence, job.date),
    ...assignmentSettings({ preferredTechnicianId: preferred, assignmentFallback: settings.assignmentFallback }),
  };
}
function nextVisit(plan) {
  const date = String(plan.nextServiceDate || '');
  const start = new Date(`${date}T12:00:00Z`);
  const days = Number(plan.frequencyDays);
  const calendar = plan.recurrence?.version === 1;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== date || !calendar && (!Number.isInteger(days) || days < 1 || days > 3660)) throw new HttpsError('failed-precondition', 'Service plan has an invalid date or frequency.');
  if (!plan.active || !plan.customerId || !plan.userId || !Number.isFinite(Number(plan.price || 0)) || Number(plan.price || 0) < 0) throw new HttpsError('failed-precondition', 'Service plan is inactive or incomplete.');
  if (calendar) {
    try {
      if (firstOccurrenceOnOrAfter(plan.recurrence, date) !== date) throw Error('Off-pattern service date.');
      return { date, nextServiceDate: nextRecurrenceDate(plan.recurrence, date) };
    }
    catch { throw new HttpsError('failed-precondition', 'Service plan has an invalid calendar recurrence. Review its date and pattern.'); }
  }
  start.setUTCDate(start.getUTCDate() + days);
  return { date, nextServiceDate: start.toISOString().slice(0, 10) };
}
async function generateVisit(db, id, expectedDate, authorize = async () => {}, options = {}) {
  const ref = db.collection('servicePlans').doc(documentId(id, 'plan'));
  const scheduling = options.scheduling || require('./scheduling').schedulingHandlers(db);
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
    const job = {
      userId: plan.userId, ...(plan.companyId ? { companyId: plan.companyId } : {}),
      customerId: plan.customerId, customerName: plan.customerName || customer.get('name') || '',
      customerPhone: plan.customerPhone || '', address: plan.serviceProperty?.address || plan.address || '', serviceType: plan.serviceType || 'Service',
      ...storedGeometry(plan),
      ...(servicePropertySite(plan) || {}),
      ...(plan.serviceAreaEligibility ? { serviceAreaEligibility: { ...plan.serviceAreaEligibility, continuedFromServicePlan: id } } : {}),
      status: 'scheduled', date, time: plan.time || '09:00', estimatedDuration: planDuration(plan.estimatedDuration ?? plan.duration), totalCost: Number(plan.price || 0), notes: plan.notes || '',
      servicePlanId: id, servicePlanDate: date, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    let selected;
    if (!existing.exists) {
      let scope = options.scope;
      if (!scope) {
        const company = plan.companyId ? await tx.get(db.doc(`companies/${documentId(plan.companyId, 'company')}`)) : null;
        if (company && (!company.exists || !company.get('ownerId') || company.get('isActive') === false || company.get('deletedAt'))) throw new HttpsError('failed-precondition', 'The recurring service provider is no longer active.');
        scope = { companyId: plan.companyId || null, uid: company ? company.get('ownerId') : plan.userId, role: 'owner', ...(company ? { company } : {}) };
      }
      selected = await scheduling.choose(tx, scope, job, { ...assignmentSettings(plan), preferredTechnicianUid: plan.preferredTechnicianUid || null, system: !options.scope, jobId: jobRef.id, servicePlanId: id, occurrenceDate: date });
      Object.assign(job, { assignedTo: selected.assignedTo || null, assignedToName: selected.assignedToName || '', assignedToUid: selected.assignedToUid || null, assignmentNeedsAttention: selected.assignmentNeedsAttention === true, ...(selected.assignmentReview ? { assignmentReview: selected.assignmentReview } : {}) });
      scheduling.commit(tx, selected);
      tx.create(jobRef, job);
    }
    tx.update(ref, { nextServiceDate, lastJobId: jobRef.id, lastGeneratedFor: date, updatedAt: new Date().toISOString(), ...(selected ? { assignmentNeedsAttention: selected.assignmentNeedsAttention === true, assignmentReview: selected.assignmentReview || null } : {}) });
    return { jobId: jobRef.id, nextServiceDate };
  });
}
function recurringHandlers(db, config = {}) {
  const serviceAreas = serviceAreaWorkflow(db, config);
  const scheduling = config.scheduling || require('./scheduling').schedulingHandlers(db);
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
      if (Object.hasOwn(input, 'estimatedDuration') || action === 'create') patch.estimatedDuration = planDuration(input.estimatedDuration ?? before.estimatedDuration);
      if (Object.hasOwn(input, 'preferredTechnicianId') || Object.hasOwn(input, 'assignmentFallback') || action === 'create') Object.assign(patch, assignmentSettings(input, before));
      if (Object.hasOwn(input, 'recurrence')) {
        const firstDate = patch.nextServiceDate || before.nextServiceDate;
        assertFutureStart(firstDate, scope);
        patch.recurrence = normalizeRecurrence(input.recurrence, firstDate);
        patch.frequencyDays = frequencyDaysForRule(patch.recurrence);
      } else if (before.recurrence && patch.nextServiceDate) {
        const rule = normalizeRecurrence(before.recurrence, before.recurrence.anchorDate);
        if (firstOccurrenceOnOrAfter(rule, patch.nextServiceDate) !== patch.nextServiceDate) throw new HttpsError('invalid-argument', 'Choose a next service date that matches the recurring appointment pattern.');
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
      const scheduleChanged = action === 'create' || ['recurrence', 'frequencyDays', 'nextServiceDate', 'time', 'estimatedDuration', 'preferredTechnicianId', 'assignmentFallback', 'active'].some(key => Object.hasOwn(input, key));
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
        if (scheduleChanged && initial && !current.updateTime.isEqual(initial.updateTime)) throw new HttpsError('aborted', 'This service plan changed while its schedule was checked. Refresh before saving.');
        if (area && initial && !current.updateTime.isEqual(initial.updateTime)) throw new HttpsError('aborted', 'This service plan changed while its service property was checked. Refresh before saving.');
        const customer = action === 'create' || patch.customerId && patch.customerId !== current.get('customerId') ? await tx.get(db.doc(`customers/${documentId(customerId, 'customer')}`)) : null;
        if (customer && (!customer.exists || !inScope(customer.data()) || customer.get('isActive') === false || customer.get('deletedAt'))) throw new HttpsError('permission-denied', 'Choose an active customer from this workspace.');
        await serviceAreas.assertCurrent(tx, area);
        if (Object.hasOwn(input, 'preferredTechnicianId')) {
          const preferred = patch.preferredTechnicianId ? await scheduling.validateTechnician(tx, scope, patch.preferredTechnicianId) : null;
          patch.preferredTechnicianId = preferred?.id || null; patch.preferredTechnicianUid = preferred?.uid || null;
          patch.preferredTechnicianNeedsReview = false; patch.preferredTechnicianReview = null;
        }
        const next = { ...(current.data() || {}), ...patch };
        const prepared = await scheduling.prepare(tx, scope, { ...next, date: next.nextServiceDate, assignedTo: scheduleChanged && next.active !== false ? next.preferredTechnicianId || null : null, status: next.active === false ? 'cancelled' : 'scheduled', servicePlanId: target.id, servicePlanDate: next.nextServiceDate }, { before: { ...(current.data() || {}), date: current.get('nextServiceDate'), assignedTo: scheduleChanged ? current.get('preferredTechnicianId') || null : null }, jobId: `plan:${target.id}`, strict: scheduleChanged, force: scheduleChanged, excludeServicePlanId: target.id });
        const updatedAt = new Date(Math.max(Date.now(), Date.parse(version(current.get('updatedAt'))) + 1 || 0)).toISOString();
        scheduling.commit(tx, prepared);
        if (action === 'create') tx.create(target, { ...patch, userId: scope.uid, ...(scope.companyId ? { companyId: scope.companyId } : {}), customerName: customer.get('name') || '', customerPhone: customer.get('phone') || customer.get('phoneNumber') || '', serviceType: patch.serviceType || 'General Pest Control', time: patch.time || '09:00', price: patch.price || 0, active: patch.active !== false, createdAt: updatedAt, updatedAt });
        else tx.update(target, { ...patch, ...(customer ? { customerName: customer.get('name') || '', customerPhone: customer.get('phone') || customer.get('phoneNumber') || '' } : {}), updatedAt });
        tx.create(db.collection('rlAudit').doc(), { action: `servicePlan.${action}`, companyId: scope.companyId || null, actorId: scope.uid, servicePlanId: target.id, createdAt: updatedAt });
        return { id: target.id, updatedAt, ...(area ? { serviceArea: area.result } : {}) };
      });
    },
    generateServicePlanJob: async (request) => {
      const scope = await requireCapability(db, request, 'jobs.schedule');
      await rateLimit(db, 'generate-job', request.auth.uid);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(request.data?.expectedDate || '')) throw new HttpsError('invalid-argument', 'Expected visit date is required.');
      return generateVisit(db, request.data?.planId, request.data.expectedDate, (plan) => requireManager(db, request, plan), { scheduling, scope });
    },
    generateRecurringJobs: async () => {
      const legacyToday = new Date().toISOString().slice(0, 10), horizonDate = calendarDate(legacyToday);
      // UTC+14 providers can already be on tomorrow's calendar date.
      horizonDate.setUTCDate(horizonDate.getUTCDate() + 15);
      const horizon = horizonDate.toISOString().slice(0, 10), visited = new Set(), companyCutoffs = new Map();
      let cursor;
      do {
        let query = db.collection('servicePlans').where('active', '==', true).where('nextServiceDate', '<=', horizon).orderBy('nextServiceDate').limit(200);
        if (cursor) query = query.startAfter(cursor);
        const snap = await query.get();
        for (const plan of snap.docs) {
          if (visited.has(plan.id)) continue;
          visited.add(plan.id);
          const calendar = plan.get('recurrence')?.version === 1;
          try {
            let cutoff = legacyToday;
            if (calendar) {
              const companyId = plan.get('companyId') || '';
              if (!companyCutoffs.has(companyId)) {
                const company = companyId ? await db.doc(`companies/${documentId(companyId, 'company')}`).get() : null;
                const end = calendarDate(todayInZone(company?.get('timeZone'))); end.setUTCDate(end.getUTCDate() + 14);
                companyCutoffs.set(companyId, end.toISOString().slice(0, 10));
              }
              cutoff = companyCutoffs.get(companyId);
            }
            let date = plan.get('nextServiceDate');
            for (let count = 0; count < (calendar ? 32 : 1) && date <= cutoff; count++) {
              const outcome = await generateVisit(db, plan.id, date, undefined, { scheduling });
              if (outcome.skipped || !outcome.nextServiceDate || outcome.nextServiceDate <= date) break;
              date = outcome.nextServiceDate;
            }
          }
          catch (error) { console.error('Recurring visit failed', { planId: plan.id, code: error.code || 'unknown' }); }
        }
        cursor = snap.size === 200 ? snap.docs.at(-1) : null;
      } while (cursor);
    },
  };
}
module.exports = { nextVisit, generateVisit, recurringHandlers, buildInitialPlan, assignmentSettings, planDuration, todayInZone };
