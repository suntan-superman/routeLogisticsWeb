const { test } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), babel = require('@babel/core');
const React = require('react'), { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..'), projectId = 'a6b5d885-dd99-4435-bef0-b7ffe09a2890';
function fixture(seed = []) {
  const store = new Map(seed), secure = new Map(), modules = new Map(), calls = [], appListeners = new Set();
  const env = { store, secure, calls, registrationOrder: [], available: true, preferences: { enabled: true, assignments: true, schedule: true, status: true }, permission: 'undetermined', asks: 0, tokenRequests: 0, nativeUnregisters: 0, readCalls: 0, interactions: 0, channels: [], handler: null, responseListener: null, receiveListener: null, tokenListener: null, coldResponse: null, lastCleared: 0, platform: 'ios', physical: true, accessStatus: 'ready', invalidationFailure: null, readFailure: null, tokenFailure: false, token: 'ExpoPushToken[test-device-12345678]', user: { id: 'tech', companyId: 'acme', membershipId: 'member', role: 'technician' }, claims: { companyId: 'acme', membershipId: 'member', role: 'technician' } };
  env.permissionRequest = async () => { env.permission = 'granted'; return { granted: true, status: 'granted' }; };
  env.read = async ({ id }) => ({ job: { id, companyId: 'acme', assignedTo: 'member', status: 'scheduled', customerName: 'Authorized work' } });
  env.auth = { app: { options: { projectId: 'firebase-project' } }, authStateReady: async () => {}, currentUser: { uid: 'tech', emailVerified: true, getIdTokenResult: async () => ({ claims: env.claims }) } };
  const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', Switch: 'Switch', Platform: { get OS() { return env.platform; } }, AppState: { currentState: 'active', addEventListener: (_event, listener) => { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } }, Linking: { openSettings: async () => {} } };
  const notifications = {
    IosAuthorizationStatus: { PROVISIONAL: 3 }, AndroidImportance: { HIGH: 4 }, AndroidNotificationVisibility: { PRIVATE: 0 },
    getPermissionsAsync: async () => ({ granted: env.permission === 'granted', status: env.permission }), requestPermissionsAsync: async () => { env.asks++; env.registrationOrder.push('permission'); return env.permissionRequest(); },
    getExpoPushTokenAsync: async options => { env.tokenRequests++; env.registrationOrder.push('expo-token'); assert.equal(options.projectId, projectId); if (env.tokenFailure) throw new Error('Private provider failure details'); return { data: env.token }; },
    setNotificationChannelAsync: async (id, options) => { env.registrationOrder.push('channel'); env.channels.push({ id, options }); }, unregisterForNotificationsAsync: async () => env.nativeUnregisters++, dismissAllNotificationsAsync: async () => {},
    setNotificationHandler: value => { env.handler = value; }, addNotificationResponseReceivedListener: listener => { env.responseListener = listener; return { remove() {} }; }, addNotificationReceivedListener: listener => { env.receiveListener = listener; return { remove() {} }; }, addPushTokenListener: listener => { env.tokenListener = listener; return { remove() {} }; }, getLastNotificationResponseAsync: async () => env.coldResponse, clearLastNotificationResponseAsync: async () => env.lastCleared++,
  };
  function load(relative) {
    const file = path.resolve(root, relative); if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} }; modules.set(file, module);
    const mockRequire = name => {
      if (name === 'react') return React;
      if (name.startsWith('@babel/runtime/')) return require(name);
      if (name === 'react-native') return native;
      if (name === 'expo-notifications') return notifications;
      if (name === 'expo-device') return { get isDevice() { return env.physical; } };
      if (name === 'expo-constants') return { expoConfig: { extra: { eas: { projectId } } } };
      if (name === 'expo-crypto') return { randomUUID: () => '11111111-1111-4111-8111-111111111111' };
      if (name === 'expo-secure-store') return { getItemAsync: async key => secure.get(key) || null, setItemAsync: async (key, value) => secure.set(key, value) };
      if (name === '@react-native-async-storage/async-storage') return { getItem: async key => store.get(key) || null, setItem: async (key, value) => store.set(key, value), removeItem: async key => store.delete(key) };
      if (name.endsWith('/constants/firebase')) return { auth: env.auth };
      if (name.endsWith('/nativeInteraction')) return { beginNativeInteraction: () => { env.interactions++; return () => env.interactions--; } };
      if (name.endsWith('/workspaceApi')) return {
        readWorkspace: async (resource, options) => { assert.equal(resource, 'jobs'); env.readCalls++; if (env.readFailure) throw env.readFailure; return env.read(options); },
        callWorkspace: async (name, data, options) => { calls.push({ name, ...data, options }); assert.equal(name, 'rlNativePush');
          if (data.action === 'status') return { available: env.available, preferences: env.preferences, projectId };
          if (data.action === 'preferences') { env.preferences = { ...env.preferences, ...data.preferences }; return { available: env.available, preferences: env.preferences }; }
          if (['invalidate', 'invalidate-installation'].includes(data.action) && env.invalidationFailure) throw env.invalidationFailure;
          if (data.action === 'register') env.registrationOrder.push('backend-register');
          if (data.action === 'register' && env.registerReply) return env.registerReply(data);
          return data.action === 'register' ? { available: true, deviceId: 'device', registrationSequence: data.registrationSequence, preferences: env.preferences } : { invalidated: true };
        },
      };
      if (name.endsWith('/AuthContext')) return { useAuth: () => ({ user: env.user, accessStatus: env.accessStatus }) };
      if (name.endsWith('/ThemeProvider')) return { useTheme: () => ({ palette: { text: '#fff', secondary: '#bdd', danger: '#faa', border: '#375', button: '#087' } }) };
      if (name === './Glass') return { GlassCard: ({ children }) => React.createElement('View', null, children), GlassButton: ({ title, onPress, disabled }) => React.createElement('Pressable', { accessibilityLabel: title, disabled, onPress }, React.createElement('Text', null, title)) };
      if (name.endsWith('/services/nativePush') || name === './nativePush') return load('services/nativePush.js');
      throw new Error(`Unexpected dependency ${name}`);
    };
    const transformed = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] });
    new Function('require', 'module', 'exports', transformed.code)(mockRequire, module, module.exports); return module.exports;
  }
  env.load = load; env.api = load('services/nativePush.js'); return env;
}
const settle = async () => { for (let index = 0; index < 3; index++) await new Promise(resolve => setImmediate(resolve)); };
const data = (patch = {}) => ({ type: 'job-assignment', notificationId: 'notification1', jobId: 'job', companyId: 'acme', recipientUid: 'tech', membershipId: 'member', role: 'technician', ...patch });
const response = value => ({ notification: { request: { content: { data: value } } } });
async function ready(env) { await env.api.setNativePushScope(env.user, 'ready'); await settle(); }

test('disabled native delivery has an actionable status and never prompts or obtains a push token', async () => {
  const env = fixture(); env.available = false; await ready(env); await assert.rejects(env.api.enableNativePush(), /credentials and activation/);
  assert.equal(env.asks, 0); assert.equal(env.tokenRequests, 0); assert.match(env.api.nativePushSnapshot().message, /APNs/);
});
test('only explicit enable requests permission and registers the existing EAS project without storing token values', async () => {
  const env = fixture(); await ready(env); assert.equal(env.asks, 0); await env.api.enableNativePush();
  assert.equal(env.asks, 1); assert.equal(env.tokenRequests, 1); assert.equal(env.interactions, 0); assert.equal(env.api.nativePushSnapshot().registered, true);
  const call = env.calls.find(item => item.action === 'register'); assert.equal(call.projectId, projectId); assert.equal(call.uid, undefined); assert.equal(call.companyId, undefined);
  assert.doesNotMatch(JSON.stringify([...env.store]), /ExpoPushToken|password|refreshToken/); assert.equal(env.secure.size, 2);
});
test('permission denial and missing provider credentials produce actionable failures without registration', async () => {
  const env = fixture(); await ready(env); env.permissionRequest = async () => ({ granted: false, status: 'denied' });
  await assert.rejects(env.api.enableNativePush(), /device Settings/); assert.equal(env.calls.filter(item => item.action === 'register').length, 0);
  env.permissionRequest = async () => ({ granted: true, status: 'granted' }); env.tokenFailure = true; await assert.rejects(env.api.enableNativePush(), /Verify APNs\/FCM/); assert.doesNotMatch(env.api.nativePushSnapshot().error, /Private provider/);
});
test('Android creates its channel before permission and Expo token registration, then rotates and invalidates its own device', async () => {
  const env = fixture(); env.platform = 'android'; env.api.initializeNativePush(); await ready(env); await env.api.enableNativePush();
  assert.deepEqual(env.registrationOrder, ['channel', 'permission', 'expo-token', 'backend-register']);
  assert.deepEqual(env.channels[0], { id: 'work-updates', options: { name: 'Work updates', importance: 4, lockscreenVisibility: 0, vibrationPattern: [0, 200, 100, 200] } });
  const original = env.calls.find(item => item.action === 'register'); assert.equal(original.platform, 'android'); assert.equal(original.projectId, projectId); assert.equal(original.uid, undefined); assert.equal(original.companyId, undefined);
  env.token = 'ExpoPushToken[rotated-token-123456789]'; env.tokenListener({ type: 'android', data: 'do-not-send-native-FCM-token' }); await settle();
  assert.equal(env.asks, 1); assert.equal(env.calls.filter(item => item.action === 'register').length, 2); assert.equal(env.calls.filter(item => item.action === 'register').at(-1).token, env.token);
  const rotated = env.calls.filter(item => item.action === 'register').at(-1); assert.equal(rotated.platform, 'android'); assert.ok(rotated.registrationSequence > original.registrationSequence);
  assert.deepEqual(env.registrationOrder.slice(4), ['channel', 'expo-token', 'backend-register']);
  assert.doesNotMatch(JSON.stringify(env.calls), /do-not-send-native-FCM-token/);
  await env.api.signOutNativePush();
  assert.equal(env.nativeUnregisters, 1); assert.equal(env.api.nativePushSnapshot().registered, false);
  assert.equal(env.calls.find(item => item.action === 'invalidate').deviceId, 'device');
  assert.equal(env.calls.find(item => item.action === 'invalidate').registrationSequence, rotated.registrationSequence);
  assert.ok(env.calls.find(item => item.action === 'invalidate-installation').registrationSequence > rotated.registrationSequence);
  assert.doesNotMatch(JSON.stringify([...env.store]), /ExpoPushToken|do-not-send-native-FCM-token/);
});

test('Android notification permission denial obtains no token and creates no backend registration', async () => {
  const env = fixture(); env.platform = 'android'; await ready(env);
  assert.equal(env.asks, 0); assert.equal(env.tokenRequests, 0); assert.deepEqual(env.registrationOrder, []);
  env.permissionRequest = async () => { env.permission = 'denied'; return { granted: false, status: 'denied', canAskAgain: false }; };
  await assert.rejects(env.api.enableNativePush(), /device Settings/);
  assert.deepEqual(env.registrationOrder, ['channel', 'permission']); assert.equal(env.tokenRequests, 0);
  assert.equal(env.calls.some(item => item.action === 'register'), false); assert.equal(env.api.nativePushSnapshot().registered, false); assert.equal(env.api.nativePushSnapshot().permission, 'denied');
  assert.equal(env.interactions, 0); assert.equal(env.readCalls, 0);
  const Settings = env.load('components/NativePushSettings.js').default; let tree;
  try {
    await act(async () => { tree = create(React.createElement(Settings)); });
    assert.ok(tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Open notification settings')[0]);
    assert.equal(env.asks, 1, 'rendering Settings must not prompt again or override the denied permission');
  } finally { if (tree) await act(async () => tree.unmount()); }
});
test('offline sign-out unregisters locally, retries invalidation and restores a previously authorized same-account registration', async () => {
  const env = fixture(); await ready(env); await env.api.enableNativePush(); env.invalidationFailure = new Error('offline'); await env.api.signOutNativePush();
  assert.equal(env.nativeUnregisters, 1); assert.equal(env.api.nativePushSnapshot().registered, false); assert.ok([...env.store.keys()].some(item => item.endsWith(':invalidations'))); assert.equal(env.calls.find(item => item.action === 'invalidate').options.timeout, 5000);
  env.invalidationFailure = null; await ready(env); assert.equal(env.calls.filter(item => item.action === 'invalidate').length, 2); assert.equal(env.calls.filter(item => item.action === 'register').length, 2); assert.equal(JSON.parse([...env.store].find(([item]) => item.endsWith(':invalidations'))[1]).length, 0); assert.equal(env.api.nativePushSnapshot().registered, true);
});
test('explicit notification opt-out is remembered and cannot auto-register after sign-out or account restoration', async () => {
  const env = fixture(); await ready(env); await env.api.enableNativePush(); await env.api.saveNativePushPreferences({ enabled: false });
  assert.equal(env.api.nativePushSnapshot().registered, false); assert.equal(env.preferences.enabled, false); const registrations = env.calls.filter(item => item.action === 'register').length;
  await env.api.signOutNativePush(); await ready(env); assert.equal(env.calls.filter(item => item.action === 'register').length, registrations); assert.equal(env.api.nativePushSnapshot().registered, false);
});
test('role or tenant change invalidates the prior device scope without silently enabling the new scope', async () => {
  const env = fixture(); await ready(env); await env.api.enableNativePush(); env.user = { ...env.user, companyId: 'other' }; env.claims = { ...env.claims, companyId: 'other' }; await ready(env);
  assert.equal(env.nativeUnregisters, 1); assert.equal(env.api.nativePushSnapshot().registered, false); assert.equal(env.calls.filter(item => item.action === 'register').length, 1);
});
for (const platform of ['ios', 'android']) test(`${platform} terminated notification taps survive until verified login and open only the authorized server job once`, async () => {
  const env = fixture(); env.platform = platform; env.auth.currentUser = null; env.coldResponse = response(data()); env.api.initializeNativePush(); await settle();
  let opened = []; env.api.subscribePushJobOpen(value => { opened.push(value.job); return true; }); await settle(); assert.equal(env.readCalls, 0);
  env.auth.currentUser = { uid: 'tech', emailVerified: true, getIdTokenResult: async () => ({ claims: env.claims }) }; await ready(env); assert.equal(opened.length, 1); assert.equal(opened[0].customerName, 'Authorized work');
  await env.api.receivePushResponse(response(data())); assert.equal(opened.length, 1); assert.equal(env.readCalls, 1); assert.equal(env.lastCleared, 1);
});
test('cross-tenant payloads and unauthorized job reads never open a work order or revoke the company', async () => {
  const env = fixture(); await ready(env); let opened = 0; env.api.subscribePushJobOpen(() => { opened++; });
  await env.api.receivePushResponse(response(data({ companyId: 'other' }))); assert.equal(env.readCalls, 0); assert.equal(opened, 0);
  env.readFailure = Object.assign(new Error('This job is no longer assigned to you.'), { code: 'functions/permission-denied' }); await env.api.receivePushResponse(response(data({ notificationId: 'another' })));
  assert.equal(opened, 0); assert.equal(env.user.companyId, 'acme'); assert.match(env.api.nativePushSnapshot().error, /no longer assigned/);
});
test('transient notification reads retain pending navigation for an explicit retry', async () => {
  const env = fixture(); await ready(env); let opened = 0; env.api.subscribePushJobOpen(() => { opened++; return true; }); env.readFailure = Object.assign(new Error('Network unavailable'), { code: 'functions/unavailable' });
  await env.api.receivePushResponse(response(data())); assert.equal(opened, 0); assert.ok([...env.store.keys()].some(item => item.endsWith(':open')));
  env.readFailure = null; await env.api.retryNativePushOpen(); assert.equal(opened, 1); assert.equal(env.readCalls, 2);
});

for (const platform of ['ios', 'android']) test(`${platform} removal taps refresh once without opening or reading the revoked job`, async () => {
  const env = fixture(); env.platform = platform; await ready(env); let opened = 0, updates = 0;
  env.api.subscribePushJobOpen(() => { opened++; }); env.api.subscribePushUpdates(() => { updates++; });
  const removal = response(data({ type: 'job-removal', notificationId: 'removed-work' }));
  await env.api.receivePushResponse(removal); await env.api.receivePushResponse(removal);
  assert.equal(opened, 0); assert.equal(env.readCalls, 0); assert.equal(updates, 1);
  assert.match(env.api.nativePushSnapshot().message, /assignment was removed/i);
  assert.equal(env.user.companyId, 'acme');
});

test('management request taps use an authorized job read and never trust a payload from another tenant', async () => {
  const env = fixture(); env.user.role = env.claims.role = 'manager'; await ready(env); let opened = 0;
  env.api.subscribePushJobOpen(() => { opened++; return true; });
  await env.api.receivePushResponse(response(data({ type: 'job-reassignment-request', role: 'manager', notificationId: 'review-request' })));
  assert.equal(opened, 1); assert.equal(env.readCalls, 1);
  await env.api.receivePushResponse(response(data({ type: 'job-reassignment-request', role: 'manager', companyId: 'foreign', notificationId: 'foreign-request' })));
  assert.equal(opened, 1); assert.equal(env.readCalls, 1);
});

test('removal and request foreground alerts respect their existing notification categories', async () => {
  const env = fixture(); env.api.initializeNativePush(); await ready(env);
  await env.api.saveNativePushPreferences({ assignments: false, status: true });
  assert.equal((await env.handler.handleNotification(response(data({ type: 'job-removal' })).notification)).shouldShowBanner, false);
  assert.equal((await env.handler.handleNotification(response(data({ type: 'job-reassignment-request' })).notification)).shouldShowBanner, true);
  await env.api.saveNativePushPreferences({ status: false });
  assert.equal((await env.handler.handleNotification(response(data({ type: 'job-reassignment-request' })).notification)).shouldShowBanner, false);
});
for (const platform of ['ios', 'android']) test(`${platform} foreground presentation is scoped, honors category preferences and never shows a stale-account banner`, async () => {
  const env = fixture(); env.platform = platform; env.api.initializeNativePush(); await ready(env);
  assert.equal((await env.handler.handleNotification(response(data()).notification)).shouldShowBanner, true);
  await env.api.saveNativePushPreferences({ assignments: false }); assert.equal((await env.handler.handleNotification(response(data()).notification)).shouldShowBanner, false);
  assert.equal((await env.handler.handleNotification(response(data({ companyId: 'other' })).notification)).shouldShowBanner, false);
  assert.equal((await env.handler.handleNotification(response(data({ recipientUid: 'another-account' })).notification)).shouldShowBanner, false);
  await env.api.setNativePushScope(env.user, 'checking'); assert.equal((await env.handler.handleNotification(response(data({ type: 'job-status' })).notification)).shouldShowBanner, false);
});
for (const platform of ['ios', 'android']) test(`${platform} native bridge retains a busy/draft work order and retries the authorized tap after the draft closes`, async () => {
  const env = fixture(); env.platform = platform; env.api.initializeNativePush(); const Bridge = env.load('components/NativePushBridge.js').default; let tree, opened = [], refreshed = 0;
  const props = { blocked: true, onOpenJob: job => opened.push(job), onUpdate: async () => refreshed++ };
  await act(async () => { tree = create(React.createElement(Bridge, props)); }); await act(settle);
  await act(async () => env.api.receivePushResponse(response(data()))); assert.equal(opened.length, 0);
  await act(async () => { env.receiveListener(response(data()).notification); env.receiveListener(response(data()).notification); }); await act(settle); assert.equal(refreshed, 1);
  await act(async () => tree.update(React.createElement(Bridge, { ...props, blocked: false }))); await act(settle); assert.equal(opened.length, 1); assert.equal(opened[0].id, 'job');
  await act(async () => tree.unmount()); await settle();
});
test('late permission results after sign-out cannot register another account or restore consent', async () => {
  const env = fixture(); await ready(env); let grant; env.permissionRequest = () => new Promise(resolve => { grant = resolve; }); const enabling = env.api.enableNativePush(); await settle();
  await env.api.signOutNativePush(); env.auth.currentUser = null; grant({ granted: true, status: 'granted' }); await enabling; assert.equal(env.calls.filter(item => item.action === 'register').length, 0); assert.equal(env.tokenRequests, 0); assert.equal(env.interactions, 0);
});
test('sign-out releases the installation with a newer sequence even while server registration is in flight', async () => {
  const env = fixture(); await ready(env); let finish;
  env.registerReply = () => new Promise(resolve => { finish = resolve; }); const enabling = env.api.enableNativePush(); await settle();
  const original = env.calls.find(item => item.action === 'register'); assert.ok(original); await env.api.signOutNativePush();
  const release = env.calls.find(item => item.action === 'invalidate-installation'); assert.ok(release); assert.ok(release.registrationSequence > original.registrationSequence);
  finish({ deviceId: 'late-device', registrationSequence: original.registrationSequence, preferences: env.preferences }); await enabling; assert.equal(env.api.nativePushSnapshot().registered, false); assert.equal([...env.store.keys()].some(item => item.endsWith(':registration')), false);
});
