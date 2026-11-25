const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, checkAssignment, requirementRef, staffRef } = require('./qualifications');
const { changedSchedule } = require('./scheduling');

const catalog = [
  { id: 'skill', name: 'Inspection skill', type: 'internal_skill', active: true },
  { id: 'credential', name: 'External credential', type: 'external_credential', active: true, tracksExpiration: true },
];
const records = [
  { qualificationId: 'skill', active: true, verificationStatus: 'management_recorded', effectiveDate: '2026-01-01' },
  { qualificationId: 'credential', active: true, verificationStatus: 'management_verified', effectiveDate: '2026-01-01', expiresAt: '2026-12-31' },
];

test('unrestricted services and valid one or multiple requirements', () => {
  assert.deepEqual(evaluate([], [], [], '2026-11-24'), { eligible: true, missing: [] });
  assert.equal(evaluate(['skill'], catalog, records, '2026-11-24').eligible, true);
  assert.equal(evaluate(['skill', 'credential'], catalog, records, '2026-11-24').eligible, true);
});
test('qualification validity is evaluated for the appointment date', () => {
  assert.equal(evaluate(['credential'], catalog, records, '2027-01-01').eligible, false);
  assert.equal(evaluate(['skill'], catalog, [{ ...records[0], effectiveDate: '2026-11-25' }], '2026-11-24').eligible, false);
  assert.equal(evaluate(['credential'], catalog, [{ ...records[1], active: false }], '2026-11-24').eligible, false);
  assert.equal(evaluate(['credential'], catalog, [{ ...records[1], verificationStatus: 'management_recorded' }], '2026-11-24').eligible, false);
  assert.equal(evaluate(['credential'], catalog, [{ ...records[1], expiresAt: null }], '2026-11-24').eligible, false);
});
test('service or appointment changes recheck an existing assignment without reopening completed history', () => {
  const before = { assignedTo: 'member', status: 'scheduled', date: '2026-11-24', serviceType: 'Inspection', serviceCategory: 'General' };
  assert.equal(changedSchedule(before, { ...before, serviceType: 'Treatment' }), true);
  assert.equal(changedSchedule(before, { ...before, date: '2027-01-01' }), true);
  assert.equal(changedSchedule(before, { ...before, assignedTo: 'another' }), true);
  assert.equal(changedSchedule(before, { ...before, notes: 'edited' }), false);
});
test('assignment gate uses tenant-scoped records and does not leak another company credential', async () => {
  const docs = new Map();
  const ref = path => ({ path, id: path.split('/').at(-1), get: async () => snapshot(path) });
  const snapshot = path => { const value = docs.get(path); return { id: path.split('/').at(-1), exists: !!value, data: () => value, get: field => value?.[field] }; };
  const db = { doc: ref }, scope = { companyId: 'acme' }, person = { uid: 'tech' };
  const company = { get: field => ({ serviceCategories: ['Inspection'], qualificationRequirementsConfigured: true })[field] };
  const job = { serviceType: 'Inspection', date: '2026-11-24' };
  docs.set(requirementRef(db, 'acme', 'Inspection').path, { companyId: 'acme', qualificationIds: ['skill'] });
  docs.set('rlQualifications/skill', { companyId: 'acme', ...catalog[0] });
  docs.set(staffRef(db, 'acme', 'tech', 'skill').path, { companyId: 'other', memberUid: 'tech', ...records[0] });
  assert.equal((await checkAssignment(db, null, scope, person, job, company)).eligible, false);
  docs.set(staffRef(db, 'acme', 'tech', 'skill').path, { companyId: 'acme', memberUid: 'tech', ...records[0] });
  assert.equal((await checkAssignment(db, null, scope, person, job, company)).eligible, true);
  assert.equal((await checkAssignment(db, null, scope, person, { ...job, serviceType: 'Unknown' }, company)).eligible, false);
});
test('category and specific service requirements both apply when both are defined', async () => {
  const values = new Map(), scope = { companyId: 'tenant' }, person = { uid: 'worker' };
  const db = { doc: path => ({ path, id: path.split('/').at(-1), get: async () => ({ id: path.split('/').at(-1), exists: values.has(path), data: () => values.get(path), get: field => values.get(path)?.[field] }) }) };
  const company = { get: field => ({ serviceCategories: ['Pest Control'], services: ['Termite Inspection'], qualificationRequirementsConfigured: true })[field] };
  for (const [service, id] of [['Pest Control', 'general'], ['Termite Inspection', 'termite']]) {
    values.set(requirementRef(db, 'tenant', service).path, { companyId: 'tenant', qualificationIds: [id] });
    values.set(`rlQualifications/${id}`, { companyId: 'tenant', name: id, active: true, type: 'internal_skill' });
  }
  values.set(staffRef(db, 'tenant', 'worker', 'termite').path, { companyId: 'tenant', memberUid: 'worker', qualificationId: 'termite', active: true, effectiveDate: '2026-01-01', verificationStatus: 'management_recorded' });
  const result = await checkAssignment(db, null, scope, person, { serviceCategory: 'Pest Control', serviceType: 'Termite Inspection', date: '2026-11-24' }, company);
  assert.equal(result.eligible, false);
  assert.match(result.missing.join(' '), /general/);
});
