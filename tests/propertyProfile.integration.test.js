// Synthetic local Firestore only. No real customer, Storage, or provider writes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { propertyProfileHandler } = require('../functions/propertyProfile');
const { jobPhotoHandler } = require('../functions/jobPhotos');

let app, db;
const id = `property-profile-${process.pid}`, owner = `${id}-owner`, tech = `${id}-tech`, otherTech = `${id}-other-tech`, manager = `${id}-manager`;
const customerId = `${id}-customer`, otherCustomerId = `${id}-other`, jobId = `${id}-job`;
const files = new Map(), bucket = { file: path => ({ save: async bytes => { files.set(path, bytes); }, getMetadata: async () => [{ size: files.get(path)?.length || 4, contentType: 'image/jpeg' }], download: async () => [files.get(path) || Buffer.from([0xff, 0xd8, 0xff, 0xd9])] }) };
const api = () => propertyProfileHandler(db, () => bucket);
const request = (data, role = 'owner', companyId = id) => ({ data: { customerId, propertyId: 'home', ...data }, auth: { uid: role === 'owner' ? owner : role === 'manager' ? manager : tech, token: { companyId, role, membershipId: role === 'manager' ? manager : tech, email_verified: true, email: `${role}@example.test` } } });
before(async () => {
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, `property-profile-${process.pid}`); db = getFirestore(app);
  await db.doc(`companies/${id}`).set({ ownerId: owner, name: 'Synthetic only' });
  await db.doc(`teamMembers/${tech}`).set({ uid: tech, companyId: id, role: 'technician', status: 'active' });
  await db.doc(`teamMembers/${otherTech}`).set({ uid: otherTech, companyId: id, role: 'technician', status: 'active' });
  await db.doc(`teamMembers/${manager}`).set({ uid: manager, companyId: id, role: 'manager', status: 'active' });
  await db.doc(`customers/${customerId}`).set({ companyId: id, name: 'Synthetic person', serviceProperties: [{ id: 'home', label: 'Home', address: '10 Example Street', accessInstructions: 'Gate A', alerts: [{ id: 'alert-1', version: 1, active: true, severity: 'critical', title: 'Gate', description: 'Check lock' }] }, { id: 'office', label: 'Office', address: '20 Example Street', alerts: [] }] });
  await db.doc(`customers/${otherCustomerId}`).set({ companyId: 'other-company', name: 'Other', serviceProperties: [{ id: 'home', address: '30 Example Street' }] });
  await db.doc(`jobs/${jobId}`).set({ companyId: id, customerId, servicePropertyId: 'home', assignedTo: tech, status: 'completed', serviceType: 'Synthetic service', date: '2030-01-02', actualWorkDone: 'Internal completed work' });
  await db.doc(`jobs/${id}-office`).set({ companyId: id, customerId, servicePropertyId: 'office', assignedTo: tech, status: 'completed', date: '2030-01-03' });
  await db.doc(`jobs/${id}-other-tech`).set({ companyId: id, customerId, servicePropertyId: 'home', assignedTo: otherTech, status: 'scheduled', date: '2030-01-05' });
  await db.doc(`jobs/${id}-ambiguous`).set({ companyId: id, customerId, address: '10 Example Street', assignedTo: tech, status: 'completed', date: '2030-01-04' });
  await db.doc(`photos/${id}-job-photo`).set({ companyId: id, jobId, customerId, storagePath: `rlJobPhotos/${id}/${jobId}/evidence.jpg` });
  await db.doc(`serviceLogs/${id}-material`).set({ companyId: id, jobId, customerId, product: 'Synthetic material', amount: 2, unit: 'oz', areaTreated: 'Rear yard', method: 'Spot', applicationDate: '2030-01-02' });
});
after(async () => {
  const cleanup = async collection => { const rows = await db.collection(collection).get(); for (const row of rows.docs) if (row.id.startsWith(id)) await row.ref.delete(); };
  for (const collection of ['customers', 'jobs', 'photos', 'serviceLogs', 'rlAudit', 'rlRateLimits']) await cleanup(collection);
  const refs = await db.collection(`customers/${customerId}/rlPropertyReferences`).get(); for (const row of refs.docs) await row.ref.delete();
  await db.doc(`teamMembers/${tech}`).delete(); await db.doc(`teamMembers/${otherTech}`).delete(); await db.doc(`teamMembers/${manager}`).delete(); await db.doc(`companies/${id}`).delete();
  await deleteApp(app);
});

test('explicit property IDs isolate overview, alerts, service and material history', async () => {
  const handler = api(), overview = await handler(request({ action: 'overview' }));
  assert.equal(overview.property.address, '10 Example Street'); assert.equal(overview.alerts.length, 1);
  assert.equal(overview.lastCompleted.id, jobId);
  const history = await handler(request({ action: 'history' }));
  assert.deepEqual(history.rows.map(row => row.id), [jobId]);
  const materials = await handler(request({ action: 'materials' }));
  assert.equal(materials.rows.length, 1); assert.equal(materials.rows[0].product, 'Synthetic material');
  const office = await handler(request({ action: 'history', propertyId: 'office' }));
  assert.deepEqual(office.rows.map(row => row.id), [`${id}-office`]);
});

test('technician needs assignment and exact property; cross-company is denied', async () => {
  const handler = api();
  await assert.rejects(handler(request({ action: 'overview' }, 'technician')), /assigned job/i);
  await assert.rejects(handler(request({ action: 'overview', jobId, propertyId: 'office' }, 'technician')), /not attached/i);
  assert.equal((await handler(request({ action: 'overview', jobId }, 'technician'))).property.id, 'home');
  await assert.rejects(handler(request({ action: 'overview', customerId: otherCustomerId })), /unavailable/i);
});

test('job evidence reuse is proposed, approved by management, and retained after archive', async () => {
  const handler = api(), operationId = 'property-photo-proposal-01';
  const proposed = await handler(request({ action: 'propose', jobId, photoId: `${id}-job-photo`, operationId, category: 'entrance', caption: 'Gate', }, 'technician'));
  assert.equal(proposed.photo.status, 'proposed');
  assert.equal((await handler(request({ action: 'listPhotos', jobId }, 'technician'))).photos.some(row => row.id === proposed.photo.id && row.status === 'proposed'), true);
  const otherRequest = data => ({ ...request({ action: 'listPhotos', jobId: `${id}-other-tech`, ...data }, 'technician'), auth: { uid: otherTech, token: { companyId: id, role: 'technician', membershipId: otherTech, email_verified: true, email: 'other@example.test' } } });
  assert.equal((await handler(otherRequest())).photos.some(row => row.id === proposed.photo.id), false);
  const deletePhoto = jobPhotoHandler(db, () => ({ file: () => ({ delete: async () => { throw Error('Referenced evidence must not be deleted.'); } }) }));
  await assert.rejects(deletePhoto(request({ action: 'delete', photoId: `${id}-job-photo` })), /also a property reference/i);
  assert.equal((await handler(request({ action: 'propose', jobId, photoId: `${id}-job-photo`, operationId, category: 'entrance' }, 'technician'))).photo.id, proposed.photo.id);
  await assert.rejects(handler(request({ action: 'propose', jobId, photoId: `${id}-different-photo`, operationId, category: 'entrance' }, 'technician')), /another image/i);
  await assert.rejects(handler(request({ action: 'readPhoto', jobId, photoId: proposed.photo.id }, 'technician')), /awaiting approval/i);
  assert.match((await handler(request({ action: 'readPhoto', photoId: proposed.photo.id }, 'manager'))).dataUri, /^data:image\/jpeg;base64,/);
  await assert.rejects(handler(request({ action: 'approve', jobId, photoId: proposed.photo.id }, 'technician')), /role does not allow/i);
  await handler(request({ action: 'approve', photoId: proposed.photo.id }, 'manager'));
  assert.equal((await handler(otherRequest())).photos.some(row => row.id === proposed.photo.id && row.status === 'approved'), true);
  assert.match((await handler(request({ action: 'readPhoto', jobId, photoId: proposed.photo.id }, 'technician'))).dataUri, /^data:image\/jpeg;base64,/);
  await handler(request({ action: 'archive', photoId: proposed.photo.id }, 'manager'));
  await assert.rejects(deletePhoto(request({ action: 'delete', photoId: `${id}-job-photo` })), /also a property reference/i);
  assert.equal((await db.doc(`photos/${id}-job-photo`).get()).exists, true);
  assert.equal((await handler(request({ action: 'listPhotos' }))).photos[0].status, 'archived');
  const rejected = await handler(request({ action: 'propose', jobId, photoId: `${id}-job-photo`, operationId: 'property-photo-proposal-02', category: 'exterior' }, 'technician'));
  assert.equal((await handler(request({ action: 'archive', photoId: rejected.photo.id }, 'manager'))).status, 'rejected');
  assert.equal((await handler(request({ action: 'archive', photoId: rejected.photo.id }, 'manager'))).status, 'rejected');
  assert.equal((await handler(request({ action: 'listPhotos', jobId }, 'technician'))).photos.some(row => row.id === rejected.photo.id && row.status === 'rejected'), true);
  assert.equal((await handler(otherRequest())).photos.some(row => row.id === rejected.photo.id), false);
});

test('management upload uses private tenant path and cannot be read across properties', async () => {
  const handler = api(), jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  const created = await handler(request({ action: 'upload', operationId: 'management-upload-0001', category: 'safety', caption: 'Synthetic', base64: jpeg }));
  assert.equal(created.photo.status, 'approved');
  assert.ok([...files.keys()].some(path => path.startsWith(`rlPropertyReferences/${id}/${customerId}/home/`)));
  await assert.rejects(handler(request({ action: 'readPhoto', propertyId: 'office', photoId: created.photo.id })), /unavailable/i);
  assert.match((await handler(request({ action: 'readPhoto', photoId: created.photo.id }))).dataUri, /^data:image\/jpeg;base64,/);
});

test('service history pages explicit property links without including another property or address-only legacy work', async () => {
  const batch = db.batch();
  for (let index = 0; index < 12; index++) batch.set(db.doc(`jobs/${id}-page-${String(index).padStart(2, '0')}`), {
    companyId: id, customerId, servicePropertyId: index % 3 === 0 ? 'office' : 'home',
    status: 'completed', date: `2031-01-${String(index + 1).padStart(2, '0')}`, serviceType: 'Synthetic visit',
  });
  await batch.commit();
  const handler = api(), seen = new Set();
  let after = null, pages = 0;
  do {
    const result = await handler(request({ action: 'history', limit: 3, ...(after ? { after } : {}) }));
    for (const row of result.rows) { assert.equal(seen.has(row.id), false); seen.add(row.id); }
    after = result.next; pages++;
    assert.ok(pages < 20, 'pagination must terminate');
  } while (after);
  assert.equal(seen.size, 9);
  assert.equal(seen.has(`${id}-ambiguous`), false);
  assert.equal(seen.has(`${id}-page-00`), false);
  assert.equal((await handler(request({ action: 'overview' }))).lastCompleted.date, '2031-01-12');
});
