const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
global.IS_REACT_ACT_ENVIRONMENT = true;
const listeners = new Set();
global.window = { addEventListener: (_name, handler) => listeners.add(handler), removeEventListener: (_name, handler) => listeners.delete(handler) };
global.document = { addEventListener: (_name, handler) => listeners.add(handler), removeEventListener: (_name, handler) => listeners.delete(handler) };
const customer = { id: 'customer', name: 'Synthetic customer', phone: '555-0100', address: '100 Saved Street, Example, CA 93312', updatedAt: '2026-11-15T00:00:00.000Z' };
const company = { id: 'company', ownerId: 'owner', serviceCategories: ['Pest Control'] };
const roster = { technicians: [{ id: 'owner', name: 'Company owner', role: 'owner' }, { id: 'tech-1', name: 'Technician One', role: 'technician' }, { id: 'tech-2', name: 'Technician Two', role: 'technician' }], timeZone: 'America/Los_Angeles' };
const available = { available: true, reason: 'This scheduled time is free.', conflicts: [], alternatives: [] };
const conflict = { available: false, reason: 'The technician already has work at this time.', conflicts: [{ jobId: 'other-job', date: '2030-01-10', time: '09:00', endTime: '10:00' }], alternatives: [{ date: '2030-01-11', time: '10:15' }] };
let tree, props, env;
const settle = () => new Promise(resolve => setImmediate(resolve));
const cache = new Map();
function compile(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const module = { exports: {} };
  const mock = name => {
    if (name === 'react') return React;
    if (name === 'react-hot-toast') { const toast = message => env.toasts.push(message); toast.success = toast; toast.error = toast; return { __esModule: true, default: toast }; }
    if (name === 'firebase/firestore') return new Proxy({}, { get: () => () => { throw Error('Scheduling must use the authorized callable, not direct Firestore writes.'); } });
    if (name.endsWith('/firebase')) return { auth: { currentUser: { uid: 'owner', displayName: 'Synthetic owner', email: 'owner@example.test' } }, db: {} };
    if (name.endsWith('/tenancy')) return { requireCapability: capability => env.capabilities.push(capability), getClaims: () => ({ companyId: company.id, role: 'owner' }), can: () => true };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ currentUser: { uid: 'owner' }, company, role: 'owner', can: () => true }) };
    if (name.endsWith('/useUnsavedChanges')) return { useUnsavedChanges: dirty => { env.dirty = dirty; return { confirmDiscard: async () => true }; } };
    if (name.endsWith('/workspaceApi')) return {
      callWorkspace: async (name, data) => {
        env.calls.push({ name, data });
        if (name === 'rlCheckAvailability') return data.action === 'roster' ? roster : env.availability;
        if (name === 'rlServiceAreas' && data.action === 'status') return { settings: { configured: false, revision: 1 } };
        if (name !== 'rlManageJob') throw Error('Unexpected scheduling operation ' + name);
        if (env.saveFailure) throw env.saveFailure;
        const id = data.id || 'created-job';
        env.saved.set(id, { ...(env.saved.get(id) || {}), ...data.job, id });
        return { id, ...(data.saveCustomerAddress ? { customerAddressUpdated: true } : {}), ...(data.recurring ? { servicePlanId: 'created-plan' } : {}) };
      },
      readWorkspace: async (resource, data) => {
        env.reads.push({ resource, data });
        if (resource !== 'jobs') throw Error('Unexpected workspace read');
        return { job: env.saved.get(data.id), customer: { ...customer } };
      },
    };
    if (name.startsWith('.')) { const file = path.resolve(path.dirname(path.resolve(__dirname, '../routeLogisticsWeb/src', relative)), name); return compile(path.relative(path.resolve(__dirname, '../routeLogisticsWeb/src'), path.extname(file) ? file : fs.existsSync(file + '.jsx') ? file + '.jsx' : file + '.js')); }
    throw Error('Unexpected dependency ' + name);
  };
  new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src', relative), 'utf8'), { loader: relative.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs' }).code)(React, mock, module, module.exports);
  cache.set(relative, module.exports); return module.exports;
}
const JobForm = compile('components/JobFormModal.jsx').default;
const textOf = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : (node?.children || []).map(textOf).join('');
const text = () => textOf(tree.toJSON());
const button = label => tree.root.findAll(node => node.type === 'button' && textOf(node).trim() === label)[0];
const input = label => tree.root.findAll(node => node.type === 'input' && node.props['aria-label'] === label)[0];
const select = label => tree.root.findAll(node => node.type === 'select' && node.props['aria-label'] === label)[0];
const writes = () => env.calls.filter(call => call.name === 'rlManageJob');
const click = async label => { assert.ok(button(label), label); await act(async () => button(label).props.onClick()); await act(settle); };
const choose = async (label, value) => { assert.ok(select(label), label); await act(async () => select(label).props.onChange({ target: { value } })); await act(settle); };
async function chooseCombobox(label, optionName) {
  const control = input(label); assert.ok(control, label); await act(async () => control.props.onClick());
  const option = tree.root.findAll(node => node.type === 'li' && node.props.role === 'option' && textOf(node).replace('✓', '').trim() === optionName)[0];
  assert.ok(option, optionName); await act(async () => option.props.onClick()); await act(settle);
}
async function render(overrides = {}) {
  env = { calls: [], reads: [], capabilities: [], toasts: [], created: [], saved: new Map(), availability: available, saveFailure: null, dirty: false };
  props = { customers: [customer], defaults: { customerId: customer.id, serviceType: 'Pest Control', date: '2030-01-10' }, onClose() {}, onCreated: (...args) => env.created.push(args), ...overrides };
  if (props.job) env.saved.set(props.job.id, props.job);
  await act(async () => { tree = create(React.createElement(JobForm, props)); }); await act(settle);
}
const submit = async () => { await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} })); await act(settle); };
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; assert.equal(listeners.size, 0); });

test('one-time scheduling sends the selected technician in the same create request', async () => {
  await render(); assert.equal(input('Assigned technician').props.value, '');
  await chooseCombobox('Assigned technician', 'Technician One'); assert.match(text(), /Available for this appointment/); assert.equal(writes().length, 0);
  await submit(); assert.equal(writes().length, 1); assert.equal(writes()[0].data.action, 'create'); assert.equal(writes()[0].data.job.assignedTo, 'tech-1');
  assert.equal(writes()[0].data.recurring, undefined); assert.equal(env.created.length, 1);
  assert.ok(env.calls.filter(call => call.name === 'rlManageJob').every(call => call.data.action !== 'assign'));
});

test('a Save conflict retains the draft and choosing an alternative changes date/time without saving', async () => {
  await render(); await chooseCombobox('Assigned technician', 'Technician One');
  const notes = () => tree.root.findByProps({ placeholder: 'Gate code, pets, areas of concern…' });
  await act(async () => notes().props.onChange({ target: { value: 'Retain the access instructions.' } }));
  env.saveFailure = Object.assign(new Error('Schedule changed before Save.'), { code: 'functions/failed-precondition', details: { scheduling: conflict } });
  await submit(); assert.equal(writes().length, 1); assert.equal(env.created.length, 0); assert.equal(notes().props.value, 'Retain the access instructions.'); assert.match(text(), /technician already has work/);
  const alternative = tree.root.findAll(node => node.type === 'button' && textOf(node).startsWith('Use Fri, Jan 11 at'))[0]; assert.ok(alternative);
  await act(async () => alternative.props.onClick()); await act(settle);
  assert.equal(tree.root.findAll(node => node.type === 'input' && node.props.type === 'date')[0].props.value, '2030-01-11'); assert.equal(input('Start time').props.value, '10:15 AM');
  assert.equal(writes().length, 1); assert.equal(env.created.length, 0); assert.doesNotMatch(text(), /technician already has work/); assert.equal(notes().props.value, 'Retain the access instructions.');
  env.saveFailure = null; await submit(); assert.equal(writes().length, 2); assert.equal(writes()[1].data.job.date, '2030-01-11'); assert.equal(writes()[1].data.job.time, '10:15');
});

for (const frequency of ['weekly', 'monthly', 'quarterly']) test(`${frequency} recurrence preview and saved rule derive their weekday from the first date`, async () => {
  await render(); await choose('Appointment type', 'recurring');
  if (frequency !== 'weekly') { await choose('Repeat frequency', frequency); await choose('Monthly repeat pattern', 'weekday'); }
  assert.match(text(), frequency === 'weekly' ? /Every Thursday/ : frequency === 'monthly' ? /Every month on the second Thursday/ : /Every 3 months on the second Thursday/);
  const date = () => tree.root.findAll(node => node.type === 'input' && node.props.type === 'date')[0];
  await act(async () => date().props.onChange({ target: { value: '2030-01-17' } })); await act(settle);
  assert.match(text(), frequency === 'weekly' ? /Every Thursday/ : /third Thursday/);
  await submit(); const rule = writes()[0].data.recurring.recurrence;
  assert.equal(rule.frequency, frequency); assert.equal(rule.weekday, 4); assert.equal(rule.anchorDate, '2030-01-17');
  if (frequency !== 'weekly') assert.equal(rule.ordinal, 3);
});

test('monthly day-of-month preview explains shorter-month handling and saves the selected calendar day', async () => {
  await render({ defaults: { customerId: customer.id, serviceType: 'Pest Control', date: '2030-01-31' } });
  await choose('Appointment type', 'recurring'); await choose('Repeat frequency', 'monthly');
  assert.match(text(), /Every month on day 31.*last day in shorter months/);
  await submit(); assert.deepEqual(writes()[0].data.recurring.recurrence, { version: 1, frequency: 'monthly', interval: 1, anchorDate: '2030-01-31', monthlyMode: 'dayOfMonth', dayOfMonth: 31 });
});

test('editing an existing recurring visit changes only that visit and cannot rewrite its plan', async () => {
  const job = { id: 'existing-job', customerId: customer.id, customerName: customer.name, serviceType: 'Pest Control', date: '2030-01-10', time: '09:00', estimatedDuration: 1, assignedTo: 'tech-1', assignedToName: 'Technician One', address: customer.address, servicePlanId: 'retained-plan', priority: 'medium', notes: '', totalCost: 0, updatedAt: 'original-version' };
  await render({ job }); assert.equal(!!select('Appointment type'), false); assert.match(text(), /Changes here apply to this visit only/);
  await chooseCombobox('Assigned technician', 'Technician Two'); await chooseCombobox('Start time', '10:15 AM'); await submit();
  assert.equal(writes().length, 1); const saved = writes()[0].data;
  assert.equal(saved.action, 'update'); assert.equal(saved.id, job.id); assert.equal(saved.expectedVersion, job.updatedAt); assert.equal(saved.job.assignedTo, 'tech-2'); assert.equal(saved.job.time, '10:15');
  assert.equal(saved.recurring, undefined); assert.equal(saved.job.servicePlanId, undefined);
  assert.ok(env.calls.filter(call => !['rlServiceAreas', 'rlCheckAvailability'].includes(call.name)).every(call => call.name === 'rlManageJob'));
  assert.ok(env.calls.filter(call => call.name === 'rlCheckAvailability' && call.data.action === 'check').every(call => call.data.jobId === job.id));
});

test('recurring retry reuses its operation ID and preserves explicit permanent-address and technician options', async () => {
  await render(); await chooseCombobox('Assigned technician', 'Technician One'); await choose('Appointment type', 'recurring'); await choose('Repeat frequency', 'quarterly'); await choose('Monthly repeat pattern', 'weekday'); await choose('Recurring technician fallback', 'auto');
  await click('Enable Editing'); await act(async () => input('Service property address').props.onChange({ target: { value: '200 Corrected Street, Example, CA 93312' } }));
  const permanent = tree.root.findAll(node => node.type === 'input' && node.props['aria-label'] === "Update customer's saved address")[0]; assert.equal(permanent.props.checked, false); await act(async () => permanent.props.onChange({ target: { checked: true } }));
  env.saveFailure = new Error('The response was unavailable.'); await submit(); assert.equal(writes().length, 1); const first = writes()[0].data;
  assert.match(first.operationId, /^[a-f0-9-]{36}$/); assert.equal(first.saveCustomerAddress, true); assert.equal(first.expectedCustomerVersion, customer.updatedAt); assert.equal(first.job.assignedTo, 'tech-1');
  assert.equal(first.recurring.preferredTechnicianId, 'tech-1'); assert.equal(first.recurring.assignmentFallback, 'auto'); assert.equal(first.recurring.recurrence.frequency, 'quarterly');
  assert.deepEqual(first.job.serviceProperty, { address: '200 Corrected Street, Example, CA 93312' }); assert.equal(first.job.saveCustomerAddress, undefined); assert.equal(first.job.expectedCustomerVersion, undefined);
  assert.equal(env.created.length, 0); env.saveFailure = null; await submit(); assert.equal(writes().length, 2); assert.deepEqual(writes()[1].data, first); assert.equal(env.created.length, 1);
  assert.match(env.toasts.join(' '), /Recurring appointment and customer address saved/);
});
