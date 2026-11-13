import { test } from 'node:test';
import assert from 'node:assert';
import { computeTotals, generateInvoiceNumber, addDays, isOverdue } from './invoiceMath.js';

test('computeTotals sums in cents and applies tax', () => {
  const t = computeTotals([
    { description: 'Quarterly service', quantity: 1, unitPrice: 89.99 },
    { description: 'Bait station', quantity: 3, unitPrice: 12.1 },
  ], 8.25);
  assert.strictEqual(t.subtotal, 126.29);
  assert.strictEqual(t.tax, 10.42);
  assert.strictEqual(t.total, 136.71);
});

test('computeTotals clamps negatives and bad input', () => {
  const t = computeTotals([{ description: 'x', quantity: -2, unitPrice: 'abc' }], -5);
  assert.strictEqual(t.total, 0);
  assert.strictEqual(t.taxRate, 0);
});

test('0.1 + 0.2 style drift does not occur', () => {
  const t = computeTotals([{ quantity: 3, unitPrice: 0.1 }, { quantity: 1, unitPrice: 0.2 }]);
  assert.strictEqual(t.total, 0.5);
});

test('invoice number format', () => {
  assert.match(generateInvoiceNumber(new Date(2026, 10, 12), () => 0.5), /^INV-202611-[0-9A-Z]{6}$/);
});

test('addDays crosses month boundaries', () => {
  assert.strictEqual(addDays('2026-11-25', 10), '2026-12-05');
  assert.strictEqual(addDays('2026-12-20', 90), '2027-03-20');
});

test('isOverdue only for sent invoices past due', () => {
  assert.ok(isOverdue({ status: 'sent', dueDate: '2026-01-01' }, '2026-02-01'));
  assert.ok(!isOverdue({ status: 'paid', dueDate: '2026-01-01' }, '2026-02-01'));
  assert.ok(!isOverdue({ status: 'sent', dueDate: '2026-03-01' }, '2026-02-01'));
});
