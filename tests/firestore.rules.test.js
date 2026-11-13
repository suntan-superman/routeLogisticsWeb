const { test, before, after, beforeEach } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, addDoc } = require('firebase/firestore');

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-routelogistics',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
});
after(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/owner1'), { email: 'o@x.com', companyId: 'c1' });
    await setDoc(doc(db, 'users/solo1'), { email: 's@x.com', companyId: null });
    await setDoc(doc(db, 'companies/c1'), { ownerId: 'owner1', name: 'Pest Co' });
    await setDoc(doc(db, 'companies/c2'), { ownerId: 'other', name: 'Other Co' });
    await setDoc(doc(db, 'jobs/j1'), { userId: 'owner1', companyId: 'c1', status: 'scheduled', title: 'Termite' });
    await setDoc(doc(db, 'jobs/jDone'), { userId: 'owner1', companyId: 'c1', status: 'completed' });
    await setDoc(doc(db, 'jobs/jOther'), { userId: 'other', companyId: 'c2', status: 'scheduled' });
    await setDoc(doc(db, 'jobs/jSolo'), { userId: 'solo1', status: 'scheduled' });
    await setDoc(doc(db, 'customers/cu1'), { userId: 'owner1', companyId: 'c1', name: 'Alice' });
    await setDoc(doc(db, 'teamMembers/m1'), { companyId: 'c1', email: 'm@x.com', role: 'manager', status: 'active', uid: 'mgr1' });
    await setDoc(doc(db, 'teamMembers/t1'), { companyId: 'c1', email: 't@x.com', role: 'technician', status: 'active', uid: 'tech1' });
  });
});

const as = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();
const owner = () => as('owner1', { companyId: 'c1', role: 'owner' });
const tech = () => as('tech1', { companyId: 'c1', role: 'technician', membershipId: 't1' });
const manager = () => as('mgr1', { companyId: 'c1', role: 'manager', membershipId: 'm1' });

// ---- users: privilege escalation ----
test('user cannot self-assign a role on signup', async () => {
  await assertFails(setDoc(doc(as('new1'), 'users/new1'), { email: 'n@x.com', role: 'admin' }));
  await assertSucceeds(setDoc(doc(as('new1'), 'users/new1'), { email: 'n@x.com', companyId: null }));
});

test('user cannot write role or legacy flag', async () => {
  await assertFails(updateDoc(doc(as('solo1'), 'users/solo1'), { role: 'admin' }));
  await assertFails(updateDoc(doc(as('solo1'), 'users/solo1'), { legacyBackfilledAt: 'x' }));
});

test('user cannot point companyId at a company they do not own', async () => {
  await assertFails(updateDoc(doc(as('solo1'), 'users/solo1'), { companyId: 'c1' }));
});

test('user can link companyId to a company they own', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'companies/cs'), { ownerId: 'solo1' }));
  await assertSucceeds(updateDoc(doc(as('solo1'), 'users/solo1'), { companyId: 'cs' }));
});

test('users cannot read other users profiles', async () => {
  await assertFails(getDoc(doc(as('solo1'), 'users/owner1')));
});

// ---- companies ----
test('owner can update company, others cannot', async () => {
  await assertSucceeds(updateDoc(doc(owner(), 'companies/c1'), { name: 'New' }));
  await assertFails(updateDoc(doc(as('solo1'), 'companies/c1'), { name: 'Hack' }));
  await assertFails(updateDoc(doc(owner(), 'companies/c1'), { ownerId: 'solo1' }));
});

test('company members can read their company only', async () => {
  await assertSucceeds(getDoc(doc(tech(), 'companies/c1')));
  await assertFails(getDoc(doc(tech(), 'companies/c2')));
});

test('user already in a company cannot create a second one', async () => {
  await assertFails(setDoc(doc(owner(), 'companies/cNew'), { ownerId: 'owner1' }));
});

// ---- tenant isolation ----
test('company member reads company jobs, not other tenants or solo jobs', async () => {
  await assertSucceeds(getDoc(doc(tech(), 'jobs/j1')));
  await assertFails(getDoc(doc(tech(), 'jobs/jOther')));
  await assertFails(getDoc(doc(tech(), 'jobs/jSolo')));
});

test('company-scoped query succeeds; unscoped query fails', async () => {
  await assertSucceeds(getDocs(query(collection(tech(), 'jobs'), where('companyId', '==', 'c1'))));
  await assertFails(getDocs(query(collection(tech(), 'jobs'), where('companyId', '==', 'c2'))));
});

test('forged claims cannot be used: unauthenticated and claimless users get nothing', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'jobs/j1')));
  await assertFails(getDoc(doc(as('stranger'), 'jobs/j1')));
});

test('solo users keep access to their own legacy docs', async () => {
  await assertSucceeds(getDoc(doc(as('solo1'), 'jobs/jSolo')));
  await assertSucceeds(updateDoc(doc(as('solo1'), 'jobs/jSolo'), { title: 'x' }));
});

// ---- creation integrity ----
test('cannot create docs attributed to another user or tenant', async () => {
  await assertFails(setDoc(doc(owner(), 'jobs/n1'), { userId: 'someone', companyId: 'c1', status: 'scheduled' }));
  await assertFails(setDoc(doc(owner(), 'jobs/n2'), { userId: 'owner1', companyId: 'c2', status: 'scheduled' }));
  await assertSucceeds(setDoc(doc(owner(), 'jobs/n3'), { userId: 'owner1', companyId: 'c1', status: 'scheduled' }));
});

test('technician cannot create customers or jobs but can add photos', async () => {
  await assertFails(setDoc(doc(tech(), 'customers/n1'), { userId: 'tech1', companyId: 'c1' }));
  await assertFails(setDoc(doc(tech(), 'jobs/n1'), { userId: 'tech1', companyId: 'c1', status: 'scheduled' }));
  await assertSucceeds(setDoc(doc(tech(), 'photos/p1'), { userId: 'tech1', companyId: 'c1', jobId: 'j1' }));
});

test('clients cannot reassign companyId or userId on update', async () => {
  await assertFails(updateDoc(doc(owner(), 'jobs/j1'), { companyId: 'c2' }));
  await assertFails(updateDoc(doc(owner(), 'jobs/j1'), { userId: 'tech1' }));
});

// ---- role enforcement ----
test('technician can update job status and notes but not price/customer', async () => {
  await assertSucceeds(updateDoc(doc(tech(), 'jobs/j1'), { status: 'in-progress', updatedAt: 'now' }));
  await assertFails(updateDoc(doc(tech(), 'jobs/j1'), { totalCost: 0 }));
  await assertFails(updateDoc(doc(tech(), 'jobs/j1'), { customerId: 'cu9' }));
});

test('technician cannot delete jobs or customers; manager can', async () => {
  await assertFails(deleteDoc(doc(tech(), 'jobs/j1')));
  await assertFails(deleteDoc(doc(tech(), 'customers/cu1')));
  await assertSucceeds(deleteDoc(doc(manager(), 'jobs/j1')));
});

test('technician cannot edit customers', async () => {
  await assertFails(updateDoc(doc(tech(), 'customers/cu1'), { name: 'Bob' }));
  await assertSucceeds(updateDoc(doc(manager(), 'customers/cu1'), { name: 'Bob' }));
});

// ---- job status lifecycle ----
test('invalid status values are rejected', async () => {
  await assertFails(updateDoc(doc(owner(), 'jobs/j1'), { status: 'bogus' }));
  await assertFails(setDoc(doc(owner(), 'jobs/n1'), { userId: 'owner1', companyId: 'c1', status: 'bogus' }));
});

test('technician cannot reopen completed jobs; manager can', async () => {
  await assertFails(updateDoc(doc(tech(), 'jobs/jDone'), { status: 'scheduled' }));
  await assertSucceeds(updateDoc(doc(manager(), 'jobs/jDone'), { status: 'scheduled' }));
});

// ---- team members ----
test('team writes require callables even for owners', async () => {
  const invite = { companyId: 'c1', email: 'n@x.com', role: 'technician', status: 'pending' };
  await assertFails(addDoc(collection(owner(), 'teamMembers'), invite));
  await assertFails(addDoc(collection(tech(), 'teamMembers'), invite));
  await assertFails(addDoc(collection(owner(), 'teamMembers'), { ...invite, role: 'owner' }));
  await assertFails(addDoc(collection(owner(), 'teamMembers'), { ...invite, status: 'active' }));
  await assertFails(addDoc(collection(owner(), 'teamMembers'), { ...invite, uid: 'attacker' }));
});

test('owner cannot mutate membership directly', async () => {
  await assertFails(updateDoc(doc(owner(), 'teamMembers/t1'), { uid: 'x' }));
  await assertFails(updateDoc(doc(owner(), 'teamMembers/t1'), { status: 'inactive', updatedAt: 'now' }));
});

test('member can read own team record; unrelated user cannot', async () => {
  await assertSucceeds(getDoc(doc(tech(), 'teamMembers/t1')));
  await assertFails(getDoc(doc(as('solo1'), 'teamMembers/t1')));
});

test('unknown collections are denied', async () => {
  await assertFails(setDoc(doc(owner(), 'secrets/x'), { a: 1 }));
});


// ---- P1: invoices, service plans, service logs ----
test('invoices: managers write, technicians read only, paid is immutable', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'invoices/i1'), { userId: 'owner1', companyId: 'c1', status: 'draft', total: 100 });
    await setDoc(doc(ctx.firestore(), 'invoices/iPaid'), { userId: 'owner1', companyId: 'c1', status: 'paid', total: 100 });
  });
  await assertSucceeds(getDoc(doc(tech(), 'invoices/i1')));
  await assertFails(updateDoc(doc(tech(), 'invoices/i1'), { status: 'paid' }));
  await assertFails(setDoc(doc(tech(), 'invoices/iNew'), { userId: 'tech1', companyId: 'c1', status: 'draft', total: 5 }));
  await assertSucceeds(updateDoc(doc(owner(), 'invoices/i1'), { status: 'sent' }));
  await assertFails(updateDoc(doc(owner(), 'invoices/iPaid'), { total: 1 }));
  await assertFails(updateDoc(doc(owner(), 'invoices/i1'), { status: 'bogus' }));
  await assertFails(setDoc(doc(owner(), 'invoices/neg'), { userId: 'owner1', companyId: 'c1', status: 'draft', total: -1 }));
  await assertFails(deleteDoc(doc(owner(), 'invoices/iPaid')));
});

test('invoices: other tenants cannot read', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'invoices/i1'), { userId: 'owner1', companyId: 'c1', status: 'draft', total: 1 }));
  await assertFails(getDoc(doc(as('x', { companyId: 'c2', role: 'owner' }), 'invoices/i1')));
});

test('serviceLogs: technicians can add, nobody can delete', async () => {
  await assertSucceeds(setDoc(doc(tech(), 'serviceLogs/l1'), { userId: 'tech1', companyId: 'c1', product: 'Termidor', epaRegNo: '7969-210' }));
  await assertFails(deleteDoc(doc(owner(), 'serviceLogs/l1')));
  await assertFails(updateDoc(doc(tech(), 'serviceLogs/l1'), { product: 'x' }));
  await assertSucceeds(updateDoc(doc(owner(), 'serviceLogs/l1'), { notes: 'ok' }));
});

test('servicePlans: frequency must be positive; technicians cannot write', async () => {
  await assertFails(setDoc(doc(owner(), 'servicePlans/p0'), { userId: 'owner1', companyId: 'c1', frequencyDays: 0 }));
  await assertSucceeds(setDoc(doc(owner(), 'servicePlans/p1'), { userId: 'owner1', companyId: 'c1', frequencyDays: 90 }));
  await assertFails(setDoc(doc(tech(), 'servicePlans/p2'), { userId: 'tech1', companyId: 'c1', frequencyDays: 30 }));
});


test('deviceTokens: only the owner can register, read or remove their token', async () => {
  const solo = as('solo1');
  await assertSucceeds(setDoc(doc(solo, 'deviceTokens/solo1_abc'), { userId: 'solo1', token: 'abc' }));
  await assertFails(setDoc(doc(solo, 'deviceTokens/wrongid'), { userId: 'solo1', token: 'abc' }));
  await assertFails(setDoc(doc(as('other1'), 'deviceTokens/other1_abc'), { userId: 'solo1', token: 'abc' }));
  await assertFails(getDoc(doc(as('other1'), 'deviceTokens/solo1_abc')));
  await assertSucceeds(getDoc(doc(solo, 'deviceTokens/solo1_abc')));
  await assertFails(deleteDoc(doc(as('other1'), 'deviceTokens/solo1_abc')));
  await assertSucceeds(deleteDoc(doc(solo, 'deviceTokens/solo1_abc')));
});

// Membership is checked against current server records, so revoked tokens fail immediately.
test('stale member claims fail after deactivation or role change', async () => {
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'teamMembers/t1'), { status: 'inactive' }));
  await assertFails(getDoc(doc(tech(), 'jobs/j1')));
  await assertFails(updateDoc(doc(tech(), 'jobs/j1'), { status: 'completed' }));
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'teamMembers/m1'), { role: 'technician' }));
  await assertFails(deleteDoc(doc(manager(), 'jobs/j1')));
});
test('technicians cannot bypass manager checks by creating unscoped documents', async () => {
  await assertFails(setDoc(doc(tech(), 'jobs/soloBypass'), { userId: 'tech1', status: 'scheduled' }));
  await assertFails(setDoc(doc(tech(), 'customers/soloBypass'), { userId: 'tech1' }));
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'users/tech1'), { rlCompanyId: 'c1', companyId: 'c1' }));
  await assertFails(setDoc(doc(as('tech1'), 'jobs/oldClaimlessToken'), { userId: 'tech1', status: 'scheduled' }));
});
test('managers can query the team but cannot edit invitations or read secrets', async () => {
  await assertSucceeds(getDocs(query(collection(manager(), 'teamMembers'), where('companyId', '==', 'c1'))));
  await assertFails(getDoc(doc(owner(), 'rlInviteSecrets/x')));
  await assertFails(getDoc(doc(owner(), 'rlMail/x')));
});
test('portal sessions cannot access staff data or create companies', async () => {
  const portal = as('customer', { portal: true });
  await assertFails(getDoc(doc(portal, 'jobs/j1')));
  await assertFails(setDoc(doc(portal, 'users/customer'), { companyId: null }));
  await assertFails(setDoc(doc(portal, 'companies/new'), { ownerId: 'customer' }));
});
