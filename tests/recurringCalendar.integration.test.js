// Only synthetic local Firestore fixtures; no provider calls or production writes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { recurringHandlers, generateVisit, todayInZone } = require('../functions/recurring');
const { normalizeRecurrence, calendarDate } = require('../functions/recurrenceRules');
const { schedulingHandlers } = require('../functions/scheduling');
const { hash } = require('../functions/security');
let app, db, sequence = 0;
const fixtures = [];
const DATE = '2030-01-03';
before(() => {
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'calendar-recurrence-tests'); db = getFirestore(app);
});
after(async () => {
  for (const f of fixtures) {
    for (const collection of ['jobs', 'servicePlans', 'customers', 'teamMembers', 'rlScheduleLocks', 'rlAudit']) {
      const rows = await db.collection(collection).where('companyId', '==', f.id).get();
      for (const row of rows.docs) await row.ref.delete();
    }
    for (const actor of [f.owner, f.tech1, f.tech2, f.manager]) {
      await db.doc(`users/${actor}`).delete();
      for (const action of ['service-plan-manage', 'generate-job']) await db.doc(`rlRateLimits/${hash(`${action}:${actor}`)}`).delete();
    }
    await db.doc(`companies/${f.id}`).delete();
  }
  await deleteApp(app);
});
async function fixture() {
  const id = `calendar-${process.pid}-${++sequence}`, owner = `${id}-owner`, tech1 = `${id}-tech1`, tech2 = `${id}-tech2`, manager = `${id}-manager`, customer = `${id}-customer`;
  const f = { id, owner, tech1, tech2, manager, customer }; fixtures.push(f);
  await db.doc(`companies/${id}`).set({ ownerId: owner, name: 'Synthetic recurrence company', isActive: true, timeZone: 'America/Los_Angeles' });
  await db.doc(`users/${owner}`).set({ name: 'ZZZ owner', rlCompanyId: id });
  for (const [uid, role, name] of [[tech1, 'technician', 'Preferred technician'], [tech2, 'technician', 'Available technician'], [manager, 'manager', 'Manager']]) await db.doc(`teamMembers/${uid}`).set({ uid, role, name, companyId: id, status: 'active' });
  await db.doc(`customers/${customer}`).set({ companyId: id, userId: owner, name: 'Synthetic recurring customer', isActive: true, notes: 'Preserve customer history' });
  f.request = (data, role = 'owner') => ({ data, auth: { uid: role === 'owner' ? owner : role === 'manager' ? manager : tech1, token: { email_verified: true, email: `${id}-${role}@example.test`, companyId: id, role, ...(role !== 'owner' ? { membershipId: role === 'manager' ? manager : tech1 } : {}) } } });
  f.plan = (patch = {}) => ({ companyId: id, userId: owner, customerId: customer, active: true, nextServiceDate: DATE, recurrence: normalizeRecurrence({ frequency: 'weekly' }, DATE), frequencyDays: 7, time: '09:00', estimatedDuration: 1, price: 95, preferredTechnicianId: tech1, assignmentFallback: 'unassigned', ...patch });
  f.save = async (suffix, patch) => { const ref = db.doc(`servicePlans/${id}-${suffix}`); await ref.set(f.plan(patch)); return ref; };
  return f;
}
const get = async path => (await db.doc(path).get()).data();
const plusDays = (date, amount) => { const parsed = calendarDate(date); parsed.setUTCDate(parsed.getUTCDate() + amount); return parsed.toISOString().slice(0, 10); };

test('concurrent recurring generation creates one preferred-technician visit and advances its calendar once', async () => {
  const f = await fixture(), plan = await f.save('preferred'), customerBefore = await get(`customers/${f.customer}`);
  const api = recurringHandlers(db), request = f.request({ planId: plan.id, expectedDate: DATE });
  const results = await Promise.all([api.generateServicePlanJob(request), api.generateServicePlanJob(request)]);
  assert.ok(results.some(row => row.jobId));
  const jobs = await db.collection('jobs').where('servicePlanId', '==', plan.id).get(); assert.equal(jobs.size, 1);
  const job = jobs.docs[0].data();
  assert.equal(job.assignedTo, f.tech1); assert.equal(job.estimatedDuration, 1); assert.equal(job.servicePlanDate, DATE); assert.equal(job.assignmentNeedsAttention, false);
  assert.equal((await plan.get()).get('nextServiceDate'), '2030-01-10'); assert.deepEqual(await get(`customers/${f.customer}`), customerBefore);
});

test('busy preferred visits remain on their appointment date for dispatcher review unless an automatic fallback was explicitly selected', async () => {
  const f = await fixture();
  await db.doc(`jobs/${f.id}-busy`).set({ companyId: f.id, userId: f.owner, customerId: f.customer, date: DATE, time: '08:30', estimatedDuration: 2, assignedTo: f.tech1, status: 'scheduled' });
  const reviewPlan = await f.save('review'), reviewed = await generateVisit(db, reviewPlan.id, DATE), review = await get(`jobs/${reviewed.jobId}`);
  assert.equal(review.date, DATE); assert.equal(review.time, '09:00'); assert.equal(review.assignedTo, null); assert.equal(review.assignmentNeedsAttention, true); assert.match(review.assignmentReview, /Dispatcher|assignment/i);
  const autoPlan = await f.save('auto', { assignmentFallback: 'auto' }), selected = await generateVisit(db, autoPlan.id, DATE), auto = await get(`jobs/${selected.jobId}`);
  assert.equal(auto.assignedTo, f.tech2); assert.equal(auto.date, DATE); assert.equal(auto.assignmentNeedsAttention, false);
  assert.equal((await autoPlan.get()).get('preferredTechnicianId'), f.tech1);
});

test('departed technicians cannot inherit generated visits and current active replacements are used only under the stored policy', async () => {
  const f = await fixture(); await db.doc(`teamMembers/${f.tech1}`).update({ status: 'removed' });
  const reviewPlan = await f.save('departed-review'), reviewed = await generateVisit(db, reviewPlan.id, DATE), review = await get(`jobs/${reviewed.jobId}`);
  assert.equal(review.assignedTo, null); assert.equal(review.assignmentNeedsAttention, true); assert.match(review.assignmentReview, /not eligible.*field assignments|no longer active/i);
  const autoPlan = await f.save('departed-auto', { assignmentFallback: 'auto' }), generated = await generateVisit(db, autoPlan.id, DATE);
  assert.equal((await get(`jobs/${generated.jobId}`)).assignedTo, f.tech2);
  const original = (await reviewPlan.get()).data();
  await recurringHandlers(db).manageServicePlan(f.request({ action: 'update', id: reviewPlan.id, plan: { notes: 'Keep the plan history while arranging a replacement' } }));
  assert.equal((await reviewPlan.get()).get('preferredTechnicianId'), original.preferredTechnicianId);
});

test('calendar plan changes serialize reservations and recheck current scheduling access even for notes-only updates', async () => {
  const f = await fixture(), api = recurringHandlers(db), plan = { customerId: f.customer, nextServiceDate: DATE, time: '09:00', recurrence: { frequency: 'weekly' }, preferredTechnicianId: f.tech1, estimatedDuration: 1 };
  const saved = await api.manageServicePlan(f.request({ action: 'create', plan }));
  const lock = db.doc(`rlScheduleLocks/${hash(`company:${f.id}:${f.tech1}`)}`), revision = (await lock.get()).get('revision'); assert.ok(revision >= 1);
  await api.manageServicePlan(f.request({ action: 'update', id: saved.id, plan: { recurrence: { frequency: 'monthly' } } }));
  assert.ok((await lock.get()).get('revision') > revision);
  const record = await get(`servicePlans/${saved.id}`);
  const real = schedulingHandlers(db), revoked = recurringHandlers(db, { scheduling: { ...real, prepare: async (...args) => { await db.doc(`teamMembers/${f.manager}`).update({ status: 'removed' }); return real.prepare(...args); } } });
  await assert.rejects(revoked.manageServicePlan(f.request({ action: 'update', id: saved.id, plan: { notes: 'Unauthorized new note' } }, 'manager')), { code: 'permission-denied' });
  assert.deepEqual(await get(`servicePlans/${saved.id}`), record);
});

test('technicians and cross-tenant preferred members cannot create or mutate recurring plans', async () => {
  const f = await fixture(), foreign = await fixture(), api = recurringHandlers(db), plan = { customerId: f.customer, nextServiceDate: DATE, recurrence: { frequency: 'weekly' }, preferredTechnicianId: foreign.tech1 };
  await assert.rejects(api.manageServicePlan(f.request({ action: 'create', plan })), { code: 'failed-precondition' });
  await assert.rejects(api.manageServicePlan(f.request({ action: 'create', plan: { ...plan, preferredTechnicianId: f.tech1 } }, 'technician')), { code: 'permission-denied' });
  const saved = await f.save('private');
  await assert.rejects(api.manageServicePlan(foreign.request({ action: 'update', id: saved.id, plan: { notes: 'Wrong tenant' } })), { code: 'permission-denied' });
  assert.equal((await db.collection('servicePlans').where('companyId', '==', foreign.id).get()).size, 0);
});

test('calendar generation looks fourteen days ahead while legacy day-count plans retain due-day behavior', async () => {
  const f = await fixture(), first = plusDays(todayInZone(), 1), legacyFirst = plusDays(new Date().toISOString().slice(0, 10), 1);
  const calendar = await f.save('lookahead', { nextServiceDate: first, recurrence: normalizeRecurrence({ frequency: 'weekly' }, first) });
  const legacy = await f.save('legacy-future', { recurrence: null, nextServiceDate: legacyFirst, frequencyDays: 30, time: '15:00' });
  await recurringHandlers(db).generateRecurringJobs();
  const jobs = await db.collection('jobs').where('servicePlanId', '==', calendar.id).get();
  assert.deepEqual(jobs.docs.map(row => row.get('date')).sort(), [first, plusDays(first, 7)]);
  assert.equal((await calendar.get()).get('nextServiceDate'), plusDays(first, 14));
  assert.equal((await db.collection('jobs').where('servicePlanId', '==', legacy.id).get()).size, 0);
  assert.equal((await legacy.get()).get('nextServiceDate'), legacyFirst);
});

test('recurring plans can skip once, pause through a period, pause indefinitely and resume without deleting history', async () => {
  const f = await fixture(), api = recurringHandlers(db);
  const once = await f.save('pause-once');
  const skipped = await api.manageServicePlan(f.request({ action: 'pause', id: once.id, pause: { mode: 'once', reason: 'Customer away' } }));
  assert.equal(skipped.active, true); assert.equal(skipped.nextServiceDate, '2030-01-10');
  let saved = await once.get(); assert.equal(saved.get('active'), true); assert.equal(saved.get('lastPause.mode'), 'once'); assert.equal(saved.get('lastPause.fromDate'), DATE); assert.equal(saved.get('pauseHistory').length, 1);
  assert.equal((await db.collection('jobs').where('servicePlanId', '==', once.id).get()).size, 0);

  const period = await f.save('pause-period', { preferredTechnicianId: f.tech2 });
  const held = await api.manageServicePlan(f.request({ action: 'pause', id: period.id, pause: { mode: 'through', throughDate: '2030-01-17', reason: 'Seasonal hold' } }));
  assert.equal(held.nextServiceDate, '2030-01-24'); assert.equal((await period.get()).get('active'), true);

  const indefinite = await f.save('pause-indefinite', { preferredTechnicianId: null });
  const paused = await api.manageServicePlan(f.request({ action: 'pause', id: indefinite.id, pause: { mode: 'indefinite' } }));
  assert.equal(paused.active, false); assert.equal((await indefinite.get()).get('pauseState.mode'), 'indefinite');
  await assert.rejects(generateVisit(db, indefinite.id, DATE), { code: 'failed-precondition' });
  const resumed = await api.manageServicePlan(f.request({ action: 'resume', id: indefinite.id }));
  assert.equal(resumed.active, true); saved = await indefinite.get(); assert.equal(saved.get('active'), true); assert.equal(saved.get('pauseState'), null); assert.equal(saved.get('nextServiceDate'), DATE);
  const audits = await db.collection('rlAudit').where('companyId', '==', f.id).get();
  assert.ok(audits.docs.some(row => row.get('action') === 'servicePlan.pause')); assert.ok(audits.docs.some(row => row.get('action') === 'servicePlan.resume'));
});

test('recurring pause validates dates, versions, roles and tenant ownership', async () => {
  const f = await fixture(), foreign = await fixture(), api = recurringHandlers(db), plan = await f.save('pause-guard', { updatedAt: '2030-01-01T00:00:00.000Z' });
  await assert.rejects(api.manageServicePlan(f.request({ action: 'pause', id: plan.id, expectedVersion: 'stale', pause: { mode: 'once' } })), { code: 'aborted' });
  await assert.rejects(api.manageServicePlan(f.request({ action: 'pause', id: plan.id, pause: { mode: 'through', throughDate: '2029-12-31' } })), { code: 'invalid-argument' });
  await assert.rejects(api.manageServicePlan(f.request({ action: 'pause', id: plan.id, pause: { mode: 'once' } }, 'technician')), { code: 'permission-denied' });
  await assert.rejects(api.manageServicePlan(foreign.request({ action: 'pause', id: plan.id, pause: { mode: 'once' } })), { code: 'permission-denied' });
  assert.equal((await plan.get()).get('nextServiceDate'), DATE);
});
