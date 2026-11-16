const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
const {createWorkspaceQueryMock,selectControlMock}=require('./support/workspaceQueryMock.cjs');
const workspaceHooks=createWorkspaceQueryMock(React,{scopeId:'test-workspace'});
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, env, Notice;
const cache = new Map(), settle = () => new Promise(resolve => setImmediate(resolve));
const suggestion = { status: 'confirmation-required', suggestedAddress: '100 Confirmed Service Property, Bakersfield, CA 93312', message: 'Review the corrected address from Google.' };
const rejection = validation => Object.assign(new Error(validation.message || 'Address validation failed.'), { code: 'functions/failed-precondition', details: { addressValidation: validation } });
function reset({ company = true, status = 'draft' } = {}) {
  env = { company, calls: [], failures: {}, toasts: [], dirty: false, record: { id: 'estimate-1', title: 'Synthetic property estimate', serviceType: 'Inspection', scopeOfWork: 'Inspect this synthetic property', customerId: 'customer-1', recipient: { email: 'synthetic@example.test' }, status, version: 1, totalCents: 2000, subtotalCents: 2000, taxCents: 0, lineItems: [{ kind: 'labor', description: 'Inspection', quantity: 1, unitPrice: 20 }], serviceProperty: { address: 'Original recorded property' }, serviceCategory: 'Pest Control', photoIds: ['photo-1'] } };
}
async function estimateCall(action, data) {
  env.calls.push({ action, data });
  if (env.failures[action]) throw env.failures[action];
  if (action === 'list') return { enabled: true, emailEnabled: true, estimates: [env.record] };
  if (action === 'get') return { enabled: true, emailEnabled: true, estimate: env.record, photos: [{ id: 'photo-1', dataUri: 'data:image/jpeg;base64,eA==' }], versions: [] };
  if (action === 'save') { env.record = { ...env.record, ...data.data, version: env.record.version + 1 }; return { estimate: env.record }; }
  if (action === 'convert') return { jobId: 'synthetic-converted-job' };
  throw Error('Unexpected estimate action ' + action);
}
function compile(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const module = { exports: {} };
  const mock = name => {
    if (name === 'react') return React;
    if(name.endsWith('/useWorkspaceQuery'))return workspaceHooks;
    if(name.endsWith('/SelectControl'))return{__esModule:true,default:selectControlMock(React)};
    if(name.endsWith('/workspaceQueryPolicy'))return{workspaceAccessError:error=>['permission-denied','unauthenticated','not-found','workspace-changed'].includes(String(error?.code||'').split('/').pop())};
    if (name === 'react-hot-toast') return { __esModule: true, default: { success: message => env.toasts.push(message), error: message => env.toasts.push(message) } };
    if (name.endsWith('/contexts/AuthContext')) return { useAuth: () => ({ currentUser: { uid: 'owner' }, company: env.company ? { id: 'company', serviceCategories: ['Pest Control'] } : null, role: 'owner', can: () => true }) };
    if (name.endsWith('/hooks/useUnsavedChanges')) return { useUnsavedChanges: value => { env.dirty = value; } };
    if (name.endsWith('/services/customerService')) return { __esModule: true, default: { getCustomers: async () => ({ success: true, customers: [{ id: 'customer-1', name: 'Synthetic customer' }], hasMore: false }) } };
    if (name.endsWith('/services/estimateService')) return { callEstimate: estimateCall, prepareEstimatePhoto: () => { throw Error('No native photo work in this suite.'); }, downloadEstimatePdf: async () => {} };
    if (name.endsWith('/utils/estimateDraft')) return compile('utils/estimateDraft.js');
    if (name.endsWith('/components/TimeSelect')) return { __esModule: true, default: props => React.createElement('input', { 'aria-label': props.label, value: props.value, onChange: event => props.onChange(event.target.value) }) };
    if (name.endsWith('/components/AddressValidationNotice')) return { __esModule: true, default: Notice };
    if (name.endsWith('/components/ServicePropertyEligibility')) return { __esModule: true, default: props => { env.property = props; return React.createElement('section', null, React.createElement('input', { 'aria-label': 'Service property address', value: props.value.address, disabled: !!(props.disabled || props.fixedProperty), onChange: event => { if (!props.disabled && !props.fixedProperty) props.onChange({ ...props.value, address: event.target.value, exceptionId: null, confirmed: false }); } }), React.createElement(Notice, { validation: props.validation, disabled: !!(props.disabled || props.fixedProperty), onAccept: address => props.onChange({ ...props.value, address, exceptionId: null, confirmed: false }) })); } };
    throw Error('Unexpected dependency ' + name);
  };
  new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src', relative), 'utf8'), { loader: relative.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs' }).code)(React, mock, module, module.exports);
  cache.set(relative, module.exports); return module.exports;
}
Notice = compile('components/AddressValidationNotice.jsx').default;
const Page = compile('pages/EstimatesPage.jsx').default;
const text = () => JSON.stringify(tree.toJSON());
const button = label => tree.root.findAll(node => node.type === 'button' && node.children.join('') === label)[0];
const click = async label => { assert.ok(button(label), label); await act(async () => button(label).props.onClick()); await act(settle); };
const property = () => tree.root.findAll(node => node.type === 'input' && node.props['aria-label'] === 'Service property address')[0];
const changeProperty = async value => act(async () => property().props.onChange({ target: { value } }));
const open = async () => { await act(async () => { tree = create(React.createElement(Page)); }); await act(settle); await click('Open estimate'); };
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });

for (const company of [true, false]) test(`a ${company ? 'company' : 'solo'} estimate correction is editable after definite rejection and saves only after explicit retry`, async () => {
  reset({ company }); await open(); await changeProperty('Unconfirmed service property'); env.failures.save = rejection(suggestion);
  await click('Save estimate version'); assert.ok(button('Use suggested address')); assert.equal(property().props.disabled, false); assert.match(text(), /Estimate work photo 1/);
  const first = env.calls.find(call => call.action === 'save').data;
  await click('Use suggested address'); assert.equal(property().props.value, suggestion.suggestedAddress); assert.equal(env.calls.filter(call => call.action === 'save').length, 1); assert.equal(button('Use suggested address'), undefined);
  delete env.failures.save; await click('Save estimate version'); const saves = env.calls.filter(call => call.action === 'save');
  assert.equal(saves.length, 2); assert.notEqual(saves[1].data.operationId, first.operationId); assert.deepEqual(saves[1].data.data.serviceProperty, { address: suggestion.suggestedAddress }); assert.equal(saves[1].data.data.serviceAreaExceptionId, null); assert.equal(env.record.photoIds[0], 'photo-1');
});

test('an uncertain estimate network outcome retains its exact request and blocks editing', async () => {
  reset(); await open(); await changeProperty('An explicit property awaiting save'); env.failures.save = new Error('Network response unavailable.');
  await click('Save estimate version'); const first = env.calls.find(call => call.action === 'save').data; assert.ok(button('Retry saved request')); assert.equal(property().props.disabled, true); assert.equal(button('Use suggested address'), undefined);
  await changeProperty('Must not replace the uncertain request'); assert.equal(property().props.value, 'An explicit property awaiting save');
  delete env.failures.save; await click('Retry saved request'); const saves = env.calls.filter(call => call.action === 'save'); assert.deepEqual(saves[1].data, first);
});

test('a definite service-area rejection keeps the estimate editable without reusing its rejected operation', async () => {
  reset(); await open(); await changeProperty('Property outside configured coverage');
  env.failures.save = Object.assign(new Error('The service property is outside the configured service area.'), { code: 'functions/failed-precondition', details: { serviceArea: { status: 'outside', reason: 'outside-radius' } } });
  await click('Save estimate version'); const first = env.calls.find(call => call.action === 'save').data;
  assert.equal(property().props.disabled, false); assert.ok(button('Save estimate version')); assert.equal(button('Retry saved request'), undefined); assert.equal(button('Use suggested address'), undefined); assert.match(text(), /outside the configured service area/); assert.match(text(), /Estimate work photo 1/);
  await changeProperty('Corrected property inside configured coverage'); delete env.failures.save; await click('Save estimate version');
  const saves = env.calls.filter(call => call.action === 'save'); assert.equal(saves.length, 2); assert.notEqual(saves[1].data.operationId, first.operationId); assert.deepEqual(saves[1].data.data.serviceProperty, { address: 'Corrected property inside configured coverage' }); assert.equal(env.record.photoIds[0], 'photo-1');
});

for (const company of [true, false]) test(`a corrected ${company ? 'company' : 'solo'} conversion cannot rewrite the approved service property`, async () => {
  reset({ company, status: 'approved' }); await open(); const original = JSON.stringify(env.record.serviceProperty);
  const date = tree.root.findAll(node => node.type === 'input' && node.props.type === 'date')[0]; await act(async () => date.props.onChange({ target: { value: '2030-01-02' } }));
  env.failures.convert = rejection(suggestion); await click('Convert approved estimate to job'); await click('Confirm job conversion');
  assert.equal(property().props.disabled, true); assert.equal(property().props.value, 'Original recorded property'); assert.match(text(), /correct the address, and obtain approval before converting/);
  const accept = button('Use suggested address'); if (company) { assert.equal(accept.props.disabled, true); await act(async () => accept.props.onClick()); } else assert.equal(accept, undefined);
  assert.equal(JSON.stringify(env.record.serviceProperty), original); assert.equal(env.calls.filter(call => call.action === 'convert').length, 1); assert.equal(env.calls.some(call => call.action === 'save'), false);
});

test('manual estimate address changes remove stale validation notices without losing other draft input', async () => {
  reset(); await open(); await changeProperty('First draft property'); env.failures.save = rejection({ status: 'unavailable', message: 'Google verification is temporarily unavailable.' });
  await click('Save estimate version'); assert.match(text(), /Address check unavailable/); assert.equal(property().props.disabled, false);
  await changeProperty('Another explicit property'); assert.doesNotMatch(text(), /Address check unavailable/); assert.match(text(), /Synthetic property estimate/); assert.equal(env.calls.filter(call => call.action === 'save').length, 1);
});
