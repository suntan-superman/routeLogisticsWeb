const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const Module = require('node:module'), { createRequire } = Module;
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json'));
const web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
// The real router and test renderer must use one React dispatcher in this workspace.
const originalLoad = Module._load;
let routing;
try { Module._load = function (name, ...args) { return name === 'react' ? React : originalLoad.call(this, name, ...args); }; routing = web('react-router-dom'); }
finally { Module._load = originalLoad; }
const { createMemoryRouter, RouterProvider, Outlet, Link } = routing;
global.IS_REACT_ACT_ENVIRONMENT = true;
const sourceRoot = path.resolve(__dirname, '../routeLogisticsWeb/src'), modules = new Map();
function load(relative) {
  const file = path.resolve(sourceRoot, relative);
  if (modules.has(file)) return modules.get(file).exports;
  const result = { exports: {} }; modules.set(file, result);
  const mock = name => {
    if (name === 'react') return React;
    if (name === 'react-router-dom') return routing;
    if (name === '@heroicons/react/24/outline') return { ExclamationTriangleIcon: () => null, InformationCircleIcon: () => null };
    let target = path.resolve(path.dirname(file), name);
    if (!path.extname(target)) target += fs.existsSync(target + '.jsx') ? '.jsx' : '.js';
    return load(path.relative(sourceRoot, target));
  };
  new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs' }).code)(React, mock, result, result.exports);
  return result.exports;
}
const { ConfirmProvider, useConfirm } = load('components/ConfirmProvider.jsx');
const { UnsavedChangesProvider } = load('components/UnsavedChangesProvider.jsx');
const { useUnsavedChanges, useConfirmUnsavedChanges } = load('hooks/useUnsavedChanges.js');
const settle = () => new Promise(resolve => setImmediate(resolve));
let tree, router, env;
class BrowserEvents extends EventTarget {
  listeners = new Map();
  addEventListener(name, callback, ...args) { const set = this.listeners.get(name) || new Set(); set.add(callback); this.listeners.set(name, set); return super.addEventListener(name, callback, ...args); }
  removeEventListener(name, callback, ...args) { this.listeners.get(name)?.delete(callback); return super.removeEventListener(name, callback, ...args); }
  count(name) { return this.listeners.get(name)?.size || 0; }
}
function Form({ name }) {
  const [dirty, setDirty] = React.useState(env.initialDirty);
  const helpers = useUnsavedChanges(dirty, { scope: env.scopes[name], message: `Discard unsaved ${name} changes?` });
  env.forms[name] = { setDirty, helpers };
  return React.createElement('p', null, `${name}: ${dirty ? 'unsaved' : 'saved'}`);
}
function EditPage() {
  const [forms, setForms] = React.useState(env.initialForms); env.setForms = setForms;
  return React.createElement(React.Fragment, null, ...forms.map(name => React.createElement(Form, { key: name, name })), React.createElement(Link, { to: '/done' }, 'Sidebar destination'));
}
function GuardedRoutes() {
  env.confirmDiscard = useConfirmUnsavedChanges();
  env.confirmRaw = useConfirm();
  return React.createElement(Outlet);
}
async function render({ dirty = false, forms = ['accounting'], scopes = {}, entries = ['/edit'], index } = {}) {
  global.window = new BrowserEvents(); env = { initialDirty: dirty, initialForms: forms, forms: {}, scopes };
  router = createMemoryRouter([{ element: React.createElement(UnsavedChangesProvider, null, React.createElement(GuardedRoutes)), children: [
    { path: '/edit', element: React.createElement(EditPage) }, { path: '/done', element: React.createElement('p', null, 'Done') }, { path: '/other', element: React.createElement('p', null, 'Other') }, { path: '/before', element: React.createElement('p', null, 'Before') },
  ] }], { initialEntries: entries, ...(index === undefined ? {} : { initialIndex: index }) });
  await act(async () => { tree = create(React.createElement(ConfirmProvider, null, React.createElement(RouterProvider, { router, future: { v7_startTransition: true } }))); });
  await act(settle);
}
const dialog = () => tree.root.findAll(node => node.props.role === 'dialog');
const button = label => tree.root.findAll(node => node.type === 'button' && node.children.join('') === label)[0];
const navigate = async target => { await act(async () => { await router.navigate(target); }); await act(settle); };
const choose = async leave => { await act(async () => button(leave ? 'Leave without saving' : 'Keep editing').props.onClick()); await act(settle); };
afterEach(async () => { if (tree) await act(async () => tree.unmount()); router?.dispose(); tree = null; router = null; delete global.window; });

test('unchanged forms navigate without confirmation or unload protection', async () => {
  await render(); assert.equal(window.count('beforeunload'), 0);
  await navigate('/done'); assert.equal(router.state.location.pathname, '/done'); assert.equal(dialog().length, 0);
});

test('sidebar navigation offers keep-editing and preserves the dirty page', async () => {
  await render({ dirty: true });
  const link = tree.root.findAll(node => node.type === 'a')[0];
  await act(async () => link.props.onClick({ button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } })); await act(settle);
  assert.equal(router.state.location.pathname, '/edit'); assert.equal(dialog().length, 1);
  await choose(false); assert.equal(router.state.location.pathname, '/edit'); assert.equal(dialog().length, 0); assert.equal(window.count('beforeunload'), 1);
});

test('confirmed programmatic navigation leaves once and unregisters discarded forms', async () => {
  await render({ dirty: true }); await navigate('/done'); assert.equal(dialog().length, 1);
  await choose(true); assert.equal(router.state.location.pathname, '/done'); assert.equal(dialog().length, 0); assert.equal(window.count('beforeunload'), 0);
});

test('actual browser-history back and forward transitions remain blocked until approved', async () => {
  await render({ dirty: true, entries: ['/before', '/edit', '/done'], index: 1 });
  await navigate(1); assert.equal(router.state.location.pathname, '/edit'); assert.equal(dialog().length, 1); await choose(false);
  await navigate(-1); assert.equal(router.state.location.pathname, '/edit'); assert.equal(dialog().length, 1); await choose(true);
  assert.equal(router.state.location.pathname, '/before'); await navigate(1); assert.equal(router.state.location.pathname, '/edit');
});

test('reverting or successfully saving clears the guard before navigation', async () => {
  await render(); await act(async () => env.forms.accounting.setDirty(true)); assert.equal(window.count('beforeunload'), 1);
  await act(async () => env.forms.accounting.setDirty(false)); assert.equal(window.count('beforeunload'), 0);
  await navigate('/done'); assert.equal(router.state.location.pathname, '/done'); assert.equal(dialog().length, 0);
});

test('multiple dirty forms share one blocker and retain protection until all are clean', async () => {
  await render({ dirty: true, forms: ['accounting', 'company'] }); assert.equal(window.count('beforeunload'), 1);
  await act(async () => env.forms.accounting.setDirty(false)); await navigate('/done'); assert.equal(router.state.blockers.size, 1); assert.equal(dialog().length, 1); await choose(false);
  await act(async () => env.forms.company.setDirty(false)); await navigate('/done'); assert.equal(router.state.location.pathname, '/done'); assert.equal(dialog().length, 0);
});

test('unmounting the last dirty form removes its native and SPA protection', async () => {
  await render({ dirty: true }); await act(async () => env.setForms([])); assert.equal(window.count('beforeunload'), 0);
  await navigate('/done'); assert.equal(router.state.location.pathname, '/done'); assert.equal(dialog().length, 0);
});

test('reload and tab-close warn only while unsaved registrations remain', async () => {
  await render(); const clean = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(clean); assert.equal(clean.defaultPrevented, false);
  await act(async () => env.forms.accounting.setDirty(true)); const dirty = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(dirty); assert.equal(dirty.defaultPrevented, true);
  await act(async () => env.forms.accounting.setDirty(false)); const saved = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(saved); assert.equal(saved.defaultPrevented, false);
});

test('same-page hash navigation keeps form state without an unnecessary warning', async () => {
  await render({ dirty: true }); await navigate('/edit#accounting'); assert.equal(router.state.location.hash, '#accounting'); assert.equal(dialog().length, 0); assert.equal(window.count('beforeunload'), 1);
});

test('competing destinations share one confirmation and only the latest transition proceeds', async () => {
  await render({ dirty: true }); await navigate('/done'); await navigate('/other'); assert.equal(dialog().length, 1);
  await choose(true); assert.equal(router.state.location.pathname, '/other'); assert.equal(dialog().length, 0);
});

test('global discard confirmation is stable and leaves draft ownership with its form', async () => {
  await render({ dirty: true }); const helper = env.confirmDiscard; assert.equal(env.forms.accounting.helpers.confirmDiscard, helper);
  let pending; await act(async () => { pending = env.confirmDiscard(); }); assert.equal(dialog().length, 1); await choose(false); assert.equal(await pending, false);
  await act(async () => { pending = env.confirmDiscard(); }); await choose(true); assert.equal(await pending, true); assert.equal(window.count('beforeunload'), 1);
  await act(async () => env.forms.accounting.setDirty(false)); assert.equal(env.confirmDiscard, helper); assert.equal(await env.confirmDiscard(), true);
});

test('a successful save dismisses a pending warning and completes its blocked navigation', async () => {
  await render({ dirty: true }); await navigate('/done'); assert.equal(dialog().length, 1);
  await act(async () => env.forms.accounting.setDirty(false)); await act(settle);
  assert.equal(router.state.location.pathname, '/done'); assert.equal(dialog().length, 0); assert.equal(window.count('beforeunload'), 0);
});

test('removing the last unsaved form dismisses its warning without retaining stale page state', async () => {
  await render({ dirty: true }); await navigate('/done'); await act(async () => env.setForms([])); await act(settle);
  assert.equal(router.state.location.pathname, '/done'); assert.equal(dialog().length, 0);
});

test('a newer confirmation settles the superseded action instead of leaving it pending', async () => {
  await render(); let original, next;
  await act(async () => { original = env.confirmRaw({ title: 'Original action' }); next = env.confirmRaw({ title: 'New action' }); });
  assert.equal(await original, false); assert.equal(dialog().length, 1); assert.match(JSON.stringify(tree.toJSON()), /New action/);
  await act(async () => button('Confirm').props.onClick()); assert.equal(await next, true); assert.equal(dialog().length, 0);
});

test('aborting an obsolete confirmation cannot dismiss a newer request', async () => {
  await render(); const old = new AbortController(), latest = new AbortController(); let original, next;
  await act(async () => { original = env.confirmRaw({ title: 'Old request', signal: old.signal }); next = env.confirmRaw({ title: 'Latest request', signal: latest.signal }); });
  assert.equal(await original, false); await act(async () => old.abort()); assert.equal(dialog().length, 1);
  await act(async () => latest.abort()); assert.equal(await next, false); assert.equal(dialog().length, 0);
});

test('confirmation provider unmount settles its pending action and removes key listeners', async () => {
  await render(); let pending; await act(async () => { pending = env.confirmRaw({ title: 'Pending action' }); });
  assert.equal(window.count('keydown'), 1); await act(async () => tree.unmount()); tree = null;
  assert.equal(await pending, false); assert.equal(window.count('keydown'), 0); assert.equal(window.count('beforeunload'), 0);
});

test('an already-aborted confirmation does not replace a current request', async () => {
  await render(); const cancelled = new AbortController(); cancelled.abort(); let original, ignored;
  await act(async () => { original = env.confirmRaw({ title: 'Current action' }); ignored = env.confirmRaw({ title: 'Cancelled action', signal: cancelled.signal }); });
  assert.equal(await ignored, false); assert.equal(dialog().length, 1); assert.match(JSON.stringify(tree.toJSON()), /Current action/);
  await act(async () => button('Cancel').props.onClick()); assert.equal(await original, false);
});

test('local scopes exclude sibling forms while page navigation still protects every dirty form', async () => {
  await render({ dirty: true, forms: ['job', 'route'], scopes: { job:'job:1', route:'route-planner' } });
  await act(async () => env.forms.job.setDirty(false));
  assert.equal(await env.forms.job.helpers.confirmDiscard(), true); assert.equal(dialog().length,0); assert.equal(window.count('beforeunload'),1);
  await navigate('/done'); assert.equal(dialog().length,1); assert.match(JSON.stringify(tree.toJSON()),/unsaved route changes/);
  assert.equal(button('Keep editing').props.autoFocus,true); assert.equal(button('Leave without saving').props.autoFocus,false); await choose(false);
});

test('global navigation supersedes a scoped confirmation without approving its local action', async () => {
  await render({ dirty:true, forms:['job','route'], scopes:{job:'job:1',route:'route-planner'} });let local;
  await act(async()=>{local=env.forms.job.helpers.confirmDiscard();});assert.match(JSON.stringify(tree.toJSON()),/unsaved job changes/);
  await navigate('/done');assert.equal(await local,false);assert.equal(dialog().length,1);assert.match(JSON.stringify(tree.toJSON()),/You have unsaved changes/);
  await choose(false);assert.equal(router.state.location.pathname,'/edit');assert.equal(window.count('beforeunload'),1);
});

test('saving one scoped form dismisses only its prompt and retains its sibling guard', async () => {
  await render({dirty:true,forms:['job','route'],scopes:{job:'job:1',route:'route-planner'}});let local;
  await act(async()=>{local=env.forms.job.helpers.confirmDiscard();});assert.equal(dialog().length,1);
  await act(async()=>env.forms.job.setDirty(false));assert.equal(await local,false);assert.equal(dialog().length,0);assert.equal(window.count('beforeunload'),1);
  await navigate('/done');assert.equal(dialog().length,1);assert.match(JSON.stringify(tree.toJSON()),/unsaved route changes/);await choose(true);assert.equal(router.state.location.pathname,'/done');
});
