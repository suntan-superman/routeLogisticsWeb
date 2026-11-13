// End-to-end check of syncClaims against the Auth, Firestore and Functions emulators.
// Run via: npm run test:e2e
const { test } = require('node:test');
const assert = require('node:assert');

const PROJECT = 'demo-routelogistics';
const AUTH = 'http://127.0.0.1:9099';
const FN = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const ADMIN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

async function signUp(email) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=x`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', returnSecureToken: true }),
  });
  return res.json();
}

async function verifyEmail(localId) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST',
    headers: ADMIN,
    body: JSON.stringify({ localId, emailVerified: true }),
  });
  assert.ok(res.ok, await res.text());
}

async function signIn(email) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=x`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', returnSecureToken: true }),
  });
  return res.json();
}

async function fsCreate(collection, id, fields) {
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: v }])) };
  const res = await fetch(`${FS}/${collection}?documentId=${id}`, { method: 'POST', headers: ADMIN, body: JSON.stringify(body) });
  assert.ok(res.ok, `create ${collection}/${id}: ${await res.text()}`);
}

async function fsGet(collection, id) {
  const res = await fetch(`${FS}/${collection}/${id}`, { headers: ADMIN });
  return res.json();
}

async function callSync(idToken) {
  const res = await fetch(`${FN}/syncClaims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data: {} }),
  });
  return res.json();
}

const claimsOf = (idToken) => JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());

test('owner gets owner claims and legacy data is backfilled', async () => {
  const owner = await signUp('owner@example.com');
  await fsCreate('users', owner.localId, { email: 'owner@example.com' });
  await fsCreate('companies', 'co1', { ownerId: owner.localId });
  await fsCreate('jobs', 'legacyJob', { userId: owner.localId, status: 'scheduled' });

  const out = await callSync(owner.idToken);
  assert.deepStrictEqual(out.result.claims, { companyId: 'co1', role: 'owner' });

  const fresh = await signIn('owner@example.com');
  const c = claimsOf(fresh.idToken);
  assert.strictEqual(c.companyId, 'co1');
  assert.strictEqual(c.role, 'owner');

  const job = await fsGet('jobs', 'legacyJob');
  assert.strictEqual(job.fields.companyId.stringValue, 'co1');
});

test('invite is not accepted until the invitee email is verified', async () => {
  await fsCreate('teamMembers', 'inv1', { companyId: 'co1', email: 'tech@example.com', role: 'technician', status: 'pending' });
  const tech = await signUp('tech@example.com');
  await fsCreate('users', tech.localId, { email: 'tech@example.com' });

  const unverified = await callSync(tech.idToken);
  assert.strictEqual(unverified.result.claims, null);

  await verifyEmail(tech.localId);
  const refreshed = await signIn('tech@example.com');
  const verified = await callSync(refreshed.idToken);
  assert.deepStrictEqual(verified.result.claims, { companyId: 'co1', role: 'technician' });

  const member = await fsGet('teamMembers', 'inv1');
  assert.strictEqual(member.fields.status.stringValue, 'active');
  assert.strictEqual(member.fields.uid.stringValue, tech.localId);
});

test('syncClaims rejects unauthenticated callers', async () => {
  const res = await fetch(`${FN}/syncClaims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: {} }),
  });
  assert.strictEqual(res.status, 401);
});

test('new docs are stamped with the author company by trigger', async () => {
  const u = await signIn('owner@example.com');
  await fsCreate('customers', 'newCust', { userId: u.localId, name: 'Bob' });
  let stamped;
  for (let i = 0; i < 20; i++) {
    stamped = await fsGet('customers', 'newCust');
    if (stamped.fields?.companyId) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.strictEqual(stamped.fields.companyId.stringValue, 'co1');
});
