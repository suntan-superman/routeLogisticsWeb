const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const req = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app'), { getFirestore } = req('firebase-admin/firestore');
const { serviceAreaHandlers } = require('../functions/serviceAreas');
let app, db, sequence = 0;
before(() => { if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Only the local demo Firestore emulator is authorized.'); app = initializeApp({ projectId: 'demo-routelogistics' }, 'service-area-tests'); db = getFirestore(app); });
after(() => deleteApp(app));
const ADDRESS = '100 Main Street, Bakersfield, CA 93312';
const INSIDE = '101 Main Street, Bakersfield, CA 93312';
const OUTSIDE = '200 Other Street, Fresno, CA 93721';
const ANOTHER = '201 Other Street, Fresno, CA 93721';
const GEO = {
  [ADDRESS]: { latitude: 35.4, longitude: -119, postalCode: '93312' },
  [INSIDE]: { latitude: 35.401, longitude: -119, postalCode: '93312' },
  [OUTSIDE]: { latitude: 36.7, longitude: -119.8, postalCode: '93721' },
  [ANOTHER]: { latitude: 36.701, longitude: -119.8, postalCode: '93721' },
};
const settings = extra => ({ operatingAddress: ADDRESS, method: 'zip', zipCodes: ['93312'], radiusMiles: 5, categoryOverrides: [], acceptingNewCustomers: true, publishCoverage: false, allowOutOfAreaRequests: true, ...extra });
async function fixture() {
  const id = `sa-${process.pid}-${++sequence}`, companyId = id, ownerUid = id + '-owner', managerUid = id + '-manager', managerId = id + '-manager-member', adminUid = id + '-admin', adminId = id + '-admin-member', techUid = id + '-tech', techId = id + '-tech-member';
  await db.doc(`companies/${companyId}`).set({ ownerId: ownerUid, name: 'Synthetic service area provider', serviceCategories: ['Pest Control', 'Pool Care'] });
  for (const [uid, memberId, role] of [[managerUid, managerId, 'manager'], [adminUid, adminId, 'admin'], [techUid, techId, 'technician']]) await db.doc(`teamMembers/${memberId}`).set({ companyId, uid, role, status: 'active' });
  const actor = (uid, role, membershipId) => ({ uid, token: { companyId, role, ...(membershipId ? { membershipId } : {}), email_verified: true } });
  let clock = Date.parse('2026-11-14T20:00:00Z'), calls = 0, duringGeocode;
  const service = serviceAreaHandlers(db, { now: () => clock, geocode: async address => { calls++; if (duringGeocode) await duringGeocode(); if (!GEO[address]) throw Error('Synthetic provider address unavailable'); return { ...GEO[address], countryCode: 'US', locationType: 'PREMISE', streetAddressVerified: true, formattedAddress: address, placeId: 'synthetic-' + address.split(' ')[0] }; } });
  const owner = actor(ownerUid, 'owner'), manager = actor(managerUid, 'manager', managerId), admin = actor(adminUid, 'admin', adminId), tech = actor(techUid, 'technician', techId);
  const request = (data, auth = owner) => ({ data, auth });
  const save = async (data = settings(), auth = owner) => { const old = await db.doc(`rlServiceAreas/${companyId}`).get(); return service.handle(request({ action: 'save', expectedRevision: old.get('revision') || 0, settings: data }, auth)); };
  const check = (address = INSIDE, extra = {}) => service.checkForWorkflow({ companyId, propertyAddress: address, serviceCategory: 'Pest Control', purpose: 'scheduling', ...extra });
  return { id, companyId, ownerUid, owner, manager, managerId, admin, tech, request, service, save, check, calls: () => calls, advance: n => clock += n, duringGeocode: fn => { duringGeocode = fn; } };
}

test('unconfigured coverage verifies supplied addresses while public service requests fail closed', async () => {
  const f = await fixture(); assert.equal((await f.check(INSIDE)).property.formattedAddress, INSIDE); assert.equal((await f.check(INSIDE, { purpose: 'public-request' })).eligible, false);
  assert.equal((await f.check('999 Unresolved Street, Example, CA 93312')).eligible, false);
  const status = await f.service.handle(f.request({ action: 'status' })); assert.equal(status.settings.configured, false); assert.equal(status.settings.publishCoverage, false); assert.equal(f.calls(), 2);
});
test('owners and managers manage private settings; admins may inspect/check but cannot save, technicians and other tenants are denied', async () => {
  const f = await fixture(), other = await fixture();
  await f.save(settings(), f.manager); assert.equal((await f.service.handle(f.request({ action: 'status' }, f.admin))).canManageSettings, false);
  assert.equal((await f.service.handle(f.request({ action: 'check', propertyAddress: INSIDE }, f.admin))).result.eligible, true);
  for (const actor of [f.admin, f.tech]) await assert.rejects(f.save(settings(), actor), { code: 'permission-denied' });
  await assert.rejects(f.service.handle(f.request({ action: 'status' }, f.tech)), { code: 'permission-denied' });
  await assert.rejects(f.service.handle(f.request({ action: 'status', companyId: other.companyId })), { code: 'permission-denied' });
});
test('business location is server validated and reused for ordinary settings changes without another paid lookup', async () => {
  const f = await fixture(); const one = await f.save({ ...settings(), operatingLocation: { latitude: 0, longitude: 0 }, eligible: true });
  assert.equal(one.settings.operatingLocation.latitude, 35.4); assert.equal(one.settings.operatingLocation.source, 'google-address-validation'); assert.equal(f.calls(), 1);
  await f.save(settings({ radiusMiles: 10, method: 'radius' })); assert.equal(f.calls(), 1);
  assert.equal((await f.check()).eligible, true); assert.equal((await f.check()).eligible, true); assert.equal(f.calls(), 2);
});
test('ZIP and radius eligibility use only the explicit service property, never billing addresses or client flags', async () => {
  const f = await fixture(); await f.save();
  assert.equal((await f.check(INSIDE)).status, 'inside');
  const outside = await f.service.handle(f.request({ action: 'check', propertyAddress: OUTSIDE, serviceCategory: 'Pest Control', billingAddress: INSIDE, eligible: true, latitude: 35.4, longitude: -119 })); assert.equal(outside.result.status, 'outside');
  await f.save(settings({ method: 'radius', radiusMiles: 5 })); assert.equal((await f.check(INSIDE)).eligible, true); assert.equal((await f.check(OUTSIDE)).eligible, false);
});
test('category overrides require a known category, narrow its area, and preserve base coverage for other offered categories', async () => {
  const f = await fixture(); await f.save(settings({ categoryOverrides: [{ serviceCategory: 'Pool Care', method: 'zip', zipCodes: ['93721'], radiusMiles: 1 }] }));
  assert.equal((await f.check(INSIDE, { serviceCategory: 'Pool Care' })).status, 'outside'); assert.equal((await f.check(INSIDE, { serviceCategory: 'pest control' })).eligible, true);
  for (const serviceCategory of ['', 'Made Up']) assert.equal((await f.check(INSIDE, { serviceCategory })).status, 'invalid-category');
});
test('invalid and unavailable service-property validation fails closed, including forged coordinates and approval attempts', async () => {
  const f = await fixture(); await f.save();
  for (const address of ['', 'missing', '999 Unknown Street, Bakersfield, CA 93312']) assert.equal((await f.check(address)).status, 'invalid-address');
  await assert.rejects(f.service.handle(f.request({ action: 'approveException', propertyAddress: '', serviceCategory: 'Pest Control', reason: 'Cannot bypass validation' })), { code: 'failed-precondition' });
});
test('only the current owner can issue a bounded out-of-area exception; approvals match property, category, purpose and tenant', async () => {
  const f = await fixture(), other = await fixture(); await f.save(); await other.save();
  const data = { action: 'approveException', propertyAddress: OUTSIDE, serviceCategory: 'Pest Control', purpose: 'scheduling', reason: 'Explicit synthetic owner approval' };
  await assert.rejects(f.service.handle(f.request(data, f.manager)), { code: 'permission-denied' });
  const approved = await f.service.handle(f.request(data)); assert.equal((await f.check(OUTSIDE, { exceptionId: approved.exceptionId })).status, 'exception-approved');
  for (const extra of [{ propertyAddress: ANOTHER }, { serviceCategory: 'Pool Care' }, { purpose: 'estimate' }]) assert.equal((await f.check(extra.propertyAddress || OUTSIDE, { exceptionId: approved.exceptionId, ...extra })).eligible, false);
  assert.equal((await other.check(OUTSIDE, { exceptionId: approved.exceptionId })).eligible, false);
  f.advance(86400001); assert.equal((await f.check(OUTSIDE, { exceptionId: approved.exceptionId })).eligible, false);
});
test('disabled optional exceptions and an owner transfer cannot be bypassed by an old approval', async () => {
  const f = await fixture(); await f.save(settings({ allowOutOfAreaRequests: false })); const request = { action: 'approveException', propertyAddress: OUTSIDE, serviceCategory: 'Pest Control', reason: 'Owner approval' };
  await assert.rejects(f.service.handle(f.request(request)), { code: 'failed-precondition' }); await f.save(); const approved = await f.service.handle(f.request(request));
  await db.doc(`companies/${f.companyId}`).update({ ownerId: f.id + '-new-owner' }); assert.equal((await f.check(OUTSIDE, { exceptionId: approved.exceptionId })).status, 'outside');
});
test('policy revision changes invalidate unused eligibility and exceptions without touching existing jobs or customers', async () => {
  const f = await fixture(); await db.doc(`customers/${f.id}-existing`).set({ companyId: f.companyId, address: OUTSIDE, name: 'Existing customer preserved' }); await db.doc(`jobs/${f.id}-existing`).set({ companyId: f.companyId, customerId: f.id + '-existing', address: OUTSIDE, status: 'scheduled' });
  const customerBefore = await db.doc(`customers/${f.id}-existing`).get(), jobBefore = await db.doc(`jobs/${f.id}-existing`).get(); await f.save(); const result = await f.check(); await f.save(settings({ zipCodes: ['93721'] }));
  await assert.rejects(db.runTransaction(tx => f.service.assertWorkflowCurrent(tx, { companyId: f.companyId, result, propertyAddress: INSIDE, serviceCategory: 'Pest Control', purpose: 'scheduling' })), { code: 'aborted' });
  assert.equal((await db.doc(`customers/${f.id}-existing`).get()).updateTime.isEqual(customerBefore.updateTime), true); assert.equal((await db.doc(`jobs/${f.id}-existing`).get()).updateTime.isEqual(jobBefore.updateTime), true);
});
test('transaction fence accepts a trusted current check and rejects a forged/cloned eligibility result', async () => {
  const f = await fixture(); await f.save(); const result = await f.check(), input = { companyId: f.companyId, result, propertyAddress: INSIDE, serviceCategory: 'Pest Control', purpose: 'scheduling' };
  await db.runTransaction(tx => f.service.assertWorkflowCurrent(tx, input));
  await assert.rejects(db.runTransaction(tx => f.service.assertWorkflowCurrent(tx, { ...input, result: { ...result } })), { code: 'failed-precondition' });
  await assert.rejects(db.runTransaction(tx => f.service.assertWorkflowCurrent(tx, { ...input, propertyAddress: OUTSIDE })), { code: 'failed-precondition' });
});
test('a newly configured policy fences an earlier unconfigured check before a new record can be created', async () => {
  const f = await fixture(), result = await f.check(); await f.save();
  await assert.rejects(db.runTransaction(tx => f.service.assertWorkflowCurrent(tx, { companyId: f.companyId, result, propertyAddress: INSIDE, serviceCategory: 'Pest Control', purpose: 'scheduling' })), { code: 'aborted' });
});
test('accepting-new-customers cannot be bypassed by client existing-customer claims and public results hide boundaries', async () => {
  const f = await fixture(); await f.save(settings({ acceptingNewCustomers: false })); assert.equal((await f.check()).eligible, true);
  const result = await f.check(INSIDE, { purpose: 'booking', isExistingCustomer: true }); assert.equal(result.status, 'not-accepting'); assert.deepEqual(Object.keys(f.service.publicEligibility(result)).sort(), ['eligible', 'message', 'status']);
});
test('manager revocation during address validation prevents a settings write', async () => {
  const f = await fixture(); f.duringGeocode(() => db.doc(`teamMembers/${f.managerId}`).update({ status: 'removed' }));
  await assert.rejects(f.save(settings(), f.manager), { code: 'permission-denied' }); assert.equal((await db.doc(`rlServiceAreas/${f.companyId}`).get()).exists, false);
});
test('concurrent settings saves use revision compare-and-set and never silently overwrite each other', async () => {
  const f = await fixture(); const request = data => f.service.handle(f.request({ action: 'save', expectedRevision: 0, settings: data }));
  const results = await Promise.allSettled([request(settings({ zipCodes: ['93312'] })), request(settings({ zipCodes: ['93721'] }))]); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === 'aborted').length, 1);
});

test('provider deactivation, ownership and catalog changes are fenced between eligibility and a new write', async () => {
  for (const change of [{ isActive: false }, { ownerId: 'new-owner' }, { serviceCategories: ['Different Category'] }]) {
    const f = await fixture(); await f.save(); const result = await f.check(); await db.doc(`companies/${f.companyId}`).update(change);
    await assert.rejects(db.runTransaction(tx => f.service.assertWorkflowCurrent(tx, { companyId: f.companyId, result, propertyAddress: INSIDE, serviceCategory: 'Pest Control', purpose: 'scheduling' })), { code: 'aborted' });
  }
});
