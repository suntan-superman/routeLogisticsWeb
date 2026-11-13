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

const queues = new Map(), draining = new Set(), listeners = new Set();
export const offlineVersion = (v) => v?.toDate ? v.toDate().toISOString() : v?.seconds != null ? new Date(v.seconds * 1000 + (v.nanoseconds || 0) / 1e6).toISOString() : v || null;
export const isOffline = async () => { const net = await NetInfo.fetch(); return net.isConnected === false || net.isInternetReachable === false; };
export function offlineScope() {
  requireWorkspace();
  const claims = getClaims();
  // Role and assignment changes cannot expose a previous manager's cached jobs.
  return `rl-offline-v1:${auth.app.options.projectId}:${auth.currentUser.uid}:${claims?.companyId || 'personal'}:${claims?.role || 'owner'}:${claims?.membershipId || ''}`;
}
export function subscribeOffline(callback) { listeners.add(callback); return () => listeners.delete(callback); }
function notify() { listeners.forEach((callback) => callback()); }
function queue(scope = offlineScope()) { if (!queues.has(scope)) queues.set(scope, createQueue(AsyncStorage, `${scope}:queue`, notify)); return queues.get(scope); }
export const queuedWork = () => queue().read();
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
  return jobs.map((job) => rows.filter((row) => row.kind === 'job' && row.jobId === job.id && !['discarded', 'synced'].includes(row.state)).reduce((current, row) => ({ ...current, ...row.patch, syncState: row.state }), job));
}
export async function saveJobOffline(jobId, patch) {
  const scope = offlineScope(), jobs = await readCache('job-bases', scope) || {};
  let base = jobs[jobId];
  if (!base && !(await isOffline())) base = (await readWorkspace('jobs', { id: jobId })).job;
  if (!base) throw new Error('Open this job online before editing it offline.');
  const id = Crypto.randomUUID();
  await queue(scope).add({ id, kind: 'job', jobId, patch, expectedVersion: offlineVersion(base.updatedAt), createdAt: Date.now() });
  void flushOffline().catch(() => {});
  return { success: true, queued: true };
}
export async function savePhotoOffline(job, uri) {
  const scope = offlineScope(), id = Crypto.randomUUID(), attribution = tenantFields();
  const directory = `${FileSystem.documentDirectory}rl-photos/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const localUri = `${directory}${id}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: localUri });
  const base = attribution.companyId ? `companies/${attribution.companyId}` : `users/${attribution.userId}`;
  await queue(scope).add({ id, kind: 'photo', jobId: job.id, customerId: job.customerId || null, localUri, attribution, storagePath: `${base}/jobs/${job.id}/${id}.jpg`, createdAt: Date.now() });
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
export async function flushOffline() {
  const scope = offlineScope(), work = queue(scope);
  if (draining.has(scope) || await isOffline()) return;
  draining.add(scope);
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
        await work.patch(row.id, { state: retryable && attempts < 5 ? 'pending' : 'failed', attempts, nextAttempt: Date.now() + retryDelay(attempts), error: error.message || 'Sync failed.' });
      }
    }
  } finally { draining.delete(scope); notify(); }
}
export async function resolveOffline(id, action) {
  const work = queue();
  await work.edit((rows) => {
    const row = rows.find((entry) => entry.id === id); if (!row) return;
    if (action === 'discard') { row.state = 'discarded'; return; }
    if (row.state === 'conflict') { row.id = Crypto.randomUUID(); row.expectedVersion = row.serverVersion; }
    row.state = 'pending'; row.attempts = 0; row.nextAttempt = 0; row.error = '';
  });
  void flushOffline().catch(() => {});
}
