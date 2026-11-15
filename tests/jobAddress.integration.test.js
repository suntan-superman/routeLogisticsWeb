// Synthetic records and an injected geocoder only. Never connects to production.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore, Timestamp } = req('firebase-admin/firestore');
const { workDataHandlers, projectCustomer } = require('../functions/workData');
const { serviceAreaHandlers } = require('../functions/serviceAreas');
const { hash } = require('../functions/security');

const OLD_VERSION = '2026-11-15T00:00:00.000Z';
const OPERATING = '100 Synthetic Operating Street, Example, CA 93312';
const PROPERTY = '200 Synthetic Service Street, Example, CA 93312';
const OUTSIDE = '900 Synthetic Outside Street, Example, CA 90001';
let app, db, sequence = 0;
const paths = new Set(), scopes = [];
const set = (path, value) => { paths.add(path); return db.doc(path).set(value); };
const get = async path => (await db.doc(path).get()).data();
before(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator is required; production address writes are prohibited.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'job-address-tests'); db = getFirestore(app);
});
after(async () => {
  if (!db) return;
  for (const scope of scopes) {
    for (const collection of ['jobs', 'rlAudit', 'rlServiceAreaAudit', 'rlServiceAreaGeocodes']) {
      const rows = await db.collection(collection).where(scope.solo ? 'userId' : 'companyId', '==', scope.solo ? scope.uid : scope.id).get();
      for (const row of rows.docs) await row.ref.delete();
    }
    if (scope.solo) {
      const audits = await db.collection('rlAudit').where('actorId', '==', scope.uid).get();
      for (const row of audits.docs) await row.ref.delete();
    }
    for (const actor of scope.actors) await db.doc(`rlRateLimits/${hash('job-manage:' + actor)}`).delete();
  }
  for (const path of paths) await db.doc(path).delete();
  await deleteApp(app);
});

async function fixture({ configured = true, solo = false, updatedAt = OLD_VERSION } = {}) {
  const id = `job-address-${++sequence}`, uid = `${id}-owner`, customerId = `${id}-customer`;
  const actors = [uid, ...['admin', 'manager', 'technician'].map(role => `${id}-${role}`)];
  scopes.push({ id, uid, solo, actors });
  await set(`users/${uid}`, { name: 'Synthetic address owner', ...(solo ? {} : { rlCompanyId: id }) });
  if (!solo) await set(`companies/${id}`, { ownerId: uid, name: 'Synthetic property provider', serviceCategories: ['Pest Control'] });
  const original = { userId: uid, ...(solo ? {} : { companyId: id }), name: 'Synthetic property customer', address: '10 Original Street', city: 'Original City', state: 'CA', zipCode: '93301', postalCode: '93301', latitude: 34, longitude: -118, location: { latitude: 34, longitude: -118 }, phone: '555-0100', totalSpent: 12345, notes: 'Retain business information', updatedAt };
  await set(`customers/${customerId}`, original);
  for (const role of ['admin', 'manager', 'technician']) if (!solo) await set(`teamMembers/${id}-${role}`, { uid: `${id}-${role}`, companyId: id, role, status: 'active' });
  const auth = role => ({ uid: role === 'owner' ? uid : `${id}-${role}`, token: { email_verified: true, email: `${role}@example.test`, ...(solo ? {} : { companyId: id, role, ...(role !== 'owner' ? { membershipId: `${id}-${role}` } : {}) }) } });
  const request = (data, role = 'owner') => ({ auth: auth(role), data });
  let calls = 0, hook;
  const area = serviceAreaHandlers(db, { geocode: async address => {
    calls++;
    if (hook) { const next = hook; hook = null; await next(); }
    if (address.includes('Unresolved')) throw new Error('Synthetic address lookup failure');
    return { formattedAddress: address, latitude: address === OUTSIDE ? 34 : 35, longitude: -119, postalCode: address === OUTSIDE ? '90001' : '93312', countryCode: 'US', locationType: 'ROOFTOP', streetAddressVerified: true };
  } });
  if (configured && !solo) {
    paths.add(`rlServiceAreas/${id}`);
    await area.handle(request({ action: 'save', expectedRevision: 0, settings: { operatingAddress: OPERATING, method: 'zip', zipCodes: ['93312'], radiusMiles: 25, categoryOverrides: [], acceptingNewCustomers: true, publishCoverage: false, allowOutOfAreaRequests: true } }));
  }
  const work = workDataHandlers(db, { serviceAreas: area });
  const job = patch => ({ customerId, serviceType: 'Synthetic inspection', serviceCategory: 'Pest Control', serviceProperty: { address: PROPERTY }, date: '2030-01-02', time: '09:00', ...patch });
  const save = patch => ({ action: 'create', job: job(), saveCustomerAddress: true, expectedCustomerVersion: OLD_VERSION, ...patch });
  return { id, uid, customerId, original, work, job, save, request, calls: () => calls, onGeocode: value => { hook = value; } };
}

test('ordinary scheduling and explicit one-off changes do not modify the saved customer address', async () => {
  const f = await fixture(), before = await get(`customers/${f.customerId}`);
  for (const saveCustomerAddress of [undefined, false]) {
    const saved = await f.work.manageJob(f.request({ action: 'create', job: f.job(), ...(saveCustomerAddress === undefined ? {} : { saveCustomerAddress }) }));
    assert.equal(saved.customerAddressUpdated, undefined);
    assert.equal((await get(`jobs/${saved.id}`)).address, PROPERTY);
  }
  assert.deepEqual(await get(`customers/${f.customerId}`), before);
  assert.equal((await db.collection('rlAudit').where('companyId', '==', f.id).where('action', '==', 'customer.address.update').get()).size, 0);
});

test('owners, administrators and managers explicitly save validated customer and job addresses atomically', async () => {
  for (const role of ['owner', 'admin', 'manager']) {
    const f = await fixture(), before = await get(`customers/${f.customerId}`);
    const saved = await f.work.manageJob(f.request(f.save({ job: f.job({ latitude: 0, longitude: 0, serviceProperty: { address: PROPERTY, latitude: 0, longitude: 0, validated: true } }) }), role));
    const customer = await get(`customers/${f.customerId}`), job = await get(`jobs/${saved.id}`);
    assert.equal(saved.customerAddressUpdated, true); assert.equal(customer.updatedAt, saved.customerUpdatedAt);
    assert.equal(customer.address, PROPERTY); assert.equal(job.address, PROPERTY); assert.equal(customer.latitude, 35); assert.equal(customer.longitude, -119);
    assert.deepEqual(customer.location, { latitude: 35, longitude: -119 });
    for (const field of ['city', 'state', 'zipCode', 'postalCode']) assert.equal(customer[field], '');
    assert.equal(customer.totalSpent, before.totalSpent); assert.equal(customer.notes, before.notes); assert.equal(customer.phone, before.phone);
    const audits = await db.collection('rlAudit').where('companyId', '==', f.id).where('action', '==', 'customer.address.update').get();
    assert.equal(audits.size, 1); assert.equal(audits.docs[0].get('original.address'), before.address); assert.equal(audits.docs[0].get('customerId'), f.customerId);
  }
});

test('technicians, foreign customers and forged target IDs cannot alter saved addresses', async () => {
  const f = await fixture(), before = await get(`customers/${f.customerId}`);
  await assert.rejects(f.work.manageJob(f.request(f.save(), 'technician')), { code: 'permission-denied' });
  await set(`customers/${f.id}-foreign`, { companyId: `${f.id}-other`, name: 'Retained other tenant', address: 'Foreign address', updatedAt: OLD_VERSION });
  await assert.rejects(f.work.manageJob(f.request(f.save({ job: f.job({ customerId: `${f.id}-foreign` }) }))), { code: 'permission-denied' });
  // An extra top-level customer target has no authority over the selected job customer.
  await f.work.manageJob(f.request(f.save({ customerId: `${f.id}-foreign` })));
  assert.equal((await get(`customers/${f.id}-foreign`)).address, 'Foreign address');
  assert.equal((await get(`customers/${f.customerId}`)).totalSpent, before.totalSpent);
});

test('permanent address writes require an explicit boolean choice, property and customer version', async () => {
  const f = await fixture(), before = await get(`customers/${f.customerId}`);
  for (const patch of [{ saveCustomerAddress: 'true' }, { expectedCustomerVersion: undefined }, { expectedCustomerVersion: { seconds: 1 } }, { job: f.job({ serviceProperty: undefined }) }, { job: f.job({ customerId: undefined }) }]) {
    const data = f.save(patch); if (patch.expectedCustomerVersion === undefined && Object.hasOwn(patch, 'expectedCustomerVersion')) delete data.expectedCustomerVersion;
    await assert.rejects(f.work.manageJob(f.request(data)), { code: 'invalid-argument' });
  }
  for (const action of ['delete', 'assign']) await assert.rejects(f.work.manageJob(f.request(f.save({ action }))), { code: 'permission-denied' });
  assert.deepEqual(await get(`customers/${f.customerId}`), before);
  assert.equal((await db.collection('jobs').where('companyId', '==', f.id).get()).size, 0);
});

test('a stale customer version aborts the entire save, including an existing job update', async () => {
  const f = await fixture(), first = await f.work.manageJob(f.request({ action: 'create', job: f.job() }));
  const beforeJob = await get(`jobs/${first.id}`);
  await db.doc(`customers/${f.customerId}`).update({ address: 'Another user saved this address', updatedAt: '2026-11-15T01:00:00.000Z' });
  await assert.rejects(f.work.manageJob(f.request(f.save({ action: 'update', id: first.id, expectedVersion: first.updatedAt, job: f.job({ notes: 'Must not commit' }) }))), { code: 'aborted' });
  assert.deepEqual(await get(`jobs/${first.id}`), beforeJob);
  assert.equal((await get(`customers/${f.customerId}`)).address, 'Another user saved this address');
  assert.equal((await db.collection('rlAudit').where('companyId', '==', f.id).where('action', '==', 'customer.address.update').get()).size, 0);
});

test('invalid, unresolved and outside properties cannot update customer records or create jobs', async () => {
  const f = await fixture(), before = await get(`customers/${f.customerId}`);
  for (const address of [OUTSIDE, '999 Unresolved Property, Example, CA 93312']) await assert.rejects(f.work.manageJob(f.request(f.save({ job: f.job({ serviceProperty: { address } }) }))), { code: 'failed-precondition' });
  assert.deepEqual(await get(`customers/${f.customerId}`), before);
  assert.equal((await db.collection('jobs').where('companyId', '==', f.id).get()).size, 0);
});

test('saving a permanent address never rewrites historical jobs or service plans', async () => {
  const f = await fixture(), history = { companyId: f.id, customerId: f.customerId, address: 'Historical visit property', status: 'completed' };
  const plan = { companyId: f.id, customerId: f.customerId, address: 'Existing plan property', serviceProperty: { address: 'Existing plan property' } };
  await set(`jobs/${f.id}-history`, history); await set(`servicePlans/${f.id}-plan`, plan);
  await f.work.manageJob(f.request(f.save()));
  assert.deepEqual(await get(`jobs/${f.id}-history`), history); assert.deepEqual(await get(`servicePlans/${f.id}-plan`), plan);
});

test('concurrent permanent creates using one customer version produce one job and one address audit', async () => {
  const f = await fixture(), results = await Promise.allSettled([f.work.manageJob(f.request(f.save())), f.work.manageJob(f.request(f.save()))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'aborted');
  assert.equal((await db.collection('jobs').where('companyId', '==', f.id).get()).size, 1);
  assert.equal((await db.collection('rlAudit').where('companyId', '==', f.id).where('action', '==', 'customer.address.update').get()).size, 1);
});

test('membership and customer tenancy are rechecked after geocoding and before the transaction commits', async () => {
  for (const kind of ['membership', 'customer', 'deleted']) {
    const f = await fixture();
    f.onGeocode(() => kind === 'membership' ? db.doc(`teamMembers/${f.id}-manager`).update({ status: 'inactive' }) : kind === 'customer' ? db.doc(`customers/${f.customerId}`).update({ companyId: `${f.id}-other` }) : set(`rlAccountDeletions/${f.id}-manager`, { status: 'pending' }));
    await assert.rejects(f.work.manageJob(f.request(f.save(), 'manager')), { code: 'permission-denied' });
    assert.equal((await db.collection('jobs').where('companyId', '==', f.id).get()).size, 0);
    assert.equal((await get(`customers/${f.customerId}`)).address, f.original.address);
  }
});

test('unconfigured coverage stores the explicit new address while discarding old and spoofed coordinates', async () => {
  const f = await fixture({ configured: false });
  const saved = await f.work.manageJob(f.request(f.save({ job: f.job({ serviceProperty: { address: PROPERTY, latitude: 0, longitude: 0, validated: true } }) })));
  const customer = await get(`customers/${f.customerId}`), job = await get(`jobs/${saved.id}`);
  assert.equal(f.calls(), 0); assert.equal(customer.address, PROPERTY);
  assert.equal(customer.latitude, null); assert.equal(customer.longitude, null); assert.equal(customer.location, null);
  assert.equal(job.serviceProperty.validated, false); assert.equal(job.latitude, null);
});

test('a solo owner can atomically update their own saved customer address through the callable', async () => {
  const f = await fixture({ solo: true });
  const saved = await f.work.manageJob(f.request(f.save()));
  assert.equal((await get(`customers/${f.customerId}`)).address, PROPERTY);
  assert.equal((await get(`jobs/${saved.id}`)).userId, f.uid); assert.equal(saved.customerAddressUpdated, true);
});

test('a concurrent solo job customer change cannot redirect a permanent update to the previous customer', async () => {
  const f = await fixture({ solo: true }), jobId = `${f.id}-changing-job`, secondCustomer = `${f.id}-replacement-customer`;
  const jobRef = db.doc(`jobs/${jobId}`);
  await set(`customers/${secondCustomer}`, { userId: f.uid, address: 'Replacement customer address', updatedAt: OLD_VERSION });
  await set(`jobs/${jobId}`, { userId: f.uid, customerId: f.customerId, address: 'Original job address', updatedAt: OLD_VERSION });
  let change = true;
  const changingDb = new Proxy(db, { get(target, key) {
    if (key === 'doc') return path => {
      const ref = target.doc(path);
      if (path === `jobs/${jobId}`) {
        const read = ref.get.bind(ref);
        ref.get = async () => {
          const snapshot = await read();
          if (change) { change = false; await jobRef.update({ customerId: secondCustomer, updatedAt: '2026-11-15T01:00:00.000Z' }); }
          return snapshot;
        };
      }
      return ref;
    };
    const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const api = workDataHandlers(changingDb);
  await assert.rejects(api.manageJob(f.request(f.save({ action: 'update', id: jobId, job: { serviceProperty: { address: PROPERTY } } }))), { code: 'aborted' });
  assert.equal((await get(`customers/${f.customerId}`)).address, f.original.address);
  assert.equal((await get(`customers/${secondCustomer}`)).address, 'Replacement customer address');
  assert.equal((await get(`jobs/${jobId}`)).customerId, secondCustomer);
});

test('customer projections expose stable optimistic versions for legacy timestamps and dates', async () => {
  for (const role of ['owner', 'admin', 'manager']) for (const updatedAt of [OLD_VERSION, new Date(OLD_VERSION), Timestamp.fromDate(new Date(OLD_VERSION)), { _seconds: Date.parse(OLD_VERSION) / 1000, _nanoseconds: 0 }, Date.parse(OLD_VERSION), Date.parse(OLD_VERSION) / 1000]) {
    const projected = projectCustomer('synthetic', { companyId: 'synthetic', updatedAt, address: { street: '10 Saved Street', postalCode: '93312' } }, role);
    assert.equal(projected.updatedAt, OLD_VERSION); assert.equal(projected.address.postalCode, '93312');
  }
  assert.equal(projectCustomer('synthetic', {}, 'owner').updatedAt, null);
  assert.equal(projectCustomer('synthetic', { updatedAt: { seconds: NaN } }, 'owner').updatedAt, null);
});
