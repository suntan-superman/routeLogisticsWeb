// Pure helpers for job-assignment push notifications (kept free of Firebase for unit testing).

// Returns the team member id to notify, or null when nothing should be sent.
// The member must belong to the same company as the job so assignments never leak across tenants.
function assignmentTarget(before, after, member) {
  if (!after || !after.assignedTo || before?.assignedTo === after.assignedTo) return null;
  if (!member || !member.uid || member.status !== 'active') return null;
  if ((member.companyId || null) !== (after.companyId || null)) return null;
  return member.uid;
}

function buildAssignmentMessage(job, jobId) {
  const when = [job.date, job.time].filter(Boolean).join(' ');
  return {
    title: 'New job assigned',
    body: [job.serviceType || 'Service', job.customerName, when].filter(Boolean).join(' · '),
    data: { type: 'job-assigned', jobId: String(jobId), url: '/jobs' },
  };
}

// FCM error codes that mean the stored token is permanently invalid and should be removed.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

module.exports = { assignmentTarget, buildAssignmentMessage, DEAD_TOKEN_CODES };
