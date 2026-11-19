const { deriveJobExceptions } = require('./jobExceptions');

const TERMINAL = new Set(['completed', 'cancelled', 'canceled', 'deleted', 'archived']);
const MISSED_STATUSES = new Set(['scheduled', 'en-route']);

function classifyManagementAttention(job = {}, options = {}) {
  const status = String(job.status || 'scheduled').toLowerCase();
  const unresolved = !job.deletedAt && !TERMINAL.has(status);
  if (!unresolved) return { missed: false, unassigned: false, reassignmentRequested: false, rescheduleRequired: false };
  const exception = deriveJobExceptions(job, options);
  // A missed visit is schedule-derived, not proof that a technician was absent:
  // its scheduled end has passed, the visit remains scheduled/en-route, and no
  // arrival or work-start evidence is confirmed. In-progress work is overdue,
  // but it is not classified as a missed appointment.
  const missed = MISSED_STATUSES.has(status) && exception.overdue && !exception.confirmedArrival && !exception.confirmedWorkStart;
  const reassignmentRequested = job.reassignmentRequest?.status === 'pending';
  const unassigned = !job.assignedTo;
  const rescheduleRequired = job.rescheduleRequired === true || job.schedulingAttention?.status === 'reschedule-required';
  return { missed, unassigned, reassignmentRequested, rescheduleRequired };
}

function summarizeManagementAttention(jobs = [], options = {}) {
  const categories = { missed: [], unassignedOrReassignment: [], rescheduleRequired: [] };
  const seen = Object.fromEntries(Object.keys(categories).map(key => [key, new Set()]));
  for (const job of jobs) {
    if (!job?.id) continue;
    const value = classifyManagementAttention(job, options);
    if (value.missed && !seen.missed.has(job.id)) { seen.missed.add(job.id); categories.missed.push(job.id); }
    if ((value.unassigned || value.reassignmentRequested) && !seen.unassignedOrReassignment.has(job.id)) { seen.unassignedOrReassignment.add(job.id); categories.unassignedOrReassignment.push(job.id); }
    if (value.rescheduleRequired && !seen.rescheduleRequired.has(job.id)) { seen.rescheduleRequired.add(job.id); categories.rescheduleRequired.push(job.id); }
  }
  const unique = new Set(Object.values(categories).flat());
  return {
    counts: {
      missed: categories.missed.length,
      unassignedOrReassignment: categories.unassignedOrReassignment.length,
      rescheduleRequired: categories.rescheduleRequired.length,
      totalUnique: unique.size,
    },
    jobIds: categories,
    generatedAt: new Date(Number.isFinite(new Date(options.now).getTime()) ? new Date(options.now).getTime() : Date.now()).toISOString(),
  };
}

module.exports = { classifyManagementAttention, summarizeManagementAttention };
