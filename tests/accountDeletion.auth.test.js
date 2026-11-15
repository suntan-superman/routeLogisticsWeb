const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { getAuth } = req('firebase-admin/auth');
const { accountDeletionHandlers } = require('../functions/accountDeletion');
const { requireAccountActive, hash } = require('../functions/security');
let app, db, auth;
const uid = 'account-deletion-auth-fixture', email = 'account-deletion-native@example.test';
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Auth and Firestore emulators are required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'account-deletion-auth'); db = getFirestore(app); auth = getAuth(app);
});
after(async () => {
  if (!app) return;
  for (const path of [`users/${uid}`, `rlAccountDeletions/${uid}`, `rlRateLimits/${hash('account-deletion:' + uid)}`]) await db.doc(path).delete();
  try { await auth.deleteUser(uid); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  await deleteApp(app);
});
test('real emulator Auth account is deleted, refresh access revoked, and a lost-response retry remains idempotent', async () => {
  await auth.createUser({ uid, email, password: 'Synthetic-deletion-only-123', emailVerified: true });
  await db.doc(`users/${uid}`).set({ name: 'Synthetic account deletion fixture', email });
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Synthetic-deletion-only-123', returnSecureToken: true }) });
  assert.equal(response.status, 200); const session = await response.json();
  const token = await auth.verifyIdToken(session.idToken);
  const request = { auth: { uid, token }, data: { confirmation: 'DELETE', emailConfirmation: email } }, api = accountDeletionHandlers(db, auth);
  await assert.rejects(api.request({ ...request, data: { confirmation: 'DELETE', emailConfirmation: 'account-deletion-native' } }), { code: 'invalid-argument' });
  assert.equal((await auth.getUser(uid)).email, email); assert.equal((await db.doc(`rlAccountDeletions/${uid}`).get()).exists, false);
  assert.equal((await api.request(request)).deleted, true);
  await assert.rejects(auth.getUser(uid), { code: 'auth/user-not-found' });
  await assert.rejects(auth.verifyIdToken(session.idToken, true));
  await assert.rejects(requireAccountActive(db, uid), { code: 'permission-denied' });
  assert.equal((await db.doc(`users/${uid}`).get()).exists, false);
  assert.equal((await api.request(request)).deleted, true);
});
