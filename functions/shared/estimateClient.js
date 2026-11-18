// Client draft validation only. The backend owns all prices, totals and versions.
const blankLine = kind => ({ kind, description: '', quantity: '1', unitPrice: '', unit: kind === 'labor' ? 'hour' : 'item' });
const blankEstimate = () => ({ customerId: '', prospect: { name: '', email: '', phone: '', address: '' }, title: '', serviceType: '', scopeOfWork: '', notes: '', technicianNotes: '', internalReviewNotes: '', validDays: '30', taxRate: '0', lineItems: [blankLine('labor'), blankLine('material')], photoIds: [] });
function draftFromEstimate(estimate) {
  return { ...blankEstimate(), ...estimate, prospect: { ...blankEstimate().prospect, ...(!estimate.customerId ? estimate.recipient || { name: estimate.customerName || '', email: estimate.customerEmail || '', address: estimate.address || '' } : {}), ...(estimate.prospect || {}) }, lineItems: (estimate.lineItems || []).map(line => ({ ...line, quantity: String(line.quantity), unitPrice: String(line.unitPrice ?? (Number(line.unitPriceCents || 0) / 100)) })), taxRate: String(estimate.taxRate ?? Number(estimate.taxBasisPoints || 0) / 100), validDays: String(estimate.validDays || 30), photoIds: estimate.photoIds || [] };
}
function invalidEstimate(fieldErrors) {
  const entries = Object.entries(fieldErrors);
  const error = new Error(`Review the highlighted estimate fields. ${[...new Set(entries.map(([, message]) => message))].join(' ')}`);
  error.code = 'client-validation'; error.fieldErrors = fieldErrors; error.firstField = entries[0]?.[0] || null;
  throw error;
}
function estimateInput(draft, { pricingRequired = true } = {}) {
  const errors = {};
  if (!draft.title?.trim()) errors.title = 'Estimate title is required.';
  if (!draft.serviceType?.trim()) errors.serviceType = 'Service type is required.';
  if (!draft.scopeOfWork?.trim()) errors.scopeOfWork = 'Scope of work is required.';
  if (!draft.customerId && !draft.prospect?.name?.trim()) errors['prospect.name'] = 'Select a customer or enter a prospect name.';
  const prospectEmail = String(draft.prospect?.email || '').trim();
  if (!draft.customerId && prospectEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prospectEmail)) errors['prospect.email'] = 'Enter a valid prospect email address.';
  const lines = (draft.lineItems || []).filter(line => line.description?.trim() || String(line.unitPrice).trim());
  if (pricingRequired && !lines.length) errors.lineItems = 'Add at least one labor, material, or service line.';
  const cleaned = (draft.lineItems || []).map((line, index) => ({ line, index })).filter(({ line }) => line.description?.trim() || String(line.unitPrice).trim()).map(({ line, index }) => {
    const quantity = Number(line.quantity), unitPrice = Number(line.unitPrice);
    if (!['labor', 'material', 'service'].includes(line.kind)) errors[`lineItems.${index}.kind`] = `Line ${index + 1} has an unsupported type.`;
    if (!line.description?.trim()) errors[`lineItems.${index}.description`] = `Description is required for line ${index + 1}.`;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000 || !/^\d+(\.\d{1,3})?$/.test(String(line.quantity).trim())) errors[`lineItems.${index}.quantity`] = `Enter a positive quantity with up to three decimals for line ${index + 1}.`;
    if (!/^\d+(\.\d{1,2})?$/.test(String(line.unitPrice).trim()) || !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000) errors[`lineItems.${index}.unitPrice`] = `Enter a non-negative price with up to two decimals for line ${index + 1}.`;
    return { kind: line.kind, description: line.description.trim(), quantity, unitPrice };
  });
  const taxRate = Number(draft.taxRate || 0), validDays = Number(draft.validDays || 30);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || !/^\d+(\.\d{1,2})?$/.test(String(draft.taxRate || 0))) errors.taxRate = 'Tax must be 0–100% with up to two decimals.';
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 90) errors.validDays = 'Estimate validity must be a whole number from 1–90 days.';
  if (Object.keys(errors).length) invalidEstimate(errors);
  return { customerId: draft.customerId || null, prospect: draft.customerId ? null : Object.fromEntries(['name', 'email', 'phone', 'address'].map(key => [key, String(draft.prospect?.[key] || '').trim()])), title: draft.title.trim(), serviceType: draft.serviceType.trim(), scopeOfWork: draft.scopeOfWork.trim(), notes: draft.notes?.trim() || '', technicianNotes: draft.technicianNotes?.trim() || '', internalReviewNotes: draft.internalReviewNotes?.trim() || '', validDays, taxRate, lineItems: cleaned, photoIds: draft.photoIds || [], ...['sourceVisitId','inquiryId','servicePropertyId','serviceProperty','serviceCategory','serviceAreaExceptionId'].reduce((result, key) => Object.hasOwn(draft, key) ? { ...result, [key]: draft[key] } : result, {}) };
}
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100);
function conversionInput(schedule, { customerId, createCustomer = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.date || '') || !Number.isFinite(Date.parse(`${schedule.date}T12:00:00Z`)) || new Date(`${schedule.date}T12:00:00Z`).toISOString().slice(0, 10) !== schedule.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time || '')) throw new Error('Choose a valid service date and time before converting.');
  if (customerId && createCustomer) throw new Error('Select an existing customer or create one from the approved prospect.');
  return { schedule: { date: schedule.date, time: schedule.time }, ...(customerId ? { customerId } : createCustomer ? { createCustomer: true } : {}) };
}
module.exports = { blankLine, blankEstimate, draftFromEstimate, estimateInput, money, conversionInput };
