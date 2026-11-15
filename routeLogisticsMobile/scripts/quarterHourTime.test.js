const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const React = require('react'), { create, act } = require('react-test-renderer'), babel = require('@babel/core');
const clock = require('../services/quarterHourTime');
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree;
const backListeners = new Set();
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', BackHandler: { addEventListener: (_event, handler) => { backListeners.add(handler); return { remove: () => backListeners.delete(handler) }; } } };
const palette = { text: '#fff', secondary: '#bdd', border: '#375', accent: '#6eb', input: '#123', glow: '#153' };
const file = path.resolve(__dirname, '../components/QuarterHourTimePicker.js');
const moduleValue = { exports: {} };
const transformed = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
new Function('require', 'module', 'exports', transformed)(name => {
  if (name.startsWith('@babel/runtime/')) return require(name);
  if (name === 'react') return React;
  if (name === 'react-native') return native;
  if (name.endsWith('/ThemeProvider')) return { useTheme: () => ({ palette }) };
  if (name === '../services/quarterHourTime') return clock;
  if (name === './Glass') return { GlassCard: ({ children }) => React.createElement('View', null, children), GlassButton: ({ title, accessibilityLabel, disabled, onPress }) => React.createElement('Pressable', { accessibilityLabel: accessibilityLabel || title, disabled: !!disabled, onPress }, React.createElement('Text', null, title)) };
  throw Error('Unexpected time-picker dependency ' + name);
}, moduleValue, moduleValue.exports);
const { QuarterHourPicker, default: TimeField } = moduleValue.exports;
const button = label => tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
async function press(label) { const target = button(label); assert.ok(target, label); assert.notEqual(target.props.disabled, true); await act(async () => target.props.onPress()); }
async function render(Component, props) { await act(async () => { tree = create(React.createElement(Component, props)); }); }
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; assert.equal(backListeners.size, 0); });

test('quarter-hour options cover exactly all 96 wall-clock slots without rollover or rounding', () => {
  assert.deepEqual(clock.QUARTER_MINUTES, [0, 15, 30, 45]);
  const values = new Set();
  for (const period of ['AM', 'PM']) for (let hour = 1; hour <= 12; hour++) for (const minute of clock.QUARTER_MINUTES) {
    const value = clock.quarterHourValue(hour, minute, period); values.add(value);
    assert.equal(clock.isQuarterHourTime(value), true);
    assert.match(value, /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/);
  }
  assert.equal(values.size, 96); assert.ok(values.has('00:00')); assert.ok(values.has('23:45'));
  assert.equal(clock.quarterHourValue(12, 0, 'AM'), '00:00'); assert.equal(clock.quarterHourValue(12, 0, 'PM'), '12:00');
  assert.throws(() => clock.quarterHourValue(9, 7, 'AM')); assert.throws(() => clock.quarterHourValue(24, 0, 'PM'));
});

test('legacy non-quarter and AM/PM values parse without mutating their recorded time', () => {
  assert.deepEqual(clock.parseClockTime('9:07 PM'), { hour: 21, minute: 7, second: 0 });
  assert.equal(clock.timeLabel('09:07'), '9:07 AM'); assert.equal(clock.timeLabel('12:15 AM'), '12:15 AM');
  assert.equal(clock.isQuarterHourTime('09:07'), false); assert.equal(clock.isQuarterHourTime('09:15:37'), false);
  assert.equal(clock.pickerTime('09:07').minute, null); assert.equal(clock.pickerTime('23:45').minute, 45);
  for (const value of ['24:00', '12:60', '0:15 AM', 'invalid', null]) assert.equal(clock.parseClockTime(value), null);
});

test('the rendered picker exposes only four minute choices and commits only when explicitly confirmed', async () => {
  const changes = []; await render(QuarterHourPicker, { value: '09:00', onChange: value => changes.push(value), onCancel() {} });
  const minutes = tree.root.findAll(node => node.type === 'Pressable' && /^Minute /.test(node.props.accessibilityLabel || ''));
  assert.deepEqual(minutes.map(node => node.props.accessibilityLabel), ['Minute 00', 'Minute 15', 'Minute 30', 'Minute 45']);
  assert.equal(tree.root.findAllByType('TextInput').length, 0); assert.equal(tree.root.findAllByType('Modal').length, 0);
  await press('Hour 12'); await press('AM'); await press('Minute 15'); assert.deepEqual(changes, []);
  await press('Use selected time'); assert.deepEqual(changes, ['00:15']);
});

test('opening and cancelling an odd-minute field preserves it; changing it requires a chosen quarter', async () => {
  const changes = []; await render(TimeField, { label: 'Job time', value: '09:07', onChange: value => changes.push(value) });
  await press('Job time'); assert.equal(button('Use selected time').props.disabled, true);
  assert.match(JSON.stringify(tree.toJSON()), /Recorded time:.*09:07/); assert.deepEqual(changes, []);
  await press('Cancel time selection'); assert.deepEqual(changes, []); assert.equal(button('Use selected time'), undefined);
  await press('Job time'); await press('Minute 30'); await press('Use selected time');
  assert.deepEqual(changes, ['09:30']); assert.equal(button('Use selected time'), undefined);
});

test('Android back cancels the inline field picker without altering its selected value', async () => {
  const changes = []; await render(TimeField, { label: 'Job time', value: '14:15', onChange: value => changes.push(value) });
  await press('Job time'); await press('Minute 45'); assert.equal(backListeners.size, 1);
  await act(async () => { assert.equal([...backListeners][0](), true); });
  assert.deepEqual(changes, []); assert.equal(button('Use selected time'), undefined);
});

test('a disabled picker cannot submit a time even if a handler is invoked directly', async () => {
  const changes = []; await render(QuarterHourPicker, { value: '12:45', disabled: true, onChange: value => changes.push(value), onCancel() {} });
  assert.equal(button('Minute 15').props.disabled, true); assert.equal(button('Use selected time').props.disabled, true);
  await act(async () => button('Use selected time').props.onPress()); assert.deepEqual(changes, []);
});
