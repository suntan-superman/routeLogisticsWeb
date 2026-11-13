const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const req = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { getAuth } = req('firebase-admin/auth');
const { staffLoginHandlers } = require('../functions/staffLogin');
let app, db, auth;
before(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Both Auth and Firestore emulators are required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'staff-login-auth-tests');
  db = getFirestore(app); auth = getAuth(app);
});
after(() => deleteApp(app));

for (const role of ['owner', 'pending-technician']) test(`email OTP exchanges for the existing ${role} Firebase identity without changing access`, async () => {
  const email = `${role}@staff-login-auth.test`;
  const user = await auth.createUser({ email, emailVerified: true });
  const claims = role === 'owner' ? { companyId: 'otp-owner-company', role: 'owner' } : {};
  await auth.setCustomUserClaims(user.uid, claims);
  if (role !== 'owner') await db.doc('teamMembers/otp-pending-identity').set({ companyId: 'otp-owner-company', email, role: 'technician', status: 'pending', uid: null });
  const handlers = staffLoginHandlers(db, auth);
  const request = data => ({ data, rawRequest: { ip: role } });
  const issued = await handlers.requestStaffOTP(request({ email }));
  const mail = await db.collection('rlMail').where('staffLoginChallengeId', '==', issued.challengeId).get();
  const code = mail.docs[0].get('text').match(/code is (\d{6})/)[1];
  const verified = await handlers.verifyStaffOTP(request({ challengeId: issued.challengeId, code }));
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=emulator`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: verified.token, returnSecureToken: true }),
  });
  assert.equal(response.status, 200);
  const session = await response.json(), decoded = await auth.verifyIdToken(session.idToken);
  assert.equal(decoded.uid, user.uid); assert.equal(decoded.email, email); assert.equal(decoded.email_verified, true);
  assert.equal(decoded.role, claims.role); assert.equal(decoded.companyId, claims.companyId);
  assert.equal(decoded.membershipId, undefined);
  assert.deepEqual((await auth.getUser(user.uid)).customClaims, claims);
  if (role !== 'owner') assert.equal((await db.doc('teamMembers/otp-pending-identity').get()).get('status'), 'pending');
  await assert.rejects(handlers.verifyStaffOTP(request({ challengeId: issued.challengeId, code })), { code: 'permission-denied' });
});
