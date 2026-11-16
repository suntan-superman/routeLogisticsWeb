import * as Crypto from 'expo-crypto';
import { auth } from '../constants/firebase';
import { getClaims, requireWorkspace } from './tenancy';
import { offlineScope, offlineVersion, saveJobOffline, getQueuedOperation, resolveOffline, isOffline, flushOffline } from './offline';
import { ESTIMATE_OUTCOMES, isEstimateVisit } from './estimateVisitPolicy';

const active = new Map();
const failure = (message, operationId) => Object.assign(new Error(message), { operationId });
export function saveEstimateVisitOutcome(job, estimateOutcome, { retryOperationId } = {}) {
  const scope = offlineScope(), key = `${scope}:${job?.id}`;
  if (active.has(key)) return active.get(key);
  const promise = (async () => {
    requireWorkspace(); const claims = getClaims(), uid = auth.currentUser?.uid;
    if (!auth.currentUser?.emailVerified || !claims?.companyId || !['owner','admin','manager','technician'].includes(claims.role) || !job?.id || job.companyId !== claims.companyId
      || claims.role === 'technician' && (job.assignedTo !== claims.membershipId || job.assignedToUid && job.assignedToUid !== uid)) throw failure('Your verified company workspace and current job assignment are required.');
    if (!isEstimateVisit(job) || !Object.hasOwn(ESTIMATE_OUTCOMES, estimateOutcome)) throw failure('Choose a valid outcome for an estimate visit.');
    if (['cancelled', 'canceled'].includes(job.status)) throw failure('This visit was cancelled. Review its outcome with your manager.');
    let operationId = retryOperationId;
    if (operationId) {
      const previous = await getQueuedOperation(operationId);
      if (!previous || previous.kind !== 'job' || previous.jobId !== job.id || previous.patch?.estimateOutcome !== estimateOutcome) throw failure('The saved outcome belongs to a different change. Review saved work before retrying.');
      if (['failed', 'conflict'].includes(previous.state)) operationId = (await resolveOffline(operationId, 'retry')).operationId;
    }
    if (offlineScope() !== scope) throw failure('Your workspace changed. Reopen the visit before saving its outcome.');
    operationId ||= Crypto.randomUUID();
    await saveJobOffline(job.id, { estimateOutcome }, { operationId, expectedScope: scope, expectedVersion: offlineVersion(job.updatedAt), baseJob: job });
    if (!(await isOffline())) await flushOffline();
    if (offlineScope() !== scope) throw failure('Your workspace changed. The outcome is retained in its original workspace.', operationId);
    const saved = await getQueuedOperation(operationId);
    if (!saved || ['failed', 'conflict', 'discarded'].includes(saved.state)) throw failure(saved?.error || 'The saved outcome needs review. Your selection remains available to retry.', operationId);
    return { operationId, estimateOutcome, status: saved.state === 'synced' ? 'synced' : 'queued',
      message: saved.state === 'synced' ? 'Estimate outcome saved to server.' : 'Estimate outcome saved on this device — waiting to sync.' };
  })().finally(() => active.delete(key));
  active.set(key, promise); return promise;
}
