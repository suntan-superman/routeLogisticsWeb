// Backend field-work parity only. Physical camera, GPS, and offline persistence
// are separate native acceptance items; this suite uses local synthetic data.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { workDataHandlers } = require('../functions/workData');
const { jobPhotoHandler } = require('../functions/jobPhotos');
const { serviceFormsHandler } = require('../functions/serviceForms');
const { locationHandlers } = require('../functions/locations');
const { offlineHandler } = require('../functions/offline');
const { requireCapability } = require('../functions/access');
const { hash } = require('../functions/security');
const template = require('../functions/shared/serviceTemplates.json').find(row => row.id === 'pest-control');
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
let app, db, sequence = 0;
const fixtures = [], paths = new Set();
const set = (path, data) => { paths.add(path); return db.doc(path).set(data); };
before(() => {
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'mobile-dual-mode-tests'); db = getFirestore(app);
});
after(async () => {
  if (!db) return;
  for (const f of fixtures) {
    await db.recursiveDelete(db.doc(`rlJobServiceForms/${f.jobId}`));
    for (const name of ['photos', 'serviceLogs', 'rlJobVisits', 'rlAudit', 'rlWorkShifts', 'rlWorkShiftEvents', 'rlLocations', 'rlOperations']) {
      const rows = await db.collection(name).where('companyId', '==', f.companyId).get();
      for (const row of rows.docs) await row.ref.delete();
    }
    for (const action of ['work-read', 'offline-job', 'job-photo', 'application-write', 'service-forms', 'job-visit', 'work-shift', 'location']) await db.doc(`rlRateLimits/${hash(`${action}:${f.uid}`)}`).delete();
  }
  for (const path of paths) await db.doc(path).delete();
  await deleteApp(app);
});
async function fixture(role) {
  const prefix = `dual-mode-${process.pid}-${++sequence}`, companyId = `${prefix}-company`, ownerId = `${prefix}-owner`, uid = role === 'owner' ? ownerId : `${prefix}-manager`, memberId = role === 'owner' ? null : `${prefix}-membership`, jobId = `${prefix}-job`;
  const auth = { uid, token: { companyId, role, ...(memberId ? { membershipId: memberId } : {}), email_verified: true, email: `${role}@example.test` } };
  const f = { prefix, companyId, ownerId, uid, memberId, jobId, role, request: data => ({ auth, data }), uploaded: [] };
  fixtures.push(f);
  await set(`companies/${companyId}`, { ownerId, name: 'Synthetic working-supervisor company', timeZone: 'America/Los_Angeles' });
  await set(`users/${uid}`, { rlCompanyId: companyId, name: `Synthetic working ${role}` });
  if (memberId) await set(`teamMembers/${memberId}`, { companyId, uid, role, status: 'active', name: 'Synthetic working manager' });
  await set(`customers/${prefix}-customer`, { companyId, name: 'Synthetic field customer', phone: '5550100000', address: 'Synthetic service property' });
  await set(`jobs/${jobId}`, { companyId, userId: ownerId, assignedTo: memberId || uid, assignedToUid: uid, customerId: `${prefix}-customer`, date: '2030-01-03', time: '10:00', estimatedDuration: 1, status: 'in-progress', updatedAt: '2030-01-03T17:00:00.000Z', latitude: 35, longitude: -119 });
  f.work = workDataHandlers(db); f.apply = offlineHandler(db); f.forms = serviceFormsHandler(db, { enabled: () => true }); f.locations = locationHandlers(db, { now: () => Date.parse('2030-01-03T18:00:00.000Z') });
  f.photo = jobPhotoHandler(db, () => ({ file: path => ({ save: async (bytes, options) => f.uploaded.push({ path, bytes, options }), getMetadata: async () => [{ size: jpeg.length, contentType: 'image/jpeg' }], download: async () => [jpeg] }) }));
  return f;
}
for (const role of ['owner', 'manager']) {
  test(`working ${role} records own notes, photos, checklist, chemicals, visit evidence and completion through existing APIs`, async () => {
    const f = await fixture(role), jobId = f.jobId;
    const own = await f.work.read(f.request({ resource: 'jobs', assignedTo: 'self', date: '2030-01-03' })); assert.deepEqual(own.jobs.map(job => job.id), [jobId]);
    const notePayload = { jobId, operationId: 'dual-field-note-operation-01', expectedVersion: '2030-01-03T17:00:00.000Z', patch: { notes: 'Synthetic offline field notes' } };
    const notes = await f.apply(f.request(notePayload)); assert.equal(notes.status, 'synced'); assert.deepEqual(await f.apply(f.request(notePayload)), notes);
    assert.equal((await db.doc(`jobs/${jobId}`).get()).get('workNotes'), 'Synthetic offline field notes');

    const photoPayload = { action: 'upload', jobId, operationId: 'dual-field-photo-operation-01', base64: jpeg.toString('base64'), caption: 'Synthetic visit evidence' };
    const photo = await f.photo(f.request(photoPayload)); assert.deepEqual(await f.photo(f.request(photoPayload)), photo); assert.equal(f.uploaded.length, 1);
    assert.equal(f.uploaded[0].options.metadata.cacheControl, 'private, no-store'); assert.equal(JSON.stringify(f.uploaded[0].options).includes('firebaseStorageDownloadTokens'), false);
    assert.match((await f.photo(f.request({ action: 'read', photoId: photo.id }))).dataUri, /^data:image\/jpeg;base64,/);
    const photoMetadata = (await f.work.read(f.request({ resource: 'photos', jobId }))).photos; assert.equal(photoMetadata.length, 1); assert.equal(photoMetadata[0].storagePath, undefined);

    await f.forms(f.request({ action: 'assign', jobId, templateId: template.id, templateVersion: template.version, expectedVersion: 0 }));
    const formPayload = { action: 'save', jobId, templateId: template.id, templateVersion: template.version, assignmentVersion: 1, expectedVersion: 0, operationId: 'dual-field-checklist-operation-01', status: 'completed', answers: { targetPest: 'Ants', findings: 'Synthetic inspection findings', inspection: template.fields.find(field => field.id === 'inspection').options, photos: [photo.id], technicianNotes: 'Synthetic checklist notes' } };
    assert.equal((await f.forms(f.request(formPayload))).status, 'synced'); assert.equal((await f.forms(f.request(formPayload))).duplicate, true);
    const reports = await f.forms(f.request({ action: 'read', jobId })); assert.equal(reports.form.status, 'completed'); assert.equal(reports.reports.length, 1);

    const applicationPayload = { jobId, operationId: 'dual-field-chemical-operation-01', record: { product: 'Synthetic test product', epaRegNo: 'SYNTHETIC-ONLY', targetPest: 'Ants', amount: 1, unit: 'test-units', notes: 'Synthetic record; no treatment performed', totalCost: 999 } };
    const chemical = await f.work.application(f.request(applicationPayload)); assert.deepEqual(await f.work.application(f.request(applicationPayload)), chemical);
    const logs = await f.work.read(f.request({ resource: 'serviceLogs', jobId })); assert.equal(logs.logs.length, 1); assert.equal(logs.logs[0].product, 'Synthetic test product'); assert.equal(logs.logs[0].totalCost, undefined);

    let workRevision = notes.version;
    for (const type of ['arrived', 'access-blocked', 'departed']) {
      const payload = { action: 'record', jobId, type, operationId: `dual-field-visit-${type}`, note: type === 'access-blocked' ? 'Synthetic locked gate; no visit performed' : 'Synthetic visit evidence' };
      const event = await f.locations.visit(f.request(payload)); assert.equal(event.event.source, 'manual'); assert.equal(event.event.verifiedAccess, false); assert.equal((await f.locations.visit(f.request(payload))).duplicate, true);
      assert.equal(event.status, 'synced'); assert.notEqual(event.version, workRevision); workRevision = event.version;
    }
    assert.equal((await f.locations.visit(f.request({ action: 'list', jobId }))).events.length, 3);

    await assert.rejects(f.locations.shift(f.request({ action: 'start' })), { code: 'failed-precondition' });
    const { shift } = await f.locations.shift(f.request({ action: 'start', trackingConsent: true })); assert.equal(shift.status, 'on-duty');
    const session = await f.locations.update(f.request({ action: 'start', shiftId: shift.id }));
    assert.equal((await f.locations.update(f.request({ action: 'position', sessionId: session.sessionId, latitude: 35, longitude: -119, accuracy: 10, capturedAt: '2030-01-03T18:00:00.000Z' }))).accepted, true);
    assert.equal((await f.locations.shift(f.request({ action: 'end', shiftId: shift.id }))).shift.status, 'off-duty');

    const completePayload = { jobId, operationId: 'dual-field-completion-operation-01', expectedVersion: workRevision, patch: { status: 'completed', completionNotes: 'Synthetic completion only', completedAt: '2030-01-03T18:00:00.000Z' } };
    const completion = await f.apply(f.request(completePayload)); assert.equal(completion.status, 'synced'); assert.deepEqual(await f.apply(f.request(completePayload)), completion);
    const completed = (await f.work.read(f.request({ resource: 'jobs', assignedTo: 'self', id: jobId }))).job; assert.equal(completed.status, 'completed'); assert.equal(completed.workNotes, 'Synthetic offline field notes');
  });
  test(`working ${role} field APIs remain tenant isolated and reject revoked access before replay`, async () => {
    const f = await fixture(role), foreign = await fixture(role);
    const calls = [
      () => f.work.read(f.request({ resource: 'jobs', assignedTo: 'self', id: foreign.jobId })),
      () => f.apply(f.request({ jobId: foreign.jobId, operationId: 'dual-denied-note-operation-01', expectedVersion: '2030-01-03T17:00:00.000Z', patch: { notes: 'Forbidden cross-company note' } })),
      () => f.photo(f.request({ action: 'upload', jobId: foreign.jobId, operationId: 'dual-denied-photo-operation-01', base64: jpeg.toString('base64') })),
      () => f.forms(f.request({ action: 'read', jobId: foreign.jobId })),
      () => f.work.application(f.request({ jobId: foreign.jobId, operationId: 'dual-denied-chemical-operation-01', record: { product: 'Synthetic', targetPest: 'Ants', amount: 1 } })),
      () => f.locations.visit(f.request({ action: 'record', jobId: foreign.jobId, operationId: 'dual-denied-visit', type: 'arrived' })),
    ];
    for (const call of calls) await assert.rejects(call(), { code: 'permission-denied' });
    assert.equal(f.uploaded.length, 0);
    if (role === 'manager') for (const capability of ['team.manage', 'ownership.transfer', 'integrations.manage', 'reports.financial', 'invoices.manage']) await assert.rejects(requireCapability(db, f.request({}), capability), { code: 'permission-denied' });
    const notePayload = { jobId: f.jobId, operationId: 'dual-revoked-note-operation-01', expectedVersion: '2030-01-03T17:00:00.000Z', patch: { notes: 'Synthetic saved note before revocation' } };
    await f.apply(f.request(notePayload));
    if (role === 'manager') await db.doc(`teamMembers/${f.memberId}`).update({ status: 'removed' });
    else await set(`rlAccountDeletions/${f.uid}`, { status: 'pending' });
    await assert.rejects(f.apply(f.request(notePayload)), { code: 'permission-denied' });
    await assert.rejects(f.work.read(f.request({ resource: 'jobs', assignedTo: 'self' })), { code: 'permission-denied' });
    await assert.rejects(f.photo(f.request({ action: 'upload', jobId: f.jobId, operationId: 'dual-revoked-photo-operation-01', base64: jpeg.toString('base64') })), { code: 'permission-denied' });
    await assert.rejects(f.forms(f.request({ action: 'read', jobId: f.jobId })), { code: 'permission-denied' });
    await assert.rejects(f.locations.shift(f.request({ action: 'start', trackingConsent: true })), { code: 'permission-denied' });
  });
}
