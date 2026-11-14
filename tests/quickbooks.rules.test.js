const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, writeBatch, setLogLevel } = require('firebase/firestore');

const PRIVATE_COLLECTIONS = [
  'rlQuickBooksConnections', 'rlQbOAuthStates', 'rlQbRealms', 'rlQbMappings',
  'rlQbRemoteMappings', 'rlQbOperations', 'rlQbWebhookEvents', 'rlQbReconciliations',
  'rlQbAudit', 'rlQbOAuthIntents', 'rlQbPaymentMappings', 'rlQbRealmClaims',
];
const COMPANY_A = 'qb-rules-company-a', COMPANY_B = 'qb-rules-company-b';
const OWNER_A = 'qb-rules-owner-a', OWNER_B = 'qb-rules-owner-b';
const RECORD = 'qb-rules-private-record';
const fixture = {
  companyId: COMPANY_A, userId: OWNER_A, environment: 'sandbox', realmId: '910001',
  accessToken: 'emulator-only-access-fixture', refreshToken: 'emulator-only-refresh-fixture',
  status: 'pending', connected: true,
};
let env;
const client = (uid, claims) => env.authenticatedContext(uid, { email_verified: true, ...claims }).firestore();
const ownerA = () => client(OWNER_A, { companyId: COMPANY_A, role: 'owner' });

before(async () => {
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
    throw new Error('QuickBooks authorization tests require the local Firestore emulator.');
  }
  setLogLevel('silent'); // Expected permission-denied responses need no console stack traces.
  env = await initializeTestEnvironment({
    projectId: 'demo-routelogistics',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore(), batch = writeBatch(db);
    batch.set(doc(db, `companies/${COMPANY_A}`), { ownerId: OWNER_A, name: 'Tenant A fixture' });
    batch.set(doc(db, `companies/${COMPANY_B}`), { ownerId: OWNER_B, name: 'Tenant B fixture' });
    batch.set(doc(db, 'teamMembers/qb-rules-tech-membership'), {
      companyId: COMPANY_A, uid: 'qb-rules-tech', role: 'technician', status: 'active',
    });
    for (const name of PRIVATE_COLLECTIONS) batch.set(doc(db, `${name}/${RECORD}`), fixture);
    batch.set(doc(db, `rlQuickBooksConnections/${RECORD}/tokenHistory/previous`), fixture);
    await batch.commit();
  });
});
after(async () => { if (env) await env.cleanup(); });

test('even the actual company owner cannot directly read, query, create, change or delete private QuickBooks records', async () => {
  const db = ownerA();
  await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_A}`)));
  for (const name of PRIVATE_COLLECTIONS) {
    await assertFails(getDoc(doc(db, `${name}/${RECORD}`)));
    await assertFails(getDocs(query(collection(db, name), where('companyId', '==', COMPANY_A))));
    await assertFails(setDoc(doc(db, `${name}/qb-rules-owner-created`), fixture));
    await assertFails(updateDoc(doc(db, `${name}/${RECORD}`), { connected: false, refreshToken: 'forged' }));
    await assertFails(deleteDoc(doc(db, `${name}/${RECORD}`)));
  }
});

test('another legitimate tenant owner cannot read or take over QuickBooks records by changing company fields', async () => {
  const db = client(OWNER_B, { companyId: COMPANY_B, role: 'owner' });
  await assertSucceeds(getDoc(doc(db, `companies/${COMPANY_B}`)));
  for (const name of PRIVATE_COLLECTIONS) {
    await assertFails(getDoc(doc(db, `${name}/${RECORD}`)));
    await assertFails(getDocs(query(collection(db, name), where('companyId', '==', COMPANY_B))));
    await assertFails(updateDoc(doc(db, `${name}/${RECORD}`), { companyId: COMPANY_B, userId: OWNER_B }));
    await assertFails(setDoc(doc(db, `${name}/qb-rules-tenant-b-created`), { ...fixture, companyId: COMPANY_B, userId: OWNER_B }));
  }
});

test('unauthenticated callers and active technicians cannot obtain tokens or forge OAuth, webhook or payment mappings', async () => {
  const anonymous = env.unauthenticatedContext().firestore();
  const technician = client('qb-rules-tech', { companyId: COMPANY_A, role: 'technician', membershipId: 'qb-rules-tech-membership' });
  for (const name of PRIVATE_COLLECTIONS) {
    await assertFails(getDoc(doc(anonymous, `${name}/${RECORD}`)));
    await assertFails(setDoc(doc(anonymous, `${name}/qb-rules-anonymous-created`), fixture));
    await assertFails(getDoc(doc(technician, `${name}/${RECORD}`)));
    await assertFails(setDoc(doc(technician, `${name}/qb-rules-tech-created`), { ...fixture, userId: 'qb-rules-tech' }));
  }
});

test('private connection descendants remain inaccessible instead of inheriting owner document permissions', async () => {
  const db = ownerA(), nested = doc(db, `rlQuickBooksConnections/${RECORD}/tokenHistory/previous`);
  await assertFails(getDoc(nested));
  await assertFails(setDoc(doc(db, `rlQuickBooksConnections/${RECORD}/tokenHistory/new`), fixture));
  await assertFails(updateDoc(nested, { accessToken: 'forged' }));
  await assertFails(deleteDoc(nested));
});
