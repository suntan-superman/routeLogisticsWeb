import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const webRequire = createRequire(import.meta.url), mobileRequire = createRequire(new URL('../../../routeLogisticsMobile/package.json', import.meta.url));
const React = mobileRequire('react'), { create, act } = mobileRequire('react-test-renderer'), { transformSync } = webRequire('esbuild');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
let tree, jobs, positions, requests, markerRows, mapRows, imports, responder, nodes, keyListeners, focusCalls, extraDialogs;
const text = node => typeof node === 'string' ? node : (Array.isArray(node) ? node : node?.children || []).map(text).join('');
const mappedJobs = () => markerRows.filter(marker => marker.map && !marker.title.startsWith('On-duty technician'));
const resultFor = request => {
  const addresses = [request.origin, ...request.intermediates.map(row => row.location), request.destination];
  return { routes: [{ legs: addresses.slice(1).map((_address, i) => ({ startLocation: { lat: () => 35 + i / 100, lng: () => -119 }, endLocation: { lat: 35 + (i + 1) / 100, lng: -119.01 } })) }] };
};
const maps = {
  LatLngBounds: class { points = []; extend(point) { this.points.push(point); } isEmpty() { return !this.points.length; } },
  importLibrary: async library => {
    imports.push(library);
    if (library === 'maps') return { Map: class { constructor(element, options) { this.element = element; this.options = options; this.fits = []; mapRows.push(this); } fitBounds(bounds) { this.fits.push([...bounds.points]); } } };
    if (library === 'marker') return {
      PinElement: class { constructor(options) { this.element = options; } },
      AdvancedMarkerElement: class { constructor(options) { Object.assign(this, options); this.listeners = new Map(); this.element = { isConnected: true, focus: () => focusCalls.push('marker') }; markerRows.push(this); } addListener(type, listener) { this.listeners.set(type, listener); } },
    };
    assert.equal(library, 'routes'); return { Route: { computeRoutes: async request => { requests.push(request); return responder(request); } } };
  },
};
const modules = new Map();
function load(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} }; modules.set(filename, module);
  const requireMock = name => {
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return mobileRequire(name);
    if (name.endsWith('/contexts/AuthContext')) return { useAuth: () => ({ company: { id: 'acme', name: 'Acme Pest Control' }, can: () => true }) };
    if (name.endsWith('/services/maps')) return { loadMaps: async () => maps };
    if (name.endsWith('/services/workspaceApi')) return {
      readWorkspace: async () => ({ jobs: jobs.map(row => ({ ...row })), hasMore: false }),
      callWorkspace: async (name) => {
        if (name === 'rlGetRoutingTeam') return { team: [{ id: 'member', name: 'On-duty technician' }] };
        if (name === 'rlGetTeamLocations') return { locations: positions, roster: [{ memberId: 'member', name: 'On-duty technician', dutyStatus: 'on-duty', location: positions[0] }], policy: { intervalMinutes: 3, freshAfterSeconds: 300 } };
        assert.equal(name, 'rlJobVisit'); return { events: [] };
      },
    };
    if (name === './RoutesPage') return () => React.createElement('aside', null, 'Existing route planner');
    if (name.endsWith('/components/JobPhotos')) return () => React.createElement('aside', null, 'Job photos remain available');
    if (name.endsWith('/components/ServiceChecklist')) return () => React.createElement('aside', null, 'Job service checklist');
    if (name.endsWith('/components/TeamLocationStatus')) return () => React.createElement('span', null, 'On duty with current GPS');
    if (name.startsWith('.')) { const next = path.resolve(path.dirname(filename), name); return load(path.extname(next) ? next : `${next}.js`); }
    throw new Error(`Unexpected import: ${name}`);
  };
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), { loader: filename.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'automatic', define: { 'import.meta.env': '{}' } });
  new Function('require', 'module', 'exports', code)(requireMock, module, module.exports);
  return module.exports;
}
const Page = load(path.resolve(source, 'pages/DispatchPage.jsx')).default;
const defaultJob = (id, overrides = {}) => ({ id, customerName: id, serviceType: 'Inspection', address: `${id} Field Road`, city: 'Bakersfield', state: 'CA', status: 'scheduled', assignedTo: 'member', date: '2026-11-13', ...overrides });
const buttons = label => tree.root.findAll(node => node.type === 'button' && text(node) === label);
const content = () => text(tree.toJSON());
const dialogs = () => tree.root.findAll(node => node.type === 'section' && node.props.role === 'dialog');
async function settle() { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); }
async function press(label, event) { const button = buttons(label)[0]; assert.ok(button, label); assert.notEqual(button.props.disabled, true); await act(async () => button.props.onClick(event)); await settle(); }
async function render() {
  await act(async () => { tree = create(React.createElement(Page), { createNodeMock: element => {
    const node = { type: element.type, props: element.props, isConnected: true, focus() { focusCalls.push(this.props.children || this.type); document.activeElement = this; }, getAttribute(name) { return this.props[name]; },
      contains(target) { return nodes.includes(target) && target.type === 'button'; }, querySelectorAll() { return nodes.filter(row => row.type === 'button' && !row.props.disabled); } };
    nodes.push(node); return node;
  } }); }); await settle();
}
beforeEach(() => {
  tree = null; jobs = [defaultJob('First'), defaultJob('Second', { status: 'in-progress' })]; positions = [{ memberId: 'member', name: 'On-duty technician', lat: 35.2, lng: -119.2, accuracy: 10, capturedAt: new Date().toISOString(), state: 'live' }];
  requests = []; markerRows = []; mapRows = []; imports = []; responder = resultFor; nodes = []; keyListeners = new Set(); focusCalls = []; extraDialogs = [];
  globalThis.document = { visibilityState: 'visible', body: { style: { overflow: 'auto' } }, activeElement: null,
    querySelectorAll: () => [...nodes.filter(node => node.props.role === 'dialog').slice(-1), ...extraDialogs] };
  globalThis.window = { addEventListener: (event, listener) => { assert.equal(event, 'keydown'); keyListeners.add(listener); }, removeEventListener: (_event, listener) => keyListeners.delete(listener) };
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); assert.equal(keyListeners.size, 0); assert.equal(document.body.style.overflow, 'auto'); delete globalThis.document; delete globalThis.window; });

test('Show dispatch map locates two jobs, fits all pins, aligns count and never repeats lookup on unchanged refresh', async () => {
  await render(); assert.equal(requests.length, 0); assert.equal(imports.length, 0);
  const count = tree.root.findAll(node => node.type === 'span' && text(node) === '2 jobs · 0 unassigned')[0];
  assert.match(count.parent.props.className, /items-center/); assert.match(count.props.className, /whitespace-nowrap/);
  await press('Show dispatch map'); assert.equal(requests.length, 1); assert.equal(mappedJobs().length, 2);
  assert.ok(mapRows[0].fits.at(-1).every(point => point.lat >= 35 && point.lat < 36)); assert.match(content(), /2 of 2 jobs mapped/);
  assert.equal(buttons('Locate next 25 service addresses').length, 0); assert.equal(markerRows.filter(marker => marker.map && marker.content.glyph === 'T').length, 1);
  const fits = mapRows[0].fits.length; jobs = jobs.map(row => ({ ...row, status: 'completed' })); await press('Refresh');
  assert.equal(requests.length, 1); assert.equal(mapRows[0].fits.length, fits); assert.equal(mappedJobs().length, 2); assert.ok(mappedJobs().every(marker => marker.title.endsWith('completed')));
});

test('jobs with real coordinates render immediately without a Routes call', async () => {
  jobs = [defaultJob('Mapped', { latitude: 35.4, longitude: -119.4 })];
  await render(); await press('Show dispatch map'); assert.equal(requests.length, 0); assert.ok(!imports.includes('routes'));
  assert.deepEqual(mappedJobs()[0].position, { lat: 35.4, lng: -119.4 });
});

test('one address can use a real shared team position as its routing anchor', async () => {
  jobs = [defaultJob('Single')];
  await render(); await press('Show dispatch map'); assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].origin, { lat: 35.2, lng: -119.2 }); assert.equal(requests[0].destination, 'Single Field Road, Bakersfield, CA');
  assert.equal(mappedJobs().length, 1);
});

test('unresolved single-address maps show an explicit retry and never invent a marker', async () => {
  jobs = [defaultJob('Single')]; positions = []; responder = async () => ({ routes: [] });
  await render(); await press('Show dispatch map'); assert.equal(requests.length, 1); assert.equal(mappedJobs().length, 0);
  assert.match(content(), /could not be located/); assert.ok(buttons('Retry unresolved addresses')[0]);
  await press('Refresh'); assert.equal(requests.length, 1);
  responder = async () => ({ routes: [{ legs: [], path: [{ lat: 35.4, lng: -119.4 }] }] });
  await press('Retry unresolved addresses'); assert.equal(requests.length, 2); assert.equal(mappedJobs().length, 1); assert.equal(buttons('Retry unresolved addresses').length, 0);
});

test('an unmounted dispatch map ignores a late paid lookup response', async () => {
  let resolve; responder = () => new Promise(done => { resolve = done; });
  await render(); await press('Show dispatch map'); assert.equal(requests.length, 1); assert.ok(resolve);
  const fits = mapRows[0].fits.length; await act(async () => tree.unmount()); tree = null;
  await act(async () => resolve(resultFor(requests[0]))); await settle();
  assert.equal(mapRows[0].fits.length, fits); assert.ok(markerRows.every(marker => marker.map === null));
});

test('job details open immediately in a scrolling drawer, preserve photos and restore focus/body scroll', async () => {
  await render(); const trigger = { isConnected: true, focus: options => { focusCalls.push(['trigger', options]); } };
  await press('First · Inspection', { currentTarget: trigger }); assert.equal(dialogs().length, 1);
  assert.equal(document.body.style.overflow, 'hidden'); assert.match(dialogs()[0].props.className, /overflow-y-auto/); assert.match(dialogs()[0].props.className, /w-full/);
  assert.equal(dialogs()[0].props['aria-modal'], 'true'); assert.match(content(), /Job photos remain available/); assert.match(content(), /Status: /);
  assert.ok(focusCalls.includes('Close details'));
  for (const listener of keyListeners) await act(async () => listener({ key: 'Escape', preventDefault() {} })); await settle();
  assert.equal(dialogs().length, 0); assert.equal(document.body.style.overflow, 'auto'); assert.deepEqual(focusCalls.at(-1), ['trigger', { preventScroll: true }]);
});

test('map marker opens the same drawer; backdrop closes it and nested confirmation owns Escape', async () => {
  await render(); await press('Show dispatch map'); const marker = mappedJobs()[0];
  await act(async () => marker.listeners.get('click')()); await settle(); assert.equal(dialogs().length, 1);
  extraDialogs = [{ otherConfirmation: true }];
  for (const listener of keyListeners) await act(async () => listener({ key: 'Escape', preventDefault() {} })); assert.equal(dialogs().length, 1);
  extraDialogs = [];
  const backdrop = tree.root.findByProps({ 'data-testid': 'job-details-backdrop' }); const target = {};
  await act(async () => backdrop.props.onMouseDown({ target, currentTarget: target })); await settle();
  assert.equal(dialogs().length, 0); assert.ok(focusCalls.includes('marker')); assert.equal(document.body.style.overflow, 'auto');
});
