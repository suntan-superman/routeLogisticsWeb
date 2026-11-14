// Client draft validation only. The backend owns all prices, totals and versions.
const blankLine = kind => ({ kind, description: '', quantity: '1', unitPrice: '', unit: kind === 'labor' ? 'hour' : 'item' });
const blankEstimate = () => ({ customerId: '', prospect: { name: '', email: '', phone: '', address: '' }, title: '', serviceType: '', scopeOfWork: '', notes: '', validDays: '30', taxRate: '0', lineItems: [blankLine('labor'), blankLine('material')], photoIds: [] });
function draftFromEstimate(estimate) {
  return { ...blankEstimate(), ...estimate, prospect: { ...blankEstimate().prospect, ...(!estimate.customerId ? estimate.recipient || { name: estimate.customerName || '', email: estimate.customerEmail || '', address: estimate.address || '' } : {}), ...(estimate.prospect || {}) }, lineItems: (estimate.lineItems || []).map(line => ({ ...line, quantity: String(line.quantity), unitPrice: String(line.unitPrice ?? (Number(line.unitPriceCents || 0) / 100)) })), taxRate: String(estimate.taxRate ?? Number(estimate.taxBasisPoints || 0) / 100), validDays: String(estimate.validDays || 30), photoIds: estimate.photoIds || [] };
}
function estimateInput(draft) {
  if (!draft.title?.trim() || !draft.serviceType?.trim() || !draft.scopeOfWork?.trim()) throw new Error('Add a title, service type and scope of work.');
  if (!draft.customerId && !draft.prospect?.name?.trim()) throw new Error('Select a customer or enter a prospect name.');
  const lines = (draft.lineItems || []).filter(line => line.description?.trim() || String(line.unitPrice).trim());
  if (!lines.length) throw new Error('Add at least one labor or material line.');
  const cleaned = lines.map(line => {
    const quantity = Number(line.quantity), unitPrice = Number(line.unitPrice);
    if (!['labor', 'material', 'service'].includes(line.kind) || !line.description?.trim() || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000 || !/^\d+(\.\d{1,3})?$/.test(String(line.quantity).trim()) || !/^\d+(\.\d{1,2})?$/.test(String(line.unitPrice).trim()) || !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000) throw new Error('Each line needs a description, positive quantity (up to three decimals) and a non-negative price (up to two decimals).');
    return { kind: line.kind, description: line.description.trim(), quantity, unitPrice };
  });
  const taxRate = Number(draft.taxRate || 0), validDays = Number(draft.validDays || 30);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || !/^\d+(\.\d{1,2})?$/.test(String(draft.taxRate || 0)) || !Number.isInteger(validDays) || validDays < 1 || validDays > 90) throw new Error('Tax must be 0–100% (up to two decimals); validity must be 1–90 days.');
  return { customerId: draft.customerId || null, prospect: draft.customerId ? null : Object.fromEntries(['name', 'email', 'phone', 'address'].map(key => [key, String(draft.prospect?.[key] || '').trim()])), title: draft.title.trim(), serviceType: draft.serviceType.trim(), scopeOfWork: draft.scopeOfWork.trim(), notes: draft.notes?.trim() || '', validDays, taxRate, lineItems: cleaned, photoIds: draft.photoIds || [] };
}
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100);
function conversionInput(schedule, { customerId, createCustomer = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.date || '') || !Number.isFinite(Date.parse(`${schedule.date}T12:00:00Z`)) || new Date(`${schedule.date}T12:00:00Z`).toISOString().slice(0, 10) !== schedule.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time || '')) throw new Error('Choose a valid service date and time before converting.');
  if (customerId && createCustomer) throw new Error('Select an existing customer or create one from the approved prospect.');
  return { schedule: { date: schedule.date, time: schedule.time }, ...(customerId ? { customerId } : createCustomer ? { createCustomer: true } : {}) };
}
module.exports = { blankLine, blankEstimate, draftFromEstimate, estimateInput, money, conversionInput };
