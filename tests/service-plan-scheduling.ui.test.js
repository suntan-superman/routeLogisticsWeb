const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
const {createWorkspaceQueryMock,selectControlMock}=require('./support/workspaceQueryMock.cjs');
const workspaceHooks=createWorkspaceQueryMock(React,{scopeId:'test-workspace'});
global.IS_REACT_ACT_ENVIRONMENT = true;
global.window = { addEventListener() {}, removeEventListener() {} };
let tree, env;
const settle = () => new Promise(resolve => setImmediate(resolve));
const text = value => value === null || value === undefined ? '' : typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join('') : text(value.children);
const toast = message => env.toasts.push(message); toast.success = toast; toast.error = toast;
const frequencies = [[7, 'Weekly'], [14, 'Every 2 weeks'], [30, 'Monthly'], [60, 'Every 2 months'], [90, 'Quarterly'], [180, 'Every 6 months'], [365, 'Annually']].map(([days, label]) => ({ days, label }));
const originalPlan = () => ({ id: 'plan', customerId: 'customer', customerName: 'Synthetic customer', serviceType: 'Inspection', active: true, nextServiceDate: '2030-01-03', time: '09:15', estimatedDuration: 1.5, price: 95, frequencyDays: 7, recurrence: { version: 1, frequency: 'weekly', interval: 1, weekday: 4, anchorDate: '2030-01-03' }, preferredTechnicianId: 'tech1', assignmentFallback: 'unassigned', updatedAt: '2026-11-15T00:00:00Z' });
function reset() { env = { plans: [], creates: [], updates: [], toasts: [], manage: true, dirty: false, confirmation: true, confirmCalls: 0, response: { success: true }, panel: null, rpc: [] }; }
const cache = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '../routeLogisticsWeb/src', relative); if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const mock = name => {
    if (name === 'react') return React;
    if(name.endsWith('/useWorkspaceQuery'))return workspaceHooks;
    if(name.endsWith('/SelectControl'))return{__esModule:true,default:selectControlMock(React)};
    if(name.endsWith('/workspaceQueryPolicy'))return{workspaceAccessError:error=>['permission-denied','unauthenticated','not-found','workspace-changed'].includes(String(error?.code||'').split('/').pop())};
    if (name === 'react-hot-toast') return { __esModule: true, default: toast };
    if (name.endsWith('/contexts/AuthContext')) return { useAuth: () => ({ company: { id: 'company', timeZone: 'America/Los_Angeles' }, currentUser: { uid: 'owner' } }) };
    if (name.endsWith('/services/tenancy')) return { canManage: () => env.manage, scopeWhere: () => [] };
    if (name.endsWith('/hooks/useUnsavedChanges')) return { useUnsavedChanges: dirty => { env.dirty = dirty; return { confirmDiscard: async () => { env.confirmCalls++; return env.confirmation; } }; } };
    if (name.endsWith('/components/ConfirmProvider')) return { useConfirm: () => async () => true };
    if (name.endsWith('/services/customerService')) return { __esModule: true, default: { getCustomers: async () => ({ success: true, customers: [{ id: 'customer', name: 'Synthetic customer' }] }) } };
    if (name.endsWith('/services/servicePlanService')) return { FREQUENCIES: frequencies, listServicePlans: async () => ({ success: true, plans: env.plans }), createServicePlan: async data => { env.creates.push(data); return env.response; }, updateServicePlan: async (...args) => { env.updates.push(args); return env.response; }, deleteServicePlan: async () => ({ success: true }), generateNextJob: async () => ({ success: true }) };
    if (name.endsWith('/services/serviceLogService')) return { listServiceLogs: async () => ({ success: true, logs: [] }), logsToCsv: () => '' };
    if (name.endsWith('/services/schedulingService')) return { schedulingFingerprint: value => JSON.stringify(value) };
    if (name.endsWith('/components/TechnicianAvailability')) return { __esModule: true, default: props => { env.panel = props; return React.createElement('section', { 'aria-label': 'Mock technician availability' }, React.createElement('select', { 'aria-label': 'Preferred technician', value: props.memberId || '', disabled: props.disabled, onChange: event => props.onMemberChange(event.target.value) }, ...['', 'tech1', 'tech2'].map(id => React.createElement('option', { key: id, value: id }, id || 'Unassigned')))); } };
    if (name.endsWith('/components/ServicePropertyEligibility')) return { __esModule: true, default: props => { React.useEffect(() => { props.onPolicyLoaded?.({ settings: { configured: false } }); }, [props.onPolicyLoaded]); return React.createElement('section', { 'aria-label': 'Mock service property' }); } };
    if (name.endsWith('/components/AddressValidationNotice')) return { __esModule: true, default: () => null };
    if (name.endsWith('/components/TimeSelect')) return { __esModule: true, default: props => React.createElement('input', { 'aria-label': props.label, value: props.value, onChange: event => props.onChange(event.target.value) }) };
    if (name.startsWith('.')) { const resolved = path.resolve(path.dirname(file), name); return load(path.relative(path.resolve(__dirname, '../routeLogisticsWeb/src'), path.extname(resolved) ? resolved : resolved + '.js')); }
    throw Error(`Unexpected dependency ${name}`);
  };
  const code = transformSync(fs.readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs', jsx: 'transform' }).code;
  new Function('require', 'module', 'exports', code)(mock, module, module.exports); cache.set(file, module.exports); return module.exports;
}
const button = label => tree.root.findAll(node => node.type === 'button' && text(node) === label)[0];
const input = label => tree.root.findAll(node => typeof node.type === 'string' && node.props['aria-label'] === label)[0];
const dialog = () => tree.root.findAll(node => node.type === 'form' && node.props.role === 'dialog')[0];
async function click(label) { await act(async () => button(label).props.onClick()); await settle(); }
async function change(label, value) { await act(async () => input(label).props.onChange({ target: { value } })); await settle(); }
async function render() { cache.clear(); const Page = load('pages/ServicePlansPage.jsx').default; await act(async () => { tree = create(React.createElement(Page)); await settle(); }); }
async function createDraft(days = 30, date = '2030-01-03') {
  await click('New plan'); await change('Service plan customer', 'customer'); await change('Service plan frequency', String(days));
  const dateInput = tree.root.findAll(node => node.type === 'input' && node.props.type === 'date')[0]; await act(async () => dateInput.props.onChange({ target: { value: date } })); await settle();
}
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });

test('all newly created service-plan frequencies use calendar rules, including biweekly, bimonthly and annual intervals', async () => {
  for (const [days, frequency, interval] of [[7, 'weekly', 1], [14, 'weekly', 2], [30, 'monthly', 1], [60, 'monthly', 2], [90, 'quarterly', 1], [180, 'monthly', 6], [365, 'monthly', 12]]) {
    reset(); await render(); await createDraft(days);
    const form = tree.root.findAll(node => node.type === 'form' && !node.props.role)[0]; await act(async () => form.props.onSubmit({ preventDefault() {} })); await settle();
    assert.equal(env.creates.length, 1); assert.equal(env.creates[0].recurrence.frequency, frequency); assert.equal(env.creates[0].recurrence.interval, interval); assert.equal(env.creates[0].recurrence.anchorDate, '2030-01-03');
    assert.equal(env.creates[0].preferredTechnicianId, null); assert.equal(env.creates[0].assignmentFallback, 'unassigned');
    await act(async () => tree.unmount()); tree = null;
  }
});
test('new plans support last-weekday patterns, explicit automatic replacement and a selected duration/technician', async () => {
  reset(); await render(); await createDraft(30, '2030-01-31'); await change('Service plan monthly pattern', 'weekday'); await change('Service plan duration', '1.5'); await change('Preferred technician', 'tech2'); await change('Service plan technician fallback', 'auto');
  const form = tree.root.findAll(node => node.type === 'form')[0]; await act(async () => form.props.onSubmit({ preventDefault() {} })); await settle();
  assert.deepEqual(env.creates[0].recurrence, { version: 1, frequency: 'monthly', interval: 1, anchorDate: '2030-01-31', monthlyMode: 'weekday', weekday: 4, ordinal: -1 });
  assert.equal(env.creates[0].preferredTechnicianId, 'tech2'); assert.equal(env.creates[0].assignmentFallback, 'auto'); assert.equal(env.creates[0].estimatedDuration, 1.5);
});
test('existing legacy plans retain exact day intervals while calendar plans and assignment review hints are readable', async () => {
  reset(); env.plans = [{ ...originalPlan(), id: 'legacy', recurrence: undefined, frequencyDays: 30 }, { ...originalPlan(), id: 'calendar', preferredTechnicianNeedsReview: true, preferredTechnicianReview: 'Select a new preferred technician.' }];
  const before = JSON.parse(JSON.stringify(env.plans)); await render(); const content = text(tree.toJSON());
  assert.match(content, /Every 30 days \(fixed interval\)/); assert.match(content, /Every Thursday/); assert.match(content, /Select a new preferred technician/); assert.deepEqual(JSON.parse(JSON.stringify(env.plans)), before); assert.equal(env.updates.length, 0);
});
test('preference saving is enabled only for changes and sends the captured version without rewriting appointments', async () => {
  reset(); env.plans = [originalPlan()]; await render(); await click('Technician preference');
  assert.equal(button('Save technician preference').props.disabled, true); assert.equal(env.panel.servicePlanId, 'plan'); assert.equal(env.panel.onSelectAlternative, undefined);
  await change('Preferred technician', 'tech2'); await change('Technician preference fallback', 'auto'); assert.equal(env.dirty, true); assert.equal(button('Save technician preference').props.disabled, false);
  env.plans = [{ ...originalPlan(), updatedAt: '2026-11-16T00:00:00Z' }];
  await act(async () => dialog().props.onSubmit({ preventDefault() {} })); await settle();
  assert.deepEqual(env.updates, [['plan', { preferredTechnicianId: 'tech2', assignmentFallback: 'auto' }, '2026-11-15T00:00:00Z']]); assert.equal(dialog(), undefined); assert.ok(env.toasts.includes('Technician preference saved'));
});
test('discarding changed preferences requires confirmation and denied discard keeps the chosen technician', async () => {
  reset(); env.plans = [originalPlan()]; await render(); await click('Technician preference'); await change('Preferred technician', 'tech2'); env.confirmation = false;
  await click('Cancel'); assert.ok(dialog()); assert.equal(input('Preferred technician').props.value, 'tech2'); assert.equal(env.confirmCalls, 1);
  env.confirmation = true; await click('Cancel'); assert.equal(dialog(), undefined); assert.equal(env.updates.length, 0);
});
test('preference conflicts retain the selected draft, expose real scheduling feedback and permit retry', async () => {
  reset(); env.plans = [originalPlan()]; env.response = { success: false, error: 'The technician has another visit.', details: { scheduling: { available: false, reason: 'The technician has another visit.', conflicts: [] } } }; await render(); await click('Technician preference'); await change('Preferred technician', 'tech2');
  await act(async () => dialog().props.onSubmit({ preventDefault() {} })); await settle();
  assert.ok(dialog()); assert.equal(input('Preferred technician').props.value, 'tech2'); assert.equal(env.panel.schedulingError.result.reason, 'The technician has another visit.'); assert.match(text(tree.toJSON()), /The technician has another visit/); assert.equal(button('Save technician preference').props.disabled, false);
  env.response = { success: true }; await act(async () => dialog().props.onSubmit({ preventDefault() {} })); await settle(); assert.equal(dialog(), undefined);
});
test('ordinary unauthorized viewers receive no plan or technician-preference mutation actions', async () => {
  reset(); env.manage = false; env.plans = [originalPlan()]; await render(); assert.equal(button('New plan'), undefined); assert.equal(button('Technician preference'), undefined); assert.equal(env.updates.length, 0);
});
