const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { workDataHandlers } = require('../functions/workData');
const { jobPhotoHandler } = require('../functions/jobPhotos');
const { offlineHandler } = require('../functions/offline');
const { routeHandlers } = require('../functions/routes');
const { hasCapability, requireCapability } = require('../functions/access');
let app, db, work, photo, offline, routes;
const auth = role => ({ uid: `access-${role}`, token: { companyId: 'access-co', membershipId: `access-${role}`, role, email_verified: true, email: `${role}@example.test` } });
const request = (role, data) => ({ auth: auth(role), data });
const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
let uploads = [];
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'access-tests'); db = getFirestore(app);
  await db.doc('companies/access-co').set({ ownerId: 'access-owner', name: 'Company', bankAccount: 'private', services: [{ name: 'Service', price: 150, qbId: 'private' }] });
  for (const role of ['admin', 'manager', 'technician']) await db.doc(`teamMembers/access-${role}`).set({ companyId: 'access-co', uid: `access-${role}`, role, status: 'active' });
  await db.doc('customers/access-customer').set({ companyId: 'access-co', name: 'Customer', phone: '555', totalSpent: 999, invoiceBalance: 99, history: [{ total: 999 }], notes: 'Billing only', address: '1 Main St' });
  for (const [id, assignedTo, companyId] of [['access-job', 'access-technician', 'access-co'], ['access-unassigned', null, 'access-co'], ['access-foreign', 'access-technician', 'other-co']]) {
    await db.doc(`jobs/${id}`).set({ companyId, userId: 'access-owner', customerId: 'access-customer', assignedTo, date: '2026-11-13', status: 'scheduled', totalCost: 150, invoiceBalance: 99, revisions: [{ price: 500 }], notes: 'Billing instructions', workNotes: 'Gate code provided', updatedAt: '2026-11-13T00:00:00.000Z' });
  }
  work = workDataHandlers(db); offline = offlineHandler(db); routes = routeHandlers(db);
  photo = jobPhotoHandler(db, () => ({ file: () => ({ save: async (buffer, options) => uploads.push({ buffer, options }), getMetadata: async () => [{ size: bytes.length, contentType: 'image/jpeg' }], download: async () => [bytes] }) }));
});
after(() => deleteApp(app));

test('all four roles have explicit operational, financial and governance capabilities', async () => {
  for (const role of ['owner', 'admin', 'manager', 'technician']) {
    assert.equal(hasCapability(role, 'invoices.manage'), ['owner', 'admin'].includes(role));
    assert.equal(hasCapability(role, 'dispatch.manage'), role !== 'technician');
    assert.equal(hasCapability(role, 'team.manage'), role === 'owner');
    assert.equal(hasCapability(role, 'jobs.work'), true);
    if (role === 'manager' || role === 'technician') await assert.rejects(requireCapability(db, request(role), 'invoices.manage'), { code: 'permission-denied' });
  }
  assert.equal(hasCapability('dispatcher', 'jobs.assign'), false);
});
test('technician job and customer responses exclude financial fields, old notes and history', async () => {
  const result = await work.read(request('technician', { resource: 'jobs', id: 'access-job' }));
  assert.equal(result.job.notes, 'Gate code provided'); assert.equal(result.customer.name, 'Customer');
  for (const field of ['totalCost', 'invoiceBalance', 'revisions', 'paymentIntentId']) assert.equal(result.job[field], undefined);
  for (const field of ['totalSpent', 'invoiceBalance', 'history', 'notes']) assert.equal(result.customer[field], undefined);
  assert.deepEqual((await work.read(request('technician', { resource: 'jobs', date: '2026-11-13' }))).jobs.map(job => job.id), ['access-job']);
  await assert.rejects(work.read(request('technician', { resource: 'jobs', id: 'access-unassigned' })), { code: 'permission-denied' });
  await assert.rejects(work.read(request('technician', { resource: 'jobs', id: 'access-foreign' })), { code: 'permission-denied' });
  await assert.rejects(work.read(request('technician', { resource: 'customers' })), { code: 'invalid-argument' });
  assert.equal((await work.read(request('technician', { resource: 'customers', jobId: 'access-job' }))).customer.name, 'Customer');
});
test('manager gets operational pricing but no balances, history or company accounting fields', async () => {
  const result = await work.read(request('manager', { resource: 'jobs', id: 'access-job' }));
  assert.equal(result.job.totalCost, 150); assert.equal(result.job.invoiceBalance, undefined); assert.equal(result.job.revisions, undefined); assert.equal(result.customer.totalSpent, undefined);
  const company = (await work.read(request('manager', { resource: 'company' }))).company;
  assert.equal(company.bankAccount, undefined); assert.equal(company.services[0].price, 150); assert.equal(company.services[0].qbId, undefined);
  assert.equal((await work.read(request('technician', { resource: 'company' }))).company.services[0], 'Service');
  for (const role of ['owner', 'admin']) assert.equal((await work.read(request(role, { resource: 'jobs', id: 'access-job' }))).job.totalCost, 150);
});
test('pending, removed, inactive, unverified and stale role claims fail closed', async () => {
  for (const status of ['pending', 'removed', 'inactive']) {
    await db.doc('teamMembers/access-technician').update({ status });
    await assert.rejects(work.read(request('technician', { resource: 'jobs' })), { code: 'permission-denied' });
  }
  await db.doc('teamMembers/access-technician').update({ status: 'active' });
  const unverified = request('technician', { resource: 'jobs' }); unverified.auth.token.email_verified = false;
  await assert.rejects(work.read(unverified), { code: 'failed-precondition' });
  const stale = request('technician', { resource: 'jobs' }); stale.auth.token.role = 'admin';
  await assert.rejects(work.read(stale), { code: 'permission-denied' });
  const forgedOwner = request('technician', { resource: 'jobs' }); forgedOwner.auth.token.role = 'owner';
  await assert.rejects(work.read(forgedOwner), { code: 'permission-denied' });
});
test('dispatch assignments require operations access, current version and an active same-company member', async () => {
  const data = { action: 'assign', id: 'access-unassigned', memberId: 'access-technician', expectedVersion: '2026-11-13T00:00:00.000Z' };
  await assert.rejects(work.manageJob(request('technician', data)), { code: 'permission-denied' });
  const result = await work.manageJob(request('manager', data));
  assert.equal((await db.doc('jobs/access-unassigned').get()).get('assignedTo'), 'access-technician');
  await assert.rejects(work.manageJob(request('manager', data)), { code: 'aborted' });
  await assert.rejects(work.manageJob(request('manager', { ...data, expectedVersion: result.updatedAt, memberId: 'foreign-member' })), { code: 'permission-denied' });
  await assert.rejects(work.manageJob(request('manager', { ...data, id: 'access-foreign' })), { code: 'permission-denied' });
});
test('technicians cannot optimize or save routes even when all stops are assigned', async () => {
  await assert.rejects(routes.save(request('technician', { memberId: 'access-technician', date: '2026-11-13', jobIds: ['access-job'] })), { code: 'permission-denied' });
  assert.equal((await routes.save(request('manager', { memberId: 'access-technician', date: '2026-11-13', jobIds: ['access-job'], revision: 0 }))).revision, 1);
});
test('photo bytes and application logs require current assignment; metadata never exposes a bearer URL', async () => {
  const upload = request('technician', { action: 'upload', jobId: 'access-job', operationId: 'photo-operation-000001', base64: bytes.toString('base64') });
  const saved = await photo(upload); await photo(upload); assert.equal(uploads.length, 1);
  assert.equal(uploads[0].options.metadata.firebaseStorageDownloadTokens, undefined);
  const metadata = (await work.read(request('technician', { resource: 'photos', jobId: 'access-job' }))).photos[0];
  assert.equal(metadata.url, undefined); assert.equal(metadata.storagePath, undefined);
  assert.match((await photo(request('technician', { action: 'read', photoId: saved.id }))).dataUri, /^data:image\/jpeg;base64,/);
  const application = request('technician', { jobId: 'access-job', operationId: 'application-operation-000001', record: { product: 'Product', targetPest: 'Ants', amount: 1, unit: 'oz', totalCost: 999 } });
  const record = await work.application(application); assert.deepEqual(await work.application(application), record);
  await assert.rejects(work.application({ ...application, data: { ...application.data, record: { ...application.data.record, amount: 2 } } }), { code: 'already-exists' });
  const log = (await work.read(request('technician', { resource: 'serviceLogs', jobId: 'access-job' }))).logs[0];
  assert.equal(log.product, 'Product'); assert.equal(log.totalCost, undefined);
  assert.equal(log.siteAddress, '1 Main St');
  await db.doc('jobs/access-job').update({ assignedTo: 'access-manager' });
  await assert.rejects(photo(request('technician', { action: 'read', photoId: saved.id })), { code: 'permission-denied' });
  await assert.rejects(photo(upload), { code: 'permission-denied' });
  await assert.rejects(work.application(application), { code: 'permission-denied' });
  await assert.rejects(work.read(request('technician', { resource: 'serviceLogs', jobId: 'access-job' })), { code: 'permission-denied' });
  await db.doc('jobs/access-job').update({ assignedTo: 'access-technician' });
});
test('offline replay rechecks membership and assignment before returning an idempotent result', async () => {
  const operation = request('technician', { operationId: 'offline-operation-000001', jobId: 'access-job', expectedVersion: '2026-11-13T00:00:00.000Z', patch: { status: 'en-route', notes: 'Field notes' } });
  const result = await offline(operation); assert.equal(result.status, 'synced'); assert.deepEqual(await offline(operation), result);
  await assert.rejects(offline({ ...operation, data: { ...operation.data, operationId: 'offline-operation-000002', patch: { totalCost: 0 } } }), { code: 'invalid-argument' });
  await db.doc('teamMembers/access-technician').update({ role: 'manager' });
  await assert.rejects(offline(operation), { code: 'permission-denied' });
  await db.doc('teamMembers/access-technician').update({ role: 'technician', status: 'removed' });
  await assert.rejects(offline(operation), { code: 'permission-denied' });
  await db.doc('teamMembers/access-technician').update({ status: 'active' });
  await db.doc('jobs/access-job').update({ assignedTo: 'access-manager' });
  await assert.rejects(offline(operation), { code: 'permission-denied' });
});
test('invited users cannot start an independent company before accepting their invitation', async () => {
  const pending = { auth: { uid: 'pending-access-user', token: { email_verified: true, email: 'pending@example.test' } }, data: { name: 'Separate company' } };
  await db.doc('teamMembers/pending-access-user').set({ email: 'pending@example.test', companyId: 'access-co', role: 'technician', status: 'pending', expiresAt: Date.now() + 60000 });
  await assert.rejects(work.createCompany(pending), { code: 'permission-denied' });
  await assert.rejects(work.createCompany(request('technician', { name: 'Separate company' })), { code: 'permission-denied' });
});
