import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClockTime, isQuarterHour, QUARTER_HOUR_OPTIONS, quarterHourOptions } from './quarterHours.js';

test('the full day contains exactly 96 unique quarter-hour choices', () => {
  assert.equal(QUARTER_HOUR_OPTIONS.length, 96);
  assert.equal(new Set(QUARTER_HOUR_OPTIONS.map(option => option.value)).size, 96);
  assert.equal(QUARTER_HOUR_OPTIONS[0].value, '00:00');
  assert.equal(QUARTER_HOUR_OPTIONS.at(-1).value, '23:45');
  assert.ok(QUARTER_HOUR_OPTIONS.every(option => isQuarterHour(option.value) && !option.disabled));
});

test('support labels distinguish midnight, noon, and afternoon without timezone conversion', () => {
  assert.equal(formatClockTime('00:00'), '12:00 AM');
  assert.equal(formatClockTime('09:15'), '9:15 AM');
  assert.equal(formatClockTime('12:00'), '12:00 PM');
  assert.equal(formatClockTime('23:45'), '11:45 PM');
  for (const value of ['09:07', '12:01', '24:00', '9:15', '', undefined]) assert.equal(isQuarterHour(value), false);
});

test('recorded off-quarter times remain visible but cannot be chosen as a new value', () => {
  const current = '09:07', options = quarterHourOptions(current), legacy = options.find(option => option.value === current);
  assert.equal(options.length, 97);
  assert.deepEqual(legacy, { value: current, label: '9:07 AM (current recorded time)', disabled: true });
  assert.ok(options.filter(option => !option.disabled).every(option => isQuarterHour(option.value)));
  assert.equal(options[options.indexOf(legacy) + 1].value, '09:15');
  assert.equal(QUARTER_HOUR_OPTIONS.length, 96);
  assert.equal(quarterHourOptions('09:15'), QUARTER_HOUR_OPTIONS);
  assert.equal(quarterHourOptions(''), QUARTER_HOUR_OPTIONS);
});

test('unknown legacy text is preserved as a disabled recorded value rather than rounded or discarded', () => {
  const legacy = quarterHourOptions('legacy time').find(option => option.disabled);
  assert.equal(legacy.value, 'legacy time');
  assert.equal(legacy.label, 'legacy time (current recorded time)');
});
