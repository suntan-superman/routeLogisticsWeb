import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { onIdTokenChanged } from 'firebase/auth';
import { auth } from '../constants/firebase';
import { callWorkspace } from './workspaceApi';
import { beginNativeInteraction } from './nativeInteraction';

export const WORK_TRACKING_TASK = 'rl-on-duty-location-v1';
const storageKey = `rl-work-tracking-v1:${auth.app.options.projectId}`;
const maximumSamples = 60, listeners = new Set();
const defaultPolicy = { intervalMinutes: 3, retentionHours: 24, maxShiftHours: 12, freshAfterSeconds: 300 };
let metadata = null, samples = [], loaded = false, loading, persistence = Promise.resolve();
let generation = 0, timer, expiryTimer, capturing = null, sending = null, starting = false, initialized = false, pendingActive = null;
const emptyView = () => ({ scopeKey: null, shift: null, policy: defaultPolicy, tracking: false, background: false, pendingCount: 0, lastCapturedAt: null, lastAcceptedAt: null, lastAccuracy: null, error: '', message: '' });
let view = emptyView();
const update = patch => { view = { ...view, ...patch }; listeners.forEach(listener => listener({ ...view })); };
const sameScope = (first, second) => !!first && !!second && ['uid', 'companyId', 'membershipId', 'role'].every(key => (first[key] || '') === (second[key] || ''));
const userScope = user => ({ uid: user?.id, companyId: user?.companyId, membershipId: user?.membershipId || null, role: user?.role || null });
const scopeKey = scope => [scope?.uid, scope?.companyId, scope?.role, scope?.membershipId].join(':');
export const workTrackingSnapshot = user => user && view.scopeKey !== scopeKey(userScope(user)) ? emptyView() : ({ ...view });
export const subscribeWorkTracking = (listener, user) => { const scoped = () => listener(workTrackingSnapshot(user)); listeners.add(scoped); scoped(); return () => listeners.delete(scoped); };
function bindView(scope) { const key = scopeKey(scope); if (view.scopeKey !== key) update({ ...emptyView(), scopeKey: key }); }
const code = failure => String(failure?.code || '').split('/').pop();
const denied = failure => ['permission-denied', 'unauthenticated', 'failed-precondition', 'not-found'].includes(code(failure));
const expired = value => !value?.expiresAt || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now();
const policyFor = value => ({ ...defaultPolicy, ...value, intervalMinutes: [1, 3, 5].includes(value?.intervalMinutes) ? value.intervalMinutes : 3 });
function persist() {
  const value = metadata ? JSON.stringify({ metadata, samples }) : null;
  const write = () => value === null ? AsyncStorage.removeItem(storageKey) : AsyncStorage.setItem(storageKey, value);
  persistence = persistence.catch(() => {}).then(write); return persistence;
}
async function load() {
  if (loaded) return;
  if (!loading) loading = (async () => {
    let saved;
    try { saved = JSON.parse(await AsyncStorage.getItem(storageKey) || 'null'); }
    catch { saved = null; await AsyncStorage.removeItem(storageKey); await stopNative(); update({ error: 'Saved shift tracking was unavailable. Confirm your shift before sharing again.' }); }
    metadata = saved?.metadata?.trackingConsent === true ? saved.metadata : null;
    samples = metadata && Array.isArray(saved?.samples) ? saved.samples.slice(-maximumSamples) : [];
    loaded = true;
  })().finally(() => { loading = null; });
  await loading;
}
async function verifiedAccount(expected) {
  await auth.authStateReady();
  const account = auth.currentUser;
  if (!account || account.uid !== expected.uid || !account.emailVerified) throw Object.assign(new Error('Sign in with your verified work account before sharing location.'), { code: 'unauthenticated' });
  const { claims } = await account.getIdTokenResult();
  if (auth.currentUser?.uid !== account.uid || !sameScope(expected, { uid: account.uid, ...claims })) throw Object.assign(new Error('Your company or role changed. Location sharing has stopped.'), { code: 'permission-denied' });
  return account;
}
function stopTimers() { clearInterval(timer); clearTimeout(expiryTimer); timer = null; expiryTimer = null; }
function waitForForeground(ticket) {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = failure => { subscription.remove(); pendingActive = null; failure ? reject(failure) : resolve(); };
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') finish(ticket === generation ? null : new Error('Shift start was cancelled.'));
    });
    pendingActive = () => finish(new Error('Shift start was cancelled.'));
  });
}
async function stopNative() {
  stopTimers();
  if (await Location.hasStartedLocationUpdatesAsync(WORK_TRACKING_TASK)) await Location.stopLocationUpdatesAsync(WORK_TRACKING_TASK);
}

// This clears only optional GPS samples. Job operations and photo queues are separate.
// Clear durable consent before network work so an offline end can never restart tracking.
export async function stopShiftTracking({ endShift = false, reason = 'Location sharing stopped on this device.' } = {}) {
  await load();
  const previous = metadata, shiftId = previous?.shiftId || view.shift?.id;
  generation++; pendingActive?.(); metadata = null; samples = [];
  update({ tracking: false, background: false, pendingCount: 0, message: reason });
  const clearing = persist();
  let nativeFailure;
  try { await stopNative(); } catch (failure) { nativeFailure = failure; }
  await clearing;
  if (endShift && shiftId) {
    try {
      const result = await callWorkspace('rlWorkShift', { action: 'end', shiftId }, { timeout: 8000 });
      update({ shift: result.shift, policy: policyFor(result.policy), error: '', message: 'Shift ended. Location sharing is off. Unsent GPS samples were removed from this device.' });
    } catch (failure) {
      update({ error: `Sharing stopped on this device. The server shift end is not confirmed. Reconnect and select End shift again. ${failure.message || ''}`.trim() });
      throw failure;
    }
  }
  if (nativeFailure) { update({ error: 'Unable to confirm native location shutdown. Turn off location permission in device Settings and reopen the app.' }); throw nativeFailure; }
}
async function failClosed(failure) {
  await stopShiftTracking({ reason: 'Location sharing stopped. Resume only after checking your shift and workspace access.' });
  update({ error: failure.message || 'The current shift is no longer authorized.' });
}
function publishMetadata() {
  if (!metadata) return;
  update({ tracking: true, background: metadata.backgroundConsent, pendingCount: samples.length, lastCapturedAt: metadata.lastCapturedAt || null, lastAcceptedAt: metadata.lastAcceptedAt || null, lastAccuracy: metadata.lastAccuracy ?? null });
}
async function flush(ticket) {
  if (sending === ticket || !metadata || ticket !== generation) return;
  sending = ticket;
  try {
    const current = metadata; await verifiedAccount(current);
    if (ticket !== generation || metadata !== current) return;
    if (expired(current)) { await stopShiftTracking({ reason: 'Your shift expired. Start a new shift to share work location.' }); return; }
    while (samples.length && ticket === generation && metadata === current) {
      const sample = samples[0];
      const result = await callWorkspace('rlUpdateWorkLocation', { action: 'position', sessionId: current.sessionId, ...sample });
      if (ticket !== generation || metadata !== current) return;
      samples.shift();
      if (result.accepted !== false && (!current.lastAcceptedAt || Date.parse(sample.capturedAt) >= Date.parse(current.lastAcceptedAt))) { current.lastAcceptedAt = sample.capturedAt; current.lastAccuracy = sample.accuracy; }
      const policy = policyFor(result.policy || view.policy), intervalChanged = current.intervalMinutes !== policy.intervalMinutes;
      current.intervalMinutes = policy.intervalMinutes; current.retentionHours = policy.retentionHours;
      await persist(); publishMetadata(); update({ policy, error: '', message: result.accepted === false ? 'An older GPS sample was reconciled without replacing the latest shared fix.' : 'Work location shared. The update time is the GPS capture time.' });
      if (intervalChanged && ticket === generation) await configureTracking();
    }
  } catch (failure) {
    if (ticket !== generation) return;
    if (denied(failure)) await failClosed(failure);
    else { publishMetadata(); update({ message: 'Connection unavailable. Captured GPS samples are saved only for this shift and retried while it remains authorized.', error: '' }); }
  } finally { if (sending === ticket) sending = null; }
}
async function recordLocations(locations, ticket = generation) {
  if (!metadata || ticket !== generation) return;
  const current = metadata; await verifiedAccount(current);
  if (ticket !== generation || metadata !== current) return;
  if (expired(current)) { await stopShiftTracking({ reason: 'Your shift expired. Location sharing is off.' }); return; }
  const previousCapture = current.lastCapturedAt; let unknownAccuracy = false;
  for (const position of locations) {
    const timestamp = Number(position?.timestamp), latitude = position?.coords?.latitude, longitude = position?.coords?.longitude;
    const accuracy = position?.coords?.accuracy;
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 5000) { unknownAccuracy = true; continue; }
    if (!Number.isFinite(timestamp) || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || timestamp > Date.now() + 120000 || timestamp < Date.parse(current.startedAt) || (current.lastCapturedAt && timestamp < Date.parse(current.lastCapturedAt) + current.intervalMinutes * 60000)) continue;
    const capturedAt = new Date(timestamp).toISOString();
    samples.push({ latitude, longitude, accuracy, capturedAt }); current.lastCapturedAt = capturedAt;
  }
  const oldest = Date.now() - Math.min(Number(current.retentionHours) || 24, 24) * 3600000;
  samples = samples.filter(sample => Date.parse(sample.capturedAt) >= oldest).slice(-maximumSamples);
  await persist(); publishMetadata(); await flush(ticket);
  if (unknownAccuracy && ticket === generation && current.lastCapturedAt === previousCapture) update({ error: 'GPS accuracy was unavailable. No unknown-accuracy position was shared. Check device location settings; the next interval will try again.' });
}
export async function captureWorkPosition() {
  const ticket = generation;
  if (capturing === ticket || !metadata || AppState.currentState !== 'active') return;
  capturing = ticket;
  try {
    const current = metadata; await verifiedAccount(current);
    if (ticket !== generation || metadata !== current) return;
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) throw Object.assign(new Error('Location permission is off. Enable it in device Settings, then resume sharing.'), { code: 'permission-denied' });
    if (ticket !== generation || metadata !== current || AppState.currentState !== 'active') return;
    // Request a new fix each interval, even when stationary. Never relabel a cached fix.
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    if (ticket === generation && (AppState.currentState === 'active' || metadata?.backgroundConsent)) await recordLocations([position], ticket);
  } catch (failure) {
    if (ticket !== generation) return;
    if (denied(failure)) await failClosed(failure);
    else update({ error: failure.message || 'A fresh GPS position is unavailable. Check device location settings; the next interval will try again.' });
  } finally { if (capturing === ticket) capturing = null; }
}
function startTimer() {
  clearInterval(timer); timer = null;
  if (!metadata || AppState.currentState !== 'active') return;
  timer = setInterval(() => { void captureWorkPosition(); }, metadata.intervalMinutes * 60000);
}
async function configureTracking() {
  if (!metadata) return;
  const current = metadata, ticket = generation;
    if (current.backgroundConsent) {
    if (ticket !== generation || metadata !== current) return;
    await Location.startLocationUpdatesAsync(WORK_TRACKING_TASK, {
      accuracy: Location.Accuracy.Balanced, timeInterval: current.intervalMinutes * 60000, distanceInterval: 0,
      deferredUpdatesInterval: current.intervalMinutes * 60000, deferredUpdatesDistance: 0,
      pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true,
      foregroundService: { notificationTitle: 'Route Logistics shift active', notificationBody: 'Work location is shared while on duty. Open Route Logistics and End shift to stop.', notificationColor: '#087A4B', killServiceOnDestroy: true },
    });
    if (ticket !== generation || metadata !== current) { await stopNative(); return; }
  }
  if (ticket !== generation || metadata !== current) return;
  clearTimeout(expiryTimer);
  expiryTimer = setTimeout(() => { void stopShiftTracking({ reason: 'Your shift expired. Location sharing is off.' }); }, Math.max(0, Date.parse(current.expiresAt) - Date.now()));
  startTimer(); publishMetadata();
}
export async function startWorkShift(user, { trackingConsent = false, backgroundConsent = false } = {}) {
  if (starting) return;
  if (!trackingConsent || !user?.companyId) throw new Error('Choose Start shift and confirm work location sharing for your company.');
  starting = true; const ticket = ++generation, release = beginNativeInteraction();
  const current = () => { if (ticket !== generation) throw Object.assign(new Error('Shift start was cancelled. Location sharing is off.'), { code: 'cancelled' }); };
  try {
    await load(); current(); const scope = userScope(user); await verifiedAccount(scope); current(); bindView(scope);
    const foreground = await Location.requestForegroundPermissionsAsync();
    current();
    if (!foreground.granted) throw new Error('Location permission is required to share during a shift. Enable it in device Settings.');
    if (backgroundConsent) {
      const background = await Location.requestBackgroundPermissionsAsync();
      current();
      if (!background.granted) throw new Error('Background permission was not granted. Choose app-open sharing or enable Always location in device Settings.');
    }
    await waitForForeground(ticket); current();
    await verifiedAccount(scope); current();
    const result = await callWorkspace('rlWorkShift', { action: 'start', trackingConsent: true });
    current();
    const shift = result.shift;
    if (!shift || shift.status !== 'on-duty' || shift.trackingConsent !== true || expired(shift)) throw new Error('The server did not authorize an active shift. Refresh your workspace before trying again.');
    update({ shift, policy: policyFor(result.policy) });
    const response = await callWorkspace('rlUpdateWorkLocation', { action: 'start', shiftId: shift.id });
    await verifiedAccount(scope); current();
    if (typeof response.sessionId !== 'string' || !response.sessionId) throw new Error('The server did not authorize a tracking session. Refresh your shift and retry.');
    const policy = policyFor(response.policy || result.policy);
    metadata = { ...scope, shiftId: shift.id, sessionId: response.sessionId, startedAt: shift.startedAt, expiresAt: shift.expiresAt, trackingConsent: true, backgroundConsent: backgroundConsent === true, intervalMinutes: policy.intervalMinutes, retentionHours: policy.retentionHours };
    samples = []; await persist();
    update({ shift, policy, lastCapturedAt: null, lastAcceptedAt: null, lastAccuracy: null, error: '', message: backgroundConsent ? 'On duty. Background location is enabled until End shift or shift expiry.' : 'On duty. Location is shared only while this app is open.' });
    try { await configureTracking(); } catch (failure) { await stopShiftTracking(); throw failure; }
    void captureWorkPosition(); return workTrackingSnapshot();
  } catch (failure) { update({ error: failure.message || 'Your shift could not start. Check your connection and permissions.' }); throw failure; }
  finally { starting = false; release(); }
}
export async function refreshWorkShift(user) {
  await load();
  const scope = userScope(user);
  if (metadata && !sameScope(metadata, scope)) await stopShiftTracking({ reason: 'Work account changed. Location sharing is off.' });
  bindView(scope);
  const ticket = generation;
  let result;
  try { await verifiedAccount(scope); result = await callWorkspace('rlWorkShift', { action: 'status' }); }
  catch (failure) { if (ticket === generation && metadata && denied(failure)) await failClosed(failure); throw failure; }
  if (ticket !== generation) return workTrackingSnapshot();
  update({ shift: result.shift, policy: policyFor(result.policy), error: '' });
  if (metadata) {
    if (expired(metadata) || result.shift?.id !== metadata.shiftId || result.shift?.status !== 'on-duty' || result.shift?.trackingConsent !== true) await stopShiftTracking({ reason: 'Your shift is no longer active. Location sharing is off.' });
    else {
      const current = metadata, foreground = await Location.getForegroundPermissionsAsync();
      if (ticket !== generation || metadata !== current) return workTrackingSnapshot();
      const background = current.backgroundConsent ? await Location.getBackgroundPermissionsAsync() : null;
      if (ticket !== generation || metadata !== current) return workTrackingSnapshot();
      if (!foreground.granted || (current.backgroundConsent && !background?.granted)) await stopShiftTracking({ reason: 'Location permission changed. Confirm permissions to resume sharing.' });
      else { current.intervalMinutes = policyFor(result.policy).intervalMinutes; await persist(); await configureTracking(); }
    }
  }
  return workTrackingSnapshot();
}
export async function handleBackgroundWorkLocations({ data, error }) {
  const ticket = generation;
  try {
    await load();
    if (!metadata?.backgroundConsent) { await stopNative(); return; }
    if (error) { await failClosed(error); return; }
    await recordLocations((data?.locations || []).sort((a, b) => a.timestamp - b.timestamp));
  } catch (failure) {
    if (ticket !== generation) return;
    if (denied(failure)) await failClosed(failure);
    else update({ error: failure.message || 'Background location could not synchronize. Open the app to check your shift.' });
  }
}
export function initializeWorkTracking() {
  if (initialized) return; initialized = true;
  AppState.addEventListener('change', state => {
    if (state !== 'active') { clearInterval(timer); timer = null; }
    else if (metadata) { startTimer(); void captureWorkPosition(); }
  });
  onIdTokenChanged(auth, async account => {
    const current = metadata, ticket = generation;
    try { await load(); await auth.authStateReady(); if ((account?.uid || null) !== (auth.currentUser?.uid || null)) return; if (!account) { if (metadata) await stopShiftTracking({ reason: 'Signed out. Location sharing is off.' }); update(emptyView()); return; } if (view.scopeKey && !view.scopeKey.startsWith(`${account.uid}:`)) update(emptyView()); if (!metadata) return; await verifiedAccount(metadata); }
    catch (failure) { if (ticket !== generation || (current && current !== metadata)) return; if (denied(failure)) await failClosed(failure); else update({ error: 'Could not verify tracking access. Open the app to check your shift.' }); }
  });
}
