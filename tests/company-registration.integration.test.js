const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { platformCmsHandlers } = require('../functions/platformCms');
const { companyRegistrationHandler } = require('../functions/companyRegistration');
const { workDataHandlers } = require('../functions/workData');
const { companyOnboardingHandlers } = require('../functions/companyOnboarding');

let app, db, registration, createCompany, clock = Date.now();
const auth = (uid, email, verified = true) => ({ uid, token: { email, email_verified: verified } });
const request = (identity, data = {}) => ({ auth: identity, data });

before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'company-registration-tests'); db = getFirestore(app);
  await db.doc('rlCompanyRegistration/policy').delete();
  registration = companyRegistrationHandler(db, platformCmsHandlers(db).requireAdmin, { now: () => clock });
  createCompany = workDataHandlers(db).createCompany;
  await db.doc('rlPlatformAdmins/registration-admin').set({ role: 'admin', status: 'active' });
});
after(() => deleteApp(app));

test('policy fails closed and only a verified platform administrator can configure it', async () => {
  const owner = auth('registration-owner', 'registration-owner@example.test');
  const admin = auth('registration-admin', 'admin@example.test');
  assert.deepEqual(await registration({ data: { action: 'status' } }), { mode: 'closed', configured: false });
  await assert.rejects(createCompany(request(owner, { name: 'Test Company' })), { code: 'permission-denied' });
  await db.doc('rlCompanyRegistration/policy').set({ mode: 'unsupported' });
  assert.deepEqual(await registration({ data: { action: 'status' } }), { mode: 'closed', configured: false });
  await assert.rejects(createCompany(request(owner, { name: 'Test Company' })), { code: 'permission-denied' });
  await db.doc('rlCompanyRegistration/policy').delete();
  await assert.rejects(registration(request(owner, { action: 'admin' })), { code: 'permission-denied' });
  await assert.rejects(registration(request(owner, { action: 'policy', mode: 'open', confirm: 'open', expectedRevision: 0 })), { code: 'permission-denied' });
  await assert.rejects(registration(request(auth('registration-admin', 'admin@example.test', false), { action: 'policy', mode: 'open', confirm: 'open', expectedRevision: 0 })), { code: 'failed-precondition' });
  assert.equal((await registration(request(admin, { action: 'policy', mode: 'approval_required', confirm: 'approval_required', expectedRevision: 0 }))).mode, 'approval_required');
});

test('single-use authorization is email-bound, revocable, expiring, atomic and retry-safe', async () => {
  const admin = auth('registration-admin', 'admin@example.test');
  const owner = auth('registration-owner', 'registration-owner@example.test');
  await assert.rejects(createCompany(request(owner, { name: 'Test Company' })), { code: 'permission-denied' });
  const first = await registration(request(admin, { action: 'issue', email: owner.token.email }));
  const code = new URL(first.link).hash.slice('#authorization='.length);
  assert.equal(first.link.includes(owner.token.email), false);
  await assert.rejects(createCompany(request(auth('other-user', 'other@example.test'), { name: 'Other', authorizationCode: code })), { code: 'permission-denied' });
  const [created, repeated] = await Promise.all([createCompany(request(owner, { name: 'Test Company', authorizationCode: code })), createCompany(request(owner, { name: 'Test Company', authorizationCode: code }))]);
  assert.equal(created.companyId, repeated.companyId);
  assert.equal((await db.collection('companies').where('ownerId', '==', owner.uid).get()).size, 1);
  const policy = await registration(request(admin, { action: 'admin' }));
  assert.equal(policy.outstanding.some(row => row.id === first.id), false);
  assert.equal((await db.doc(`rlCompanyRegistrationAuthorizations/${first.id}`).get()).get('status'), 'redeemed');
  await assert.rejects(createCompany(request(auth('replay-user', owner.token.email), { name: 'Replay', authorizationCode: code })), { code: 'permission-denied' });
  const second = await registration(request(admin, { action: 'issue', email: 'revoked@example.test' }));
  await registration(request(admin, { action: 'revoke', id: second.id }));
  await assert.rejects(createCompany(request(auth('revoked-user', 'revoked@example.test'), { name: 'Revoked', authorizationCode: new URL(second.link).hash.slice('#authorization='.length) })), { code: 'permission-denied' });
  const third = await registration(request(admin, { action: 'issue', email: 'expired@example.test' }));
  await db.doc(`rlCompanyRegistrationAuthorizations/${third.id}`).update({ expiresAt: clock - 1 });
  assert.equal((await registration(request(admin, { action: 'admin' }))).outstanding.find(row => row.id === third.id)?.status, 'expired');
  await assert.rejects(createCompany(request(auth('expired-user', 'expired@example.test'), { name: 'Expired', authorizationCode: new URL(third.link).hash.slice('#authorization='.length) })), { code: 'permission-denied' });
});

test('closed rejects creation; open allows only verified eligible owners', async () => {
  const admin = auth('registration-admin', 'admin@example.test');
  await registration(request(admin, { action: 'policy', mode: 'closed', confirm: 'closed', expectedRevision: 1 }));
  await assert.rejects(createCompany(request(auth('closed-user', 'closed@example.test'), { name: 'Closed' })), { code: 'permission-denied' });
  await registration(request(admin, { action: 'policy', mode: 'open', confirm: 'open', expectedRevision: 2 }));
  await assert.rejects(createCompany(request(auth('unverified-user', 'unverified@example.test', false), { name: 'Unverified' })), { code: 'failed-precondition' });
  const created = await createCompany(request(auth('open-user', 'open@example.test'), { name: 'Open Company' }));
  assert.equal((await db.doc(`companies/${created.companyId}`).get()).get('ownerId'), 'open-user');
  await registration(request(admin, { action: 'policy', mode: 'approval_required', confirm: 'approval_required', expectedRevision: 3 }));
  assert.equal((await registration({ data: { action: 'status' } })).mode, 'approval_required');
});

test('onboarding activation enforces the same authorization and preserves retry identity', async () => {
  const admin = auth('registration-admin', 'admin@example.test');
  const owner = auth('registration-onboarding', 'registration-onboarding@example.test');
  const handlers = companyOnboardingHandlers(db, { emailEnabled: () => false });
  await db.doc(`users/${owner.uid}`).set({ name: 'Onboarding Owner', email: owner.token.email });
  await handlers.saveDraft(request(owner, { expectedRevision: 0, draft: {
    profile: { name: 'Onboarding Owner', businessName: 'Authorized Onboarding Company' },
    services: ['Inspection'], invites: [],
  } }));
  await assert.rejects(handlers.activate(request(owner)), { code: 'permission-denied' });
  const issued = await registration(request(admin, { action: 'issue', email: owner.token.email }));
  const code = new URL(issued.link).hash.slice('#authorization='.length);
  await assert.rejects(handlers.activate(request(owner, { authorizationCode: 'invalid' })), { code: 'permission-denied' });
  const activated = await handlers.activate(request(owner, { authorizationCode: code }));
  assert.equal((await db.doc(`companies/${activated.companyId}`).get()).get('ownerId'), owner.uid);
  assert.equal((await db.doc(`rlCompanyRegistrationAuthorizations/${issued.id}`).get()).get('status'), 'redeemed');
  assert.deepEqual(await handlers.activate(request(owner, { authorizationCode: code })), { companyId: activated.companyId, alreadyActivated: true });
  assert.equal((await db.collection('companies').where('ownerId', '==', owner.uid).get()).size, 1);
});
