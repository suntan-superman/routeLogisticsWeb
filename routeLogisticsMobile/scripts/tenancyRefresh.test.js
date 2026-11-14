const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const { workspacePermissions } = require('../services/workspacePolicy');
function fixture() {
  let online = true, calls = 0, server = null;
  let token = { companyId: 'acme', role: 'technician', membershipId: 'member' };
  let result = { claims: { ...token }, workspace: { status: 'company' } };
  const forced = [];
  const user = { uid: 'tech', emailVerified: true, getIdTokenResult: async force => { forced.push(!!force); return { claims: { ...token } }; } };
  const auth = { currentUser: user };
  const module = { exports: {} }, filename = path.resolve(__dirname, '../services/tenancy.js');
  const mocks = {
    'firebase/firestore': { where: (...args) => args },
    'firebase/functions': { httpsCallable: () => async () => { calls++; return { data: server ? await server() : result }; } },
    '../constants/firebase': { auth, functions: {} },
    '@react-native-community/netinfo': { fetch: async () => ({ isConnected: online, isInternetReachable: online }) },
    './workspacePolicy': { workspacePermissions },
  };
  const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  new Function('require', 'module', 'exports', code)(name => mocks[name], module, module.exports);
  return { ...module.exports, auth, user, forced, calls: () => calls,
    online: value => { online = value; }, token: value => { token = value; }, result: value => { result = value; }, server: value => { server = value; } };
}
const turn = () => new Promise(resolve => setImmediate(resolve));
test('same-account claims stay usable during one deduplicated authoritative refresh', async () => {
  const f = fixture(); await f.syncTenancy();
  let finish;
  f.server(() => new Promise(resolve => { finish = resolve; }));
  const first = f.syncTenancy(), second = f.syncTenancy();
  assert.equal(first, second);
  await turn();
  assert.equal(f.getClaims().membershipId, 'member'); assert.equal(f.getWorkspace().status, 'company');
  assert.doesNotThrow(() => f.requireWorkspace()); assert.equal(f.calls(), 2);
  finish({ claims: { companyId: 'acme', role: 'technician', membershipId: 'member' }, workspace: { status: 'company' } });
  await first; assert.equal(f.getPermissions().canAccess, true);
});
test('failed or stale-token refresh never publishes a partial or mismatched membership', async () => {
  const f = fixture(); await f.syncTenancy();
  f.server(async () => { throw Object.assign(new Error('Network unavailable.'), { code: 'functions/unavailable' }); });
  await assert.rejects(f.syncTenancy(), /Network unavailable/);
  assert.equal(f.getClaims().role, 'technician'); assert.doesNotThrow(() => f.requireWorkspace());
  f.server(async () => ({ claims: { companyId: 'acme', role: 'manager', membershipId: 'member' }, workspace: { status: 'company' } }));
  const before = f.forced.filter(Boolean).length;
  await assert.rejects(f.syncTenancy(), error => error.code === 'claims-stale');
  assert.equal(f.forced.filter(Boolean).length - before, 2);
  assert.equal(f.getClaims().role, 'technician'); assert.equal(f.getPermissions().canManage, false);
});
test('current authoritative claims and workspace publish together for a real role change', async () => {
  const f = fixture(); await f.syncTenancy();
  const next = { companyId: 'acme', role: 'manager', membershipId: 'member' };
  f.server(async () => { f.token(next); return { claims: next, workspace: { status: 'company' } }; });
  await f.syncTenancy(); assert.equal(f.getClaims().role, 'manager'); assert.equal(f.getPermissions().canManage, true);
  f.server(async () => { f.token({}); return { claims: null, workspace: { status: 'unavailable' } }; });
  await f.syncTenancy(); assert.equal(f.getClaims(), null); assert.equal(f.getWorkspace().status, 'unavailable');
  assert.throws(() => f.requireWorkspace(), error => error.code === 'workspace-unavailable');
});
test('sign-out and account changes cannot receive a late snapshot from the previous user', async () => {
  const f = fixture(); await f.syncTenancy();
  let finish; f.server(() => new Promise(resolve => { finish = resolve; }));
  const old = f.syncTenancy(); await turn();
  f.auth.currentUser = { ...f.user, uid: 'another' };
  assert.equal(f.getClaims(), null); assert.equal(f.getWorkspace(), null);
  await f.syncTenancy(null);
  finish({ claims: { companyId: 'acme', role: 'admin', membershipId: 'member' }, workspace: { status: 'company' } });
  await old; assert.equal(f.getClaims(), null); assert.equal(f.getWorkspace(), null);
});
test('offline restoration requires exactly the same UID, company, membership and role', async () => {
  const f = fixture(); await f.syncTenancy(); f.online(false); await f.syncTenancy();
  const saved = { id: 'tech', companyId: 'acme', role: 'technician', membershipId: 'member', workspace: { status: 'company' } };
  f.restoreOfflineWorkspace(saved, f.user); assert.equal(f.getPermissions().canAccess, true);
  assert.throws(() => f.restoreOfflineWorkspace({ ...saved, role: 'admin' }, f.user));
  assert.throws(() => f.restoreOfflineWorkspace({ ...saved, id: 'other' }, f.user));
  assert.throws(() => f.restoreOfflineWorkspace(saved, { uid: 'other' }));
});
