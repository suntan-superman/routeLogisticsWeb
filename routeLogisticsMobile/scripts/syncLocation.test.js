const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { create, act } = require('react-test-renderer');
const babel = require('@babel/core');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..'), modules = new Map();
const appListeners = new Set(), networkListeners = new Set(), queueListeners = new Set();
let user, accessStatus, rows, tree, resolutions, flushes, refreshed, readFailure, permission, permissionCalls, position, calls, watchersRemoved, interactions, positionFailure, jobRead, jobReads;
const app = { currentState: 'active', addEventListener: (_event, listener) => { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
const palette = { text: '#fff', secondary: '#bdd', accent: '#6eb', danger: '#faa', border: '#375' };
function load(relative) {
  const file = path.resolve(root, relative);
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} }; modules.set(file, module);
  const mockRequire = name => {
    if (name === 'react') return React;
    if (name.startsWith('@babel/runtime/')) return require(name);
    if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', AppState: app };
    if (name.endsWith('/ThemeProvider')) return { useTheme: () => ({ palette }) };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ user, accessStatus }) };
    if (name === './Glass') return { GlassCard: ({ children }) => React.createElement('View', null, children), GlassButton: ({ title, onPress, disabled, busy }) => React.createElement('Pressable', { accessibilityLabel: title, disabled: disabled || busy, onPress }, React.createElement('Text', null, title)) };
    if (name === '@react-native-community/netinfo') return { addEventListener: listener => { networkListeners.add(listener); listener({ isConnected: true, isInternetReachable: true }); return () => networkListeners.delete(listener); } };
    if (name.endsWith('/offline')) return {
      queuedWork: async () => { if (readFailure) throw readFailure; return rows.map(row => ({ ...row })); },
      subscribeOffline: listener => { queueListeners.add(listener); return () => queueListeners.delete(listener); },
      flushOffline: async () => { flushes++; },
      resolveOffline: async (id, action) => { resolutions.push({ id, action }); const row = rows.find(item => item.id === id); if (row) row.state = action === 'discard' ? 'discarded' : 'pending'; queueListeners.forEach(listener => listener()); return { operationId: id }; },
    };
    if (name === 'expo-location') return { Accuracy: { Balanced: 'balanced' }, requestForegroundPermissionsAsync: () => { permissionCalls++; return permission(); }, watchPositionAsync: async (_options, callback) => { position = callback; return { remove: () => watchersRemoved++ }; } };
    if (name === 'firebase/functions') return { httpsCallable: () => async data => { calls.push(data); if (data.action === 'position' && positionFailure) throw positionFailure; return { data: data.action === 'start' ? { sessionId: 'session', retentionHours: 24 } : { sharing: data.action !== 'stop' } }; } };
    if (name.endsWith('/constants/firebase')) return { functions: {} };
    if (name.endsWith('/nativeInteraction')) return { beginNativeInteraction: () => { interactions++; let released = false; return () => { if (!released) { released = true; interactions--; } }; } };
    if (name.endsWith('/workspaceApi')) return { readWorkspace: (resource, options) => { jobReads.push({ resource, ...options }); return jobRead(resource, options); } };
    throw new Error(`Unexpected dependency ${name}`);
  };
  const result = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] });
  new Function('require', 'module', 'exports', result.code)(mockRequire, module, module.exports);
  return module.exports;
}
const Offline = load('components/OfflineStatus.js').default;
const jobs = () => [{ id: 'first', companyId: 'acme', assignedTo: 'member', status: 'in-progress', customerName: 'First job' }, { id: 'second', companyId: 'acme', assignedTo: 'member', status: 'in-progress', customerName: 'Second job' }];
const text = () => JSON.stringify(tree.toJSON());
async function settle() { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); }
async function render(Component, props = {}) { await act(async () => { tree = create(React.createElement(Component, props)); }); await settle(); }
function button(label) { return tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0]; }
async function press(label) { const node = button(label); assert.ok(node, `Action ${label} exists`); await act(async () => node.props.onPress()); await settle(); }
async function expandSync() { const node = tree.root.findAll(node => node.type === 'Pressable' && String(node.props.accessibilityLabel).startsWith('Sync status:'))[0]; await act(async () => node.props.onPress()); await settle(); }
async function expandLocation() { const node = tree.root.findAll(node => node.type === 'Pressable' && String(node.props.accessibilityLabel).startsWith('Work location sharing'))[0]; await act(async () => node.props.onPress()); await settle(); }
async function nativeState(state) { await act(async () => { app.currentState = state; appListeners.forEach(listener => listener(state)); }); await settle(); }
async function notifyQueue() { await act(async () => queueListeners.forEach(listener => listener())); await settle(); }
async function startLocation() { await expandLocation(); await press('Share during this job'); await press('Confirm location sharing'); }
beforeEach(() => {
  user = { id: 'tech', companyId: 'acme', membershipId: 'member', role: 'technician' };
  accessStatus = 'ready'; jobReads = []; jobRead = async (_resource, { id }) => ({ job: jobs().find(job => job.id === id) });
  tree = null; rows = []; resolutions = []; flushes = 0; refreshed = 0; readFailure = null;
  permission = async () => ({ granted: true }); permissionCalls = 0; calls = []; position = null; positionFailure = null; watchersRemoved = 0; interactions = 0; app.currentState = 'active';
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); await settle(); assert.equal(appListeners.size, 0); assert.equal(networkListeners.size, 0); assert.equal(queueListeners.size, 0); assert.equal(interactions, 0); });

test('sync summary is compact, expandable and leaves queued operations intact', async () => {
  rows = [{ id: 'photo', kind: 'photo', state: 'pending', localUri: 'file:///kept.jpg' }, { id: 'work', kind: 'job', state: 'conflict', error: 'Job changed.', server: { status: 'scheduled' }, patch: { status: 'completed' } }];
  const before = JSON.stringify(rows);
  await render(Offline, { onSynced: () => refreshed++ });
  assert.match(text(), /Needs attention/); assert.doesNotMatch(text(), /Latest online work/);
  await expandSync(); assert.match(text(), /Latest online work/); assert.match(text(), /Your saved change/); assert.match(text(), /Job changed/);
  assert.equal(JSON.stringify(rows), before); assert.equal(resolutions.length, 0);
  assert.equal(refreshed, 0); assert.ok(flushes > 0);
});

test('retry and discard require explicit confirmation and preserve other queued photos', async () => {
  rows = [{ id: 'failed', kind: 'job', state: 'failed', error: 'Permission must be checked again.' }, { id: 'photo', kind: 'photo', state: 'pending', localUri: 'file:///kept.jpg' }];
  await render(Offline); await expandSync(); await press('Retry saved change');
  assert.equal(resolutions.length, 0); await press('Keep saved change'); assert.equal(resolutions.length, 0);
  await press('Discard this local change'); assert.equal(resolutions.length, 0);
  const action = button('Confirm discard');
  await act(async () => { await Promise.all([action.props.onPress(), action.props.onPress()]); }); await settle();
  assert.deepEqual(resolutions, [{ id: 'failed', action: 'discard' }]);
  assert.equal(rows[1].state, 'pending'); assert.equal(rows[1].localUri, 'file:///kept.jpg');
});

test('synced transitions invalidate work once and account changes clear prior displayed rows', async () => {
  rows = [{ id: 'one', kind: 'job', state: 'pending' }]; await render(Offline, { onSynced: () => refreshed++ });
  rows[0].state = 'synced'; await notifyQueue(); assert.equal(refreshed, 1);
  await notifyQueue(); assert.equal(refreshed, 1);
  const original = rows; rows = []; user = { ...user, id: 'another', membershipId: 'different' };
  await act(async () => tree.update(React.createElement(Offline, { onSynced: () => refreshed++ }))); await settle();
  assert.match(text(), /Synced/); assert.equal(original[0].state, 'synced'); assert.equal(refreshed, 1);
});

test('queue read failures are visible without discarding local work', async () => {
  rows = [{ id: 'kept', kind: 'photo', state: 'pending', localUri: 'file:///kept.jpg' }]; await render(Offline);
  readFailure = new Error('Connect to your current workspace.'); await notifyQueue();
  assert.match(text(), /Connect to your current workspace/); assert.equal(rows.length, 1); assert.equal(resolutions.length, 0);
});

test('saved work is preserved and automatic drains wait for verified workspace access', async () => {
  rows = [{ id: 'kept', kind: 'photo', state: 'pending', localUri: 'file:///kept.jpg' }]; accessStatus = 'checking';
  await render(Offline); await expandSync(); assert.equal(flushes, 0);
  assert.match(text(), /Saved work stays on this device/); assert.equal(button('Synchronize saved work').props.disabled, true);
  await nativeState('background'); await nativeState('active'); assert.equal(flushes, 0);
  accessStatus = 'unavailable'; await act(async () => tree.update(React.createElement(Offline))); await settle();
  for (const listener of networkListeners) await act(async () => listener({ isConnected: true, isInternetReachable: true })); await settle();
  assert.equal(flushes, 0); assert.equal(rows[0].localUri, 'file:///kept.jpg'); assert.equal(resolutions.length, 0);
  accessStatus = 'ready'; await act(async () => tree.update(React.createElement(Offline))); await settle();
  await nativeState('background'); await nativeState('active'); assert.ok(flushes > 0); assert.equal(rows[0].state, 'pending');
});
