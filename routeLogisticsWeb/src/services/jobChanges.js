// Scope fields tracked for "changed from original" auditing on jobs.
export const TRACKED_FIELDS = [
  ['customerId', 'Customer record'],
  ['customerName', 'Customer'],
  ['serviceType', 'Service type'],
  ['date', 'Date'],
  ['time', 'Start time'],
  ['estimatedDuration', 'Duration (hrs)'],
  ['address', 'Address'],
  ['serviceProperty', 'Service property'],
  ['serviceCategory', 'Service category'],
  ['serviceAreaExceptionId', 'Out-of-area approval'],
  ['totalCost', 'Price'],
  ['priority', 'Priority'],
  ['notes', 'Notes']
];

const norm = (v) => (v === undefined || v === null ? '' : String(v).trim());
const geographyFields = new Set(['serviceProperty', 'serviceCategory', 'serviceAreaExceptionId']);
const propertyAddress = value => norm(typeof value === 'object' && value ? value.address || value.formattedAddress : value);

export const snapshotJob = (job) =>
  Object.fromEntries(TRACKED_FIELDS.map(([key]) => [key, job[key] ?? '']));

export function diffJob(before, after) {
  return TRACKED_FIELDS.reduce((acc, [key, label]) => {
    // An ordinary legacy edit does not remove or recertify a stored geography
    // snapshot simply because those optional fields were omitted by the form.
    if (geographyFields.has(key) && !Object.hasOwn(after, key)) return acc;
    const from = key === 'serviceProperty' ? propertyAddress(before[key]) : key === 'totalCost' || key === 'estimatedDuration' ? Number(before[key] || 0) : norm(before[key]);
    const to = key === 'serviceProperty' ? propertyAddress(after[key]) : key === 'totalCost' || key === 'estimatedDuration' ? Number(after[key] || 0) : norm(after[key]);
    if (from !== to) acc.push({ field: key, label, from: before[key] ?? '', to: after[key] ?? '' });
    return acc;
  }, []);
}

// Returns the Firestore updates for an edit, or null when nothing changed.
export function buildJobEdit(job, next, { by, reason, now = new Date().toISOString() }) {
  const changes = diffJob(job, next);
  if (!changes.length) return null;
  const revision = { at: now, by: by || 'Unknown', reason: norm(reason), changes };
  return {
    ...next,
    isModified: true,
    originalDetails: job.originalDetails || snapshotJob(job),
    lastModifiedAt: now,
    revisions: [...(job.revisions || []), revision].slice(-50)
  };
}
