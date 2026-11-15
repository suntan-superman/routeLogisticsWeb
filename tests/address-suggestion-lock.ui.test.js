const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, env;
const policy = { settings: { configured: true, revision: 3 }, canApproveExceptions: false };
const originalAddress = '100 Unconfirmed St, Example, CA';
const suggestedAddress = '100 Confirmed Street, Example, CA 93312';
const proposal = { eligible: false, status: 'invalid-address', message: 'Review the corrected address.', addressValidation: { status: 'confirmation-required', message: 'Review the corrected address.', suggestedAddress } };
const cache = new Map();
function compile(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const module = { exports: {} };
  const mock = name => {
    if (name === 'react') return React;
    if (name === 'react-hot-toast') return { __esModule: true, default: { success() {} } };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ currentUser: { uid: 'synthetic-owner' }, role: 'owner' }) };
    if (name.endsWith('/workspaceApi')) return { callWorkspace: async (name, data) => { env.calls.push({ name, data }); return env.result; } };
    if (name === './AddressValidationNotice') return compile('components/AddressValidationNotice.jsx');
    throw Error('Unexpected dependency ' + name);
  };
  new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src', relative), 'utf8'), { loader: 'jsx', format: 'cjs' }).code)(React, mock, module, module.exports);
  cache.set(relative, module.exports); return module.exports;
}
const Property = compile('components/ServicePropertyEligibility.jsx').default;
function Harness({ fixedProperty = false, canUnlock = true, initiallyLocked = true }) {
  const [locked, setLocked] = React.useState(initiallyLocked);
  const [value, setValue] = React.useState({ address: originalAddress, serviceCategory: 'Pest Control', exceptionId: 'old-exception', confirmed: true });
  return React.createElement(Property, { companyId: 'synthetic-company', policy, value, fixedProperty, addressReadOnly: locked,
    onEnableAddressEditing: canUnlock ? () => { env.unlocks++; setLocked(false); } : undefined,
    onChange: next => { env.changes.push(next); setValue(next); } });
}
const button = label => tree.root.findAll(node => node.type === 'button' && node.children.join('') === label)[0];
const address = () => tree.root.findByProps({ 'aria-label': 'Service property address' });
const text = () => JSON.stringify(tree.toJSON());
const click = async label => { assert.ok(button(label), `Expected ${label}`); await act(async () => button(label).props.onClick()); };
const render = async props => { env = { result: proposal, calls: [], changes: [], unlocks: 0 }; await act(async () => { tree = create(React.createElement(Harness, props)); }); await click('Check service property'); };
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });

test('a locked Google correction offers nearby explicit editing before accepting the draft', async () => {
  await render();
  assert.equal(address().props.disabled, true); assert.equal(!!button('Use suggested address'), false);
  assert.ok(button('Enable Editing')); assert.equal(button('Enable Editing').props.disabled, false);
  assert.match(text(), /locked|Enable Editing/i); assert.equal(env.unlocks, 0); assert.equal(env.calls.length, 1);
  await click('Enable Editing');
  assert.equal(env.unlocks, 1); assert.equal(address().props.disabled, false); assert.equal(address().props.value, originalAddress);
  assert.equal(button('Use suggested address').props.disabled, false); assert.equal(env.calls.length, 1);
  await click('Use suggested address');
  assert.equal(address().props.value, suggestedAddress); assert.equal(env.calls.length, 1, 'Applying a suggestion must not save or recheck automatically');
  assert.deepEqual(env.changes.at(-1), { address: suggestedAddress, serviceCategory: 'Pest Control', exceptionId: null, confirmed: false });
  assert.equal(!!button('Use suggested address'), false); assert.doesNotMatch(text(), /Property is not eligible yet/);
});

test('a rejected retry keeps the corrected draft editable with actionable feedback', async () => {
  await render(); await click('Enable Editing'); await click('Use suggested address');
  env.result = { eligible: false, status: 'invalid-address', message: 'Try verification again.', addressValidation: { status: 'unavailable', message: 'Try verification again.' } };
  await click('Check service property');
  assert.equal(env.calls.length, 2); assert.equal(env.calls.at(-1).data.propertyAddress, suggestedAddress);
  assert.equal(address().props.disabled, false); assert.equal(address().props.value, suggestedAddress);
  assert.match(text(), /Address check unavailable|Try verification again/); assert.equal(!!button('Use suggested address'), false);
});

test('an already editable property can accept a correction without an unnecessary unlock step', async () => {
  await render({ initiallyLocked: false });
  assert.equal(!!button('Enable Editing'), false); assert.equal(button('Use suggested address').props.disabled, false);
  await click('Use suggested address'); assert.equal(address().props.value, suggestedAddress); assert.equal(env.unlocks, 0); assert.equal(env.calls.length, 1);
});

for (const props of [{ fixedProperty: true }, { canUnlock: false }]) test(`a ${props.fixedProperty ? 'fixed approved' : 'read-only'} property never offers a misleading correction action`, async () => {
  await render(props);
  assert.equal(!!button('Use suggested address'), false); assert.equal(!!button('Enable Editing'), false);
  assert.equal(address().props.disabled, true); assert.equal(address().props.value, originalAddress); assert.equal(env.unlocks, 0);
  assert.match(text(), /recorded|approved|read.only|locked|edit/i);
});
