const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, calls, toasts, dirty, handler, props, refreshed;
const moduleUnderTest = { exports: {} };
const requireMock = name => {
  if (name === 'react') return React;
  if (name === 'react-hot-toast') return { __esModule: true, default: { success: message => toasts.push(['success', message]), error: message => toasts.push(['error', message]) } };
  if (name.endsWith('/workspaceApi')) return { callWorkspace: (name, data) => { calls.push({ name, data }); return handler(name, data); } };
  if (name.endsWith('/useUnsavedChanges')) return { useUnsavedChanges: value => { dirty = value; } };
  if (name === './TimeSelect') return { __esModule: true, default: p => React.createElement('input', { 'aria-label': p.label, value: p.value, onChange: event => p.onChange(event.target.value) }) };
  throw Error('Unexpected dependency: ' + name);
};
const source = fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src/components/StaffAvailabilityEditor.jsx'), 'utf8');
new Function('React', 'require', 'module', 'exports', transformSync(source, { loader: 'jsx', format: 'cjs' }).code)(React, requireMock, moduleUnderTest, moduleUnderTest.exports);
const Editor = moduleUnderTest.exports.default;
const text = () => JSON.stringify(tree.toJSON());
const button = label => tree.root.findAll(node => node.type === 'button' && node.children.includes(label))[0];
const change = async (label, value) => act(async () => tree.root.findByProps({ 'aria-label': label }).props.onChange({ target: { value } }));
const click = async label => { assert.ok(button(label), label); await act(async () => button(label).props.onClick()); };
async function render(overrides = {}) {
  calls = []; toasts = []; dirty = false; refreshed = 0; handler = async () => ({ success: true });
  props = { companyId: 'company-a', member: { memberId: 'tech-a', name: 'Technician A', availability: { revision: 3, scheduled: 1 } }, allowed: true, onChanged: async () => { refreshed++; }, ...overrides };
  await act(async () => { tree = create(React.createElement(Editor, props)); });
}
async function dates() { await change('Availability from date', '2030-06-10'); await change('From time', '09:00'); await change('Availability until date', '2030-06-10'); await change('Until time', '17:00'); }
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });

test('only explicitly authorized tenant staff have an editor and no mutations happen on opening', async () => {
  await render({ allowed: false }); assert.equal(tree.toJSON(), null); assert.equal(calls.length, 0);
  await act(async () => tree.update(React.createElement(Editor, { ...props, allowed: true })));
  await click('Change availability'); assert.match(text(), /Temporary staff status/); assert.equal(calls.length, 0);
});
test('sick leave saves bounded full instants through the authorized API without membership or shift mutations', async () => {
  await render(); await click('Change availability'); await dates(); assert.equal(dirty, true);
  await click('Save availability');
  assert.equal(calls.length, 1); assert.equal(calls[0].name, 'rlManageStaffAvailability');
  assert.equal(calls[0].data.memberId, 'tech-a'); assert.equal(calls[0].data.status, 'unavailable'); assert.equal(calls[0].data.reason, 'sick');
  assert.equal(calls[0].data.expectedRevision, 3); assert.ok(Date.parse(calls[0].data.endsAt) > Date.parse(calls[0].data.startsAt));
  assert.equal('uid' in calls[0].data, false); assert.equal('trackingConsent' in calls[0].data, false); assert.equal('role' in calls[0].data, false);
  assert.equal(refreshed, 1); assert.equal(dirty, false); assert.match(text(), /Staff availability saved/); assert.equal(toasts[0][0], 'success');
});
test('emergency call-out explicitly saves available while preserving independent shift and GPS consent', async () => {
  await render(); await click('Change availability'); await dates(); await change('Temporary staff status', 'emergency'); await click('Save availability');
  assert.equal(calls[0].data.status, 'available'); assert.equal(calls[0].data.reason, 'emergency'); assert.equal(calls.length, 1);
});
test('invalid or reversed dates are actionable and do not reach the server', async () => {
  await render(); await click('Change availability'); await dates(); await change('Until time', '08:45'); await click('Save availability');
  assert.equal(calls.length, 0); assert.match(text(), /end date and time after the start/); assert.equal(dirty, true);
});
test('server conflict/error retains the unsaved draft and allows retry', async () => {
  await render(); await click('Change availability'); await dates(); handler = async () => { throw Error('Availability changed. Refresh before saving.'); };
  await click('Save availability'); assert.match(text(), /Availability changed/); assert.equal(dirty, true); assert.equal(button('Save availability').props.disabled, false);
  handler = async () => ({ success: true }); await click('Save availability'); assert.equal(calls.length, 2); assert.equal(refreshed, 1);
});
test('duplicate taps submit one operation and clear-all uses captured revision without restoring access', async () => {
  await render(); await click('Change availability'); let finish; handler = () => new Promise(resolve => { finish = resolve; });
  await act(async () => { const save = button('Clear all manual availability periods').props.onClick; save(); save(); });
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].data, { memberId: 'tech-a', action: 'clear', expectedRevision: 3 });
  await act(async () => finish({ success: true })); assert.equal(refreshed, 1);
});
test('changing tenant or member closes and resets an old draft without changing either staff record', async () => {
  await render(); await click('Change availability'); await dates(); assert.equal(dirty, true);
  await act(async () => tree.update(React.createElement(Editor, { ...props, companyId: 'company-b', member: { memberId: 'tech-b', name: 'Technician B' } })));
  assert.equal(dirty, false); assert.ok(button('Change availability')); assert.equal(calls.length, 0);
});

test('a saved editor cannot reopen before its roster refresh and revision update finish', async () => {
  let finishRefresh, refreshCount = 0;
  await render({ onChanged: () => ++refreshCount === 1 ? new Promise(resolve => { finishRefresh = resolve; }) : Promise.resolve() });
  await click('Change availability'); await dates();
  await act(async () => { button('Save availability').props.onClick(); });
  assert.match(text(), /Staff availability saved/); assert.equal(button('Change availability').props.disabled, true);
  await act(async () => button('Change availability').props.onClick());
  assert.equal(tree.root.findAllByProps({ 'aria-label': 'Temporary staff status' }).length, 0);
  await act(async () => { tree.update(React.createElement(Editor, { ...props, member: { ...props.member, availability: { revision: 4, scheduled: 2 } } })); finishRefresh(); });
  assert.equal(button('Change availability').props.disabled, false);
  await click('Change availability'); await dates(); await click('Save availability');
  assert.equal(calls[1].data.expectedRevision, 4);
});
