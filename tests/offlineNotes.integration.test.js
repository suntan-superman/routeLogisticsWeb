// Local synthetic fixtures only. Device draft hydration is covered separately.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { offlineHandler } = require('../functions/offline');
const { workDataHandlers } = require('../functions/workData');
const { hash } = require('../functions/security');

let app, db, sequence = 0;
const fixtures = [];
const BASE = '2030-01-03T17:00:00.000Z';
const DISPATCH = 'Dispatch instructions: use the side gate and keep pets inside.';
before(() => {
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'offline-notes-tests');
  db = getFirestore(app);
});
after(async () => {
  if (!db) return;
  for (const f of fixtures) {
    for (const name of ['jobs', 'teamMembers', 'rlOperations']) {
      for (const row of (await db.collection(name).where('companyId', '==', f.companyId).get()).docs) await row.ref.delete();
    }
    for (const role of ['technician', 'manager']) {
      await db.doc(`users/${f.uid(role)}`).delete();
      for (const action of ['offline-job', 'work-read']) await db.doc(`rlRateLimits/${hash(`${action}:${f.uid(role)}`)}`).delete();
    }
    await db.doc(`companies/${f.companyId}`).delete();
  }
  await deleteApp(app);
});
async function fixture() {
  const id = `offline-notes-${process.pid}-${++sequence}`;
  const f = { companyId: id, jobId: `${id}-job`, ownerId: `${id}-owner`, apply: offlineHandler(db), work: workDataHandlers(db) };
  fixtures.push(f);
  f.uid = role => `${id}-${role}-uid`;
  f.member = role => `${id}-${role}-member`;
  await db.doc(`companies/${id}`).set({ ownerId: f.ownerId, isActive: true, name: 'Synthetic offline-notes provider' });
  for (const role of ['technician', 'manager']) {
    await db.doc(`users/${f.uid(role)}`).set({ rlCompanyId: id, name: `Synthetic ${role}` });
    await db.doc(`teamMembers/${f.member(role)}`).set({ companyId: id, uid: f.uid(role), role, status: 'active' });
  }
  await db.doc(`jobs/${f.jobId}`).set({ companyId: id, userId: f.ownerId, assignedTo: f.member('technician'), assignedToUid: f.uid('technician'), status: 'in-progress', date: '2030-01-03', time: '09:00', notes: DISPATCH, workNotes: 'Previously saved observation.', updatedAt: BASE, photoIds: ['keep-existing-photo'] });
  f.request = (data, role = 'technician') => ({ data, auth: { uid: f.uid(role), token: { companyId: id, role, membershipId: f.member(role), email_verified: true, email: 'synthetic@example.test' } } });
  f.payload = (notes, operationId = 'offline-notes-operation-0001', expectedVersion = BASE) => ({ jobId: f.jobId, operationId, expectedVersion, patch: { notes } });
  f.job = async () => (await db.doc(`jobs/${f.jobId}`).get()).data();
  f.operations = async () => (await db.collection('rlOperations').where('companyId', '==', id).get()).docs;
  f.read = role => f.work.read(f.request({ resource: 'jobs', id: f.jobId }, role));
  return f;
}

test('a lost notes acknowledgement and restarted handler replay exactly once without changing dispatch instructions', async () => {
  const f = await fixture(), text = 'Synthetic inspection\nGate remained locked. Café — revisión completa.\nNo actual service performed.';
  const payload = f.payload(text), first = await f.apply(f.request(payload));
  assert.equal(first.status, 'synced');
  const restarted = offlineHandler(db);
  const replies = await Promise.all([restarted(f.request(payload)), restarted(f.request(payload))]);
  replies.forEach(reply => assert.deepEqual(reply, first));
  const job = await f.job();
  assert.equal(job.workNotes, text);
  assert.equal(job.notes, DISPATCH);
  assert.equal(job.updatedAt, first.version);
  assert.deepEqual(job.photoIds, ['keep-existing-photo']);
  assert.equal((await f.operations()).length, 1);
});

test('technician and manager web projections retain exact work notes separately from dispatch notes', async () => {
  const f = await fixture(), text = 'Synthetic field note with a second line.\nAccess was not possible.';
  const saved = await f.apply(f.request(f.payload(text)));
  const technician = (await f.read('technician')).job, manager = (await f.read('manager')).job;
  assert.equal(technician.workNotes, text);
  assert.equal(technician.notes, text);
  assert.equal(technician.dispatchNotes, DISPATCH);
  assert.equal(manager.workNotes, text);
  assert.equal(manager.notes, DISPATCH);
  assert.equal(manager.dispatchNotes, DISPATCH);
  assert.equal(technician.updatedAt, saved.version);
  assert.equal(manager.updatedAt, saved.version);
});

test('a working manager saves field notes through the same queue API and a following operation uses the acknowledged revision', async () => {
  const f = await fixture();
  await db.doc(`jobs/${f.jobId}`).update({ assignedTo: f.member('manager'), assignedToUid: f.uid('manager') });
  const first = await f.apply(f.request(f.payload('Synthetic manager field note.'), 'manager'));
  const next = f.payload('Synthetic manager field note.\nAdditional observation.', 'offline-notes-operation-0002', first.version);
  const second = await f.apply(f.request(next, 'manager'));
  assert.equal(second.status, 'synced');
  assert.notEqual(second.version, first.version);
  assert.deepEqual(await offlineHandler(db)(f.request(next, 'manager')), second);
  const job = await f.job();
  assert.equal(job.workNotes, next.patch.notes);
  assert.equal(job.notes, DISPATCH);
  assert.equal((await f.operations()).length, 2);
  assert.equal((await f.read('manager')).job.workNotes, next.patch.notes);
});

test('stale notes and reused operation identities never replace newer server work', async () => {
  const f = await fixture(), firstPayload = f.payload('First saved synthetic observation.');
  const first = await f.apply(f.request(firstPayload));
  const secondPayload = f.payload('Newer synthetic observation.', 'offline-notes-operation-0002', first.version);
  const second = await f.apply(f.request(secondPayload));
  const stale = await f.apply(f.request(f.payload('Stale offline text is retained for review.', 'offline-notes-stale-operation', BASE)));
  assert.equal(stale.status, 'conflict');
  assert.equal(stale.version, second.version);
  assert.equal(stale.server.notes, secondPayload.patch.notes);
  await assert.rejects(f.apply(f.request({ ...firstPayload, patch: { notes: 'Different payload under the old identity.' } })), { code: 'already-exists' });
  assert.deepEqual(await f.apply(f.request(firstPayload)), first);
  const job = await f.job();
  assert.equal(job.workNotes, secondPayload.patch.notes);
  assert.equal(job.updatedAt, second.version);
  assert.equal(job.notes, DISPATCH);
  assert.equal((await f.operations()).length, 2);
});

test('foreign, reassigned, revoked and unverified identities cannot submit or replay notes', async () => {
  const f = await fixture(), foreign = await fixture(), payload = f.payload('Authorized synthetic observation.');
  await f.apply(f.request(payload));
  await assert.rejects(f.apply(foreign.request(payload)), { code: 'permission-denied' });
  await db.doc(`jobs/${f.jobId}`).update({ assignedTo: f.member('manager'), assignedToUid: f.uid('manager') });
  await assert.rejects(f.apply(f.request(payload)), { code: 'permission-denied' });
  await db.doc(`jobs/${f.jobId}`).update({ assignedTo: f.member('technician'), assignedToUid: f.uid('technician') });
  await db.doc(`teamMembers/${f.member('technician')}`).update({ status: 'removed' });
  await assert.rejects(f.apply(f.request(payload)), { code: 'permission-denied' });
  const unverified = f.request(payload, 'manager'); unverified.auth.token.email_verified = false;
  await assert.rejects(f.apply(unverified), { code: 'failed-precondition' });
  assert.equal((await f.job()).workNotes, payload.patch.notes);
  assert.equal((await f.operations()).length, 1);
  assert.equal((await foreign.operations()).length, 0);
});
