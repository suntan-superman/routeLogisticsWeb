const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
const {createWorkspaceQueryMock,selectControlMock}=require('./support/workspaceQueryMock.cjs');
const workspaceHooks=createWorkspaceQueryMock(React,{scopeId:'test-workspace'});
global.IS_REACT_ACT_ENVIRONMENT = true;
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const roster = { technicians: [{ id: 'owner', name: 'Company owner', role: 'owner' }, { id: 'tech-1', name: 'Technician One', role: 'technician' }, { id: 'tech-2', name: 'Technician Two', role: 'technician' }, { id: 'manager', name: 'Active manager', role: 'manager' }, { id: 'inactive', name: 'Inactive excluded', role: 'technician', status: 'inactive' }], timeZone: 'America/Los_Angeles', workWindow: { start: '08:00', end: '18:00', days: [0, 1, 2, 3, 4, 5, 6], source: 'default' } };
const available = { available: true, reason: 'No scheduled work overlaps this appointment.', conflicts: [], alternatives: [] };
const conflict = { available: false, reason: 'Scheduled work overlaps this appointment.', conflicts: [{ jobId: 'private-job-id', date: '2030-01-07', time: '09:00', endTime: '10:00', customerName: 'PRIVATE CUSTOMER', price: 12345 }], alternatives: [{ date: '2030-01-07', time: '10:00' }] };
let tree, props, env;
const cache = new Map();
function compile(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const module = { exports: {} };
  const mock = name => {
    if (name === 'react') return React;
    if(name.endsWith('/useWorkspaceQuery'))return workspaceHooks;
    if(name.endsWith('/SelectControl'))return{__esModule:true,default:selectControlMock(React)};
    if(name.endsWith('/workspaceQueryPolicy'))return{workspaceAccessError:error=>['permission-denied','unauthenticated','not-found','workspace-changed'].includes(String(error?.code||'').split('/').pop())};
    if (name.endsWith('/workspaceApi')) return { callWorkspace: async (name, data) => { env.calls.push({ name, data }); return env.handler(name, data); } };
    if (name === './ThemedSelect') return { __esModule: true, default: value => React.createElement('label', null, value.label, React.createElement('select', { 'aria-label': value.label, disabled: value.disabled, value: value.value, onChange: event => value.onChange(event.target.value) }, value.options.map(option => React.createElement('option', { key: option.value, value: option.value, disabled: option.disabled }, option.label)))) };
    if (name.startsWith('.')) { const file = path.resolve(path.dirname(path.resolve(__dirname, '../routeLogisticsWeb/src', relative)), name); return compile(path.relative(path.resolve(__dirname, '../routeLogisticsWeb/src'), path.extname(file) ? file : fs.existsSync(file + '.jsx') ? file + '.jsx' : file + '.js')); }
    throw Error('Unexpected dependency ' + name);
  };
  new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src', relative), 'utf8'), { loader: relative.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs' }).code)(React, mock, module, module.exports);
  cache.set(relative, module.exports); return module.exports;
}
const Panel = compile('components/TechnicianAvailability.jsx').default;
const { schedulingFingerprint } = compile('services/schedulingService.js');
const base = { companyId: 'company-a', memberId: 'tech-1', date: '2030-01-07', time: '09:00', estimatedDuration: '1', jobId: 'editing-job' };
const textOf = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : (node?.children || []).map(textOf).join('');
const text = () => textOf(tree.toJSON());
const select = () => tree.root.findByProps({ 'aria-label': 'Assigned technician' });
const button = label => tree.root.findAll(node => node.type === 'button' && (node.children.join('') === label || node.props['aria-label'] === label))[0];
const alternativeButtons = () => tree.root.findAll(node => node.type === 'button' && node.children.join('').startsWith('Use '));
const click = async label => { assert.ok(button(label), label); await act(async () => button(label).props.onClick()); await act(settle); };
function reset(handler) { env = { calls: [], members: [], alternatives: [], handler: handler || ((_name, data) => data.action === 'roster' ? roster : available) }; }
async function render(overrides = {}) {
  props = { ...base, onMemberChange: id => env.members.push(id), onSelectAlternative: slot => env.alternatives.push(slot), ...overrides };
  await act(async () => { tree = create(React.createElement(Panel, props)); }); await act(settle);
}
async function update(changes) { props = { ...props, ...changes }; await act(async () => tree.update(React.createElement(Panel, props))); await act(settle); }
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });

test('roster and automatic preflight use authorized endpoint payloads and only show active technicians, managers and owner', async () => {
  reset(); await render({ estimatedDuration: '1.5' });
  assert.deepEqual(env.calls.map(call => call.name), ['rlCheckAvailability', 'rlCheckAvailability']);
  assert.deepEqual(env.calls[0].data, { action: 'roster', companyId: 'company-a' });
  assert.deepEqual(env.calls[1].data, { action: 'check', companyId: 'company-a', memberId: 'tech-1', date: base.date, time: base.time, estimatedDuration: 1.5, jobId: base.jobId });
  assert.deepEqual(tree.root.findAllByType('option').map(option => option.children.join('')), ['Unassigned', 'Company owner', 'Technician One', 'Technician Two', 'Active manager']);
  assert.match(text(), /Available for this appointment/); assert.match(text(), /Checks scheduled work; travel time is not included/); assert.doesNotMatch(text(), /on-duty|GPS|unavailable because/i);
  assert.doesNotMatch(text(), /Alternative search window/, 'Secondary search details remain hidden until a conflict');
  await act(async () => select().props.onChange({ target: { value: 'tech-2' } })); assert.deepEqual(env.members, ['tech-2']);
  assert.equal(env.calls.length, 2, 'Selecting a technician only asks the parent to update its draft');
});

test('matching technician names remain distinguishable by email while selections retain membership IDs', async () => {
  const people = [
    { id: 'luis-one', name: 'Luis Gonzales', email: 'tech3@example.test', role: 'technician' },
    { id: 'luis-two', name: 'Luis Gonzales', email: 'other-tech@example.test', role: 'technician' },
    { id: 'manager', name: 'Acme manager', email: 'manager@example.test', role: 'manager' },
  ];
  reset((_name, data) => data.action === 'roster' ? { technicians: people } : available);
  await render({ memberId: '' });
  assert.deepEqual(tree.root.findAllByType('option').map(option => option.children.join('')), ['Unassigned', 'Luis Gonzales · tech3@example.test', 'Luis Gonzales · other-tech@example.test', 'Acme manager · manager@example.test']);
  await act(async () => select().props.onChange({ target: { value: 'luis-two' } }));
  assert.deepEqual(env.members, ['luis-two']);
  await update({ memberId: 'luis-two' });
  assert.equal(env.calls.at(-1).data.memberId, 'luis-two');
});

test('missing names fall back to email without repeating it and retain that identity after roster refresh', async () => {
  let attempts = 0;
  reset((_name, data) => data.action === 'roster' ? { technicians: ++attempts === 1 ? [
    { id: 'tech-1', email: 'tech-one@example.test', role: 'technician' },
    { id: 'tech-2', name: 'tech-two@example.test', email: 'tech-two@example.test', role: 'technician' },
  ] : [] } : available);
  await render();
  assert.deepEqual(tree.root.findAllByType('option').map(option => option.children.join('')), ['Unassigned', 'tech-one@example.test', 'tech-two@example.test']);
  await click('Refresh technicians');
  const previous = tree.root.findAllByType('option').find(option => option.props.value === 'tech-1');
  assert.equal(previous.props.disabled, true);
  assert.match(previous.children.join(''), /tech-one@example\.test.*unavailable/);
  assert.equal(select().props.value, 'tech-1');
  assert.deepEqual(env.members, []);
});

test('office-only staff are not offered for new assignments and saved office-only assignments retain their identity', async () => {
  reset((_name, data) => data.action === 'roster' ? { technicians: [
    { id: 'owner', name: 'Office owner', role: 'owner', fieldWorkEnabled: false },
    { id: 'tech-1', name: 'Office manager', email: 'office@example.test', role: 'manager', availability: { fieldWorkEnabled: false } },
    { id: 'tech-2', name: 'Field manager', role: 'manager', fieldWorkEnabled: true },
  ] } : available);
  await render({ memberId: '' });
  assert.deepEqual(tree.root.findAllByType('option').map(option => option.props.value), ['', 'tech-2']);
  await act(async () => select().props.onChange({ target: { value: 'tech-1' } }));
  assert.deepEqual(env.members, []);
  await update({ memberId: 'tech-1' });
  const previous = tree.root.findAllByType('option').find(option => option.props.value === 'tech-1');
  assert.equal(previous.props.disabled, true);
  assert.match(previous.children.join(''), /Office manager · office@example\.test \(office only\)/);
  assert.match(text(), /Existing appointments remain assigned/);
  assert.equal(env.calls.filter(call => call.data.action === 'check').length, 0);
});

test('unassigned and solo owner flows keep assignment explicit without inventing schedule checks', async () => {
  reset(); await render({ companyId: null, memberId: '' });
  assert.deepEqual(env.calls.map(call => call.data.action), ['roster']); assert.equal(env.calls[0].data.companyId, null);
  assert.equal(select().props.value, ''); assert.match(text(), /Unassigned appointments can be assigned later/);
  await act(async () => select().props.onChange({ target: { value: 'owner' } })); assert.deepEqual(env.members, ['owner']);
  await update({ memberId: 'owner' }); assert.equal(env.calls.at(-1).data.memberId, 'owner'); assert.equal(env.calls.at(-1).data.companyId, null);
});

test('conflicts expose schedule times without customer or financial data and alternatives only fill the draft', async () => {
  reset((_name, data) => data.action === 'roster' ? roster : conflict); await render();
  assert.match(text(), /Scheduled appointment/); assert.match(text(), /9:00 AM–10:00 AM/); assert.doesNotMatch(text(), /PRIVATE CUSTOMER|12345|private-job-id/);
  assert.equal(alternativeButtons().length, 1); assert.equal(alternativeButtons()[0].props.type, 'button');
  await act(async () => alternativeButtons()[0].props.onClick());
  assert.deepEqual(env.alternatives, [{ date: '2030-01-07', time: '10:00' }]); assert.equal(env.calls.length, 2);
  assert.ok(env.calls.every(call => call.data.action === 'roster' || call.data.action === 'check'));
  await update(env.alternatives[0]); assert.equal(env.calls.at(-1).data.time, '10:00');
});

test('alternative dates honor weekday and parent recurrence restrictions and display the configured search window', async () => {
  reset((_name, data) => data.action === 'roster' ? roster : { ...conflict, workWindow: { start: '07:00', end: '19:00', days: [1, 3], source: 'company' }, alternatives: [{ date: '2030-01-07', time: '10:00' }, { date: '2030-01-08', time: '10:00' }, { date: '2030-01-14', time: '11:00' }] });
  await render({ allowedWeekdays: [1], isAlternativeAllowed: slot => slot.date === '2030-01-14' });
  assert.deepEqual(env.calls.at(-1).data.allowedWeekdays, [1]); assert.equal(alternativeButtons().length, 1); assert.match(text(), /7:00 AM–7:00 PM/);
  await act(async () => alternativeButtons()[0].props.onClick()); assert.deepEqual(env.alternatives, [{ date: '2030-01-14', time: '11:00' }]);
});

test('a preference-only editor keeps conflict feedback without offering alternative buttons that cannot change its date', async () => {
  reset((_name, data) => data.action === 'roster' ? roster : conflict); await render({ onSelectAlternative: undefined });
  assert.match(text(), /Scheduled work overlaps/); assert.equal(alternativeButtons().length, 0); assert.doesNotMatch(text(), /Choosing an alternative fills/);
});

test('stale preflight responses cannot replace a newer selected time', async () => {
  const first = deferred(), second = deferred(); reset((_name, data) => data.action === 'roster' ? roster : data.time === '09:00' ? first.promise : second.promise);
  await render(); assert.match(text(), /Checking scheduled work/); await update({ time: '10:00' });
  await act(async () => second.resolve(available)); await act(settle); assert.match(text(), /Available for this appointment/);
  await act(async () => first.resolve({ ...conflict, reason: 'STALE CONFLICT' })); await act(settle);
  assert.doesNotMatch(text(), /STALE CONFLICT/); assert.equal(alternativeButtons().length, 0); assert.equal(env.calls.filter(call => call.data.action === 'check').length, 2);
});

test('service-plan identity is forwarded for exclusion and changing plans invalidates an older response', async () => {
  const first = deferred(), second = deferred();
  reset((_name, data) => data.action === 'roster' ? roster : data.servicePlanId === 'plan-a' ? first.promise : second.promise);
  await render({ servicePlanId: 'plan-a' }); assert.equal(env.calls.at(-1).data.servicePlanId, 'plan-a');
  const original = schedulingFingerprint({ ...base, servicePlanId: 'plan-a' });
  await update({ servicePlanId: 'plan-b' }); assert.equal(env.calls.at(-1).data.servicePlanId, 'plan-b'); assert.match(text(), /Checking scheduled work/);
  assert.notEqual(schedulingFingerprint({ ...base, servicePlanId: 'plan-b' }), original);
  await act(async () => second.resolve(available)); await act(settle);
  await act(async () => first.resolve({ ...conflict, reason: 'STALE PLAN CONFLICT' })); await act(settle);
  assert.match(text(), /Available for this appointment/); assert.doesNotMatch(text(), /STALE PLAN CONFLICT/); assert.equal(alternativeButtons().length, 0);
});

test('roster changes ignore a previous tenant response and never clear the selected member', async () => {
  const first = deferred(), second = deferred(); reset((_name, data) => data.action === 'check' ? available : data.companyId === 'company-a' ? first.promise : second.promise);
  await render(); assert.match(text(), /Loading technicians/); await update({ companyId: 'company-b', memberId: 'new-tech' });
  await act(async () => second.resolve({ technicians: [{ id: 'new-tech', name: 'Current tenant technician', role: 'technician' }] })); await act(settle);
  await act(async () => first.resolve({ technicians: [{ id: 'old-tech', name: 'OLD TENANT NAME', role: 'technician' }] })); await act(settle);
  assert.equal(select().props.value, 'new-tech'); assert.match(text(), /Current tenant technician/); assert.doesNotMatch(text(), /OLD TENANT NAME/); assert.equal(env.members.length, 0);
  assert.ok(env.calls.filter(call => call.data.action === 'check').every(call => call.data.companyId === 'company-b'));
});

test('roster and preflight failures provide explicit retries while retaining the draft', async () => {
  let rosterAttempts = 0, checkAttempts = 0;
  reset((_name, data) => { if (data.action === 'roster') { if (++rosterAttempts === 1) throw Error('Team access is unavailable.'); return roster; } if (++checkAttempts === 1) throw Error('Schedule read is unavailable.'); return available; });
  await render(); assert.match(text(), /Team access is unavailable/); assert.equal(select().props.value, 'tech-1');
  await click('Retry technicians'); assert.match(text(), /Schedule read is unavailable/); assert.equal(select().props.value, 'tech-1');
  await click('Retry availability'); assert.match(text(), /Available for this appointment/); assert.deepEqual(env.members, []); assert.deepEqual(env.alternatives, []);
});

test('orphaned saved assignments retain their label but cannot be chosen as active staff', async () => {
  reset((_name, data) => data.action === 'roster' ? { technicians: [roster.technicians[0]] } : available);
  await render({ memberId: 'former-tech', memberName: 'Former technician' });
  assert.equal(select().props.value, 'former-tech'); const legacy = tree.root.findAllByType('option').find(option => option.props.value === 'former-tech');
  assert.equal(legacy.props.disabled, true); assert.match(legacy.children.join(''), /Former technician.*unavailable/); assert.match(text(), /saved assignment is no longer available/);
  assert.equal(env.calls.filter(call => call.data.action === 'check').length, 0);
  await act(async () => select().props.onChange({ target: { value: 'former-tech' } })); assert.deepEqual(env.members, []);
  await act(async () => select().props.onChange({ target: { value: '' } })); assert.deepEqual(env.members, ['']);
});

test('background roster refresh preserves the editor and then marks an offboarded member unavailable', async () => {
  let attempts = 0; const refresh = deferred();
  reset((_name, data) => data.action === 'check' ? available : ++attempts === 1 ? roster : refresh.promise);
  await render(); await click('Refresh technicians'); assert.equal(select().props.value, 'tech-1'); assert.equal(select().props.disabled, false); assert.match(text(), /Technician One/);
  await act(async () => refresh.resolve({ technicians: [roster.technicians[0]] })); await act(settle);
  assert.equal(select().props.value, 'tech-1'); assert.match(text(), /Technician One.*unavailable/); assert.match(text(), /saved assignment is no longer available/);
  assert.deepEqual(env.members, []); assert.equal(env.calls.filter(call => call.data.action === 'check').length, 1);
});

test('only a Save conflict matching the current draft fingerprint can override preflight', async () => {
  reset(); await render();
  await update({ schedulingError: { fingerprint: schedulingFingerprint(base), result: { ...conflict, reason: 'Changed during Save.' } } }); assert.match(text(), /Changed during Save/);
  await update({ time: '10:00' }); assert.doesNotMatch(text(), /Changed during Save/); assert.match(text(), /Available for this appointment/);
});

test('disabled controls cannot change the parent draft or trigger a preflight', async () => {
  reset(); await render({ disabled: true, schedulingError: { fingerprint: schedulingFingerprint(base), result: conflict } });
  assert.equal(select().props.disabled, true); assert.equal(env.calls.filter(call => call.data.action === 'check').length, 0);
  await act(async () => select().props.onChange({ target: { value: 'tech-2' } })); assert.deepEqual(env.members, []);
  assert.equal(alternativeButtons()[0].props.disabled, true); await act(async () => alternativeButtons()[0].props.onClick()); assert.deepEqual(env.alternatives, []);
});

test('unmounting while a schedule request is pending leaves no late draft callbacks', async () => {
  const pending = deferred(); reset((_name, data) => data.action === 'roster' ? roster : pending.promise); await render();
  await act(async () => tree.unmount()); tree = null;
  await act(async () => pending.resolve(conflict)); await act(settle); assert.deepEqual(env.members, []); assert.deepEqual(env.alternatives, []); assert.equal(env.calls.length, 2);
});
