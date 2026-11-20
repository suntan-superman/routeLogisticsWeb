const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { companyOnboardingHandlers } = require('../functions/companyOnboarding');
const { invitationHandlers } = require('../functions/invitations');
const { customerHandlers } = require('../functions/customers');
let app, db, sequence = 0;
before(() => { if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required; production data must never be used.'); app = initializeApp({ projectId: 'demo-routelogistics' }, 'onboarding-tests'); db = getFirestore(app); });
after(() => deleteApp(app));

test('verified owner drafts resume, isolate by uid, and activation retries never duplicate the company', async () => {
  const uid = `onboarding-${Date.now()}-${++sequence}`, otherUid = `${uid}-other`, email = `${uid}@example.com`;
  await db.doc(`users/${uid}`).set({ name: 'Owner', email });
  const handlers = companyOnboardingHandlers(db, { appUrl: () => 'https://route-logistics.example', emailEnabled: () => true }), caller = { uid, token: { email, email_verified: true } }, other = { uid: otherUid, token: { email: `${otherUid}@example.com`, email_verified: true } };
  const request = (data, auth = caller) => ({ auth, data });
  const businessHours = Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { closed: ['saturday','sunday'].includes(day), open: '09:00', close: '17:00' }]));
  const draft = { currentStep: 7, profile: { name: 'Owner', businessName: 'New Field Co', phone: '555-0100' }, services: ['Pest control'], timeZone: 'America/Los_Angeles', businessHours, serviceArea: { method: 'zip', zipCodes: ['93301'] }, invites: [{ email: `${uid}-manager@example.com`, role: 'manager' }, { email: `${uid}-tech@example.com`, role: 'technician' }] };
  assert.equal((await handlers.getDraft(request({}))).draft, null);
  const saved = await handlers.saveDraft(request({ draft, expectedRevision: 0 })); assert.equal(saved.revision, 1);
  assert.equal((await handlers.getDraft(request({}))).draft.profile.businessName, 'New Field Co');
  assert.equal((await handlers.getDraft(request({}, other))).draft, null);
  await assert.rejects(handlers.saveDraft(request({ draft, expectedRevision: 0 })), { code: 'aborted' });
  const activated = await handlers.activate(request({})); assert.ok(activated.companyId); assert.equal(activated.invitationCount, 2); assert.equal(activated.invitationEmailStatus, 'queued');
  const activatedCompany = await db.doc(`companies/${activated.companyId}`).get();
  assert.equal(activatedCompany.get('ownerId'), uid);
  assert.equal(activatedCompany.get('ownerName'), 'Owner');
  assert.equal(activatedCompany.get('name'), 'New Field Co');
  assert.equal(activatedCompany.get('businessName'), 'New Field Co');
  assert.equal(activatedCompany.get('isActive'), true);
  assert.equal(activatedCompany.get('timeZone'), 'America/Los_Angeles');
  const invited = await db.collection('teamMembers').where('companyId', '==', activated.companyId).get();
  assert.equal(invited.size, 2);
  assert.deepEqual(invited.docs.map(row => [row.get('email'), row.get('role'), row.get('status')]).sort(), [[`${uid}-manager@example.com`, 'manager', 'pending'], [`${uid}-tech@example.com`, 'technician', 'pending']].sort());
  for (const row of invited.docs) {
    assert.equal((await db.doc(`rlInviteSecrets/${row.id}`).get()).exists, true);
    assert.equal((await db.doc(`rlMembershipIdentities/${row.id}`).get()).get('memberId'), row.id);
  }
  const mailBefore = await db.collection('rlMail').where('invitationId', 'in', invited.docs.map(row => row.id)).get();
  assert.equal(mailBefore.size, 2);
  const repeated = await handlers.activate(request({})); assert.equal(repeated.companyId, activated.companyId); assert.equal(repeated.alreadyActivated, true);
  assert.equal((await db.collection('companies').where('ownerId', '==', uid).get()).size, 1);
  assert.equal((await db.collection('teamMembers').where('companyId', '==', activated.companyId).get()).size, 2);
  assert.equal((await db.collection('rlMail').where('invitationId', 'in', invited.docs.map(row => row.id)).get()).size, 2);
  const manager = invited.docs.find(row => row.get('role') === 'manager');
  const managerMail = mailBefore.docs.find(row => row.get('invitationId') === manager.id);
  const code = /#code=([a-f0-9]{64})/.exec(managerMail.get('text'))?.[1];
  assert.ok(code);
  const newUid = `${uid}-new-manager`;
  await db.doc(`users/${newUid}`).set({ email: manager.get('email') });
  const invitations = invitationHandlers(db, async () => ({ active: true }), () => 'https://route-logistics.example');
  await invitations.acceptTeamInvite({ auth: { uid: newUid, token: { email: manager.get('email'), email_verified: true } }, data: { inviteId: manager.id, code } });
  assert.equal((await manager.ref.get()).get('status'), 'active');
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

test('activation does not create a second membership for the company owner', async () => {
  const uid = `onboarding-self-${Date.now()}-${++sequence}`, email = `${uid}@example.com`;
  await db.doc(`users/${uid}`).set({ name: 'Owner', email });
  const handlers = companyOnboardingHandlers(db), auth = { uid, token: { email, email_verified: true } };
  await handlers.saveDraft({ auth, data: { expectedRevision: 0, draft: { profile: { name: 'Owner', businessName: 'No Self Invite Co' }, services: ['Service'], invites: [{ email, role: 'manager' }] } } });
  await assert.rejects(handlers.activate({ auth, data: {} }), { code: 'invalid-argument' });
  assert.equal((await db.collection('companies').where('ownerId', '==', uid).get()).size, 0);
  assert.equal((await db.collection('teamMembers').where('email', '==', email).get()).size, 0);
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

test('owner and administrator review existing setup without replacing tenant records', async () => {
  const suffix = `${Date.now()}-${++sequence}`, companyId = `review-company-${suffix}`, ownerUid = `review-owner-${suffix}`, adminUid = `review-admin-${suffix}`, managerUid = `review-manager-${suffix}`;
  await Promise.all([
    db.doc(`companies/${companyId}`).set({ ownerId: ownerUid, name: 'Legacy display', businessName: 'Review Co', phone: '555-0100', services: ['Pest control'], serviceCategories: ['Pest control'], marker: 'preserve', timeZone: 'America/Los_Angeles' }),
    db.doc(`users/${ownerUid}`).set({ name: 'Owner Person', email: `${ownerUid}@example.com`, companyId }),
    db.doc(`users/${adminUid}`).set({ name: 'Admin Person', email: `${adminUid}@example.com`, companyId }),
    db.doc(`teamMembers/admin-${suffix}`).set({ uid: adminUid, companyId, email: `${adminUid}@example.com`, role: 'admin', status: 'active' }),
    db.doc(`teamMembers/manager-${suffix}`).set({ uid: managerUid, companyId, email: `${managerUid}@example.com`, role: 'manager', status: 'active' }),
    db.doc(`customers/preserved-${suffix}`).set({ companyId, name: 'Preserved customer' }),
  ]);
  const handlers = companyOnboardingHandlers(db);
  const owner = { uid: ownerUid, token: { companyId, role: 'owner', email: `${ownerUid}@example.com`, email_verified: true } };
  const admin = { uid: adminUid, token: { companyId, membershipId: `admin-${suffix}`, role: 'admin', email: `${adminUid}@example.com`, email_verified: true } };
  const manager = { uid: managerUid, token: { companyId, membershipId: `manager-${suffix}`, role: 'manager', email: `${managerUid}@example.com`, email_verified: true } };
  const loaded = await handlers.review({ auth: owner, data: { action: 'get' } });
  assert.equal(loaded.companyId, companyId); assert.equal(loaded.profile.businessName, 'Review Co'); assert.equal(loaded.team.length, 3);
  const saved = await handlers.review({ auth: admin, data: { action: 'save', section: 'profile', expectedRevision: 0, value: { businessName: 'Review Co Updated', phone: '555-0101', address: '', city: '', state: '', zipCode: '', description: '' } } });
  assert.deepEqual(saved, { revision: 1, unchanged: false });
  const company = await db.doc(`companies/${companyId}`).get();
  assert.equal(company.get('businessName'), 'Review Co Updated'); assert.equal(company.get('name'), 'Review Co Updated'); assert.equal(company.get('marker'), 'preserve'); assert.equal(company.get('ownerId'), ownerUid);
  assert.equal((await db.doc(`customers/preserved-${suffix}`).get()).get('name'), 'Preserved customer');
  const unchanged = await handlers.review({ auth: owner, data: { action: 'save', section: 'profile', expectedRevision: 1, value: { businessName: 'Review Co Updated', phone: '555-0101', address: '', city: '', state: '', zipCode: '', description: '' } } });
  assert.deepEqual(unchanged, { revision: 1, unchanged: true });
  await assert.rejects(handlers.review({ auth: manager, data: { action: 'get' } }), { code: 'permission-denied' });
  await assert.rejects(handlers.review({ auth: { ...admin, token: { ...admin.token, companyId: 'another-company' } }, data: { action: 'get' } }), { code: 'permission-denied' });
  await assert.rejects(handlers.review({ auth: owner, data: { action: 'save', section: 'services', expectedRevision: 0, value: ['Termite'] } }), { code: 'aborted' });
});
