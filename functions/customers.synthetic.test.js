const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanCustomer, syntheticImportRow } = require('./customers');

test('only clearly fictional BLS CSV rows bypass geocoding and remain unverified', () => {
  const synthetic = cleanCustomer({ name: 'BLS Test Customer 01', email: 'bls-test-01@example.com', phone: '', address: '101 Example Lane (Synthetic)', city: 'Bakersfield', state: 'CA', zipCode: '', notes: '' });
  assert.equal(syntheticImportRow(synthetic), true);
  for (const change of [{ email: 'real@example.com' }, { email: 'bls-test-02@example.com' }, { address: '101 Example Lane' }, { phone: '5550100' }, { zipCode: '93301' }, { notes: 'Private' }, { name: 'Real Person' }]) assert.equal(syntheticImportRow({ ...synthetic, ...change }), false);
});
