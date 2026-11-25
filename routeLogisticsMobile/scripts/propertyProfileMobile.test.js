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
const mockRequire = name => {
  if (name === 'react') return React;
  if (name.startsWith('@babel/runtime/')) return require(name);
  if (name === 'react-native') return { Image: 'Image', Text: 'Text', View: 'View' };
  if (name === 'expo-file-system/legacy') return { documentDirectory: 'file:///docs/', getInfoAsync: async () => ({ exists: false }), makeDirectoryAsync: async () => {}, writeAsStringAsync: async () => {}, EncodingType: { Base64: 'base64' } };
  if (name === '@react-native-community/netinfo') return { fetch: async () => ({ isConnected: true }) };
  if (name.endsWith('/firebase')) return { auth: { currentUser: { uid: 'technician' } } };
  if (name.endsWith('/offline')) return { cachedRead: (_key, loader) => loader(), propertyCacheAccountSegment: uid => uid, queuedWork: async () => pending, subscribeOffline: () => () => {} };
  if (name.endsWith('/workspaceApi')) return { callWorkspace: async (_fn, input) => input.action === 'overview' ? { property: { label: 'Home', address: '10 Example Street' }, customer: { name: 'Synthetic person' }, alerts: [], plans: [], lastCompleted: null, upcoming: [], photos: [] } : input.action === 'listPhotos' ? { photos: [
    { id: 'approved-ref', category: 'entrance', status: 'approved' },
    { id: 'pending-ref', category: 'exterior', status: 'proposed' },
    { id: 'rejected-ref', category: 'safety', status: 'rejected' },
  ] } : { rows: [] } };
  if (name.endsWith('/ThemeProvider')) return { useTheme: () => ({ palette: { text: '#fff', secondary: '#ccc', danger: '#f66' } }) };
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
  await act(async () => { tree.root.findAll(node => node.type === 'Button' && node.props.title === 'Photos')[0].props.onPress(); });
  for (let turn = 0; turn < 3; turn++) await act(async () => { await Promise.resolve(); });
  const rendered = JSON.stringify(tree.toJSON());
  assert.match(rendered, /Approved property references/);
  assert.match(rendered, /entrance · No caption · Approved/);
  assert.match(rendered, /Your reference proposals/);
  assert.match(rendered, /exterior · No caption · Awaiting management approval/);
  assert.match(rendered, /safety · No caption · Rejected by management/);
  assert.match(rendered, /exterior · Saved locally · upload pending/);
  assert.equal(tree.root.findAll(node => node.type === 'Button' && node.props.title === 'View reference photo').length, 1);
  await act(async () => tree.unmount());
});
