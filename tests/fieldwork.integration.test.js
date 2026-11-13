const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { routeHandlers } = require('../functions/routes');
const { locationHandlers } = require('../functions/locations');
const { offlineHandler } = require('../functions/offline');
let app, db, routes, locations, apply;
const owner = { uid: 'field-owner', token: { companyId: 'field-co', role: 'owner', email_verified: true } }, tech = { uid: 'field-tech', token: { companyId: 'field-co', membershipId: 'field-member', role: 'technician', email_verified: true } };
const request = (data, auth = tech) => ({ auth, data });
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'fieldwork-tests'); db = getFirestore(app);
  await db.doc('companies/field-co').set({ ownerId: owner.uid });
  await db.doc('teamMembers/field-member').set({ companyId: 'field-co', uid: tech.uid, role: 'technician', status: 'active' });
  await db.doc('customers/field-customer').set({ companyId: 'field-co', latitude: 40, longitude: -120, name: 'Test customer' });
  await db.doc('jobs/field-job').set({ companyId: 'field-co', userId: owner.uid, customerId: 'field-customer', assignedTo: 'field-member', date: '2026-11-13', time: '09:00', status: 'in-progress', updatedAt: '2026-11-13T00:00:00.000Z' });
  routes = routeHandlers(db); locations = locationHandlers(db); apply = offlineHandler(db);
});
after(() => deleteApp(app));

async function locationFixture(suffix) {
  const companyId = `location-co-${suffix}`, memberId = `location-member-${suffix}`, jobId = `location-job-${suffix}`;
  const owner = { uid: `location-owner-${suffix}`, token: { companyId, role: 'owner', email_verified: true } };
  const tech = { uid: `location-tech-${suffix}`, token: { companyId, membershipId: memberId, role: 'technician', email_verified: true } };
  await db.doc(`companies/${companyId}`).set({ ownerId: owner.uid });
  await db.doc(`teamMembers/${memberId}`).set({ companyId, uid: tech.uid, role: 'technician', status: 'active' });
  await db.doc(`jobs/${jobId}`).set({ companyId, userId: owner.uid, assignedTo: memberId, date: '2026-11-13', status: 'in-progress', latitude: 40, longitude: -120 });
  return { companyId, memberId, jobId, owner, tech };
}

test('route and location access cannot cross tenants even with forged role claims', async () => {
  const a = await locationFixture('tenant-a'), b = await locationFixture('tenant-b');
  const session = await locations.update(request({ action: 'start', jobId: a.jobId }, a.tech));
  await locations.update(request({ action: 'position', sessionId: session.sessionId, latitude: 40, longitude: -120, accuracy: 10 }, a.tech));
  assert.equal((await locations.list(request({}, a.owner))).locations.length, 1);
  assert.equal((await locations.list(request({}, b.owner))).locations.length, 0);
  await assert.rejects(locations.list(request({}, a.tech)), { code: 'permission-denied' });
  await assert.rejects(routes.get(request({ memberId: a.memberId, date: '2026-11-13' }, b.owner)), { code: 'failed-precondition' });
  await assert.rejects(routes.save(request({ memberId: b.memberId, date: '2026-11-13', jobIds: [a.jobId] }, b.owner)), { code: 'permission-denied' });
  const forged = { ...a.tech, token: { ...a.tech.token, companyId: b.companyId, role: 'owner' } };
  await assert.rejects(locations.list(request({}, forged)), { code: 'permission-denied' });
  await assert.rejects(locations.update(request({ action: 'start', jobId: b.jobId }, a.tech)), { code: 'failed-precondition' });
  await db.doc(`teamMembers/${a.memberId}`).update({ status: 'removed' });
  assert.equal((await locations.list(request({}, a.owner))).locations.length, 0);
  await assert.rejects(locations.update(request({ action: 'position', sessionId: session.sessionId, latitude: 40, longitude: -120, accuracy: 10 }, a.tech)), { code: 'permission-denied' });
});

test('location updates require an explicit current session and stop when the job or session ends', async () => {
  const f = await locationFixture('consent');
  const position = { action: 'position', latitude: 40, longitude: -120, accuracy: 10 };
  await assert.rejects(locations.update(request(position, f.tech)), { code: 'failed-precondition' });
  const unverified = { ...f.tech, token: { ...f.tech.token, email_verified: false } };
  await assert.rejects(locations.update(request({ action: 'start', jobId: f.jobId }, unverified)), { code: 'failed-precondition' });
  const session = await locations.update(request({ action: 'start', jobId: f.jobId }, f.tech));
  await assert.rejects(locations.update(request({ ...position, sessionId: 'not-the-sharing-session' }, f.tech)), { code: 'failed-precondition' });
  await locations.update(request({ ...position, sessionId: session.sessionId }, f.tech));
  await db.doc(`jobs/${f.jobId}`).update({ status: 'completed' });
  await assert.rejects(locations.update(request({ ...position, sessionId: session.sessionId }, f.tech)), { code: 'failed-precondition' });
  await db.doc(`jobs/${f.jobId}`).update({ status: 'in-progress' });
  const rows = await db.collection('rlLocations').where('companyId', '==', f.companyId).get();
  await rows.docs[0].ref.update({ sessionExpiresAt: new Date(0) });
  await assert.rejects(locations.update(request({ ...position, sessionId: session.sessionId }, f.tech)), { code: 'failed-precondition' });
});

test('daily routes enforce assignment and optimistic revision without provider calls', async () => {
  const data = { memberId: 'field-member', date: '2026-11-13' };
  await db.doc('jobs/field-job').update({ estimatedDuration: 1.5 });
  const result = await routes.get(request(data));
  assert.equal(result.stops.length, 1); assert.equal(result.stops[0].durationMinutes, 90);
  await assert.rejects(routes.get(request({ ...data, memberId: owner.uid })), { code: 'permission-denied' });
  assert.equal((await routes.save(request({ ...data, jobIds: ['field-job'], revision: 0 }, owner))).revision, 1);
  await assert.rejects(routes.save(request({ ...data, jobIds: ['field-job'], revision: 0 }, owner)), { code: 'aborted' });
  await assert.rejects(routes.save(request({ ...data, jobIds: ['field-job', 'field-job'], revision: 1 }, owner)), { code: 'invalid-argument' });
});
test('location sharing is explicit, manager-only, stoppable and expires', async () => {
  const session = await locations.update(request({ action: 'start', jobId: 'field-job' }));
  await locations.update(request({ action: 'position', sessionId: session.sessionId, latitude: 40, longitude: -120, accuracy: 15 }));
  await assert.rejects(locations.list(request({})), { code: 'permission-denied' });
  assert.equal((await locations.list(request({}, owner))).locations[0].sharing, true);
  await locations.update(request({ action: 'stop', sessionId: session.sessionId }));
  await assert.rejects(locations.update(request({ action: 'position', sessionId: session.sessionId, latitude: 40, longitude: -120, accuracy: 15 })), { code: 'failed-precondition' });
  await locations.retention(request({ companyId: 'field-co', hours: 1 }, owner));
  const rows = await db.collection('rlLocations').where('companyId', '==', 'field-co').get(); await rows.docs[0].ref.update({ expiresAt: new Date(0) });
  assert.equal((await locations.list(request({}, owner))).locations.length, 0);
  assert.equal((await locations.cleanup()).removed, 1);
});
test('offline operations are idempotent, expose conflicts and cannot change tenant or assignment', async () => {
  const data = { operationId: 'operation-000000000001', jobId: 'field-job', expectedVersion: '2026-11-13T00:00:00.000Z', patch: { notes: 'Saved offline' } };
  const results = await Promise.all([apply(request(data)), apply(request(data))]);
  assert.equal(results[0].status, 'synced'); assert.equal(results[0].version, results[1].version);
  await assert.rejects(apply(request({ ...data, patch: { notes: 'Different payload' } })), { code: 'already-exists' });
  const conflict = await apply(request({ ...data, operationId: 'operation-000000000002', patch: { status: 'completed' } }));
  assert.equal(conflict.status, 'conflict'); assert.equal(conflict.server.notes, 'Saved offline');
  await assert.rejects(apply(request({ ...data, operationId: 'operation-000000000003', patch: { companyId: 'other' } })), { code: 'invalid-argument' });
  await db.doc('jobs/field-job').update({ assignedTo: 'someone-else' });
  await assert.rejects(apply(request(data)), { code: 'permission-denied' });
  await db.doc('teamMembers/field-member').update({ status: 'removed' });
  await assert.rejects(routes.get(request({ memberId: 'field-member', date: '2026-11-13' })), { code: 'permission-denied' });
});
