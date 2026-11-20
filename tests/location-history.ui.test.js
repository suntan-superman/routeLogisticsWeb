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

let tree, calls, mapContainers, mapNode;
global.document = {
  visibilityState: 'visible',
  createElement: () => ({ style: {}, textContent: '' })
};

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
  constructor(options) { Object.assign(this, options); }
}
const mapsApi = {
  LatLngBounds: Bounds,
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
        points: [
          { id: 'fix-1', lat: 35.37, lng: -119.02, accuracy: 10, capturedAt: '2026-11-20T16:00:00.000Z' },
          { id: 'fix-2', lat: 35.38, lng: -119.01, accuracy: 10, capturedAt: '2026-11-20T16:03:00.000Z' }
        ],
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
  tree = null; calls = []; mapContainers = [];
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
