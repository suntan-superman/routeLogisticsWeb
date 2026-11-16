import * as Crypto from 'expo-crypto';
import { callWorkspace } from './workspaceApi';

export const newExceptionOperationId = () => Crypto.randomUUID();
export const requestJobReassignment = (job, { reason, notes, operationId }) => callWorkspace('rlJobException', {
  action: 'request', jobId: job.id, expectedVersion: job.updatedAt || null,
  operationId, reason, notes: notes.trim(),
});
export const reviewJobReassignment = (job, { action, explanation, operationId }) => callWorkspace('rlJobException', {
  action, jobId: job.id, requestId: job.reassignmentRequest.id,
  expectedVersion: job.updatedAt || null, expectedRevision: job.reassignmentRequest.revision,
  operationId, explanation: explanation.trim(),
});

export function canRequestReassignment(job, user, permissions) {
  if (!user?.emailVerified || !user.companyId || job?.companyId !== user.companyId || !permissions?.canAccess || !permissions.can?.('jobs.work')) return false;
  if (!job.id || ['completed', 'cancelled', 'canceled'].includes(job.status)) return false;
  if (job.assignedToUid && job.assignedToUid !== user.id) return false;
  return !!job.assignedTo && (job.assignedTo === user.membershipId || job.assignedToUid === user.id);
}
