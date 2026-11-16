// Local synthetic records only. This suite never reads or writes production.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { workDataHandlers } = require('../functions/workData');
const { offlineHandler } = require('../functions/offline');
const { hash } = require('../functions/security');
let app, db, sequence = 0;
const paths = new Set(), fixtures = [];
const set = (path, data) => { paths.add(path); return db.doc(path).set(data); };
before(() => {
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'job-notes-tests'); db = getFirestore(app);
});
after(async () => {
  if (!db) return;
  for (const f of fixtures) {
    for (const name of ['rlOperations', 'rlAudit']) {
      const rows = await db.collection(name).where('companyId', '==', f.id).get();
      for (const row of rows.docs) await row.ref.delete();
    }
    for (const role of ['owner', 'manager', 'technician']) for (const action of ['work-read', 'offline-job', 'job-manage']) await db.doc(`rlRateLimits/${hash(`${action}:${f.uid(role)}`)}`).delete();
  }
  for (const path of paths) await db.doc(path).delete();
  await deleteApp(app);
});
async function fixture() {
  const id = `job-notes-${process.pid}-${++sequence}`, jobId = `${id}-job`, customerId = `${id}-customer`;
  const f = { id, jobId, customerId, uid: role => `${id}-${role}-uid`, member: role => `${id}-${role}` }; fixtures.push(f);
  await set(`companies/${id}`, { ownerId: f.uid('owner'), name: 'Synthetic job-notes company' });
  for (const role of ['owner', 'manager', 'technician']) {
    await set(`users/${f.uid(role)}`, { rlCompanyId: id });
    if (role !== 'owner') await set(`teamMembers/${f.member(role)}`, { companyId: id, uid: f.uid(role), role, status: 'active' });
  }
  await set(`customers/${customerId}`, { companyId: id, name: 'Synthetic customer', serviceInstructions: 'Keep the gate closed', notes: 'PRIVATE CUSTOMER BILLING', invoiceBalance: 500, history: ['PRIVATE CUSTOMER HISTORY'] });
  await set(`jobs/${jobId}`, { companyId: id, userId: f.uid('owner'), customerId, assignedTo: f.member('technician'), date: '2030-01-03', time: '10:00', estimatedDuration: 1, status: 'scheduled', notes: 'Gate 2468; pets remain indoors', workNotes: 'Previous technician observations', privateNotes: 'PRIVATE OFFICE NOTE', billingNotes: 'PRIVATE BILLING NOTE', internalNotes: 'PRIVATE INTERNAL NOTE', totalCost: 150, invoiceBalance: 500, description: 'PRIVATE PRICE DESCRIPTION', scopeOfWork: 'PRIVATE PRICE SCOPE', revisions: [{ notes: 'PRIVATE HISTORY' }], updatedAt: '2030-01-03T17:00:00.000Z' });
  f.request = (data, role = 'technician') => ({ data, auth: { uid: f.uid(role), token: { companyId: id, role, ...(role === 'owner' ? {} : { membershipId: f.member(role) }), email_verified: true } } });
  f.work = workDataHandlers(db); f.apply = offlineHandler(db);
  return f;
}
test('assigned technicians receive saved dispatch instructions in list and detail without private customer, financial or history fields', async () => {
  const f = await fixture(), before = (await db.doc(`jobs/${f.jobId}`).get()).data();
  const detail = await f.work.read(f.request({ resource: 'jobs', id: f.jobId }));
  const listed = await f.work.read(f.request({ resource: 'jobs', date: '2030-01-03' }));
  for (const job of [detail.job, listed.jobs[0]]) {
    assert.equal(job.dispatchNotes, before.notes); assert.equal(job.workNotes, before.workNotes); assert.equal(job.notes, before.workNotes);
    for (const key of ['privateNotes', 'billingNotes', 'internalNotes', 'totalCost', 'invoiceBalance', 'description', 'scopeOfWork', 'revisions']) assert.equal(job[key], undefined);
    assert.equal(JSON.stringify(job).includes('PRIVATE'), false);
  }
  assert.equal(detail.customer.serviceInstructions, 'Keep the gate closed'); assert.equal(detail.customer.notes, undefined); assert.equal(detail.customer.invoiceBalance, undefined); assert.equal(detail.customer.history, undefined);
  assert.deepEqual((await db.doc(`jobs/${f.jobId}`).get()).data(), before);
  const manager = await f.work.read(f.request({ resource: 'jobs', id: f.jobId }, 'manager')); assert.equal(manager.job.dispatchNotes, before.notes); assert.equal(manager.job.totalCost, 150); assert.equal(manager.job.invoiceBalance, undefined); assert.equal(manager.job.privateNotes, undefined);
});
test('technician work-log sync and manager dispatch-note edits remain independent and preserve private records', async () => {
  const f = await fixture(), customerBefore = (await db.doc(`customers/${f.customerId}`).get()).data();
  const payload = { jobId: f.jobId, operationId: 'job-notes-work-log-operation-01', expectedVersion: '2030-01-03T17:00:00.000Z', patch: { notes: 'Technician found gate locked' } };
  const synced = await f.apply(f.request(payload)); assert.equal(synced.status, 'synced'); assert.deepEqual(await f.apply(f.request(payload)), synced);
  let detail = await f.work.read(f.request({ resource: 'jobs', id: f.jobId })); assert.equal(detail.job.dispatchNotes, 'Gate 2468; pets remain indoors'); assert.equal(detail.job.workNotes, 'Technician found gate locked'); assert.equal(detail.job.notes, 'Technician found gate locked');
  await f.work.manageJob(f.request({ action: 'update', id: f.jobId, expectedVersion: synced.version, job: { notes: 'Use gate 1357 for this visit' } }, 'manager'));
  detail = await f.work.read(f.request({ resource: 'jobs', id: f.jobId })); assert.equal(detail.job.dispatchNotes, 'Use gate 1357 for this visit'); assert.equal(detail.job.workNotes, 'Technician found gate locked');
  assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(), customerBefore);
  const saved = await db.doc(`jobs/${f.jobId}`).get(); assert.equal(saved.get('privateNotes'), 'PRIVATE OFFICE NOTE'); assert.equal(saved.get('billingNotes'), 'PRIVATE BILLING NOTE');
});
test('dispatch notes cannot be retrieved across assignment, tenant, verification or membership boundaries', async () => {
  const f = await fixture(), foreign = await fixture();
  await assert.rejects(f.work.read(f.request({ resource: 'jobs', id: foreign.jobId })), { code: 'permission-denied' });
  await db.doc(`jobs/${f.jobId}`).update({ assignedTo: null });
  await assert.rejects(f.work.read(f.request({ resource: 'jobs', id: f.jobId })), { code: 'permission-denied' });
  assert.deepEqual((await f.work.read(f.request({ resource: 'jobs', date: '2030-01-03' }))).jobs, []);
  await db.doc(`jobs/${f.jobId}`).update({ assignedTo: f.member('technician') });
  const unverified = f.request({ resource: 'jobs', id: f.jobId }); unverified.auth.token.email_verified = false;
  await assert.rejects(f.work.read(unverified), { code: 'failed-precondition' });
  await db.doc(`teamMembers/${f.member('technician')}`).update({ status: 'removed' });
  await assert.rejects(f.work.read(f.request({ resource: 'jobs', id: f.jobId })), { code: 'permission-denied' });
});
