const LIFECYCLES = ['prospect', 'active', 'inactive'];
const INQUIRY_STATUSES = ['new', 'contacted', 'estimate_scheduled', 'estimate_completed', 'converted', 'closed'];
const INQUIRY_SOURCES = ['phone', 'website', 'referral', 'existing_customer', 'walk_in', 'other'];
const lifecycleFor = customer => LIFECYCLES.includes(customer?.lifecycle) ? customer.lifecycle : 'active';
const customerArchived = customer => customer?.isActive === false || !!customer?.deletedAt || ['inactive', 'archived', 'deleted'].includes(customer?.status);
const text = value => typeof value === 'string' ? value.trim() : '';
const normalized = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const phoneKey = value => { const digits = String(value || '').replace(/\D/g, ''); return digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits; };
function legacyAddress(customer = {}) {
  const nested = customer.address && typeof customer.address === 'object' ? customer.address : {};
  const street = text(typeof customer.address === 'string' ? customer.address : nested.street || nested.line1);
  return [street, ...[customer.city || nested.city, customer.state || nested.state, customer.zipCode || customer.postalCode || nested.zipCode || nested.postalCode].filter(value => text(value) && !normalized(street).includes(normalized(value)))].filter(Boolean).join(', ');
}
function propertiesFor(customer = {}) {
  const stored = Array.isArray(customer.serviceProperties) ? customer.serviceProperties.filter(row => row && typeof row.id === 'string' && row.id && !row.id.includes('/') && typeof row.address === 'string' && row.address.trim()) : [];
  const primaryId = customer.primaryPropertyId || 'legacy-primary', address = legacyAddress(customer), properties = new Map();
  if (address) properties.set('legacy-primary', { id: 'legacy-primary', revision: 0, label: 'home', address, unit: '', accessInstructions: text(customer.serviceInstructions),
    validated: customer.addressValidation?.source === 'google-address-validation', validationStatus: customer.addressValidation?.source === 'google-address-validation' ? 'verified' : 'unverified',
    ...(Number.isFinite(customer.latitude) && Math.abs(customer.latitude) <= 90 && Number.isFinite(customer.longitude) && Math.abs(customer.longitude) <= 180 ? { latitude: customer.latitude, longitude: customer.longitude } : {}),
    updatedAt: customer.updatedAt || null, legacy: true });
  stored.forEach(row => properties.set(row.id, { ...row, legacy: false }));
  return [...properties.values()].map(row => ({ ...row, isPrimary: row.id === primaryId })).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.id.localeCompare(b.id));
}
const propertyFor = (customer, id) => propertiesFor(customer).find(row => row.id === id) || null;
module.exports = { LIFECYCLES, INQUIRY_STATUSES, INQUIRY_SOURCES, lifecycleFor, customerArchived, propertiesFor, propertyFor, legacyAddress, normalized, phoneKey };
