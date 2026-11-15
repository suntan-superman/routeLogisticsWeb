// Disposable local fixtures only. This suite must never use production Firestore.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { schedulingHandlers } = require('../functions/scheduling');
const { normalizeRecurrence } = require('../functions/recurrenceRules');
const { hash } = require('../functions/security');
let app, db, sequence = 0;
const paths = new Set(), fixtures = [];
const set = (path, data) => { paths.add(path); return db.doc(path).set(data); };
const get = async path => (await db.doc(path).get()).data();
before(() => {
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'scheduling-tests'); db = getFirestore(app);
});
after(async () => {
  if (!db) return;
  for (const f of fixtures) {
    for (const collection of ['jobs', 'servicePlans', 'rlScheduleLocks']) {
      const rows = await db.collection(collection).where(f.solo ? 'userId' : 'companyId', '==', f.solo ? f.uid : f.id).get();
      for (const row of rows.docs) await row.ref.delete();
    }
    for (const uid of [f.uid, `${f.id}-manager-uid`, `${f.id}-tech-uid`, `${f.id}-tech2-uid`]) await db.doc(`rlRateLimits/${hash(`schedule-check:${uid}`)}`).delete();
  }
  for (const path of paths) await db.doc(path).delete();
  await deleteApp(app);
});
async function fixture({ solo = false } = {}) {
  const id = `schedule-${process.pid}-${++sequence}`, uid = `${id}-owner`, tech = `${id}-tech`, tech2 = `${id}-tech2`, manager = `${id}-manager`;
  const scope = { uid, companyId: solo ? null : id, role: 'owner', solo };
  const f = { id, uid, tech, tech2, manager, solo, scope, api: schedulingHandlers(db) }; fixtures.push(f);
  await set(`users/${uid}`, { name: 'Synthetic owner', ...(solo ? {} : { rlCompanyId: id }) });
  if (!solo) {
    await set(`companies/${id}`, { ownerId: uid, name: 'Synthetic scheduling company', timeZone: 'America/Los_Angeles', isActive: true });
    for (const [memberId, role, name] of [[tech, 'technician', 'A Technician'], [tech2, 'technician', 'B Technician'], [manager, 'manager', 'C Manager']]) {
      await set(`teamMembers/${memberId}`, { companyId: id, uid: `${memberId}-uid`, role, status: 'active', name });
      await set(`users/${memberId}-uid`, { name, rlCompanyId: id });
    }
  }
  f.request = (data, role = 'owner') => ({ auth: { uid: role === 'owner' ? uid : `${id}-${role}-uid`, token: { email: 'synthetic@example.test', email_verified: true, ...(solo ? {} : { companyId: id, role: ['tech', 'tech2'].includes(role) ? 'technician' : role, ...(role !== 'owner' ? { membershipId: `${id}-${role}` } : {}) }) } }, data });
  f.job = patch => ({ userId: uid, ...(solo ? {} : { companyId: id }), assignedTo: solo ? uid : tech, date: '2030-01-03', time: '09:00', estimatedDuration: 1, status: 'scheduled', ...patch });
  f.book = async (id, patch = {}, options = {}) => {
    const ref = db.doc(`jobs/${id}`); paths.add(ref.path);
    return db.runTransaction(async tx => {
      const existing = await tx.get(ref), before = existing.data() || {}, next = { ...f.job(), ...before, ...patch };
      const prepared = await f.api.prepare(tx, scope, next, { before, jobId: id, ...options });
      f.api.commit(tx, prepared); tx.set(ref, { ...next, assignedTo: prepared.assignedTo || null }); return prepared;
    });
  };
  f.plan = async (suffix, patch = {}) => {
    const planId = `${id}-${suffix}`;
    await set(`servicePlans/${planId}`, { userId: uid, ...(solo ? {} : { companyId: id }), active: true, customerId: `${id}-customer`, preferredTechnicianId: solo ? uid : tech, nextServiceDate: '2030-01-03', time: '09:00', estimatedDuration: 1, frequencyDays: 7, recurrence: normalizeRecurrence({ frequency: 'weekly', weekday: 4 }, '2030-01-03'), ...patch });
    return planId;
  };
  return f;
}

test('roster offers only active technicians and owner, omitting managers, deleted and ambiguous accounts', async () => {
  const f = await fixture(); await set(`rlAccountDeletions/${f.tech2}-uid`, { status: 'deleted' });
  const result = await f.api.handle(f.request({ action: 'roster', companyId: f.id }));
  assert.deepEqual(new Set(result.technicians.map(person => person.id)), new Set([f.tech, f.uid]));
  assert.equal(result.timeZone, 'America/Los_Angeles'); assert.deepEqual(result.workWindow.days, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(result.technicians.some(person => Object.hasOwn(person, 'uid')), false);
});

test('technicians, unauthenticated users and another tenant cannot query company availability', async () => {
  const f = await fixture();
  await assert.rejects(f.api.handle({ data: { action: 'roster' } }), { code: 'unauthenticated' });
  await assert.rejects(f.api.handle(f.request({ action: 'roster' }, 'tech')), { code: 'permission-denied' });
  await assert.rejects(f.api.handle(f.request({ action: 'roster', companyId: 'foreign' })), { code: 'permission-denied' });
  await set(`jobs/${f.id}-foreign`, f.job({ companyId: 'foreign' }));
  await assert.rejects(f.api.handle(f.request({ ...f.job(), memberId: f.tech, jobId: `${f.id}-foreign` })), { code: 'permission-denied' });
});

test('calendar checks detect actual overlap, ignore terminal work and allow exact adjacent appointments', async () => {
  const f = await fixture(); await set(`jobs/${f.id}-busy`, f.job({ customerName: 'PRIVATE CUSTOMER', totalCost: 999, address: 'PRIVATE ADDRESS' }));
  await set(`jobs/${f.id}-cancelled`, f.job({ status: 'cancelled', time: '10:00' }));
  const conflict = await f.api.handle(f.request({ memberId: f.tech, date: '2030-01-03', time: '09:30', estimatedDuration: 1 }));
  assert.equal(conflict.available, false); assert.equal(conflict.conflicts.length, 1); assert.equal(conflict.alternatives[0].time, '10:00');
  assert.equal(JSON.stringify(conflict).includes('PRIVATE'), false); assert.equal(JSON.stringify(conflict).includes('999'), false);
  const adjacent = await f.api.handle(f.request({ memberId: f.tech, date: '2030-01-03', time: '10:00', estimatedDuration: 1 }));
  assert.equal(adjacent.available, true);
});

test('overnight duration and legacy member UID assignments still reserve the same technician', async () => {
  const f = await fixture(); await set(`teamMembers/${f.id}-legacy`, { companyId: f.id, uid: `${f.tech}-uid`, role: 'technician', status: 'inactive' });
  await set(`jobs/${f.id}-overnight`, f.job({ assignedTo: `${f.id}-legacy`, time: '23:30', estimatedDuration: 2 }));
  const result = await f.api.handle(f.request({ memberId: `${f.tech}-uid`, date: '2030-01-04', time: '00:30', estimatedDuration: 0.5 }));
  assert.equal(result.available, false); assert.equal(result.conflicts[0].endTime, '01:30'); assert.equal(result.conflicts[0].endDate, '2030-01-04');
});

test('edited job exclusion is tenant checked and does not conceal another overlapping job', async () => {
  const f = await fixture(), jobId = `${f.id}-editing`; await set(`jobs/${jobId}`, f.job());
  assert.equal((await f.api.handle(f.request({ memberId: f.tech, date: '2030-01-03', time: '09:00', jobId }))).available, true);
  await set(`jobs/${f.id}-second`, f.job());
  assert.equal((await f.api.handle(f.request({ memberId: f.tech, date: '2030-01-03', time: '09:00', jobId }))).available, false);
});

test('inactive, cross-tenant and newly selected managers cannot be assigned; existing active manager work is retained', async () => {
  const f = await fixture(); await db.doc(`teamMembers/${f.tech}`).update({ status: 'inactive' });
  const inactive = await f.api.handle(f.request({ memberId: f.tech, date: '2030-01-03', time: '09:00' })); assert.equal(inactive.available, false); assert.match(inactive.reason, /no longer active/);
  await assert.rejects(f.book(`${f.id}-new-manager`, { assignedTo: f.manager }), { code: 'failed-precondition' });
  const old = `${f.id}-old-manager`; await set(`jobs/${old}`, f.job({ assignedTo: f.manager }));
  assert.equal((await f.book(old, { time: '10:00' })).assignedTo, f.manager);
  await set(`teamMembers/${f.id}-foreign-tech`, { uid: 'other-account', companyId: 'other-company', status: 'active', role: 'technician' });
  await assert.rejects(f.book(`${f.id}-foreign-booking`, { assignedTo: `${f.id}-foreign-tech` }), { code: 'failed-precondition' });
});

test('concurrent saves using membership and UID aliases cannot double-book one technician', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.book(`${f.id}-race-one`), f.book(`${f.id}-race-two`, { assignedTo: `${f.tech}-uid` })]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  const rejected = results.find(row => row.status === 'rejected'); assert.equal(rejected.reason.code, 'failed-precondition'); assert.equal(rejected.reason.details.scheduling.available, false); assert.ok(rejected.reason.details.scheduling.alternatives.length);
  assert.equal((await db.collection('jobs').where('companyId', '==', f.id).get()).size, 1);
});

test('completion, deletion and unassignment release locks without revalidating historical malformed times', async () => {
  const f = await fixture(), id = `${f.id}-history`; await set(`jobs/${id}`, f.job({ time: 'unknown', estimatedDuration: 'unknown' }));
  assert.equal((await f.book(id, { notes: 'Notes only' })).skipped, true);
  await f.book(id, { status: 'completed' });
  assert.equal((await f.book(`${f.id}-replacement`)).available, true);
  await db.runTransaction(async tx => { const snap = await tx.get(db.doc(`jobs/${f.id}-replacement`)); const prepared = await f.api.prepare(tx, f.scope, null, { before: snap.data(), jobId: snap.id }); f.api.commit(tx, prepared); tx.delete(snap.ref); });
  assert.equal((await f.book(`${f.id}-after-delete`)).available, true);
  await f.book(`${f.id}-after-delete`, { assignedTo: null });
  assert.equal((await f.book(`${f.id}-after-unassign`)).available, true);
});

test('current actor access is rechecked inside the save transaction', async () => {
  const f = await fixture(), scope = { uid: `${f.manager}-uid`, companyId: f.id, memberId: f.manager, role: 'manager' };
  await db.doc(`teamMembers/${f.manager}`).update({ status: 'removed' });
  await assert.rejects(db.runTransaction(tx => f.api.prepare(tx, scope, f.job(), { jobId: `${f.id}-unauthorized` })), { code: 'permission-denied' });
});

test('completed-job notes remain editable but reassignment still validates technician identity without reserving busy calendar time', async () => {
  const f = await fixture(), id = `${f.id}-completed`, busyId = `${f.id}-active-work`;
  await set(`jobs/${id}`, f.job({ status: 'completed', time: 'unknown', estimatedDuration: 'unknown' }));
  assert.equal((await f.book(id, { notes: 'Preserve and correct completion history' })).skipped, true);
  const before = await get(`jobs/${id}`);
  await set(`teamMembers/${f.id}-inactive`, { companyId: f.id, uid: `${f.id}-inactive-uid`, role: 'technician', status: 'removed' });
  await set(`teamMembers/${f.id}-foreign`, { companyId: 'foreign-company', uid: `${f.id}-foreign-uid`, role: 'technician', status: 'active' });
  for (const assignedTo of [`${f.id}-inactive`, `${f.id}-foreign`]) {
    await assert.rejects(f.book(id, { assignedTo }), { code: 'failed-precondition' });
    assert.deepEqual(await get(`jobs/${id}`), before);
  }
  await set(`jobs/${busyId}`, f.job({ assignedTo: f.tech2 }));
  const assigned = await f.book(id, { assignedTo: f.tech2 });
  assert.equal(assigned.assignedTo, f.tech2); assert.equal(assigned.assignedToUid, `${f.tech2}-uid`); assert.equal(assigned.assignedToName, 'B Technician');
  assert.equal((await get(`jobs/${id}`)).status, 'completed');
  const occupied = await f.api.handle(f.request({ memberId: f.tech2, date: '2030-01-03', time: '09:00' }));
  assert.deepEqual(occupied.conflicts.map(row => row.jobId), [busyId]);
  assert.equal((await f.api.handle(f.request({ memberId: f.tech2, date: '2030-01-03', time: '10:00' }))).available, true);
});

test('solo owners can check and reserve themselves but cannot select a foreign identity or retain solo access after joining', async () => {
  const f = await fixture({ solo: true });
  const roster = await f.api.handle(f.request({ action: 'roster', companyId: null })); assert.equal(roster.technicians[0].id, f.uid);
  await f.book(`${f.id}-own-work`); await assert.rejects(f.book(`${f.id}-foreign`, { assignedTo: 'foreign' }), { code: 'failed-precondition' });
  await db.doc(`users/${f.uid}`).update({ rlCompanyId: 'joined-company' });
  await assert.rejects(db.runTransaction(tx => f.api.prepare(tx, f.scope, f.job({ time: '11:00' }))), { code: 'permission-denied' });
});

test('future recurring Thursday reservations block bookings before jobs are materialized', async () => {
  const f = await fixture(), planId = await f.plan('weekly');
  const result = await f.api.handle(f.request({ memberId: f.tech, date: '2030-01-10', time: '09:00', estimatedDuration: 1 }));
  assert.equal(result.available, false); assert.equal(result.conflicts[0].kind, 'recurring'); assert.equal(result.conflicts[0].jobId, `plan:${planId}:2030-01-10`);
  await assert.rejects(f.book(`${f.id}-clashing-visit`, { date: '2030-01-10' }), { code: 'failed-precondition' });
  assert.equal((await f.api.handle(f.request({ memberId: f.tech, date: '2030-01-11', time: '09:00' }))).available, true);
});

test('plan-edit previews exclude only a tenant-authorized own plan and reject foreign or unrelated exclusions', async () => {
  for (const solo of [false, true]) {
    const f = await fixture({ solo }), planId = await f.plan('editing'), memberId = solo ? f.uid : f.tech;
    const data = { memberId, date: '2030-01-10', time: '09:00', estimatedDuration: 1 };
    assert.equal((await f.api.handle(f.request(data))).available, false);
    assert.equal((await f.api.handle(f.request({ ...data, servicePlanId: planId }))).available, true);
    await set(`servicePlans/${f.id}-foreign-plan`, { userId: 'foreign-owner', companyId: 'foreign-company', active: true });
    await assert.rejects(f.api.handle(f.request({ ...data, servicePlanId: `${f.id}-foreign-plan` })), { code: 'permission-denied' });
    await set(`jobs/${f.id}-unrelated-job`, f.job({ date: '2030-01-10', servicePlanId: 'a-different-plan' }));
    await assert.rejects(f.api.handle(f.request({ ...data, jobId: `${f.id}-unrelated-job`, servicePlanId: planId })), { code: 'permission-denied' });
  }
});

test('legacy day-frequency reservations work and unassigned or inactive plans do not occupy a technician', async () => {
  const f = await fixture(); await f.plan('legacy', { recurrence: null, frequencyDays: 30 });
  assert.equal((await f.api.handle(f.request({ memberId: f.tech, date: '2030-02-02', time: '09:00' }))).available, false);
  await f.plan('unassigned', { preferredTechnicianId: null, nextServiceDate: '2030-01-04', recurrence: null });
  await f.plan('inactive', { active: false, nextServiceDate: '2030-01-04', recurrence: null });
  assert.equal((await f.api.handle(f.request({ memberId: f.tech, date: '2030-01-04', time: '09:00' }))).available, true);
});

test('generation excludes only its own occurrence and materialized reservations are not duplicated', async () => {
  const f = await fixture(), planId = await f.plan('own');
  const own = await db.runTransaction(async tx => {
    const selected = await f.api.choose(tx, f.scope, f.job({ servicePlanId: planId, servicePlanDate: '2030-01-03' }), { preferredTechnicianId: f.tech, jobId: `${f.id}-generated`, servicePlanId: planId, occurrenceDate: '2030-01-03' });
    f.api.commit(tx, selected); tx.set(db.doc(`jobs/${f.id}-generated`), f.job({ assignedTo: selected.assignedTo, servicePlanId: planId, servicePlanDate: '2030-01-03' })); return selected;
  });
  assert.equal(own.assignedTo, f.tech);
  const current = await f.api.handle(f.request({ memberId: f.tech, date: '2030-01-03', time: '09:00' })); assert.equal(current.conflicts.length, 1); assert.equal(current.conflicts[0].kind, undefined);
  await assert.rejects(f.book(`${f.id}-generated`, { date: '2030-01-10' }), { code: 'failed-precondition' });
});

test('preferred technician departures leave reviewable work or explicitly reassign another technician, never the owner by default', async () => {
  const f = await fixture(); await db.doc(`teamMembers/${f.tech}`).update({ status: 'removed' });
  const choose = fallback => db.runTransaction(async tx => {
    const chosen = await f.api.choose(tx, f.scope, f.job(), { preferredTechnicianId: f.tech, assignmentFallback: fallback, jobId: `${f.id}-future` }); f.api.commit(tx, chosen); return chosen;
  });
  const unassigned = await choose('unassigned'); assert.equal(unassigned.assignedTo, null); assert.equal(unassigned.assignmentNeedsAttention, true); assert.equal(unassigned.memberUnavailable, true);
  const automatic = await choose('auto'); assert.equal(automatic.assignedTo, f.tech2); assert.equal(automatic.assignmentNeedsAttention, false);
  await db.doc(`teamMembers/${f.tech2}`).update({ status: 'removed' });
  assert.equal((await choose('auto')).assignedTo, null);
});

test('busy preferred technicians use only the explicitly chosen fallback and expose no other customer details', async () => {
  const f = await fixture(); await set(`jobs/${f.id}-occupied`, f.job());
  const result = await db.runTransaction(tx => f.api.choose(tx, f.scope, f.job(), { preferredTechnicianId: f.tech, assignmentFallback: 'unassigned' }));
  assert.equal(result.assignedTo, null); assert.equal(result.assignmentNeedsAttention, true);
  const auto = await db.runTransaction(tx => f.api.choose(tx, f.scope, f.job(), { preferredTechnicianId: f.tech, assignmentFallback: 'auto' }));
  assert.equal(auto.assignedTo, f.tech2);
});

test('force reserves unchanged plan slots so recurrence-rule edits participate in UID locking', async () => {
  const f = await fixture(), before = f.job();
  const result = await db.runTransaction(async tx => { const prepared = await f.api.prepare(tx, f.scope, before, { before, force: true, excludeServicePlanId: `${f.id}-plan` }); f.api.commit(tx, prepared); return prepared; });
  assert.equal(result.skipped, undefined); assert.equal(result.locks.length, 1);
  assert.ok((await db.collection('rlScheduleLocks').where('companyId', '==', f.id).get()).size);
});
