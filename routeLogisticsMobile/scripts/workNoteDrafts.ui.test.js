// Render the real field-work editor and draft store. Only native/storage/network
// boundaries are replaced; no production account or backend is contacted.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const React = require('react'), { create, act } = require('react-test-renderer');
const babel = require('@babel/core');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');

function harness() {
  const env = { storage: new Map(), storageWrites: [], writes: [], calls: [], drafts: [], changes: 0, modules: new Map(), offline: true, sequence: 0 };
  env.auth = { app: { options: { projectId: 'demo-routelogistics' } }, currentUser: { uid: 'draft-technician', emailVerified: true } };
  env.claims = { companyId: 'draft-company', membershipId: 'draft-member', role: 'technician' };
  env.job = { id: 'draft-job', companyId: env.claims.companyId, assignedTo: env.claims.membershipId, assignedToUid: env.auth.currentUser.uid, status: 'in-progress', workNotes: '', notes: '', updatedAt: '2026-11-16T18:00:00.000Z' };
  env.serverJob = { ...env.job };
  env.scope = () => `rl-offline-v1:demo-routelogistics:${env.auth.currentUser.uid}:${env.claims.companyId}:${env.claims.role}:${env.claims.membershipId}`;
  const appListeners = new Set();
  env.appState = { currentState: 'active', addEventListener: (_name, listener) => { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
  const storage = {
    getItem: async key => { if (env.readFailure) throw env.readFailure; return env.storage.get(key) ?? null; },
    setItem: async (key, value) => { if (env.storageFailure) throw env.storageFailure; if (env.beforeStorageWrite) await env.beforeStorageWrite(key, value); env.storageWrites.push({ key, value }); env.storage.set(key, value); },
    removeItem: async key => { if (env.storageFailure) throw env.storageFailure; env.storage.delete(key); },
    getAllKeys: async () => [...env.storage.keys()],
    multiGet: async keys => keys.map(key => [key, env.storage.get(key) ?? null]),
    multiRemove: async keys => { for (const key of keys) env.storage.delete(key); },
  };
  const panel = ({ title, subtitle, message, children }) => React.createElement('View', null, title, subtitle, message, children);
  const button = ({ title, onPress, busy, disabled }) => React.createElement('Pressable', { accessibilityLabel: title, onPress, disabled: !!busy || !!disabled }, title);
  const workspace = {
    readWorkspace: async (resource, payload) => {
      if (resource === 'serviceLogs') return { logs: [] };
      assert.equal(resource, 'jobs'); assert.equal(payload.id, env.serverJob.id);
      return { job: { ...env.serverJob } };
    },
    callWorkspace: async (name, payload) => {
      env.calls.push({ name, ...payload });
      if (name === 'rlJobVisit') { assert.equal(payload.action, 'list'); return { events: [], hasMore: false }; }
      assert.equal(name, 'rlApplyJobOperation');
      if (env.syncFailure) throw env.syncFailure;
      if (payload.expectedVersion !== env.serverJob.updatedAt) return { status: 'conflict', version: env.serverJob.updatedAt, server: { ...env.serverJob } };
      const version = new Date(Date.parse(env.serverJob.updatedAt) + 1).toISOString();
      env.serverJob = { ...env.serverJob, ...payload.patch, ...(Object.hasOwn(payload.patch, 'notes') ? { workNotes: payload.patch.notes } : {}), updatedAt: version };
      return { status: 'synced', version };
    },
  };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (env.modules.has(filename)) return env.modules.get(filename).exports;
    const module = { exports: {} }; env.modules.set(filename, module);
    const importer = name => {
      if (name === 'react') return React;
      if (name.startsWith('@babel/runtime/')) return require(name);
      if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', AppState: env.appState, Linking: { openURL: async () => {} } };
      if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
      if (name === '@react-native-community/netinfo') return { __esModule: true, default: { fetch: async () => ({ isConnected: !env.offline, isInternetReachable: !env.offline }) } };
      if (name === 'expo-crypto') return { randomUUID: () => `draft-identity-${++env.sequence}` };
      if (name === 'expo-location') return { Accuracy: { Balanced: 3 }, getForegroundPermissionsAsync: async () => ({ granted: false }) };
      if (name === 'expo-file-system/legacy') return { documentDirectory: 'file:///synthetic-draft-test/', deleteAsync: async () => { throw new Error('Work-note tests must not delete photo files.'); } };
      if (name.endsWith('/constants/firebase')) return { auth: env.auth };
      if (name.endsWith('/services/firebase') || name === './firebase') return { JobService: { updateJob: async (id, patch) => { env.writes.push({ id, patch: { ...patch } }); return load('services/offline.js').saveJobOffline(id, patch); } } };
      if (name.endsWith('/services/tenancy') || name === './tenancy') return { getClaims: () => env.claims, getWorkspace: () => ({ status: 'company' }), tenantFields: () => ({ userId: env.auth.currentUser.uid, companyId: env.claims.companyId }), requireWorkspace: () => { if (!env.auth.currentUser?.emailVerified || !env.claims.companyId) throw new Error('Verified workspace required.'); }, getPermissions: () => ({ canAccess: true, canWork: true, can: capability => capability === 'jobs.work' }) };
      if (name.endsWith('/services/offline') || name === './offline') {
        const actual = load('services/offline.js');
        return { ...actual, saveWorkNoteDraft: async (...args) => { env.writes.push({ jobId: args[0], options: args[1] }); return actual.saveWorkNoteDraft(...args); } };
      }
      if (name.endsWith('/services/workspaceApi') || name === './workspaceApi') return workspace;
      if (name.endsWith('/services/useJobResources')) return { useJobResourceRefresh: (_resource, id, loader, { enabled }) => { React.useEffect(() => { if (enabled) void loader({ query: true }).catch(() => {}); }, [id, enabled]); return { refetch: () => loader().catch(() => {}) }; } };
      if (name.endsWith('/theme/ThemeProvider')) return { useTheme: () => ({ palette: { text: '#111', secondary: '#555', accent: '#087', danger: '#900', border: '#ccc' } }) };
      if (name === './MobileUI') return { Card: panel, SectionHeader: panel, InlineNotice: panel, PrimaryButton: button, SecondaryButton: button, StatusBadge: panel, FormField: ({ label, ...props }) => React.createElement('TextInput', { accessibilityLabel: label, ...props }) };
      if (name.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filename), name);
        return load(path.extname(resolved) ? resolved : `${resolved}.js`);
      }
      return require(name);
    };
    const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
    new Function('require', 'module', 'exports', code)(importer, module, module.exports);
    return module.exports;
  }
  env.props = () => ({ job: env.job, draftActionsRef: env.actions, active: env.active !== false, onDraftChange: value => env.drafts.push(value), onChanged: async () => { env.changes++; } });
  env.settle = async () => { await act(async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); }); };
  env.mount = async () => {
    env.api = load('services/offline.js'); env.actions = { current: null };
    const bases = await env.api.readCache('job-bases') || {};
    if (!bases[env.job.id]) await env.api.writeCache('job-bases', { ...bases, [env.job.id]: { ...env.job } });
    // Authorized cached child resources keep this scenario wholly offline.
    await env.api.writeCache(`applications:${env.job.id}`, []);
    await env.api.writeCache(`visits:${env.job.id}`, { events: [], hasMore: false });
    env.Component = load('components/FieldWorkTools.js').default; await act(async () => { env.tree = create(React.createElement(env.Component, env.props())); }); await env.settle();
  };
  env.rerender = async patch => { env.job = { ...env.job, ...patch }; await act(async () => env.tree.update(React.createElement(env.Component, env.props()))); await env.settle(); };
  env.unmount = async () => { if (env.tree) { await act(async () => env.tree.unmount()); env.tree = null; } };
  env.close = async () => { await env.unmount(); assert.equal(appListeners.size, 0); };
  env.note = () => env.tree.root.findByProps({ accessibilityLabel: 'Work notes' });
  env.type = async value => { await act(async () => env.note().props.onChangeText(value)); await env.settle(); };
  env.text = () => JSON.stringify(env.tree.toJSON());
  env.press = async label => { const button = env.tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0]; assert.ok(button, `Missing ${label}`); assert.equal(button.props.disabled, false); await act(async () => button.props.onPress()); await env.settle(); };
  env.sync = async () => { env.offline = false; await act(async () => env.api.flushOffline()); await env.settle(); };
  env.queue = () => env.api.queuedWork();
  env.app = async state => { env.appState.currentState = state; await act(async () => { for (const listener of appListeners) await listener(state); }); await env.settle(); };
  env.restart = async () => { await env.unmount(); env.modules.clear(); await env.mount(); };
  return env;
}

test('typing offline notes persists the exact text before any explicit server/queue submission', async () => {
  const env = harness(); try {
    await env.mount(); await env.type('Gate locked.\nCalled dispatcher; preserve these original observations.');
    assert.ok(env.storageWrites.some(row => row.value.includes('Called dispatcher')), 'Typing must persist a recoverable local draft.');
    assert.equal(env.writes.length, 0); assert.equal((await env.queue()).length, 0);
    assert.equal(env.note().props.value, 'Gate locked.\nCalled dispatcher; preserve these original observations.');
  } finally { await env.close(); }
});

test('unsent notes survive close/reopen and simulated process restart for the same authorized job', async () => {
  const env = harness(); try {
    await env.mount(); await env.type('Offline inspection observations retained across restart.');
    await env.unmount(); await env.mount(); assert.equal(env.note().props.value, 'Offline inspection observations retained across restart.');
    await env.restart(); assert.equal(env.note().props.value, 'Offline inspection observations retained across restart.');
    assert.equal(env.writes.length, 0); assert.equal((await env.queue()).length, 0);
  } finally { await env.close(); }
});

test('an intentionally empty local note restores as empty rather than falling back to older server text', async () => {
  const env = harness(); try {
    env.job = { ...env.job, workNotes: 'Earlier server observations', notes: 'Earlier server observations' };
    env.serverJob = { ...env.job };
    await env.mount(); assert.equal(env.note().props.value, 'Earlier server observations');
    await env.type(''); await env.restart();
    assert.equal(env.note().props.value, '');
    assert.equal(env.writes.length, 0); assert.equal((await env.queue()).length, 0);
  } finally { await env.close(); }
});

test('empty or stale server refresh and hidden management mode cannot replace locally dirty work notes', async () => {
  const env = harness(); try {
    await env.mount(); await env.type('Local observations that are newer than server data.');
    await env.rerender({ workNotes: '', notes: '', updatedAt: '2026-11-16T18:01:00.000Z' });
    assert.equal(env.note().props.value, 'Local observations that are newer than server data.');
    env.active = false; await env.rerender({ workNotes: 'Older server observations' });
    await env.app('background'); await env.unmount(); env.active = true; await env.mount();
    assert.equal(env.note().props.value, 'Local observations that are newer than server data.');
    assert.equal(env.writes.length, 0);
  } finally { await env.close(); }
});

test('work-note storage failure is visible and retains editable text without a false saved acknowledgement', async () => {
  const env = harness(); try {
    await env.mount(); const writesBefore = env.storageWrites.length; env.storageFailure = new Error('Device storage is full; free space and retry.');
    await env.type('These observations must remain visible when storage fails.');
    assert.equal(env.note().props.value, 'These observations must remain visible when storage fails.');
    assert.match(env.text(), /Device storage is full/); assert.equal(env.actions.current.getDrafts().notes, true);
    assert.equal(env.storageWrites.length, writesBefore); assert.equal(env.writes.length, 0);
    env.storageFailure = null;
  } finally { await env.close(); }
});

test('a queued-note acknowledgement cannot clear or overwrite newer text typed after that submission', async () => {
  const env = harness(); try {
    await env.mount(); await env.type('First queued observation.'); await env.press('Save work notes');
    assert.equal((await env.queue()).length, 1); assert.equal((await env.queue())[0].patch.notes, 'First queued observation.');
    await env.type('Newer observation added after the queued submission.');
    await env.sync(); assert.equal((await env.queue())[0].state, 'synced');
    await env.rerender({ workNotes: env.serverJob.workNotes, updatedAt: env.serverJob.updatedAt });
    assert.equal(env.note().props.value, 'Newer observation added after the queued submission.');
    await env.restart(); assert.equal(env.note().props.value, 'Newer observation added after the queued submission.');
    assert.equal(env.writes.length, 1); assert.equal((await env.queue()).length, 1);
  } finally { await env.close(); }
});

test('draft restoration is isolated by job, account, company, membership and role', async () => {
  const env = harness(); try {
    await env.mount(); await env.type('Private draft for the original technician assignment.'); await env.unmount();
    const originalJob = env.job, originalClaims = { ...env.claims }, originalUid = env.auth.currentUser.uid;
    for (const change of [() => { env.job = { ...originalJob, id: 'different-job' }; }, () => { env.auth.currentUser.uid = 'different-account'; }, () => { env.claims.companyId = 'different-company'; }, () => { env.claims.membershipId = 'different-membership'; }, () => { env.claims.role = 'manager'; }]) {
      env.job = originalJob; env.claims = { ...originalClaims }; env.auth.currentUser.uid = originalUid; change();
      await env.mount(); assert.doesNotMatch(env.text(), /Private draft for the original/); await env.unmount();
    }
    env.job = originalJob; env.claims = originalClaims; env.auth.currentUser.uid = originalUid;
    await env.mount(); assert.equal(env.note().props.value, 'Private draft for the original technician assignment.');
    assert.equal(env.writes.length, 0);
  } finally { await env.close(); }
});

test('a delayed discard acknowledgement cannot clear another job note or release its draft guard', async () => {
  const env = harness(); let releaseArchive, discardTask;
  const archiveWait = new Promise(resolve => { releaseArchive = resolve; });
  try {
    await env.mount(); await env.type('First job draft explicitly selected for discard.');
    let archiveHeld = false;
    env.beforeStorageWrite = async key => {
      if (key.includes(':discarded:')) { archiveHeld = true; await archiveWait; }
    };
    const originalActions = env.actions.current;
    await act(async () => { discardTask = originalActions.discardDrafts(); for (let index = 0; index < 30; index++) await Promise.resolve(); });
    assert.equal(archiveHeld, true, 'The original discard must be suspended at its actual archive write.');
    await env.rerender({ id: 'second-draft-job', workNotes: '', notes: '', updatedAt: '2026-11-16T19:00:00.000Z' });
    await env.type('Independent observations for the second job.');
    assert.equal(env.actions.current.getDrafts().notes, true);
    let result;
    await act(async () => { releaseArchive(); result = await discardTask; });
    assert.equal(result.success, false); assert.match(result.message, /changed|retained/i);
    assert.equal(env.note().props.value, 'Independent observations for the second job.');
    assert.equal(env.actions.current.getDrafts().notes, true); assert.equal(env.drafts.at(-1), true);
    assert.equal((await env.api.readWorkNoteDraft('second-draft-job')).text, 'Independent observations for the second job.');
    await env.restart(); assert.equal(env.note().props.value, 'Independent observations for the second job.');
    assert.equal(env.writes.length, 0); assert.equal((await env.queue()).length, 0);
  } finally {
    releaseArchive(); if (discardTask) await discardTask.catch(() => {});
    await env.close();
  }
});

test('a clean acknowledged snapshot yields to genuinely newer canonical server work notes', async () => {
  const env = harness(); try {
    await env.mount(); await env.type('Earlier acknowledged observations.'); await env.press('Save work notes'); await env.sync();
    const acknowledged = await env.api.readWorkNoteDraft(env.job.id);
    assert.equal(acknowledged.state, 'synced'); assert.equal(acknowledged.dirty, false);
    assert.equal(acknowledged.text, 'Earlier acknowledged observations.');
    const newerVersion = new Date(Date.parse(acknowledged.serverVersion) + 60000).toISOString();
    await env.rerender({ workNotes: 'Newer canonical observations saved from another authorized session.', notes: 'Newer canonical observations saved from another authorized session.', updatedAt: newerVersion });
    assert.equal(env.note().props.value, 'Newer canonical observations saved from another authorized session.');
    assert.equal(env.actions.current.getDrafts().notes, false);
    await env.restart(); assert.equal(env.note().props.value, 'Newer canonical observations saved from another authorized session.');
    assert.equal(env.writes.length, 1); assert.equal((await env.queue()).length, 1);
  } finally { await env.close(); }
});
