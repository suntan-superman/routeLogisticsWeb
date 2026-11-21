const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const { calculateTotals } = require('./shared/invoiceMath');
const { publicSnapshot, balanceFor } = require('./shared/invoiceV2');
const { buildInvoicePdf } = require('./invoicePdf');
const { reportData, csvFor, pdfFor } = require('./financialReports');
const { dueOn, previousWorkday, scheduledDates } = require('./billingScheduler');
const { cleanBillingSettings, DEFAULTS } = require('./billingSettings');

const invoice = (items = [{ description: 'Pest control', quantity: 1, unitPrice: 75 }]) => ({ financialVersion: 2, status: 'draft', invoiceNumber: 'SYNTHETIC-001', customerName: 'Synthetic Customer', customerEmail: 'sample@example.invalid',
  customerAddress: '100 Example Street', issueDate: '2026-11-20', dueDate: '2026-12-04', billingSource: { serviceProperty: { address: '200 Example Street' } },
  notes: 'PRIVATE GATE CODE 9184', internalCost: 999999, customerFacingSummary: 'Synthetic service visit', paymentTerms: 'Due in 14 days', ...calculateTotals(items, 8.25) });

test('issued snapshot keeps customer-facing fields and omits internal notes and technician costs', async () => {
  const draft = invoice(), snapshot = publicSnapshot(draft, { name: 'Synthetic Services LLC', phone: '(555) 010-0100' });
  assert.equal(snapshot.totalCents, 8119);
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE GATE CODE'), false);
  assert.equal(JSON.stringify(snapshot).includes('internalCost'), false);
  const pdf = await buildInvoicePdf(snapshot, { preview: false });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const loaded = await PDFDocument.load(pdf);
  assert.equal(loaded.getPageCount(), 1);
});

test('long invoice descriptions and approved photo appendix paginate without PDF encoding errors', async () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ description: `Service ${i+1}: ` + 'Detailed work '.repeat(14) + 'áé—', quantity: 1, unitPrice: 2 }));
  const snapshot = publicSnapshot(invoice(items), { name: 'Synthetic Services LLC' });
  const pdf = await buildInvoicePdf(snapshot);
  assert.ok((await PDFDocument.load(pdf)).getPageCount() > 1);
  const withPhoto = { ...snapshot, approvedPhotos: [{ storagePath: 'rlJobPhotos/synthetic/example.jpg', caption: 'Approved image' }] };
  const { fingerprint } = require('./shared/invoiceMath');
  withPhoto.fingerprint = fingerprint(Object.fromEntries(Object.entries(withPhoto).filter(([key]) => key !== 'fingerprint')));
  const photoPdf = await buildInvoicePdf(withPhoto, { photoProvider: async () => {
    const p = await PDFDocument.create(), page = p.addPage([10,10]);
    // A real valid PNG from a one-pixel fixture is exercised by the PDF renderer.
    void page;
    return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=', 'base64');
  } });
  assert.ok((await PDFDocument.load(photoPdf)).getPageCount() > (await PDFDocument.load(pdf)).getPageCount());
});

test('integer-cent partial payment, credit and reversal restore the exact balance', () => {
  const draft = invoice();
  const paid = balanceFor(draft, 3000, 0);
  assert.deepEqual(paid, { paidCents: 3000, creditCents: 0, balanceCents: 5119, status: 'partially_paid' });
  const credited = balanceFor(draft, 3000, 5119);
  assert.equal(credited.status, 'paid');
  assert.equal(balanceFor(draft, 3000, 0).balanceCents, 5119);
  assert.throws(() => balanceFor(draft, 8120, 0), { code: 'failed-precondition' });
});

test('line discounts reduce the taxable subtotal with exact cents and appear in the issued snapshot', () => {
  const discounted = invoice([{ description: 'Synthetic service', quantity: 2, unitPrice: 50, discount: 15.25 }]);
  assert.equal(discounted.grossSubtotalCents, 10000);
  assert.equal(discounted.discountCents, 1525);
  assert.equal(discounted.subtotalCents, 8475);
  assert.equal(discounted.totalCents, 9174);
  assert.equal(publicSnapshot(discounted).lineItems[0].discountCents, 1525);
  assert.throws(() => calculateTotals([{ description: 'Too much discount', quantity: 1, unitPrice: 5, discount: 6 }]), { code: 'failed-precondition' });
});

test('financial reports exclude legacy test invoices and separate invoice value from actual collections', async () => {
  const issued = { id: 'new', financialVersion: 2, invoiceNumber: 'SYNTHETIC-001', status: 'partially_paid', customerId: 'c1', customerName: 'Synthetic Customer', jobId: 'j1',
    issuedSnapshot: { issueDate: '2026-11-20', totalCents: 10000 }, totalCents: 10000, paidCents: 3000, balanceCents: 7000, dueDate: '2026-11-20' };
  const legacy = { id: 'old', status: 'paid', totalCents: 900000, customerId: 'c1' };
  const job = { id: 'j1', date: '2026-11-20', status: 'completed', assignedTo: 'tech1', customerId: 'c1', serviceType: 'Pest control' };
  const payment = { invoiceId: 'new', customerId: 'c1', kind: 'record', amountCents: 3000, recordedAt: new Date('2026-11-20T18:00:00Z') };
  const args = { jobs: [job], invoices: [issued, legacy], ledger: [payment], start: '2026-11-20', end: '2026-11-20', zone: 'America/Los_Angeles' };
  const revenue = reportData('revenue_invoicing', args), received = reportData('payments_received', args), ar = reportData('ar_aging', args);
  assert.equal(revenue.totals.invoicedCents, 10000);
  assert.equal(revenue.totals.collectedThroughEndCents, 3000);
  assert.equal(received.totals.collectedCents, 3000);
  assert.equal(ar.totals.outstandingCents, 7000);
  assert.equal(reportData('revenue_invoicing', { ...args, filters: { technicianId: 'other' } }).rows.length, 0);
  assert.equal(csvFor({ rows: [{ customerName: '=HYPERLINK("https://example.invalid")' }] }).includes('"\'=HYPERLINK'), true);
  assert.equal((await pdfFor(revenue, 'Synthetic Services LLC')).subarray(0,5).toString(), '%PDF-');
  const paidLater = { ...payment, recordedAt: new Date('2026-11-21T18:00:00Z') };
  const periodEnd = reportData('revenue_invoicing', { ...args, ledger: [paidLater] });
  assert.equal(periodEnd.totals.collectedThroughEndCents, 0);
  assert.equal(periodEnd.totals.outstandingAtEndCents, 10000);
  const longReport = { ...revenue, rows: Array.from({ length: 100 }, (_, index) => ({ customerName: 'Very long synthetic customer name '.repeat(8), index })) };
  assert.ok((await PDFDocument.load(await pdfFor(longReport, 'Synthetic Services LLC'))).getPageCount() > 1);
});

test('company-local schedule catches missed runs and shifts weekends/holidays without historical backfill', () => {
  assert.equal(dueOn('2026-11-23', 'weekly', '2026-11-21'), true); // Saturday anchor rolls to Monday.
  assert.equal(dueOn('2026-11-24', 'weekly', '2026-11-21', ['2026-11-23']), true);
  assert.equal(previousWorkday('2026-11-30', ['2026-11-27']), '2026-11-26');
  assert.deepEqual(scheduledDates({ today: '2026-11-24', activatedAt: new Date('2026-11-20T19:00:00Z'), lastRunDate: null,
    cadence: 'daily', anchor: '2026-11-20', holidays: ['2026-11-23'], zone: 'America/Los_Angeles' }), ['2026-11-20','2026-11-24']);
  assert.equal(dueOn('2026-03-02', 'monthly', '2026-01-31'), true); // February end shifted past weekend.
});

test('billing settings retain mandatory approval and reject unknown report types or invalid recipients', () => {
  assert.equal(cleanBillingSettings(DEFAULTS).managementApprovalRequired, true);
  assert.throws(() => cleanBillingSettings({ ...DEFAULTS, managementApprovalRequired: false }), { code: 'invalid-argument' });
  assert.throws(() => cleanBillingSettings({ ...DEFAULTS, reportTypes: ['unknown'] }), { code: 'invalid-argument' });
  assert.throws(() => cleanBillingSettings({ ...DEFAULTS, reportRecipients: ['invalid-email'] }), { code: 'invalid-argument' });
});
