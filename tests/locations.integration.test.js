const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { locationHandlers } = require('../functions/locations');
const { hash } = require('../functions/security');
let app, db, next = 0;
before(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required; production data must never be used.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'tracking-tests'); db = getFirestore(app);
});
after(() => deleteApp(app));
async function fixture() {
  const id = `tracking-${++next}`, companyId = id, memberId = `${id}-member`, uid = `${id}-tech`, ownerId = `${id}-owner`;
  await db.doc(`companies/${companyId}`).set({ ownerId, timeZone: 'America/Los_Angeles' });
  await db.doc(`teamMembers/${memberId}`).set({ companyId, uid, role: 'technician', status: 'active', name: 'Test technician' });
  let clock = Date.parse('2026-11-13T18:00:00Z');
  const handlers = locationHandlers(db, { now: () => clock });
  const auth = { uid, token: { companyId, membershipId: memberId, role: 'technician', email_verified: true } };
  const owner = { uid: ownerId, token: { companyId, role: 'owner', email_verified: true } };
  const request = (data, caller = auth) => ({ auth: caller, data });
  const start = () => handlers.shift(request({ action: 'start', trackingConsent: true }));
  const fix = (sessionId, overrides = {}) => handlers.update(request({ action: 'position', sessionId, latitude: 35, longitude: -119, accuracy: 10, capturedAt: new Date(clock).toISOString(), ...overrides }));
  const row = db.doc(`rlLocations/${hash(`${companyId}:${uid}`)}`);
  return { companyId, memberId, uid, owner, auth, handlers, request, start, fix, row, time: () => clock, advance: ms => { clock += ms; } };
}

test('on duty requires explicit consent and current membership; starts/ends are idempotent and preserve shift audit', async () => {
  const f = await fixture();
  await assert.rejects(f.handlers.shift(f.request({ action: 'start' })), { code: 'failed-precondition' });
  const [first, second] = await Promise.all([f.start(), f.start()]); assert.equal(first.shift.id, second.shift.id);
  assert.equal(first.shift.status, 'on-duty'); assert.equal(first.policy.intervalMinutes, 3);
  const audit = await db.collection('rlWorkShiftEvents').where('companyId', '==', f.companyId).get(); assert.equal(audit.size, 1);
  const session = await f.handlers.update(f.request({ action: 'start', shiftId: first.shift.id })); await f.fix(session.sessionId);
  await f.handlers.shift(f.request({ action: 'end', shiftId: first.shift.id }));
  assert.equal((await f.handlers.shift(f.request({ action: 'end', shiftId: first.shift.id }))).shift.status, 'off-duty');
  await assert.rejects(f.fix(session.sessionId), { code: 'failed-precondition' });
  assert.equal((await db.collection('rlWorkShiftEvents').where('companyId', '==', f.companyId).get()).size, 2);
  assert.equal((await f.row.get()).get('sharing'), false);
});

test('roster separates duty from GPS, stationary/background gaps do not expire shifts, and delayed uploads remain stale', async () => {
  const f = await fixture();
  let listing = await f.handlers.list(f.request({}, f.owner));
  assert.equal(listing.roster.length, 2); assert.equal(listing.locations.length, 0);
  assert.equal(listing.roster.find(row => row.memberId === f.memberId).dutyStatus, 'off-duty');
  const { shift } = await f.start();
  listing = await f.handlers.list(f.request({}, f.owner)); assert.equal(listing.roster.find(row => row.memberId === f.memberId).onDuty, true);
  const session = await f.handlers.update(f.request({ action: 'start', shiftId: shift.id }));
  listing = await f.handlers.list(f.request({}, f.owner)); assert.equal(listing.roster.find(row => row.memberId === f.memberId).trackingState, 'waiting-for-fix');
  await f.fix(session.sessionId); const capturedAt = new Date(f.time()).toISOString(); f.advance(600000);
  listing = await f.handlers.list(f.request({}, f.owner)); assert.equal(listing.locations[0].state, 'stale');
  assert.equal(listing.roster.find(row => row.memberId === f.memberId).dutyStatus, 'on-duty');
  await f.fix(session.sessionId); assert.equal((await f.handlers.list(f.request({}, f.owner))).locations[0].state, 'live');
  assert.equal((await f.fix(session.sessionId, { capturedAt })).accepted, false);
  f.advance(600000); const late = new Date(f.time() - 360000).toISOString(); await f.fix(session.sessionId, { capturedAt: late });
  assert.equal((await f.handlers.list(f.request({}, f.owner))).locations[0].state, 'stale');
  assert.equal((await f.row.get()).get('capturedAt').toDate().toISOString(), late);
});

test('shift expiry, timestamps, superseded sessions, membership and tenant checks remain authoritative', async () => {
  const f = await fixture(), other = await fixture(), { shift } = await f.start();
  await assert.rejects(other.handlers.update(other.request({ action: 'start', shiftId: shift.id })), { code: 'failed-precondition' });
  const session = await f.handlers.update(f.request({ action: 'start', shiftId: shift.id }));
  await assert.rejects(f.fix('forged'), { code: 'failed-precondition' });
  await assert.rejects(f.fix(session.sessionId, { capturedAt: 'not-a-time' }), { code: 'invalid-argument' });
  await assert.rejects(f.fix(session.sessionId, { capturedAt: new Date(f.time() + 180000).toISOString() }), { code: 'invalid-argument' });
  for (const accuracy of [null, undefined, '10', false, NaN]) await assert.rejects(f.fix(session.sessionId, { accuracy }), { code: 'invalid-argument' });
  await assert.rejects(f.fix(session.sessionId, { latitude: '35' }), { code: 'invalid-argument' });
  await assert.rejects(f.handlers.list(f.request({})), { code: 'permission-denied' });
  const unverified = { ...f.auth, token: { ...f.auth.token, email_verified: false } };
  await assert.rejects(f.handlers.shift(f.request({ action: 'status' }, unverified)), { code: 'failed-precondition' });
  await db.doc(`teamMembers/${f.memberId}`).update({ status: 'removed' }); await assert.rejects(f.fix(session.sessionId), { code: 'permission-denied' });
  assert.equal((await f.handlers.list(f.request({}, f.owner))).roster.length, 1);
  await db.doc(`teamMembers/${f.memberId}`).update({ status: 'active' }); f.advance(12*3600000);
  await assert.rejects(f.fix(session.sessionId), error => error.code === 'failed-precondition' && error.details.reason === 'shift-expired');
  assert.equal((await f.handlers.shift(f.request({ action: 'status' }))).shift.status, 'off-duty');
  const restarted = await f.start(); assert.notEqual(restarted.shift.id, shift.id);
  await assert.rejects(f.handlers.shift(f.request({ action:'end',shiftId:shift.id })), error => error.details?.reason === 'shift-mismatch');
  assert.equal((await f.handlers.shift(f.request({action:'status'}))).shift.id, restarted.shift.id);
});

test('only actual owner sets supported company location policy intervals', async () => {
  const f = await fixture();
  await assert.rejects(f.handlers.policy(f.request({ companyId: f.companyId, intervalMinutes: 1 })), { code: 'permission-denied' });
  await assert.rejects(f.handlers.policy(f.request({ companyId: f.companyId, intervalMinutes: 2 }, f.owner)), { code: 'invalid-argument' });
  for (const intervalMinutes of [1,3,5]) {
    const result = await f.handlers.policy(f.request({ companyId: f.companyId, intervalMinutes }, f.owner));
    assert.equal(result.policy.intervalMinutes, intervalMinutes); assert.equal((await f.handlers.shift(f.request({action:'status'}))).policy.intervalMinutes, intervalMinutes);
  }
});

async function jobFor(f, suffix = 'job', extra = {}) {
  const id = `${f.companyId}-${suffix}`;
  await db.doc(`jobs/${id}`).set({ companyId: f.companyId, assignedTo: f.memberId, status: 'in-progress', date: '2026-11-13', latitude: 35, longitude: -119, ...extra }); return id;
}
test('manual visits are append-only, idempotent after GPS ages/job closes and do not mutate work status', async () => {
  const f = await fixture(), jobId = await jobFor(f);
  const data = { action: 'record', jobId, type: 'access-blocked', note: 'Locked gate', operationId: 'controlled-visit', latitude: 35, longitude: -119, accuracy: 10, capturedAt: new Date(f.time()).toISOString() };
  const first = await f.handlers.visit(f.request(data)); assert.equal(first.event.source, 'manual-gps'); assert.equal(first.event.verifiedAccess, false);
  assert.equal((await db.doc(`jobs/${jobId}`).get()).get('status'), 'in-progress');
  f.advance(600000); await db.doc(`jobs/${jobId}`).update({ status: 'completed' });
  assert.equal((await f.handlers.visit(f.request(data))).duplicate, true);
  await assert.rejects(f.handlers.visit(f.request({ ...data, note: 'Different event' })), { code: 'already-exists' });
  await assert.rejects(f.handlers.visit(f.request({ ...data, operationId: 'new' })), { code: 'failed-precondition' });
  const history = await f.handlers.visit(f.request({ action: 'list', jobId })); assert.equal(history.events.length, 1);
  assert.equal(history.events[0].note, 'Locked gate'); assert.equal(history.events[0].latitude, undefined);
});

test('visit permissions cannot cross assignment or tenant, and access-blocked requires a reason', async () => {
  const f = await fixture(), other = await fixture(), jobId = await jobFor(f);
  const data = { action: 'record', jobId, type: 'access-blocked', operationId: 'visit-check' };
  await assert.rejects(f.handlers.visit(f.request(data)), { code: 'invalid-argument' });
  await assert.rejects(other.handlers.visit(other.request({ ...data, type: 'arrived' })), { code: 'permission-denied' });
  await db.doc(`jobs/${jobId}`).update({ assignedTo: 'different-member' });
  await assert.rejects(f.handlers.visit(f.request({ action: 'list', jobId })), { code: 'permission-denied' });
  await assert.rejects(f.handlers.visit(f.request({ ...data, type: 'arrived' })), { code: 'permission-denied' });
});

test('automatic GPS proximity events use assigned geocoded jobs, accuracy/hysteresis and capture times only', async () => {
  const f = await fixture(), jobId = await jobFor(f); await jobFor(f, 'not-assigned', { assignedTo: 'other' });
  const { shift } = await f.start(), session = await f.handlers.update(f.request({ action:'start', shiftId:shift.id }));
  assert.equal((await f.fix(session.sessionId)).visitEvidence.recorded, 1);
  f.advance(60000); assert.equal((await f.fix(session.sessionId)).visitEvidence.recorded, 0);
  f.advance(60000); await f.fix(session.sessionId, { latitude:35.001 });
  assert.equal((await f.handlers.visit(f.request({action:'list',jobId}))).events.length, 1);
  f.advance(60000); assert.equal((await f.fix(session.sessionId, { latitude:35.003 })).visitEvidence.recorded, 1);
  f.advance(60000); assert.equal((await f.fix(session.sessionId, { latitude:35, accuracy:100 })).visitEvidence.recorded, 0);
  const events = (await f.handlers.visit(f.request({action:'list',jobId}))).events;
  assert.deepEqual(events.map(event=>event.type), ['departed','arrived']); assert.ok(events.every(event=>event.source==='gps-evidence'&&event.verifiedAccess===false));
  assert.equal((await db.doc(`jobs/${jobId}`).get()).get('status'), 'in-progress');
});

test('legacy company date ambiguity cannot hide assigned work after UTC midnight', async () => {
  const f = await fixture(); await db.doc(`companies/${f.companyId}`).update({ timeZone: null });
  const jobId = await jobFor(f, 'late-local', { status:'scheduled' });
  f.advance(7*3600000); // Nov 14 UTC, still Nov 13 at the Acme service address
  const {shift} = await f.start(), session = await f.handlers.update(f.request({action:'start',shiftId:shift.id}));
  assert.equal((await f.fix(session.sessionId)).visitEvidence.recorded, 1);
  assert.equal((await f.handlers.visit(f.request({action:'list',jobId}))).events[0].type, 'arrived');
});

test('retention clears raw GPS without ending an authorized shift or losing its native session', async () => {
  const f = await fixture(); const {shift} = await f.start();
  const session = await f.handlers.update(f.request({action:'start',shiftId:shift.id}));
  // Policy changes also work before the first coordinate has been captured.
  await f.handlers.retention(f.request({companyId:f.companyId,hours:1},f.owner));
  await f.fix(session.sessionId); f.advance(2*3600000);
  const cleanup = await f.handlers.cleanup(); assert.ok(cleanup.clearedFixes >= 1);
  assert.equal((await f.row.get()).get('lat'), undefined);
  assert.equal((await f.row.get()).get('sessionId'), session.sessionId);
  assert.equal((await f.fix(session.sessionId)).accepted, true);
  assert.equal((await f.handlers.list(f.request({},f.owner))).locations[0].state, 'live');
});
