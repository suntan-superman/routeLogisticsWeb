// Storage-independent queue mechanics are exercised with restart and race tests.
function createQueue(storage, key, notify = () => {}) {
  let tail = Promise.resolve();
  const edit = (change) => {
    const work = tail.then(async () => { const rows = JSON.parse(await storage.getItem(key) || '[]'); const result = await change(rows); await storage.setItem(key, JSON.stringify(rows)); notify(); return result; });
    tail = work.catch(() => {}); return work;
  };
  return {
    read: async () => { await tail; return JSON.parse(await storage.getItem(key) || '[]'); },
    add: (row) => edit((rows) => { if (!rows.some((entry) => entry.id === row.id)) rows.push({ ...row, state: 'pending', attempts: 0, nextAttempt: 0 }); }),
    edit,
    patch: (id, values) => edit((rows) => { const row = rows.find((entry) => entry.id === id); if (row) Object.assign(row, values); }),
  };
}
const retryDelay = (attempt) => Math.min(300000, 2000 * 2 ** Math.max(0, attempt - 1));
const revisionOperation = row => ['job', 'visit'].includes(row.kind);
const compatibleJobState = job => {
  if (!job || typeof job !== 'object') return null;
  const address = job.address && typeof job.address === 'object' ? job.address : {};
  const value = key => job[key] ?? address[key] ?? null;
  return {
    customerId: job.customerId ?? null,
    serviceType: job.serviceType ?? job.serviceName ?? null,
    serviceCategory: job.serviceCategory ?? null,
    servicePropertyId: job.servicePropertyId ?? null,
    date: job.date ?? null,
    time: job.time ?? null,
    windowStart: job.windowStart ?? null,
    windowEnd: job.windowEnd ?? null,
    duration: job.estimatedDuration ?? job.duration ?? null,
    address: typeof job.address === 'string' ? job.address : address.line1 ?? address.street ?? null,
    city: value('city'),
    state: value('state'),
    zipCode: job.zipCode ?? job.postalCode ?? address.zipCode ?? address.postalCode ?? null,
    appointmentKind: job.appointmentKind ?? null,
  };
};
function linkRevision(rows, row) {
  row.baseVersion = row.expectedVersion;
  const previous = [...rows].reverse().find(other => other.jobId === row.jobId && revisionOperation(other) && other.state !== 'discarded');
  if (!previous || ![previous.baseVersion, previous.expectedVersion, previous.serverVersion].includes(row.expectedVersion)) return row;
  if (previous.state === 'synced' && previous.serverVersion) row.expectedVersion = previous.serverVersion;
  else if (previous.state !== 'synced') row.versionDependency = previous.id;
  return row;
}
function advanceRevision(rows, row, version) {
  if (!version || !revisionOperation(row)) return;
  // Only a captured dependency may inherit the acknowledged revision. Never
  // refresh an unrelated stale event against whichever server version is newer.
  for (const next of rows) if (next.versionDependency === row.id && !next.submittedAt && next.state === 'pending') next.expectedVersion = version;
}
function restoreLegacyDependencies(rows) {
  const previous = new Map();
  for (const row of rows) {
    if (!revisionOperation(row) || row.state === 'discarded') continue;
    if (!Object.hasOwn(row,'baseVersion')) {
      row.baseVersion=row.expectedVersion;
      const prior=previous.get(row.jobId);
      // Older releases serialized these unsent job changes and propagated the
      // acknowledged revision. Recover only that same-baseline relationship;
      // attempted operations keep their immutable request/fingerprint.
      if(row.kind==='job'&&row.state==='pending'&&!row.submittedAt&&!row.attempts&&prior?.kind==='job'&&prior.state!=='synced'&&row.expectedVersion===prior.baseVersion)row.versionDependency=prior.id;
    }
    previous.set(row.jobId,row);
  }
}
function repairCompletionAfterDeparture(rows, completionId, replacementId) {
  const completion = rows.find(row => row.id === completionId);
  if (!completion || completion.kind !== 'job' || completion.patch?.status !== 'completed'
    || !['failed', 'conflict'].includes(completion.state) || completion.patch?.departureExceptionReason
    || !/depart/i.test(String(completion.error || ''))) return null;
  const departure = [...rows].reverse().find(row => row.jobId === completion.jobId && row.kind === 'visit'
    && row.record?.type === 'departed' && row.state !== 'discarded');
  if (!departure || typeof replacementId !== 'string' || rows.some(row => row.id === replacementId)) return null;

  const completionIndex = rows.indexOf(completion);
  const predecessor = rows.slice(0, completionIndex).reverse().find(row => row.jobId === completion.jobId
    && revisionOperation(row) && row.state !== 'discarded');

  // A completion rejected before its retained departure was acknowledged must
  // not keep that evidence behind itself. Restore the departure after the last
  // operation that actually preceded the failed completion. This is important
  // when an arrival or work note already advanced the server revision. The visit
  // identity, captured time and evidence remain unchanged; only the stale
  // completion request receives a new identity.
  if (departure.versionDependency === completion.id && !departure.submittedAt) {
    delete departure.versionDependency;
  }
  if (!departure.submittedAt && predecessor) {
    departure.expectedVersion = predecessor.state === 'synced' && predecessor.serverVersion
      ? predecessor.serverVersion : predecessor.expectedVersion ?? predecessor.baseVersion ?? departure.expectedVersion;
    if (predecessor.state !== 'synced') departure.versionDependency = predecessor.id;
    else delete departure.versionDependency;
  } else if (!departure.submittedAt) departure.expectedVersion = completion.expectedVersion ?? completion.baseVersion ?? departure.expectedVersion;
  departure.baseVersion ??= completion.baseVersion ?? completion.expectedVersion ?? departure.expectedVersion;
  if (['failed', 'conflict'].includes(departure.state)) {
    departure.state = 'pending'; departure.attempts = 0; departure.nextAttempt = 0;
    departure.error = ''; departure.errorCode = null;
  } else if (departure.state === 'pending') departure.nextAttempt = 0;

  const expectedVersion = departure.state === 'synced' && departure.serverVersion
    ? departure.serverVersion : departure.expectedVersion ?? completion.expectedVersion ?? completion.baseVersion;
  const replacement = {
    ...completion, id: replacementId, expectedVersion, baseVersion: expectedVersion,
    state: 'pending', attempts: 0, nextAttempt: 0, error: '', errorCode: null,
    originalOperationId: completion.originalOperationId || completion.id,
    replacedAt: Date.now(),
  };
  delete replacement.server; delete replacement.serverVersion; delete replacement.submittedAt;
  if (departure.state !== 'synced') replacement.versionDependency = departure.id;
  else delete replacement.versionDependency;

  completion.state = 'discarded'; completion.supersededBy = replacementId;
  completion.supersededReason = 'departure-prerequisite';
  for (const row of rows) if (row !== departure && row.versionDependency === completion.id) row.versionDependency = replacementId;
  rows.push(replacement);
  return { operationId: replacementId, departureId: departure.id };
}
function prepareAutomaticRecovery(rows, idFactory, recoveryVersion = 2) {
  const repaired = [];
  for (const completion of [...rows]) {
    if (completion.kind !== 'job' || completion.patch?.status !== 'completed' || !['failed', 'conflict'].includes(completion.state)) continue;
    const result = repairCompletionAfterDeparture(rows, completion.id, idFactory());
    if (result) repaired.push(result);
  }
  for (const row of rows) {
    // Only a structured optimistic-concurrency response is eligible. Permission
    // failures, missing jobs and closed jobs never receive an automatic retry.
    // The updated server protocol will recheck membership, assignment and job
    // state before accepting this unchanged append-only evidence.
    if (row.kind !== 'visit' || row.state !== 'conflict' || !row.serverVersion || Number(row.automaticRecoveryVersion || 0) >= recoveryVersion) continue;
    row.reconciliationHistory = [...(row.reconciliationHistory || []), {
      expectedVersion: row.expectedVersion ?? null,
      serverVersion: row.serverVersion,
      recordedAt: Date.now(),
    }];
    row.automaticRecoveryVersion = recoveryVersion;
    row.state = 'pending'; row.attempts = 0; row.nextAttempt = 0;
    row.error = ''; row.errorCode = null;
    delete row.submittedAt;
  }
  return repaired;
}
module.exports = { createQueue, retryDelay, revisionOperation, compatibleJobState, linkRevision, advanceRevision, restoreLegacyDependencies, repairCompletionAfterDeparture, prepareAutomaticRecovery };
