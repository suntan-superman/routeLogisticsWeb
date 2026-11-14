const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json'));
const web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, env;
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const result = (company, patch = {}) => ({ enabled: true, environment: 'sandbox', writesEnabled: false, productionApproved: false, connected: true, realmId: `${company}-realm`, companyName: `${company} QuickBooks`, health: 'connected', incomeAccountId: '12', defaultItemId: '34', mappings: [{ type: 'Customer', localId: `${company}-customer`, remoteId: '123', status: 'synced' }], operations: [], webhookEvents: [], ...patch });
function reset(role = 'owner') {
  env = { uid: 'owner-a', company: 'company-a', role, membershipId: null, calls: [], redirects: [], replacements: [], status: new Map(), records: new Map(), confirmations: [], confirm: async () => true, connect: null };
  global.window = { location: { pathname: '/integrations', search: '', hash: '', assign: value => env.redirects.push(value) }, history: { replaceState: (_a, _b, value) => { env.replacements.push(value); const parsed = new URL(value, 'https://route-logistics.com'); window.location.search = parsed.search; } } };
}
const claims = () => ({ companyId: env.company, membershipId: env.membershipId, role: env.role });
const firebase = { db: {}, functions: {}, auth: { get currentUser() { return { uid: env.uid }; } } };
const tenancy = { getClaims: claims, can: capability => capability === 'integrations.read' && ['owner', 'admin'].includes(env.role), scopeWhere: () => ({ field: 'companyId', value: env.company }) };
const mock = name => {
  if (name === 'react') return React;
  if (name === 'firebase/functions') return { httpsCallable: (_functions, fullName) => async data => {
    const name = fullName.replace(/^rlQuickBooks/, ''), company = env.company;
    env.calls.push({ name, company, data });
    if (name === 'Status') return { data: await (env.status.get(company) || result(company)) };
    if (name === 'Connect') return { data: env.connect ? await env.connect.promise : { url: 'https://intuit.test/authorize' } };
    if (name === 'Preview') return { data: { payload: { marker: company }, environment: 'sandbox', fingerprint: 'review', action: 'create' } };
    if (name === 'Disconnect') return { data: { disconnected: true, warning: 'Disconnected locally; provider revocation could not be confirmed.' } };
    return { data: { saved: true } };
  } };
  if (name === 'firebase/firestore') return { collection: (_db, name) => name, limit: value => value, query: (name, scope) => ({ name, scope }), getDocs: async query => env.records.get(query.scope.value) || { docs: [{ id: `${query.scope.value}-customer`, get: key => key === 'name' ? `${query.scope.value} customer` : null }] } };
  if (name.endsWith('/services/firebase')) return firebase;
  if (name.endsWith('/services/tenancy')) return tenancy;
  if (name.endsWith('/contexts/AuthContext')) return { useAuth: () => ({ currentUser: { uid: env.uid }, role: env.role, company: { id: env.company } }) };
  if (name.endsWith('/components/ConfirmProvider')) return { useConfirm: () => request => { env.confirmations.push(request); return env.confirm(request); } };
  if (name.endsWith('/components/SmsSettings') || name.endsWith('/components/PaymentReadiness')) return { __esModule: true, default: () => null };
  throw Error('Unexpected dependency: ' + name);
};
const moduleValue = { exports: {} };
const source = fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src/pages/IntegrationsPage.jsx'), 'utf8');
new Function('React', 'require', 'module', 'exports', transformSync(source, { loader: 'jsx', format: 'cjs' }).code)(React, mock, moduleValue, moduleValue.exports);
const Page = moduleValue.exports.default;
const text = () => JSON.stringify(tree.toJSON());
const button = title => tree.root.findAll(node => node.type === 'button' && node.children.join('') === title)[0];
const render = async () => { await act(async () => { tree = create(React.createElement(Page)); }); await act(settle); };
const update = async () => { await act(async () => tree.update(React.createElement(Page))); await act(settle); };
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });

test('company changes immediately discard old status, mappings and late record/status responses', async () => {
  reset(); const oldStatus = deferred(), oldRecords = deferred();
  env.status.set('company-a', oldStatus.promise); env.records.set('company-a', oldRecords.promise);
  await render();
  env.company = 'company-b'; env.uid = 'owner-b'; await update();
  assert.match(text(), /company-b QuickBooks/); assert.doesNotMatch(text(), /company-a/);
  await act(async () => { oldStatus.resolve(result('company-a')); oldRecords.resolve({ docs: [{ id: 'company-a-customer', get: () => 'company-a private record' }] }); }); await act(settle);
  assert.match(text(), /company-b QuickBooks/); assert.doesNotMatch(text(), /company-a/);
});

test('late OAuth Connect cannot redirect after tenant switch and duplicate taps submit only once', async () => {
  reset(); await render(); env.connect = deferred();
  await act(async () => { button('Reconnect').props.onClick(); button('Reconnect').props.onClick(); });
  assert.equal(env.calls.filter(call => call.name === 'Connect').length, 1);
  env.company = 'company-b'; env.uid = 'owner-b'; await update();
  await act(async () => env.connect.resolve({ url: 'https://intuit.test/old-company' })); await act(settle);
  assert.deepEqual(env.redirects, []); assert.match(text(), /company-b QuickBooks/);
});

test('admin connection status is readable while only owner can connect or disconnect', async () => {
  reset('admin'); await render(); assert.match(text(), /company-a QuickBooks/); assert.equal(button('Reconnect'), undefined); assert.equal(button('Disconnect'), undefined);
  env.role = 'technician'; env.membershipId = 'technician'; await update();
  assert.match(text(), /owner or administrator/); assert.doesNotMatch(text(), /company-a/);
  assert.equal(env.calls.some(call => call.name === 'Connect' || call.name === 'Disconnect'), false);
});

test('OAuth callback errors are actionable, sanitized and removed from the URL', async () => {
  reset(); window.location.search = '?qbError=company-mismatch&keep=1'; await render();
  assert.match(text(), /differs from the company linked to your saved mappings/); assert.equal(window.location.search, '?keep=1');
  await act(async () => tree.unmount()); tree = null; reset(); window.location.search = '?qbError=%3Cscript%3Eunsafe%3C%2Fscript%3E'; await render();
  assert.match(text(), /authorization could not be completed/); assert.doesNotMatch(text(), /unsafe|<script>/);
});

test('authorization and revocation failures expose self-service reconnect/status guidance', async () => {
  reset(); env.status.set('company-a', result('company-a', { reconnectRequired: true, health: 'reconnect-required', lastError: 'Reconnect QuickBooks to renew access.' })); await render();
  assert.match(text(), /expired or been revoked/); assert.ok(button('Reconnect'));
  env.status.set('company-a', result('company-a', { connected: false, health: 'disconnected' }));
  await act(async () => button('Disconnect').props.onClick()); await act(settle);
  assert.match(text(), /provider revocation could not be confirmed/); assert.ok(button('Connect QuickBooks'));
});

test('pending disconnect confirmation cannot mutate a newly selected tenant', async () => {
  reset(); const confirmation = deferred(); env.confirm = () => confirmation.promise; await render();
  await act(async () => { button('Disconnect').props.onClick(); });
  env.company = 'company-b'; env.uid = 'owner-b'; await update();
  await act(async () => confirmation.resolve(true)); await act(settle);
  assert.equal(env.calls.some(call => call.name === 'Disconnect'), false);
});

test('an in-progress disconnect blocks competing connect actions and keeps status refresh available', async () => {
  reset(); env.status.set('company-a', result('company-a', { disconnecting: true })); await render();
  assert.equal(button('Reconnect').props.disabled, true); assert.equal(button('Disconnect').props.disabled, true);
  assert.equal(button('Refresh connection status').props.disabled, false); assert.match(text(), /previous revocation request settles/);
});

test('disconnect safety wait refreshes at the server duration and enables owner reconnect without another click', async t => {
  reset(); t.mock.timers.enable({ apis: ['setTimeout'] });
  env.status.set('company-a', result('company-a', { connected: false, disconnecting: true, disconnectRetryAfterMs: 60000, health: 'disconnecting' })); await render();
  assert.equal(button('Connect QuickBooks').props.disabled, true);
  env.status.set('company-a', result('company-a', { connected: false, disconnecting: false, disconnectRetryAfterMs: 0, health: 'disconnected' }));
  await act(async () => t.mock.timers.tick(59999));
  assert.equal(env.calls.filter(call => call.name === 'Status').length, 1);
  await act(async () => t.mock.timers.tick(1)); await act(settle);
  assert.equal(env.calls.filter(call => call.name === 'Status').length, 2);
  assert.equal(button('Connect QuickBooks').props.disabled, false); assert.doesNotMatch(text(), /previous revocation request settles/);
  assert.equal(env.calls.some(call => call.name === 'Connect'), false);
});

test('disconnect safety refresh is cancelled when the owner changes company', async t => {
  reset(); t.mock.timers.enable({ apis: ['setTimeout'] });
  env.status.set('company-a', result('company-a', { connected: false, disconnecting: true, disconnectRetryAfterMs: 60000 })); await render();
  env.company = 'company-b'; env.uid = 'owner-b'; await update();
  await act(async () => t.mock.timers.tick(60000)); await act(settle);
  assert.equal(env.calls.filter(call => call.name === 'Status' && call.company === 'company-a').length, 1);
  assert.equal(env.calls.filter(call => call.name === 'Status' && call.company === 'company-b').length, 1);
  assert.match(text(), /company-b QuickBooks/); assert.doesNotMatch(text(), /previous revocation request settles/);
});

test('disconnect safety refresh is cancelled when the portal unmounts', async t => {
  reset(); t.mock.timers.enable({ apis: ['setTimeout'] });
  env.status.set('company-a', result('company-a', { connected: false, disconnecting: true, disconnectRetryAfterMs: 60000 })); await render();
  await act(async () => tree.unmount()); tree = null;
  await act(async () => t.mock.timers.tick(60000)); await act(settle);
  assert.equal(env.calls.filter(call => call.name === 'Status').length, 1);
});

test('a stored revocation warning is displayed once after disconnect', async () => {
  reset(); await render();
  const warning = 'Disconnected locally; provider revocation could not be confirmed.';
  env.status.set('company-a', result('company-a', { connected: false, disconnecting: false, health: 'disconnected', disconnectWarning: warning }));
  await act(async () => button('Disconnect').props.onClick()); await act(settle);
  assert.equal(text().split(warning).length - 1, 1);
});

test('a failed initial status request remains visibly retryable without a connection record', async () => {
  reset(); const pending = deferred(); env.status.set('company-a', pending.promise); await render();
  await act(async () => pending.reject(new Error('Reconnect to check your company access.'))); await act(settle);
  assert.match(text(), /Reconnect to check your company access/); assert.ok(button('Refresh connection status'));
  env.status.set('company-a', result('company-a')); await act(async () => button('Refresh connection status').props.onClick()); await act(settle);
  assert.match(text(), /company-a QuickBooks/); assert.doesNotMatch(text(), /Reconnect to check your company access/);
});
