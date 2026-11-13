import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerName, legacyDate, formatCustomerDate, customerView } from './legacyCustomer.js';
test('legacy customers retain legitimate names and resolve first/last names without modifying source', () => {
  const data = { name: '', firstName: 'Jane', lastName: 'Doe', phoneNumber: '555', totalSpent: '12.50' };
  assert.equal(customerName(data), 'Jane Doe');
  assert.equal(customerName({ ...data, name: 'Business name' }), 'Business name');
  assert.equal(customerView('id', data).totalSpent, 12.5);
  assert.equal(customerView('id', data).isActive, true);
  assert.equal(data.name, '');
  assert.equal(customerName({}), '');
});
test('timestamps, recognized legacy dates and missing values render safely', () => {
  for (const input of [{ seconds: 1767225600 }, { _seconds: 1767225600 }, { toDate: () => new Date('2026-01-01') }, '11/12/2026', '2026-11-12', '2026-11-12T12:00:00Z']) assert.ok(legacyDate(input));
  for (const input of [null, '', 'nonsense', '02/30/2026', '2026-02-30', { seconds: NaN }, new Date(NaN)]) assert.equal(formatCustomerDate(input), '—');
});
