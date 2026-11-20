// Local synthetic records, injected Google responses, and no provider/network calls.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { HttpsError } = req('firebase-functions/v2/https');
const { customerAddressHandlers } = require('../functions/customerAddresses');
const { customerHandlers } = require('../functions/customers');
const { serviceAreaHandlers, createGoogleGeocoder } = require('../functions/serviceAreas');
const { workDataHandlers } = require('../functions/workData');
const { hash } = require('../functions/security');
const VERSION = '2026-11-15T00:00:00.000Z';
const ORIGINAL = '10 Original Street, Example, CA 93301';
const VALID = '200 Synthetic Service Street, Example, CA 93312';
const CORRECTION = '200 Synthetic Servce Street, Example, CA 93312';
let app, db, sequence = 0;
const fixtures = [], paths = new Set();
const set = (path, data) => { paths.add(path); return db.doc(path).set(data); };
before(() => {
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Only local Firestore emulator address writes are authorized.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'customer-address-tests'); db = getFirestore(app);
});
after(async () => {
  if (!db) return;
  for (const f of fixtures) {
    for (const collection of ['customers', 'jobs', 'rlAudit', 'rlServiceAreaGeocodes']) {
      const rows = await db.collection(collection).where(f.solo ? 'userId' : 'companyId', '==', f.solo ? f.uid : f.id).get();
      for (const row of rows.docs) await row.ref.delete();
    }
    const audits = await db.collection('rlAudit').where('actorId', '==', f.uid).get();
    for (const row of audits.docs) await row.ref.delete();
    for (const actor of f.actors) for (const action of ['customer-manage', 'customer-import', 'job-manage']) await db.doc(`rlRateLimits/${hash(`${action}:${actor}`)}`).delete();
  }
  for (const path of paths) await db.doc(path).delete();
  await deleteApp(app);
});
async function fixture({ solo = false, geocode } = {}) {
  const id = `customer-address-${process.pid}-${++sequence}`, uid = `${id}-owner`, customerId = `${id}-customer`, actors = [uid, `${id}-manager`, `${id}-technician`];
  fixtures.push({ id, uid, actors, solo });
  await set(`users/${uid}`, solo ? { name: 'Synthetic solo owner' } : { rlCompanyId: id });
  if (!solo) {
    await set(`companies/${id}`, { ownerId: uid, name: 'Synthetic address provider' });
    for (const role of ['manager', 'technician']) await set(`teamMembers/${id}-${role}`, { companyId: id, uid: `${id}-${role}`, role, status: 'active' });
  }
  const original = { name: 'Synthetic customer', address: ORIGINAL, userId: uid, ...(solo ? {} : { companyId: id }), phone: '555-0100', notes: 'Preserve existing details', totalSpent: 12345, quickbooksId: 'existing-mapping', updatedAt: VERSION };
  await set(`customers/${customerId}`, original);
  let calls = 0, hook;
  const areas = serviceAreaHandlers(db, { geocode: async address => {
    calls++;
    if (hook) { const callback = hook; hook = null; await callback(); }
    if (geocode) return geocode(address);
    if (address === CORRECTION) throw new HttpsError('failed-precondition', 'Review correction.', { addressValidation: { status: 'confirmation-required', suggestedAddress: VALID } });
    if (address.includes('Unavailable')) throw new HttpsError('unavailable', 'PRIVATE PROVIDER ERROR');
    if (address.includes('Invalid')) throw new HttpsError('failed-precondition', 'PRIVATE PROVIDER ERROR');
    return { formattedAddress: address, latitude: 35, longitude: -119, postalCode: '93312', countryCode: 'US', locationType: 'PREMISE', streetAddressVerified: true };
  } });
  const api = customerAddressHandlers(db, { serviceAreas: areas }), work = workDataHandlers(db, { serviceAreas: areas });
  const request = (data, role = 'owner') => ({ data, auth: { uid: role === 'owner' ? uid : `${id}-${role}`, token: { email_verified: true, email: `${id}-${role}@example.test`, ...(solo ? {} : { companyId: id, role, ...(role !== 'owner' ? { membershipId: `${id}-${role}` } : {}) }) } } });
  const update = (customer, extra = {}) => ({ action: 'update', id: customerId, expectedVersion: VERSION, customer, ...extra });
  return { id, uid, customerId, original, areas, api, work, request, update, calls: () => calls, onGeocode: callback => { hook = callback; } };
}
test('new customer addresses are verified in company and solo workspaces; client coordinates and financial fields cannot be asserted', async () => {
  for (const solo of [false, true]) {
    const f = await fixture({ solo }), result = await f.api.handle(f.request({ action: 'create', customer: { name: 'New synthetic customer', address: VALID, latitude: 0, longitude: 0, totalSpent: 999, addressValidation: { validated: true } } }));
    const saved = (await db.doc(`customers/${result.id}`).get()).data();
    assert.equal(f.calls(), 1); assert.equal(saved.address, VALID); assert.equal(saved.latitude, 35); assert.equal(saved.totalSpent, 0); assert.equal(saved.addressValidation.source, 'google-address-validation'); assert.equal(saved.userId, f.uid);
    assert.equal(result.customer.updatedAt, result.updatedAt);
  }
});
test('contact-only creates and non-address updates preserve historical unverified addresses without a lookup', async () => {
  const f = await fixture();
  await f.api.handle(f.request({ action: 'create', customer: { name: 'Contact only', address: '', email: 'contact@example.test' } }));
  const saved = await f.api.handle(f.request(f.update({ name: 'Changed display name', phone: '555-0101' })));
  assert.equal(f.calls(), 0); assert.equal(saved.customer.address, ORIGINAL); assert.equal(saved.customer.totalSpent, 12345);
});
test('changed addresses require the captured version and preserve finance/mapping fields; manager results stay redacted', async () => {
  const f = await fixture(), data = f.update({ address: VALID, city: '', state: '', zipCode: '', totalSpent: 1 });
  const result = await f.api.handle(f.request(data, 'manager')), current = (await db.doc(`customers/${f.customerId}`).get()).data();
  assert.equal(f.calls(), 1); assert.equal(current.address, VALID); assert.equal(current.totalSpent, 12345); assert.equal(current.quickbooksId, 'existing-mapping'); assert.equal(result.customer.totalSpent, undefined); assert.equal(result.customer.quickbooksId, undefined);
  assert.equal(result.customer.updatedAt, result.updatedAt);
  const g = await fixture(); const missingVersion = g.update({ address: VALID }); delete missingVersion.expectedVersion;
  await assert.rejects(g.api.handle(g.request(missingVersion)), { code: 'invalid-argument' }); assert.equal(g.calls(), 0);
});
test('correction is returned without changing the customer and only a separate resubmission saves it', async () => {
  const f = await fixture();
  await assert.rejects(f.api.handle(f.request(f.update({ address: CORRECTION }))), error => error.details.addressValidation.status === 'confirmation-required' && error.details.addressValidation.suggestedAddress === VALID);
  assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(), f.original);
  const saved = await f.api.handle(f.request(f.update({ address: VALID }))); assert.equal(saved.customer.address, VALID); assert.equal(f.calls(), 2);
});
test('unavailable, invalid and empty replacement addresses fail visibly without changing stored records', async () => {
  for (const address of ['100 Unavailable Street, Example, CA 93312', '100 Invalid Street, Example, CA 93312', '']) {
    const f = await fixture();
    await assert.rejects(f.api.handle(f.request(f.update({ address }))), error => ['unavailable', 'failed-precondition'].includes(error.code) && !!error.details?.addressValidation && !JSON.stringify(error).includes('PRIVATE PROVIDER'));
    assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(), f.original);
  }
});
test('stale versions and concurrent customer changes cannot overwrite the saved address', async () => {
  const f = await fixture(); await db.doc(`customers/${f.customerId}`).update({ updatedAt: '2026-11-15T00:01:00.000Z', notes: 'Another editor' });
  await assert.rejects(f.api.handle(f.request(f.update({ address: VALID }))), { code: 'aborted' });
  assert.equal((await db.doc(`customers/${f.customerId}`).get()).get('address'), ORIGINAL);
  const g = await fixture(); g.onGeocode(() => db.doc(`customers/${g.customerId}`).update({ notes: 'Concurrent unversioned legacy editor' }));
  await assert.rejects(g.api.handle(g.request(g.update({ address: VALID }))), { code: 'aborted' });
  assert.equal((await db.doc(`customers/${g.customerId}`).get()).get('notes'), 'Concurrent unversioned legacy editor');
});
test('technicians, cross-tenant targets and portal identities are rejected before a Google lookup', async () => {
  const f = await fixture(), other = await fixture();
  await assert.rejects(f.api.handle(f.request(f.update({ address: VALID }), 'technician')), { code: 'permission-denied' });
  await assert.rejects(f.api.handle(f.request(f.update({ address: VALID }, { id: other.customerId }))), { code: 'permission-denied' });
  const portal = f.request({ action: 'validate', address: VALID }); portal.auth.token.portal = true;
  await assert.rejects(f.api.handle(portal), { code: 'unauthenticated' }); assert.equal(f.calls(), 0);
});
test('revoked membership, deletion markers and ownership changes during validation cannot commit', async () => {
  for (const kind of ['member', 'deletion', 'owner']) {
    const f = await fixture(); f.onGeocode(() => kind === 'member' ? db.doc(`teamMembers/${f.id}-manager`).update({ status: 'inactive' }) : kind === 'deletion' ? set(`rlAccountDeletions/${f.id}-manager`, { status: 'pending' }) : db.doc(`companies/${f.id}`).update({ ownerId: 'different-owner' }));
    await assert.rejects(f.api.handle(f.request(f.update({ address: VALID }), kind === 'owner' ? 'owner' : 'manager')), { code: 'permission-denied' });
    assert.equal((await db.doc(`customers/${f.customerId}`).get()).get('address'), ORIGINAL);
  }
});
test('cache is private by tenant and reuses only verified addresses', async () => {
  const f = await fixture(), g = await fixture();
  const result = await f.api.handle(f.request({ action: 'validate', address: VALID })); assert.equal(result.property.latitude, 35);
  await f.api.handle(f.request(f.update({ address: VALID }))); assert.equal(f.calls(), 1);
  await g.api.handle(g.request({ action: 'validate', address: VALID })); assert.equal(g.calls(), 1);
  const rows = await db.collection('rlServiceAreaGeocodes').where('companyId', '==', f.id).get(); assert.equal(rows.size, 1);
});
test('unconfigured legacy job-address inputs are Google verified; unchanged ETA/date edits do not revalidate', async () => {
  const f = await fixture();
  const result = await f.work.manageJob(f.request({ action: 'create', job: { customerId: f.customerId, address: VALID, date: '2030-01-02', time: '09:07', status: 'scheduled' } }));
  assert.equal(f.calls(), 1); assert.equal((await db.doc(`jobs/${result.id}`).get()).get('serviceProperty.validated'), true);
  await f.work.manageJob(f.request({ action: 'update', id: result.id, job: { time: '09:11', date: '2030-01-03', notes: 'No geographic change' } }));
  assert.equal(f.calls(), 1); assert.equal((await db.doc(`jobs/${result.id}`).get()).get('time'), '09:11');
});
test('internal job scheduling returns a nonblocking Google suggestion while preserving the entered address and customer record', async () => {
  const f = await fixture();
  const result = await f.work.manageJob(f.request({ action: 'create', job: { customerId: f.customerId, serviceProperty: { address: CORRECTION }, date: '2030-01-02', time: '09:00' } }));
  assert.equal(result.serviceArea.addressValidation.suggestedAddress, VALID); assert.equal(result.serviceArea.eligible, false); assert.match(result.addressWarning, /unverified/);
  const job = await db.doc(`jobs/${result.id}`).get(); assert.equal(job.get('address'), CORRECTION); assert.equal(job.get('serviceProperty.validated'), false); assert.equal(job.get('latitude'), null);
  assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(), f.original);
});

test('one job Save accepts a Google-confirmed property with inferred ZIP details without changing customer or historical records', async () => {
  const entered = '200 Synthetic Service St, Example, CA', formatted = `${VALID}-1234, USA`;
  for (const solo of [false, true]) {
    let requests = 0;
    const geocode = createGoogleGeocoder({ getAccessToken: async () => 'synthetic-only', fetchImpl: async (url, options) => {
      requests++; assert.equal(url, 'https://addressvalidation.googleapis.com/v1:validateAddress');
      assert.deepEqual(JSON.parse(options.body).address.addressLines, [entered]);
      return { ok: true, json: async () => ({ result: {
        verdict: { addressComplete: true, inputGranularity: 'PREMISE', validationGranularity: 'PREMISE', geocodeGranularity: 'PREMISE', hasInferredComponents: true, possibleNextAction: 'ACCEPT' },
        address: { formattedAddress: formatted, postalAddress: { regionCode: 'US', postalCode: '93312-1234' }, addressComponents: [
          { componentType: 'street_number', confirmationLevel: 'CONFIRMED' }, { componentType: 'route', confirmationLevel: 'CONFIRMED' },
          { componentType: 'locality', confirmationLevel: 'CONFIRMED' }, { componentType: 'administrative_area_level_1', confirmationLevel: 'CONFIRMED' },
          { componentType: 'postal_code', confirmationLevel: 'CONFIRMED', inferred: true }, { componentType: 'postal_code_suffix', confirmationLevel: 'CONFIRMED', inferred: true },
        ] }, geocode: { location: { latitude: 35, longitude: -119 }, placeId: 'synthetic-confirmed-premise' },
      } }) };
    } });
    const f = await fixture({ solo, geocode }), historical = { customerId: f.customerId, userId: f.uid, ...(solo ? {} : { companyId: f.id }), address: ORIGINAL, date: '2026-11-01', time: '09:07', status: 'completed', notes: 'Preserve this recorded visit' };
    await set(`jobs/${f.id}-historical`, historical);
    const saved = await f.work.manageJob(f.request({ action: 'create', job: { customerId: f.customerId, serviceProperty: { address: entered }, date: '2030-01-02', time: '09:15' } }));
    const job = (await db.doc(`jobs/${saved.id}`).get()).data();
    assert.equal(requests, 1); assert.equal(f.calls(), 1); assert.equal(saved.customerAddressUpdated, undefined);
    assert.equal(saved.serviceArea.eligible, true); assert.equal(saved.serviceArea.addressValidation, undefined);
    assert.equal(job.address, formatted); assert.equal(job.serviceProperty.validated, true); assert.equal(job.serviceProperty.source, 'google-address-validation');
    assert.equal(job.serviceProperty.postalCode, '93312'); assert.equal(job.serviceProperty.latitude, 35); assert.equal(job.serviceProperty.longitude, -119);
    assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(), f.original);
    assert.deepEqual((await db.doc(`jobs/${f.id}-historical`).get()).data(), historical);
    const jobs = await db.collection('jobs').where(solo ? 'userId' : 'companyId', '==', solo ? f.uid : f.id).get(); assert.equal(jobs.size, 2);
  }
});
test('CSV import preserves entered addresses without Google lookup and retries without duplicates', async () => {
  const f = await fixture(), importer = customerHandlers(db, { serviceAreas: f.areas }).bulkImportCustomers;
  const entered = '111 Unverified Street';
  const email = `${f.id}@example.test`;
  const request = f.request({ customers: [{ name: 'Imported synthetic', email, address: entered, city: 'Bakersfield', state: 'CA', zipCode: '93304' }] });
  assert.equal((await importer(request)).created, 1); assert.equal((await importer(request)).skipped, 1); assert.equal(f.calls(), 0);
  const saved = await db.collection('customers').where('companyId', '==', f.id).where('email', '==', email).get();
  assert.equal(saved.size, 1);
  assert.equal(saved.docs[0].get('address'), entered);
  assert.equal(saved.docs[0].get('zipCode'), '93304');
  assert.deepEqual(saved.docs[0].get('addressValidation'), { source: 'csv-import', status: 'unverified' });
  assert.equal(saved.docs[0].get('latitude'), undefined);
});
