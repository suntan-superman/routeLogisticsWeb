function timeMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return 24 * 60;
  let hour = Number(match[1]), minute = Number(match[2]);
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return hour < 24 && minute < 60 ? hour * 60 + minute : 24 * 60;
}
function sortJobs(jobs = []) {
  return [...jobs].sort((a,b) => String(a.date || '').localeCompare(String(b.date || ''))
    || timeMinutes(a.time) - timeMinutes(b.time) || String(a.id).localeCompare(String(b.id)));
}
function nextJob(jobs = []) {
  const sorted = sortJobs(jobs);
  return sorted.find(job => job.status === 'in-progress') || sorted.find(job => job.status === 'en-route')
    || sorted.find(job => job.status === 'scheduled') || null;
}
function groupJobs(jobs = []) {
  const groups = new Map();
  for (const job of sortJobs(jobs)) {
    const date = job.date || 'Date not set';
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(job);
  }
  return [...groups].map(([date, jobs]) => ({ date, jobs }));
}
function dayLabel(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return day || 'Date not set';
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function normalizeJobLocation(job, customer) {
  if (!job) return job;
  const text = value => typeof value === 'string' ? value.trim() : '';
  const ownAddress = job.address && typeof job.address === 'object' ? job.address : null;
  const customerAddress = customer?.address && typeof customer.address === 'object' ? customer.address : null;
  const ownStreet = text(job.address) || text(ownAddress?.street) || text(ownAddress?.line1);
  const customerStreet = text(customer?.address) || text(customerAddress?.street) || text(customerAddress?.line1);
  const useCustomerLocation = !ownStreet;
  // Customer detail is already authorized by the workspace endpoint. Copy only
  // contact and service-location fields; never merge a customer document into a job.
  const normalized = { ...job, address: ownStreet || customerStreet,
    customerName: text(job.customerName) || text(customer?.name) || [text(customer?.firstName), text(customer?.lastName)].filter(Boolean).join(' '),
    customerPhone: text(job.customerPhone) || text(customer?.phone) || text(customer?.phoneNumber),
    serviceInstructions: text(job.serviceInstructions) || text(customer?.serviceInstructions),
  };
  for (const field of ['city', 'state', 'zipCode']) normalized[field] = text(job[field]) || text(ownAddress?.[field])
    || (useCustomerLocation ? text(customer?.[field]) || text(customerAddress?.[field]) : '');
  if (useCustomerLocation) {
    const lat = customer?.latitude ?? customer?.location?.latitude ?? customer?.location?.lat;
    const lng = customer?.longitude ?? customer?.location?.longitude ?? customer?.location?.lng;
    if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      && job.latitude == null && job.longitude == null && !job.location) Object.assign(normalized, { latitude: lat, longitude: lng });
  }
  return normalized;
}
function jobDestination(job) {
  const lat = job?.latitude ?? job?.location?.lat, lng = job?.longitude ?? job?.location?.lng;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return `${lat},${lng}`;
  return [job?.address, job?.city, job?.state, job?.zipCode].filter(value => typeof value === 'string' && value.trim()).join(', ');
}
const navigationUrl = job => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(jobDestination(job))}&travelmode=driving`;
module.exports = { timeMinutes, sortJobs, nextJob, groupJobs, dayLabel, normalizeJobLocation, jobDestination, navigationUrl };
