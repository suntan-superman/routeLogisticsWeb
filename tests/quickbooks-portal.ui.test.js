const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json'));
const web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
const {createWorkspaceQueryMock,selectControlMock}=require('./support/workspaceQueryMock.cjs');
const workspaceHooks=createWorkspaceQueryMock(React,{scopeId:()=>[env.uid,env.company,env.role,env.membershipId].join(':')});
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, env;
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const result = (company, patch = {}) => ({ enabled: true, environment: 'sandbox', writesEnabled: false, productionApproved: false, connected: true, connectionId: `${company}-connection-1`, realmId: `${company}-realm`, companyName: `${company} QuickBooks`, health: 'connected', incomeAccountId: '12', defaultItemId: '34', mappings: [{ type: 'Customer', localId: `${company}-customer`, remoteId: '123', status: 'synced' }], operations: [], webhookEvents: [], ...patch });
const catalog = (company, patch = {}) => ({ accounts: [{ id: '12', name: `${company} Field income`, qualifiedName: `${company} Services:Field income`, accountType: 'Income', accountNumber: '4000' }, { id: '56', name: `${company} Other services`, qualifiedName: `${company} Services:Other income`, accountType: 'Other Income' }], items: [{ id: '34', name: `${company} General pest service`, qualifiedName: `${company} Services:General pest`, description: 'Routine property service' }, { id: '78', name: `${company} Inspection`, qualifiedName: `${company} Services:Inspection`, description: 'Property inspection visit' }], incomeAccountId: '12', defaultItemId: '34', connectionId: `${company}-connection-1`, ...patch });
function reset(role = 'owner') {
  env = { uid: 'owner-a', company: 'company-a', role, membershipId: null, calls: [], redirects: [], replacements: [], status: new Map(), options: new Map(), records: new Map(), confirmations: [], confirm: async () => true, connect: null, settings: null, toasts: [], unsaved: false, failStatusAfterSave: false, failNextStatus: false };
  global.window = { location: { pathname: '/integrations', search: '', hash: '', assign: value => env.redirects.push(value) }, history: { replaceState: (_a, _b, value) => { env.replacements.push(value); const parsed = new URL(value, 'https://route-logistics.com'); window.location.search = parsed.search; } } };
}
const claims = () => ({ companyId: env.company, membershipId: env.membershipId, role: env.role });
const firebase = { db: {}, functions: {}, auth: { get currentUser() { return { uid: env.uid }; } } };
const tenancy = { getClaims: claims, can: capability => capability === 'integrations.read' && ['owner', 'admin'].includes(env.role), scopeWhere: () => ({ field: 'companyId', value: env.company }) };
const mock = name => {
  if (name === 'react') return React;
    if(name.endsWith('/useWorkspaceQuery'))return workspaceHooks;
    if(name.endsWith('/SelectControl'))return{__esModule:true,default:selectControlMock(React)};
    if(name.endsWith('/workspaceQueryPolicy'))return{workspaceAccessError:error=>['permission-denied','unauthenticated','not-found','user-changed'].includes(String(error?.code||'').split('/').pop())};
  if (name === 'react-hot-toast') return { __esModule: true, default: { success: message => env.toasts.push({ type: 'success', message }), error: message => env.toasts.push({ type: 'error', message }) } };
  if (name.endsWith('/hooks/useUnsavedChanges')) return { useUnsavedChanges: dirty => { env.unsaved = dirty; return { confirmDiscard: async () => true }; } };
  if (name === 'firebase/functions') return { httpsCallable: (_functions, fullName) => async data => {
    const name = fullName.replace(/^rlQuickBooks/, ''), company = env.company;
    env.calls.push({ name, company, data });
    if (name === 'Status') { if (env.failNextStatus) { env.failNextStatus = false; throw new Error('Connection status unavailable'); } return { data: await (env.status.get(company) || result(company)) }; }
    if (name === 'Options') return { data: await (env.options.get(company) || catalog(company)) };
    if (name === 'Settings') {
      if (env.settings) await env.settings.promise;
      env.status.set(company, result(company, { incomeAccountId: data.incomeAccountId, defaultItemId: data.defaultItemId }));
      if (env.failStatusAfterSave) env.failNextStatus = true;
      return { data: { saved: true, ...data } };
    }
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
const combobox = label => tree.root.findAll(node => node.type === 'input' && node.props.role === 'combobox' && node.props['aria-label'] === label)[0];
const select = async (label, search) => { await act(async () => combobox(label).props.onChange({ target: { value: search } })); await act(async () => combobox(label).props.onKeyDown({ key: 'Enter', preventDefault() {} })); };
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

test('accounting defaults load named searchable options and preserve valid saved selections', async () => {
  reset(); const pending = deferred(); env.options.set('company-a', pending.promise); await render();
  assert.match(text(), /Loading accounts and service items/); assert.equal(combobox('Default income account').props.disabled, true);
  await act(async () => pending.resolve(catalog('company-a'))); await act(settle);
  assert.equal(combobox('Default income account').props.value, 'company-a Services:Field income');
  assert.equal(combobox('Default service item').props.value, 'company-a Services:General pest');
  assert.equal(button('Save defaults').props.disabled, true); assert.doesNotMatch(text(), /Income account ID|Default service item ID/);
  await act(async () => combobox('Default income account').props.onFocus());
  assert.match(text(), /Account 4000/); assert.equal(combobox('Default income account').props['aria-expanded'], true);
  await select('Default income account', 'Other');
  assert.equal(combobox('Default income account').props.value, 'company-a Services:Other income'); assert.equal(button('Save defaults').props.disabled, false);
});

test('dropdown keyboard selection saves internal IDs once with the connection version and confirms success', async () => {
  reset(); await render();
  await act(async () => combobox('Default income account').props.onFocus());
  await act(async () => combobox('Default income account').props.onKeyDown({ key: 'ArrowDown', preventDefault() {} }));
  await act(async () => combobox('Default income account').props.onKeyDown({ key: 'Enter', preventDefault() {} }));
  await select('Default service item', 'inspection'); env.settings = deferred();
  await act(async () => { button('Save defaults').props.onClick(); button('Save defaults').props.onClick(); });
  const calls = env.calls.filter(call => call.name === 'Settings'); assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].data, { incomeAccountId: '56', defaultItemId: '78', connectionId: 'company-a-connection-1' });
  assert.equal(button('Saving…').props.disabled, true);
  await act(async () => env.settings.resolve()); await act(settle);
  assert.match(text(), /Accounting defaults saved. No QuickBooks records were changed/); assert.equal(button('Save defaults').props.disabled, true);
  assert.deepEqual(env.toasts, [{ type: 'success', message: 'Accounting defaults saved.' }]); assert.equal(env.unsaved, false);
  assert.equal(env.calls.some(call => ['Sync', 'Adopt'].includes(call.name)), false);
});

test('incidental connection status refresh does not overwrite unsaved accounting selections', async () => {
  reset(); await render(); await select('Default income account', 'Other');
  await act(async () => button('Refresh connection status').props.onClick()); await act(settle);
  assert.equal(combobox('Default income account').props.value, 'company-a Services:Other income'); assert.equal(button('Save defaults').props.disabled, false);
  assert.equal(env.calls.filter(call => call.name === 'Options').length, 1);
});

test('saving invalidated defaults reports the server error and retains the owner selections for retry', async () => {
  reset(); await render(); await select('Default income account', 'Other'); env.settings = deferred();
  await act(async () => { button('Save defaults').props.onClick(); });
  await act(async () => env.settings.reject(new Error('Choose an active income account and service item.'))); await act(settle);
  assert.match(text(), /Choose an active income account and service item/); assert.equal(combobox('Default income account').props.value, 'company-a Services:Other income');
  assert.equal(button('Save defaults').props.disabled, false); env.settings = null;
  assert.equal(env.toasts[0].type, 'error'); assert.equal(env.unsaved, true);
  await act(async () => button('Save defaults').props.onClick()); await act(settle);
  assert.match(text(), /Accounting defaults saved/); assert.doesNotMatch(text(), /Choose an active income account and service item/);
});

test('unchanged and reverted accounting defaults disable Save and remove the unsaved guard', async () => {
  reset(); await render(); assert.equal(button('Save defaults').props.disabled,true); assert.equal(env.unsaved,false);
  await select('Default income account','Other'); assert.equal(button('Save defaults').props.disabled,false); assert.equal(env.unsaved,true);
  await select('Default income account','Field'); assert.equal(button('Save defaults').props.disabled,true); assert.equal(env.unsaved,false);
});

test('successful defaults save remains successful when the following status refresh fails', async () => {
  reset(); await render(); await select('Default income account','Other'); env.failStatusAfterSave=true;
  await act(async()=>button('Save defaults').props.onClick()); await act(settle);
  assert.match(text(),/Accounting defaults saved/); assert.match(text(),/Connection status unavailable/);
  assert.equal(button('Save defaults').props.disabled,true); assert.equal(env.unsaved,false);
  assert.deepEqual(env.toasts,[{type:'success',message:'Accounting defaults saved.'}]);
});

test('unavailable saved defaults are flagged without displaying raw provider IDs', async () => {
  reset(); env.options.set('company-a', catalog('company-a', { incomeAccountId: '9999999', defaultItemId: '8888888' })); await render();
  assert.match(text(), /saved income account is no longer available/); assert.match(text(), /saved service item is no longer available/);
  assert.equal(combobox('Default income account').props['aria-invalid'], true); assert.equal(combobox('Default service item').props['aria-invalid'], true);
  assert.doesNotMatch(text(), /9999999|8888888/); assert.equal(button('Save defaults').props.disabled, true);
  await select('Default income account', 'Field'); await select('Default service item', 'pest');
  assert.equal(button('Save defaults').props.disabled, false);
});

test('refreshing options retains a dirty valid selection and flags it if it becomes unavailable', async () => {
  reset(); await render(); await select('Default income account', 'Other');
  await act(async () => button('Refresh available options').props.onClick()); await act(settle);
  assert.equal(combobox('Default income account').props.value, 'company-a Services:Other income');
  env.options.set('company-a', catalog('company-a', { accounts: catalog('company-a').accounts.slice(0, 1) }));
  await act(async () => button('Refresh available options').props.onClick()); await act(settle);
  assert.match(text(), /saved income account is no longer available/); assert.equal(button('Save defaults').props.disabled, true);
});

test('empty accounting catalogs explain the QuickBooks-side action and do not create provider records', async () => {
  reset(); env.options.set('company-a', catalog('company-a', { accounts: [], items: [], incomeAccountId: '', defaultItemId: '' })); await render();
  assert.match(text(), /No active income accounts are available/); assert.match(text(), /No active service items are available/);
  assert.equal(combobox('Default income account').props.disabled, true); assert.equal(button('Save defaults').props.disabled, true);
  assert.equal(env.calls.some(call => ['Settings', 'Sync', 'Adopt'].includes(call.name)), false);
});

test('catalog API failures and expired authorization provide visible retry or reconnect actions', async () => {
  reset(); const pending = deferred(); env.options.set('company-a', pending.promise); await render();
  await act(async () => pending.reject(new Error('QuickBooks is temporarily unavailable. Retry shortly.'))); await act(settle);
  assert.match(text(), /temporarily unavailable/); assert.ok(button('Refresh available options')); assert.equal(button('Save defaults').props.disabled, true);
  env.options.set('company-a', catalog('company-a')); await act(async () => button('Refresh available options').props.onClick()); await act(settle);
  assert.doesNotMatch(text(), /temporarily unavailable/); assert.equal(combobox('Default income account').props.value, 'company-a Services:Field income');
  env.status.set('company-a', result('company-a', { reconnectRequired: true, health: 'reconnect-required' }));
  await act(async () => button('Refresh connection status').props.onClick()); await act(settle);
  assert.match(text(), /Reconnect QuickBooks before loading accounting options/); assert.ok(button('Reconnect')); assert.equal(button('Save defaults').props.disabled, true);
});

test('late accounting options cannot leak from the previously selected tenant', async () => {
  reset(); const pending = deferred(); env.options.set('company-a', pending.promise); await render();
  env.company = 'company-b'; env.uid = 'owner-b'; await update();
  assert.equal(combobox('Default income account').props.value, 'company-b Services:Field income');
  await act(async () => pending.resolve(catalog('company-a'))); await act(settle);
  assert.doesNotMatch(text(), /company-a/); assert.equal(combobox('Default service item').props.value, 'company-b Services:General pest');
});

test('a new connection version reloads catalogs and rejects late options from the old authorization', async () => {
  reset(); const previous = deferred(); env.options.set('company-a', previous.promise); await render();
  const connectionId = 'company-a-connection-2'; env.status.set('company-a', result('company-a', { connectionId }));
  env.options.set('company-a', catalog('company-a', { connectionId, accounts: [{ id: '90', name: 'Reconnected income', qualifiedName: 'Reconnected company:Income', accountType: 'Income' }], incomeAccountId: '90' }));
  await act(async () => button('Refresh connection status').props.onClick()); await act(settle);
  assert.equal(combobox('Default income account').props.value, 'Reconnected company:Income');
  await act(async () => previous.resolve(catalog('company-a'))); await act(settle);
  assert.equal(combobox('Default income account').props.value, 'Reconnected company:Income'); assert.equal(env.calls.filter(call => call.name === 'Options').length, 2);
});

test('non-owner accounting defaults are read-only names and never fetch provider options', async () => {
  reset('admin'); env.status.set('company-a', result('company-a', { incomeAccountName: 'Field service income', defaultItemName: 'Property inspection' })); await render();
  assert.match(text(), /Field service income/); assert.match(text(), /Property inspection/); assert.match(text(), /Only the company owner can change/);
  assert.equal(combobox('Default income account'), undefined); assert.equal(button('Save defaults'), undefined); assert.equal(env.calls.some(call => call.name === 'Options' || call.name === 'Settings'), false);
});
