const { test } = require('node:test');
const assert = require('node:assert/strict');
const { customerAddress, cleanCustomerPatch, validatedCustomerAddress } = require('./customerAddresses');
test('customer address composition preserves legacy nested and canonical full addresses', () => {
  assert.equal(customerAddress({ address: { street: '100 Main Street', city: 'Example', state: 'CA', postalCode: '93312' } }), '100 Main Street, Example, CA, 93312');
  assert.equal(customerAddress({ address: '100 Main Street, Example, CA 93312', city: 'Example', state: 'CA', zipCode: '93312' }), '100 Main Street, Example, CA 93312');
  assert.equal(customerAddress({ address: '', city: '', state: '', zipCode: '' }), '');
});
test('customer mutation allowlist ignores tenant, pricing and client geographic proof fields', () => {
  const patch = cleanCustomerPatch({ name: ' Synthetic ', email: 'OWNER@EXAMPLE.TEST', address: '100 Main Street', companyId: 'foreign', userId: 'foreign', totalSpent: 99, quickbooksId: 'foreign', latitude: 0, location: { latitude: 0 }, addressValidation: { validated: true } }, true);
  assert.deepEqual(patch, { name: 'Synthetic', email: 'owner@example.test', emailNormalized: 'owner@example.test', address: '100 Main Street' });
  for (const value of [{ name: '' }, { name: 'Valid', email: 'invalid' }, { name: 'Valid', address: { street: '100 Main Street' } }, { name: 'Valid', emailConsent: 'true' }]) assert.throws(() => cleanCustomerPatch(value, true), { code: 'invalid-argument' });
});
test('verified customer address replaces stale locality and coordinates without changing unrelated data', () => {
  assert.deepEqual(validatedCustomerAddress({ formattedAddress: '100 Main Street, Example, CA 93312', latitude: 35, longitude: -119, postalCode: '93312', validatedAt: '2026-11-15T00:00:00.000Z' }), { address: '100 Main Street, Example, CA 93312', city: '', state: '', zipCode: '', postalCode: '', latitude: 35, longitude: -119, location: { latitude: 35, longitude: -119 }, addressValidation: { source: 'google-address-validation', postalCode: '93312', validatedAt: '2026-11-15T00:00:00.000Z', placeId: '' } });
});
