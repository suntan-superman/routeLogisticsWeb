const text = (value) => typeof value === 'string' ? value.trim() : '';
export function customerName(data = {}) {
  return [data.name, data.displayName, data.fullName, data.customerName,
    [text(data.firstName), text(data.lastName)].filter(Boolean).join(' '), data.businessName]
    .map(text).find(Boolean) || '';
}
export function legacyDate(value) {
  if (value == null || value === '') return null;
  let date;
  try {
    if (value instanceof Date) date = new Date(value.getTime());
    else if (typeof value?.toDate === 'function') date = value.toDate();
    else if (typeof value === 'object' && Number.isFinite(value.seconds ?? value._seconds)) date = new Date((value.seconds ?? value._seconds) * 1000);
    else if (typeof value === 'number' && Number.isFinite(value)) date = new Date(Math.abs(value) < 1e11 ? value * 1000 : value);
    else if (typeof value === 'string') {
      const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
      const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!iso && !us) return null;
      const [year, month, day] = iso ? iso.slice(1, 4).map(Number) : [Number(us[3]), Number(us[1]), Number(us[2])];
      const check = new Date(Date.UTC(year, month - 1, day, 12));
      if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
      date = iso && value.includes('T') ? new Date(value) : new Date(year, month - 1, day, 12);
    }
  } catch { return null; }
  return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
}
export const formatCustomerDate = (value) => legacyDate(value)?.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) || '—';
export const customerActive = (data) => data.isActive !== false && !data.deletedAt && !['inactive', 'deleted', 'archived'].includes(data.status);
export function customerView(id, data) {
  const address = typeof data.address === 'string' ? data.address : text(data.address?.street || data.address?.line1);
  return { ...data, id, name: customerName(data), phone: text(data.phone) || text(data.phoneNumber), address,
    isActive: customerActive(data), totalSpent: Number.isFinite(Number(data.totalSpent)) ? Number(data.totalSpent) : 0 };
}
