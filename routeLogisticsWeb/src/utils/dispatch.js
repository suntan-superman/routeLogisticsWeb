export const STATUS_COLORS = { scheduled: '#2563eb', 'en-route': '#7c3aed', 'in-progress': '#d97706', completed: '#059669', cancelled: '#6b7280' };
export function scheduleWarning(job, now = new Date(), timeZone) {
  if (['completed', 'cancelled'].includes(job.status) || !/^\d{4}-\d{2}-\d{2}$/.test(job.date || '')) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { ...(timeZone ? { timeZone } : {}), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (job.date < day) return 'Past service date';
  if (job.date !== day) return '';
  const minutes = value => /^\d{2}:\d{2}$/.test(value || '') ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
  const current = Number(parts.hour) * 60 + Number(parts.minute), start = minutes(job.windowStart || job.time), end = minutes(job.windowEnd);
  if (end !== null && current > end) return 'Service window passed';
  if (start !== null && current > start && ['scheduled', 'en-route'].includes(job.status)) return 'Scheduled start passed';
  return '';
}
export function jobPosition(job) {
  const lat = job.latitude ?? job.location?.lat, lng = job.longitude ?? job.location?.lng;
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
export const jobAddress = job => [job.address, job.city, job.state, job.zipCode].filter(value => typeof value === 'string' && value.trim()).join(', ');
