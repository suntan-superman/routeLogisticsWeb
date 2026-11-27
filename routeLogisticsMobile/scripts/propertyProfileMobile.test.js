const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { create, act } = require('react-test-renderer');
const babel = require('@babel/core');
global.IS_REACT_ACT_ENVIRONMENT = true;

const file = path.resolve(__dirname, '../components/PropertyProfileMobile.js');
const moduleForTest = { exports: {} };
const pending = [{ id: 'local-photo', kind: 'photo', jobId: 'job-one', propertyId: 'home', state: 'pending', metadata: { referenceCategory: 'exterior' }, attribution: { userId: 'technician' } }];
const platform = { OS: 'ios' };
let density = 'comfortable';
let photoReads = 0;
const mockRequire = name => {
  if (name === 'react') return React;
  if (name.startsWith('@babel/runtime/')) return require(name);
  if (name === 'react-native') return { ActivityIndicator: 'ActivityIndicator', Image: 'Image', Text: 'Text', View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', Platform: platform };
  if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if (name === 'expo-file-system/legacy') return { documentDirectory: 'file:///docs/', getInfoAsync: async () => ({ exists: false }), makeDirectoryAsync: async () => {}, writeAsStringAsync: async () => {}, EncodingType: { Base64: 'base64' } };
  if (name === '@react-native-community/netinfo') return { fetch: async () => ({ isConnected: true }) };
  if (name.endsWith('/firebase')) return { auth: { currentUser: { uid: 'technician' } } };
  if (name.endsWith('/offline')) return { cachedRead: (_key, loader) => loader(), propertyCacheAccountSegment: uid => uid, queuedWork: async () => pending, subscribeOffline: () => () => {} };
  if (name.endsWith('/workspaceApi')) return { callWorkspace: async (_fn, input) => input.action === 'overview' ? { property: { label: 'Home', address: '10 Example Street' }, customer: { name: 'Synthetic person' }, alerts: [], plans: [], lastCompleted: null, upcoming: [], photos: [] } : input.action === 'listPhotos' ? (photoReads++, { photos: [
    { id: 'approved-ref', category: 'entrance', status: 'approved' },
    { id: 'pending-ref', category: 'exterior', status: 'proposed' },
    { id: 'rejected-ref', category: 'safety', status: 'rejected' },
  ] }) : input.action === 'history' ? { rows: [{ id: 'visit-one', date: '2026-11-25', serviceType: 'Lawn maintenance', outcome: 'completed', notes: 'Synthetic work summary', hasEvidence: true }] } : input.action === 'materials' ? { rows: [{ id: 'material-one', date: '2026-11-25', product: 'Synthetic product', quantity: 2, unit: 'oz', location: 'Garden', method: 'Applied by hand' }] } : { rows: [] } };
  if (name.endsWith('/ThemeProvider')) return { useTheme: () => ({ palette: { text: '#fff', secondary: '#ccc', danger: '#f66', accent: '#0f8', border: '#555', surface: '#222', input: '#111', glow: '#183' }, tokens: require('../theme/designTokens').tokensForDensity(density) }) };
  if (name.endsWith('/theme/designTokens')) return require('../theme/designTokens');
  if (name === './MobileUI') return { Card: props => React.createElement('Card', props), SectionHeader: props => React.createElement('SectionHeader', props) };
  if (name === './Glass') return { GlassButton: props => React.createElement('Button', props) };
  throw new Error(`Unexpected dependency ${name}`);
};
const transformed = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] });
new Function('require', 'module', 'exports', transformed.code)(mockRequire, moduleForTest, moduleForTest.exports);
const Profile = moduleForTest.exports.default;

test('mobile property profile separates approved references, own proposals, and local upload status', async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(Profile, { job: { id: 'job-one', customerId: 'customer-one', servicePropertyId: 'home' } })); });
  await act(async () => { tree.root.findByProps({ testID: 'property-tab-photos' }).props.onPress(); });
  for (let turn = 0; turn < 3; turn++) await act(async () => { await Promise.resolve(); });
  const rendered = JSON.stringify(tree.toJSON());
  assert.match(rendered, /Approved references/);
  assert.match(rendered, /entrance/);
  assert.match(rendered, /Approved reference/);
  assert.match(rendered, /Your proposals/);
  assert.doesNotMatch(rendered, /Property photographs/);
  assert.match(rendered, /Awaiting management approval/);
  assert.match(rendered, /Rejected by management/);
  assert.match(rendered, /Saved locally · upload pending/);
  const refresh = tree.root.findByProps({ testID: 'refresh-proposal-status' });
  assert.equal(refresh.props.accessibilityRole, 'button');
  assert.equal(refresh.props.accessibilityLabel, 'Refresh proposal status');
  assert.equal(refresh.props.style.minWidth, 44);
  assert.equal(refresh.props.style.minHeight, 44);
  const readsBeforeRefresh = photoReads;
  await act(async () => { refresh.props.onPress(); });
  assert.equal(photoReads, readsBeforeRefresh + 1);
  assert.match(JSON.stringify(tree.toJSON()), /Awaiting management approval/);
  assert.equal(tree.root.findByProps({ testID: 'property-profile-tabs' }).props.horizontal, true);
  for (const name of ['overview', 'alerts', 'photos', 'history', 'materials']) {
    const tab = tree.root.findByProps({ testID: `property-tab-${name}` });
    assert.ok(tab.props.style.minHeight >= 44);
    assert.equal(tab.props.accessibilityRole, 'tab');
  }
  assert.equal(tree.root.findByProps({ testID: 'property-tab-photos' }).props.accessibilityState.selected, true);
  await act(async () => { tree.root.findByProps({ testID: 'property-tab-history' }).props.onPress(); });
  assert.match(JSON.stringify(tree.toJSON()), /Nov 25, 2026/);
  assert.match(JSON.stringify(tree.toJSON()), /Synthetic work summary/);
  assert.match(JSON.stringify(tree.toJSON()), /Photo evidence available/);
  await act(async () => { tree.root.findByProps({ testID: 'property-tab-materials' }).props.onPress(); });
  assert.match(JSON.stringify(tree.toJSON()), /Synthetic product/);
  await act(async () => tree.unmount());
});

test('proposal refresh stays compact across iOS, Android, and all display densities', async () => {
  for (const os of ['ios', 'android']) for (const setting of ['compact', 'comfortable', 'large']) {
    platform.OS = os;
    density = setting;
    let tree;
    await act(async () => { tree = create(React.createElement(Profile, { job: { id: 'job-one', customerId: 'customer-one', servicePropertyId: 'home' } })); });
    await act(async () => { tree.root.findByProps({ testID: 'property-tab-photos' }).props.onPress(); });
    const refresh = tree.root.findByProps({ testID: 'refresh-proposal-status' });
    assert.equal(refresh.props.style.minWidth, os === 'ios' ? 44 : 48);
    assert.equal(refresh.props.style.minHeight, os === 'ios' ? 44 : 48);
    assert.equal(tree.root.findByProps({ testID: 'property-proposals-heading' }).props.style.flexWrap, 'wrap');
    assert.equal(refresh.props.accessibilityLabel, 'Refresh proposal status');
    await act(async () => tree.unmount());
  }
  platform.OS = 'ios';
  density = 'comfortable';
});
