const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), React = require('react');
const { create, act } = require('react-test-renderer'), babel = require('@babel/core');
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, saves, saveOutcome, changes, busyStates, drafts;
const palette = { text: '#142B23', secondary: '#526C60', border: '#DDD', input: '#EEF5F1', accent: '#087B55', glow: '#DEF9EA' };
function panel({ title, subtitle, message, children, ...props }) { return React.createElement('View', props, title && React.createElement('Text', null, title), subtitle && React.createElement('Text', null, subtitle), message && React.createElement('Text', null, message), children); }
function button({ title, onPress, disabled, busy }) { return React.createElement('Pressable', { accessibilityLabel: title, onPress, disabled: disabled || busy }, React.createElement('Text', null, title)); }
function load() {
 const filename = path.resolve(__dirname, '../components/EstimateVisitOutcome.js'), module = { exports: {} };
 const mockRequire = name => {
  if (name.startsWith('@babel/runtime/')) return require(name);
  if (name === 'react') return React;
  if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable' };
  if (name.endsWith('/theme/ThemeProvider')) return { useTheme: () => ({ palette }) };
  if (name === './MobileUI') return { Card: panel, SectionHeader: panel, InlineNotice: panel, PrimaryButton: button, SecondaryButton: button };
  if (name.endsWith('/services/estimateVisitPolicy')) return require('../services/estimateVisitPolicy');
  if (name.endsWith('/services/estimateVisitOperations')) return { saveEstimateVisitOutcome: (...args) => { saves.push(args); return saveOutcome(...args); } };
  throw new Error(`Unexpected dependency ${name}`);
 };
 const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
 new Function('require', 'module', 'exports', code)(mockRequire, module, module.exports); return module.exports.default;
}
const Outcome = load(), job = extra => ({ id: 'estimate-one', appointmentKind: 'estimate_visit', billable: false, companyId: 'acme', assignedTo: 'member', estimateOutcome: 'estimate_pending', status: 'in-progress', inquiryId: 'inquiry-one', updatedAt: '2026-11-16T10:00:00Z', ...extra });
const props = selected => ({ job: selected, onChanged: () => { changes++; }, onBusyChange: value => busyStates.push(value), onDraftChange: value => drafts.push(value) });
const text = () => JSON.stringify(tree.toJSON());
const control = label => tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
async function press(label) { const target = control(label); assert.ok(target, `Expected ${label}`); assert.equal(!!target.props.disabled, false, `${label} is enabled`); await act(async () => target.props.onPress()); }
async function render(selected = job(), extra = {}) { await act(async () => { tree = create(React.createElement(Outcome, { ...props(selected), ...extra })); }); }
beforeEach(() => { tree = null; saves = []; changes = 0; busyStates = []; drafts = []; saveOutcome = async () => ({ operationId: 'outcome-operation', status: 'queued', message: 'Estimate outcome saved on this device — waiting to sync.' }); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });

test('outcome editor is inline, explicit-save only and retains the opening revision across job polling', async () => {
 const original = job(); await render(original); assert.match(text(), /Estimate pending/); assert.match(text(), /nonbillable/); assert.equal(tree.root.findAllByType('Modal').length, 0);
 await press('Record visit outcome'); assert.equal(drafts.at(-1), true); assert.equal(control('Save outcome').props.disabled, true);
 await press('Quote prepared'); await act(async () => tree.update(React.createElement(Outcome, props({ ...original, updatedAt: '2026-11-16T10:15:00Z' }))));
 assert.equal(control('Quote prepared').props.accessibilityState.checked, true); assert.equal(saves.length, 0);
 await press('Save outcome'); assert.equal(saves.length, 1); assert.equal(saves[0][0].updatedAt, original.updatedAt); assert.equal(saves[0][1], 'quote_prepared'); assert.equal(changes, 1); assert.equal(drafts.at(-1), false); assert.equal(busyStates.at(-1), false); assert.match(text(), /saved on this device.*waiting to sync/); assert.equal(control('Save outcome'), undefined);
});

test('outcome save failure retains choice and operation identity for an explicit retry', async () => {
 saveOutcome = async () => { throw Object.assign(new Error('The job changed. Review and retry this saved outcome.'), { operationId: 'saved-outcome-id' }); };
 await render(); await press('Record visit outcome'); await press('Customer declined'); await press('Save outcome');
 assert.match(text(), /job changed/); assert.equal(control('Customer declined').props.accessibilityState.checked, true); assert.equal(drafts.at(-1), true); assert.equal(changes, 0);
 saveOutcome = async () => ({ operationId: 'saved-outcome-id', status: 'synced', message: 'Estimate outcome saved to server.' });
 await press('Retry saved outcome'); assert.equal(saves[1][2].retryOperationId, 'saved-outcome-id'); assert.equal(saves[1][1], 'customer_declined'); assert.match(text(), /saved to server/); assert.equal(changes, 1); assert.equal(drafts.at(-1), false);
});

test('outcome duplicate taps save once and late replies cannot change a newly opened job', async () => {
 let finish; saveOutcome = () => new Promise(resolve => { finish = resolve; }); await render(); await press('Record visit outcome'); await press('Visit completed — quote needed');
 const save = control('Save outcome').props.onPress; let pending;
 await act(async () => { pending = save(); save(); }); assert.equal(saves.length, 1); assert.equal(busyStates.at(-1), true); assert.equal(control('Keep current outcome').props.disabled, true);
 await act(async () => tree.update(React.createElement(Outcome, props(job({ id: 'estimate-two', inquiryId: 'inquiry-two' })))));
 assert.equal(drafts.at(-1), false); assert.equal(busyStates.at(-1), false); assert.match(text(), /inquiry-two/);
 await act(async () => { finish({ message: 'Old outcome saved to server.' }); await pending; }); assert.doesNotMatch(text(), /Old outcome/); assert.equal(changes, 0); assert.ok(control('Record visit outcome'));
});

test('completed estimates can record later quote outcomes without reopening the job and read-only visits cannot save', async () => {
 await render(job({ status: 'completed', estimateOutcome: 'quote_needed' })); await press('Record visit outcome'); assert.equal(control('Estimate pending'), undefined); await press('Quote prepared'); await press('Save outcome'); assert.equal(saves[0][0].status, 'completed'); assert.equal(saves[0][1], 'quote_prepared'); assert.equal(saves[0][2].status, undefined);
 await act(async () => tree.update(React.createElement(Outcome, { ...props(job({ id: 'read-only' })), readOnly: true })));
 assert.equal(control('Record visit outcome'), undefined); assert.equal(saves.length, 1);
});

test('keeping the current outcome explicitly clears the unsaved editor without sending a change', async () => {
 await render(); await press('Record visit outcome'); await press('Canceled / no access'); await press('Keep current outcome'); assert.equal(saves.length, 0); assert.equal(drafts.at(-1), false); assert.match(text(), /Estimate pending/); assert.equal(control('Save outcome'), undefined);
});
