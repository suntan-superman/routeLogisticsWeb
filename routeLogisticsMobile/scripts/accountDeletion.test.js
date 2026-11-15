const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const babel = require('@babel/core');
const { createAccountDeletion } = require('../services/accountDeletionCore');
const root = path.resolve(__dirname, '..');

function fixture(overrides = {}) {
  const calls = [], account = { uid: 'tech', email: 'tech@example.test', emailVerified: true, getIdToken: async () => 'synthetic-token' };
  const deps = {
    account: () => account, isOffline: async () => false, summary: async () => ({ pendingOperations: 0, pendingPhotos: 0 }),
    pause: async uid => { calls.push(['pause', uid]); return () => calls.push(['resume', uid]); },
    stopTracking: async () => calls.push(['tracking']), stopPush: async () => calls.push(['push']),
    invoke: async (...args) => { calls.push(['server', ...args]); return { success: true, deleted: true }; },
    purge: async uid => calls.push(['purge', uid]), finishSession: async uid => calls.push(['session', uid]), ...overrides,
  };
  return { ...createAccountDeletion(deps), deps, calls, account };
}
test('deletion requires a verified account, typed confirmation, and network before side effects', async () => {
  for (const change of [f => { f.account.emailVerified = false; }, f => { f.deps.account = () => null; }, f => { f.deps.isOffline = async () => true; }]) {
    const f = fixture(); change(f); const result = await f.remove({ confirmation: 'DELETE', emailConfirmation: 'tech@example.test' });
    assert.equal(result.success, false); assert.deepEqual(f.calls, []);
  }
  const f = fixture(); assert.equal((await f.remove({ confirmation: 'delete' })).success, false); assert.deepEqual(f.calls, []);
});

test('missing, partial and wrong full-email confirmations fail before any local or server side effect', async () => {
  for (const emailConfirmation of [undefined, null, '', 'tech', '@example.test', 'tech@example', 'other@example.test', 'tech@example.test.extra', 'tech@example.test extra', { email: 'tech@example.test' }]) {
    const f = fixture(), result = await f.remove({ confirmation: 'DELETE', emailConfirmation });
    assert.equal(result.success, false); assert.match(result.error.message, /full signed-in email/); assert.deepEqual(f.calls, []);
  }
});

test('case and surrounding whitespace can match but the exact user-entered email reaches the server', async () => {
  const f = fixture(), entered = '  TECH@Example.Test  ';
  assert.equal((await f.remove({ confirmation: 'DELETE', emailConfirmation: entered })).success, true);
  assert.deepEqual(f.calls.find(row => row[0] === 'server'), ['server', 'synthetic-token', entered]);
});

test('UID, email or verification changes during native shutdown stop deletion before the server request', async () => {
  for (const change of [f => { f.deps.account = () => ({ ...f.account, uid: 'other' }); }, f => { f.account.email = 'changed@example.test'; }, f => { f.account.emailVerified = false; }]) {
    const f = fixture(); f.deps.stopPush = async () => { f.calls.push(['push']); change(f); };
    const result = await f.remove({ confirmation: 'DELETE', emailConfirmation: 'tech@example.test' });
    assert.equal(result.success, false); assert.match(result.error.message, /account or email changed/);
    assert.ok(!f.calls.some(row => ['server', 'purge', 'session'].includes(row[0]))); assert.ok(f.calls.some(row => row[0] === 'resume'));
  }
});
test('pending old-role work/photos require explicit discard permission and remain intact on refusal', async () => {
  const f = fixture({ summary: async () => ({ pendingOperations: 2, pendingPhotos: 3 }) });
  assert.deepEqual(await f.summary(), { pendingOperations: 2, pendingPhotos: 3 });
  const result = await f.remove({ confirmation: 'DELETE', emailConfirmation: 'tech@example.test', discardPendingWork: false });
  assert.equal(result.success, false); assert.match(result.error.message, /explicitly confirm/);
  assert.deepEqual(f.calls, [['pause', 'tech'], ['resume', 'tech']]);
});
test('deletion stops collection then waits for authoritative server success before local purge/signout', async () => {
  const f = fixture(); const result = await f.remove({ confirmation: 'DELETE', emailConfirmation: 'tech@example.test' });
  assert.deepEqual(result, { success: true, deleted: true });
  assert.deepEqual(f.calls.map(row => row[0]), ['pause', 'tracking', 'push', 'server', 'purge', 'session']);
});
test('duplicate deletion taps share one request and do not repeat destructive work', async () => {
  let release, calls = 0;
  const f = fixture({ invoke: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const first = f.remove({ confirmation: 'DELETE', emailConfirmation: 'tech@example.test' }), second = f.remove({ confirmation: 'DELETE', emailConfirmation: 'tech@example.test' });
  assert.equal(first, second); await new Promise(resolve => setImmediate(resolve));
  release({ success: true, deleted: true }); await first; assert.equal(calls, 1);
});
test('backend ownership/permission failures retain pending work and allow retry without local purge', async () => {
  const f = fixture({ invoke: async () => { throw Object.assign(new Error('Transfer company ownership before deleting your account.'), { code: 'functions/failed-precondition' }); } });
  const result = await f.remove({ confirmation: 'DELETE', emailConfirmation: 'tech@example.test' });
  assert.equal(result.success, false); assert.match(result.error.message, /Transfer company ownership/);
  assert.equal(result.error.code, 'functions/failed-precondition'); assert.ok(f.calls.some(row => row[0] === 'resume'));
  assert.ok(!f.calls.some(row => ['purge', 'session'].includes(row[0])));
});
test('an unconfirmed response or native tracking shutdown failure never discards saved work', async () => {
  for (const overrides of [{ invoke: async () => ({ success: true }) }, { stopTracking: async () => { throw new Error('Native location could not stop.'); } }]) {
    const f = fixture(overrides), result = await f.remove({ confirmation: 'DELETE', emailConfirmation: 'tech@example.test' });
    assert.equal(result.success, false); assert.ok(!f.calls.some(row => row[0] === 'purge'));
  }
});
test('accepted durable pending deletion signs out and accurately reports automatic server cleanup', async () => {
  const f = fixture({ invoke: async () => ({ success: true, deletionPending: true }) });
  const result = await f.remove({ confirmation: 'DELETE', emailConfirmation: 'tech@example.test' });
  assert.equal(result.success, true); assert.equal(result.deletionPending, true); assert.equal(result.deleted, undefined);
  assert.ok(f.calls.some(row => row[0] === 'purge')); assert.ok(f.calls.some(row => row[0] === 'session'));
});
test('local cleanup failure retries using confirmed receipt instead of resubmitting server deletion', async () => {
  let purges = 0;
  const f = fixture({ purge: async () => { if (++purges === 1) throw new Error('Device storage unavailable. Retry cleanup.'); } });
  const failed = await f.remove({ confirmation: 'DELETE', emailConfirmation: 'tech@example.test' });
  assert.equal(failed.success, false); assert.equal(failed.deletionRecorded, true); assert.equal(failed.localCleanupPending, true);
  f.deps.account = () => null; f.deps.isOffline = async () => true;
  assert.equal((await f.remove({ confirmation: 'DELETE' })).success, true);
  assert.equal(f.calls.filter(row => row[0] === 'server').length, 1); assert.equal(purges, 2);
});
test('signed-out cleanup Retry recovers an accepted receipt even when its durable storage write initially failed', async () => {
  let writes = 0;
  const f = fixture({ record: async () => { if (++writes === 1) throw new Error('Device storage unavailable.'); } });
  const result = await f.remove({ confirmation: 'DELETE', emailConfirmation: 'tech@example.test' });
  assert.equal(result.deletionRecorded, true); assert.equal(result.localCleanupPending, true);
  f.deps.account = () => null; await f.resume();
  assert.equal(f.calls.filter(row => row[0] === 'server').length, 1);
  assert.equal(f.calls.filter(row => row[0] === 'purge').length, 1); assert.equal(f.calls.filter(row => row[0] === 'session').length, 1);
});

function modulesFixture() {
  const modules = new Map(), storage = new Map(), deletedFiles = [], account = { uid: 'tech', email: 'tech@example.test', emailVerified: true }, claims = { companyId: 'acme', role: 'technician', membershipId: 'member' };
  let network = false, invoke = async () => ({ data: { status: 'synced' } });
  const auth = { app: { options: { projectId: 'demo-account-deletion' } }, currentUser: account };
  const mocks = {
    '@react-native-async-storage/async-storage': { getItem: async key => storage.get(key) || null, setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key), getAllKeys: async () => [...storage.keys()], multiRemove: async keys => keys.forEach(key => storage.delete(key)) },
    '@react-native-community/netinfo': { fetch: async () => ({ isConnected: network, isInternetReachable: network }) },
    'expo-crypto': { randomUUID: () => 'synthetic-operation' },
    'expo-secure-store': { deleteItemAsync: async () => {} },
    'expo-file-system/legacy': { documentDirectory: 'file:///documents/', deleteAsync: async file => deletedFiles.push(file), makeDirectoryAsync: async () => {}, copyAsync: async () => {} },
    'react-native': { AppState: { currentState: 'active' } },
    'firebase/functions': { httpsCallable: () => data => invoke(data) },
  };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module); const localRequire = createRequire(filename);
    const requireMock = name => {
      if (mocks[name]) return mocks[name];
      if (name === '../constants/firebase') return { auth, functions: {} };
      if (name === './tenancy') return { requireWorkspace() {}, getClaims: () => claims, tenantFields: () => ({ userId: account.uid, companyId: claims.companyId }) };
      if (name === './workspaceApi') return { readWorkspace: async () => ({ job: { id: 'job', updatedAt: 1 } }), callWorkspace: async () => ({ status: 'synced' }) };
      if (name === './workTracking') return { stopShiftTracking: async () => {} };
      if (name === './nativePush') return { signOutNativePush: async () => {}, purgeDeletedAccountPush: async () => {} };
      if (name.startsWith('.')) { const resolved = path.resolve(path.dirname(filename), name); return load(resolved.endsWith('.js') ? resolved : resolved + '.js'); }
      return localRequire(name);
    };
    const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
    new Function('require', 'module', 'exports', code)(requireMock, module, module.exports); return module.exports;
  }
  return { load, storage, deletedFiles, account, auth, claims, online: value => { network = value; }, invoke: value => { invoke = value; } };
}
test('offline deletion summary includes all account workspaces and failed work, without another UID', async () => {
  const f = modulesFixture(), offline = f.load('services/offline.js'), prefix = 'rl-offline-v1:demo-account-deletion:';
  f.storage.set(`${prefix}tech:old:manager:former:queue`, JSON.stringify([{ kind: 'job', state: 'failed' }, { kind: 'photo', state: 'pending' }, { kind: 'photo', state: 'discarded' }]));
  f.storage.set(`${prefix}tech:acme:technician:member:queue`, JSON.stringify([{ kind: 'application', state: 'conflict' }, { kind: 'job', state: 'synced' }]));
  f.storage.set(`${prefix}other:acme:technician:other:queue`, JSON.stringify([{ kind: 'job', state: 'pending' }]));
  assert.deepEqual(await offline.accountOfflineSummary('tech'), { pendingOperations: 2, pendingPhotos: 1 });
});
test('purge removes only this UID caches/queues and app-owned queued photos; preserves appearance and another account', async () => {
  const f = modulesFixture(), offline = f.load('services/offline.js'), prefix = 'rl-offline-v1:demo-account-deletion:';
  f.storage.set(`${prefix}tech:old:manager:former:queue`, JSON.stringify([{ kind: 'photo', localUri: 'file:///documents/rl-photos/owned-photo.jpg' }, { kind: 'photo', localUri: 'file:///library/original.jpg' }, { kind: 'photo', localUri: 'file:///documents/rl-photos/../private.jpg' }]));
  f.storage.set(`${prefix}tech:acme:technician:member:cache:policy2:jobs`, 'private'); f.storage.set('rl-session-v3:tech', 'session');
  const other = `${prefix}other:acme:technician:other:queue`; f.storage.set(other, JSON.stringify([{ kind: 'photo', localUri: 'file:///documents/rl-photos/other-photo.jpg' }]));
  f.storage.set('rl-appearance-v1', 'dark'); await offline.pauseOfflineForAccount('tech'); await offline.purgeOfflineForAccount('tech');
  assert.deepEqual(f.deletedFiles, ['file:///documents/rl-photos/owned-photo.jpg']);
  assert.deepEqual([...f.storage.keys()].sort(), [other, 'rl-appearance-v1'].sort());
  await offline.writeCache('jobs', 'must not return', `${prefix}tech:acme:technician:member`);
  assert.equal(f.storage.size, 2);
});
test('pause waits for an in-flight send and prevents new saves/sends during account deletion', async () => {
  const f = modulesFixture(), offline = f.load('services/offline.js'); f.online(true);
  const scope = offline.offlineScope();
  f.storage.set(`${scope}:queue`, JSON.stringify([{ id: 'first', kind: 'job', jobId: 'job', patch: {}, state: 'pending', nextAttempt: 0 }]));
  let sent = 0, complete; f.invoke(() => { sent++; return new Promise(resolve => { complete = resolve; }); });
  const drain = offline.flushOffline(); await new Promise(resolve => setImmediate(resolve));
  let paused = false; const pause = offline.pauseOfflineForAccount('tech').then(release => { paused = true; return release; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(paused, false);
  await assert.rejects(offline.saveApplicationOffline('job', {}), /deletion is in progress/);
  complete({ data: { status: 'synced', version: 2 } }); await drain; const resume = await pause;
  await offline.flushOffline(); assert.equal(sent, 1); assert.equal(paused, true); resume();
});
test('HTTP retry keeps the same in-memory token after a lost response and accepts only a server receipt', async t => {
  const f = modulesFixture(), api = f.load('services/accountDeletion.js'), requests = [];
  const previous = global.fetch; t.after(() => { global.fetch = previous; });
  global.fetch = async (url, options) => { requests.push({ url, options }); if (requests.length === 1) throw new TypeError('Connection closed after server deletion'); return { ok: true, json: async () => ({ result: { success: true, deleted: true } }) }; };
  const entered = '  TECH@Example.Test  ';
  assert.equal((await api.invokeAccountDeletion('synthetic-token', entered)).deleted, true);
  assert.equal(requests.length, 2); assert.equal(requests[0].options.headers.Authorization, requests[1].options.headers.Authorization);
  assert.deepEqual(JSON.parse(requests[1].options.body), { data: { confirmation: 'DELETE', emailConfirmation: entered } });
});

test('the HTTP adapter never substitutes the Firebase account email for missing user confirmation', async t => {
  const f = modulesFixture(), api = f.load('services/accountDeletion.js'); let requests = 0;
  const previous = global.fetch; t.after(() => { global.fetch = previous; }); global.fetch = async () => { requests++; throw Error('Should not send an unconfirmed request.'); };
  await assert.rejects(api.invokeAccountDeletion('synthetic-token'), /full signed-in email/); assert.equal(requests, 0);
});
test('HTTP ownership rejection is not retried and durable pending errors are explicit accepted receipts', async t => {
  const f = modulesFixture(), api = f.load('services/accountDeletion.js'); let requests = 0;
  const previous = global.fetch; t.after(() => { global.fetch = previous; });
  global.fetch = async () => { requests++; return { ok: false, status: 400, json: async () => ({ error: { status: 'FAILED_PRECONDITION', message: 'Transfer ownership first.' } }) }; };
  await assert.rejects(api.invokeAccountDeletion('synthetic-token', 'tech@example.test'), /Transfer ownership first/); assert.equal(requests, 1);
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: { status: 'UNAVAILABLE', details: { deletionPending: true } } }) });
  assert.deepEqual(await api.invokeAccountDeletion('synthetic-token', 'tech@example.test'), { success: true, deletionPending: true });
});
test('a restart resumes only recorded UID cleanup without another server deletion or account data purge', async () => {
  const f = modulesFixture(), api = f.load('services/accountDeletion.js');
  const key = 'rl-account-deletion-cleanup-v1:demo-account-deletion';
  f.storage.set(key, JSON.stringify([{ uid: 'deleted', email: 'deleted@example.test', receipt: { success: true, deleted: true } }]));
  f.storage.set('rl-session-v3:deleted', 'old session'); f.storage.set('rl-session-v3:tech', 'current session');
  f.storage.set('rl-login-email-v1', 'tech@example.test'); f.storage.set('rl-appearance-v1', 'dark');
  const sessions = []; await api.resumeDeletedAccountCleanup(async uid => sessions.push(uid));
  assert.deepEqual(sessions, ['deleted']); assert.equal(f.storage.has(key), false); assert.equal(f.storage.has('rl-session-v3:deleted'), false);
  assert.equal(f.storage.get('rl-session-v3:tech'), 'current session'); assert.equal(f.storage.get('rl-login-email-v1'), 'tech@example.test'); assert.equal(f.storage.get('rl-appearance-v1'), 'dark');
});
