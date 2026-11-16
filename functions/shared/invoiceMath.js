const { HttpsError } = require('firebase-functions/v2/https');
const { hash } = require('../security');
const fail = message => { throw new HttpsError('failed-precondition', message); };

function scaled(value, places, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !/^\d+(?:\.\d+)?$/.test(String(value))) fail(`${label} must be an explicit non-negative number.`);
  const [whole, fraction = ''] = String(value).split('.');
  if (fraction.length > places) fail(`${label} has unsupported decimal precision.`);
  const result = BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0'));
  if (result > 100000000000n) fail(`${label} exceeds the supported amount.`);
  return result;
}
function calculateTotals(items, taxRate = 0) {
  if (!Array.isArray(items) || !items.length || items.length > 50) fail('A valid billing source with 1–50 lines is required.');
  let subtotal = 0n;
  const lineItems = items.map(item => {
    const description = typeof item?.description === 'string' ? item.description.trim() : '';
    if (!description || description.length > 300) fail('Each billing line needs a description of at most 300 characters.');
    const quantity = scaled(item.quantity, 3, 'Quantity'), unitPrice = scaled(item.unitPrice, 2, 'Unit price');
    if (!quantity) fail('Billing quantities must be greater than zero.');
    const amount = (quantity * unitPrice + 500n) / 1000n;
    subtotal += amount;
    return { description, kind: ['labor', 'material', 'service'].includes(item.kind) ? item.kind : 'service', quantity: item.quantity,
      unitPrice: Number(unitPrice) / 100, unitPriceCents: Number(unitPrice), amount: Number(amount) / 100, amountCents: Number(amount),
      ...(typeof item.templateId === 'string' && item.templateId.length <= 200 && !item.templateId.includes('/') ? { templateId: item.templateId } : {}) };
  });
  const rate = scaled(taxRate, 2, 'Tax rate');
  if (rate > 10000n) fail('Tax rate cannot exceed 100 percent.');
  const tax = (subtotal * rate + 5000n) / 10000n, total = subtotal + tax;
  if (total > 1000000000n) fail('The billing total exceeds the supported amount.');
  return { lineItems, taxRate: Number(rate) / 100, subtotalCents: Number(subtotal), taxCents: Number(tax), totalCents: Number(total),
    subtotal: Number(subtotal) / 100, tax: Number(tax) / 100, total: Number(total) / 100, currency: 'USD',
    taxTreatment: tax > 0n || rate > 0n ? 'taxable' : 'non-taxable' };
}
function approvedBillingSnapshot(source, { estimateId, estimateVersion, customerId }) {
  if (!source || source.estimateId !== estimateId || source.version !== estimateVersion || source.currency && String(source.currency).toUpperCase() !== 'USD') fail('The approved estimate version is incomplete or inconsistent. Authorized review is required.');
  const totals = calculateTotals(source.lineItems, source.taxRate);
  for (const key of ['subtotalCents', 'taxCents', 'totalCents', 'subtotal', 'tax', 'total']) if (source[key] !== totals[key]) fail('The immutable approved estimate totals are inconsistent. Authorized review is required.');
  source.lineItems.forEach((item, index) => {
    if (item.kind !== totals.lineItems[index].kind || item.description !== totals.lineItems[index].description) fail('The immutable approved estimate line descriptions or kinds are inconsistent. Authorized review is required.');
    if (item.unitPriceCents !== totals.lineItems[index].unitPriceCents || item.amountCents !== totals.lineItems[index].amountCents) fail('The immutable approved estimate line amounts are inconsistent. Authorized review is required.');
  });
  return { kind: 'approved-estimate', estimateId, estimateVersion, customerId, sourceCustomerId: source.customerId || null,
    serviceProperty: source.serviceProperty || { address: typeof source.recipient?.address === 'string' ? source.recipient.address : '' },
    serviceCategory: source.serviceCategory || '', approvedScope: { title: source.title || '', serviceType: source.serviceType || '', scopeOfWork: source.scopeOfWork || '', notes: source.notes || '' }, ...totals };
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (value?.toDate) return value.toDate().toISOString();
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}
const fingerprint = value => hash(JSON.stringify(canonical(value)));
function financialReviewReasons(invoice) {
  const reasons = [];
  if (invoice.currency !== undefined && String(invoice.currency).toUpperCase() !== 'USD') reasons.push('unsupported-currency');
  if (invoice.taxTreatment !== undefined && !['taxable', 'non-taxable'].includes(invoice.taxTreatment)) reasons.push('unsupported-tax-treatment');
  if (invoice.taxTreatment === 'non-taxable' && (invoice.tax > 0 || invoice.taxRate > 0)) reasons.push('inconsistent-tax-treatment');
  try {
    const totals = calculateTotals(invoice.lineItems, invoice.taxRate ?? 0);
    if (['subtotal','tax','total'].some(key => invoice[key] !== totals[key]) || ['subtotalCents','taxCents','totalCents'].some(key => invoice[key] !== undefined && invoice[key] !== totals[key])) reasons.push('financial-totals-mismatch');
    if (invoice.lineItems.some((line, index) => line.amount !== totals.lineItems[index].amount
      || line.amountCents !== undefined && line.amountCents !== totals.lineItems[index].amountCents
      || line.unitPriceCents !== undefined && line.unitPriceCents !== totals.lineItems[index].unitPriceCents
      || line.description !== totals.lineItems[index].description
      || line.kind !== undefined && line.kind !== totals.lineItems[index].kind)) reasons.push('financial-line-mismatch');
  } catch { reasons.push('incomplete-financial-source'); }
  return reasons;
}
module.exports = { scaled, calculateTotals, approvedBillingSnapshot, canonical, fingerprint, financialReviewReasons };
