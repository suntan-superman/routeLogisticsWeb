const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { create, act } = require('react-test-renderer');
const babel = require('@babel/core');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const modules = new Map(), listeners = new Set();
let tree, rows, remote, pickerResult, picker, permission, saves, manipulations, calls, retries, busyEvents, draftEvents, interactions, save, compress, read;
const asset = { uri: 'file:///selected.HEIC', width: 6000, height: 4000, fileName: 'IMG_123.HEIC', mimeType: 'image/heic', assetId: 'asset-123' };
const chosen = () => ({ canceled: false, assets: [{ ...asset }] });
function load(relative) {
  const file = path.resolve(root, relative);
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} }; modules.set(file, module);
  const mockRequire = name => {
    if (name === 'react') return React;
    if (name.startsWith('@babel/runtime/')) return require(name);
    if (name === 'react-native') return Object.fromEntries(['View', 'Text', 'Button', 'Image', 'ScrollView'].map(key => [key, key]));
    if (name === 'expo-image-picker') return {
      UIImagePickerPresentationStyle: { FULL_SCREEN: 'fullScreen' }, requestCameraPermissionsAsync: async () => permission,
      launchCameraAsync: options => { calls.push({ source: 'camera', options }); return picker(); },
      launchImageLibraryAsync: options => { calls.push({ source: 'library', options }); return picker(); },
    };
    if (name === 'expo-image-manipulator') return { SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: (...args) => { manipulations.push(args); return compress(...args); } };
    if (name.endsWith('/workspaceApi')) return { readWorkspace: (...args) => read(...args), callWorkspace: async (...args) => { calls.push(args); return { dataUri: 'data:image/jpeg;base64,AAAA' }; } };
    if (name.endsWith('/offline')) return {
      cachedRead: (_name, loader) => loader(), queuedWork: async () => rows,
      subscribeOffline: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      savePhotoOffline: (...args) => { saves.push(args); return save(...args); },
      resolveOffline: async (id, action) => { retries.push({ id, action }); const row = rows.find(item => item.id === id); if (row) { row.state = 'pending'; row.error = ''; } },
    };
    if (name.endsWith('/nativeInteraction')) return { beginNativeInteraction: () => { interactions++; let released = false; return () => { if (!released) { released = true; interactions--; } }; } };
    if (name.endsWith('/ThemeProvider')) return { useTheme: () => ({ palette: { text: '#fff', secondary: '#ccc', danger: '#f66' } }) };
    throw new Error(`Unexpected dependency ${name}`);
  };
  const result = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] });
  new Function('require', 'module', 'exports', result.code)(mockRequire, module, module.exports);
  return module.exports;
}
const Photos = load('components/JobPhotos.js').default;
const job = id => ({ id, companyId: 'acme', customerId: 'customer', status: 'in-progress' });
const props = id => ({ job: job(id), onBusyChange: value => busyEvents.push(value), onDraftChange: value => draftEvents.push(value) });
const text = () => JSON.stringify(tree.toJSON());
const button = title => tree.root.findAll(node => node.type === 'Button' && node.props.title === title)[0];
async function settle() { for (let turn = 0; turn < 4; turn++) await act(async () => { await Promise.resolve(); }); }
async function render(id = 'job-one') { await act(async () => { tree = create(React.createElement(Photos, props(id))); }); await settle(); }
async function press(title) { const target = button(title); assert.ok(target, `Button ${title} exists`); await act(async () => target.props.onPress()); await settle(); }
beforeEach(() => {
  tree = null; rows = []; remote = []; pickerResult = chosen(); permission = { granted: true }; calls = []; saves = []; manipulations = []; retries = []; busyEvents = []; draftEvents = []; interactions = 0;
  picker = async () => pickerResult;
  compress = async () => ({ uri: 'file:///compressed.jpg', width: 1600, height: 1067 });
  read = async () => ({ photos: remote });
  save = async (work, uri, metadata) => { const id = `photo-${rows.length + 1}`; rows.push({ id, jobId: work.id, kind: 'photo', localUri: uri, metadata, state: 'pending' }); return id; };
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); assert.equal(listeners.size, 0); assert.equal(interactions, 0); });

test('camera capture uses image-only SDK54 options and preserves metadata in the scoped photo queue', async () => {
  await render(); await press('Take photo');
  assert.equal(calls[0].source, 'camera'); assert.deepEqual(calls[0].options.mediaTypes, ['images']);
  assert.equal(calls[0].options.allowsEditing, false); assert.equal(calls[0].options.presentationStyle, 'fullScreen');
  assert.deepEqual(manipulations[0][1], [{ resize: { width: 1600 } }]);
  assert.equal(saves.length, 1); assert.equal(saves[0][0].id, 'job-one'); assert.equal(saves[0][1], 'file:///compressed.jpg');
  assert.deepEqual(saves[0][2], { source: 'camera', fileName: asset.fileName, mimeType: 'image/jpeg', width: 1600, height: 1067 });
  assert.match(text(), /Queued on this device/); assert.equal(draftEvents.at(-1), false); assert.equal(busyEvents.at(-1), false);
});

test('camera permission denial is actionable and never launches the native camera', async () => {
  permission = { granted: false }; await render(); await press('Take photo');
  assert.equal(calls.length, 0); assert.equal(saves.length, 0);
  assert.match(text(), /iPhone Settings/); assert.equal(busyEvents.at(-1), false);
});

test('gallery and camera cancellation return with the job context intact and no photo operation', async () => {
  pickerResult = { canceled: true, assets: null }; await render();
  await press('Choose photo'); await press('Take photo');
  assert.equal(saves.length, 0); assert.equal(manipulations.length, 0);
  assert.match(text(), /Photo selection cancelled/); assert.equal(busyEvents.at(-1), false); assert.equal(draftEvents.at(-1), false);
  pickerResult = chosen(); await press('Choose photo'); assert.equal(saves[0][0].id, 'job-one');
});

test('a failed gallery save retains the selected URI and retries without selecting or compressing it again', async () => {
  save = async () => { throw new Error('Device storage is full.'); };
  await render(); await press('Choose photo');
  assert.match(text(), /Device storage is full/); assert.match(text(), /Your selected photo is retained/);
  assert.equal(draftEvents.at(-1), true); assert.equal(busyEvents.at(-1), false);
  assert.equal(tree.root.findAll(node => node.type === 'Image' && node.props.accessibilityLabel === 'Selected job photo')[0].props.source.uri, 'file:///compressed.jpg');
  save = async (work, uri, metadata) => { rows.push({ id: 'retry', kind: 'photo', jobId: work.id, localUri: uri, metadata, state: 'pending' }); return 'retry'; };
  await press('Retry saving photo');
  assert.equal(calls.filter(item => item.source === 'library').length, 1); assert.equal(manipulations.length, 1);
  assert.match(text(), /Queued on this device/); assert.equal(draftEvents.at(-1), false);
});

test('compression failures retain the original selection until explicit discard or retry', async () => {
  compress = async () => { throw new Error('Cannot convert this image.'); };
  await render(); await press('Choose photo');
  assert.equal(saves.length, 0); assert.match(text(), /Cannot convert this image/);
  assert.equal(tree.root.findAll(node => node.type === 'Image')[0].props.source.uri, asset.uri);
  await press('Discard selected photo'); assert.equal(draftEvents.at(-1), false); assert.equal(button('Choose photo').props.disabled, false);
});

test('queued upload failures show the reason, can retry, and transition to an uploaded photo', async () => {
  rows.push({ id: 'failed-photo', kind: 'photo', jobId: 'job-one', localUri: 'file:///durable.jpg', state: 'failed', error: 'This job is no longer assigned to your workspace.' });
  await render(); assert.match(text(), /Upload failed/); assert.match(text(), /no longer assigned/);
  await press('Retry photo upload'); assert.deepEqual(retries, [{ id: 'failed-photo', action: 'retry' }]); assert.match(text(), /Queued on this device/);
  rows[0].state = 'synced'; remote = [{ id: 'uploaded-photo', jobId: 'job-one' }];
  await act(async () => { await Promise.all([...listeners].map(listener => listener())); }); await settle();
  assert.match(text(), /Uploaded photo/); assert.doesNotMatch(text(), /Upload failed|Queued on this device/);
  await press('View photo'); assert.equal(tree.root.findAllByType('Image')[0].props.source.uri, 'data:image/jpeg;base64,AAAA');
});

test('double taps launch one picker and a late result cannot attach to another job', async () => {
  let resolvePicker, pending;
  picker = () => new Promise(resolve => { resolvePicker = resolve; });
  await render(); const choose = button('Choose photo').props.onPress;
  await act(async () => { pending = choose(); choose(); await Promise.resolve(); });
  assert.equal(calls.length, 1); assert.equal(busyEvents.at(-1), true);
  await act(async () => tree.update(React.createElement(Photos, props('job-two'))));
  await act(async () => { resolvePicker(chosen()); await pending; }); await settle();
  assert.equal(saves.length, 0); assert.equal(draftEvents.at(-1), false);
});

test('a picker result after unmount does not save or update the closed job', async () => {
  let resolvePicker, pending;
  picker = () => new Promise(resolve => { resolvePicker = resolve; });
  await render(); await act(async () => { pending = button('Choose photo').props.onPress(); await Promise.resolve(); });
  await act(async () => tree.unmount()); tree = null;
  const count = busyEvents.length;
  await act(async () => { resolvePicker(chosen()); await pending; });
  assert.equal(saves.length, 0); assert.equal(busyEvents.length, count);
});

test('photo read errors stay visible and denied access does not retain a prior photo list', async () => {
  remote = [{ id: 'private-photo' }]; await render(); assert.match(text(), /Uploaded photo/);
  read = async () => { throw Object.assign(new Error('Your membership was removed.'), { code: 'functions/permission-denied' }); };
  await press('Refresh photos'); assert.match(text(), /Your membership was removed/); assert.doesNotMatch(text(), /Uploaded photo/);
});
