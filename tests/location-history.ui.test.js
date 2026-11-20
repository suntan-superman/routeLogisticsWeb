const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobileRequire = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json'));
const webRequire = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobileRequire('react'), { create, act } = mobileRequire('react-test-renderer'), { transformSync } = webRequire('esbuild');
const { createWorkspaceQueryMock, selectControlMock } = require('./support/workspaceQueryMock.cjs');
const workspaceHooks = createWorkspaceQueryMock(React, { scopeId: 'location-history-workspace' });
global.IS_REACT_ACT_ENVIRONMENT = true;

let tree, calls, mapContainers, mapNode, markers = [], infoWindows = [], geocodeCalls = 0, geocodeFailure = null;
global.document = {
  visibilityState: 'visible',
  createElement: () => ({ style: {}, textContent: '', children: [], append(...children) { this.children.push(...children); } })
};
global.window = { google: { maps: { Geocoder: class { async geocode() { geocodeCalls++; if (geocodeFailure) { const failure = geocodeFailure; geocodeFailure = null; throw failure; } return { results: [{ formatted_address: '123 Synthetic Street, Bakersfield, CA' }] }; } } } } };

class Bounds {
  constructor() { this.points = []; }
  extend(point) { this.points.push(point); }
  isEmpty() { return this.points.length === 0; }
}
class MapMock {
  constructor(container) {
    assert.ok(container, 'Google Maps must receive a mounted container');
    mapContainers.push(container);
  }
  fitBounds() {}
}
class PolylineMock {
  constructor(options) { Object.assign(this, options); }
  setMap(value) { this.map = value; }
}
class MarkerMock {
  constructor(options) { Object.assign(this, options); markers.push(this); this.listeners = {}; }
  addListener(name, callback) { this.listeners[name] = callback; }
}
class InfoWindowMock {
  constructor(options) { Object.assign(this, options); infoWindows.push(this); }
  open() { this.opened = true; }
  close() { this.closed = true; }
}
const mapsApi = {
  LatLngBounds: Bounds,
  InfoWindow: InfoWindowMock,
  importLibrary: async name => name === 'marker'
    ? { AdvancedMarkerElement: MarkerMock }
    : { Map: MapMock, Polyline: PolylineMock }
};

const modules = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '../routeLogisticsWeb/src', relative);
  if (modules.has(file)) return modules.get(file);
  const module = { exports: {} };
  const mocked = name => {
    if (name === 'react') return React;
    if (name.endsWith('/useWorkspaceQuery')) return workspaceHooks;
    if (name.endsWith('/SelectControl')) return { __esModule: true, default: selectControlMock(React) };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ company: { id: 'acme', timeZone: 'America/Los_Angeles' }, role: 'manager', can: permission => permission === 'locations.viewTeam' }) };
    if (name.endsWith('/workspaceApi')) return { callWorkspace: async (name, data) => {
      calls.push({ name, data });
      if (name === 'rlGetLocationHistoryMembers') return { technicians: [{ memberId: 'tech-3', name: 'Luis Gonzales', status: 'active' }], truncated: false };
      if (name === 'rlGetLocationHistory') return {
        points: Array.from({ length: 6 }, (_, index) => ({ id: `fix-${index + 1}`, lat: 35.38, lng: -119.01, accuracy: 10, capturedAt: new Date(Date.parse('2026-11-20T16:00:00.000Z') + index * 180000).toISOString() })),
        events: [], nextCursor: null, hasMore: false, eventsTruncated: false, retentionHours: 24, intervalMinutes: 3
      };
      throw Error(`Unexpected callable ${name}`);
    } };
    if (name.endsWith('/maps')) return { loadMaps: async () => mapsApi };
    if (name.startsWith('.')) {
      const target = path.resolve(path.dirname(file), name);
      const resolved = path.extname(target) ? target : fs.existsSync(`${target}.jsx`) ? `${target}.jsx` : `${target}.js`;
      return load(path.relative(path.resolve(__dirname, '../routeLogisticsWeb/src'), resolved));
    }
    throw Error(`Unexpected dependency ${name}`);
  };
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), {
    loader: file.endsWith('.jsx') ? 'jsx' : 'js',
    format: 'cjs',
    define: { 'import.meta.env.VITE_GOOGLE_MAPS_MAP_ID': '"TEST_MAP_ID"' }
  });
  new Function('React', 'require', 'module', 'exports', code)(React, mocked, module, module.exports);
  modules.set(file, module.exports);
  return module.exports;
}

const Page = load('pages/LocationHistoryPage.jsx').default;
const button = label => tree.root.findAll(node => node.type === 'button' && node.children.join('') === label)[0];

afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null; calls = []; mapContainers = []; markers = []; infoWindows = []; geocodeCalls = 0; geocodeFailure = null;
});

test('the observed-route map initializes only after its container is mounted', async () => {
  calls = []; mapContainers = []; mapNode = { nodeType: 1, label: 'route-map' };
  await act(async () => {
    tree = create(React.createElement(Page), {
      createNodeMock: element => element.props['aria-label'] === 'Observed technician GPS route map' ? mapNode : {}
    });
  });
  await act(async () => tree.root.findByType('select').props.onChange({ target: { value: 'tech-3' } }));
  await act(async () => button('Load history').props.onClick());
  assert.equal(tree.root.findAllByProps({ 'aria-label': 'Observed technician GPS route map' }).length, 0);
  await act(async () => button('Show observed route on map').props.onClick());
  assert.deepEqual(mapContainers, [mapNode]);
  assert.equal(tree.root.findByProps({ 'aria-label': 'Observed technician GPS route map' }).props['aria-busy'], false);
  assert.equal(tree.root.findAllByProps({ role: 'alert' }).length, 0);
});

test('selecting a history marker shows its recorded time and lazily resolves one approximate address', async () => {
  calls = []; mapContainers = []; markers = []; infoWindows = []; geocodeCalls = 0;
  mapNode = { nodeType: 1, label: 'route-map' };
  await act(async () => { tree = create(React.createElement(Page), { createNodeMock: element => element.props['aria-label'] === 'Observed technician GPS route map' ? mapNode : {} }); });
  await act(async () => tree.root.findByType('select').props.onChange({ target: { value: 'tech-3' } }));
  await act(async () => button('Load history').props.onClick());
  await act(async () => button('Show observed route on map').props.onClick());
  assert.equal(geocodeCalls, 0, 'Map display must not geocode every marker');
  const stop = markers.find(marker => marker.content.textContent === '1');
  assert.ok(stop, 'A recorded stop marker should be present');
  await act(async () => { stop.listeners.click(); await new Promise(resolve => setImmediate(resolve)); });
  assert.equal(geocodeCalls, 1);
  assert.match(infoWindows.at(-1).content.children.map(node => node.textContent).join(' '), /Stop 1.*Approximate address: 123 Synthetic Street.*Observed:/);
  await act(async () => { stop.listeners.click(); await new Promise(resolve => setImmediate(resolve)); });
  assert.equal(geocodeCalls, 1, 'Reopening the same marker should reuse its address');
  const start = markers.find(marker => marker.content.textContent === 'S');
  await act(async () => { start.listeners.click(); await new Promise(resolve => setImmediate(resolve)); });
  assert.match(infoWindows.at(-1).content.children.map(node => node.textContent).join(' '), /Start.*Recorded:/);
});

test('a denied address lookup reports the configuration error and retries when the marker is selected again', async () => {
  calls = []; mapContainers = []; markers = []; infoWindows = []; geocodeCalls = 0;
  mapNode = { nodeType: 1, label: 'route-map' };
  await act(async () => { tree = create(React.createElement(Page), { createNodeMock: element => element.props['aria-label'] === 'Observed technician GPS route map' ? mapNode : {} }); });
  await act(async () => tree.root.findByType('select').props.onChange({ target: { value: 'tech-3' } }));
  await act(async () => button('Load history').props.onClick());
  await act(async () => button('Show observed route on map').props.onClick());
  const stop = markers.find(marker => marker.content.textContent === '1');
  geocodeFailure = { code: 'REQUEST_DENIED' };
  await act(async () => { stop.listeners.click(); await new Promise(resolve => setImmediate(resolve)); });
  assert.equal(geocodeCalls, 1);
  assert.match(infoWindows.at(-1).content.children.map(node => node.textContent).join(' '), /Google denied the address lookup/);
  assert.match(tree.root.findByProps({ role: 'alert' }).children.join(''), /Geocoding API/);
  await act(async () => { stop.listeners.click(); await new Promise(resolve => setImmediate(resolve)); });
  assert.equal(geocodeCalls, 2, 'A failed lookup must not be cached');
  assert.match(infoWindows.at(-1).content.children.map(node => node.textContent).join(' '), /Approximate address: 123 Synthetic Street/);
  assert.equal(tree.root.findAllByProps({ role: 'alert' }).length, 0);
});

test('the stop-address action can retry after a Google lookup failure', async () => {
  calls = []; mapContainers = []; markers = []; infoWindows = []; geocodeCalls = 0;
  mapNode = { nodeType: 1, label: 'route-map' };
  await act(async () => { tree = create(React.createElement(Page), { createNodeMock: element => element.props['aria-label'] === 'Observed technician GPS route map' ? mapNode : {} }); });
  await act(async () => tree.root.findByType('select').props.onChange({ target: { value: 'tech-3' } }));
  await act(async () => button('Load history').props.onClick());
  await act(async () => button('Show observed route on map').props.onClick());
  geocodeFailure = { code: 'REQUEST_DENIED' };
  await act(async () => button('Resolve approximate stop addresses').props.onClick());
  assert.equal(geocodeCalls, 1);
  assert.match(tree.root.findByProps({ role: 'alert' }).children.join(''), /Geocoding API/);
  await act(async () => button('Resolve approximate stop addresses').props.onClick());
  assert.equal(geocodeCalls, 2);
  assert.equal(tree.root.findAllByProps({ role: 'alert' }).length, 0);
  assert.match(tree.root.findAll(node => node.type === 'p' && node.children.join('').includes('123 Synthetic Street'))[0].children.join(''), /Approximate address:/);
});
