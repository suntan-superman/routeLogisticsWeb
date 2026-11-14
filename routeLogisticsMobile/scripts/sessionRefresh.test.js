const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const React = require('react');
const { create, act } = require('react-test-renderer');
const babel = require('@babel/core');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
function fixture() {
  let token = { companyId: 'acme', membershipId: 'member', role: 'technician' };
  let server = async () => ({ claims: { ...token }, workspace: { status: 'company' } });
  let companyFailure = null, syncCalls = 0, reloads = 0, authListener;
  const modules = new Map(), storage = new Map([['rl-offline-v1:project:tech:acme:technician:member:queue', '[{"id":"saved-work"}]'], ['local-photo', 'file:///documents/keep-photo.jpg']]);
  const purges = [], app = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
  const user = { uid: 'tech', email: 'luis@example.test', displayName: 'Luis', emailVerified: true,
    reload: async () => { reloads++; }, getIdToken: async () => 'not-a-real-token', getIdTokenResult: async () => ({ claims: { ...token } }) };
  const auth = { currentUser: user };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const nativeRequire = createRequire(filename);
    const mockRequire = name => {
      if (name === 'react-native') return { AppState: app };
      if (name === 'expo-secure-store') return { deleteItemAsync: async () => {} };
      if (name === '@react-native-community/netinfo') return { fetch: async () => ({ isConnected: true, isInternetReachable: true }) };
      if (name === '@react-native-async-storage/async-storage') return { getItem: async key => storage.get(key) || null, setItem: async (key, value) => storage.set(key, value), multiRemove: async keys => keys.forEach(key => storage.delete(key)) };
      if (name === '../services/offline') return { isOffline: async () => false, purgeLegacyReadCaches: async () => {}, purgeOtherRoleCaches: async (...args) => purges.push(args), offlineScope: () => { const claims = load('services/tenancy.js').getClaims(); return `scope:${claims?.role || 'none'}:${claims?.membershipId || ''}`; } };
      if (name === 'firebase/auth') return { onAuthStateChanged: (_auth, callback) => { authListener = callback; return () => { authListener = null; }; } };
      if (name === 'firebase/firestore') return { doc: (...args) => args, where: (...args) => args, getDoc: async () => ({ exists: () => true, data: () => ({ name: 'Luis', services: ['Legacy personal service'] }) }) };
      if (name === 'firebase/functions') return { httpsCallable: () => async () => { syncCalls++; return { data: await server() }; } };
      if (name === '../constants/firebase') return { auth, db: {}, functions: {} };
      if (name === '../services/firebase') return { AuthService: { signOut: async () => ({ success: true }), updateUserProfile: async () => ({ success: true }) } };
      if (name === '../services/staffLogin') return { requestStaffCode: async () => {}, signInWithStaffCode: async () => {} };
      if (name === '../services/nativeInteraction') return { isNativeInteractionActive: () => false, subscribeNativeInteraction: () => () => {} };
      if (name === '../services/workTracking') return { stopShiftTracking: async () => {} };
      if (name === '../services/nativePush') return { signOutNativePush: async () => {} };
      if (name === '../services/workspaceApi') return { readWorkspace: async () => { if (companyFailure) throw companyFailure; return { company: { name: 'Acme', services: ['Inspection'] } }; } };
      if (name.startsWith('.')) { const target = path.resolve(path.dirname(filename), name); if (target.endsWith('.json')) return nativeRequire(name); return load(target.endsWith('.js') ? target : target + '.js'); }
      return nativeRequire(name);
    };
    const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
    new Function('require', 'module', 'exports', code)(mockRequire, module, module.exports);
    return module.exports;
  }
  const session = load('contexts/SessionProvider.js');
  let value, tree;
  function Probe() { value = session.useAuth(); return null; }
  return { storage, purges, auth,
    async mount() { await act(async () => { tree = create(React.createElement(session.AuthProvider, null, React.createElement(Probe))); }); await act(async () => authListener(user)); return value; },
    async unmount() { await act(async () => tree.unmount()); }, current: () => value,
    server: handler => { server = handler; }, token: next => { token = next; }, companyFailure: error => { companyFailure = error; },
    syncCalls: () => syncCalls, reloads: () => reloads };
}
const settle = () => act(async () => { await new Promise(resolve => setImmediate(resolve)); });
test('foreground hydration is deduplicated and a temporary validation failure keeps the mounted session without a revoked status', async () => {
  const f = fixture(); await f.mount();
  assert.equal(f.current().accessStatus, 'ready'); const original = f.current().user;
  let finish;
  f.server(() => new Promise(resolve => { finish = resolve; }));
  let first, second;
  await act(async () => { first = f.current().refreshUser(); second = f.current().refreshUser(); }); await settle();
  assert.equal(first, second); assert.equal(f.reloads(), 1); assert.equal(f.syncCalls(), 2);
  assert.equal(f.current().accessStatus, 'checking'); assert.equal(f.current().user, original); assert.equal(f.current().permissions.canAccess, true);
  f.server(async () => { throw Object.assign(new Error('Network unavailable.'), { code: 'functions/unavailable' }); });
  await act(async () => finish({ claims: { companyId: 'acme', membershipId: 'member', role: 'technician' }, workspace: { status: 'company' } })); await first;
  await act(async () => f.current().refreshUser());
  assert.equal(f.current().accessStatus, 'unavailable'); assert.equal(f.current().sessionError, '');
  assert.equal(f.current().user.id, 'tech'); assert.equal(f.current().permissions.canAccess, true);
  assert.match(f.current().accessError, /Network unavailable/);
  assert.equal(f.storage.get('local-photo'), 'file:///documents/keep-photo.jpg');
  assert.ok([...f.storage.keys()].some(key => key.endsWith(':queue')));
  await f.unmount();
});
test('a successful authoritative check confirms real membership loss and preserves saved work/photos', async () => {
  const f = fixture(); await f.mount();
  f.server(async () => { f.token({}); return { claims: null, workspace: { status: 'unavailable' } }; });
  let result; await act(async () => { result = await f.current().refreshUser(); });
  assert.equal(result.authoritative, true); assert.equal(result.accessStatus, 'revoked');
  assert.equal(f.current().accessStatus, 'revoked'); assert.equal(f.current().permissions.canAccess, false);
  assert.equal(f.current().user.companyId, null); assert.equal(f.current().user.role, null);
  assert.equal(f.purges.at(-1)[1], null);
  assert.equal(f.storage.get('local-photo'), 'file:///documents/keep-photo.jpg'); assert.ok([...f.storage.keys()].some(key => key.endsWith(':queue')));
  await f.unmount();
});
test('a real role change publishes a minimal new role before a failed company-profile read can retain old-role fields', async () => {
  const f = fixture(); f.token({ companyId: 'acme', membershipId: 'member', role: 'admin' }); await f.mount();
  assert.equal(f.current().permissions.canViewFinancial, true);
  f.server(async () => { const claims = { companyId: 'acme', membershipId: 'member', role: 'technician' }; f.token(claims); return { claims, workspace: { status: 'company' } }; });
  f.companyFailure(Object.assign(new Error('Company connection unavailable.'), { code: 'functions/unavailable' }));
  await act(async () => f.current().refreshUser());
  assert.equal(f.current().user.role, 'technician'); assert.equal(f.current().permissions.canViewFinancial, false);
  assert.equal(f.current().accessStatus, 'unavailable'); assert.deepEqual(f.current().user.services, []);
  assert.equal(f.purges.at(-1)[1], 'scope:technician:member');
  await f.unmount();
});
