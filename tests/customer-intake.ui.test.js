const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
const { createWorkspaceQueryMock, selectControlMock } = require('./support/workspaceQueryMock.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, env, hooks, cache;
const customer = { id: 'customer-one', name: 'Existing customer', email: 'existing@example.test', address: 'Billing address', isActive: true };
const property = { id: 'rental-property', label: 'rental', address: '200 Service Road', unit: 'B', accessInstructions: 'Use side entrance', isPrimary: false, serviceCategory: 'Pest Control', serviceAreaExceptionId: 'prior-owner-approval' };
const text = node => typeof node === 'string' ? node : (Array.isArray(node) ? node : node?.children || []).map(text).join('');
const content = () => text(tree.toJSON());
const button = label => tree.root.findAll(node => node.type === 'button' && text(node).trim() === label)[0];
const control = label => tree.root.findAll(node => typeof node.type === 'string' && node.props['aria-label'] === label)[0];
const click = async label => { assert.ok(button(label), label); await act(async () => button(label).props.onClick()); };
const change = async (label, value) => { assert.ok(control(label), label); await act(async () => control(label).props.onChange({ target: { value, checked: value } })); };
const submit = async () => act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
async function rpc(name, data) {
  env.calls.push({ name, ...data });
  if (name === 'rlGetRoutingTeam') return { team: [{ id: 'manager-one', name: 'Field manager' }] };
  if (name === 'rlServiceAreas') {
    if (data.action === 'status') return { settings: { configured: true, revision: 1, allowOutOfAreaRequests: true }, canApproveExceptions: true, availableCategories: ['Pest Control', 'Pool Cleaning'] };
    if (data.action === 'check') return { eligible: false, status: 'outside', message: 'This property needs an owner exception.' };
    if (data.action === 'approveException') return { exceptionId: 'approved-property-exception', result: { eligible: true, status: 'exception-approved' } };
  }
  assert.equal(name, 'rlManageInquiry');
  if (data.action === 'list') return { inquiries: env.inquiries };
  if (data.action === 'matches') return { matches: env.matches };
  if (data.action === 'properties') return { properties: [property], customerVersion: 'customer-v1', customerLifecycle: env.lifecycle };
  if (env.pending) await env.pending;
  if (env.failure) throw env.failure;
  if (data.action === 'create') {
    const contact = data.customerId ? customer : { id: 'new-prospect', ...data.customer, lifecycle: 'prospect' };
    const savedProperty = data.propertyId ? property : { id: 'new-property', ...data.property };
    const inquiry = { id: 'inquiry-one', revision: 1, customerId: contact.id, customerName: contact.name, servicePropertyId: savedProperty.id, propertySnapshot: savedProperty, ...data.inquiry };
    env.inquiries = [inquiry]; return { customer: contact, property: savedProperty, inquiry };
  }
  if (data.action === 'update') return { inquiry: { ...env.inquiries[0], ...data.changes, revision: 2 } };
  if (data.action === 'saveProperty') return { property: { ...property, ...data.property }, properties: [{ ...property, ...data.property }], customerVersion: 'customer-v2' };
  if (data.action === 'lifecycle') { env.lifecycle = data.lifecycle; return { customer: { ...customer, lifecycle: data.lifecycle }, customerVersion: 'customer-v2' }; }
  throw Error('Unexpected action ' + data.action);
}
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const file = path.resolve(__dirname, '../routeLogisticsWeb/src', relative), module = { exports: {} };
  const importer = name => {
    if (name === 'react') return React;
    if (name === 'react-router-dom') return { useNavigate: () => destination => env.navigation.push(destination) };
    if (name === 'react-hot-toast') { const toast = message => env.toasts.push(message); toast.success = toast; toast.error = toast; return { __esModule: true, default: toast }; }
    if (name.endsWith('/SelectControl')) return { __esModule: true, default: selectControlMock(React) };
    if (name.endsWith('/useWorkspaceQuery')) return hooks;
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ company: env.company, can: () => env.manage }) };
    if (name.endsWith('/useUnsavedChanges')) return { useUnsavedChanges: () => ({ confirmDiscard: async () => env.discard }), useConfirmUnsavedChanges: () => async () => env.discard };
    if (name.endsWith('/workspaceQueryPolicy')) return { workspaceAccessError: error => error?.code === 'permission-denied' };
    if (name.endsWith('/workspaceApi')) return { callWorkspace: rpc };
    if (name.endsWith('/customerService')) return { __esModule: true, default: { getCustomer: async () => ({ success: true, customer }) } };
    if (name.endsWith('/JobFormModal')) return { __esModule: true, default: props => { env.schedule = props; return React.createElement('aside', null, 'Estimate scheduler'); } };
    if (name.startsWith('.')) { const next = path.resolve(path.dirname(file), name); return load(path.relative(path.resolve(__dirname, '../routeLogisticsWeb/src'), path.extname(next) ? next : fs.existsSync(next + '.jsx') ? next + '.jsx' : next + '.js')); }
    throw Error('Unexpected intake dependency ' + name);
  };
  new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs' }).code)(React, importer, module, module.exports);
  cache.set(relative, module.exports); return module.exports;
}
async function mount(relative = 'components/InquiryWorkspace.jsx', props = { customers: [customer] }) { const Component = load(relative).default; await act(async () => { tree = create(React.createElement(Component, props)); }); }
async function openExisting() { await mount(); await click('New Inquiry'); await change('Find existing customer', 'Existing'); await click('Find matching customers'); await click('Use this customer'); await change('Saved service property', property.id); await change('Inquiry service requested', 'Termite inspection'); }
async function newProspect() { await mount(); await click('New Inquiry'); await change('Find existing customer', 'Synthetic prospect'); await click('Find matching customers'); await click('None of these — create a new prospect'); await change('Inquiry property address', property.address); await change('Inquiry service requested', 'Initial inspection'); }
beforeEach(() => {
  env = { calls: [], inquiries: [], matches: [{ customer, matchReasons: ['name'] }], toasts: [], navigation: [], lifecycle: 'active', manage: true, company: { id: 'company-one', serviceCategories: ['Pest Control'] }, discard: true };
  const memory = new Map(); global.localStorage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
  global.window = new EventTarget(); global.document = { body: { style: { overflow: '' } } }; hooks = createWorkspaceQueryMock(React, { scopeId: 'owner-company-one' }); cache = new Map();
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; delete global.window; delete global.document; delete global.localStorage; });

test('existing identity and selected rental property survive inquiry save and estimate scheduling handoff', async () => {
  await openExisting(); assert.equal(control('Find existing customer'), undefined); assert.match(content(), /Using existing customer:.*Existing customer/); assert.ok(button('Choose a different customer or prospect')); await change('Inquiry notes', 'Ask about treatment options'); await change('Inquiry follow-up staff', 'manager-one'); await submit();
  const created = env.calls.find(row => row.action === 'create'); assert.equal(created.customerId, customer.id); assert.equal(created.propertyId, property.id); assert.equal(Object.hasOwn(created, 'customer'), false); assert.equal(created.inquiry.followUpMemberId, 'manager-one');
  assert.match(content(), /Inquiry saved/); await click('Schedule Estimate');
  assert.equal(env.schedule.defaults.customerId, customer.id); assert.equal(env.schedule.defaults.servicePropertyId, property.id); assert.equal(env.schedule.defaults.address, property.address); assert.equal(env.schedule.defaults.appointmentKind, 'estimate_visit'); assert.equal(env.schedule.defaults.totalCost, '0'); assert.equal(env.schedule.defaults.notes, 'Ask about treatment options'); assert.doesNotMatch(env.schedule.defaults.notes, /side entrance/); assert.match(env.schedule.defaults.operationId, /^[a-f0-9-]{36}$/i);
  assert.equal(env.schedule.defaults.serviceAreaExceptionId, 'prior-owner-approval'); assert.equal(env.schedule.defaults.serviceCategory, 'Pest Control');
});
test('a new prospective customer can be started without performing an existing-customer search', async () => {
  await mount(); await click('New Inquiry'); await click('Create inquiry for a new prospect'); assert.equal(control('Find existing customer'), undefined); assert.ok(control('Prospect name')); assert.ok(button('Choose a different customer or prospect'));
  await change('Prospect name', 'Direct prospect'); await change('Inquiry property address', property.address); await change('Inquiry service requested', 'New service request'); await submit(); const request = env.calls.find(row => row.action === 'create'); assert.equal(request.customer.name, 'Direct prospect'); assert.equal(request.property.address, property.address); assert.match(content(), /Inquiry saved/);
});
test('new prospect creation requires an explicit separate-contact decision when duplicate matches exist', async () => {
  await newProspect(); assert.equal(button('Save inquiry').props.disabled, false); await submit(); assert.equal(env.calls.filter(row => row.action === 'create').length, 0); assert.match(content(), /Possible matching customers were found/); await change('Create separate prospect despite matches', true); await change('Separate customer reason', 'Separate renter at the same property'); await submit();
  const request = env.calls.find(row => row.action === 'create'); assert.equal(request.duplicateDecision, 'separate'); assert.equal(request.duplicateReason, 'Separate renter at the same property'); assert.equal(request.customer.name, 'Synthetic prospect'); assert.equal(request.property.address, property.address); assert.match(content(), /Inquiry saved/);
});
test('new prospect save remains actionable and explains every missing required field', async () => {
  env.matches = []; await mount(); await click('New Inquiry'); await click('Create inquiry for a new prospect'); await change('Prospect name', 'Homeowner prospect'); await change('Inquiry property address', property.address);
  assert.equal(button('Save inquiry').props.disabled, false); assert.match(content(), /Before saving:.*Describe the service the homeowner is requesting/); await submit(); assert.equal(env.calls.filter(row => row.action === 'create').length, 0); assert.match(content(), /Describe the service the homeowner is requesting/);
  await change('Inquiry service requested', 'Homeowner pest-control estimate'); await submit(); assert.equal(env.calls.filter(row => row.action === 'create').length, 1); assert.match(content(), /Inquiry saved/);
});
test('new inquiry draft is written synchronously and restores after closing and remounting', async () => {
  env.matches = []; await newProspect(); await change('Inquiry notes', 'Retain this unfinished phone inquiry'); const saved = load('services/inquiryService.js').readInquiryDraft('owner-company-one'); assert.equal(saved.notes, 'Retain this unfinished phone inquiry');
  await act(async () => tree.unmount()); tree = null; await mount(); await click('New Inquiry'); assert.equal(control('Inquiry notes').props.value, saved.notes); assert.equal(control('Inquiry property address').props.value, property.address); assert.equal(load('services/inquiryService.js').readInquiryDraft('different-company'), null);
});
test('failed inquiry saves preserve fields and operation identity and show feedback at the submit controls', async () => {
  await openExisting(); env.failure = Error('The inquiry could not be saved. Retry safely.'); await submit(); const first = env.calls.find(row => row.action === 'create');
  assert.match(content(), /Retry safely/); assert.equal(control('Inquiry service requested').props.value, 'Termite inspection'); assert.ok(env.toasts.some(value => /Retry safely/.test(value)));
  env.failure = null; await submit(); const requests = env.calls.filter(row => row.action === 'create'); assert.equal(requests.length, 2); assert.equal(requests[1].operationId, first.operationId); assert.equal(load('services/inquiryService.js').readInquiryDraft('owner-company-one'), null);
});
test('duplicate submit taps cannot create a second in-flight inquiry request', async () => {
  await openExisting(); let release; env.pending = new Promise(resolve => { release = resolve; }); let work; await act(async () => { work = tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.equal(env.calls.filter(row => row.action === 'create').length, 1); assert.equal(button('Saving inquiry…').props.disabled, true); await act(async () => { env.pending = null; release(); await work; }); assert.match(content(), /Inquiry saved/);
});
test('service property edits require explicit address unlocking and retain a stale-version conflict for retry', async () => {
  await mount('components/ServicePropertyDirectory.jsx', { customerId: customer.id, value: property.id }); await click('Edit selected property'); assert.equal(control('Property address').props.disabled, true); await click('Enable Editing'); await change('Property address', '300 Updated Service Road'); env.failure = Error('The customer changed. Refresh before saving.'); await click('Save service property');
  const request = env.calls.find(row => row.action === 'saveProperty'); assert.equal(request.expectedVersion, 'customer-v1'); assert.equal(request.propertyId, property.id); assert.equal(request.property.address, '300 Updated Service Road'); assert.equal(control('Property address').props.value, '300 Updated Service Road'); assert.match(content(), /Refresh before saving/);
});
test('directory refresh preserves a recorded property selection and does not silently select a primary location', async () => {
  const selected = [], onSelect = value => selected.push(value); await mount('components/ServicePropertyDirectory.jsx', { customerId: customer.id, value: '', onSelect }); assert.equal(control('Saved service property').props.value, ''); assert.equal(selected.length, 0); await change('Saved service property', property.id); assert.equal(selected[0].id, property.id); const Directory = load('components/ServicePropertyDirectory.jsx').default; await act(async () => tree.update(React.createElement(Directory, { customerId: customer.id, value: property.id, onSelect }))); assert.match(content(), /Use side entrance/);
});
test('explicit lifecycle changes are separate from archive status and preserve the customer identity', async () => {
  const api = load('services/inquiryService.js'); assert.equal(api.customerLifecycle({ isActive: false }), 'active'); assert.equal(api.customerLifecycle({ lifecycle: 'prospect', isActive: true }), 'prospect');
  await mount('components/CustomerLifecycleControl.jsx', { customer }); await click('Change lifecycle'); assert.equal(button('Save lifecycle').props.disabled, true); await change('Customer lifecycle', 'prospect'); await click('Save lifecycle'); const request = env.calls.find(row => row.action === 'lifecycle'); assert.equal(request.customerId, customer.id); assert.equal(request.expectedVersion, 'customer-v1'); assert.equal(request.lifecycle, 'prospect'); assert.match(content(), /Customer lifecycle: prospect/); assert.match(env.toasts.join(' '), /lifecycle saved/);
});
test('technicians cannot open intake controls or read company inquiry queues', async () => {
  env.manage = false; await mount(); assert.equal(tree.toJSON(), null); assert.equal(env.calls.length, 0);
});
test('independent owners retain inquiry access without a company object', async () => {
  env.company = null; await mount(); assert.ok(button('New Inquiry')); assert.equal(env.calls.filter(row => row.action === 'list').length, 1);
});
test('updating an already linked inquiry does not patch its immutable service-property association', async () => {
  env.inquiries = [{ id: 'inquiry-linked', revision: 4, customerId: customer.id, customerName: customer.name, servicePropertyId: property.id, propertySnapshot: property, serviceRequested: 'Inspection', status: 'estimate_scheduled', appointmentId: 'estimate-visit' }]; await mount(); await click('Review inquiry'); assert.equal(control('Saved service property').props.disabled, true); await change('Inquiry notes', 'Owner called back'); await submit(); const request = env.calls.find(row => row.action === 'update'); assert.equal(request.expectedRevision, 4); assert.equal(Object.hasOwn(request.changes, 'servicePropertyId'), false); assert.equal(request.changes.notes, 'Owner called back');
});

test('new inquiry reuses owner coverage approval and sends the selected category and exception without extra property fields', async () => {
  env.matches = []; await newProspect(); await change('Inquiry service category', 'Pest Control'); assert.equal(env.calls.some(row => row.name === 'rlServiceAreas'), false, 'Collapsed optional coverage does not initiate a Maps check.');
  await click('Check coverage / owner exception'); await click('Check service property'); assert.match(content(), /Property is outside coverage/); await change('Out-of-area approval reason', 'Owner approves this synthetic service property.'); await click('Approve this out-of-area property'); await submit();
  const request = env.calls.find(row => row.action === 'create'); assert.equal(request.serviceAreaExceptionId, 'approved-property-exception'); assert.equal(request.serviceCategory, 'Pest Control'); assert.equal(request.inquiry.serviceCategory, 'Pest Control'); assert.equal(Object.hasOwn(request.property, 'exceptionId'), false); assert.match(content(), /Inquiry saved/);
});

test('property editor forwards owner-approved coverage and clears that exception when its address changes', async () => {
  await mount('components/ServicePropertyDirectory.jsx', { customerId: customer.id, value: property.id }); await click('Edit selected property'); await click('Check coverage / owner exception'); await change('Service property category', 'Pool Cleaning'); await click('Check service property'); await change('Out-of-area approval reason', 'Owner approves this synthetic rental property.'); await click('Approve this out-of-area property'); env.failure = Error('The property was not saved. Retry safely.'); await click('Save service property');
  const first = env.calls.find(row => row.action === 'saveProperty'); assert.equal(first.serviceCategory, 'Pool Cleaning'); assert.equal(first.serviceAreaExceptionId, 'approved-property-exception'); assert.equal(Object.hasOwn(first.property, 'serviceCategory'), false); assert.equal(Object.hasOwn(first.property, 'exceptionId'), false);
  await click('Enable Editing'); await change('Property address', '300 Changed Property Road'); await click('Save service property'); const requests = env.calls.filter(row => row.action === 'saveProperty'); assert.equal(requests[1].serviceAreaExceptionId, null); assert.equal(requests[1].serviceCategory, 'Pool Cleaning'); assert.equal(requests[1].property.address, '300 Changed Property Road'); assert.equal(requests[1].operationId, first.operationId);
});
