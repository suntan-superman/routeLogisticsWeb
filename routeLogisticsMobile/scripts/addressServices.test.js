const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), babel = require('@babel/core');
const helpers = require('../services/addressValidation');
let calls, directWrites, claims, failure, offline, queued, response, customerRows, workspaceReads, cacheKeys, jobRows;
const auth = { currentUser: { uid: 'operator' } };
const file = path.resolve(__dirname, '../services/firebase.js'), result = { exports: {} };
const fire = Object.fromEntries(['doc','collection','query','where','orderBy'].map(name => [name, (...args) => ({ name, args })]));
fire.updateDoc = async (...args) => directWrites.push(args);
fire.addDoc = async (...args) => { directWrites.push(args); return { id: 'direct' }; };
fire.getDocs = async () => ({ docs: customerRows.map(row => ({ id: row.id, data: () => row })) });
const transformed = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
new Function('require','module','exports',transformed)(name => {
  if (name.startsWith('@babel/runtime/')) return require(name);
  if (name === 'firebase/auth') return {};
  if (name === 'firebase/firestore') return fire;
  if (name === '../constants/firebase') return { auth, db: {} };
  if (name === './addressValidation') return helpers;
  if (name === './mobileMode') return require('../services/mobileMode');
  if (name === './tenancy') return { requireWorkspace() {}, getClaims: () => claims, scopeWhere: () => ({}), tenantFields: () => claims?.companyId ? { companyId: claims.companyId, userId: 'operator' } : { userId: 'operator' }, localDate: () => '2026-11-15' };
  if (name === './offline') return { cachedRead: (key, loader) => { cacheKeys.push(key); return loader(); }, overlayJobs: async rows => rows, readCache: async () => null, writeCache: async () => {}, isOffline: async () => offline, saveJobOffline: async (id, patch) => { queued.push({ id, patch }); return { success: true, queued: true }; } };
  if (name === './workspaceApi') return { callWorkspace: async (call, payload) => { calls.push({ call, payload }); if (failure) throw failure; return response; }, readWorkspace: async (resource, payload) => { workspaceReads.push({ resource, payload }); return resource === 'jobs' ? { jobs: jobRows, hasMore: false } : { customers: customerRows, hasMore: false }; } };
  throw Error('Unexpected mobile service dependency ' + name);
}, result, result.exports);
const { CustomerService, JobService } = result.exports;
beforeEach(() => { calls = []; directWrites = []; queued = []; workspaceReads = []; cacheKeys = []; jobRows = []; claims = { companyId: 'acme', role: 'owner' }; failure = null; offline = false; customerRows = []; response = { id: 'saved', customer: { name: 'Synthetic' }, updatedAt: '2026-11-15T10:00:00.000Z' }; auth.currentUser = { uid: 'operator' }; });

test('personal field reads request the server self scope and never share the broad company list cache', async () => {
  claims = { companyId: 'acme', role: 'manager', membershipId: 'manager-member' };
  jobRows = [
    { id: 'self', companyId: 'acme', assignedTo: 'manager-member', assignedToUid: 'operator' },
    { id: 'other', companyId: 'acme', assignedTo: 'tech-member', assignedToUid: 'other' },
    { id: 'reused', companyId: 'acme', assignedTo: 'manager-member', assignedToUid: 'other' },
    { id: 'foreign', companyId: 'other', assignedTo: 'manager-member', assignedToUid: 'operator' },
  ];
  const personal = await JobService.getJobsByDateRange('2026-11-15', '2026-11-15', { personal: true });
  assert.equal(personal.success, true); assert.deepEqual(personal.jobs.map(job => job.id), ['self']);
  assert.equal(workspaceReads[0].payload.assignedTo, 'self');
  assert.equal(cacheKeys[0], 'jobs:2026-11-15:2026-11-15:self');
  const company = await JobService.getJobsByDateRange('2026-11-15', '2026-11-15');
  assert.equal(company.success, true); assert.equal(company.jobs.length, 4);
  assert.equal(workspaceReads[1].payload.assignedTo, undefined);
  assert.equal(cacheKeys[1], 'jobs:2026-11-15:2026-11-15');
});

test('customer create and address updates use authorized callables in both company and solo workspaces', async () => {
  for (const company of [true, false]) {
    claims = company ? { companyId: 'acme', role: 'owner' } : null;
    assert.equal((await CustomerService.addCustomer({ name: 'Synthetic', email: ' TEST@EXAMPLE.COM ', address: '1 Service St' })).success, true);
    assert.equal((await CustomerService.updateCustomer('customer', { address: '2 Service St' }, '2026-11-14T10:00:00.000Z')).success, true);
  }
  assert.equal(calls.length, 4); assert.equal(directWrites.length, 0);
  assert.ok(calls.every(call => call.call === 'rlManageCustomer'));
  assert.equal(calls[0].payload.customer.email, 'test@example.com');
  assert.equal(calls[1].payload.expectedVersion, '2026-11-14T10:00:00.000Z');
  assert.equal(calls[1].payload.customer.expectedVersion, undefined);
});

test('solo job creation and physical address changes cannot bypass server validation', async () => {
  claims = null;
  assert.equal((await JobService.addJob({ customerId: 'customer', address: '1 Service St', time: '09:15' })).success, true);
  assert.equal((await JobService.updateJob('job', { address: '2 Service St', serviceProperty: { address: '2 Service St' } }, 'job-original')).success, true);
  assert.equal(calls.length, 2); assert.ok(calls.every(call => call.call === 'rlManageJob')); assert.equal(directWrites.length, 0);
  assert.equal(calls[1].payload.expectedVersion, 'job-original');
  await JobService.updateJob('job', { date: '2026-11-16' }); assert.equal(directWrites.length, 0);
  assert.equal(calls[2].call, 'rlManageJob'); assert.equal(calls[2].payload.job.date, '2026-11-16');
});

test('permanent job-address options are explicit top-level fields and authoritative update status is preserved', async () => {
  response = { id: 'saved', customerAddressUpdated: true };
  const options = { saveCustomerAddress: true, expectedCustomerVersion: 'customer-original' };
  const first = await JobService.addJob({ address: '2 Service St', customerId: 'customer', time: '09:15' }, options);
  const second = await JobService.updateJob('job', { serviceProperty: { address: '2 Service St' } }, 'job-original', options);
  assert.equal(first.customerAddressUpdated, true); assert.equal(second.customerAddressUpdated, true);
  for (const { payload } of calls) { assert.equal(payload.saveCustomerAddress, true); assert.equal(payload.expectedCustomerVersion, 'customer-original'); assert.equal(payload.job.saveCustomerAddress, undefined); assert.equal(payload.job.expectedCustomerVersion, undefined); }
  await JobService.addJob({ address: '3 Service St', time: '09:15' }); assert.equal(Object.hasOwn(calls[2].payload, 'saveCustomerAddress'), false);
});

test('Google proposal, invalid-address and unavailable errors remain actionable without automatic retries or writes', async () => {
  for (const status of ['confirmation-required', 'invalid', 'unavailable']) {
    failure = Object.assign(Error('Address check failed'), { code: 'functions/failed-precondition', details: { addressValidation: { status, message: 'Please review this property.', ...(status === 'confirmation-required' ? { suggestedAddress: '2 Service St, Bakersfield, CA 93312' } : {}) } } });
    const saved = await CustomerService.updateCustomer('customer', { address: '2 Servce' }, null);
    assert.equal(saved.success, false); assert.equal(saved.error.addressValidation.status, status); assert.equal(saved.error.message, 'Please review this property.');
    const job = await JobService.addJob({ address: '2 Servce', time: '09:15' }); assert.equal(job.error.addressValidation.status, status);
  }
  assert.equal(calls.length, 6); assert.equal(directWrites.length, 0);
});

test('field-work offline operations retain their existing authorization queue; address edits cannot enter it', async () => {
  offline = true;
  assert.equal((await JobService.updateJob('job', { notes: 'Gate locked', status: 'completed' })).queued, true);
  assert.equal(queued.length, 1); assert.equal(calls.length, 0);
  const rejected = await JobService.updateJob('job', { address: '2 Service St' }, 'original');
  assert.equal(rejected.success, false); assert.match(rejected.error.message, /internet connection/); assert.equal(queued.length, 1); assert.equal(directWrites.length, 0);
});

test('customer reads preserve nested locality and versions used by concurrent-address guards', async () => {
  claims = null;
  customerRows = [{ id: 'nested', name: 'Synthetic', address: { line1: '1 Service St', city: 'Bakersfield', state: 'CA', postalCode: '93312' }, updatedAt: { toDate: () => new Date('2026-11-14T10:00:00.000Z') } }];
  const saved = (await CustomerService.getCustomers()).customers[0];
  assert.equal(helpers.formatSavedAddress(saved), '1 Service St, Bakersfield, CA 93312');
  assert.equal(helpers.recordVersion(saved.updatedAt), '2026-11-14T10:00:00.000Z');
  assert.equal(helpers.recordVersion({ seconds: 0, nanoseconds: 1000000 }), '1970-01-01T00:00:00.001Z');
  assert.equal(helpers.formatSavedAddress({ address: '1 Service St, Bakersfield, CA 93312', city: 'Bakersfield', state: 'CA', zipCode: '93312' }), '1 Service St, Bakersfield, CA 93312');
});
