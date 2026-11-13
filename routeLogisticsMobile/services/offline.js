import { readWorkspace, callWorkspace } from './workspaceApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../constants/firebase';
import { AppState } from 'react-native';
import { getClaims, tenantFields, requireWorkspace } from './tenancy';
import { createQueue, retryDelay } from './offlineQueueCore';

const queues = new Map(), draining = new Map(), listeners = new Set();
export const offlineVersion = (v) => v?.toDate ? v.toDate().toISOString() : v?.seconds != null ? new Date(v.seconds * 1000 + (v.nanoseconds || 0) / 1e6).toISOString() : v || null;
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
export const writeCache = (name, data, scope = offlineScope()) => AsyncStorage.setItem(`${scope}:cache:policy2:${name}`, JSON.stringify(data));
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
  return jobs.map((job) => rows.filter((row) => row.kind === 'job' && row.jobId === job.id && !['discarded', 'synced'].includes(row.state)).reduce((current, row) => ({
    ...current, ...(['pending', 'syncing'].includes(row.state) ? row.patch : {}),
    syncState: row.state, syncOperationId: row.id, syncError: row.error || '', syncErrorCode: row.errorCode || null, syncPatch: row.patch,
  }), job));
}
export async function saveJobOffline(jobId, patch, options = {}) {
  const scope = offlineScope(), jobs = await readCache('job-bases', scope) || {};
  let base = jobs[jobId];
  if (!base && !(await isOffline())) base = (await readWorkspace('jobs', { id: jobId })).job;
  if (!base) throw new Error('Open this job online before editing it offline.');
  if (offlineScope() !== scope) throw new Error('Your workspace changed. Reopen the job before saving.');
  const id = options.operationId || Crypto.randomUUID();
  await queue(scope).edit(rows => {
    const existing = rows.find(row => row.id === id);
    if (existing) {
      if (existing.kind !== 'job' || existing.jobId !== jobId || JSON.stringify(existing.patch) !== JSON.stringify(patch)) throw new Error('This saved operation belongs to a different change. Reopen the job.');
      return;
    }
    rows.push({ id, kind: 'job', jobId, patch, expectedVersion: offlineVersion(base.updatedAt), createdAt: Date.now(), state: 'pending', attempts: 0, nextAttempt: 0 });
  });
  void flushOffline().catch(() => {});
  return { success: true, queued: true, operationId: id };
}
export async function savePhotoOffline(job, uri, metadata = {}) {
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
  void flushOffline().catch(() => {}); return id;
}
async function sendPhoto(row, scope) {
  if (offlineScope() !== scope) throw new Error('Workspace changed.');
  const base64 = await FileSystem.readAsStringAsync(row.localUri, { encoding: FileSystem.EncodingType.Base64 });
  await callWorkspace('rlJobPhoto', { action: 'upload', operationId: row.id, jobId: row.jobId, base64 });
  return { status: 'synced' };
}
export async function saveApplicationOffline(jobId, record) {
  const scope = offlineScope(), id = Crypto.randomUUID();
  await queue(scope).add({ id, kind: 'application', jobId, record, createdAt: Date.now() });
  void flushOffline().catch(() => {}); return { success: true, queued: true };
}
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
  if (draining.has(scope)) return draining.get(scope);
  const task = (async () => {
    if (await isOffline()) return;
    try {
    await work.edit((rows) => rows.forEach((row) => { if (row.state === 'syncing') row.state = 'pending'; }));
    for (const saved of await work.read()) {
      const row = (await work.read()).find((entry) => entry.id === saved.id);
      if (!row) continue;
      if (AppState.currentState !== 'active' || offlineScope() !== scope || await isOffline()) break;
      if (row.state !== 'pending' || row.nextAttempt > Date.now()) continue;
      const ordered = await work.read();
      const earlier = ordered.slice(0, ordered.findIndex((entry) => entry.id === row.id)).find((other) => other.jobId === row.jobId && other.kind === 'job' && !['synced', 'discarded'].includes(other.state));
      if (row.kind === 'job' && earlier) continue;
      await work.patch(row.id, { state: 'syncing' });
      try {
        const result = row.kind === 'job' ? (await httpsCallable(functions, 'rlApplyJobOperation')({ operationId: row.id, jobId: row.jobId, patch: row.patch, expectedVersion: row.expectedVersion })).data : row.kind === 'application' ? await callWorkspace('rlRecordApplication', { jobId: row.jobId, operationId: row.id, record: row.record }).then(() => ({ status: 'synced' })) : await sendPhoto(row, scope);
        await work.edit((rows) => {
          const current = rows.find((entry) => entry.id === row.id);
          Object.assign(current, { state: result.status, server: result.server || null, serverVersion: result.version || null, error: result.status === 'conflict' ? 'This job changed online. Review before retrying.' : '' });
          if (result.status === 'synced' && row.kind === 'job') { const next = rows.find((entry) => entry.kind === 'job' && entry.jobId === row.jobId && entry.id !== row.id && entry.state === 'pending'); if (next) next.expectedVersion = result.version; }
        });
        if (result.status === 'synced' && row.kind === 'job') { const bases = await readCache('job-bases', scope) || {}; bases[row.jobId] = { ...bases[row.jobId], ...row.patch, updatedAt: result.version }; await writeCache('job-bases', bases, scope); }
        if (result.status === 'synced' && row.kind === 'photo') await FileSystem.deleteAsync(row.localUri, { idempotent: true });
      } catch (error) {
        const attempts = row.attempts + 1, retryable = ['functions/unavailable', 'functions/deadline-exceeded', 'functions/internal', 'functions/resource-exhausted', 'storage/retry-limit-exceeded', 'unavailable'].includes(error.code) || await isOffline();
        await work.patch(row.id, { state: retryable && attempts < 5 ? 'pending' : 'failed', attempts, nextAttempt: Date.now() + retryDelay(attempts), error: error.message || 'Sync failed.', errorCode: error.code || null });
      }
    }
    } finally { notify(); }
  })().finally(() => { draining.delete(scope); });
  draining.set(scope, task);
  return task;
}
export async function resolveOffline(id, action) {
  const work = queue();
  let operationId = id;
  await work.edit((rows) => {
    const row = rows.find((entry) => entry.id === id); if (!row) return;
    if (action === 'discard') { row.state = 'discarded'; return; }
    if (row.state === 'conflict') { row.id = Crypto.randomUUID(); row.expectedVersion = row.serverVersion; operationId = row.id; }
    row.state = 'pending'; row.attempts = 0; row.nextAttempt = 0; row.error = ''; row.errorCode = null;
  });
  void flushOffline().catch(() => {});
  return { operationId };
}
