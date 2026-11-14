import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../constants/firebase';
import { callWorkspace, readWorkspace } from './workspaceApi';
import { beginNativeInteraction } from './nativeInteraction';

const prefix = `rl-native-push-v1:${auth.app.options.projectId}`, registrationKey = `${prefix}:registration`, pendingKey = `${prefix}:open`, handledKey = `${prefix}:handled`, invalidationsKey = `${prefix}:invalidations`, installationKey = 'rl-native-push-installation-v1', sequenceKey = 'rl-native-push-sequence-v1';
const listeners = new Set(), openListeners = new Set(), receivedListeners = new Set();
const defaults = { enabled: true, assignments: true, schedule: true, status: true };
let context = null, accessStatus = 'signed-out', initialized = false, opening = false, generation = 0, registration = null, pending = null, handled = [], invalidations = [], loaded = false, loading, registering = null;
let state = { available: false, registered: false, permission: 'undetermined', preferences: defaults, busy: false, error: '', message: '' };
const receivedIds = new Set();
const key = user => [user?.id, user?.companyId, user?.role, user?.membershipId || ''].join(':');
const update = patch => { state = { ...state, ...patch }; listeners.forEach(listener => listener({ ...state })); };
export const nativePushSnapshot = () => ({ ...state });
export const subscribeNativePush = listener => { listeners.add(listener); listener(nativePushSnapshot()); return () => listeners.delete(listener); };
const current = (user, ticket) => ticket === generation && key(user) === key(context) && auth.currentUser?.uid === user?.id;
const belongs = data => !!context && data.recipientUid === context.id && data.companyId === context.companyId && data.role === context.role && (data.membershipId || '') === (context.membershipId || '');
const categoryEnabled = data => state.preferences.enabled && state.preferences[data.type === 'job-assignment' ? 'assignments' : data.type === 'job-schedule' ? 'schedule' : 'status'];
async function load() {
  if (loaded) return;
  if (!loading) loading = (async () => {
    const values = await Promise.all([registrationKey, pendingKey, handledKey, invalidationsKey].map(async item => { try { return JSON.parse(await AsyncStorage.getItem(item) || 'null'); } catch { return null; } }));
    registration = values[0]; pending = safeData(values[1]); handled = Array.isArray(values[2]) ? values[2].slice(-100) : []; invalidations = Array.isArray(values[3]) ? values[3].slice(-20) : []; loaded = true;
  })().finally(() => { loading = null; });
  await loading;
}
async function installationId() { let value = await SecureStore.getItemAsync(installationKey); if (!value) { value = Crypto.randomUUID(); await SecureStore.setItemAsync(installationKey, value); } return value; }
let sequenceWrites = Promise.resolve();
function nextSequence() { const task = sequenceWrites.then(async () => { const next = Number(await SecureStore.getItemAsync(sequenceKey) || 0) + 1; await SecureStore.setItemAsync(sequenceKey, String(next)); return next; }); sequenceWrites = task.catch(() => {}); return task; }
async function assertAccount(user) {
  await auth.authStateReady();
  const account = auth.currentUser;
  if (!account || account.uid !== user?.id || !account.emailVerified) throw new Error('Sign in to your verified company account before enabling notifications.');
  const { claims } = await account.getIdTokenResult();
  if (claims.companyId !== user.companyId || claims.role !== user.role || (claims.membershipId || '') !== (user.membershipId || '')) throw new Error('Refresh your company access before enabling notifications.');
}
const granted = permission => permission.granted === true || permission.ios?.status === Notifications.IosAuthorizationStatus?.PROVISIONAL;
function safeData(value) {
  if (!value || !['job-assignment', 'job-schedule', 'job-status'].includes(value.type)) return null;
  if (['jobId', 'notificationId', 'companyId', 'recipientUid', 'role'].some(field => typeof value[field] !== 'string' || !value[field] || value[field].length > 200 || value[field].includes('/'))) return null;
  if (!['owner', 'admin', 'manager', 'technician'].includes(value.role) || typeof value.membershipId !== 'string') return null;
  return Object.fromEntries(['type', 'jobId', 'notificationId', 'companyId', 'recipientUid', 'membershipId', 'role'].map(field => [field, value[field]]));
}
async function completeOpen(id) {
  handled = [...handled.filter(value => value !== id), id].slice(-100);
  if (pending?.notificationId === id) { pending = null; await AsyncStorage.removeItem(pendingKey); }
  await AsyncStorage.setItem(handledKey, JSON.stringify(handled));
}
export async function retryNativePushOpen() {
  await load();
  if (opening || !pending || !context || accessStatus !== 'ready' || !openListeners.size) return;
  opening = true; const data = pending, user = context, ticket = generation;
  try {
    if (handled.includes(data.notificationId)) { await completeOpen(data.notificationId); return; }
    if (!belongs(data)) { await completeOpen(data.notificationId); update({ error: 'This notification belongs to a different work account.' }); return; }
    await assertAccount(user); if (!current(user, ticket)) return;
    const result = await readWorkspace('jobs', { id: data.jobId });
    if (!current(user, ticket) || accessStatus !== 'ready' || pending?.notificationId !== data.notificationId) return;
    const job = result.job;
    if (!job || job.companyId !== user.companyId || (user.role === 'technician' && job.assignedTo !== user.membershipId)) throw Object.assign(new Error('This work order is no longer assigned to your workspace.'), { code: 'permission-denied' });
    for (const listener of openListeners) {
      if (await listener({ job, notificationId: data.notificationId }) !== false) { await completeOpen(data.notificationId); update({ error: '', message: 'Work order opened from notification.' }); break; }
    }
  } catch (failure) {
    if (!current(user, ticket) || accessStatus !== 'ready') return;
    if (['permission-denied', 'not-found', 'unauthenticated'].includes(String(failure.code || '').split('/').pop())) await completeOpen(data.notificationId);
    update({ error: failure.message || 'This work order could not be opened. Reconnect and retry the notification.' });
  } finally { opening = false; if (pending && pending.notificationId !== data.notificationId) void retryNativePushOpen(); }
}
export const subscribePushJobOpen = listener => { openListeners.add(listener); void retryNativePushOpen(); return () => openListeners.delete(listener); };
export const subscribePushUpdates = listener => { receivedListeners.add(listener); return () => receivedListeners.delete(listener); };
export async function receivePushResponse(response) {
  await load(); const data = safeData(response?.notification?.request?.content?.data);
  if (!data || handled.includes(data.notificationId)) return;
  pending = data; await AsyncStorage.setItem(pendingKey, JSON.stringify(data));
  await Notifications.clearLastNotificationResponseAsync?.(); await retryNativePushOpen();
}
export async function setNativePushScope(user, status = 'ready') {
  await load();
  accessStatus = status;
  if (key(user) !== key(context)) {
    generation++; context = user || null;
    update({ available: false, registered: !!user && registration?.scope === key(user), preferences: defaults, permission: 'undetermined', error: '', message: '' });
    if ((registration && registration.scope !== key(user)) || registering) await invalidateNativePush();
  }
  if (key(user) !== key(context) || accessStatus !== status) return;
  if (user && status === 'ready') {
    try { await retryInvalidations(); await refreshNativePush(user); await retryNativePushOpen(); }
    catch (failure) { if (key(user) === key(context)) update({ error: failure.message || 'Native notification registration could not be checked. Reconnect and retry.' }); throw failure; }
  }
}
async function retryInvalidations() {
  for (const previous of invalidations.filter(value => value.uid === auth.currentUser?.uid)) {
    await callWorkspace('rlNativePush', { action: previous.installationRelease ? 'invalidate-installation' : 'invalidate', deviceId: previous.deviceId, installationId: await installationId(), registrationSequence: previous.registrationSequence }, { timeout: 5000 });
    invalidations = invalidations.filter(value => (value.requestId || value.deviceId) !== (previous.requestId || previous.deviceId)); await AsyncStorage.setItem(invalidationsKey, JSON.stringify(invalidations));
  }
}
export async function refreshNativePush(user = context) {
  if (!user?.companyId || accessStatus !== 'ready') return;
  await load(); const ticket = generation; await assertAccount(user);
  await retryInvalidations();
  const result = await callWorkspace('rlNativePush', { action: 'status' });
  if (!current(user, ticket)) return;
  const permission = await Notifications.getPermissionsAsync(); if (!current(user, ticket)) return;
  update({ available: result.available === true, preferences: result.preferences, permission: granted(permission) ? 'granted' : permission.status, registered: registration?.scope === key(user) && granted(permission), error: '', message: result.available ? '' : 'Native push awaits APNs/Android FCM credentials and production activation.' });
  if (registration?.scope === key(user) && (!granted(permission) || !result.preferences.enabled)) await invalidateNativePush({ unregisterNative: !result.preferences.enabled });
  else if (registration?.scope === key(user) && result.available && result.preferences.enabled && granted(permission)) await registerNativePush(user, false);
}
async function registerNativePush(user, askPermission) {
  if (registering?.scope === key(user) && registering.generation === generation) return registering.promise;
  const task = (async () => {
    const ticket = generation; await load(); await assertAccount(user);
    if (!Device.isDevice) throw new Error('Native push requires a physical iPhone or Android device and a development or production build.');
    if (!state.available) throw new Error('Native push awaits production credentials and activation.');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    if (!projectId) throw new Error('This build has no EAS project ID. Rebuild with the existing Route Logistics Expo project.');
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('work-updates', { name: 'Work updates', importance: Notifications.AndroidImportance.HIGH, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE, vibrationPattern: [0, 200, 100, 200] });
    const release = askPermission ? beginNativeInteraction() : () => {};
    let permission;
    try { permission = askPermission ? await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } }) : await Notifications.getPermissionsAsync(); } finally { release(); }
    if (!current(user, ticket)) return;
    if (!granted(permission)) { update({ permission: permission.status }); throw new Error('Notifications are off in device Settings. Allow notifications, then enable them here.'); }
    let token;
    try { token = (await Notifications.getExpoPushTokenAsync({ projectId })).data; } catch { throw new Error('This build could not register for native push. Verify APNs/FCM credentials and rebuild the app.'); }
    if (!current(user, ticket)) return;
    const registrationSequence = await nextSequence(), proof = await installationId(); if (!current(user, ticket)) return;
    const result = await callWorkspace('rlNativePush', { action: 'register', token, projectId, platform: Platform.OS, installationId: proof, registrationSequence }, { timeout: 8000 });
    if (!current(user, ticket)) return;
    registration = { deviceId: result.deviceId, registrationSequence: result.registrationSequence, scope: key(user), uid: user.id }; await AsyncStorage.setItem(registrationKey, JSON.stringify(registration));
    update({ registered: true, permission: 'granted', preferences: result.preferences, error: '', message: 'Native work notifications are enabled for this company account.' });
  })();
  const active = { promise: task, scope: key(user), generation }; registering = active; try { return await task; } finally { if (registering === active) registering = null; }
}
export async function enableNativePush() {
  const user = context; if (!user || accessStatus !== 'ready') throw new Error('Refresh your company access before enabling notifications.');
  update({ busy: true, error: '' });
  try { if (!state.available) throw new Error('Native push awaits APNs/FCM production credentials and activation.'); await saveNativePushPreferences({ enabled: true }); await registerNativePush(user, true); }
  catch (failure) { update({ error: failure.message }); throw failure; }
  finally { update({ busy: false }); }
}
export async function saveNativePushPreferences(preferences) {
  const user = context, ticket = generation; await assertAccount(user);
  const result = await callWorkspace('rlNativePush', { action: 'preferences', preferences });
  if (!current(user, ticket)) return;
  update({ preferences: result.preferences, error: '', message: 'Native notification preferences saved.' });
  if (preferences.enabled === false) await invalidateNativePush();
}
export async function invalidateNativePush({ unregisterNative = true } = {}) {
  await load(); generation++; const previous = registration; registration = null; pending = null;
  await Promise.all([AsyncStorage.removeItem(registrationKey), AsyncStorage.removeItem(pendingKey)]);
  update({ registered: false, preferences: { ...state.preferences, enabled: false }, error: '', message: 'Native notifications are off on this device.' });
  if (previous) { invalidations = [...invalidations.filter(value => value.deviceId !== previous.deviceId), previous].slice(-20); await AsyncStorage.setItem(invalidationsKey, JSON.stringify(invalidations)); }
  const proof = await SecureStore.getItemAsync(installationKey);
  if (proof && auth.currentUser?.uid) { invalidations = [...invalidations.filter(value => !value.installationRelease), { installationRelease: true, requestId: 'installation-release', uid: auth.currentUser.uid, registrationSequence: await nextSequence() }].slice(-20); await AsyncStorage.setItem(invalidationsKey, JSON.stringify(invalidations)); }
  if (unregisterNative) await Notifications.unregisterForNotificationsAsync?.().catch(() => {});
  await Notifications.dismissAllNotificationsAsync?.().catch(() => {});
  if (invalidations.some(value => value.uid === auth.currentUser?.uid)) {
    try { await retryInvalidations(); }
    catch { update({ message: 'Native registration stopped on this device. Server invalidation will need to be retried after reconnecting.' }); }
  }
}
export async function signOutNativePush() { context = null; accessStatus = 'signed-out'; await invalidateNativePush(); update({ available: false, preferences: defaults }); }
export function initializeNativePush() {
  if (initialized) return; initialized = true;
  Notifications.setNotificationHandler({ handleNotification: async notification => { const data = safeData(notification.request.content.data), allow = accessStatus === 'ready' && !!data && belongs(data) && !!categoryEnabled(data); return { shouldShowBanner: allow, shouldShowList: allow, shouldPlaySound: allow, shouldSetBadge: false }; } });
  Notifications.addNotificationResponseReceivedListener(response => { void receivePushResponse(response).catch(() => update({ error: 'Notification navigation could not be restored. Open your schedule to view current work.' })); });
  Notifications.addNotificationReceivedListener(notification => { const data = safeData(notification.request.content.data); if (data && belongs(data) && accessStatus === 'ready' && !receivedIds.has(data.notificationId)) { receivedIds.add(data.notificationId); if (receivedIds.size > 100) receivedIds.delete(receivedIds.values().next().value); receivedListeners.forEach(listener => listener(data)); } });
  Notifications.addPushTokenListener(() => { if (context && registration?.scope === key(context) && accessStatus === 'ready') void registerNativePush(context, false).catch(() => update({ error: 'Device notification token changed. Re-enable native notifications to refresh registration.' })); });
  AppState.addEventListener('change', value => { if (value === 'active' && context && accessStatus === 'ready') void refreshNativePush().catch(() => update({ error: 'Could not refresh native notification registration. Reconnect and retry.' })); });
  void Notifications.getLastNotificationResponseAsync().then(response => response && receivePushResponse(response)).catch(() => update({ error: 'The last notification could not be restored. Open your schedule to view current work.' }));
}
