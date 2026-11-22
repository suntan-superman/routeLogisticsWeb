const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { companyUsageHandler } = require('../functions/companyUsage');
const { platformCmsHandlers } = require('../functions/platformCms');

let app, db, usage;
const now = Date.parse('2026-11-22T12:00:00Z');
const request = (uid, role, companyId, action, extra = {}) => ({ auth: { uid, token: { companyId, role, membershipId: uid, email_verified: true } }, data: { action, ...extra } });
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Local Firestore emulator required. Production access is forbidden.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'company-usage-tests'); db = getFirestore(app);
  const batch = db.batch();
  batch.set(db.doc('companies/usage-acme'), { ownerId: 'usage-owner', name: 'Acme usage test' });
  batch.set(db.doc('companies/usage-bls'), { ownerId: 'usage-other', name: 'BLS usage test' });
  batch.set(db.doc('rlPlatformAdmins/usage-platform'), { status: 'active', role: 'admin' });
  for (const [uid, role] of [['usage-admin', 'admin'], ['usage-manager', 'manager'], ['usage-tech', 'technician']]) batch.set(db.doc(`teamMembers/${uid}`), { companyId: 'usage-acme', uid, role, status: 'active' });
  batch.set(db.doc('customers/usage-acme-customer'), { companyId: 'usage-acme', lifecycle: 'active', address: '100 Oak St', serviceProperties: [{ id: 'same', address: '100 Oak Street' }, { id: 'other', address: '200 Elm Rd' }] });
  batch.set(db.doc('customers/usage-bls-customer'), { companyId: 'usage-bls', lifecycle: 'inactive', address: '100 Oak St' });
  batch.set(db.doc('jobs/usage-completed-job'), { companyId: 'usage-acme', customerId: 'usage-acme-customer', status: 'completed', completedAt: new Date(now - 86400000), appointmentKind: 'service' });
  await batch.commit();
  usage = companyUsageHandler(db, platformCmsHandlers(db).requireAdmin, () => now);
});
after(() => deleteApp(app));

test('tenant-scoped company usage and platform-only aggregate from emulator records', async () => {
  const acme = await usage(request('usage-owner', 'owner', 'usage-acme', 'company'));
  assert.equal(acme.metrics.totalCustomers, 1);
  assert.equal(acme.metrics.distinctServiceProperties, 2);
  assert.equal(acme.metrics.completedVisits30Days, 1);
  assert.equal(acme.metrics.activeTechnicians, 1);
  const admin = await usage(request('usage-admin', 'admin', 'usage-acme', 'company'));
  assert.equal(admin.companyId, 'usage-acme');
  assert.equal(admin.metrics.totalCustomers, 1);
  await assert.rejects(usage(request('usage-admin', 'admin', 'usage-acme', 'detail', { companyId: 'usage-bls' })), { code: 'permission-denied' });
  const bls = await usage(request('usage-other', 'owner', 'usage-bls', 'company'));
  assert.equal(bls.metrics.totalCustomers, 1);
  assert.equal(bls.metrics.inactiveCustomers, 1);
  assert.equal(bls.metrics.completedVisits30Days, 0);
  for (const [uid, role] of [['usage-manager', 'manager'], ['usage-tech', 'technician']]) {
    await assert.rejects(usage(request(uid, role, 'usage-acme', 'company')), { code: 'permission-denied' });
    await assert.rejects(usage(request(uid, role, 'usage-acme', 'detail', { companyId: 'usage-bls' })), { code: 'permission-denied' });
  }
  await assert.rejects(usage(request('usage-owner', 'owner', 'usage-acme', 'platform')), { code: 'permission-denied' });
  const detail = await usage(request('usage-platform', 'owner', 'usage-acme', 'detail', { companyId: 'usage-bls' }));
  assert.equal(detail.metrics.inactiveCustomers, 1);
  const platform = await usage(request('usage-platform', 'owner', 'usage-acme', 'platform'));
  assert.equal(platform.totals.distinctServiceProperties >= 3, true);
  assert.equal(JSON.stringify(platform).includes('100 Oak'), false);
});
