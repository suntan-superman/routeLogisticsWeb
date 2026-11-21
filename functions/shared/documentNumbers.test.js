const { test } = require('node:test');
const assert = require('node:assert/strict');
const { localDocumentDay, allocateDocumentNumber } = require('./documentNumbers');
const { companyAddress } = require('./companyAddress');

test('company PDF address adds missing locality without duplicating a complete address', () => {
  assert.equal(companyAddress({ address: '100 Example Street', city: 'Bakersfield', state: 'CA', zipCode: '93301' }), '100 Example Street, Bakersfield CA 93301');
  assert.equal(companyAddress({ address: '100 Example Street, Bakersfield, CA 93301', city: 'Bakersfield', state: 'CA', zipCode: '93301' }), '100 Example Street, Bakersfield, CA 93301');
  assert.equal(companyAddress({ city: 'Bakersfield', state: 'CA', zipCode: '93301' }), 'Bakersfield, CA, 93301');
});

test('document day follows the company time zone across midnight and DST', () => {
  assert.equal(localDocumentDay('2026-11-21T07:59:59Z', 'America/Los_Angeles'), '20261120');
  assert.equal(localDocumentDay('2026-11-21T08:00:00Z', 'America/Los_Angeles'), '20261121');
  assert.equal(localDocumentDay('2026-03-08T07:59:59Z', 'America/Los_Angeles'), '20260307');
  assert.throws(() => localDocumentDay('2026-11-21T08:00:00Z', 'Invalid/Zone'));
});

test('estimate and invoice counters are isolated by tenant, day, and type', async () => {
  const rows = new Map();
  const db = { doc: path => ({ path }) };
  const tx = {
    get: async ref => ({ exists: rows.has(ref.path), get: key => rows.get(ref.path)?.[key] }),
    set: (ref, data) => rows.set(ref.path, data),
  };
  const base = { companyId: 'acme', kind: 'E', timeZone: 'America/Los_Angeles', date: '2026-11-21T18:00:00Z' };
  assert.equal(await allocateDocumentNumber(tx, db, base), '20261121-E001');
  assert.equal(await allocateDocumentNumber(tx, db, base), '20261121-E002');
  assert.equal(await allocateDocumentNumber(tx, db, { ...base, kind: 'I' }), '20261121-I001');
  assert.equal(await allocateDocumentNumber(tx, db, { ...base, companyId: 'bls' }), '20261121-E001');
  assert.equal(await allocateDocumentNumber(tx, db, { ...base, date: '2026-11-22T18:00:00Z' }), '20261122-E001');
  assert.equal(rows.size, 4);
});
