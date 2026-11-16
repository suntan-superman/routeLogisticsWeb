// Local synthetic records only. Never run this suite against a live project.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { staffAvailabilityHandlers, availabilityRef } = require('../functions/staffAvailability');
const { schedulingHandlers } = require('../functions/scheduling');
const { workDataHandlers } = require('../functions/workData');
const { locationHandlers } = require('../functions/locations');
const { routeHandlers } = require('../functions/routes');
const { offlineHandler } = require('../functions/offline');
const { recurringHandlers, generateVisit } = require('../functions/recurring');
const { hash } = require('../functions/security');
let app, db, sequence = 0;
const fixtures = [], paths = new Set();
const set = (path, data) => { paths.add(path); return db.doc(path).set(data); };
before(() => {
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'staff-availability-tests'); db = getFirestore(app);
});
after(async () => {
  if (!db) return;
  for (const f of fixtures) {
    for (const name of ['rlStaffAvailability', 'rlAudit', 'rlScheduleLocks', 'rlLocations', 'rlWorkShifts', 'rlWorkShiftEvents', 'rlOperations', 'servicePlans', 'jobs']) {
      const rows = await db.collection(name).where('companyId', '==', f.id).get();
      for (const row of rows.docs) await row.ref.delete();
    }
    for (const role of ['owner', 'manager', 'technician', 'admin']) for (const action of ['staff-availability', 'work-read', 'schedule-check', 'work-shift', 'location-read', 'location', 'offline-job', 'route-read', 'job-manage', 'service-plan-manage', 'generate-job']) await db.doc(`rlRateLimits/${hash(`${action}:${f.uid(role)}`)}`).delete();
  }
  for (const path of paths) await db.doc(path).delete();
  await deleteApp(app);
});
async function fixture() {
  const id = `availability-${process.pid}-${++sequence}`;
  let clock = Date.parse('2030-01-03T18:00:00.000Z');
  const f = { id, uid: role => `${id}-${role}-uid`, member: role => `${id}-${role}`, time: () => clock, advance: ms => { clock += ms; } };
  fixtures.push(f);
  await set(`companies/${id}`, { ownerId: f.uid('owner'), name: 'Synthetic availability company', timeZone: 'America/Los_Angeles', isActive: true });
  for (const role of ['owner', 'manager', 'technician', 'admin']) {
    await set(`users/${f.uid(role)}`, { rlCompanyId: id, name: `Synthetic ${role}` });
    if (role !== 'owner') await set(`teamMembers/${f.member(role)}`, { companyId: id, uid: f.uid(role), role, name: `Synthetic ${role}`, status: 'active' });
  }
  f.request = (data, role = 'owner') => ({ data, auth: { uid: f.uid(role), token: { email: `${role}@example.test`, email_verified: true, companyId: id, role, ...(role === 'owner' ? {} : { membershipId: f.member(role) }) } } });
  f.api = staffAvailabilityHandlers(db, { now: f.time }); f.tracking = locationHandlers(db, { now: f.time }); f.scheduling = schedulingHandlers(db); f.work = workDataHandlers(db);
  f.change = (patch = {}, role = 'owner') => f.api(f.request({ memberId: f.member('technician'), action: 'set', status: 'unavailable', reason: 'sick', startsAt: new Date(clock).toISOString(), endsAt: new Date(clock + 7200000).toISOString(), expectedRevision: 0, ...patch }, role));
  f.job = async (suffix, assignedTo, patch = {}) => {
    const jobId = `${id}-${suffix}`;
    await set(`jobs/${jobId}`, { companyId: id, userId: f.uid('owner'), assignedTo, date: '2030-01-03', time: '10:00', estimatedDuration: 1, status: 'scheduled', updatedAt: '2030-01-03T17:00:00.000Z', serviceType: 'Synthetic visit', ...patch });
    return jobId;
  };
  return f;
}
test('owner and manager can mark active company staff unavailable without editing memberships or jobs', async () => {
  const f = await fixture(), jobId = await f.job('existing', f.member('technician'));
  const member = (await db.doc(`teamMembers/${f.member('technician')}`).get()).data(), job = (await db.doc(`jobs/${jobId}`).get()).data();
  const first = await f.change({}, 'manager');
  assert.equal(first.availability.state, 'unavailable'); assert.equal(first.availability.reason, 'sick'); assert.equal(first.availability.revision, 1);
  assert.deepEqual((await db.doc(`teamMembers/${f.member('technician')}`).get()).data(), member); assert.deepEqual((await db.doc(`jobs/${jobId}`).get()).data(), job);
  const owner = await f.change({ memberId: f.uid('owner'), reason: 'vacation' }, 'manager'); assert.equal(owner.memberId, f.uid('owner'));
  assert.equal((await db.collection('rlAudit').where('companyId', '==', f.id).get()).size, 2);
});
test('availability rejects technicians, ordinary admins, portal tokens, unverified users and foreign companies', async () => {
  const f = await fixture(), other = await fixture();
  for (const role of ['technician', 'admin']) await assert.rejects(f.change({}, role), { code: 'permission-denied' });
  await assert.rejects(f.change({ memberId: other.member('technician') }), { code: 'failed-precondition' });
  await assert.rejects(f.change({ companyId: other.id }), { code: 'permission-denied' });
  const data = { action: 'clear', memberId: f.member('technician'), expectedRevision: 0 };
  const request = f.request(data); request.auth.token.email_verified = false; await assert.rejects(f.api(request), { code: 'failed-precondition' });
  request.auth.token.email_verified = true; request.auth.token.portal = true; await assert.rejects(f.api(request), { code: 'unauthenticated' });
  assert.equal((await db.collection('rlStaffAvailability').where('companyId', '==', f.id).get()).size, 0);
});
test('revoked staff and deleted accounts cannot be reactivated by emergency availability', async () => {
  const f = await fixture(); await db.doc(`teamMembers/${f.member('technician')}`).update({ status: 'removed' });
  await assert.rejects(f.change({ status: 'available', reason: 'emergency' }), { code: 'failed-precondition' });
  await db.doc(`teamMembers/${f.member('technician')}`).update({ status: 'active' });
  await set(`rlAccountDeletions/${f.uid('technician')}`, { status: 'pending' });
  await assert.rejects(f.change({ status: 'available', reason: 'emergency' }), { code: 'failed-precondition' });
  await db.doc(`teamMembers/${f.member('manager')}`).update({ status: 'removed' });
  await assert.rejects(f.change({}, 'manager'), { code: 'permission-denied' });
});
test('manager access is rechecked in the availability transaction after the initial request check', async () => {
  const f = await fixture(); let calls = 0;
  const racedDb = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return async (...args) => {
      if (++calls === 2) await db.doc(`teamMembers/${f.member('manager')}`).update({ status: 'removed' });
      return target.runTransaction(...args);
    };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  await assert.rejects(staffAvailabilityHandlers(racedDb, { now: f.time })(f.request({ action: 'clear', memberId: f.member('technician'), expectedRevision: 0 }, 'manager')), { code: 'permission-denied' });
  assert.equal((await availabilityRef(db, f.id, f.uid('technician')).get()).exists, false);
});
test('concurrent changes require the current revision and create one period, one audit and one UID lock update', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.change(), f.change({ reason: 'vacation' })]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1); assert.equal(results.find(row => row.status === 'rejected').reason.code, 'aborted');
  const saved = await availabilityRef(db, f.id, f.uid('technician')).get(); assert.equal(saved.get('periods').length, 1); assert.equal(saved.get('revision'), 1);
  assert.equal((await db.collection('rlAudit').where('companyId', '==', f.id).get()).size, 1);
  assert.equal((await db.doc(`rlScheduleLocks/${hash(`company:${f.id}:${f.uid('technician')}`)}`).get()).get('revision'), 1);
});
test('sick leave blocks assignments and excludes unavailable alternatives without changing existing schedules', async () => {
  const f = await fixture(), id = await f.job('unassigned', null); await f.change();
  const check = await f.scheduling.handle(f.request({ memberId: f.member('technician'), date: '2030-01-03', time: '10:00', estimatedDuration: 1, jobId: id }));
  assert.equal(check.available, false); assert.equal(check.conflicts[0].kind, 'availability'); assert.equal(check.alternatives[0].time, '12:00');
  await assert.rejects(f.work.manageJob(f.request({ action: 'assign', id, memberId: f.member('technician'), expectedVersion: '2030-01-03T17:00:00.000Z' })), { code: 'failed-precondition' });
  assert.equal((await db.doc(`jobs/${id}`).get()).get('assignedTo'), null);
});
test('emergency call-out overrides vacation temporarily and expires back to vacation without starting GPS', async () => {
  const f = await fixture();
  await f.change({ reason: 'vacation', endsAt: new Date(f.time() + 86400000).toISOString() });
  const emergency = await f.change({ status: 'available', reason: 'emergency', expectedRevision: 1, endsAt: new Date(f.time() + 3600000).toISOString() });
  assert.equal(emergency.availability.state, 'available'); assert.equal(emergency.availability.scheduled, 2);
  let listing = await f.tracking.list(f.request({})), person = listing.roster.find(row => row.memberId === f.member('technician'));
  assert.equal(person.onDuty, false); assert.equal(person.availability.state, 'available'); assert.equal(person.location, null);
  assert.equal((await f.scheduling.handle(f.request({ memberId: f.member('technician'), date: '2030-01-03', time: '10:00', estimatedDuration: 1 }))).available, true);
  assert.equal((await f.scheduling.handle(f.request({ memberId: f.member('technician'), date: '2030-01-03', time: '11:00', estimatedDuration: 1 }))).available, false);
  f.advance(3600000); listing = await f.tracking.list(f.request({})); person = listing.roster.find(row => row.memberId === f.member('technician'));
  assert.equal(person.availability.state, 'unavailable'); assert.equal(person.availability.reason, 'vacation'); assert.equal(person.onDuty, false);
});
test('marking current staff unavailable ends their shift and session, while reactivation requires explicit own consent', async () => {
  const f = await fixture(), start = await f.tracking.shift(f.request({ action: 'start', trackingConsent: true }, 'technician'));
  const session = await f.tracking.update(f.request({ action: 'start', shiftId: start.shift.id }, 'technician'));
  await f.tracking.update(f.request({ action: 'position', sessionId: session.sessionId, latitude: 35, longitude: -119, accuracy: 10, capturedAt: new Date(f.time()).toISOString() }, 'technician'));
  assert.equal((await f.change()).shiftStopped, true);
  assert.equal((await f.tracking.shift(f.request({ action: 'status' }, 'technician'))).shift.status, 'off-duty');
  await assert.rejects(f.tracking.shift(f.request({ action: 'start', trackingConsent: true }, 'technician')), { code: 'failed-precondition' });
  const locations = await f.tracking.list(f.request({})); assert.equal(locations.locations.some(row => row.sharing), false);
  await f.change({ action: 'clear', expectedRevision: 1 });
  await assert.rejects(f.tracking.update(f.request({ action: 'start', shiftId: start.shift.id }, 'technician')), { code: 'failed-precondition' });
  assert.equal((await f.tracking.shift(f.request({ action: 'start', trackingConsent: true }, 'technician'))).shift.status, 'on-duty');
});
test('future unavailable periods leave current duty alone then reject positions when their window begins', async () => {
  const f = await fixture(), { shift } = await f.tracking.shift(f.request({ action: 'start', trackingConsent: true }, 'technician'));
  const session = await f.tracking.update(f.request({ action: 'start', shiftId: shift.id }, 'technician'));
  const first = await f.change({ startsAt: new Date(f.time() + 3600000).toISOString(), endsAt: new Date(f.time() + 7200000).toISOString() });
  assert.equal(first.shiftStopped, false); assert.equal(first.availability.active, false); assert.equal(first.availability.scheduled, 1);
  f.advance(3600000);
  await assert.rejects(f.tracking.update(f.request({ action: 'position', sessionId: session.sessionId, latitude: 35, longitude: -119, accuracy: 10, capturedAt: new Date(f.time()).toISOString() }, 'technician')), { code: 'failed-precondition' });
  assert.equal((await f.tracking.list(f.request({}))).roster.find(row => row.memberId === f.member('technician')).onDuty, false);
  assert.equal((await f.tracking.shift(f.request({ action: 'status' }, 'technician'))).shift.endReason, 'supervisor-unavailable');
});
test('working owner and manager have authoritative personal job lists, own routes and existing offline completion', async () => {
  const f = await fixture(), ownerId = await f.job('owner-work', f.uid('owner')), managerId = await f.job('manager-work', f.member('manager'));
  await f.job('other-work', f.member('technician'));
  for (const [role, jobId] of [['owner', ownerId], ['manager', managerId]]) {
    const personal = await f.work.read(f.request({ resource: 'jobs', assignedTo: 'self', date: '2030-01-03' }, role));
    assert.deepEqual(personal.jobs.map(job => job.id), [jobId]);
    const memberId = role === 'owner' ? f.uid(role) : f.member(role), route = await routeHandlers(db).get(f.request({ memberId, date: '2030-01-03' }, role));
    assert.deepEqual(route.stops.map(job => job.id), [jobId]);
    const result = await offlineHandler(db)(f.request({ jobId, operationId: `completion-${jobId}`, patch: { status: 'completed', notes: 'Synthetic field completion', completedAt: new Date(f.time()).toISOString() }, expectedVersion: '2030-01-03T17:00:00.000Z' }, role));
    assert.equal(result.status, 'synced'); assert.equal((await db.doc(`jobs/${jobId}`).get()).get('status'), 'completed');
  }
  await assert.rejects(f.work.read(f.request({ resource: 'jobs', assignedTo: 'self', id: ownerId }, 'manager')), { code: 'permission-denied' });
});
test('personal lists preserve canonical and legacy aliases but reject an assignment UID that belongs to another person', async () => {
  const f = await fixture();
  const canonical = await f.job('canonical', f.member('manager'), { assignedToUid: f.uid('manager') });
  const legacy = await f.job('legacy-uid', f.uid('manager'));
  await f.job('reused-member', f.member('manager'), { assignedToUid: 'another-account' });
  const result = await f.work.read(f.request({ resource: 'jobs', assignedTo: 'self', startDate: '2030-01-03', endDate: '2030-01-04' }, 'manager'));
  assert.deepEqual(new Set(result.jobs.map(job => job.id)), new Set([canonical, legacy]));
  assert.equal(result.jobs.find(job => job.id === canonical).assignedToUid, f.uid('manager'));
  const routing = await routeHandlers(db).team(f.request({})); assert.ok(routing.team.some(member => member.id === f.member('manager')));
  const roster = await f.scheduling.handle(f.request({ action: 'roster' })); assert.ok(roster.technicians.some(member => member.id === f.member('manager'))); assert.equal(roster.technicians.some(member => member.id === f.member('admin')), false);
});
test('verified owner aliases derive personal assignment UID in self responses without rewriting history or unrelated company jobs', async () => {
  const f = await fixture(), alias = `${f.id}-legacy-owner-membership`;
  await set(`teamMembers/${alias}`, { companyId: f.id, uid: f.uid('owner'), role: 'admin', status: 'inactive' });
  const legacy = await f.job('owner-legacy-alias', alias), other = await f.job('another-person', f.member('technician'));
  const personal = await f.work.read(f.request({ resource: 'jobs', assignedTo: 'self', date: '2030-01-03' }));
  assert.deepEqual(personal.jobs.map(job => job.id), [legacy]); assert.equal(personal.jobs[0].assignedToUid, f.uid('owner'));
  const detail = await f.work.read(f.request({ resource: 'jobs', assignedTo: 'self', id: legacy })); assert.equal(detail.job.assignedToUid, f.uid('owner'));
  const company = await f.work.read(f.request({ resource: 'jobs', date: '2030-01-03' }));
  assert.equal(company.jobs.find(job => job.id === legacy).assignedToUid, undefined); assert.equal(company.jobs.find(job => job.id === other).assignedToUid, undefined);
  assert.equal((await db.doc(`jobs/${legacy}`).get()).get('assignedToUid'), undefined);
});
test('legacy job-scoped sharing stops for supervisor unavailability and cannot restart until cleared', async () => {
  const f = await fixture(), jobId = await f.job('legacy-location-job', f.member('technician'), { status: 'in-progress' });
  const legacy = locationHandlers(db), session = await legacy.update(f.request({ action: 'start', jobId }, 'technician'));
  const point = { action: 'position', sessionId: session.sessionId, latitude: 35, longitude: -119, accuracy: 10 };
  assert.equal((await legacy.update(f.request(point, 'technician'))).sharing, true);
  const now = Date.now();
  const change = staffAvailabilityHandlers(db);
  await change(f.request({ memberId: f.member('technician'), action: 'set', status: 'unavailable', reason: 'sick', startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 7200000).toISOString(), expectedRevision: 0 }));
  const location = await db.doc(`rlLocations/${hash(`${f.id}:${f.uid('technician')}`)}`).get(); assert.equal(location.get('sharing'), false);
  await assert.rejects(legacy.update(f.request(point, 'technician')), { code: 'failed-precondition' });
  await assert.rejects(legacy.update(f.request({ action: 'start', jobId }, 'technician')), { code: 'failed-precondition' });
  await change(f.request({ memberId: f.member('technician'), action: 'clear', expectedRevision: 1 }));
  assert.ok((await legacy.update(f.request({ action: 'start', jobId }, 'technician'))).sessionId);
});
test('legacy start rechecks supervisor availability after its initial work check and before writing a session', async () => {
  const f = await fixture(), jobId = await f.job('legacy-race-job', f.member('technician'), { status: 'in-progress' });
  let transactions = 0;
  const racedDb = new Proxy(db, { get(target, key) {
    if (key === 'runTransaction') return async (...args) => {
      if (++transactions === 2) {
        const now = Date.now();
        await staffAvailabilityHandlers(db)(f.request({ memberId: f.member('technician'), action: 'set', status: 'unavailable', reason: 'vacation', startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 7200000).toISOString(), expectedRevision: 0 }));
      }
      return target.runTransaction(...args);
    };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  await assert.rejects(locationHandlers(racedDb).update(f.request({ action: 'start', jobId }, 'technician')), { code: 'failed-precondition' });
  assert.equal((await db.doc(`rlLocations/${hash(`${f.id}:${f.uid('technician')}`)}`).get()).exists, false);
});
test('concurrent unavailable periods and assignments serialize on the UID lock while preserving committed bookings', async () => {
  const f = await fixture(), id = await f.job('availability-race', null);
  const [assignment, availability] = await Promise.allSettled([
    f.work.manageJob(f.request({ action: 'assign', id, memberId: f.member('technician'), expectedVersion: '2030-01-03T17:00:00.000Z' })), f.change(),
  ]);
  assert.equal(availability.status, 'fulfilled');
  const committed = assignment.status === 'fulfilled';
  if (!committed) assert.equal(assignment.reason.code, 'failed-precondition');
  assert.equal((await db.doc(`jobs/${id}`).get()).get('assignedTo'), committed ? f.member('technician') : null);
  assert.equal((await db.doc(`rlScheduleLocks/${hash(`company:${f.id}:${f.uid('technician')}`)}`).get()).get('revision'), committed ? 2 : 1);
  assert.equal((await availabilityRef(db, f.id, f.uid('technician')).get()).get('revision'), 1);
});
test('clearing availability participates in the UID scheduling lock and does not duplicate concurrent assignment', async () => {
  const f = await fixture(), id = await f.job('clear-race', null);
  await f.change({ status: 'available', reason: 'emergency' });
  await Promise.all([f.work.manageJob(f.request({ action: 'assign', id, memberId: f.member('technician'), expectedVersion: '2030-01-03T17:00:00.000Z' })), f.change({ action: 'clear', expectedRevision: 1 })]);
  assert.equal((await db.doc(`rlScheduleLocks/${hash(`company:${f.id}:${f.uid('technician')}`)}`).get()).get('revision'), 3);
  const saved = await availabilityRef(db, f.id, f.uid('technician')).get(); assert.equal(saved.get('revision'), 2); assert.deepEqual(saved.get('periods'), []);
  const audits = await db.collection('rlAudit').where('companyId', '==', f.id).where('action', '==', 'job.assign').get(); assert.equal(audits.size, 1);
});
test('owner and manager can set office-only eligibility independently while preserving periods, membership, current jobs, shifts and GPS consent', async () => {
  const f = await fixture(), jobId = await f.job('current-field-work', f.member('technician'));
  const { shift } = await f.tracking.shift(f.request({ action: 'start', trackingConsent: true }, 'technician'));
  await f.tracking.update(f.request({ action: 'start', shiftId: shift.id }, 'technician'));
  await f.change({ startsAt: new Date(f.time() + 3600000).toISOString(), endsAt: new Date(f.time() + 7200000).toISOString(), reason: 'vacation' });
  const before = (await availabilityRef(db, f.id, f.uid('technician')).get()).data(), memberBefore = (await db.doc(`teamMembers/${f.member('technician')}`).get()).data(), jobBefore = (await db.doc(`jobs/${jobId}`).get()).data();
  const result = await f.api(f.request({ action: 'set-field-work', memberId: f.member('technician'), fieldWorkEnabled: false, expectedRevision: 1 }, 'manager'));
  assert.equal(result.fieldWorkEnabled, false); assert.equal(result.availability.fieldWorkEnabled, false); assert.equal(result.availability.revision, 2); assert.equal(result.shiftStopped, false);
  const saved = await availabilityRef(db, f.id, f.uid('technician')).get(); assert.deepEqual(saved.get('periods'), before.periods);
  assert.deepEqual((await db.doc(`teamMembers/${f.member('technician')}`).get()).data(), memberBefore); assert.deepEqual((await db.doc(`jobs/${jobId}`).get()).data(), jobBefore);
  assert.equal((await f.tracking.shift(f.request({ action: 'status' }, 'technician'))).shift.status, 'on-duty');
  assert.equal((await db.doc(`rlLocations/${hash(`${f.id}:${f.uid('technician')}`)}`).get()).get('sharing'), true);
  const audit = (await db.collection('rlAudit').where('companyId', '==', f.id).where('action', '==', 'staff.fieldWork.update').get()).docs[0].data();
  assert.deepEqual(audit.before, { fieldWorkEnabled: true }); assert.deepEqual(audit.after, { fieldWorkEnabled: false }); assert.equal(audit.actorId, f.uid('manager'));
  assert.equal((await f.api(f.request({ action: 'set-field-work', memberId: f.member('technician'), fieldWorkEnabled: true, expectedRevision: 2 }))).fieldWorkEnabled, true);
});
test('temporary availability edits and clear do not silently restore office-only field eligibility', async () => {
  const f = await fixture();
  await f.api(f.request({ action: 'set-field-work', memberId: f.member('technician'), fieldWorkEnabled: false, expectedRevision: 0 }));
  await f.change({ expectedRevision: 1 });
  const clear = await f.change({ action: 'clear', expectedRevision: 2 }); assert.equal(clear.fieldWorkEnabled, false); assert.equal(clear.availability.state, 'normal');
  const emergency = await f.change({ status: 'available', reason: 'emergency', expectedRevision: 3, fieldWorkEnabled: true });
  assert.equal(emergency.fieldWorkEnabled, false); assert.equal(emergency.availability.state, 'available');
  const saved = await availabilityRef(db, f.id, f.uid('technician')).get(); assert.equal(saved.get('periods').length, 1);
});
test('field eligibility requires owner or manager authority, an active same-company identity, a boolean and the current revision', async () => {
  const f = await fixture(), other = await fixture();
  const payload = { action: 'set-field-work', memberId: f.member('technician'), fieldWorkEnabled: false, expectedRevision: 0 };
  for (const role of ['technician', 'admin']) await assert.rejects(f.api(f.request(payload, role)), { code: 'permission-denied' });
  await assert.rejects(f.api(f.request({ ...payload, memberId: other.member('technician') })), { code: 'failed-precondition' });
  for (const fieldWorkEnabled of [undefined, null, 'false', 0, 1]) await assert.rejects(f.api(f.request({ ...payload, fieldWorkEnabled })), { code: 'invalid-argument' });
  await f.api(f.request(payload)); await assert.rejects(f.api(f.request({ ...payload, fieldWorkEnabled: true })), { code: 'aborted' });
  await db.doc(`teamMembers/${f.member('technician')}`).update({ status: 'removed' });
  await assert.rejects(f.api(f.request({ ...payload, fieldWorkEnabled: true, expectedRevision: 1 })), { code: 'failed-precondition' });
  assert.equal((await availabilityRef(db, f.id, f.uid('technician')).get()).get('fieldWorkEnabled'), false);
});
test('office-only owner stays in management rosters and preserves ownership but cannot receive new field assignments', async () => {
  const f = await fixture(), jobId = await f.job('unassigned-for-owner', null);
  const result = await f.api(f.request({ action: 'set-field-work', memberId: f.uid('owner'), fieldWorkEnabled: false, expectedRevision: 0 }, 'manager'));
  assert.equal(result.memberId, f.uid('owner')); assert.equal((await db.doc(`companies/${f.id}`).get()).get('ownerId'), f.uid('owner'));
  const roster = await f.scheduling.handle(f.request({ action: 'roster' })); assert.equal(roster.technicians.find(person => person.id === f.uid('owner')).fieldWorkEnabled, false);
  const routes = await routeHandlers(db).team(f.request({})); assert.equal(routes.team.find(person => person.id === f.uid('owner')).fieldWorkEnabled, false);
  const locations = await f.tracking.list(f.request({})); assert.equal(locations.roster.find(person => person.memberId === f.uid('owner')).availability.fieldWorkEnabled, false);
  await assert.rejects(f.work.manageJob(f.request({ action: 'assign', id: jobId, memberId: f.uid('owner') })), { code: 'failed-precondition' });
  assert.equal((await f.work.read(f.request({ resource: 'company' }))).company.ownerId, f.uid('owner'));
});
test('office-only staff cannot be newly assigned or rescheduled while notes, completion and existing routes remain usable', async () => {
  const f = await fixture(), existingId = await f.job('existing-office-visit', f.member('technician')), unassignedId = await f.job('new-office-visit', null);
  await f.api(f.request({ action: 'set-field-work', memberId: f.member('technician'), fieldWorkEnabled: false, expectedRevision: 0 }));
  const check = await f.scheduling.handle(f.request({ memberId: f.member('technician'), date: '2030-01-04', time: '10:00', estimatedDuration: 1 })); assert.equal(check.available, false); assert.match(check.reason, /office-only/);
  await assert.rejects(f.work.manageJob(f.request({ action: 'assign', id: unassignedId, memberId: f.member('technician') })), { code: 'failed-precondition' });
  await assert.rejects(f.work.manageJob(f.request({ action: 'update', id: existingId, job: { date: '2030-01-04' } })), { code: 'failed-precondition' });
  assert.equal((await db.doc(`jobs/${existingId}`).get()).get('date'), '2030-01-03');
  await f.work.manageJob(f.request({ action: 'update', id: existingId, job: { workNotes: 'Existing work remains accessible' } }));
  const route = await routeHandlers(db).get(f.request({ memberId: f.member('technician'), date: '2030-01-03' })); assert.deepEqual(route.stops.map(job => job.id), [existingId]);
  assert.equal((await routeHandlers(db).save(f.request({ memberId: f.member('technician'), date: '2030-01-03', jobIds: [existingId], revision: 0 }))).revision, 1);
  const own = await f.work.read(f.request({ resource: 'jobs', assignedTo: 'self', id: existingId }, 'technician'));
  assert.equal((await offlineHandler(db)(f.request({ jobId: existingId, operationId: 'office-existing-completion-0001', expectedVersion: own.job.updatedAt, patch: { status: 'completed', completionNotes: 'Existing assigned work completed' } }, 'technician'))).status, 'synced');
});
test('service plan preferences and recurring fallback never newly assign office-only staff', async () => {
  const f = await fixture(), customerId = `${f.id}-customer`, replacement = `${f.id}-field-tech`, replacementUid = `${f.id}-field-tech-uid`;
  await set(`customers/${customerId}`, { companyId: f.id, userId: f.uid('owner'), name: 'Synthetic field eligibility customer' });
  await set(`teamMembers/${replacement}`, { companyId: f.id, uid: replacementUid, role: 'technician', status: 'active', name: 'Field-enabled replacement' });
  await f.api(f.request({ action: 'set-field-work', memberId: f.member('technician'), fieldWorkEnabled: false, expectedRevision: 0 }));
  const plan = { companyId: f.id, userId: f.uid('owner'), customerId, active: true, nextServiceDate: '2030-01-03', frequencyDays: 7, time: '10:00', estimatedDuration: 1, price: 0, preferredTechnicianId: f.member('technician'), preferredTechnicianUid: f.uid('technician'), assignmentFallback: 'unassigned' };
  const preferenceId = `${f.id}-preference-plan`; await set(`servicePlans/${preferenceId}`, { ...plan, preferredTechnicianId: null, preferredTechnicianUid: null });
  await assert.rejects(recurringHandlers(db).manageServicePlan(f.request({ action: 'update', id: preferenceId, plan: { preferredTechnicianId: f.member('technician') } })), error => error.code === 'failed-precondition' && /office-only/.test(error.message));
  const reviewId = `${f.id}-office-review-plan`; await set(`servicePlans/${reviewId}`, plan);
  const review = await generateVisit(db, reviewId, plan.nextServiceDate); assert.equal((await db.doc(`jobs/${review.jobId}`).get()).get('assignedTo'), null);
  const autoId = `${f.id}-office-auto-plan`; await set(`servicePlans/${autoId}`, { ...plan, nextServiceDate: '2030-01-04', assignmentFallback: 'auto' });
  const auto = await generateVisit(db, autoId, '2030-01-04'); assert.equal((await db.doc(`jobs/${auto.jobId}`).get()).get('assignedTo'), replacement);
  await f.api(f.request({ action: 'set-field-work', memberId: replacement, fieldWorkEnabled: false, expectedRevision: 0 }));
  const nobodyId = `${f.id}-office-nobody-plan`; await set(`servicePlans/${nobodyId}`, { ...plan, nextServiceDate: '2030-01-05', assignmentFallback: 'auto' });
  const nobody = await generateVisit(db, nobodyId, '2030-01-05'); assert.equal((await db.doc(`jobs/${nobody.jobId}`).get()).get('assignedTo'), null);
});
test('office-only eligibility changes and concurrent assignment serialize on the same UID lock', async () => {
  const f = await fixture(), jobId = await f.job('field-eligibility-race', null);
  const [assignment, eligibility] = await Promise.allSettled([
    f.work.manageJob(f.request({ action: 'assign', id: jobId, memberId: f.member('technician') })),
    f.api(f.request({ action: 'set-field-work', memberId: f.member('technician'), fieldWorkEnabled: false, expectedRevision: 0 })),
  ]);
  assert.equal(eligibility.status, 'fulfilled');
  const committed = assignment.status === 'fulfilled';
  if (!committed) assert.equal(assignment.reason.code, 'failed-precondition');
  assert.equal((await db.doc(`jobs/${jobId}`).get()).get('assignedTo'), committed ? f.member('technician') : null);
  assert.equal((await db.doc(`rlScheduleLocks/${hash(`company:${f.id}:${f.uid('technician')}`)}`).get()).get('revision'), committed ? 2 : 1);
  assert.equal((await availabilityRef(db, f.id, f.uid('technician')).get()).get('fieldWorkEnabled'), false);
});
