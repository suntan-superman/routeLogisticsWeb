const ADDRESS_FIELDS = ['address', 'city', 'state', 'zipCode', 'postalCode', 'serviceProperty', 'propertyAddress'];
const text = value => typeof value === 'string' ? value.trim() : '';
function recordVersion(value) {
  if (typeof value === 'string') return value;
  const seconds = value?.seconds ?? value?._seconds;
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : Number.isFinite(seconds) ? new Date(seconds * 1000 + (value.nanoseconds || value._nanoseconds || 0) / 1e6) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function formatSavedAddress(data = {}) {
  const address = typeof data.address === 'string' ? data.address.trim() : text(data.address?.street || data.address?.line1);
  const city = text(data.city || data.address?.city), state = text(data.state || data.address?.state), zip = text(data.zipCode || data.postalCode || data.address?.zipCode || data.address?.postalCode);
  const normalize = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const locality = [city, state, zip].filter(Boolean).join(' ');
  if (locality && normalize(address).endsWith(normalize(locality))) return address;
  return [address, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}
function addressMutationError(failure, fallback) {
  const source = failure?.details?.addressValidation;
  const validation = source && ['confirmation-required', 'invalid', 'unavailable'].includes(source.status)
    ? { status: source.status, message: text(source.message) || fallback, ...(text(source.suggestedAddress) ? { suggestedAddress: source.suggestedAddress.trim() } : {}) } : null;
  return { success: false, error: { message: validation?.message || failure?.message || fallback, code: failure?.code, ...(validation ? { addressValidation: validation } : {}) } };
}
const hasAddressFields = value => ADDRESS_FIELDS.some(key => Object.hasOwn(value || {}, key));
module.exports = { recordVersion, formatSavedAddress, addressMutationError, hasAddressFields };
