// All records are explicitly named synthetic local fixtures. Never clear the database.
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, getDoc, getDocs, deleteDoc, collection, query, where, writeBatch, setLogLevel } = require('firebase/firestore');
const prefix = `scheduling-rules-${process.pid}`, company = `${prefix}-company`, owner = `${prefix}-owner`, solo = `${prefix}-solo`;
const privateCollections = ['rlScheduleLocks', 'rlScheduleOperations', 'rlScheduleReconciliations'];
const paths = new Set();
let env;
const ref = (db, documentPath) => { paths.add(documentPath); return doc(db, documentPath); };
const client = role => role === 'solo' ? env.authenticatedContext(solo, { email_verified: true }).firestore() : env.authenticatedContext(role === 'owner' ? owner : `${prefix}-${role}`, { email_verified: true, companyId: company, role, ...(role === 'owner' ? {} : { membershipId: `${prefix}-${role}` }) }).firestore();
const fixture = role => ({ userId: role === 'solo' ? solo : owner, ...(role === 'solo' ? {} : { companyId: company }), status: 'scheduled', date: '2035-01-04', time: '09:00', estimatedDuration: 1, assignedTo: `${prefix}-technician`, assignedToName: 'Synthetic technician', assignedToUid: `${prefix}-technician`, address: '', notes: 'Synthetic scheduling fixture' });
const history = (name, role, status = 'scheduled') => `${name}/${prefix}-${role}-${status}`;
before(async () => {
  if (!/^(?:localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local demo Firestore emulator required.');
  setLogLevel('silent');
  env = await initializeTestEnvironment({ projectId: 'demo-routelogistics', firestore: { rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore(), batch = writeBatch(db);
    batch.set(ref(db, `companies/${company}`), { ownerId: owner, name: 'Synthetic scheduling-rules company' });
    batch.set(ref(db, `users/${owner}`), { rlCompanyId: company }); batch.set(ref(db, `users/${solo}`), { name: 'Independent scheduling owner' });
    for (const role of ['admin', 'manager', 'technician']) batch.set(ref(db, `teamMembers/${prefix}-${role}`), { companyId: company, uid: `${prefix}-${role}`, status: 'active', role });
    for (const role of ['owner', 'solo']) for (const name of ['jobs', 'appointments', 'servicePlans']) {
      batch.set(ref(db, history(name, role)), { ...fixture(role), ...(name === 'servicePlans' ? { active: true, frequencyDays: 7, nextServiceDate: '2035-01-04', preferredTechnicianId: `${prefix}-technician` } : {}) });
      if (name === 'jobs') for (const status of ['completed', 'cancelled']) batch.set(ref(db, history(name, role, status)), { ...fixture(role), status });
    }
    for (const name of privateCollections) batch.set(ref(db, `${name}/${prefix}-private`), { companyId: company, userId: owner, actorId: owner, revision: 1, result: { id: 'synthetic-job' } });
    await batch.commit();
  });
});
after(async () => {
  if (!env) return;
  await env.withSecurityRulesDisabled(async context => {
    const batch = writeBatch(context.firestore()); for (const documentPath of paths) batch.delete(doc(context.firestore(), documentPath)); await batch.commit();
  });
  await env.cleanup();
});

test('owner, manager and independent clients cannot directly create jobs or legacy appointments', async () => {
  for (const role of ['owner', 'admin', 'manager', 'technician', 'solo']) for (const name of ['jobs', 'appointments']) {
    const db = client(role), data = { ...fixture(role), userId: role === 'owner' ? owner : role === 'solo' ? solo : `${prefix}-${role}` };
    await assertFails(setDoc(ref(db, `${name}/${prefix}-forged-${role}-${name}`), data));
  }
});

test('dates, duration, technician identity, plan links and geographic proof cannot bypass the scheduling callables', async () => {
  const patches = [
    { date: '2035-01-05' }, { time: '10:00' }, { estimatedDuration: 2 }, { duration: 2 }, { assignedTo: owner },
    { assignedToName: 'FORGED NAME' }, { assignedToUid: owner }, { servicePlanId: 'forged-plan' }, { servicePlanDate: '2035-01-05' },
    { assignmentNeedsAttention: false }, { assignmentReview: 'FORGED REVIEW' }, { latitude: 0, longitude: 0 },
    { serviceProperty: { address: 'Unverified property', validated: true } }, { serviceAreaEligibility: { eligible: true } },
  ];
  for (const role of ['owner', 'admin', 'manager', 'solo']) for (const name of ['jobs', 'appointments']) for (const patch of patches) {
    await assertFails(updateDoc(ref(client(role), history(name, role === 'solo' ? 'solo' : 'owner')), patch));
  }
});

test('terminal jobs cannot be reactivated directly while owner and independent notes/completion still work', async () => {
  for (const role of ['owner', 'admin', 'manager', 'solo']) for (const terminal of ['completed', 'cancelled']) for (const status of ['scheduled', 'en-route', 'in-progress']) {
    await assertFails(updateDoc(ref(client(role), history('jobs', role === 'solo' ? 'solo' : 'owner', terminal)), { status }));
  }
  for (const role of ['owner', 'solo']) {
    const target = ref(client(role), history('jobs', role));
    await assertSucceeds(updateDoc(target, { notes: 'An ordinary authorized note' }));
    await assertSucceeds(updateDoc(target, { status: 'completed', completedAt: '2035-01-04T18:00:00.000Z' }));
    await assertSucceeds(updateDoc(target, { notes: 'Completed visit history remains editable' }));
  }
});

test('service-plan creation and updates are server owned for company and independent clients', async () => {
  for (const role of ['owner', 'admin', 'manager', 'technician', 'solo']) {
    const db = client(role), saved = ref(db, history('servicePlans', role === 'solo' ? 'solo' : 'owner'));
    await assertFails(setDoc(ref(db, `servicePlans/${prefix}-forged-${role}`), { ...fixture(role), userId: role === 'owner' ? owner : role === 'solo' ? solo : `${prefix}-${role}`, active: true, frequencyDays: 7, nextServiceDate: '2035-01-04' }));
    for (const patch of [{ nextServiceDate: '2035-01-05' }, { preferredTechnicianId: owner, preferredTechnicianUid: owner }, { recurrence: { frequency: 'monthly' } }, { notes: 'A direct plan edit' }]) await assertFails(updateDoc(saved, patch));
  }
});

test('all clients are denied direct reads, queries and writes to private scheduling locks, operations and reconciliations', async () => {
  const contexts = [...['owner', 'admin', 'manager', 'technician', 'solo'].map(client), env.authenticatedContext(`${prefix}-portal`, { email_verified: true, portal: true }).firestore(), env.unauthenticatedContext().firestore()];
  for (const db of contexts) for (const name of privateCollections) {
    const target = ref(db, `${name}/${prefix}-private`);
    await assertFails(getDoc(target)); await assertFails(getDocs(query(collection(db, name), where('companyId', '==', company))));
    await assertFails(updateDoc(target, { revision: 999, result: { id: 'forged-job' } })); await assertFails(deleteDoc(target));
    await assertFails(setDoc(ref(db, `${name}/${prefix}-forged`), { companyId: company, userId: owner, actorId: owner, revision: 999 }));
  }
});
