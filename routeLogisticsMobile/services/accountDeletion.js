import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { auth, functions } from '../constants/firebase';
import { isOffline, accountOfflineSummary, pauseOfflineForAccount, purgeOfflineForAccount } from './offline';
import { stopShiftTracking } from './workTracking';
import { signOutNativePush, purgeDeletedAccountPush } from './nativePush';
import { createAccountDeletion } from './accountDeletionCore';

const cleanupKey = () => `rl-account-deletion-cleanup-v1:${auth.app.options.projectId}`;
async function cleanupRecords() {
  const values = JSON.parse(await AsyncStorage.getItem(cleanupKey()) || '[]');
  if (!Array.isArray(values)) throw new Error('Saved account cleanup could not be read.');
  return values.filter(value => typeof value.uid === 'string' && /^[A-Za-z0-9_-]+$/.test(value.uid) && (value.receipt?.deleted === true || value.receipt?.deletionPending === true));
}
async function recordCleanup(record) {
  const rows = (await cleanupRecords()).filter(value => value.uid !== record.uid);
  await AsyncStorage.setItem(cleanupKey(), JSON.stringify([...rows, record]));
}
async function clearCleanup(uid) {
  const rows = (await cleanupRecords()).filter(value => value.uid !== uid);
  if (rows.length) await AsyncStorage.setItem(cleanupKey(), JSON.stringify(rows));
  else await AsyncStorage.removeItem(cleanupKey());
}
async function purgeLocalAccount(uid, email) {
  await purgeOfflineForAccount(uid);
  await purgeDeletedAccountPush(uid);
  const remembered = await AsyncStorage.getItem('rl-login-email-v1');
  if (remembered?.trim().toLowerCase() === email?.trim().toLowerCase()) await AsyncStorage.removeItem('rl-login-email-v1');
  await Promise.all(['savedCredentials', 'tempCredentials', 'userToken', 'userData'].map(key => SecureStore.deleteItemAsync(key)));
}

export async function resumeDeletedAccountCleanup(finishSession, onRecorded = () => {}) {
  // These receipts are created only after an authoritative deletion response.
  // They contain no credential and cause no server deletion or cross-UID purge.
  const records = await cleanupRecords();
  records.forEach(record => onRecorded(record.uid));
  for (const record of records) {
    await pauseOfflineForAccount(record.uid);
    await purgeLocalAccount(record.uid, record.email);
    await finishSession(record.uid);
    await clearCleanup(record.uid);
  }
}

// Use the documented callable HTTP protocol with a token held only in memory.
// A lost response is retried once using that same token, never by refreshing a
// deleted Auth user or interpreting "user not found" as a successful deletion.
export async function invokeAccountDeletion(token) {
  const project = auth.app.options.projectId;
  const endpoint = functions.emulatorOrigin
    ? `${functions.emulatorOrigin}/${project}/us-central1/rlDeleteAccount`
    : `https://us-central1-${project}.cloudfunctions.net/rlDeleteAccount`;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ data: { confirmation: 'DELETE' } }), signal: controller.signal });
      const payload = await response.json();
      if (response.ok && !payload.error) return payload.result ?? payload.data;
      if (payload.error?.details?.deletionPending === true) return { success: true, deletionPending: true };
      const status = payload.error?.status || 'INTERNAL';
      const code = `functions/${status.toLowerCase().replaceAll('_', '-')}`;
      const error = Object.assign(new Error(payload.error?.message || 'The deletion request could not be confirmed. Retry while signed in.'), { code, details: payload.error?.details });
      if (![408, 429, 500, 502, 503, 504].includes(response.status)) throw Object.assign(error, { final: true });
      lastError = error;
    } catch (error) {
      if (error.final) throw error;
      lastError = Object.assign(new Error('Account deletion could not be confirmed. Keep this screen open and retry; your saved work has been retained.'), { code: error.code || 'functions/unavailable' });
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

export function createMobileAccountDeletion(finishSession) {
  return createAccountDeletion({
    account: () => auth.currentUser, isOffline, summary: accountOfflineSummary, pause: pauseOfflineForAccount,
    stopTracking: () => stopShiftTracking({ reason: 'Account deletion requested. Location sharing is off.' }),
    stopPush: signOutNativePush, invoke: invokeAccountDeletion,
    purge: purgeLocalAccount, record: recordCleanup, clearRecord: clearCleanup, finishSession,
  });
}
