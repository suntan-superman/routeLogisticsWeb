const { test, before, after } = require('node:test');
const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, writeBatch, setLogLevel } = require('firebase/firestore');
let env;
const configured = 'geo-rules-configured', legacy = 'geo-rules-legacy', other = 'geo-rules-other', ownerUid = 'geo-rules-owner';
const records = ['jobs', 'appointments', 'servicePlans', 'estimates'];
const privateCollections = ['rlServiceAreas', 'rlServiceAreaExceptions', 'rlServiceAreaGeocodes', 'rlServiceAreaAudit'];
const actor = (role = 'owner', companyId = configured) => env.authenticatedContext(role === 'owner' ? ownerUid : 'geo-rules-' + role, { email_verified: true, companyId, role, ...(role !== 'owner' ? { membershipId: 'geo-rules-member-' + role } : {}) }).firestore();
const data = (companyId, userId = ownerUid) => ({ companyId, userId, status: 'scheduled', address: '100 Legacy Street', serviceType: 'Pest Control', customerId: 'geo-rules-customer', frequencyDays: 30, total: 0 });
before(async () => {
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local demo Firestore emulator required.');
  setLogLevel('silent'); env = await initializeTestEnvironment({ projectId: 'demo-routelogistics', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore(), batch = writeBatch(db);
    for (const companyId of [configured, legacy]) batch.set(doc(db, `companies/${companyId}`), { ownerId: ownerUid });
    batch.set(doc(db, `companies/${other}`), { ownerId: 'other-owner' });
    for (const role of ['admin', 'manager', 'technician']) batch.set(doc(db, `teamMembers/geo-rules-member-${role}`), { companyId: configured, uid: 'geo-rules-' + role, role, status: 'active' });
    batch.set(doc(db, `rlServiceAreas/${configured}`), { configured: true, revision: 1, operatingAddress: 'Private operating location', zipCodes: ['93312'] });
    for (const name of privateCollections.slice(1)) batch.set(doc(db, `${name}/geo-rules-private`), { companyId: configured, address: 'Private service property', eligible: true });
    for (const name of records) { batch.set(doc(db, `${name}/geo-rules-${name}-history`), data(configured)); batch.set(doc(db, `${name}/geo-rules-${name}-other`), data(other, 'other-owner')); }
    batch.set(doc(db, 'jobs/geo-rules-managed-job'), { ...data(configured), serviceProperty: { address: 'Server-validated property' }, serviceAreaEligibility: { eligible: true, settingsRevision: 1 }, serviceAreaManaged: true });
    await batch.commit();
  });
});
after(async () => { if (env) await env.cleanup(); });

test('configured providers cannot bypass geographic enforcement by writing jobs, appointments, plans or legacy estimates directly', async () => {
  for (const role of ['owner', 'admin', 'manager']) for (const name of records) await assertFails(setDoc(doc(actor(role), `${name}/geo-rules-direct-${role}-${name}`), data(configured, role === 'owner' ? ownerUid : 'geo-rules-' + role)));
});
test('configured historical records permit ordinary non-geographic edits but never geographic mutation or eligibility forgery', async () => {
  for (const name of records) {
    const target = doc(actor(), `${name}/geo-rules-${name}-history`); await assertSucceeds(updateDoc(target, { notes: 'Historical record remains editable', date: '2026-12-01' }));
    for (const patch of [{ address: '200 Outside Street' }, { latitude: 35.4, longitude: -119 }, { customerId: 'other-customer' }, { serviceCategory: 'Changed' }, { serviceProperty: { address: 'Fake', latitude: 0, longitude: 0, validated: true } }, { serviceAreaEligibility: { eligible: true, settingsRevision: 999 } }, { serviceAreaManaged: true }]) await assertFails(updateDoc(target, patch));
  }
  await assertSucceeds(updateDoc(doc(actor(), 'jobs/geo-rules-managed-job'), { date: '2026-12-02', notes: 'No retroactive invalidation' }));
  await assertFails(updateDoc(doc(actor(), 'jobs/geo-rules-managed-job'), { serviceAreaEligibility: { eligible: false } }));
});
test('unconfigured legacy creation is preserved while server geographic proofs cannot be self-asserted', async () => {
  for (const name of records) {
    const db = actor('owner', legacy); await assertSucceeds(setDoc(doc(db, `${name}/geo-rules-legacy-${name}`), data(legacy)));
    await assertFails(setDoc(doc(db, `${name}/geo-rules-forged-${name}`), { ...data(legacy), serviceAreaEligibility: { eligible: true } }));
    await assertFails(updateDoc(doc(db, `${name}/geo-rules-legacy-${name}`), { serviceAreaManaged: true }));
  }
});
test('private service-area policy, cached properties, exceptions and audit records are server mediated for every browser identity', async () => {
  const contexts = [actor(), actor('admin'), actor('manager'), actor('technician'), env.authenticatedContext('geo-rules-portal', { portal: true, email_verified: true }).firestore(), env.unauthenticatedContext().firestore()];
  for (const db of contexts) for (const name of privateCollections) {
    const id = name === 'rlServiceAreas' ? configured : 'geo-rules-private', target = doc(db, `${name}/${id}`);
    await assertFails(getDoc(target)); await assertFails(getDocs(collection(db, name))); await assertFails(updateDoc(target, { eligible: true, publishCoverage: true })); await assertFails(deleteDoc(target)); await assertFails(setDoc(doc(db, `${name}/geo-rules-forged-private`), { companyId: configured, configured: true }));
  }
});
test('tenant isolation and technician authorization remain enforced independently of coverage settings', async () => {
  for (const name of records) await assertFails(updateDoc(doc(actor(), `${name}/geo-rules-${name}-other`), { notes: 'Cross-company write' }));
  await assertFails(setDoc(doc(actor('technician'), 'jobs/geo-rules-tech-forgery'), data(configured, 'geo-rules-technician')));
  await assertFails(updateDoc(doc(actor('technician'), 'jobs/geo-rules-jobs-history'), { notes: 'Unauthorized direct job edit' }));
  await assertFails(updateDoc(doc(actor(), 'jobs/geo-rules-jobs-history'), { companyId: legacy }));
});
