const { test, before, after } = require('node:test');
const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, writeBatch, setLogLevel } = require('firebase/firestore');
const privateCollections = ['rlReviews', 'rlReviewStats', 'rlReviewAudit', 'rlReviewInvitationSettings', 'rlReviewInvitations', 'rlReviewJobState', 'rlReviewTestGrants', 'rlMail', 'rlSmsOutbox'];
let env;
const companyId = 'reviews-rules-company', owner = 'reviews-rules-owner';
const identities = () => [
  env.unauthenticatedContext(),
  env.authenticatedContext(owner, { companyId, role: 'owner', email_verified: true }),
  ...['admin', 'manager', 'technician'].map(role => env.authenticatedContext('reviews-rules-' + role, { companyId, role, membershipId: 'reviews-rules-' + role, email_verified: true })),
  env.authenticatedContext('reviews-rules-other-owner', { companyId: 'reviews-rules-other', role: 'owner', email_verified: true }),
  env.authenticatedContext('reviews-rules-customer', { portal: true, portalEmail: 'synthetic@example.invalid', email_verified: true }),
  env.authenticatedContext('reviews-rules-platform-admin', { platformAdmin: true, email_verified: true }),
];
before(async () => {
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local demo Firestore emulator required; production writes forbidden.');
  setLogLevel('silent');
  env = await initializeTestEnvironment({ projectId: 'demo-routelogistics', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore(), batch = writeBatch(db);
    batch.set(doc(db, `companies/${companyId}`), { ownerId: owner });
    batch.set(doc(db, 'companies/reviews-rules-other'), { ownerId: 'reviews-rules-other-owner' });
    batch.set(doc(db, 'rlPlatformAdmins/reviews-rules-platform-admin'), { status: 'active', role: 'admin' });
    for (const role of ['admin', 'manager', 'technician']) batch.set(doc(db, 'teamMembers/reviews-rules-' + role), { companyId, uid: 'reviews-rules-' + role, role, status: 'active' });
    batch.set(doc(db, 'jobs/reviews-rules-job'), { companyId, customerId: 'reviews-rules-customer', assignedTo: 'reviews-rules-technician', status: 'completed' });
    for (const name of privateCollections) batch.set(doc(db, name + '/reviews-rules-private'), { companyId, userId: owner, customerId: 'reviews-rules-customer', jobId: 'reviews-rules-job', rating: 1, comment: 'Private feedback', publicConsent: false, tokenHash: 'not-a-real-token', enabled: false, status: 'queued' });
    await batch.commit();
  });
});
after(async () => { if (env) await env.cleanup(); });

test('reviews, consent, moderation, invitation tokens and delivery grants remain server-only for every browser identity', async () => {
  for (const context of identities()) for (const name of privateCollections) {
    const db = context.firestore(), target = doc(db, name + '/reviews-rules-private');
    await assertFails(getDoc(target)); await assertFails(getDocs(collection(db, name)));
    await assertFails(setDoc(doc(db, name + '/reviews-rules-forged'), { companyId, rating: 5, publicConsent: true, enabled: true }));
    await assertFails(updateDoc(target, { rating: 5, comment: 'Altered feedback', publicConsent: true, status: 'published', enabled: true }));
    await assertFails(deleteDoc(target));
  }
});
test('a company owner cannot move private review records across tenants or self-issue a delivery grant', async () => {
  const db = env.authenticatedContext(owner, { companyId, role: 'owner', email_verified: true }).firestore();
  await assertFails(updateDoc(doc(db, 'rlReviews/reviews-rules-private'), { companyId: 'reviews-rules-other' }));
  await assertFails(setDoc(doc(db, 'rlReviewTestGrants/self-approved'), { companyId, recipientHash: 'synthetic', maxMessages: 100, enabled: true }));
  await assertSucceeds(getDoc(doc(db, 'jobs/reviews-rules-job')));
});
