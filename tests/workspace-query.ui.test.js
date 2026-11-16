const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
global.window = new EventTarget(); global.document = { visibilityState: 'visible' }; global.IS_REACT_ACT_ENVIRONMENT = true;
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), queryLibrary = mobile('@tanstack/react-query'), { transformSync } = web('esbuild');
const { QueryClientProvider, focusManager, onlineManager } = queryLibrary;
let env, tree, client, cache, hooks, events, policy, seen;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until(predicate) { for (let count = 0; count < 150 && !predicate(); count++) await act(async () => pause(5)); assert.ok(predicate(), 'Asynchronous query condition was not reached.'); }
function load(relative) {
  const file = path.resolve(__dirname, '../routeLogisticsWeb/src', relative); if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const importer = name => {
    if (name === 'react') return React;
    if (name === '@tanstack/react-query') return queryLibrary;
    if (name.endsWith('/contexts/AuthContext')) return { useAuth: () => ({ currentUser: env.auth.currentUser, workspace: env.workspace, loading: false }) };
    if (name.endsWith('/services/firebase')) return { auth: env.auth };
    if (name.endsWith('/services/tenancy')) return { getClaims: () => env.claims, getWorkspace: () => env.workspace };
    if (name.startsWith('.')) { const next = path.resolve(path.dirname(file), name); return load(path.relative(path.resolve(__dirname, '../routeLogisticsWeb/src'), path.extname(next) ? next : next + '.js')); }
    throw Error('Unexpected query dependency ' + name);
  };
  new Function('require', 'module', 'exports', transformSync(fs.readFileSync(file, 'utf8'), { loader: 'js', format: 'cjs' }).code)(importer, module, module.exports);
  return module.exports;
}
function ReadControl({ resource = 'jobs', intervalMs = false }) {
  const query = hooks.useWorkspaceQuery([resource, 500], async () => { env.calls[resource] = (env.calls[resource] || 0) + 1; return env.loader(resource); }, { intervalMs });
  const [draft, setDraft] = React.useState(''); seen[resource] = query;
  React.useEffect(() => { env.mounts++; return () => { env.unmounts++; }; }, []);
  return React.createElement('input', { 'aria-label': resource + ' draft', value: draft, onChange: event => setDraft(event.target.value) });
}
async function render(resources = ['jobs'], intervalMs = false) {
  const contents = React.createElement(hooks.WorkspaceQueryBoundary, null, ...resources.map(resource => React.createElement(ReadControl, { key: resource, resource, intervalMs })));
  await act(async () => { if (tree) tree.update(React.createElement(QueryClientProvider, { client }, contents)); else tree = create(React.createElement(QueryClientProvider, { client }, contents)); });
}
beforeEach(() => {
  env = { auth: { app: { options: { projectId: 'demo-routelogistics' } }, currentUser: { uid: 'one', emailVerified: true } }, claims: { companyId: 'acme', role: 'owner' }, workspace: { status: 'company' }, calls: {}, mounts: 0, unmounts: 0, value: 'scheduled' };
  env.loader = async resource => ({ success: true, resource, value: env.value });
  cache = new Map(); seen = {}; hooks = load('hooks/useWorkspaceQuery.js'); events = load('services/workspaceQueryEvents.js'); policy = load('services/workspaceQueryPolicy.js');
  client = load('services/workspaceQueryClient.js').createWorkspaceQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, gcTime: Infinity } });
  tree = null; focusManager.setFocused(true); onlineManager.setOnline(true);
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); client.clear(); focusManager.setFocused(true); onlineManager.setOnline(true); });

test('background polling updates data controls without remounting or replacing an edited draft', async () => {
  await render(['jobs'], 20); await until(() => seen.jobs.data?.value === 'scheduled');
  await act(async () => tree.root.findByType('input').props.onChange({ target: { value: 'Keep this unsaved note' } }));
  env.value = 'completed'; await until(() => seen.jobs.data?.value === 'completed');
  assert.equal(tree.root.findByType('input').props.value, 'Keep this unsaved note'); assert.equal(env.mounts, 1); assert.equal(env.unmounts, 0);
});
test('hidden and offline screens stop requests; foreground and reconnect fetch the current result', async () => {
  await render(['jobs'], 20); await until(() => seen.jobs.data?.value === 'scheduled');
  focusManager.setFocused(false); await act(async () => pause(30)); const before = env.calls.jobs;
  env.value = 'completed'; await act(async () => pause(60)); assert.equal(env.calls.jobs, before);
  focusManager.setFocused(true); await until(() => seen.jobs.data?.value === 'completed');
  onlineManager.setOnline(false); await act(async () => pause(30)); const offline = env.calls.jobs;
  env.value = 'in-progress'; await act(async () => pause(50)); assert.equal(env.calls.jobs, offline);
  onlineManager.setOnline(true); await until(() => seen.jobs.data?.value === 'in-progress');
});
test('successful mutations invalidate only affected current-scope controls and never turn reads into loops', async () => {
  await render(['jobs', 'customers']); await until(() => seen.jobs.data && seen.customers.data);
  const scope = policy.workspaceScope(env.auth.currentUser, env.claims, env.workspace, 'demo-routelogistics').id;
  events.publishWorkspaceChange(scope, 'rlReadWorkspace', {}, {}); events.publishWorkspaceChange(scope, 'rlApplyJobOperation', {}, { status: 'conflict' });
  await act(async () => pause(20)); assert.equal(env.calls.jobs, 1); assert.equal(env.calls.customers, 1);
  env.value = 'completed'; await act(async () => events.publishWorkspaceChange(scope, 'rlManageJob', {}, {}));
  await until(() => seen.jobs.data?.value === 'completed' && seen.customers.data?.value === 'completed'); assert.equal(env.calls.jobs, 2); assert.equal(env.calls.customers, 2, 'Scheduling can promote a prospect and must refresh customer lifecycle controls.');
});
test('transient failures retain a last good snapshot but authorization denial hides it and stops polling', async () => {
  await render(); await until(() => seen.jobs.data);
  env.loader = async () => { throw Object.assign(new Error('Read failed'), { code: 'internal-test-error' }); };
  await act(async () => seen.jobs.refetch()); assert.equal(seen.jobs.data.value, 'scheduled');
  env.loader = async () => { throw Object.assign(new Error('Membership revoked'), { code: 'functions/permission-denied' }); };
  await act(async () => seen.jobs.refetch()); await until(() => seen.jobs.data === undefined);
  const denied = env.calls.jobs; window.dispatchEvent(new Event('focus')); await act(async () => pause(30)); assert.equal(env.calls.jobs, denied);
});
test('late responses from another account cannot populate the new account cache', async () => {
  let resolve; const pending = new Promise(done => { resolve = done; }); env.loader = () => pending;
  await render(); await until(() => env.calls.jobs === 1);
  env.auth.currentUser = { uid: 'another', emailVerified: true }; env.claims = { companyId: 'another-company', role: 'owner' };
  env.loader = async () => ({ success: true, value: 'NEW ACCOUNT DATA' }); await render(); await until(() => seen.jobs.data?.value === 'NEW ACCOUNT DATA');
  await act(async () => resolve({ success: true, value: 'OLD ACCOUNT PRIVATE DATA' })); await act(async () => pause(20));
  assert.equal(seen.jobs.data.value, 'NEW ACCOUNT DATA'); assert.equal(JSON.stringify(client.getQueryCache().getAll().map(query => query.state.data)).includes('OLD ACCOUNT'), false);
});
test('a failed cache subscriber cannot change a successful mutation into a failed save', () => {
  const unsubscribe = events.subscribeWorkspaceChanges(() => { throw Error('Subscriber failed'); });
  assert.doesNotThrow(() => events.publishWorkspaceChange('scope', 'rlManageJob', {}, {})); unsubscribe();
});
test('an older in-flight read cannot replace a locally committed save', async () => {
  await render(); await until(() => seen.jobs.data);
  let resolve; env.loader = () => new Promise(done => { resolve = done; });
  let pending;
  await act(async () => { pending = seen.jobs.refetch(); });
  await until(() => typeof resolve === 'function');
  await act(async () => seen.jobs.setData({ success: true, value: 'saved-completion' }));
  await act(async () => resolve({ success: true, value: 'old-scheduled-snapshot' }));
  await pending; await act(async () => pause(20));
  assert.equal(seen.jobs.data.value, 'saved-completion');
});
test('a committed mutation replaces a pre-write poll with a fresh scoped read', async () => {
  await render(); await until(() => seen.jobs.data);
  let resolve; env.loader = () => new Promise(done => { resolve = done; });
  let pending; await act(async () => { pending = seen.jobs.refetch(); }); await until(() => !!resolve);
  env.loader = async () => ({ success: true, value: 'completed-after-write' });
  const scope = policy.workspaceScope(env.auth.currentUser, env.claims, env.workspace, 'demo-routelogistics').id;
  await act(async () => events.publishWorkspaceChange(scope, 'rlApplyJobOperation', {}, { status: 'synced' }));
  await until(() => seen.jobs.data?.value === 'completed-after-write');
  await act(async () => resolve({ success: true, value: 'pre-write-scheduled' }));
  await pending; await act(async () => pause(20));
  assert.equal(seen.jobs.data.value, 'completed-after-write');
});
