const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateTotals, approvedBillingSnapshot, fingerprint, financialReviewReasons } = require('./shared/invoiceMath');
const { invoiceNumber, invoiceRevision, expectedRevision, historicalReview, assertInvoiceTerms } = require('./invoices');
const items = [{ kind: 'labor', description: 'Synthetic inspection', quantity: 1, unitPrice: 75 }, { kind: 'material', description: 'Synthetic materials', quantity: 2, unitPrice: 12.5 }];
const quote = () => ({ estimateId: 'synthetic-estimate', version: 3, customerId: 'synthetic-customer', title: 'Approved synthetic scope', scopeOfWork: 'Original scope', serviceProperty: { address: '100 Synthetic Street' }, ...calculateTotals(items, 8.25) });

test('server cents preserve approved 100 subtotal, 8.25 tax and 108.25 total with every line', () => {
  const source = quote(), copy = structuredClone(source), result = approvedBillingSnapshot(source, { estimateId: source.estimateId, estimateVersion: 3, customerId: source.customerId });
  assert.equal(result.subtotalCents, 10000); assert.equal(result.taxCents, 825); assert.equal(result.totalCents, 10825);
  assert.equal(result.total, 108.25); assert.deepEqual(result.lineItems, source.lineItems); assert.equal(result.estimateVersion, 3);
  assert.equal(result.approvedScope.scopeOfWork, 'Original scope'); assert.deepEqual(result.serviceProperty, source.serviceProperty); assert.deepEqual(source, copy);
});
test('quantity thousandths and line-cent rounding use integer arithmetic before tax', () => {
  const result = calculateTotals([{ description: 'Fractional service', quantity: 1.335, unitPrice: 1 }], 8.25);
  assert.equal(result.lineItems[0].amountCents, 134); assert.equal(result.taxCents, 11); assert.equal(result.totalCents, 145);
  assert.equal(result.lineItems[0].quantity, 1.335); assert.equal(result.lineItems[0].amount, 1.34);
});
test('explicit legitimate zero is valid while missing, negative and excess-precision source prices fail', () => {
  assert.equal(calculateTotals([{ description: 'Authorized no-charge visit', quantity: 1, unitPrice: 0 }], 0).totalCents, 0);
  for (const unitPrice of [undefined, null, '', -1, NaN, 1.005]) assert.throws(() => calculateTotals([{ description: 'Invalid source', quantity: 1, unitPrice }]), { code: 'failed-precondition' });
  assert.throws(() => calculateTotals([{ description: 'Zero quantity', quantity: 0, unitPrice: 1 }]), { code: 'failed-precondition' });
});
test('edited immutable totals and line cents are rejected instead of repaired or silently repriced', () => {
  for (const key of ['subtotalCents','taxCents','totalCents','subtotal','tax','total']) {
    const source = quote(); source[key] += 1;
    assert.throws(() => approvedBillingSnapshot(source, { estimateId: source.estimateId, estimateVersion: 3, customerId: source.customerId }), { code: 'failed-precondition' });
  }
  const source = quote(); source.lineItems[0].amountCents = 1;
  assert.throws(() => approvedBillingSnapshot(source, { estimateId: source.estimateId, estimateVersion: 3, customerId: source.customerId }), { code: 'failed-precondition' });
});
test('approved historical version and USD contract cannot be substituted by a current version or currency', () => {
  const source = quote();
  assert.throws(() => approvedBillingSnapshot(source, { estimateId: source.estimateId, estimateVersion: 4, customerId: source.customerId }), { code: 'failed-precondition' });
  assert.throws(() => approvedBillingSnapshot({ ...source, currency: 'EUR' }, { estimateId: source.estimateId, estimateVersion: 3, customerId: source.customerId }), { code: 'failed-precondition' });
});
test('corrupted approved descriptions or unknown line kinds are rejected instead of normalized', () => {
  for (const patch of [{ kind: 'unsupported-kind' }, { description: ' Synthetic inspection ' }]) {
    const source = quote(); Object.assign(source.lineItems[0], patch);
    assert.throws(() => approvedBillingSnapshot(source, { estimateId: source.estimateId, estimateVersion: 3, customerId: source.customerId }), { code: 'failed-precondition' });
  }
});
test('server invoice numbers remain distinct per replacement and fit the QuickBooks 21-character contract', () => {
  const first = invoiceNumber('a'.repeat(64), 1), second = invoiceNumber('a'.repeat(64), 2);
  assert.notEqual(first, second); assert.equal(first, invoiceNumber('a'.repeat(64), 1)); assert.ok(first.length <= 21); assert.ok(second.length <= 21);
  assert.notEqual(first, invoiceNumber('b'.repeat(64), 1));
});
test('legacy revisions are zero and stale or omitted expected revisions fail explicitly', () => {
  assert.equal(invoiceRevision({}), 0); assert.equal(expectedRevision({}, 0), 0); assert.equal(expectedRevision({ revision: 4 }, 4), 4);
  assert.throws(() => expectedRevision({ revision: 4 }, 3), { code: 'aborted' });
  assert.throws(() => expectedRevision({ revision: 4 }), { code: 'invalid-argument' });
});
test('historical invoice inspection flags inconsistencies without changing stored values', () => {
  const invoice = { ...calculateTotals(items, 8.25), status: 'sent', currency: 'EUR', customerId: 'other', total: 1 }, before = structuredClone(invoice);
  assert.deepEqual(historicalReview(invoice, { customerId: 'expected' }).sort(), ['unsupported-currency','customer-mismatch','financial-totals-mismatch'].sort()); assert.deepEqual(invoice, before);
});
test('legacy issuance validation accepts valid dollar terms without cents but catches a mismatching line even when aggregate totals agree', () => {
  const invoice = { lineItems: [{ description: 'Legacy source', quantity: 1, unitPrice: 100, amount: 100 }], taxRate: 8.25, subtotal: 100, tax: 8.25, total: 108.25 };
  assert.deepEqual(financialReviewReasons(invoice), []); assert.doesNotThrow(() => assertInvoiceTerms(invoice));
  const changed = structuredClone(invoice); changed.lineItems[0].amount = 1;
  assert.deepEqual(financialReviewReasons(changed), ['financial-line-mismatch']);
  assert.throws(() => assertInvoiceTerms(changed), { code: 'failed-precondition' });
  const missing = structuredClone(invoice); delete missing.subtotal;
  assert.deepEqual(financialReviewReasons(missing), ['financial-totals-mismatch']);
});
test('source fingerprints ignore object key order but retain the exact original line ordering', () => {
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
  assert.notEqual(fingerprint(items), fingerprint([...items].reverse()));
});
