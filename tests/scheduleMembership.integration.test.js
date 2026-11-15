// Synthetic local emulator data only. No notifications, provider calls or production records.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { scheduleMembershipHandlers } = require('../functions/scheduleMembership');
const { normalizeRecurrence } = require('../functions/recurrenceRules');
const { hash } = require('../functions/security');
let app, db, sequence = 0;
const fixtures = [], paths = new Set();
const DATE = '2030-01-03';
const set = (path, data) => { paths.add(path); return db.doc(path).set(data); };
const get = async path => (await db.doc(path).get()).data();
before(() => {
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'schedule-membership-tests'); db = getFirestore(app);
});
after(async () => {
  for (const f of fixtures) for (const collection of ['jobs', 'servicePlans', 'rlAudit', 'rlScheduleLocks', 'rlScheduleReconciliations']) {
    const rows = await db.collection(collection).where('companyId', '==', f.id).get();
    for (const row of rows.docs) await row.ref.delete();
  }
  for (const path of paths) await db.doc(path).delete();
  await deleteApp(app);
});
async function fixture() {
  const id = `departure-${process.pid}-${++sequence}`, owner = `${id}-owner`, member = `${id}-old-member`, uid = `${id}-old-account`, first = `${id}-first`, second = `${id}-second`;
  const f = { id, owner, member, uid, first, second }; fixtures.push(f);
  await set(`companies/${id}`, { name: 'Synthetic departure company', ownerId: owner, isActive: true, timeZone: 'America/Los_Angeles' });
  await set(`users/${owner}`, { name: 'Owner', rlCompanyId: id });
  for (const [memberId, accountId, name] of [[member, uid, 'Departing technician'], [first, `${id}-first-account`, 'A Busy Technician'], [second, `${id}-second-account`, 'B Available Technician']]) await set(`teamMembers/${memberId}`, { companyId: id, uid: accountId, name, role: 'technician', status: 'active' });
  f.job = async (suffix, patch = {}) => {
    const path = `jobs/${id}-${suffix}`; await set(path, { companyId: id, userId: owner, customerId: `${id}-customer`, date: DATE, time: '09:00', estimatedDuration: 1, assignedTo: member, assignedToUid: uid, assignedToName: 'Departing technician', status: 'scheduled', notes: 'Keep service details', updatedAt: '2026-11-15T00:00:00Z', ...patch }); return path;
  };
  f.plan = async (suffix, patch = {}) => {
    const path = `servicePlans/${id}-${suffix}`; await set(path, { companyId: id, userId: owner, customerId: `${id}-customer`, active: true, nextServiceDate: '2030-01-10', recurrence: normalizeRecurrence({ frequency: 'weekly' }, DATE), frequencyDays: 7, time: '09:00', estimatedDuration: 1, preferredTechnicianId: member, assignmentFallback: 'unassigned', notes: 'Keep recurring preferences', ...patch }); return path;
  };
  f.event = async (patch = { status: 'removed' }, deleted = false) => {
    const ref = db.doc(`teamMembers/${member}`), before = await ref.get();
    if (deleted) await ref.delete(); else await ref.update(patch);
    return { id: `${id}-event-${deleted ? 'deleted' : 'updated'}`, time: new Date().toISOString(), params: { memberId: member }, data: deleted ? before : { before, after: await ref.get() } };
  };
  return f;
}
const unchangedService = job => Object.fromEntries(['date', 'time', 'estimatedDuration', 'customerId', 'status', 'notes', 'servicePlanId', 'servicePlanDate'].filter(key => job[key] !== undefined).map(key => [key, job[key]]));

test('departures release scheduled future work for review and preserve historical, active-work and foreign records', async () => {
  const f = await fixture(), pending = await f.job('pending'), original = await get(pending), protectedPaths = [];
  for (const [suffix, patch] of [['history', { date: '2020-01-01' }], ['complete', { status: 'completed' }], ['working', { status: 'in-progress' }], ['travelling', { status: 'en-route' }], ['foreign', { companyId: 'foreign-company' }], ['reassigned', { assignedTo: f.first, assignedToUid: `${f.id}-first-account` }]]) protectedPaths.push(await f.job(suffix, patch));
  const before = await Promise.all(protectedPaths.map(get)), event = await f.event(), api = scheduleMembershipHandlers(db);
  const result = await api.updated(event); assert.equal(result.jobsChanged, 1);
  const saved = await get(pending); assert.equal(saved.assignedTo, null); assert.equal(saved.assignedToUid, null); assert.equal(saved.assignmentNeedsAttention, true); assert.deepEqual(unchangedService(saved), unchangedService(original));
  assert.deepEqual(await Promise.all(protectedPaths.map(get)), before);
  assert.equal((await api.updated(event)).duplicate, true); assert.deepEqual(await get(pending), saved);
  const audits = await db.collection('rlAudit').where('companyId', '==', f.id).where('action', '==', 'job.assignment.technicianDeparted').get(); assert.equal(audits.size, 1);
});

test('explicit automatic fallback selects a conflict-free replacement without moving visits or replacing the stored preference', async () => {
  const f = await fixture(), planPath = await f.plan('auto', { assignmentFallback: 'auto' }), planId = planPath.split('/')[1];
  await f.job('busy', { assignedTo: f.first, assignedToUid: `${f.id}-first-account`, time: '08:30', estimatedDuration: 2 });
  const path = await f.job('auto-visit', { servicePlanId: planId, servicePlanDate: DATE }), original = await get(path), event = await f.event();
  await scheduleMembershipHandlers(db).updated(event);
  const job = await get(path); assert.equal(job.assignedTo, f.second); assert.equal(job.assignedToUid, `${f.id}-second-account`); assert.equal(job.assignedToName, 'B Available Technician'); assert.equal(job.assignmentNeedsAttention, false); assert.deepEqual(unchangedService(job), unchangedService(original));
  const plan = await get(planPath); assert.equal(plan.preferredTechnicianId, f.member); assert.equal(plan.assignmentFallback, 'auto'); assert.equal(plan.preferredTechnicianNeedsReview, true);
});

test('an incomplete legacy appointment is released for review instead of guessing a replacement or blocking the whole reconciliation', async () => {
  const f = await fixture(), planPath = await f.plan('incomplete-auto', { assignmentFallback: 'auto' });
  const path = await f.job('invalid-time', { servicePlanId: planPath.split('/')[1], servicePlanDate: DATE, time: 'Unknown time' }), event = await f.event();
  await scheduleMembershipHandlers(db).updated(event);
  const job = await get(path); assert.equal(job.time, 'Unknown time'); assert.equal(job.assignedTo, null); assert.equal(job.assignmentNeedsAttention, true); assert.match(job.assignmentReview, /schedule needs review/);
});

test('plans without materialized visits are flagged and active-role promotions or restored identities preserve access', async () => {
  const f = await fixture(), planPath = await f.plan('no-jobs'), event = await f.event();
  const result = await scheduleMembershipHandlers(db).updated(event); assert.equal(result.plansFlagged, 1); assert.equal(result.jobsChanged, 0); assert.equal((await get(planPath)).preferredTechnicianNeedsReview, true);
  const promoted = await fixture(), protectedJob = await promoted.job('promotion'), original = await get(protectedJob), promotion = await promoted.event({ role: 'manager' });
  assert.equal((await scheduleMembershipHandlers(db).updated(promotion)).ignored, true); assert.deepEqual(await get(protectedJob), original);
  const restored = await fixture(), restoredJob = await restored.job('restored'), before = await get(restoredJob), removed = await restored.event();
  await db.doc(`teamMembers/${restored.member}`).update({ status: 'active' }); await scheduleMembershipHandlers(db).updated(removed); assert.deepEqual(await get(restoredJob), before);
});

test('membership deletion is supported and a reused member ID cannot clear the new person’s assignment', async () => {
  const f = await fixture(), deletedJob = await f.job('deleted'), event = await f.event(undefined, true);
  await scheduleMembershipHandlers(db).deleted(event); assert.equal((await get(deletedJob)).assignedTo, null);
  const reused = await fixture(), legacy = await reused.job('old-person'), newAssignment = await reused.job('new-person', { assignedToUid: `${reused.id}-new-account` }), newBefore = await get(newAssignment);
  const changed = await reused.event({ uid: `${reused.id}-new-account` }); await scheduleMembershipHandlers(db).updated(changed);
  assert.equal((await get(legacy)).assignedTo, null); assert.deepEqual(await get(newAssignment), newBefore);
});

test('an inactive provider or deleted owner never grants an automatic worker authority over jobs', async () => {
  for (const inactive of [false, true]) {
    const f = await fixture(), path = await f.job('provider-skip'), original = await get(path), event = await f.event();
    if (inactive) await db.doc(`companies/${f.id}`).update({ isActive: false }); else await set(`rlAccountDeletions/${f.owner}`, { status: 'deleted' });
    const result = await scheduleMembershipHandlers(db).updated(event); assert.equal(result.skipped, 'provider-inactive'); assert.deepEqual(await get(path), original);
  }
});

test('bounded reconciliation checkpoints continue on retry and never duplicate audits', async () => {
  const f = await fixture(), pathsToChange = [];
  for (let index = 0; index < 4; index++) pathsToChange.push(await f.job(`resume-${index}`));
  const event = await f.event(), api = scheduleMembershipHandlers(db, { maxScan: 2 });
  await assert.rejects(api.updated(event), { code: 'resource-exhausted' });
  const checkpoint = await get(`rlScheduleReconciliations/${hash(event.id)}`); assert.equal(checkpoint.status, 'running'); assert.ok(checkpoint.cursor.id);
  await assert.rejects(api.updated(event), { code: 'resource-exhausted' });
  await api.updated(event); assert.equal((await get(`rlScheduleReconciliations/${hash(event.id)}`)).status, 'complete');
  for (const path of pathsToChange) assert.equal((await get(path)).assignedTo, null);
  assert.equal((await db.collection('rlAudit').where('companyId', '==', f.id).where('action', '==', 'job.assignment.technicianDeparted').get()).size, 4);
});
