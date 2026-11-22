const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeCompany, companyUsageHandler } = require('./companyUsage');

const NOW = Date.parse('2026-11-22T12:00:00Z');
const customer = (id, extra = {}) => ({ id, companyId: 'acme', ...extra });
test('usage counts explicit lifecycle, legacy and stored properties without double counting', () => {
  const customers = [
    customer('a', { lifecycle: 'active', isActive: true, address: '100 Oak St', city: 'Bakersfield', state: 'CA', zipCode: '93301', serviceProperties: [
      { id: 'copy', address: '100 Oak Street, Bakersfield, CA, 93301-1234, USA' },
      { id: 'second', address: '200 Elm Rd, Bakersfield, CA 93301' },
      { id: 'duplicate', address: '200 Elm Road, Bakersfield, CA 93301' },
    ] }),
    customer('b', { lifecycle: 'inactive', isActive: false, serviceProperties: [{ id: 'one', address: '300 Pine Ave, Bakersfield, CA 93301' }] }),
    customer('c', { lifecycle: 'prospect', address: '200 Elm Rd, Bakersfield, CA 93301' }),
    customer('d', {}), customer('deleted', { deletedAt: new Date(NOW) }),
  ];
  const members = [{ uid: 'tech', role: 'technician', status: 'active' }, { uid: 'tech', role: 'technician', status: 'active' }, { uid: 'other', role: 'technician', status: 'pending' }, { uid: 'manager', role: 'manager', status: 'active' }];
  const jobs = [
    { status: 'completed', customerId: 'a', completedAt: new Date(NOW - 2 * 86400000) },
    { status: 'completed', customerId: 'a', completedAt: new Date(NOW - 20 * 86400000) },
    { status: 'completed', customerId: 'b', completedAt: new Date(NOW - 60 * 86400000) },
    { status: 'completed', customerId: 'a', completedAt: new Date(NOW - 2 * 86400000), appointmentKind: 'estimate_visit' },
    { status: 'completed', customerId: 'a', completedAt: new Date(NOW - 2 * 86400000), deletedAt: new Date(NOW) },
    { status: 'completed', customerId: 'a', completedAt: new Date(NOW - 150 * 86400000) },
  ];
  const result = summarizeCompany(customers, members, jobs, NOW);
  assert.deepEqual([result.totalCustomers, result.activeCustomers, result.inactiveCustomers, result.prospectCustomers, result.unclassifiedCustomers], [4, 1, 1, 1, 1]);
  assert.deepEqual([result.distinctServiceProperties, result.providerPropertyRecords, result.multiPropertyCustomers, result.maxPropertiesPerCustomer], [3, 4, 1, 2]);
  assert.equal(result.averagePropertiesPerCustomer, 1);
  assert.deepEqual(result.propertyDistribution, { none: 1, one: 2, two: 1, threeOrMore: 0 });
  assert.equal(result.servicedCustomers90Days, 2);
  assert.equal(result.completedVisits30Days, 2);
  assert.equal(result.activeTechnicians, 1);
});

test('eight distinct properties count once each despite legacy and stored duplicates', () => {
  const serviceProperties = Array.from({ length: 8 }, (_, index) => ({
    id: `property-${index + 1}`, address: `${index + 1} Oak Street, Bakersfield, CA 93301`,
  }));
  serviceProperties.push({ id: 'same-as-legacy', address: '1 Oak St, Bakersfield, CA 93301-1234, USA' });
  serviceProperties.push({ id: 'same-as-stored', address: '2 Oak St, Bakersfield, CA 93301' });
  const result = summarizeCompany([customer('many', {
    lifecycle: 'active', address: '1 Oak St', city: 'Bakersfield', state: 'CA', zipCode: '93301', serviceProperties,
  })], [], [], NOW);
  assert.equal(result.distinctServiceProperties, 8);
  assert.equal(result.providerPropertyRecords, 8);
  assert.equal(result.multiPropertyCustomers, 1);
  assert.equal(result.averagePropertiesPerCustomer, 8);
  assert.equal(result.maxPropertiesPerCustomer, 8);
  assert.deepEqual(result.propertyDistribution, { none: 0, one: 0, two: 0, threeOrMore: 1 });
});

test('completed activity uses completion evidence time, not scheduled date', () => {
  const jobs = [
    { status: 'completed', customerId: 'a', date: '2026-11-21' },
    { status: 'completed', customerId: 'a', date: '2026-07-01', completedAt: new Date(NOW - 2 * 86400000) },
    { status: 'completed', customerId: 'a', date: '2026-11-21', completedAt: new Date(NOW - 120 * 86400000) },
  ];
  const result = summarizeCompany([customer('a', { lifecycle: 'active' })], [], jobs, NOW);
  assert.equal(result.completedVisits30Days, 1);
  assert.equal(result.servicedCustomers90Days, 1);
  assert.equal(result.monthlyVisits['2026-11'], 1);
});

test('company usage rejects technicians and managers before reading company rows', async () => {
  let businessReads = 0;
  const db = { collection: name => { if (['customers', 'jobs'].includes(name)) businessReads++; throw new Error('Authorization records unavailable'); } };
  const handler = companyUsageHandler(db, async () => { throw new Error('Platform admin required'); }, () => NOW);
  for (const role of ['manager', 'technician']) {
    // accessScope validates the actual Firestore membership, not just the token role.
    await assert.rejects(handler({ auth: { uid: 'u', token: { email_verified: true, companyId: 'acme', role, membershipId: 'm' } }, data: { action: 'company' } }));
  }
  assert.equal(businessReads, 0);
});

test('platform access is required before cross-company usage', async () => {
  let queried = false;
  const handler = companyUsageHandler({ collection() { queried = true; throw new Error('No data access'); } }, async () => { throw new Error('Platform admin required'); }, () => NOW);
  await assert.rejects(handler({ data: { action: 'platform' } }), /Platform admin required/);
  await assert.rejects(handler({ data: { action: 'detail', companyId: 'acme' } }), /Platform admin required/);
  assert.equal(queried, false);
});

test('owner sees only own company while platform administrator sees isolated company totals', async () => {
  const rows = {
    companies: [{ id: 'acme', ownerId: 'owner', name: 'Acme' }, { id: 'bls', ownerId: 'other', name: 'BLS' }],
    customers: [customer('a', { lifecycle: 'active', serviceProperties: [{ id: 'p', address: '100 Oak St' }] }), { id: 'b', companyId: 'bls', lifecycle: 'active', serviceProperties: [{ id: 'p', address: '100 Oak St' }] }],
    teamMembers: [{ id: 't', companyId: 'bls', uid: 'tech', role: 'technician', status: 'active' }, { id: 'manager', companyId: 'acme', uid: 'manager', role: 'manager', status: 'active' }, { id: 'field', companyId: 'acme', uid: 'field', role: 'technician', status: 'active' }], jobs: [], rlAccountDeletions: [],
  };
  const snapshot = row => ({ id: row?.id, exists: !!row, data: () => row, get: key => row?.[key] });
  const db = {
    doc: path => ({ get: async () => snapshot(rows[path.split('/')[0]]?.find(row => row.id === path.split('/')[1])) }),
    collection: name => {
      const clauses = [];
      const query = {
        doc(id) { return db.doc(`${name}/${id}`); },
        where(key, op, value) { assert.equal(op, '=='); clauses.push([key, value]); return query; },
        select() { return query; },
        async get() { const docs = (rows[name] || []).filter(row => clauses.every(([key, value]) => row[key] === value)).map(snapshot); return { docs }; },
      };
      return query;
    },
  };
  const handler = companyUsageHandler(db, async request => { if (request.auth?.uid !== 'platform') throw new Error('Platform admin required'); }, () => NOW);
  const acme = await handler({ auth: { uid: 'owner', token: { email_verified: true, companyId: 'acme', role: 'owner' } }, data: { action: 'company' } });
  assert.equal(acme.metrics.totalCustomers, 1);
  assert.equal(acme.metrics.activeTechnicians, 1);
  for (const [uid, role, membershipId] of [['manager', 'manager', 'manager'], ['field', 'technician', 'field']]) {
    await assert.rejects(handler({ auth: { uid, token: { email_verified: true, companyId: 'acme', role, membershipId } }, data: { action: 'company' } }), error => error.code === 'permission-denied');
  }
  await assert.rejects(handler({ auth: { uid: 'owner' }, data: { action: 'detail', companyId: 'bls' } }), /Platform admin required/);
  const platform = await handler({ auth: { uid: 'platform' }, data: { action: 'platform' } });
  assert.equal(platform.items.length, 2);
  assert.equal(platform.totals.totalCustomers, 2);
  assert.equal(platform.totals.distinctServiceProperties, 2); // Shared address, separate provider records.
  assert.equal(platform.items.find(item => item.company.id === 'bls').metrics.activeTechnicians, 1);
});
