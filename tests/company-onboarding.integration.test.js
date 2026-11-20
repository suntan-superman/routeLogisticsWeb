const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { companyOnboardingHandlers } = require('../functions/companyOnboarding');
const { customerHandlers } = require('../functions/customers');
let app, db, sequence = 0;
before(() => { if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required; production data must never be used.'); app = initializeApp({ projectId: 'demo-routelogistics' }, 'onboarding-tests'); db = getFirestore(app); });
after(() => deleteApp(app));

test('verified owner drafts resume, isolate by uid, and activation retries never duplicate the company', async () => {
  const uid = `onboarding-${Date.now()}-${++sequence}`, otherUid = `${uid}-other`, email = `${uid}@example.com`;
  await db.doc(`users/${uid}`).set({ name: 'Owner', email });
  const handlers = companyOnboardingHandlers(db), caller = { uid, token: { email, email_verified: true } }, other = { uid: otherUid, token: { email: `${otherUid}@example.com`, email_verified: true } };
  const request = (data, auth = caller) => ({ auth, data });
  const businessHours = Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { closed: ['saturday','sunday'].includes(day), open: '09:00', close: '17:00' }]));
  const draft = { currentStep: 7, profile: { name: 'Owner', businessName: 'New Field Co', phone: '555-0100' }, services: ['Pest control'], timeZone: 'America/Los_Angeles', businessHours, serviceArea: { method: 'zip', zipCodes: ['93301'] }, invites: [] };
  assert.equal((await handlers.getDraft(request({}))).draft, null);
  const saved = await handlers.saveDraft(request({ draft, expectedRevision: 0 })); assert.equal(saved.revision, 1);
  assert.equal((await handlers.getDraft(request({}))).draft.profile.businessName, 'New Field Co');
  assert.equal((await handlers.getDraft(request({}, other))).draft, null);
  await assert.rejects(handlers.saveDraft(request({ draft, expectedRevision: 0 })), { code: 'aborted' });
  const activated = await handlers.activate(request({})); assert.ok(activated.companyId);
  assert.equal((await db.doc(`companies/${activated.companyId}`).get()).get('ownerId'), uid);
  assert.equal((await db.doc(`companies/${activated.companyId}`).get()).get('timeZone'), 'America/Los_Angeles');
  const repeated = await handlers.activate(request({})); assert.equal(repeated.companyId, activated.companyId); assert.equal(repeated.alreadyActivated, true);
  assert.equal((await db.collection('companies').where('ownerId', '==', uid).get()).size, 1);
  const importer = customerHandlers(db).bulkImportCustomers;
  const importRequest = { auth: { uid, token: { companyId: activated.companyId, role: 'owner', email, email_verified: true } }, data: { customers: [{ name: 'Onboarding CSV customer', email: `${uid}-customer@example.test` }] } };
  assert.deepEqual(await importer(importRequest), { created: 1, skipped: 0 });
  assert.deepEqual(await importer(importRequest), { created: 0, skipped: 1 });
  const imported = await db.collection('customers').where('companyId', '==', activated.companyId).where('email', '==', `${uid}-customer@example.test`).get();
  assert.equal(imported.size, 1);
});

test('activation rejects unverified owners and drafts without company name or services', async () => {
  const uid = `onboarding-invalid-${Date.now()}-${++sequence}`, email = `${uid}@example.com`;
  await db.doc(`users/${uid}`).set({ email });
  const handlers = companyOnboardingHandlers(db), caller = { uid, token: { email, email_verified: false } };
  await assert.rejects(handlers.getDraft({ auth: caller, data: {} }), { code: 'failed-precondition' });
});

test('pending invitations and existing companies cannot create a second company', async () => {
  const handlers = companyOnboardingHandlers(db);
  const invitedUid = `onboarding-invited-${Date.now()}-${++sequence}`, invitedEmail = `${invitedUid}@example.com`;
  await db.doc(`users/${invitedUid}`).set({ name: 'Invited owner', email: invitedEmail });
  await db.doc(`teamMembers/${invitedUid}-pending`).set({ companyId: 'existing-company', email: invitedEmail, role: 'manager', status: 'pending' });
  await assert.rejects(handlers.activate({ auth: { uid: invitedUid, token: { email: invitedEmail, email_verified: true } }, data: {} }), { code: 'permission-denied' });

  const ownerUid = `onboarding-existing-${Date.now()}-${++sequence}`, ownerEmail = `${ownerUid}@example.com`, companyId = `${ownerUid}-company`;
  await db.doc(`users/${ownerUid}`).set({ name: 'Existing owner', email: ownerEmail, companyId, rlCompanyId: companyId });
  await db.doc(`companies/${companyId}`).set({ ownerId: ownerUid, businessName: 'Preserve Existing Company', marker: 'unchanged' });
  const auth = { uid: ownerUid, token: { email: ownerEmail, email_verified: true } };
  assert.deepEqual(await handlers.getDraft({ auth, data: {} }), { activated: true });
  await assert.rejects(handlers.activate({ auth, data: {} }), { code: 'permission-denied' });
  assert.equal((await db.collection('companies').where('ownerId', '==', ownerUid).get()).size, 1);
  assert.equal((await db.doc(`companies/${companyId}`).get()).get('marker'), 'unchanged');
});
