// Scope fields tracked for "changed from original" auditing on jobs.
export const TRACKED_FIELDS = [
  ['customerName', 'Customer'],
  ['serviceType', 'Service type'],
  ['date', 'Date'],
  ['time', 'Start time'],
  ['estimatedDuration', 'Duration (hrs)'],
  ['address', 'Address'],
  ['totalCost', 'Price'],
  ['priority', 'Priority'],
  ['notes', 'Notes']
];

const norm = (v) => (v === undefined || v === null ? '' : String(v).trim());

export const snapshotJob = (job) =>
  Object.fromEntries(TRACKED_FIELDS.map(([key]) => [key, job[key] ?? '']));

export function diffJob(before, after) {
  return TRACKED_FIELDS.reduce((acc, [key, label]) => {
    const from = key === 'totalCost' || key === 'estimatedDuration' ? Number(before[key] || 0) : norm(before[key]);
    const to = key === 'totalCost' || key === 'estimatedDuration' ? Number(after[key] || 0) : norm(after[key]);
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
