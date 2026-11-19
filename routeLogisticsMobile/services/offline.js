import { readWorkspace, callWorkspace } from './workspaceApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { auth } from '../constants/firebase';
import { AppState } from 'react-native';
import { getClaims, tenantFields, requireWorkspace } from './tenancy';
import { createQueue, retryDelay, revisionOperation, compatibleJobState, linkRevision, advanceRevision, restoreLegacyDependencies, repairCompletionAfterDeparture, prepareAutomaticRecovery } from './offlineQueueCore';
import { createWorkNoteDraftStore } from './workNoteDraftCore';
import { recordOfflineTiming } from './offlineTimings';

const queues = new Map(), draining = new Map(), listeners = new Set();
const pausedAccounts = new Set(), writing = new Map();
const noteDraftStores = new Map();
const timingKind = row => {
  if (row.kind === 'job' && row.patch?.status === 'completed') return 'completion';
  if (row.kind === 'job' && Object.hasOwn(row.patch || {}, 'notes')) return 'notes';
  if (row.kind === 'service-form') return 'checklist';
  if (row.kind === 'visit' && row.record?.type === 'arrived') return 'arrival';
  if (row.kind === 'visit' && row.record?.type === 'departed') return 'departure';
  return row.kind;
};
const accountPrefix = uid => `rl-offline-v1:${auth.app.options.projectId}:${uid}:`;
const pausedScope = scope => [...pausedAccounts].some(uid => scope.startsWith(accountPrefix(uid)));
function trackWrite(uid, task) {
  if (!writing.has(uid)) writing.set(uid, new Set());
  writing.get(uid).add(task);
  return task.finally(() => { writing.get(uid)?.delete(task); });
}
function saveWork(change) {
  const uid = auth.currentUser?.uid;
  if (!uid || pausedAccounts.has(uid)) return Promise.reject(new Error('Account deletion is in progress. Saved work cannot change until it finishes.'));
  const task = Promise.resolve().then(change);
  return trackWrite(uid, task);
}
export const offlineVersion = (v) => v instanceof Date ? v.toISOString() : v?.toDate ? v.toDate().toISOString() : v?.seconds != null ? new Date(v.seconds * 1000 + (v.nanoseconds || 0) / 1e6).toISOString() : v || null;
export const isOffline = async () => { const net = await NetInfo.fetch(); return net.isConnected === false || net.isInternetReachable === false; };
export function offlineScope() {
  requireWorkspace();
  const claims = getClaims();
  // Role and assignment changes cannot expose a previous manager's cached jobs.
  return `rl-offline-v1:${auth.app.options.projectId}:${auth.currentUser.uid}:${claims?.companyId || 'personal'}:${claims?.role || 'owner'}:${claims?.membershipId || ''}`;
}
export function subscribeOffline(callback) { listeners.add(callback); return () => listeners.delete(callback); }
function notify() { listeners.forEach((callback) => { try { callback()?.catch?.(() => {}); } catch { /* UI listeners cannot fail a persisted operation. */ } }); }
function queue(scope = offlineScope()) { if (!queues.has(scope)) queues.set(scope, createQueue(AsyncStorage, `${scope}:queue`, notify)); return queues.get(scope); }
export const queuedWork = () => queue().read();
export const getQueuedOperation = async id => (await queuedWork()).find(row => row.id === id) || null;
export const readCache = async (name, scope = offlineScope()) => JSON.parse(await AsyncStorage.getItem(`${scope}:cache:policy2:${name}`) || 'null');
export const writeCache = (name, data, scope = offlineScope()) => pausedScope(scope) ? Promise.resolve() : trackWrite(scope.split(':')[2], AsyncStorage.setItem(`${scope}:cache:policy2:${name}`, JSON.stringify(data)));
export async function cachedRead(name, loader) {
  const scope = offlineScope();
  if (await isOffline()) { const cached = await readCache(name, scope); if (cached == null) throw new Error('Open this view online once to save it for offline use.'); return cached; }
  // Never use cached private records to conceal an online permission error.
  const result = await loader(scope);
  if (offlineScope() !== scope) throw new Error('Your workspace changed. Reload this view.');
  await writeCache(name, result, scope); return result;
}
export async function overlayJobs(jobs) {
  const rows = await queuedWork();
  return jobs.map((saved) => {
    let job = saved;
    // Notes and outcomes may be acknowledged in separate operations. Replay
    // each confirmed field against the incoming version so the newest outcome
    // cannot hide an earlier saved note when an old snapshot is restored.
    for (const confirmed of rows.filter(row => row.kind === 'job' && row.jobId === saved.id && row.state === 'synced' && row.serverVersion)) {
      if (!versionAtMost(saved.updatedAt, confirmed.serverVersion)) continue;
      if (Object.hasOwn(confirmed.patch || {}, 'estimateOutcome')) job = { ...job, ...confirmed.patch };
      if (Object.hasOwn(confirmed.patch || {}, 'notes')) job = canonicalNotes(job, confirmed.patch.notes);
    }
    return rows.filter((row) => row.kind === 'job' && row.jobId === job.id && !['discarded', 'synced'].includes(row.state)).reduce((current, row) => ({
    ...current, ...(['pending', 'syncing'].includes(row.state) ? row.patch : {}),
    ...(row.patch?.status === 'completed' ? { status: saved.status, serverStatus: saved.status, localCompletionPending: true } : {}),
    syncState: row.state, syncOperationId: row.id, syncError: row.error || '', syncErrorCode: row.errorCode || null, syncPatch: row.patch,
  }), job); });
}
function versionAtMost(value, maximum) {
  const normalized = offlineVersion(value), limit = offlineVersion(maximum);
  if (normalized == null || normalized === limit) return true;
  const a = typeof normalized === 'number' ? normalized : Date.parse(normalized), b = typeof limit === 'number' ? limit : Date.parse(limit);
  return Number.isFinite(a) && Number.isFinite(b) && a <= b;
}
function canonicalNotes(job, text, scope = offlineScope()) {
  // For technicians notes is a legacy work-log alias. Other roles keep their
  // dispatcher notes intact and receive the canonical workNotes field only.
  return { ...job, workNotes: text, ...(scope.split(':')[4] === 'technician' ? { notes: text } : {}) };
}
function noteStore(scope, jobId) {
  if (typeof jobId !== 'string' || !jobId || jobId.length > 200 || jobId.includes('/')) throw new Error('Reopen a valid job before saving work notes.');
  const key = `${scope}:draft:work-notes:${jobId}`;
  if (!noteDraftStores.has(key)) noteDraftStores.set(key, createWorkNoteDraftStore(AsyncStorage, key));
  return noteDraftStores.get(key);
}
const draftState = row => ({ jobId: row.jobId, text: row.patch.notes, revision: row.workNoteDraft?.revision || row.id, operationId: row.id,
  editedAt: row.workNoteDraft?.editedAt || row.createdAt, baseVersion: row.baseVersion ?? row.expectedVersion ?? null,
  serverVersion: row.serverVersion || null, state: row.state, dirty: false, error: row.error || '' });
const submittedNote = (rows, snapshot) => [...rows].reverse().find(row => row.kind === 'job' && row.jobId === snapshot.jobId && row.state !== 'discarded'
  && (row.id === snapshot.operationId || row.workNoteDraft?.revision === snapshot.revision) && Object.hasOwn(row.patch || {}, 'notes') && row.patch.notes === snapshot.text);
export async function readWorkNoteDraft(jobId) {
  const scope = offlineScope(), stored = await noteStore(scope, jobId).read(), rows = await queue(scope).read();
  if (offlineScope() !== scope) throw new Error('Your workspace changed. Reopen work notes under the current account.');
  if (stored && stored.state !== 'discarded') {
    const submitted = submittedNote(rows, stored);
    return submitted ? { ...stored, ...draftState(submitted), revision: stored.revision } : stored;
  }
  const saved = [...rows].reverse().find(row => row.kind === 'job' && row.jobId === jobId && Object.hasOwn(row.patch || {}, 'notes') && row.state !== 'discarded');
  return saved ? draftState(saved) : null;
}
export function persistWorkNoteDraft(job, text, { editedAt = Date.now() } = {}) {
  try {
    const timing = Date.now();
    const scope = offlineScope(), uid = auth.currentUser?.uid, claims = getClaims();
    if (pausedScope(scope)) throw new Error('Account deletion is in progress. Work notes remain on this screen.');
    if (!auth.currentUser?.emailVerified || typeof text !== 'string' || text.length > 10000 || !Number.isFinite(editedAt)
      || !job?.id || (claims?.companyId ? job.companyId !== claims.companyId : job.companyId || job.userId !== uid)
      || claims?.role === 'technician' && (job.assignedTo !== claims.membershipId || job.assignedToUid && job.assignedToUid !== uid)) throw new Error('Your verified job assignment and work notes of at most 10,000 characters are required.');
    const store = noteStore(scope, job.id), previous = store.peek(), revision = Crypto.randomUUID();
    const record = { jobId: job.id, userId: uid, companyId: claims?.companyId || null, membershipId: claims?.membershipId || null, role: claims?.role || 'owner',
      text, editedAt, revision, operationId: revision, baseVersion: previous?.state === 'draft' ? previous.baseVersion : offlineVersion(job.updatedAt),
      jobBase: { ...Object.fromEntries(['customerId','customerName','serviceType','serviceName','date','time','estimatedDuration','duration','address','serviceAddress','serviceProperty','location','workNotes','notes','dispatchNotes','appointmentKind','billable','estimateOutcome','inquiryId','servicePropertyId','propertyAccessInstructions','serviceInstructions'].filter(key=>job[key]!==undefined).map(key=>[key,job[key]])),
        id: job.id, companyId: job.companyId || null, userId: job.userId || uid, assignedTo: job.assignedTo || null, assignedToUid: job.assignedToUid || null, status: job.status, updatedAt: offlineVersion(job.updatedAt) },
      state: 'draft', dirty: true };
    return trackWrite(uid, store.persist(record).then(saved => { recordOfflineTiming('notes','local-save',timing); return saved; }));
  } catch (error) { return Promise.reject(error); }
}
export const saveWorkNoteDraft = (jobId, { revision } = {}) => {
  let requestedScope;try{requestedScope=offlineScope();}catch(error){return Promise.reject(error);}
  return saveWork(async () => {
  if (offlineScope() !== requestedScope) throw new Error('Your workspace changed. Reopen work notes before saving.');
  const scope = requestedScope, store = noteStore(scope, jobId), snapshot = await store.read();
  if (offlineScope() !== scope) throw new Error('Your workspace changed. Reopen work notes before saving.');
  if (!snapshot || snapshot.state === 'discarded') throw new Error('No retained work-note draft is available. Edit the note and save again.');
  if (revision && revision !== snapshot.revision) throw new Error('The work-note draft changed. Save the latest text instead of an older revision.');
  // An explicit conflict review can assign a new queue identity. Re-saving the
  // same captured revision must follow that operation, never recreate its old ID.
  const submitted = submittedNote(await queue(scope).read(), snapshot);
  if (offlineScope() !== scope) throw new Error('Your workspace changed. Reopen work notes before saving.');
  const result = await saveJobOffline(jobId, { notes: snapshot.text }, { expectedScope:scope,operationId: submitted?.id || snapshot.operationId, expectedVersion: submitted?.expectedVersion ?? snapshot.baseVersion, baseJob: snapshot.jobBase,
    workNoteDraft: { revision: snapshot.revision, editedAt: snapshot.editedAt } });
  await store.compareAndSet(snapshot.revision, current => current.state === 'synced' ? current : { ...current, state: 'pending', dirty: false });
  return { ...result, revision: snapshot.revision, editedAt: snapshot.editedAt, text: snapshot.text };
  });
};
export const discardWorkNoteDraft = (jobId, { revision } = {}) => {
  let requestedScope;try{requestedScope=offlineScope();}catch(error){return Promise.reject(error);}
  return saveWork(async () => {
  if (offlineScope() !== requestedScope) throw new Error('Your workspace changed. Reopen the current work-note draft.');
  const scope = requestedScope, store = noteStore(scope, jobId), current = await store.read();
  if (offlineScope() !== scope) throw new Error('Your workspace changed. Reopen the current work-note draft.');
  if (!current || current.state !== 'draft' || revision && revision !== current.revision) return { discarded: false, current };
  const rows = await queue(scope).read();
  if (rows.some(row => row.id === current.operationId && !['discarded'].includes(row.state))) return { discarded: false, current };
  const tombstone = { ...current, state: 'discarded', dirty: false, discardedAt: Date.now() };
  await store.archive(tombstone);
  const result = await store.compareAndSet(current.revision, value => value.state === 'draft' ? { ...value, state: 'discarded', dirty: false, discardedAt: tombstone.discardedAt } : null);
  return { discarded: result.changed, current: result.current };
  });
};
export const saveJobOffline = (jobId, patch, options = {}) => saveWork(async () => {
  const timing = Date.now();
  const scope = offlineScope();
  if(options.expectedScope&&options.expectedScope!==scope)throw new Error('Your workspace changed. Reopen the job before saving.');
  const jobs = await readCache('job-bases', scope) || {};
  let base = jobs[jobId] || options.baseJob;
  if (!base && !(await isOffline())) base = (await readWorkspace('jobs', { id: jobId })).job;
  if (!base) throw new Error('Open this job online before editing it offline.');
  if (offlineScope() !== scope) throw new Error('Your workspace changed. Reopen the job before saving.');
  if (!jobs[jobId] && options.baseJob) {
    const claims=getClaims(),uid=auth.currentUser?.uid;
    if(!auth.currentUser?.emailVerified||base.id!==jobId||(claims?.companyId?base.companyId!==claims.companyId:base.companyId||base.userId!==uid)
      ||claims?.role==='technician'&&(base.assignedTo!==claims.membershipId||base.assignedToUid&&base.assignedToUid!==uid))throw new Error('Your verified current workspace and job assignment are required to save work notes.');
    // A detail opened directly may not have populated the list's base cache.
    // Keep that already-authorized context before enqueueing; ACK merging must
    // not produce an identity-less offline job or overwrite a richer base.
    await writeCache('job-bases',{...jobs,[jobId]:base},scope);
    if(offlineScope()!==scope)throw new Error('Your workspace changed. Reopen the job before saving.');
  }
  const id = options.operationId || Crypto.randomUUID();
  await queue(scope).edit(rows => {
    const existing = rows.find(row => row.id === id);
    if (existing) {
      if (existing.kind !== 'job' || existing.jobId !== jobId || JSON.stringify(existing.patch) !== JSON.stringify(patch)) throw new Error('This saved operation belongs to a different change. Reopen the job.');
      return;
    }
    rows.push(linkRevision(rows, { id, kind: 'job', jobId, patch, expectedVersion: Object.hasOwn(options, 'expectedVersion') ? options.expectedVersion : offlineVersion(base.updatedAt),
      ...(options.workNoteDraft ? { workNoteDraft: options.workNoteDraft } : {}), createdAt: Date.now(), state: 'pending', attempts: 0, nextAttempt: 0 }));
  });
  recordOfflineTiming(patch.status === 'completed' ? 'completion' : Object.hasOwn(patch,'notes') ? 'notes' : 'job','local-save',timing); void flushOffline().catch(() => {});
  return { success: true, queued: true, operationId: id };
});
export const savePhotoOffline = (job, uri, metadata = {}) => saveWork(async () => {
  const timing = Date.now();
  const scope = offlineScope(), id = Crypto.randomUUID(), attribution = tenantFields();
  const directory = `${FileSystem.documentDirectory}rl-photos/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const localUri = `${directory}${id}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: localUri });
  if (offlineScope() !== scope) throw new Error('Your workspace changed. Reopen the job before saving this photo.');
  const base = attribution.companyId ? `companies/${attribution.companyId}` : `users/${attribution.userId}`;
  const safeMetadata = Object.fromEntries(['source', 'fileName', 'mimeType'].filter(key => typeof metadata[key] === 'string').map(key => [key, metadata[key].slice(0, 255)]));
  for (const key of ['width', 'height']) if (Number.isFinite(metadata[key]) && metadata[key] > 0) safeMetadata[key] = metadata[key];
  await queue(scope).add({ id, kind: 'photo', jobId: job.id, customerId: job.customerId || null, localUri, metadata: safeMetadata, attribution, storagePath: `${base}/jobs/${job.id}/${id}.jpg`, createdAt: Date.now() });
  recordOfflineTiming('photo','local-save',timing); void flushOffline().catch(() => {}); return id;
});
async function sendPhoto(row, scope) {
  if (offlineScope() !== scope) throw new Error('Workspace changed.');
  const base64 = await FileSystem.readAsStringAsync(row.localUri, { encoding: FileSystem.EncodingType.Base64 });
  await callWorkspace('rlJobPhoto', { action: 'upload', operationId: row.id, jobId: row.jobId, base64 });
  return { status: 'synced' };
}
export const saveApplicationOffline = (jobId, record) => saveWork(async () => {
  const timing = Date.now();
  const scope = offlineScope(), id = Crypto.randomUUID();
  await queue(scope).add({ id, kind: 'application', jobId, record, createdAt: Date.now() });
  recordOfflineTiming('application','local-save',timing); void flushOffline().catch(() => {}); return { success: true, queued: true };
});
export const saveVisitOffline = (job, input) => saveWork(async () => {
  const timing = Date.now();
  const scope = offlineScope(), claims = getClaims(), attribution = tenantFields(), uid = auth.currentUser?.uid;
  if (!auth.currentUser?.emailVerified || !claims?.companyId || !job?.id || job.companyId !== claims.companyId || ['completed','cancelled','canceled'].includes(job.status)
    || claims.role === 'technician' && (job.assignedTo !== claims.membershipId || job.assignedToUid && job.assignedToUid !== uid)) throw new Error('Your verified current company and job assignment are required to save visit evidence.');
  const id = input.operationId;
  const note = String(input.note || '').trim(), at = Date.parse(input.occurredAt);
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{16,100}$/.test(id) || !['arrived','departed','access-blocked'].includes(input.type) || note.length > 1000 || input.type === 'access-blocked' && !note
    || !Number.isFinite(at) || at > Date.now() + 120000) throw new Error('A valid visit type, original time, operation ID and access-blocked reason are required.');
  const record = { type: input.type, note, occurredAt: new Date(at).toISOString() };
  if (['latitude','longitude','accuracy','capturedAt'].some(key => input[key] != null)) {
    if (![input.latitude,input.longitude,input.accuracy].every(Number.isFinite) || Math.abs(input.latitude)>90 || Math.abs(input.longitude)>180 || input.accuracy<0 || input.accuracy>5000 || !Number.isFinite(Date.parse(input.capturedAt)) || Math.abs(Date.parse(input.capturedAt)-at)>300000) throw new Error('The optional GPS sample is invalid or was not captured near this visit. Record without GPS or retry with a valid sample.');
    Object.assign(record, { latitude: input.latitude, longitude: input.longitude, accuracy: input.accuracy, capturedAt: input.capturedAt });
  }
  const bases = await readCache('job-bases', scope) || {}, base = bases[job.id] || job;
  if (offlineScope() !== scope) throw new Error('Your workspace changed. Reopen this job before saving visit evidence.');
  await queue(scope).edit(rows => {
    const existing = rows.find(row => row.id === id);
    if (existing) { if (existing.kind !== 'visit' || existing.jobId !== job.id || JSON.stringify(existing.record) !== JSON.stringify(record)) throw new Error('This visit operation belongs to different evidence. Retry the original saved event.'); return; }
    rows.push(linkRevision(rows, { id, kind: 'visit', jobId: job.id, record, attribution: { ...attribution, userId: uid, memberId: claims.membershipId || uid, role: claims.role }, expectedAssignee: job.assignedTo || null, expectedJobState: compatibleJobState(job),
      expectedVersion: offlineVersion(base.updatedAt), createdAt: Date.now(), state: 'pending', attempts: 0, nextAttempt: 0 }));
  });
  recordOfflineTiming(input.type === 'arrived' ? 'arrival' : input.type === 'departed' ? 'departure' : 'visit','local-save',timing); void flushOffline().catch(() => {});
  return { success: true, queued: true, operationId: id };
});
export const saveServiceFormOffline = (job, record) => saveWork(async () => {
  const timing = Date.now();
  const scope = offlineScope(), claims = getClaims();
  if (!auth.currentUser?.emailVerified || !job?.id || ['completed','cancelled','canceled'].includes(job.status) || (claims?.companyId ? job.companyId !== claims.companyId : job.companyId || job.userId !== auth.currentUser.uid)
    || claims?.role === 'technician' && job.assignedTo !== claims.membershipId) throw new Error('Your verified current workspace and job assignment are required to save this service form.');
  const cached = await readCache(`service-form:${job.id}`, scope);
  if (!cached?.enabled || !cached.form || cached.form.assignmentVersion !== record.assignmentVersion) throw new Error('Open this service template online before saving it offline.');
  const id = Crypto.randomUUID(), payload = { templateId: record.templateId, templateVersion: record.templateVersion, assignmentVersion: record.assignmentVersion, expectedVersion: record.expectedVersion, status: record.status, answers: record.answers };
  await queue(scope).edit(rows => {
    if (rows.some(row => row.kind === 'service-form' && row.jobId === job.id && !['synced','discarded'].includes(row.state))) throw new Error('A service report is already saved for this job. Synchronize or review it before adding another revision.');
    rows.push({ id, kind: 'service-form', jobId: job.id, record: payload, template: cached.form.template, createdAt: Date.now(), state: 'pending', attempts: 0, nextAttempt: 0 });
  });
  recordOfflineTiming('checklist','local-save',timing); void flushOffline().catch(() => {}); return { success: true, queued: true, operationId: id };
});
export async function purgeLegacyReadCaches() {
  const keys = await AsyncStorage.getAllKeys();
  const legacy = keys.filter(key => (key.startsWith('rl-offline-v1:') && key.includes(':cache:') && !key.includes(':cache:policy2:')) || /^rl-session-v[12]:/.test(key));
  if (legacy.length) await AsyncStorage.multiRemove(legacy);
  // Pending queues and their local photos are deliberately retained for authorized replay.
}
export async function purgeOtherRoleCaches(uid, currentScope) {
  const prefix = `rl-offline-v1:${auth.app.options.projectId}:${uid}:`;
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(prefix) && key.includes(':cache:') && (!currentScope || !key.startsWith(`${currentScope}:cache:`)));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
export function flushOffline() {
  const scope = offlineScope(), work = queue(scope);
  if (pausedScope(scope)) return Promise.resolve();
  if (draining.has(scope)) return draining.get(scope);
  const task = (async () => {
    if (await isOffline()) return;
    try {
    const bases = await readCache('job-bases', scope) || {};
    await work.edit((rows) => {
      restoreLegacyDependencies(rows);
      rows.forEach((row) => { if (row.state === 'syncing') row.state = 'pending'; });
      // Queues from the immediately preceding release did not copy the stable
      // business snapshot onto visit rows. Recover it from the job cache that
      // was already required before offline work; never fetch or invent it.
      for (const row of rows) if (row.kind === 'visit' && !row.expectedJobState && bases[row.jobId]) row.expectedJobState = compatibleJobState(bases[row.jobId]);
      // Upgrade retained evidence in place. Missing-departure completions receive
      // a superseding operation while the original failure remains in the audit
      // trail. Structured visit revision conflicts get one automatic server
      // recheck under the compatible-revision protocol; genuine conflicts are
      // left for review and are never retried in a loop.
      prepareAutomaticRecovery(rows, () => Crypto.randomUUID());
    });
    // A photo upload can be much slower than a Firestore/callable operation.
    // Photos do not advance the job revision chain, so drain other runnable
    // evidence first while retaining FIFO order within each class.
    const queued = await work.read();
    const scheduled = [...queued.filter(row => row.kind !== 'photo'), ...queued.filter(row => row.kind === 'photo')];
    for (const saved of scheduled) {
      const row = (await work.read()).find((entry) => entry.id === saved.id);
      if (!row) continue;
      if (pausedScope(scope) || AppState.currentState !== 'active' || offlineScope() !== scope || await isOffline()) break;
      if (row.state !== 'pending' || row.nextAttempt > Date.now()) continue;
      const ordered = await work.read();
      const earlier = ordered.slice(0, ordered.findIndex((entry) => entry.id === row.id)).find((other) => other.jobId === row.jobId && (revisionOperation(other) || row.patch?.status === 'completed' && other.kind === 'service-form') && !['synced', 'discarded'].includes(other.state));
      if (revisionOperation(row) && earlier) continue;
      if (row.versionDependency && !ordered.some(other => other.id === row.versionDependency && other.state === 'synced')) { await work.patch(row.id, { state:'conflict', error:'An earlier saved operation was changed or discarded. This evidence is retained for management review.', errorCode:'revision-chain-changed' }); continue; }
      await work.patch(row.id, { state: 'syncing', submittedAt: row.submittedAt || Date.now() });
      const syncTiming = Date.now();
      try {
        const result = row.kind === 'job' ? await callWorkspace('rlApplyJobOperation', { operationId: row.id, jobId: row.jobId, patch: row.patch, expectedVersion: row.expectedVersion }) : row.kind === 'application' ? await callWorkspace('rlRecordApplication', { jobId: row.jobId, operationId: row.id, record: row.record }).then(() => ({ status: 'synced' }))
          : row.kind === 'service-form' ? await callWorkspace('rlServiceForms', { action: 'save', jobId: row.jobId, operationId: row.id, ...row.record })
          : row.kind === 'visit' ? await callWorkspace('rlJobVisit', { action:'record', jobId:row.jobId, operationId:row.id, evidenceVersion:1, expectedVersion:row.expectedVersion, expectedAssignee:row.expectedAssignee, expectedJobState:row.expectedJobState || null, allowCompatibleRevision:true, ...row.record })
          : row.kind === 'photo' ? await sendPhoto(row, scope) : (() => { throw new Error('Unsupported saved-work type. Retain this change for review.'); })();
        if(row.kind==='visit'&&(!['synced','conflict'].includes(result?.status)||result.status==='synced'&&(!result.event?.id||result.event.type!==row.record.type||!['manual','manual-gps'].includes(result.event.source)||!Number.isFinite(Date.parse(result.event.recordedAt))))) throw Object.assign(new Error('The server did not confirm a saved manual visit report. The durable event remains available to retry with the same identity.'),{code:'functions/internal'});
        await work.edit((rows) => {
          const current = rows.find((entry) => entry.id === row.id);
          Object.assign(current, { state: result.status, server: result.server || null, serverVersion: result.version || null, event:result.event || null, error: result.status === 'conflict' ? result.message || 'This job changed online. Evidence is retained; management attention is required.' : '' });
          if (result.status === 'synced') advanceRevision(rows, row, result.version);
        });
        if (result.status === 'synced' && row.kind === 'job') {
          const patch = { ...row.patch }; if (Object.hasOwn(patch,'notes')) delete patch.notes;
          const bases = await readCache('job-bases', scope) || {}, base = bases[row.jobId];
          if (versionAtMost(base?.updatedAt,result.version)) { bases[row.jobId] = { ...base, ...patch, updatedAt: result.version }; if (Object.hasOwn(row.patch,'notes')) bases[row.jobId]=canonicalNotes(bases[row.jobId],row.patch.notes,scope); await writeCache('job-bases', bases, scope); }
          if (Object.hasOwn(row.patch,'notes') || Object.hasOwn(row.patch,'estimateOutcome')) {
            const detail=await readCache(`job-detail:${row.jobId}`,scope);
            if(detail?.job&&versionAtMost(detail.job.updatedAt,result.version)) {
              let merged={...detail.job,...patch,updatedAt:result.version};
              if(Object.hasOwn(row.patch,'notes'))merged=canonicalNotes(merged,row.patch.notes,scope);
              await writeCache(`job-detail:${row.jobId}`,{...detail,job:merged},scope);
            }
            if(row.workNoteDraft?.revision)await noteStore(scope,row.jobId).compareAndSet(row.workNoteDraft.revision,current=>({ ...current,state:'synced',dirty:false,serverVersion:result.version }));
          }
        }
        if (result.status === 'synced' && row.kind === 'visit') { const bases=await readCache('job-bases',scope)||{}; if(bases[row.jobId]) { bases[row.jobId]={...bases[row.jobId],updatedAt:result.version}; await writeCache('job-bases',bases,scope); } }
        if (result.status === 'synced' && row.kind === 'photo') await FileSystem.deleteAsync(row.localUri, { idempotent: true });
        if (result.status === 'synced' && row.kind === 'service-form') {
          const cached = await readCache(`service-form:${row.jobId}`, scope);
          if (cached?.form?.assignmentVersion === row.record.assignmentVersion) await writeCache(`service-form:${row.jobId}`, { ...cached, form: { ...cached.form, answers: row.record.answers, status: row.record.status, responseVersion: result.version } }, scope);
        }
        recordOfflineTiming(timingKind(row), 'sync', syncTiming, result.status === 'conflict' ? 'conflict' : 'ok');
      } catch (error) {
        recordOfflineTiming(timingKind(row), 'sync', syncTiming, 'failed');
        const attempts = row.attempts + 1, retryable = ['functions/unavailable', 'functions/deadline-exceeded', 'functions/internal', 'functions/resource-exhausted', 'storage/retry-limit-exceeded', 'unavailable'].includes(error.code) || await isOffline();
        const conflict = row.kind === 'visit' && ['permission-denied','unauthenticated','aborted','failed-precondition'].includes(String(error.code || '').split('/').pop());
        await work.patch(row.id, { state: conflict ? 'conflict' : retryable && attempts < 5 ? 'pending' : 'failed', attempts, nextAttempt: Date.now() + retryDelay(attempts), error: error.message || 'Sync failed.', errorCode: error.code || null });
      }
    }
    } finally { notify(); }
  })().finally(() => { draining.delete(scope); });
  draining.set(scope, task);
  return task;
}
export const resolveOffline = (id, action) => saveWork(async () => {
  const work = queue();
  let operationId = id;
  await work.edit((rows) => {
    const row = rows.find((entry) => entry.id === id); if (!row) return;
    if (row.kind === 'visit' && action === 'discard') throw new Error('Saved visit evidence is retained for management reconciliation. It cannot be discarded from the device queue.');
    if (action === 'discard') { row.state = 'discarded'; return; }
    const repaired = repairCompletionAfterDeparture(rows, id, Crypto.randomUUID());
    if (repaired) { operationId = repaired.operationId; return; }
    if (row.state === 'conflict' && row.kind !== 'visit') {
      if (row.kind === 'service-form' && row.server?.assignmentVersion !== row.record.assignmentVersion) throw new Error('The assigned service template changed. Review the saved answers and current template before discarding this old change.');
      row.id = Crypto.randomUUID(); row.expectedVersion = row.serverVersion;
      if (row.kind === 'service-form') row.record.expectedVersion = row.serverVersion;
      operationId = row.id;
    }
    row.state = 'pending'; row.attempts = 0; row.nextAttempt = 0; row.error = ''; row.errorCode = null;
  });
  void flushOffline().catch(() => {});
  return { operationId };
});

// Deletion must settle a send already in flight before invalidating the account.
// New saves and cache writes stay blocked until deletion fails or the app exits.
export async function pauseOfflineForAccount(uid) {
  pausedAccounts.add(uid);
  await Promise.allSettled([
    ...[...draining].filter(([scope]) => scope.startsWith(accountPrefix(uid))).map(([, task]) => task),
    ...(writing.get(uid) || []),
  ]);
  return () => { pausedAccounts.delete(uid); notify(); };
}
async function accountQueues(uid) {
  const prefix = accountPrefix(uid);
  const keys = new Set((await AsyncStorage.getAllKeys()).filter(key => key.startsWith(prefix) && key.endsWith(':queue')));
  for (const scope of queues.keys()) if (scope.startsWith(prefix)) keys.add(`${scope}:queue`);
  return Promise.all([...keys].map(async key => ({ key, rows: await queue(key.slice(0, -6)).read() })));
}
export async function accountOfflineSummary(uid) {
  const rows = (await accountQueues(uid)).flatMap(value => value.rows).filter(row => !['synced', 'discarded'].includes(row.state));
  const prefix=accountPrefix(uid),keys=(await AsyncStorage.getAllKeys()).filter(key=>key.startsWith(prefix)&&key.includes(':draft:work-notes:')&&!key.includes(':discarded:'));
  const drafts=(await Promise.all(keys.map(async key=>JSON.parse(await AsyncStorage.getItem(key)||'null')))).filter(value=>value?.state==='draft'&&value.dirty&&!rows.some(row=>row.id===value.operationId||row.workNoteDraft?.revision===value.revision));
  return { pendingOperations: rows.filter(row => row.kind !== 'photo').length + drafts.length, pendingPhotos: rows.filter(row => row.kind === 'photo').length };
}
export async function purgeOfflineForAccount(uid) {
  const prefix = accountPrefix(uid), records = await accountQueues(uid);
  const directory = `${FileSystem.documentDirectory}rl-photos/`;
  // Never delete arbitrary picker/library paths or another account's photos.
  const photos = new Set(records.flatMap(record => record.rows).filter(row => row.kind === 'photo' && typeof row.localUri === 'string' && row.localUri.startsWith(directory) && /^[A-Za-z0-9-]+\.jpg$/.test(row.localUri.slice(directory.length))).map(row => row.localUri));
  await Promise.all([...photos].map(uri => FileSystem.deleteAsync(uri, { idempotent: true })));
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.startsWith(prefix) || [`rl-session-v1:${uid}`, `rl-session-v2:${uid}`, `rl-session-v3:${uid}`].includes(key));
  if (keys.length) await AsyncStorage.multiRemove(keys);
  for (const scope of queues.keys()) if (scope.startsWith(prefix)) queues.delete(scope);
  for (const key of noteDraftStores.keys()) if (key.startsWith(prefix)) noteDraftStores.delete(key);
  notify();
}
