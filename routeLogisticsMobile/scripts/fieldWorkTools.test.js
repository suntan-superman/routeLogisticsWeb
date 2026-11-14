const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), React = require('react');
const { create, act } = require('react-test-renderer'), babel = require('@babel/core');
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, data, queue, listeners, writes, failure, workDrafts, busyStates, changes, update, visits, visitRequests, visitRecord, offline, gpsPermission, gpsFix, gpsRequests, permissionRequests, operationSequence;
const panel = ({ children, title, subtitle }) => React.createElement('View', null, title && React.createElement('Text', null, title), subtitle && React.createElement('Text', null, subtitle), children);
const button = ({ title, onPress, busy, disabled }) => React.createElement('Pressable', { accessibilityLabel: title, onPress, disabled: !!busy || !!disabled }, React.createElement('Text', null, title));
const filename = path.resolve(__dirname, '../components/FieldWorkTools.js'), moduleUnderTest = { exports: {} };
const requireMock = name => {
  if (name.startsWith('@babel/runtime/')) return require(name);
  if (name === 'react') return React;
  if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', AppState: { currentState: 'active' }, Linking: { openURL: async () => {} } };
  if (name === 'expo-crypto') return { randomUUID: () => `visit-operation-${++operationSequence}` };
  if (name === 'expo-location') return { Accuracy: { Balanced: 3 }, getForegroundPermissionsAsync: async () => { permissionRequests++; return gpsPermission; }, getCurrentPositionAsync: async () => { gpsRequests++; return gpsFix; }, requestForegroundPermissionsAsync: () => { throw new Error('Visit records must not request permission.'); } };
  if (name.endsWith('/services/firebase')) return { JobService: { updateJob: async (id, patch) => { writes.push({ id, patch }); return update(id, patch); } } };
  if (name.endsWith('/services/tenancy')) return { getClaims: () => ({ role: 'technician' }) };
  if (name.endsWith('/theme/ThemeProvider')) return { useTheme: () => ({ palette: { text: '#FFF', secondary: '#CCC', danger: '#FAA', border: '#888' } }) };
  if (name.endsWith('/services/workspaceApi')) return {
    readWorkspace: async (resource, options) => { assert.equal(resource, 'serviceLogs'); return { logs: data.filter(row => row.jobId === options.jobId) }; },
    callWorkspace: async (name, payload) => { assert.equal(name, 'rlJobVisit'); if (payload.action === 'list') return { events: visits, hasMore: false }; visitRequests.push(payload); return visitRecord(payload); },
  };
  if (name.endsWith('/services/offline')) return {
    cachedRead: (_key, loader) => loader(), queuedWork: async () => queue, isOffline: async () => offline,
    subscribeOffline: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    saveApplicationOffline: async (jobId, record) => { if (failure) throw failure; queue.push({ id: 'local-record', kind: 'application', jobId, record, state: 'pending' }); listeners.forEach(listener => listener()); },
  };
  if (name === './MobileUI') return { Card: panel, SectionHeader: panel, PrimaryButton: button, SecondaryButton: button,
    FormField: ({ label, ...props }) => React.createElement('TextInput', { accessibilityLabel: label, ...props }),
    InlineNotice: ({ message }) => React.createElement('Text', { accessibilityRole: 'alert' }, message), StatusBadge: ({ syncState }) => React.createElement('Text', null, syncState) };
  throw new Error('Unexpected dependency ' + name);
};
const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
new Function('require', 'module', 'exports', code)(requireMock, moduleUnderTest, moduleUnderTest.exports);
const Work = moduleUnderTest.exports.default;
const selected = overrides => ({ id: 'job', status: 'in-progress', workNotes: 'Original observations', ...overrides });
const props = job => ({ job, onDraftChange: value => workDrafts.push(value), onBusyChange: value => busyStates.push(value), onChanged: async () => { changes++; } });
async function render(job = selected()) { await act(async () => { tree = create(React.createElement(Work, props(job))); }); }
const text = () => JSON.stringify(tree.toJSON());
const control = label => tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
async function press(label) { const node = control(label); assert.ok(node, label); assert.equal(node.props.disabled, false); await act(async () => node.props.onPress()); }
async function input(label, value) { await act(async () => tree.root.findByProps({ accessibilityLabel: label }).props.onChangeText(value)); }
beforeEach(() => {
  tree = null; data = []; queue = []; listeners = new Set(); writes = []; failure = null; workDrafts = []; busyStates = []; changes = 0; update = async () => ({ success: true, queued: true });
  visits = []; visitRequests = []; offline = false; gpsPermission = { granted: true }; gpsFix = { coords: { latitude: 35, longitude: -119, accuracy: 15 }, timestamp: Date.now() }; gpsRequests = permissionRequests = operationSequence = 0;
  visitRecord = async payload => { const event = { id: payload.operationId, type: payload.type, note: payload.note, source: payload.latitude == null ? 'manual' : 'manual-gps', recordedAt: new Date().toISOString(), capturedAt: payload.capturedAt, accuracy: payload.accuracy }; visits = [event, ...visits]; return { event, duplicate: false }; };
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); assert.equal(listeners.size, 0); });

test('work notes retain a draft through polling, show failure and retry without duplicate mutations', async () => {
  await render(); await input('Work notes', 'New field observations');
  await act(async () => tree.update(React.createElement(Work, props(selected({ workNotes: 'Updated elsewhere' })))));
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work notes' }).props.value, 'New field observations');
  update = async () => ({ success: false, error: { message: 'Current assignment must be checked.' } });
  await press('Save work notes'); assert.match(text(), /Current assignment must be checked/); assert.equal(workDrafts.at(-1), true);
  let resolve; update = () => new Promise(done => { resolve = done; });
  const action = control('Save work notes').props.onPress; let first, second;
  await act(async () => { first = action(); second = action(); }); assert.equal(writes.length, 2);
  await act(async () => { resolve({ success: true, queued: true }); await Promise.all([first, second]); });
  assert.equal(workDrafts.at(-1), false); assert.equal(busyStates.at(-1), false); assert.equal(changes, 1);
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work notes' }).props.value, 'New field observations');
});

test('application records combine safe server history and pending work and validate additions', async () => {
  data = [{ id: 'existing', jobId: 'job', product: 'Existing product', amount: 2, unit: 'oz', targetPest: 'Ants' }];
  await render(); assert.match(text(), /Existing product/);
  await press('Record product application'); assert.equal(workDrafts.at(-1), true);
  await press('Save application'); assert.match(text(), /positive quantity/); assert.equal(queue.length, 0);
  await input('Product', 'New product'); await input('Target pest', 'Termites'); await input('Quantity', '1.5'); await input('Unit', 'oz');
  failure = new Error('Device storage unavailable.'); await press('Save application'); assert.match(text(), /Device storage unavailable/);
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Product' }).props.value, 'New product');
  failure = null; await press('Save application'); assert.equal(queue.length, 1); assert.equal(queue[0].jobId, 'job');
  assert.match(text(), /New product/); assert.match(text(), /pending/); assert.equal(workDrafts.at(-1), false);
});

test('completed visits retain documentation and application history without mutation controls', async () => {
  data = [{ id: 'record', jobId: 'job', product: 'Recorded treatment' }];
  await render(selected({ status: 'completed' }));
  assert.match(text(), /Original observations/); assert.match(text(), /Recorded treatment/);
  for (const label of ['Save work notes', 'Record product application', 'Start work', 'Mark en route', 'Record arrival', 'Record departure', "Couldn't access property"]) assert.equal(control(label), undefined);
});

test('manual visit reports require an access-blocked reason and preserve notes offline without queuing', async () => {
  await render(); await press("Couldn't access property"); assert.equal(workDrafts.at(-1), true);
  await press('Save visit record'); assert.match(text(), /Describe why the property could not be accessed/); assert.equal(visitRequests.length, 0);
  await input('Visit note', 'Gate locked; called customer.'); offline = true;
  await press('Save visit record'); assert.match(text(), /require a connection and have not been queued/);
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Visit note' }).props.value, 'Gate locked; called customer.');
  assert.equal(workDrafts.at(-1), true); assert.equal(queue.length, 0); assert.equal(visitRequests.length, 0);
  offline = false; await press('Save visit record');
  assert.equal(visitRequests.length, 1); assert.equal(visitRequests[0].jobId, 'job'); assert.equal(visitRequests[0].type, 'access-blocked');
  assert.equal(visitRequests[0].note, 'Gate locked; called customer.'); assert.equal(visitRequests[0].latitude, undefined);
  assert.match(text(), /Reported manually/); assert.match(text(), /does not change the job status or verify property access/);
  assert.equal(workDrafts.at(-1), false); assert.equal(writes.length, 0); assert.equal(gpsRequests, 0); assert.equal(permissionRequests, 0);
});

test('optional visit GPS uses existing foreground permission and reports source and accuracy', async () => {
  await render(); await press('Record arrival'); await press('Include current GPS');
  gpsPermission = { granted: false }; await press('Save visit record');
  assert.match(text(), /Location permission is off/); assert.equal(visitRequests.length, 0); assert.equal(gpsRequests, 0); assert.equal(workDrafts.at(-1), true);
  gpsPermission = { granted: true }; await press('Save visit record');
  assert.equal(gpsRequests, 1); assert.equal(visitRequests[0].latitude, 35); assert.equal(visitRequests[0].longitude, -119); assert.equal(visitRequests[0].accuracy, 15);
  assert.match(text(), /Reported manually with GPS evidence/); assert.match(text(), /GPS accuracy: ±/); assert.match(text(), /15/);
  assert.equal(writes.length, 0); assert.equal(queue.length, 0);
});

test('visit authorization/network failures retain a safely retryable event and duplicate taps send once', async () => {
  await render(); await press('Record departure'); await input('Visit note', 'Departing after treatment.');
  visitRecord = async () => { throw Object.assign(new Error('The current assignment could not be authorized.'), { code: 'functions/permission-denied' }); };
  await press('Save visit record'); assert.match(text(), /current assignment could not be authorized/); assert.equal(workDrafts.at(-1), true);
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Visit note' }).props.value, 'Departing after treatment.');
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Visit note' }).props.editable, false);
  const original = { ...visitRequests[0] }; let resolve;
  visitRecord = () => new Promise(done => { resolve = done; });
  const action = control('Retry visit record').props.onPress; let first, duplicate;
  await act(async () => { first = action(); duplicate = action(); await Promise.resolve(); });
  assert.equal(visitRequests.length, 2); assert.deepEqual(visitRequests[1], original);
  await act(async () => { resolve({ event: { id: original.operationId, type: 'departed', note: original.note, source: 'manual', recordedAt: new Date().toISOString() }, duplicate: true }); await Promise.all([first, duplicate]); });
  assert.match(text(), /already recorded/); assert.equal(workDrafts.at(-1), false); assert.equal(busyStates.at(-1), false);
});

test('visit history labels inferred GPS as evidence and remains readable after completion', async () => {
  visits = [{ id: 'inferred', type: 'arrived', source: 'gps-evidence', recordedAt: '2026-11-13T18:00:00Z', capturedAt: '2026-11-13T17:59:00Z', accuracy: 18, distanceMeters: 30 }];
  await render(selected({ status: 'completed' })); assert.match(text(), /Estimated from GPS evidence/); assert.match(text(), /approximately 30 m/);
  assert.match(text(), /GPS evidence does not verify property access/); assert.equal(control('Record arrival'), undefined);
});

test('stale GPS is rejected without losing the visit note and manual fallback remains available', async () => {
  await render(); await press('Record arrival'); await input('Visit note', 'At the service entrance.'); await press('Include current GPS');
  gpsFix = { ...gpsFix, timestamp: Date.now() - 6 * 60000 };
  await press('Save visit record'); assert.match(text(), /GPS fix is stale or invalid/); assert.equal(visitRequests.length, 0);
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Visit note' }).props.value, 'At the service entrance.');
  await press('Include current GPS'); await press('Save visit record');
  assert.equal(visitRequests.length, 1); assert.equal(visitRequests[0].latitude, undefined); assert.equal(visitRequests[0].note, 'At the service entrance.');
});
