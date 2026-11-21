// Generates local synthetic examples only. No Firebase or customer data access.
const { writeFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const { calculateTotals } = require('../functions/shared/invoiceMath');
const { publicSnapshot } = require('../functions/shared/invoiceV2');
const { buildInvoicePdf } = require('../functions/invoicePdf');
const { reportData, pdfFor } = require('../functions/financialReports');

async function main() {
  const directory = path.resolve(__dirname, '../docs/audits/financial');
  await mkdir(directory, { recursive: true });
  const invoice = { financialVersion: 2, status: 'issued', invoiceNumber: 'SAMPLE-ONLY-001', customerName: 'Alex Example', customerEmail: 'alex@example.invalid',
    customerAddress: '100 Example Street, Bakersfield, CA 93301', issueDate: '2026-11-20', dueDate: '2026-12-04',
    customerFacingSummary: 'Synthetic pest inspection and follow-up service.', paymentTerms: 'Example document. No payment is due.',
    billingSource: { serviceProperty: { address: '200 Example Street, Bakersfield, CA 93301' } },
    ...calculateTotals([{ description: 'Synthetic inspection', quantity: 1, unitPrice: 75 }, { description: 'Synthetic follow-up', quantity: 1, unitPrice: 25 }], 8.25) };
  const snapshot = publicSnapshot(invoice, { name: 'Example Field Services LLC', phone: '(555) 010-0100', email: 'billing@example.invalid', address: '300 Example Avenue', city: 'Bakersfield', state: 'CA', zipCode: '93301' });
  await writeFile(path.join(directory, 'sample-invoice.pdf'), await buildInvoicePdf(snapshot, { preview: true }));
  const report = reportData('revenue_invoicing', { jobs: [], invoices: [{ id: 'synthetic', ...invoice, issuedSnapshot: snapshot, totalCents: snapshot.totalCents,
    paidCents: 3000, balanceCents: snapshot.totalCents - 3000 }], ledger: [{ invoiceId: 'synthetic', customerId: 'synthetic-customer', kind: 'record', amountCents: 3000, recordedAt: new Date('2026-11-20T18:00:00Z') }],
  start: '2026-11-20', end: '2026-11-20', zone: 'America/Los_Angeles' });
  await writeFile(path.join(directory, 'sample-management-report.pdf'), await pdfFor(report, 'Example Field Services LLC'));
  process.stdout.write('Synthetic invoice and report PDFs generated.\n');
}
main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
