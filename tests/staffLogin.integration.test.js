const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const req = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore, Timestamp } = req('firebase-admin/firestore');
const { staffLoginHandlers } = require('../functions/staffLogin');
const { deliverMail } = require('../functions/mail');
let app, db, sequence = 0;
before(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Staff login tests require the local emulator.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'staff-login-tests'); db = getFirestore(app);
});
after(() => deleteApp(app));
function fixture(changes = {}, enabled = true) {
  const id = `staff-login-${++sequence}`, email = `${id}@example.test`;
  const user = { uid: id, email, emailVerified: true, disabled: false, tokensValidAfterTime: '2026-01-01', customClaims: {}, ...changes };
  const minted = [];
  const missing = () => { throw Object.assign(new Error('Missing account'), { code: 'auth/user-not-found' }); };
  const auth = {
    getUserByEmail: async input => input === email && !user.deleted ? user : missing(),
    getUser: async uid => uid === id && !user.deleted ? user : missing(),
    createCustomToken: async (...args) => { minted.push(args); return 'synthetic-token'; },
  };
  const handlers = staffLoginHandlers(db, auth, () => enabled);
  const request = data => ({ data, rawRequest: { ip: id } });
  return { id, email, user, auth, minted, handlers, request };
}
async function issue(f) {
  const response = await f.handlers.requestStaffOTP(f.request({ email: ` ${f.email.toUpperCase()} ` }));
  const mails = await db.collection('rlMail').where('staffLoginChallengeId', '==', response.challengeId).get();
  return { response, mail: mails.docs[0], code: mails.docs[0]?.get('text').match(/code is (\d{6})/)[1] };
}
const verify = (f, item, code = item.code) => f.handlers.verifyStaffOTP(f.request({ challengeId: item.response.challengeId, code, uid: 'attacker', role: 'owner', companyId: 'another-company' }));

test('staff code signs into the existing verified UID without granting roles or accepting an invitation', async () => {
  const f = fixture();
  await db.doc(`teamMembers/${f.id}`).set({ email: f.email, role: 'technician', status: 'pending', companyId: 'staff-test-company' });
  const item = await issue(f);
  assert.match(item.response.challengeId, /^[a-f0-9]{48}$/);
  assert.equal(item.response.code, undefined); assert.equal(item.response.token, undefined);
  const challenge = await db.doc(`rlStaffLoginChallenges/${item.response.challengeId}`).get();
  assert.equal(challenge.get('code'), undefined); assert.notEqual(challenge.get('codeHash'), item.code);
  assert.equal((await verify(f, item)).token, 'synthetic-token');
  assert.deepEqual(f.minted, [[f.id]]);
  assert.deepEqual(f.user.customClaims, {});
  assert.equal((await db.doc(`teamMembers/${f.id}`).get()).get('status'), 'pending');
  await assert.rejects(verify(f, item), { code: 'permission-denied' });
});

test('unknown, disabled, unverified, portal and MFA accounts get the same response and no code', async () => {
  const messages = [];
  for (const changes of [{ deleted: true }, { disabled: true }, { emailVerified: false }, { customClaims: { portal: true } }, { uid: 'rl_customer_example' }, { multiFactor: { enrolledFactors: [{ factorId: 'totp' }] } }]) {
    const f = fixture(changes), item = await issue(f);
    assert.equal(item.mail, undefined); messages.push(item.response.message);
    await assert.rejects(verify(f, item, '123456'), { code: 'permission-denied' });
    assert.equal(f.minted.length, 0);
  }
  assert.equal(new Set(messages).size, 1);
  assert.equal(messages[0], (await issue(fixture())).response.message);
});

test('five incorrect attempts lock a code even under concurrent requests; expiry also prevents sign-in', async () => {
  const f = fixture(), item = await issue(f), wrong = item.code === '000000' ? '999999' : '000000';
  const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => verify(f, item, wrong)));
  assert.ok(attempts.every(result => result.status === 'rejected'));
  assert.equal((await db.doc(`rlStaffLoginChallenges/${item.response.challengeId}`).get()).get('attempts'), 5);
  await assert.rejects(verify(f, item), { code: 'permission-denied' });
  const expired = await issue(fixture());
  await db.doc(`rlStaffLoginChallenges/${expired.response.challengeId}`).update({ expiresAt: Timestamp.fromMillis(0) });
  await assert.rejects(verify(f, expired), { code: 'permission-denied' });
  assert.equal(f.minted.length, 0);
});

test('resend invalidates previous codes and the worker cancels stale queued OTP emails', async () => {
  const f = fixture(), first = await issue(f), second = await issue(f);
  await assert.rejects(verify(f, first), { code: 'permission-denied' });
  let sends = 0;
  const transport = { sendMail: async () => { sends++; return { accepted: [f.email] }; } };
  await deliverMail(db, first.mail.ref, transport, 'sender@example.test');
  assert.equal((await first.mail.ref.get()).get('status'), 'cancelled'); assert.equal(sends, 0);
  await deliverMail(db, second.mail.ref, transport, 'sender@example.test');
  assert.equal(sends, 1); assert.equal((await second.mail.ref.get()).get('status'), 'sent');
  await verify(f, second);
});

test('concurrent redemption mints exactly one token and consumed email is cancelled', async () => {
  const f = fixture(), item = await issue(f);
  const results = await Promise.allSettled([verify(f, item), verify(f, item)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(f.minted.length, 1);
  await deliverMail(db, item.mail.ref, { sendMail: async () => { throw new Error('Consumed OTP must not send'); } }, 'sender@example.test');
  assert.equal((await item.mail.ref.get()).get('status'), 'cancelled');
});

test('live account changes after issuance prevent disabled, revoked, changed-email and MFA sign-in', async () => {
  for (const change of [{ disabled: true }, { emailVerified: false }, { deleted: true }, { email: 'changed@example.test' }, { tokensValidAfterTime: '2026-11-13' }, { customClaims: { portal: true } }, { multiFactor: { enrolledFactors: [{ factorId: 'phone' }] } }]) {
    const f = fixture(), item = await issue(f); Object.assign(f.user, change);
    await assert.rejects(verify(f, item), { code: 'permission-denied' }); assert.equal(f.minted.length, 0);
  }
});

test('request limits, malformed codes and disabled email are enforced server-side', async () => {
  const f = fixture();
  await issue(f); await issue(f); await issue(f);
  await assert.rejects(issue(f), { code: 'resource-exhausted' });
  for (const data of [{ challengeId: '../secret', code: '123456' }, { challengeId: 'a'.repeat(48), code: 'abc123' }]) await assert.rejects(f.handlers.verifyStaffOTP(f.request(data)), { code: 'permission-denied' });
  const off = fixture({}, false);
  await assert.rejects(issue(off), { code: 'failed-precondition' });
  await assert.rejects(off.handlers.verifyStaffOTP(off.request({})), { code: 'failed-precondition' });
});
