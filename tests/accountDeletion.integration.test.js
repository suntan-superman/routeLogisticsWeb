// Synthetic fixtures only; this suite must never connect to production Firebase.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { accountDeletionHandlers } = require('../functions/accountDeletion');
const { requireAccountActive, requireStaff, requireManager, requireCompanyOwner, hash } = require('../functions/security');
const { accessScope } = require('../functions/access');
const { workspaceStatus } = require('../functions/workspace');
const { invitationHandlers, createInvitation, memberIdFor } = require('../functions/invitations');
const { ownershipHandler } = require('../functions/ownership');
const { nativePushHandlers } = require('../functions/nativePush');
const { staffLoginHandlers } = require('../functions/staffLogin');
let app, db, accounts, calls, failure, api;
const fixturePaths = new Set();
const now = Date.UTC(2026, 10, 15, 17), email = 'delete-staff@example.test';
const request = (uid = 'delete-staff', extra = {}) => ({ auth: { uid, token: { email: uid === 'delete-staff' ? email : `${uid}@example.test`, email_verified: true, auth_time: now / 1000, ...extra } }, data: { confirmation: 'DELETE', emailConfirmation: uid === 'delete-staff' ? email : `${uid}@example.test` } });
const account = uid => ({ uid, email: uid === 'delete-staff' ? email : `${uid}@example.test`, emailVerified: true, disabled: false, customClaims: {} });
const auth = {
  async getUser(uid) { if (!accounts.has(uid)) throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); return accounts.get(uid); },
  async getUserByEmail(value) { const found = [...accounts.values()].find(row => row.email === value); if (!found) throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' }); return found; },
  async revokeRefreshTokens(uid) { calls.push(['revoke', uid]); await this.getUser(uid); },
  async setCustomUserClaims(uid, claims) { calls.push(['claims', uid]); const current = await this.getUser(uid); current.customClaims = claims; },
  async deleteUser(uid) { calls.push(['delete', uid]); if (failure) { const saved = failure; failure = null; throw saved; } await this.getUser(uid); accounts.delete(uid); },
  async createCustomToken() { throw new Error('No sign-in token should be issued in this test.'); },
};
const set = (path, data) => { fixturePaths.add(path); return db.doc(path).set(data); };
const get = async path => (await db.doc(path).get()).data();
async function cleanup() {
  // Only remove this suite's explicitly named fixtures and its own audit/limit rows.
  for (const path of fixturePaths) await db.doc(path).delete(); fixturePaths.clear();
  await db.doc('rlAccountDeletions/delete-staff').delete();
  for (const [collection, field] of [['rlMembershipAudit', 'actorId'], ['rlOwnershipAudit', 'previousOwnerId']]) {
    const rows = await db.collection(collection).where(field, '==', 'delete-staff').get();
    for (const row of rows.docs) await row.ref.delete();
  }
  for (const identity of ['account-deletion:delete-staff', 'ownership-transfer:delete-staff', `staff-login-request-email:${email}`, 'staff-login-request-ip:account-deletion-tests', 'accept-invite:replacement-account']) await db.doc(`rlRateLimits/${hash(identity)}`).delete();
}
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'account-deletion-tests'); db = getFirestore(app);
});
after(async () => { await cleanup(); await deleteApp(app); });
beforeEach(async () => {
  await cleanup();
  accounts = new Map(['delete-staff', 'owner', 'other', 'new-owner'].map(uid => [uid, account(uid)])); calls = []; failure = null;
  api = accountDeletionHandlers(db, auth, { now: () => now });
  await set('users/delete-staff', { name: 'Synthetic staff', email, companyId: 'delete-co', rlCompanyId: 'delete-co' });
  await set('companies/delete-co', { name: 'Synthetic company', ownerId: 'owner', isActive: true });
  await set('teamMembers/delete-member', { uid: 'delete-staff', email, name: 'Synthetic staff', role: 'technician', status: 'active', companyId: 'delete-co' });
});

test('deletion requires the verified recent caller and explicit confirmation; no target identity is accepted', async () => {
  const invalid = [
    [{ data: { confirmation: 'DELETE' } }, 'unauthenticated'],
    [request('delete-staff', { email_verified: false }), 'failed-precondition'],
    [request('delete-staff', { auth_time: now / 1000 - 301 }), 'failed-precondition'],
    [request('delete-staff', { auth_time: now / 1000 + 31 }), 'failed-precondition'],
    [request('delete-staff', { auth_time: undefined }), 'failed-precondition'],
    [request('delete-staff', { portal: true }), 'unauthenticated'],
    [{ ...request(), data: { confirmation: 'delete' } }, 'invalid-argument'],
    [{ ...request(), data: { confirmation: 'DELETE', uid: 'other' } }, 'invalid-argument'],
    [request('rl_customer_' + 'a'.repeat(64)), 'invalid-argument'],
  ];
  for (const [input, code] of invalid) await assert.rejects(api.request(input), { code });
  assert.equal(await get('rlAccountDeletions/delete-staff'), undefined); assert.deepEqual(calls, []);
});

test('missing, partial and wrong email confirmations cannot create markers, limits or account changes', async () => {
  for (const emailConfirmation of [undefined, null, '', 'delete-staff', '@example.test', 'delete-staff@example', 'delete-staff@example.test.extra', 'other@example.test', { email }]) {
    await assert.rejects(api.request({ ...request(), data: { confirmation: 'DELETE', ...(emailConfirmation !== undefined ? { emailConfirmation } : {}) } }), { code: 'invalid-argument' });
  }
  assert.equal(await get('rlAccountDeletions/delete-staff'), undefined); assert.equal(await get(`rlRateLimits/${hash('account-deletion:delete-staff')}`), undefined);
  assert.deepEqual(calls, []); assert.equal(accounts.get('delete-staff').email, email); assert.equal((await get('teamMembers/delete-member')).status, 'active');
  assert.equal((await db.collection('rlMembershipAudit').where('actorId', '==', 'delete-staff').get()).size, 0);
});

test('full typed email is normalized for comparison with both verified token and current Auth account', async () => {
  const input = request(); input.data.emailConfirmation = '  DELETE-STAFF@Example.Test  ';
  assert.equal((await api.request(input)).deleted, true); assert.equal(accounts.has('delete-staff'), false);
});

test('a changed live Auth email cannot be deleted with an old token and old typed email', async () => {
  accounts.get('delete-staff').email = 'changed@example.test';
  await assert.rejects(api.request(request()), { code: 'permission-denied' });
  assert.equal(await get('rlAccountDeletions/delete-staff'), undefined); assert.equal(await get(`rlRateLimits/${hash('account-deletion:delete-staff')}`), undefined);
  assert.deepEqual(calls, []); assert.ok(accounts.has('delete-staff')); assert.equal((await get('teamMembers/delete-member')).status, 'active');
});

test('a pending deletion request cannot bypass the live email confirmation check', async () => {
  const pending = { status: 'pending', emailHash: hash(email), invitationIds: [], requestedAt: 'accepted-fixture' };
  await set('rlAccountDeletions/delete-staff', pending); accounts.get('delete-staff').email = 'changed@example.test';
  await assert.rejects(api.request(request()), { code: 'permission-denied' });
  assert.deepEqual(await get('rlAccountDeletions/delete-staff'), pending); assert.deepEqual(calls, []); assert.ok(accounts.has('delete-staff'));
});

test('legacy extra claims do not block self-deletion or authorize another UID deletion', async () => {
  accounts.get('delete-staff').customClaims = { legacyFeature: true };
  accounts.set('delete-other-account', { ...account('delete-other-account'), customClaims: { retainedFeature: true } });
  const retained = { name: 'Retained other account', email: 'other@example.test' };
  await set('users/delete-other-account', retained);
  await assert.rejects(api.request({ ...request(), data: { confirmation: 'DELETE', uid: 'delete-other-account' } }), { code: 'invalid-argument' });
  assert.ok(accounts.has('delete-staff')); assert.ok(accounts.has('delete-other-account'));
  assert.equal((await api.request(request())).deleted, true);
  assert.equal(accounts.has('delete-staff'), false); assert.deepEqual(accounts.get('delete-other-account').customClaims, { retainedFeature: true });
  assert.deepEqual(await get('users/delete-other-account'), retained);
});

test('staff deletion removes personal credentials and device/location state while preserving tenant data, portal identity and business history', async () => {
  const retained = {
    'customers/delete-customer': { companyId: 'delete-co', userId: 'delete-staff', name: 'Retained synthetic customer' },
    'jobs/delete-job': { companyId: 'delete-co', userId: 'delete-staff', assignedTo: 'delete-member', status: 'completed' },
    'invoices/delete-invoice': { companyId: 'delete-co', userId: 'delete-staff', total: 25, status: 'sent' },
    'rlJobVisits/delete-visit': { companyId: 'delete-co', userId: 'delete-staff', event: 'arrived' },
    'rlWorkShiftEvents/delete-event': { companyId: 'delete-co', userId: 'delete-staff', event: 'end' },
    'rlMail/retained-invoice-mail': { to: email, invoiceId: 'delete-invoice', status: 'sent', text: 'Synthetic business history' },
    'rlPortalChallenges/retained-portal': { email, consumed: true },
  };
  for (const [path, data] of Object.entries(retained)) await set(path, data);
  const personal = [
    ['rlPushDevices', 'uid'], ['rlPushPreferences', 'uid'], ['rlPushInstallations', 'uid'], ['rlPushDeliveries', 'uid'],
    ['deviceTokens', 'userId'], ['rlNotifications', 'userId'], ['rlLocations', 'userId'], ['rlWorkShifts', 'userId'],
    ['rlJobVisitStates', 'userId'], ['rlQbOAuthStates', 'userId'],
  ];
  for (const [collection, field] of personal) { await set(`${collection}/deletion-personal`, { [field]: 'delete-staff', companyId: 'delete-co' }); await set(`${collection}/deletion-other`, { [field]: 'other', companyId: 'other-co' }); }
  await set('rlPlatformAdmins/delete-staff', { status: 'active', role: 'admin' });
  await set('rlStaffLoginChallenges/delete-challenge', { uid: 'delete-staff', email });
  await set(`rlStaffLoginRequests/${hash(email)}`, { challengeId: 'delete-challenge' });
  await set('rlMail/delete-code', { staffLoginChallengeId: 'delete-challenge', text: 'Synthetic one-time credential' });
  await set('teamMembers/delete-pending', { email, role: 'technician', status: 'pending', companyId: 'other-co' });
  await set('teamMembers/other-pending', { email: 'other@example.test', role: 'technician', status: 'pending', companyId: 'delete-co' });
  for (const id of ['delete-member', 'delete-pending', 'other-pending']) { await set(`rlInviteSecrets/${id}`, { codeHash: 'synthetic' }); await set(`rlMembershipIdentities/${id}`, { memberId: id, email: id }); await set(`rlMail/${id}`, { invitationId: id, text: 'Synthetic invitation credential' }); }
  const portalUid = 'rl_customer_' + hash(email); accounts.set(portalUid, { ...account(portalUid), email, customClaims: { portal: true } });
  assert.deepEqual(await api.request(request()), { success: true, deleted: true, businessRecordsRetained: true });
  assert.equal(accounts.has('delete-staff'), false); assert.ok(accounts.has(portalUid)); assert.ok(accounts.has('other'));
  assert.ok(calls.every(([, uid]) => uid === 'delete-staff'));
  for (const [path, data] of Object.entries(retained)) assert.deepEqual(await get(path), data);
  for (const [collection] of personal) { assert.equal(await get(`${collection}/deletion-personal`), undefined); assert.ok(await get(`${collection}/deletion-other`)); }
  for (const path of ['users/delete-staff', 'rlPlatformAdmins/delete-staff', 'rlStaffLoginChallenges/delete-challenge', `rlStaffLoginRequests/${hash(email)}`, 'rlMail/delete-code', 'rlInviteSecrets/delete-member', 'rlInviteSecrets/delete-pending', 'rlMembershipIdentities/delete-member', 'rlMail/delete-pending']) assert.equal(await get(path), undefined, path);
  for (const id of ['delete-member', 'delete-pending']) { const row = await get(`teamMembers/${id}`); assert.equal(row.status, 'removed'); assert.equal(row.uid, null); assert.equal(row.email, ''); assert.equal(row.expiresAt, 0); }
  assert.equal((await get('teamMembers/other-pending')).status, 'pending'); assert.ok(await get('rlInviteSecrets/other-pending'));
  const marker = await get('rlAccountDeletions/delete-staff'); assert.equal(marker.status, 'deleted'); assert.equal(marker.emailHash, undefined); assert.equal(marker.invitationIds, undefined); assert.equal(JSON.stringify(marker).includes(email), false);
  const before = calls.length; assert.equal((await api.request(request())).deleted, true); assert.equal(calls.length, before);
});

test('deleting a solo account preserves its historical business documents and does not create a company', async () => {
  await db.doc('teamMembers/delete-member').delete(); await set('users/delete-staff', { name: 'Synthetic solo', email });
  await set('customers/solo-history', { userId: 'delete-staff', name: 'Retained customer' });
  await set('photos/solo-photo', { userId: 'delete-staff', storagePath: 'users/delete-staff/jobs/retained/photo.jpg' });
  assert.equal((await api.request(request())).deleted, true);
  assert.equal((await get('customers/solo-history')).name, 'Retained customer'); assert.ok(await get('photos/solo-photo'));
  assert.equal((await db.collection('companies').where('ownerId', '==', 'delete-staff').get()).size, 0);
});

test('company owners with other active members must explicitly transfer ownership; pending or inactive records do not silently gain ownership', async () => {
  await set('companies/delete-co', { ownerId: 'delete-staff', name: 'Synthetic company' });
  for (const role of ['technician', 'manager', 'admin']) {
    await set('teamMembers/other-active', { companyId: 'delete-co', uid: 'other', role, status: 'active' });
    await assert.rejects(api.request(request()), failure => failure.code === 'failed-precondition' && /Transfer company ownership/.test(failure.message));
  }
  assert.equal(await get('rlAccountDeletions/delete-staff'), undefined); assert.ok(accounts.has('delete-staff'));
  await db.doc('teamMembers/other-active').update({ status: 'inactive' });
  const company = await get('companies/delete-co'); await set('rlQbConnections/retained-connection', { companyId: 'delete-co', status: 'connected', environment: 'sandbox' });
  await set('teamMembers/sole-owner-pending', { companyId: 'delete-co', email: 'pending@example.test', role: 'admin', status: 'pending' });
  await set('rlInviteSecrets/sole-owner-pending', { codeHash: 'synthetic' });
  assert.equal((await api.request(request())).deleted, true);
  assert.deepEqual(await get('companies/delete-co'), company); assert.equal((await get('teamMembers/other-active')).status, 'inactive');
  assert.equal((await get('teamMembers/sole-owner-pending')).status, 'removed'); assert.equal(await get('rlInviteSecrets/sole-owner-pending'), undefined);
  assert.equal((await get('rlQbConnections/retained-connection')).status, 'connected');
});

test('ownership transfer racing deletion cannot delete the active company owner out from under its team', async context => {
  // Ownership and deletion must evaluate the same fixture auth_time clock.
  context.mock.method(Date, 'now', () => now);
  await set('companies/delete-co', { ownerId: 'delete-staff', name: 'Synthetic company' });
  await set('teamMembers/new-owner', { companyId: 'delete-co', uid: 'new-owner', email: 'new-owner@example.test', status: 'active', role: 'admin' });
  const transfer = ownershipHandler(db, async () => null);
  const outcomes = await Promise.allSettled([
    api.request(request()), transfer({ ...request(), data: { companyId: 'delete-co', memberId: 'new-owner' } }),
  ]);
  assert.equal(outcomes[1].status, 'fulfilled');
  assert.equal((await get('companies/delete-co')).ownerId, 'new-owner'); assert.ok(accounts.has('new-owner'));
  if (outcomes[0].status === 'fulfilled') assert.equal(outcomes[0].value.deleted, true);
  else assert.equal(outcomes[0].reason.code, 'failed-precondition');
});

test('a recorded deletion denies stale sessions immediately and safely resumes after a transient Auth failure', async () => {
  failure = Object.assign(new Error('Simulated transient failure with no provider request.'), { code: 'auth/internal-error' });
  await assert.rejects(api.request(request()), error => error.code === 'unavailable' && error.details?.deletionPending === true);
  assert.equal((await get('rlAccountDeletions/delete-staff')).status, 'pending'); assert.ok(accounts.has('delete-staff'));
  const stale = request('delete-staff', { companyId: 'delete-co', membershipId: 'delete-member', role: 'technician' });
  for (const operation of [
    () => requireAccountActive(db, 'delete-staff'), () => requireStaff(db, stale, 'delete-co'),
    () => requireManager(db, stale, { userId: 'delete-staff' }), () => requireCompanyOwner(db, stale, 'delete-co'),
    () => accessScope(db, stale), () => nativePushHandlers(db).manage({ ...stale, data: { action: 'invalidate-installation' } }),
  ]) await assert.rejects(operation(), { code: 'permission-denied' });
  assert.equal((await workspaceStatus(db, { uid: 'delete-staff', email, emailVerified: true }, { companyId: 'delete-co' })).status, 'deleted');
  const staff = staffLoginHandlers(db, auth); const codeRequest = await staff.requestStaffOTP({ rawRequest: { ip: 'account-deletion-tests' }, data: { email } }); assert.ok(codeRequest.challengeId);
  assert.equal((await db.collection('rlStaffLoginChallenges').where('uid', '==', 'delete-staff').get()).size, 0);
  assert.equal((await api.complete('delete-staff')).deleted, true); assert.equal(accounts.has('delete-staff'), false);
  assert.equal((await get('rlAccountDeletions/delete-staff')).status, 'deleted');
  const deletedCalls = calls.length; await api.complete('delete-staff'); assert.equal(calls.length, deletedCalls);
});

test('lost response after Auth deletion can be retried using only the same recent signed identity', async () => {
  await set('rlAccountDeletions/delete-staff', { status: 'pending', requestedAt: new Date(now), emailHash: hash(email), invitationIds: [] });
  accounts.delete('delete-staff');
  assert.equal((await api.request(request())).deleted, true);
  assert.equal((await get('rlAccountDeletions/delete-staff')).status, 'deleted');
  await assert.rejects(api.request({ ...request('other'), data: { confirmation: 'DELETE', uid: 'delete-staff' } }), { code: 'invalid-argument' });
  assert.ok(accounts.has('other'));
});

test('concurrent deletion requests and worker cleanup do not duplicate audits or affect another tenant', async () => {
  const outcomes = await Promise.all([api.request(request()), api.request(request())]);
  assert.ok(outcomes.every(row => row.deleted));
  const audit = await db.collection('rlMembershipAudit').where('memberId', '==', 'delete-member').get(); assert.equal(audit.size, 1);
  assert.equal((await get('companies/delete-co')).ownerId, 'owner'); assert.ok(accounts.has('owner'));
});

test('a new same-email account cannot accept the deleted account old invitation secret', async () => {
  const code = 'a'.repeat(64), invite = 'delete-pending';
  await set(`teamMembers/${invite}`, { companyId: 'delete-co', email, role: 'technician', status: 'pending', expiresAt: now + 60000 });
  await set(`rlInviteSecrets/${invite}`, { codeHash: hash(code) });
  await api.request(request());
  const invites = invitationHandlers(db, async () => null, () => 'https://example.test', () => false);
  await assert.rejects(invites.acceptTeamInvite({ auth: { uid: 'replacement-account', token: { email, email_verified: true } }, data: { inviteId: invite, code } }));
  assert.equal((await get(`teamMembers/${invite}`)).status, 'removed');
});

test('an already-authorized invitation request cannot recreate credentials after its owner begins deletion', async () => {
  await set('companies/delete-co', { ownerId: 'delete-staff', name: 'Synthetic company' });
  await set('rlAccountDeletions/delete-staff', { status: 'pending', requestedAt: new Date(now) });
  await assert.rejects(createInvitation(db, { companyId: 'delete-co', email: 'late-invite@example.test', role: 'technician', invitedBy: 'delete-staff', appUrl: 'https://example.test', queueEmail: false }), { code: 'permission-denied' });
  assert.equal((await db.collection('teamMembers').where('email', '==', 'late-invite@example.test').get()).size, 0);
});

test('concurrent cleanup tolerates an Auth account disappearing between lookup and token revocation', async () => {
  const revoke = auth.revokeRefreshTokens;
  auth.revokeRefreshTokens = async target => { accounts.delete(target); throw Object.assign(new Error('Already deleted by the other worker.'), { code: 'auth/user-not-found' }); };
  try {
    assert.equal((await api.request(request())).deleted, true);
    assert.equal((await get('rlAccountDeletions/delete-staff')).status, 'deleted');
  } finally { auth.revokeRefreshTokens = revoke; }
});

test('a legitimate same-email re-invitation survives an older deletion worker retry', async () => {
  const id = memberIdFor('delete-co', email);
  // The deletion transaction has already removed all of this UID's memberships.
  await db.doc('teamMembers/delete-member').update({ uid: null, email: '', status: 'removed', accountDeletionUid: 'delete-staff' });
  await set(`teamMembers/${id}`, { companyId: 'delete-co', uid: null, email: '', role: 'technician', status: 'removed', accountDeletionUid: 'delete-staff' });
  await set(`rlInviteSecrets/${id}`, { codeHash: 'superseded-credential' });
  await set(`rlMembershipIdentities/${id}`, { companyId: 'delete-co', email, memberId: id });
  await set('rlAccountDeletions/delete-staff', { status: 'pending', emailHash: hash(email), invitationIds: [id] });
  const invitation = await createInvitation(db, { companyId: 'delete-co', email, role: 'technician', invitedBy: 'owner', appUrl: 'https://example.test', queueEmail: true }, now);
  const secret = await get(`rlInviteSecrets/${id}`);
  const mail = await db.collection('rlMail').where('invitationId', '==', id).get(); mail.docs.forEach(row => fixturePaths.add(row.ref.path));
  const audits = await db.collection('rlMembershipAudit').where('memberId', '==', id).get(); audits.docs.forEach(row => fixturePaths.add(row.ref.path));
  assert.equal(invitation.teamMemberId, id); assert.equal(mail.size, 1);
  assert.equal((await api.complete('delete-staff')).deleted, true);
  assert.deepEqual(await get(`rlInviteSecrets/${id}`), secret); assert.ok(await get(`rlMembershipIdentities/${id}`));
  assert.equal((await get(`teamMembers/${id}`)).status, 'pending'); assert.equal((await get(`teamMembers/${id}`)).accountDeletionUid, undefined);
  assert.equal((await mail.docs[0].ref.get()).exists, true);
});

test('deletion of an old sign-in preserves a replacement account latest email-code request', async () => {
  const challengeId = 'e'.repeat(48);
  await set(`rlStaffLoginChallenges/${challengeId}`, { uid: 'replacement-account', email });
  await set(`rlStaffLoginRequests/${hash(email)}`, { challengeId });
  await set('rlAccountDeletions/delete-staff', { status: 'pending', emailHash: hash(email), invitationIds: [] });
  await api.complete('delete-staff');
  assert.equal((await get(`rlStaffLoginRequests/${hash(email)}`)).challengeId, challengeId);
  assert.equal((await get(`rlStaffLoginChallenges/${challengeId}`)).uid, 'replacement-account');
});
