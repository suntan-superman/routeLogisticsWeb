const { test: base, expect } = require('@playwright/test');
const { createHash, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const path = require('node:path');
const req = createRequire(path.resolve(__dirname, '../../../functions/package.json'));
const { initializeApp, getApps } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { getAuth } = req('firebase-admin/auth');
const { getStorage } = req('firebase-admin/storage');
const { companyRegistrationHandler } = require('../../../functions/companyRegistration');
const { platformCmsHandlers } = require('../../../functions/platformCms');
const hash = value => createHash('sha256').update(value).digest('hex');
const PROJECT = 'demo-routelogistics';

function localAdmin() {
  if (process.env.RL_BROWSER_TESTS !== 'true' || process.env.GCLOUD_PROJECT !== PROJECT
    || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
    || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
    || process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199') {
    throw new Error('Use npm run test:browser. Browser fixtures are forbidden outside local emulators.');
  }
  return getApps().find(app => app.name === 'browser-tests') || initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` }, 'browser-tests');
}

async function seed(info) {
  const app = localAdmin(), db = getFirestore(app), auth = getAuth(app), bucket = getStorage(app).bucket();
  const prefix = `pw-${hash(`${info.project.name}:${info.testId}:${info.retry}:${info.repeatEachIndex}`).slice(0, 15)}`;
  const id = suffix => `${prefix}-${suffix}`;
  const ids = Object.fromEntries(['companyId','otherCompanyId','customerId','duplicateCustomerId','otherCustomerId','jobId','completedJobId','otherJobId','foreignJobId','estimateId','invoiceId','photoId','documentId'].map(key => [key, id(key)]));
  const accounts = {};
  for (const role of ['owner','manager','technician','platformAdmin','foreignOwner']) {
    const account = { uid: id(role), email: `${id(role)}@example.test`, password: randomBytes(24).toString('hex'), membershipId: id(`${role}-membership`) };
    await auth.createUser({ uid: account.uid, email: account.email, password: account.password, emailVerified: true, displayName: `Synthetic ${role}` });
    const companyId = role === 'foreignOwner' ? ids.otherCompanyId : ids.companyId;
    await db.doc(`users/${account.uid}`).set({ name: `Synthetic ${role}`, email: account.email, companyId: role === 'platformAdmin' ? null : companyId, legacyBackfilledAt: new Date().toISOString(), services: ['Pest inspection'], serviceCategories: ['Pest Control'] });
    if (['manager','technician'].includes(role)) await db.doc(`teamMembers/${account.membershipId}`).set({ companyId, uid: account.uid, email: account.email, emailNormalized: account.email, name: `Synthetic ${role}`, role, status: 'active' });
    accounts[role] = account;
  }
  await db.doc(`rlPlatformAdmins/${accounts.platformAdmin.uid}`).set({ status: 'active', role: 'admin' });
  const companyName = `${prefix} Pest Control`, otherCompanyName = `${prefix} Pool Services`;
  await db.doc(`companies/${ids.companyId}`).set({ name: companyName, ownerId: accounts.owner.uid, isActive: true, email: accounts.owner.email, serviceCategories: ['Pest Control','Pool Maintenance'], services: ['Pest inspection'], phone: '+12025550101' });
  await db.doc(`companies/${ids.otherCompanyId}`).set({ name: otherCompanyName, ownerId: accounts.foreignOwner.uid, isActive: true, email: accounts.foreignOwner.email, serviceCategories: ['Pool Maintenance'] });
  const customerName = `${prefix} Customer`, customerEmail = `${prefix}-portal@example.test`;
  const insideAddress = '1600 Amphitheatre Parkway, Mountain View, CA 94043', outsideAddress = '1 Infinite Loop, Cupertino, CA 95014';
  for (const [customerId, companyId, uid] of [[ids.customerId, ids.companyId, accounts.owner.uid],[ids.duplicateCustomerId, ids.companyId, accounts.owner.uid],[ids.otherCustomerId, ids.otherCompanyId, accounts.foreignOwner.uid]]) {
    await db.doc(`customers/${customerId}`).set({ companyId, userId: uid, name: customerId === ids.duplicateCustomerId ? `${customerName} duplicate` : customerName, email: customerEmail, emailNormalized: customerEmail, phone: '+12025550102', address: insideAddress, city: 'Mountain View', state: 'CA', zipCode: '94043', isActive: true, createdAt: new Date().toISOString(), totalSpent: 0 });
    await db.doc(`rlPortalLinks/${hash(`${customerId}:${customerEmail}`)}`).set({ customerId, scopeId: `company:${companyId}`, email: customerEmail, portalUid: `rl_customer_${hash(customerEmail)}`, status: 'active' });
  }
  const now = new Date(), jobDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const serviceType = `${prefix} Scheduled inspection`, completedServiceType = `${prefix} Completed inspection`, otherServiceType = `${prefix} Pool visit`;
  const jobInstructions = `${prefix} Site access: use the south entrance.\nIf the side gate is locked, call dispatch before starting work.`;
  const workNotes = `${prefix} Prior technician observation: exterior equipment checked.`;
  const jobPrivateNotes = `${prefix} INTERNAL_PRIVATE_NOTE_NOT_FOR_FIELD_STAFF`;
  const scope = { companyId: ids.companyId, userId: accounts.owner.uid, customerId: ids.customerId, customerName, customerEmail, address: insideAddress, date: jobDate, time: '10:00', assignedTo: accounts.technician.membershipId, status: 'scheduled', serviceCategory: 'Pest Control', serviceProperty: { address: insideAddress }, createdAt: now.toISOString(), updatedAt: now.toISOString(), synthetic: true };
  await db.doc(`jobs/${ids.jobId}`).set({ ...scope, serviceType, notes: jobInstructions, workNotes, privateNotes: jobPrivateNotes });
  await db.doc(`jobs/${ids.completedJobId}`).set({ ...scope, serviceType: completedServiceType, status: 'completed', completedAt: now.toISOString() });
  await db.doc(`jobs/${ids.otherJobId}`).set({ ...scope, companyId: ids.otherCompanyId, userId: accounts.foreignOwner.uid, customerId: ids.otherCustomerId, assignedTo: null, serviceType: otherServiceType });
  await db.doc(`jobs/${ids.foreignJobId}`).set({ ...scope, companyId: ids.otherCompanyId, userId: accounts.foreignOwner.uid, customerId: ids.otherCustomerId, assignedTo: null, serviceType: `${prefix} Private other provider job` });
  const property = { address: insideAddress, formattedAddress: insideAddress, latitude: 37.422, longitude: -122.084, postalCode: '94043', countryCode: 'US', locationType: 'PREMISE', streetAddressVerified: true, source: 'google-address-validation', validatedAt: now.toISOString() };
  for (const [address, zip, latitude, longitude] of [[insideAddress,'94043',37.422,-122.084],[outsideAddress,'95014',37.331,-122.031]]) {
    const addressKey = address.toLowerCase();
    await db.doc(`rlServiceAreaGeocodes/${hash(`${ids.companyId}:${addressKey}`)}`).set({ companyId: ids.companyId, addressKey, property: { ...property, address, formattedAddress: address, postalCode: zip, latitude, longitude }, validatedAt: now, expiresAt: new Date(Date.now()+86400000) });
  }
  await db.doc(`rlServiceAreas/${ids.companyId}`).set({ configured: true, revision: 1, operatingAddress: insideAddress, operatingLocation: property, method: 'zip', zipCodes: ['94043'], radiusMiles: 25, categoryOverrides: [], acceptingNewCustomers: true, publishCoverage: false, allowOutOfAreaRequests: false });
  const estimateTitle = `${prefix} Inspection estimate`, token = randomBytes(32).toString('hex');
  const estimate = { rlManaged: true, companyId: ids.companyId, userId: accounts.owner.uid, customerId: ids.customerId, title: estimateTitle, estimateNumber: `E-${prefix}`, version: 1, status: 'sent', recipient: { name: customerName, email: customerEmail, address: insideAddress, phone: '+12025550102' }, serviceType: 'Pest inspection', serviceCategory: 'Pest Control', serviceProperty: { address: insideAddress }, scopeOfWork: 'Synthetic inspection for browser acceptance only.', notes: '', lineItems: [{ id: 'inspection', kind: 'labor', description: 'Synthetic inspection', quantity: 1, unitPrice: 100, unitPriceCents: 10000, amount: 100, amountCents: 10000 }], photoIds: [], subtotal: 100, subtotalCents: 10000, taxRate: 0, tax: 0, taxCents: 0, total: 100, totalCents: 10000, validDays: 30, validUntil: new Date(Date.now()+30*86400000).toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() };
  await db.doc(`estimates/${ids.estimateId}`).set(estimate);
  await db.doc(`rlEstimateVersions/${hash(`${ids.estimateId}:1`)}`).set({ ...estimate, estimateId: ids.estimateId });
  await db.doc(`rlEstimateApprovalSecrets/${ids.estimateId}`).set({ companyId: ids.companyId, userId: accounts.owner.uid, status: 'open', version: 1, tokenHash: hash(token), expiresAt: new Date(Date.now()+86400000) });
  const invoiceNumber = `INV-${prefix}`;
  await db.doc(`invoices/${ids.invoiceId}`).set({ ...scope, invoiceNumber, status: 'sent', total: 100, subtotal: 100, tax: 0, issueDate: jobDate, dueDate: jobDate, customer: { name: customerName, email: customerEmail, address: insideAddress }, createdAt: now.toISOString(), lineItems: [{ description: 'Synthetic inspection', quantity: 1, unitPrice: 100, amount: 100 }] });
  const photoCaption = 'Synthetic shared service photo', documentName = 'Synthetic service report.pdf';
  const photoPath = `rlJobPhotos/${ids.companyId}/${ids.completedJobId}/photo.png`, documentPath = `rlPortalDocuments/${ids.companyId}/${ids.completedJobId}/report.pdf`;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
  await bucket.file(photoPath).save(png, { resumable: false, contentType: 'image/png' });
  await bucket.file(documentPath).save(Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'), { resumable: false, contentType: 'application/pdf' });
  await db.doc(`photos/${ids.photoId}`).set({ ...scope, jobId: ids.completedJobId, customerVisible: true, caption: photoCaption, storagePath: photoPath, createdAt: now });
  await db.doc(`rlPortalDocuments/${ids.documentId}`).set({ ...scope, jobId: ids.completedJobId, customerVisible: true, status: 'published', name: documentName, storagePath: documentPath, createdAt: now });
  // Rate limits remain enforced by the server. Reset only local, shared-IP counters between serial tests.
  const limits = await db.collection('rlRateLimits').get();
  for (const row of limits.docs) await row.ref.delete();
  const readDoc = async documentPath => (await db.doc(documentPath).get()).data() || null;
  return { ids, accounts, prefix, companyName, otherCompanyName, customerName, customerEmail, email: customerEmail, jobDate, serviceType, jobTitle: serviceType, jobInstructions, workNotes, jobPrivateNotes, completedServiceType, otherServiceType, estimateTitle, invoiceNumber, insideAddress, outsideAddress, photoCaption, documentName,
    approvalUrl: `/estimate-approval#id=${ids.estimateId}&token=${token}`,
    functionUrl: name => `http://127.0.0.1:5001/${PROJECT}/us-central1/${name}`,
    readDoc, read: (collection, key) => readDoc(`${collection}/${key}`),
    list: async collection => (await db.collection(collection).get()).docs.map(row => ({ id: row.id, ...row.data() })),
    seedPropertyProfile: async () => {
      await db.doc(`customers/${ids.customerId}`).update({ serviceProperties: [
        { id: 'home', label: 'Home', address: insideAddress, accessInstructions: 'Synthetic front gate', alerts: [{ id: 'entry-alert', version: 1, active: true, severity: 'important', title: 'Gate', description: 'Call before entering' }] },
        { id: 'other', label: 'Office', address: outsideAddress, accessInstructions: 'Synthetic office entry', alerts: [] },
      ] });
      await db.doc(`jobs/${ids.jobId}`).update({ servicePropertyId: 'home' });
    },
    verifyAccount: async email => {
      const account = await auth.getUserByEmail(email);
      await auth.updateUser(account.uid, { emailVerified: true });
      return account.uid;
    },
    authorizeCompanyRegistration: async email => {
      const handler = companyRegistrationHandler(db, platformCmsHandlers(db).requireAdmin, { appUrl: () => 'http://127.0.0.1:4173' });
      const request = { auth: { uid: accounts.platformAdmin.uid, token: { email: accounts.platformAdmin.email, email_verified: true } } };
      const current = await handler({ ...request, data: { action: 'admin' } });
      await handler({ ...request, data: { action: 'policy', mode: 'approval_required', confirm: 'approval_required', expectedRevision: current.revision } });
      const issued = await handler({ ...request, data: { action: 'issue', email } });
      return issued.link;
    },
    setSchedulingIdentity: async (accountKey, { name } = {}) => {
      localAdmin();
      if (!['manager', 'technician'].includes(accountKey) || !Object.hasOwn(accounts, accountKey)
        || typeof name !== 'string' || !name.trim() || name.length > 100) {
        throw new Error('Choose an existing synthetic staff account and a valid display name.');
      }
      const account = accounts[accountKey], memberRef = db.doc(`teamMembers/${account.membershipId}`), userRef = db.doc(`users/${account.uid}`);
      const [member, profile] = await Promise.all([memberRef.get(), userRef.get()]);
      if (!member.exists || member.get('uid') !== account.uid || member.get('companyId') !== ids.companyId
        || !profile.exists || profile.get('companyId') !== ids.companyId) {
        throw new Error('Scheduling identity fixtures must belong to this synthetic company.');
      }
      const batch = db.batch(), value = name.trim();
      batch.update(userRef, { name: value, displayName: value, fullName: value, firstName: null, lastName: null });
      batch.update(memberRef, { name: null, displayName: null, fullName: null, firstName: null, lastName: null });
      await batch.commit();
      return { name: value, email: account.email, uid: account.uid, membershipId: account.membershipId };
    },
    getPortalCode: async () => {
      let code;
      await expect.poll(async () => {
        const rows = await db.collection('rlMail').where('to','==',customerEmail).get();
        const text = rows.docs.sort((a,b)=>(b.get('createdAt')?.toMillis?.()||0)-(a.get('createdAt')?.toMillis?.()||0))[0]?.get('text') || '';
        code = text.match(/code is (\d{6})/)?.[1]; return !!code;
      }).toBe(true);
      return code;
    },
    getStaffCode: async account => {
      let code;
      await expect.poll(async () => {
        const rows = await db.collection('rlMail').where('to', '==', account.email.toLowerCase()).get();
        const latest = rows.docs.filter(row => row.get('staffLoginChallengeId')).sort((a, b) => b.get('createdAt').toMillis() - a.get('createdAt').toMillis())[0];
        code = latest?.get('text')?.match(/code is (\d{6})/)?.[1];
        return !!code;
      }).toBe(true);
      return code;
    },
    readReview: jobId => readDoc(`rlReviews/${hash(`review:${jobId}`)}`),
    countReviews: async jobId => (await db.collection('rlReviews').where('jobId','==',jobId).get()).size,
    revokeAssociation: async companyId => {
      const rows = await db.collection('customers').where('companyId','==',companyId).where('email','==',customerEmail).get();
      await Promise.all(rows.docs.map(row=>row.ref.update({ isActive: false })));
    },
  };
}

const test = base.extend({
  scenario: async ({}, use, info) => { await use(await seed(info)); },
  context: async ({ context }, use) => {
    localAdmin();
    const blocked = [];
    // Assert the test server's native outbound policy before opening any page.
    // Avoid browser route interception: it can rewind WebKit WebChannel bodies.
    const response = await context.request.get('http://127.0.0.1:4173');
    expect(response.headers()['content-security-policy']).toContain("connect-src 'self' http://127.0.0.1:*");
    await context.exposeBinding('__rlRecordBlockedRequest', (_source, entry) => { blocked.push(entry); });
    await context.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', event => {
        let url;
        try { url = new URL(event.blockedURI); } catch { return; }
        const directive = event.effectiveDirective;
        // Optional third-party assets are blocked too. Only their expected
        // script/style/image violations are ignored; connect-src always fails.
        const optionalAsset = ['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname) && /^(style|font)-src/.test(directive)
          || ['js.stripe.com','apis.google.com'].includes(url.hostname) && directive.startsWith('script-src')
          || url.hostname === 'www.google.com' && directive === 'img-src';
        if (!optionalAsset) window.__rlRecordBlockedRequest({ origin: url.origin, directive }).catch(() => {});
      });
    });
    await use(context);
    expect(blocked, 'Browser attempted non-local network access; no external request was allowed').toEqual([]);
  },
});
async function signIn(page, account) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // The first sign-in cold-starts Auth/workspace callable emulator workers.
  // Wait for the real redirect without submitting the credentials a second time.
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 30_000 });
}
async function portalSignIn(page, scenario) {
  await page.goto('/portal');
  await page.getByLabel('Email address', { exact: true }).fill(scenario.customerEmail);
  await page.getByRole('button', { name: /Email a sign-in code|Send code/i }).click();
  const code = await scenario.getPortalCode();
  await page.getByLabel(/Six-digit/).fill(code);
  await page.getByRole('button', { name: /Verify|Sign in/i }).click();
  await expect(page.getByRole('combobox', { name: 'Service provider' })).toBeVisible();
}
module.exports = { test, expect, signIn, portalSignIn };
