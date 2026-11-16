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
    // Scheduling records are seeded by the server; clients can no longer create
    // them merely because coverage has not been configured.
    for (const name of ['jobs', 'appointments', 'servicePlans']) batch.set(doc(db, `${name}/geo-rules-legacy-${name}`), { ...data(legacy), address: '' });
    for (const companyId of [configured, legacy]) batch.set(doc(db, `customers/geo-rules-customer-${companyId}`), { userId: ownerUid, companyId, name: 'Historical address customer', address: '100 Unverified Historical Street', totalSpent: 0 });
    batch.set(doc(db, 'users/geo-rules-solo'), { name: 'Synthetic solo owner' });
    batch.set(doc(db, 'customers/geo-rules-solo-customer'), { userId: 'geo-rules-solo', name: 'Solo historical customer', address: '100 Historical Solo Street' });
    batch.set(doc(db, 'jobs/geo-rules-managed-job'), { ...data(configured), serviceProperty: { address: 'Server-validated property' }, serviceAreaEligibility: { eligible: true, settingsRevision: 1 }, serviceAreaManaged: true });
    await batch.commit();
  });
});
after(async () => { if (env) await env.cleanup(); });

test('configured providers cannot bypass geographic enforcement by writing jobs, appointments, plans or legacy estimates directly', async () => {
  for (const role of ['owner', 'admin', 'manager']) for (const name of records) await assertFails(setDoc(doc(actor(role), `${name}/geo-rules-direct-${role}-${name}`), data(configured, role === 'owner' ? ownerUid : 'geo-rules-' + role)));
});
test('historical job and appointment notes remain editable while scheduling, plans and geographic proof stay server owned', async () => {
  for (const name of records) {
    const target = doc(actor(), `${name}/geo-rules-${name}-history`);
    if (name === 'servicePlans') await assertFails(updateDoc(target, { notes: 'Use the service-plan callable' }));
    else await assertSucceeds(updateDoc(target, { notes: 'Historical record remains editable' }));
    if (name === 'estimates') await assertSucceeds(updateDoc(target, { date: '2026-12-01' }));
    else await assertFails(updateDoc(target, { date: '2026-12-01' }));
    for (const patch of [{ address: '200 Outside Street' }, { latitude: 35.4, longitude: -119 }, { customerId: 'other-customer' }, { serviceCategory: 'Changed' }, { serviceProperty: { address: 'Fake', latitude: 0, longitude: 0, validated: true } }, { serviceAreaEligibility: { eligible: true, settingsRevision: 999 } }, { serviceAreaManaged: true }]) await assertFails(updateDoc(target, patch));
  }
  await assertSucceeds(updateDoc(doc(actor(), 'jobs/geo-rules-managed-job'), { notes: 'No retroactive invalidation' }));
  await assertFails(updateDoc(doc(actor(), 'jobs/geo-rules-managed-job'), { date: '2026-12-02' }));
  await assertFails(updateDoc(doc(actor(), 'jobs/geo-rules-managed-job'), { serviceAreaEligibility: { eligible: false } }));
});
test('unconfigured coverage cannot bypass server scheduling or verification while legacy estimate and job-note edits remain available', async () => {
  for (const name of records) {
    const db = actor('owner', legacy); await assertFails(setDoc(doc(db, `${name}/geo-rules-unverified-${name}`), data(legacy)));
    if (name === 'estimates') await assertSucceeds(setDoc(doc(db, `${name}/geo-rules-legacy-${name}`), { ...data(legacy), address: '' }));
    else await assertFails(setDoc(doc(db, `${name}/geo-rules-addressless-forged-${name}`), { ...data(legacy), address: '' }));
    if (name === 'servicePlans') await assertFails(updateDoc(doc(db, `${name}/geo-rules-legacy-${name}`), { notes: 'Use the service-plan callable' }));
    else await assertSucceeds(updateDoc(doc(db, `${name}/geo-rules-legacy-${name}`), { notes: 'Historical edits preserved' }));
    await assertFails(updateDoc(doc(db, `${name}/geo-rules-legacy-${name}`), { address: '200 Unverified Street, Example, CA 93312' }));
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
test('customer physical addresses and Google proofs are server-owned even when coverage is unconfigured', async () => {
  for (const companyId of [configured, legacy]) {
    const db = actor('owner', companyId), target = doc(db, `customers/geo-rules-customer-${companyId}`);
    await assertSucceeds(updateDoc(target, { notes: 'Preserve non-address editing' }));
    for (const patch of [{ address: '200 Unverified Street, Example, CA 93312' }, { city: 'Changed city' }, { latitude: 35, longitude: -119 }, { location: { latitude: 35, longitude: -119 } }, { addressValidation: { source: 'google-address-validation', validated: true } }]) await assertFails(updateDoc(target, patch));
    await assertFails(setDoc(doc(db, `customers/geo-rules-unverified-${companyId}`), { userId: ownerUid, companyId, name: 'Forged address', address: '200 Unverified Street' }));
    await assertFails(setDoc(doc(db, `customers/geo-rules-addressless-${companyId}`), { userId: ownerUid, companyId, name: 'Contact only', address: '' })); // Duplicate-aware creation is callable-only, including addressless prospects.
  }
});
test('solo customers and jobs cannot bypass mandatory address verification while historical non-address edits remain valid', async () => {
  const db = env.authenticatedContext('geo-rules-solo', { email_verified: true }).firestore();
  await assertSucceeds(updateDoc(doc(db, 'customers/geo-rules-solo-customer'), { phone: '555-0101' }));
  await assertFails(updateDoc(doc(db, 'customers/geo-rules-solo-customer'), { address: '200 Unverified Solo Street' }));
  for (const name of ['customers', 'jobs', 'servicePlans']) await assertFails(setDoc(doc(db, `${name}/geo-rules-solo-forged-${name}`), { userId: 'geo-rules-solo', name: 'Unverified', status: 'scheduled', address: '200 Unverified Solo Street' }));
});
