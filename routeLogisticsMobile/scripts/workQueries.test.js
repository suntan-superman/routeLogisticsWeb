// Real TanStack Query observers with mocked native events and authorized data services.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
// TanStack's Node server mode disables polling; emulate a native client runtime.
global.window = { addEventListener() {}, removeEventListener() {} };
global.IS_REACT_ACT_ENVIRONMENT = true;
// Use the same AbortSignal implementation installed by this React Native version.
global.AbortController = require('abort-controller').AbortController;
global.AbortSignal = require('abort-controller').AbortSignal;
const React = require('react');
const { create, act } = require('react-test-renderer');
const { useQueryClient, focusManager, onlineManager } = require('@tanstack/react-query');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..'), modules = new Map();
const apps = new Set(), networks = new Set();
const appState = { currentState: 'active', addEventListener: (_event, listener) => { apps.add(listener); return { remove: () => apps.delete(listener) }; } };
let currentAuth, connected, jobsLoader, routeLoader, detailLoader, refreshLoader, jobRequests, routeRequests, detailRequests, authRefreshes;
let observedJobs, observedRoute, observedDetail, observedClient, observedScope, tree;
const cached = new Map();
function account(overrides = {}) {
  const user = { id: 'technician', companyId: 'acme', role: 'technician', membershipId: 'member', emailVerified: true, workspace: { status: 'company' }, ...overrides };
  currentAuth = { user, permissions: { canAccess: user.emailVerified && user.workspace?.status === 'company' }, isLoading: false, sessionError: '', refreshUser: async () => { authRefreshes++; return refreshLoader(); } };
}
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} }; modules.set(filename, module);
  const localRequire = createRequire(filename);
  const mockRequire = specifier => {
    if (specifier === 'react-native') return { AppState: appState };
    if (specifier === '@react-native-community/netinfo') return { addEventListener: listener => { networks.add(listener); listener({ isConnected: connected, isInternetReachable: connected }); return () => networks.delete(listener); } };
    if (specifier.endsWith('/AuthContext')) return { useAuth: () => currentAuth };
    if (specifier === './firebase') return { JobService: { getJobsByDateRange: async (startDate, endDate) => { jobRequests.push({ startDate, endDate }); return jobsLoader(startDate, endDate); } } };
    if (specifier === './workspaceApi') return { callWorkspace: async (name, data) => { routeRequests.push({ name, ...data }); return routeLoader(data); }, readWorkspace: async (resource, data) => { detailRequests.push({ resource, ...data }); return detailLoader(data); } };
    if (specifier === './offline') return { cachedRead: async (name, loader) => {
      if (!connected) { if (!cached.has(name)) throw new Error('Open this view online once to save it for offline use.'); return cached.get(name); }
      const data = await loader(); cached.set(name, data); return data;
    }, readCache: async name => cached.get(name), overlayJobs: async jobs => jobs };
    if (specifier.startsWith('.')) { const resolved = path.resolve(path.dirname(filename), specifier); return load(resolved.endsWith('.js') ? resolved : resolved + '.js'); }
    return localRequire(specifier);
  };
  const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] });
  new Function('require', 'module', 'exports', result.code)(mockRequire, module, module.exports);
  return module.exports;
}
const Provider = load('contexts/WorkQueryProvider.js').default;
const { useWorkJobs, useMyDailyRoute, useWorkJob } = load('services/useWorkQueries.js');
const { useWorkQueryScope } = load('contexts/WorkQueryProvider.js');
function Probe({ period = 'day', route = true, detail = null, enabled = true }) {
  observedJobs = useWorkJobs(period, { enabled });
  observedClient = useQueryClient(); observedScope = useWorkQueryScope();
  return React.createElement(React.Fragment, null, route ? React.createElement(RouteProbe, { enabled }) : null, detail !== null ? React.createElement(DetailProbe, { id: detail || null, enabled }) : null);
}
function RouteProbe({ enabled }) { observedRoute = useMyDailyRoute({ enabled }); return null; }
function DetailProbe({ id, enabled }) { observedDetail = useWorkJob(id, { enabled }); return null; }
function SharedJobsProbe({ enabled = true }) {
  observedJobs = useWorkJobs('day', { enabled });
  // Home, retained Schedule and the route's day list share one cache entry.
  useWorkJobs('day', { enabled: false });
  useWorkJobs('day', { enabled: false });
  observedClient = useQueryClient(); observedScope = useWorkQueryScope();
  return null;
}
const element = props => React.createElement(Provider, null, React.createElement(props?.shared ? SharedJobsProbe : Probe, props));
async function settle(t) {
  for (let turn = 0; turn < 4; turn++) await act(async () => { await Promise.resolve(); t.mock.timers.tick(0); await Promise.resolve(); });
}
async function mount(t, props) { await act(async () => { tree = create(element(props)); }); await settle(t); }
async function update(t, props) { await act(async () => tree.update(element(props))); await settle(t); }
async function tick(t, ms) { await act(async () => { t.mock.timers.tick(ms); }); await settle(t); }
async function foreground(t, state) { await act(async () => { appState.currentState = state; apps.forEach(listener => listener(state)); }); await settle(t); }
async function network(t, online) { await act(async () => { connected = online; networks.forEach(listener => listener({ isConnected: online, isInternetReachable: online })); }); await settle(t); }
beforeEach(t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: new Date(2026, 10, 13, 12).getTime() });
  appState.currentState = 'active'; connected = true; authRefreshes = 0; jobRequests = []; routeRequests = []; detailRequests = []; cached.clear();
  jobsLoader = async () => ({ success: true, jobs: [{ id: 'job', customerName: 'Assigned customer' }] });
  routeLoader = async () => ({ stops: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], saved: { jobIds: ['b', 'a'] } });
  detailLoader = async ({ id }) => ({ job: { id, companyId: 'acme', assignedTo: 'member', status: 'scheduled' }, customer: { name: 'Assigned customer' } });
  refreshLoader = async () => ({ success: true, user: currentAuth.user, accessStatus: 'ready', authoritative: true });
  observedJobs = observedRoute = observedDetail = observedClient = observedScope = tree = null;
  focusManager.setFocused(true); onlineManager.setOnline(true); account();
});
afterEach(async t => {
  if (tree) await act(async () => tree.unmount());
  assert.equal(apps.size, 0); assert.equal(networks.size, 0);
  t.mock.timers.reset();
});

test('work polls every thirty seconds only while the app is foregrounded and online', async t => {
  await mount(t);
  assert.equal(jobRequests.length, 1); assert.equal(routeRequests.length, 1);
  await tick(t, 29_999); assert.equal(jobRequests.length, 1);
  await tick(t, 1); assert.equal(jobRequests.length, 2); assert.equal(routeRequests.length, 2);
  await foreground(t, 'background'); const backgroundCount = jobRequests.length;
  await tick(t, 90_000); assert.equal(jobRequests.length, backgroundCount);
  await foreground(t, 'active'); assert.ok(jobRequests.length > backgroundCount);
  await network(t, false); const offlineCount = jobRequests.length;
  await tick(t, 90_000); assert.equal(jobRequests.length, offlineCount);
  await network(t, true); assert.ok(jobRequests.length > offlineCount);
  const finalCount = jobRequests.length;
  await act(async () => tree.unmount()); tree = null;
  await tick(t, 90_000); assert.equal(jobRequests.length, finalCount);
});

test('scope changes clear the previous cache and ignore late responses from the previous account', async t => {
  let resolveOld;
  jobsLoader = () => new Promise(resolve => { resolveOld = resolve; });
  await mount(t, { route: false }); const oldClient = observedClient;
  account({ id: 'another', membershipId: 'another-member' });
  jobsLoader = async () => ({ success: true, jobs: [{ id: 'another-job' }] });
  await update(t, { route: false });
  assert.notEqual(observedClient, oldClient); assert.equal(oldClient.getQueryCache().getAll().length, 0);
  await act(async () => resolveOld({ success: true, jobs: [{ id: 'private-old-job' }] })); await settle(t);
  assert.deepEqual(observedJobs.jobs.map(job => job.id), ['another-job']);
  assert.equal(oldClient.getQueryCache().getAll().length, 0);
  const managerClient = observedClient;
  account({ id: 'another', membershipId: 'another-member', role: 'manager' }); await update(t, { route: false });
  assert.notEqual(observedClient, managerClient); assert.equal(managerClient.getQueryCache().getAll().length, 0);
  for (const change of [{ companyId: 'another-company' }, { membershipId: 'replacement-membership' }]) {
    const previous = observedClient;
    account({ ...currentAuth.user, ...change }); await update(t, { route: false });
    assert.notEqual(observedClient, previous); assert.equal(previous.getQueryCache().getAll().length, 0);
  }
  const signedInClient = observedClient;
  currentAuth = { ...currentAuth, user: null, permissions: { canAccess: false } }; await update(t, { route: false });
  assert.deepEqual(observedJobs.jobs, []); assert.equal(signedInClient.getQueryCache().getAll().length, 0);
});

test('repeated resource denial validates company once without claiming membership revocation', async t => {
  await mount(t);
  assert.equal(observedJobs.jobs.length, 1); assert.equal(observedRoute.stops.length, 3);
  jobsLoader = async () => ({ success: false, error: { message: 'No current membership.', code: 'functions/permission-denied' } });
  await act(async () => observedJobs.refreshWork()); await settle(t);
  assert.equal(observedJobs.jobs.length, 0);
  assert.equal(observedRoute.stops.length, 3);
  assert.equal(observedJobs.canAccess, true); assert.equal(observedJobs.accessStatus, 'ready');
  assert.equal(observedJobs.resourceDenied, true);
  assert.equal(authRefreshes, 1);
  const requestsAfterDenial = jobRequests.length;
  await tick(t, 60_000); assert.equal(jobRequests.length, requestsAfterDenial);
  jobsLoader = async () => ({ success: true, jobs: [{ id: 'recovered' }] });
  currentAuth = { ...currentAuth, user: { ...currentAuth.user } }; await update(t);
  assert.deepEqual(observedJobs.jobs.map(job => job.id), ['recovered']);
  assert.equal(observedRoute.stops.length, 3);
  jobsLoader = async () => ({ success: false, error: { message: 'Still not authorized.', code: 'functions/permission-denied' } });
  await act(async () => observedJobs.refreshWork()); await settle(t);
  assert.deepEqual(observedJobs.jobs, []); assert.equal(observedRoute.stops.length, 3);
  assert.equal(authRefreshes, 2, 'a later independent denial gets one fresh validation after an intervening authorized read');
  const afterSecond = jobRequests.length;
  await tick(t, 60_000); assert.equal(jobRequests.length, afterSecond); assert.equal(authRefreshes, 2);
});

test('saved route order is preserved and work invalidation refetches both jobs and own route', async t => {
  await mount(t);
  assert.deepEqual(observedRoute.stops.map(stop => stop.id), ['b', 'a', 'c']);
  assert.equal(routeRequests[0].memberId, 'member');
  await act(async () => observedJobs.refreshWork()); await settle(t);
  assert.equal(jobRequests.length, 2); assert.equal(routeRequests.length, 2);
});

test('period changes use distinct date ranges and cannot reuse another period data', async t => {
  jobsLoader = async (startDate, endDate) => ({ success: true, jobs: [{ id: `${startDate}:${endDate}` }] });
  await mount(t, { route: false });
  assert.equal(observedJobs.jobs[0].id, '2026-11-13:2026-11-13');
  await update(t, { period: 'week', route: false });
  assert.equal(observedJobs.jobs[0].id, '2026-11-08:2026-11-14');
  await update(t, { period: 'month', route: false });
  assert.equal(observedJobs.jobs[0].id, '2026-11-01:2026-11-30');
});

test('foreground date rollover refreshes jobs and own route under the new local date', async t => {
  t.mock.timers.setTime(new Date(2026, 10, 13, 23, 59, 30).getTime());
  await mount(t);
  await foreground(t, 'background');
  await tick(t, 60_000);
  await foreground(t, 'active');
  assert.equal(observedScope.day, '2026-11-14');
  assert.equal(jobRequests.at(-1).startDate, '2026-11-14');
  assert.equal(jobRequests.at(-1).endDate, '2026-11-14');
  assert.equal(routeRequests.at(-1).date, '2026-11-14');
});

test('pending and unverified workspaces never fetch company work', async t => {
  account({ workspace: { status: 'pending' } }); await mount(t);
  assert.equal(jobRequests.length, 0); assert.equal(routeRequests.length, 0);
  assert.deepEqual(observedJobs.jobs, []); assert.deepEqual(observedRoute.stops, []);
  account({ emailVerified: false }); await update(t);
  assert.equal(jobRequests.length, 0); assert.equal(routeRequests.length, 0);
});

test('an initial offline view can load its scoped saved route without polling or route calls', async t => {
  connected = false; onlineManager.setOnline(false);
  cached.set('route:2026-11-13:member', { stops: [{ id: 'saved-stop' }], saved: null });
  await mount(t);
  assert.deepEqual(observedRoute.stops.map(stop => stop.id), ['saved-stop']);
  assert.equal(routeRequests.length, 0);
  const reads = jobRequests.length;
  await tick(t, 90_000); assert.equal(routeRequests.length, 0); assert.equal(jobRequests.length, reads);
});

test('native picker interactions suspend polling and foreground refetch until the final owner releases', async t => {
  await mount(t);
  const { beginNativeInteraction, isNativeInteractionActive } = load('services/nativeInteraction.js');
  let first, second;
  await act(async () => { first = beginNativeInteraction(); second = beginNativeInteraction(); }); await settle(t);
  const before = jobRequests.length, routeBefore = routeRequests.length;
  await foreground(t, 'inactive'); await foreground(t, 'active'); await tick(t, 60_000);
  assert.equal(jobRequests.length, before); assert.equal(routeRequests.length, routeBefore);
  await act(async () => { first(); first(); }); await settle(t);
  assert.equal(isNativeInteractionActive(), true);
  await tick(t, 30_000); assert.equal(jobRequests.length, before);
  await act(async () => second()); await settle(t);
  assert.equal(isNativeInteractionActive(), false);
  assert.ok(jobRequests.length > before); assert.ok(routeRequests.length > routeBefore);
});

test('completed detail remains accessible when it disappears from the active schedule', async t => {
  await mount(t, { detail: 'job' });
  jobsLoader = async () => ({ success: true, jobs: [] });
  detailLoader = async () => ({ job: { id: 'job', companyId: 'acme', assignedTo: 'member', status: 'completed' }, customer: null });
  await act(async () => observedJobs.refreshWork()); await settle(t);
  assert.deepEqual(observedJobs.jobs, []); assert.equal(observedDetail.job.status, 'completed');
  assert.equal(observedDetail.dataChecked, true); assert.equal(observedDetail.canAccess, true); assert.equal(authRefreshes, 0);
});

test('reassignment is a job-level error after company membership validates as active', async t => {
  await mount(t, { detail: 'job' });
  jobsLoader = async () => ({ success: true, jobs: [] });
  detailLoader = async () => { throw Object.assign(new Error('This job is not assigned to your workspace.'), { code: 'functions/permission-denied' }); };
  await act(async () => observedJobs.refreshWork()); await settle(t);
  assert.equal(observedDetail.job, null); assert.equal(observedDetail.resourceDenied, true);
  assert.match(observedDetail.error.message, /not assigned/); assert.equal(observedDetail.accessStatus, 'ready');
  assert.equal(observedDetail.canAccess, true); assert.equal(authRefreshes, 1);
  const details = detailRequests.length; await tick(t, 60_000);
  assert.equal(detailRequests.length, details); assert.equal(authRefreshes, 1);
});

test('a missing job never triggers a company revocation check or repeats automatically', async t => {
  detailLoader = async () => { throw Object.assign(new Error('Job not found.'), { code: 'functions/not-found' }); };
  await mount(t, { detail: 'missing' });
  assert.equal(observedDetail.resourceDenied, true); assert.equal(observedDetail.canAccess, true);
  assert.equal(observedDetail.accessStatus, 'ready'); assert.equal(authRefreshes, 0);
  const count = detailRequests.length; await tick(t, 60_000); assert.equal(detailRequests.length, count);
});

test('stale claims get one authoritative refresh without changing company permission or remounting the client', async t => {
  await mount(t); const client = observedClient;
  let finish;
  jobsLoader = async () => ({ success: false, error: 'Current claims required.', code: 'functions/permission-denied' });
  refreshLoader = () => new Promise(resolve => { finish = resolve; });
  await act(async () => observedJobs.refreshWork()); await settle(t);
  assert.equal(observedJobs.accessStatus, 'checking'); assert.equal(observedJobs.canAccess, true);
  assert.equal(observedJobs.canReadWork, false); assert.equal(observedClient, client); assert.equal(authRefreshes, 1);
  jobsLoader = async () => ({ success: true, jobs: [{ id: 'fresh-token-job' }] });
  await act(async () => finish({ success: true, user: currentAuth.user, authoritative: true, accessStatus: 'ready' })); await settle(t);
  assert.deepEqual(observedJobs.jobs.map(job => job.id), ['fresh-token-job']);
  assert.equal(observedJobs.accessStatus, 'ready'); assert.equal(observedJobs.canAccess, true); assert.equal(observedClient, client);
});

test('concurrent permission failures share one validation and persistent errors have no authorization retry loop', async t => {
  await mount(t); let finish;
  jobsLoader = async () => ({ success: false, error: 'Company access required.', code: 'functions/permission-denied' });
  routeLoader = async () => { throw Object.assign(new Error('Company access required.'), { code: 'functions/permission-denied' }); };
  refreshLoader = () => new Promise(resolve => { finish = resolve; });
  await act(async () => observedJobs.refreshWork()); await settle(t);
  assert.equal(authRefreshes, 1);
  await act(async () => finish({ success: true, user: currentAuth.user, authoritative: true, accessStatus: 'ready' })); await settle(t);
  const count = jobRequests.length + routeRequests.length;
  await tick(t, 90_000); assert.equal(jobRequests.length + routeRequests.length, count); assert.equal(authRefreshes, 1);
  assert.equal(observedJobs.canAccess, true); assert.equal(observedJobs.accessStatus, 'ready');
});

test('only authoritative loss of membership produces revoked access and clears the old scoped client', async t => {
  await mount(t, { detail: 'job' }); const previous = observedClient;
  jobsLoader = async () => ({ success: false, error: 'Active membership required.', code: 'functions/permission-denied' });
  refreshLoader = async () => {
    const user = { ...currentAuth.user, companyId: null, role: null, membershipId: null, workspace: { status: 'unavailable' } };
    currentAuth = { ...currentAuth, user, permissions: { canAccess: false }, accessStatus: 'revoked' };
    return { success: true, user, accessStatus: 'revoked', authoritative: true };
  };
  await act(async () => observedJobs.refreshWork()); await settle(t); await update(t, { detail: 'job' });
  assert.equal(observedJobs.accessStatus, 'revoked'); assert.equal(observedJobs.canAccess, false);
  assert.deepEqual(observedJobs.jobs, []); assert.equal(observedDetail.job, null);
  assert.notEqual(observedClient, previous); assert.equal(previous.getQueryCache().getAll().length, 0);
});

test('a failed membership check is unavailable rather than revoked and preserves the mounted scope', async t => {
  await mount(t); const previous = observedClient;
  jobsLoader = async () => ({ success: false, error: 'Check current claims.', code: 'functions/permission-denied' });
  refreshLoader = async () => { throw Object.assign(new Error('Network unavailable. Retry when connected.'), { code: 'functions/unavailable' }); };
  await act(async () => observedJobs.refreshWork()); await settle(t);
  assert.equal(observedJobs.accessStatus, 'unavailable'); assert.equal(observedJobs.canAccess, true);
  assert.equal(observedJobs.canReadWork, false); assert.equal(observedClient, previous);
  assert.match(observedJobs.accessError, /Network unavailable/);
});

test('retained hidden screens do not fetch or poll until enabled', async t => {
  await mount(t, { enabled: false }); await tick(t, 90_000);
  assert.equal(jobRequests.length, 0); assert.equal(routeRequests.length, 0);
  await update(t, { enabled: true }); assert.equal(jobRequests.length, 1); assert.equal(routeRequests.length, 1);
  await update(t, { enabled: false }); const count = jobRequests.length + routeRequests.length;
  await tick(t, 90_000); assert.equal(jobRequests.length + routeRequests.length, count);
});

test('workspace refresh never starts a retained detail query without a selected job', async t => {
  await mount(t, { detail: '' });
  assert.equal(detailRequests.length, 0);
  await act(async () => observedScope.refreshAccess()); await settle(t);
  assert.equal(detailRequests.length, 0);
});

test('offline details restore their role-scoped job base without making a server request', async t => {
  connected = false; onlineManager.setOnline(false);
  cached.set('job-bases', { saved: { id: 'saved', status: 'in-progress', assignedTo: 'member' } });
  await mount(t, { detail: 'saved', route: false });
  assert.equal(observedDetail.job.id, 'saved'); assert.equal(observedDetail.dataChecked, false);
  assert.equal(detailRequests.length, 0); assert.equal(authRefreshes, 0);
});

test('a business failed-precondition remains visible without claiming workspace revocation', async t => {
  detailLoader = async () => { throw Object.assign(new Error('This job is already completed.'), { code: 'functions/failed-precondition' }); };
  await mount(t, { detail: 'completed' });
  assert.match(observedDetail.error.message, /already completed/); assert.equal(observedDetail.canAccess, true);
  assert.equal(observedDetail.accessStatus, 'ready'); assert.equal(authRefreshes, 0);
});

test('a visible day observer recovers once from stale claims even when later retained observers of its key are disabled', async t => {
  await mount(t, { shared: true }); const client = observedClient;
  jobsLoader = async () => ({ success: false, error: 'Current claims required.', code: 'functions/permission-denied' });
  refreshLoader = async () => {
    jobsLoader = async () => ({ success: true, jobs: [{ id: 'current-token-job' }] });
    return { success: true, user: currentAuth.user, accessStatus: 'ready', authoritative: true };
  };
  await act(async () => observedJobs.refreshWork()); await settle(t);
  assert.deepEqual(observedJobs.jobs.map(job => job.id), ['current-token-job']);
  assert.equal(authRefreshes, 1); assert.equal(observedClient, client); assert.equal(observedJobs.canAccess, true);
  assert.equal(jobRequests.length, 3); // initial read, denial, one verified retry
  await update(t, { shared: true, enabled: false }); const before = jobRequests.length;
  await act(async () => observedScope.refreshAccess()); await settle(t); await tick(t, 90_000);
  assert.equal(jobRequests.length, before); // no visible observer remains
});
