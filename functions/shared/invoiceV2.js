const { HttpsError } = require('firebase-functions/v2/https');
const { fingerprint, financialReviewReasons } = require('./invoiceMath');

const fail = message => { throw new HttpsError('failed-precondition', message); };
const isCurrentInvoice = invoice => invoice?.financialVersion === 2;
const financialStatuses = ['draft', 'awaiting_approval', 'approved', 'issued', 'partially_paid', 'paid', 'void'];

function assertCurrentInvoice(invoice) {
  if (!isCurrentInvoice(invoice)) fail('This is a legacy test invoice and cannot enter the new financial workflow.');
  if (!financialStatuses.includes(invoice.status)) fail('Invoice status needs financial review.');
  if (financialReviewReasons(invoice).length) fail('Invoice totals need financial review.');
  if (!Number.isSafeInteger(invoice.totalCents) || invoice.totalCents < 0) fail('Invoice amount is invalid.');
}

function publicSnapshot(invoice, company = {}) {
  assertCurrentInvoice(invoice);
  const safe = value => typeof value === 'string' ? value.trim() : '';
  const snapshot = {
    financialVersion: 2,
    invoiceNumber: safe(invoice.invoiceNumber),
    currency: 'USD',
    business: {
      name: safe(company.name || company.businessName || invoice.businessName),
      email: safe(company.email), phone: safe(company.phone),
      address: [company.address, company.city, company.state, company.zipCode].filter(Boolean).join(', '),
      logo: safe(company.logo),
      logoCompanyId: safe(invoice.companyId),
    },
    customer: { name: safe(invoice.customerName), email: safe(invoice.customerEmail), billingAddress: safe(invoice.billingAddress || invoice.customerAddress) },
    propertyAddress: safe(invoice.billingSource?.serviceProperty?.address || invoice.customerAddress),
    issueDate: invoice.issueDate, dueDate: invoice.dueDate,
    lineItems: invoice.lineItems.map(line => ({ description: safe(line.description), quantity: line.quantity, unitPriceCents: line.unitPriceCents, discountCents: line.discountCents || 0, amountCents: line.amountCents })),
    grossSubtotalCents: invoice.grossSubtotalCents ?? invoice.subtotalCents, discountCents: invoice.discountCents || 0,
    subtotalCents: invoice.subtotalCents, taxCents: invoice.taxCents, totalCents: invoice.totalCents,
    taxRate: invoice.taxRate,
    paymentTerms: safe(invoice.paymentTerms),
    serviceSummary: safe(invoice.customerFacingSummary),
    approvedPhotos: Array.isArray(invoice.approvedPhotos) ? invoice.approvedPhotos.filter(photo => photo?.approved === true && typeof photo.storagePath === 'string').slice(0, 12).map(photo => ({ storagePath: photo.storagePath, caption: safe(photo.caption) })) : [],
  };
  return { ...snapshot, fingerprint: fingerprint(snapshot) };
}

function balanceFor(invoice, paidCents = invoice.paidCents || 0, creditCents = invoice.creditCents || 0) {
  assertCurrentInvoice(invoice);
  if (![paidCents, creditCents].every(n => Number.isSafeInteger(n) && n >= 0)) fail('Payment balances are invalid.');
  const balanceCents = invoice.totalCents - paidCents - creditCents;
  if (balanceCents < 0) fail('Payment exceeds the invoice balance.');
  return { paidCents, creditCents, balanceCents, status: balanceCents === 0 ? 'paid' : paidCents + creditCents > 0 ? 'partially_paid' : 'issued' };
}

module.exports = { isCurrentInvoice, assertCurrentInvoice, financialStatuses, publicSnapshot, balanceFor };
