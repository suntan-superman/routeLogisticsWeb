import * as Crypto from 'expo-crypto';
import { auth } from '../constants/firebase';
import { getClaims, requireWorkspace } from './tenancy';
import { readWorkspace } from './workspaceApi';
import { offlineScope, isOffline, readCache, writeCache, saveJobOffline, queuedWork, getQueuedOperation, resolveOffline, flushOffline } from './offline';

const active = new Map();
const fail = (message, code = 'failed-precondition', operationId) => Object.assign(new Error(message), { code, operationId });
function validateJob(job, retry = false) {
  requireWorkspace();
  const claims = getClaims();
  if (!auth.currentUser?.emailVerified) throw fail('Verify your email and refresh your workspace before completing work.', 'permission-denied');
  if (!job?.id) throw fail('Reopen the job before completing it.');
  if (claims?.companyId ? job.companyId !== claims.companyId : job.companyId || job.userId !== auth.currentUser.uid) throw fail('This job does not belong to your current workspace.', 'permission-denied');
  if (claims?.role === 'technician' && job.assignedTo !== claims.membershipId) throw fail('This job is no longer assigned to you. Ask your manager to check its assignment.', 'permission-denied');
  if (!['scheduled', 'en-route', 'in-progress'].includes(job.status) && !(retry && job.status === 'completed')) throw fail(job.status === 'cancelled' ? 'This job was cancelled. A manager must reopen it before you can complete it.' : job.status === 'completed' ? 'This job is already completed. Refresh the job list.' : `This job cannot be completed from its current status (${job.status || 'unknown'}).`);
}
function completionFields(draft) {
  const actualWorkDone = String(draft?.actualWorkDone || '').trim(), completionNotes = String(draft?.completionNotes || '').trim();
  if (!actualWorkDone) throw fail('Describe the work completed before submitting.', 'invalid-argument');
  if (actualWorkDone.length > 10000 || completionNotes.length > 10000) throw fail('Work details and notes must each be at most 10,000 characters.', 'invalid-argument');
  const hours = String(draft?.actualHours ?? '').trim();
  if (hours && (!Number.isFinite(Number(hours)) || Number(hours) < 0 || Number(hours) > 744)) throw fail('Enter actual work hours between 0 and 744, or leave the optional field empty.', 'invalid-argument');
  return { status: 'completed', actualWorkDone, ...(hours ? { actualHours: Number(hours) } : {}), completionNotes };
}
async function outcome(operationId, jobId) {
  const operation = await getQueuedOperation(operationId);
  if (!operation) throw fail('The saved completion could not be found. Reopen this job and check saved work.', 'not-found', operationId);
  if (operation.state === 'failed' || operation.state === 'conflict') throw fail(operation.error || 'This job changed online. Review the current job before retrying this completion.', operation.errorCode || operation.state, operationId);
  if (operation.state === 'discarded') throw fail('This local completion was discarded. Reopen the job before submitting again.', 'failed-precondition', operationId);
  return { status: operation.state === 'synced' ? 'synced' : 'queued', operationId, jobId,
    message: operation.state === 'synced' ? 'Job completed and synchronized.' : operation.error ? `Completion is saved on this device. ${operation.error}` : 'Completion is saved on this device and awaiting authorized synchronization.' };
}
export function completeJob(job, draft, options = {}) {
  const scope = offlineScope(), key = `${scope}:${job?.id}`;
  if (active.has(key)) return active.get(key);
  const promise = (async () => {
    const fields = completionFields(draft);
    validateJob(job, !!options.retryOperationId);
    const offline = await isOffline();
    const current = offline ? job : (await readWorkspace('jobs', { id: job.id })).job;
    validateJob(current, !!options.retryOperationId);
    if (offlineScope() !== scope) throw fail('Your workspace changed. Reopen the job before submitting completion.', 'workspace-changed');
    let operationId = options.retryOperationId;
    if (operationId) {
      const previous = await getQueuedOperation(operationId);
      if (!previous || previous.kind !== 'job' || previous.jobId !== job.id || previous.patch?.status !== 'completed') throw fail('The saved completion does not belong to this job. Reopen the job and check saved work.', 'not-found');
      const previousFields = { ...previous.patch }; delete previousFields.completedAt;
      if (JSON.stringify(previousFields) !== JSON.stringify(fields)) throw fail('The completion details changed. Review or discard the earlier saved completion before submitting different details.', 'failed-precondition', operationId);
      if (previous.state === 'synced') return outcome(operationId, job.id);
      if (['failed', 'conflict'].includes(previous.state)) operationId = (await resolveOffline(operationId, 'retry')).operationId;
    } else {
      const matching = (await queuedWork()).find(row => row.kind === 'job' && row.jobId === job.id && row.patch?.status === 'completed' && !['synced', 'discarded'].includes(row.state));
      if (matching) {
        const previousFields = { ...matching.patch }; delete previousFields.completedAt;
        if (JSON.stringify(previousFields) !== JSON.stringify(fields)) throw fail('A completion is already saved for this job. Review it in saved work before submitting different details.', 'failed-precondition', matching.id);
        if (['failed', 'conflict'].includes(matching.state)) return outcome(matching.id, job.id);
        operationId = matching.id;
      } else {
        const bases = await readCache('job-bases', scope) || {};
        bases[job.id] = current; await writeCache('job-bases', bases, scope);
        operationId = Crypto.randomUUID();
        await saveJobOffline(job.id, { ...fields, completedAt: new Date().toISOString() }, { operationId });
      }
    }
    if (!offline) {
      try { await flushOffline(); }
      catch (error) { throw fail(error.message || 'Completion was saved, but synchronization could not finish. Check saved work and retry.', error.code || 'sync-failed', operationId); }
    }
    return outcome(operationId, job.id);
  })().finally(() => { active.delete(key); });
  active.set(key, promise);
  return promise;
}
