const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), babel = require('@babel/core');
const React = require('react'), { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
function harness(seed = []) {
  const store = new Map(seed), calls = [], nativeOptions = [], intervals = new Map(), timeouts = new Map(), modules = new Map();
  const env = { store, calls, nativeOptions, intervals, timeouts, foreground: true, background: true, native: false, foregroundRequests: 0, backgroundRequests: 0, fixes: 0, interactions: 0, tokenListener: null, task: null, positionFailure: null, positionResult: null, endFailure: null, accessStatus: 'ready', claims: { companyId: 'acme', membershipId: 'member', role: 'technician' }, user: { id: 'tech', companyId: 'acme', membershipId: 'member', role: 'technician' }, shift: null, policy: { intervalMinutes: 3, retentionHours: 24, maxShiftHours: 12, freshAfterSeconds: 300 }, ready: async () => {} };
  const appListeners = new Set();
  env.app = { currentState: 'active', addEventListener: (_event, listener) => { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
  env.auth = { app: { options: { projectId: 'test-project' } }, authStateReady: () => env.ready(), currentUser: { uid: 'tech', emailVerified: true, getIdTokenResult: async () => ({ claims: env.claims }) } };
  const palette = { text: '#fff', secondary: '#bdd', accent: '#6eb', danger: '#faa', border: '#375' };
  let nextTimer = 0;
  env.nativeState = state => { env.app.currentState = state; appListeners.forEach(listener => listener(state)); };
  env.position = () => ({ timestamp: Date.now() - 90000 + env.fixes++ * 1000, coords: { latitude: 35, longitude: -119, accuracy: 12 } });
  function load(relative) {
    const file = path.resolve(root, relative); if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} }; modules.set(file, module);
    const mockRequire = name => {
      if (name === 'react') return React;
      if (name.startsWith('@babel/runtime/')) return require(name);
      if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', AppState: env.app };
      if (name.endsWith('/AuthContext')) return { useAuth: () => ({ user: env.user, accessStatus: env.accessStatus }) };
      if (name.endsWith('/ThemeProvider')) return { useTheme: () => ({ palette }) };
      if (name === './Glass') return { GlassCard: ({ children }) => React.createElement('View', null, children), GlassButton: ({ title, onPress, disabled, busy }) => React.createElement('Pressable', { accessibilityLabel: title, disabled: disabled || busy, onPress }, React.createElement('Text', null, title)) };
      if (name === '@react-native-async-storage/async-storage') return { getItem: async key => store.get(key) || null, setItem: async (key, value) => store.set(key, value), removeItem: async key => store.delete(key) };
      if (name === 'firebase/auth') return { onIdTokenChanged: (_auth, listener) => { env.tokenListener = listener; return () => {}; } };
      if (name.endsWith('/constants/firebase')) return { auth: env.auth };
      if (name.endsWith('/nativeInteraction')) return { beginNativeInteraction: () => { env.interactions++; return () => env.interactions--; } };
      if (name === 'expo-task-manager') return { defineTask: (name, executor) => { env.task = { name, executor }; } };
      if (name === 'expo-location') return {
        Accuracy: { Balanced: 'balanced' },
        requestForegroundPermissionsAsync: async () => { env.foregroundRequests++; return { granted: env.foreground }; },
        requestBackgroundPermissionsAsync: async () => { env.backgroundRequests++; return { granted: env.background }; },
        getForegroundPermissionsAsync: async () => ({ granted: env.foreground }), getBackgroundPermissionsAsync: async () => ({ granted: env.background }),
        getCurrentPositionAsync: async () => env.position(),
        hasStartedLocationUpdatesAsync: async () => env.native,
        startLocationUpdatesAsync: async (_task, options) => { env.native = true; nativeOptions.push(options); },
        stopLocationUpdatesAsync: async () => { env.native = false; },
      };
      if (name.endsWith('/workspaceApi')) return { callWorkspace: async (name, data, options) => {
        calls.push({ name, ...data, ...(options ? { options } : {}) });
        if (name === 'rlWorkShift') {
          if (data.action === 'start') env.shift = { id: 'shift', status: 'on-duty', startedAt: new Date(Date.now() - (env.shiftStartOffset || 120000)).toISOString(), expiresAt: new Date(Date.now() + 12 * 3600000 - (env.shiftStartOffset || 120000)).toISOString(), trackingConsent: true };
          if (data.action === 'end') { if (env.endFailure) throw env.endFailure; env.shift = { ...env.shift, status: 'off-duty', endedAt: new Date().toISOString() }; }
          return { shift: env.shift, policy: env.policy };
        }
        if (data.action === 'position' && env.positionFailure) throw env.positionFailure;
        if (data.action === 'position' && env.positionResult) return env.positionResult;
        return data.action === 'start' ? { sessionId: 'session', shift: env.shift, policy: env.policy } : { sharing: data.action !== 'stop' };
      } };
      if (name === './workTracking' || name.endsWith('/services/workTracking')) return load('services/workTracking.js');
      throw new Error(`Unexpected dependency ${name}`);
    };
    const result = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] });
    new Function('require', 'module', 'exports', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', result.code)(mockRequire, module, module.exports, (fn, ms) => { const id = ++nextTimer; intervals.set(id, { fn, ms }); return id; }, id => intervals.delete(id), (fn, ms) => { const id = ++nextTimer; timeouts.set(id, { fn, ms }); return id; }, id => timeouts.delete(id));
    return module.exports;
  }
  env.load = load; env.service = load('services/workTracking.js'); env.service.initializeWorkTracking(); return env;
}
const settle = async () => { for (let index = 0; index < 3; index++) await new Promise(resolve => setImmediate(resolve)); };
async function start(env, backgroundConsent = false) { await env.service.startWorkShift(env.user, { trackingConsent: true, backgroundConsent }); await settle(); }
const positions = env => env.calls.filter(call => call.name === 'rlUpdateWorkLocation' && call.action === 'position');

test('module-scope task registration and login never start an unconsented shift', async () => {
  const env = harness(); env.load('services/backgroundTracking.js');
  assert.equal(env.task.name, env.service.WORK_TRACKING_TASK); await env.tokenListener(env.auth.currentUser); await settle();
  assert.equal(env.calls.length, 0); assert.equal(env.foregroundRequests, 0); assert.equal(env.nativeOptions.length, 0);
  await assert.rejects(env.service.startWorkShift(env.user), /confirm work location/);
});
test('explicit shift consent starts without a job and foreground interval requests stationary fixes', async () => {
  const env = harness(); env.policy.intervalMinutes = 1; env.position = () => ({ timestamp: Date.now() - 90000 + env.fixes++ * 60000, coords: { latitude: 35, longitude: -119, accuracy: 12 } }); await start(env);
  assert.ok(env.calls.some(call => call.name === 'rlWorkShift' && call.action === 'start' && call.trackingConsent === true));
  const session = env.calls.find(call => call.name === 'rlUpdateWorkLocation' && call.action === 'start');
  assert.equal(session.shiftId, 'shift'); assert.equal(session.jobId, undefined); assert.equal(env.backgroundRequests, 0); assert.equal(env.native, false);
  const first = positions(env)[0].capturedAt;
  assert.equal([...env.intervals.values()][0].ms, 60000); await [...env.intervals.values()][0].fn(); await settle();
  assert.equal(positions(env).length, 2); assert.notEqual(positions(env)[1].capturedAt, first); assert.equal(env.interactions, 0);
});
test('background consent requests both permissions and enables visible native indicators', async () => {
  const env = harness(); env.policy.intervalMinutes = 5; await start(env, true);
  assert.equal(env.foregroundRequests, 1); assert.equal(env.backgroundRequests, 1); assert.equal(env.native, true);
  const options = env.nativeOptions[0]; assert.equal(options.timeInterval, 300000); assert.equal(options.deferredUpdatesInterval, 300000); assert.equal(options.showsBackgroundLocationIndicator, true); assert.match(options.foregroundService.notificationBody, /End shift/);
  env.nativeState('background'); assert.equal(env.intervals.size, 0); assert.equal(env.native, true);
});
test('denied background permission starts no shift or native tracking and remains retryable', async () => {
  const env = harness(); env.background = false;
  await assert.rejects(start(env, true), /Background permission was not granted/);
  assert.equal(env.calls.length, 0); assert.equal(env.store.size, 0); assert.equal(env.interactions, 0);
  await start(env, false); assert.equal(env.service.workTrackingSnapshot().tracking, true);
});
test('permission dismissal waits for active state and duplicate starts cannot create two shifts', async () => {
  const env = harness(); env.nativeState('inactive');
  const pending = env.service.startWorkShift(env.user, { trackingConsent: true });
  await env.service.startWorkShift(env.user, { trackingConsent: true }); await settle();
  assert.equal(env.calls.filter(call => call.action === 'start').length, 0); assert.equal(env.foregroundRequests, 1);
  env.nativeState('active'); await pending; await settle();
  assert.equal(env.calls.filter(call => call.name === 'rlWorkShift' && call.action === 'start').length, 1);
});
test('stopping during a permission return cancels shift creation and durable consent', async () => {
  const env = harness(); env.nativeState('inactive');
  const pending = env.service.startWorkShift(env.user, { trackingConsent: true }); await settle();
  const rejected = assert.rejects(pending, /cancelled/); await env.service.stopShiftTracking(); await rejected;
  env.nativeState('active'); await settle(); assert.equal(env.calls.length, 0); assert.equal(env.store.size, 0); assert.equal(env.interactions, 0);
});
test('reused old GPS fixes retain their capture time and never become a new update', async () => {
  const env = harness(); const fixed = env.position(); env.position = () => fixed; await start(env);
  const initial = env.service.workTrackingSnapshot().lastAcceptedAt; await env.service.captureWorkPosition(); await settle();
  assert.equal(positions(env).length, 1); assert.equal(env.service.workTrackingSnapshot().lastAcceptedAt, initial); assert.equal(initial, new Date(fixed.timestamp).toISOString());
});
test('out-of-order samples never claim a shared update and owner policy changes apply to timers and native options', async () => {
  const env = harness(); env.positionResult = { accepted: false, reason: 'out-of-order', policy: env.policy }; await start(env, true);
  assert.equal(env.service.workTrackingSnapshot().lastAcceptedAt, null); assert.match(env.service.workTrackingSnapshot().message, /without replacing/);
  env.positionResult = { accepted: true, policy: { ...env.policy, intervalMinutes: 1, freshAfterSeconds: 180 } }; env.position = () => ({ timestamp: Date.now() + 90000, coords: { latitude: 35, longitude: -119, accuracy: 12 } }); await env.service.captureWorkPosition(); await settle();
  assert.ok(env.service.workTrackingSnapshot().lastAcceptedAt); assert.equal(env.service.workTrackingSnapshot().policy.intervalMinutes, 1); assert.equal([...env.intervals.values()][0].ms, 60000); assert.equal(env.nativeOptions.at(-1).timeInterval, 60000);
});
test('high frequency native callbacks publish at most one sample per owner target interval', async () => {
  const env = harness(); env.policy.intervalMinutes = 1; await start(env, true); env.nativeState('background');
  const first = Date.parse(positions(env)[0].capturedAt);
  const locations = Array.from({ length: 10 }, (_, index) => ({ timestamp: first + index * 100, coords: { latitude: 35, longitude: -119, accuracy: 10 } }));
  await env.service.handleBackgroundWorkLocations({ data: { locations } }); await settle(); assert.equal(positions(env).length, 1);
  await env.service.handleBackgroundWorkLocations({ data: { locations: [{ timestamp: first + 60000, coords: { latitude: 35, longitude: -119, accuracy: 10 } }] } }); await settle();
  assert.equal(positions(env).length, 2); assert.equal(Date.parse(positions(env)[1].capturedAt) - first, 60000);
});
test('unknown or invalid GPS accuracy is rejected with visible feedback instead of becoming zero precision', async () => {
  const env = harness(); env.position = () => ({ timestamp: Date.now(), coords: { latitude: 35, longitude: -119, accuracy: null } }); await start(env, true);
  assert.equal(positions(env).length, 0); assert.equal(env.service.workTrackingSnapshot().lastAccuracy, null); assert.match(env.service.workTrackingSnapshot().error, /accuracy was unavailable/);
  await env.service.handleBackgroundWorkLocations({ data: { locations: [undefined, '5', -1, 5001, NaN].map((accuracy, index) => ({ timestamp: Date.now() + index, coords: { latitude: 35, longitude: -119, accuracy } })) } }); await settle();
  assert.equal(positions(env).length, 0); assert.equal(env.service.workTrackingSnapshot().lastAcceptedAt, null);
});
test('offline GPS outbox is bounded, scoped, timestamped and contains no authentication secrets', async () => {
  const env = harness(); env.shiftStartOffset = 11 * 3600000; env.position = () => ({ timestamp: Date.now() - 10 * 3600000, coords: { latitude: 35, longitude: -119, accuracy: 10 } }); env.positionFailure = Object.assign(new Error('Offline'), { code: 'functions/unavailable' }); await start(env, true);
  env.nativeState('background');
  const locations = Array.from({ length: 75 }, (_, index) => ({ timestamp: Date.now() - 9 * 3600000 + index * 3 * 60000, coords: { latitude: 35, longitude: -119, accuracy: 10 } }));
  await env.service.handleBackgroundWorkLocations({ data: { locations } }); await settle();
  const saved = JSON.parse([...env.store.values()][0]); assert.equal(saved.samples.length, 60); assert.equal(saved.metadata.uid, 'tech'); assert.equal(saved.metadata.companyId, 'acme'); assert.ok(saved.samples.every(sample => typeof sample.capturedAt === 'string'));
  assert.doesNotMatch(JSON.stringify(saved), /password|accessToken|refreshToken|private_key/); assert.match(env.service.workTrackingSnapshot().message, /saved only for this shift/);
});
test('end shift stops native collection and clears only tracking samples even when server end is offline', async () => {
  const env = harness(); env.store.set('unrelated-job-photo-queue', 'keep'); await start(env, true); env.endFailure = new Error('Server unreachable');
  await assert.rejects(env.service.stopShiftTracking({ endShift: true }), /Server unreachable/);
  assert.equal(env.native, false); assert.equal(env.service.workTrackingSnapshot().tracking, false); assert.equal(env.store.size, 1); assert.equal(env.store.get('unrelated-job-photo-queue'), 'keep');
  const cold = harness([...env.store]); cold.shift = env.shift; await cold.service.refreshWorkShift(cold.user);
  assert.equal(cold.nativeOptions.length, 0); assert.equal(cold.service.workTrackingSnapshot().tracking, false);
});
test('server permission denial fails closed without changing job queues or account memberships', async () => {
  const env = harness(); env.store.set('job-queue', 'keep'); env.positionFailure = Object.assign(new Error('Membership is no longer active'), { code: 'functions/permission-denied' }); await start(env, true); await settle();
  assert.equal(env.native, false); assert.equal(env.service.workTrackingSnapshot().tracking, false); assert.match(env.service.workTrackingSnapshot().error, /Membership/); assert.equal(env.store.get('job-queue'), 'keep');
});
test('cold background task waits for Firebase restoration and rejects another signed-in account', async () => {
  const source = harness(); await start(source, true); const env = harness([...source.store]); env.native = true; env.auth.currentUser = { ...env.auth.currentUser, uid: 'another' };
  let allow; env.ready = () => new Promise(resolve => { allow = resolve; });
  const work = env.service.handleBackgroundWorkLocations({ data: { locations: [env.position()] } }); await settle(); assert.equal(env.calls.length, 0);
  allow(); await work; assert.equal(env.native, false); assert.equal(positions(env).length, 0); assert.equal(env.store.size, 0);
});
test('cold restore requires persisted consent and an active matching server shift', async () => {
  const source = harness(); await start(source, true);
  const restored = harness([...source.store]); restored.shift = source.shift; await restored.service.refreshWorkShift(restored.user);
  assert.equal(restored.native, true); assert.equal(restored.foregroundRequests, 0); assert.equal(restored.backgroundRequests, 0);
  const ended = harness([...source.store]); ended.native = true; ended.shift = { ...source.shift, status: 'off-duty' }; await ended.service.refreshWorkShift(ended.user);
  assert.equal(ended.native, false); assert.equal(ended.store.size, 0); assert.equal(ended.nativeOptions.length, 0);
});
test('shift expiry and role changes stop tracking instead of automatically extending consent', async () => {
  const env = harness(); env.service.initializeWorkTracking(); await start(env, true);
  env.claims = { ...env.claims, role: 'manager' }; await env.tokenListener(env.auth.currentUser); await settle(); assert.equal(env.native, false); assert.equal(env.store.size, 0);
  const another = harness(); await start(another, true); await [...another.timeouts.values()][0].fn(); await settle(); assert.equal(another.native, false); assert.equal(another.service.workTrackingSnapshot().tracking, false); assert.equal(another.store.size, 0);
});
test('late location result after End shift cannot publish or restore tracking', async () => {
  const env = harness(); let resolveFix; env.position = () => new Promise(resolve => { resolveFix = resolve; }); await start(env, true);
  await env.service.stopShiftTracking({ endShift: true }); resolveFix({ timestamp: Date.now(), coords: { latitude: 35, longitude: -119, accuracy: 10 } }); await settle();
  assert.equal(positions(env).length, 0); assert.equal(env.store.size, 0); assert.equal(env.native, false); assert.equal(env.intervals.size, 0);
});
test('a new shift can capture while the ended shift still has a pending native GPS request', async () => {
  const env = harness(); let resolvePrevious; env.position = () => new Promise(resolve => { resolvePrevious = resolve; }); await start(env);
  await env.service.stopShiftTracking({ endShift: true });
  env.position = () => ({ timestamp: Date.now(), coords: { latitude: 36, longitude: -120, accuracy: 10 } }); await start(env);
  assert.equal(positions(env).length, 1); assert.equal(positions(env)[0].latitude, 36);
  resolvePrevious({ timestamp: Date.now(), coords: { latitude: 35, longitude: -119, accuracy: 10 } }); await settle(); assert.equal(positions(env).length, 1); assert.equal(env.service.workTrackingSnapshot().tracking, true);
});
test('shift UI requires confirmation, keeps background optional and confirms End shift', async () => {
  const env = harness(), Component = env.load('components/WorkLocation.js').default; let tree;
  const button = label => tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
  const press = async label => { const target = button(label); assert.ok(target, label); await act(async () => target.props.onPress()); await act(settle); };
  await act(async () => { tree = create(React.createElement(Component)); }); await act(settle);
  const summary = tree.root.findAll(node => node.type === 'Pressable' && String(node.props.accessibilityLabel).startsWith('Work shift:'))[0]; await act(async () => summary.props.onPress());
  await press('Start shift'); assert.equal(env.foregroundRequests, 0); assert.equal(env.calls.filter(call => call.action === 'start').length, 0);
  await press('Confirm start shift'); assert.equal(env.backgroundRequests, 0); assert.match(JSON.stringify(tree.toJSON()), /On duty/);
  await press('End shift'); assert.equal(env.calls.filter(call => call.action === 'end').length, 0);
  const end = button('Confirm end shift'); await act(async () => { await Promise.all([end.props.onPress(), end.props.onPress()]); }); await act(settle);
  assert.equal(env.calls.filter(call => call.action === 'end').length, 1); assert.equal(env.service.workTrackingSnapshot().tracking, false);
  await act(async () => tree.unmount());
});
test('compact End shift remains enabled offline and stops locally before reporting an unconfirmed server end', async () => {
  const env = harness(); await start(env, true); env.accessStatus = 'offline'; env.endFailure = new Error('Network offline');
  const Component = env.load('components/WorkLocation.js').default; let tree;
  const button = label => tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
  await act(async () => { tree = create(React.createElement(Component)); }); await act(settle);
  assert.ok(button('End shift')); assert.notEqual(button('End shift').props.disabled, true);
  await act(async () => button('End shift').props.onPress()); assert.notEqual(button('Confirm end shift').props.disabled, true);
  await act(async () => button('Confirm end shift').props.onPress()); await act(settle);
  assert.equal(env.native, false); assert.equal(env.store.size, 0); assert.match(JSON.stringify(tree.toJSON()), /Sharing stopped on this device/); assert.match(JSON.stringify(tree.toJSON()), /not confirmed/);
  assert.equal(env.calls.find(call => call.action === 'end').options.timeout, 8000); await act(async () => tree.unmount());
});
test('switching accounts cannot display the previous member shift or GPS history', async () => {
  const env = harness(); await start(env, true); const previous = env.service.workTrackingSnapshot().lastAcceptedAt;
  assert.ok(previous); assert.equal(env.service.workTrackingSnapshot({ ...env.user, id: 'another' }).shift, null);
  const Component = env.load('components/WorkLocation.js').default; let tree;
  await act(async () => { tree = create(React.createElement(Component)); }); await act(settle);
  env.user = { ...env.user, id: 'another', membershipId: 'new-member' }; env.claims = { ...env.claims, membershipId: 'new-member' }; env.auth.currentUser = { ...env.auth.currentUser, uid: 'another' }; env.shift = null;
  await act(async () => tree.update(React.createElement(Component))); await act(settle);
  assert.equal(env.service.workTrackingSnapshot(env.user).lastAcceptedAt, null); assert.equal(env.service.workTrackingSnapshot(env.user).shift, null);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Last shared GPS fix|Older shared GPS fix|On duty/); assert.equal(env.native, false);
  env.auth.currentUser = null; await act(async () => env.tokenListener(null)); await act(settle); assert.equal(env.service.workTrackingSnapshot().lastAcceptedAt, null); await act(async () => tree.unmount());
});
