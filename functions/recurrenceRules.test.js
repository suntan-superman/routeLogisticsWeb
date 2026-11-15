const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calendarDate, normalizeRecurrence, nextRecurrenceDate, firstOccurrenceOnOrAfter, frequencyDaysForRule, occurrenceDates } = require('./recurrenceRules');

test('weekly recurrence preserves a selected Thursday and every-two-week cadence across year and DST changes', () => {
  const rule = normalizeRecurrence({ frequency: 'weekly', interval: 2, weekday: 4 }, '2026-12-31');
  assert.equal(nextRecurrenceDate(rule, '2026-12-31'), '2027-01-14');
  assert.equal(nextRecurrenceDate(rule, '2027-03-11'), '2027-03-25');
  assert.equal(nextRecurrenceDate(rule, '2026-12-20'), '2026-12-31');
  assert.equal(frequencyDaysForRule(rule), 14);
  assert.equal(firstOccurrenceOnOrAfter(rule, '2027-01-14'), '2027-01-14');
  assert.equal(firstOccurrenceOnOrAfter(rule, '2027-01-15'), '2027-01-28');
});
test('calendar months clamp short months without drifting from the original day', () => {
  const rule = normalizeRecurrence({ frequency: 'monthly' }, '2027-01-31');
  assert.equal(nextRecurrenceDate(rule, '2027-01-31'), '2027-02-28');
  assert.equal(nextRecurrenceDate(rule, '2027-02-28'), '2027-03-31');
  assert.equal(nextRecurrenceDate(rule, '2027-03-31'), '2027-04-30');
  assert.equal(nextRecurrenceDate(rule, '2028-01-31'), '2028-02-29');
  assert.equal(nextRecurrenceDate(rule, '2028-02-29'), '2028-03-31');
});
test('quarterly recurrence uses calendar months and retains the original day after clamping', () => {
  const rule = normalizeRecurrence({ frequency: 'quarterly' }, '2027-01-31');
  assert.equal(nextRecurrenceDate(rule, '2027-01-31'), '2027-04-30');
  assert.equal(nextRecurrenceDate(rule, '2027-04-30'), '2027-07-31');
  assert.equal(nextRecurrenceDate(rule, '2027-07-31'), '2027-10-31');
  assert.equal(frequencyDaysForRule(rule), 90);
});
test('monthly weekday recurrence follows first Thursday rather than a fixed day count', () => {
  const rule = normalizeRecurrence({ frequency: 'monthly', monthlyMode: 'weekday', ordinal: 1, weekday: 4 }, '2026-11-05');
  assert.equal(nextRecurrenceDate(rule, '2026-11-05'), '2026-12-03');
  assert.equal(nextRecurrenceDate(rule, '2026-12-03'), '2027-01-07');
  assert.equal(firstOccurrenceOnOrAfter(rule, '2026-12-02'), '2026-12-03');
  assert.equal(firstOccurrenceOnOrAfter(rule, '2026-12-03'), '2026-12-03');
});
test('last-weekday recurrence stays last through February and quarterly month changes', () => {
  const rule = normalizeRecurrence({ frequency: 'quarterly', monthlyMode: 'weekday', ordinal: -1, weekday: 4 }, '2026-11-26');
  assert.equal(nextRecurrenceDate(rule, '2026-11-26'), '2027-02-25');
  assert.equal(nextRecurrenceDate(rule, '2027-02-25'), '2027-05-27');
  const fifth = normalizeRecurrence({ frequency: 'monthly', monthlyMode: 'weekday' }, '2026-10-29');
  assert.equal(fifth.ordinal, -1); assert.equal(nextRecurrenceDate(fifth, '2026-10-29'), '2026-11-26');
});
test('recurrence validation rejects impossible dates, mismatched weekdays and forged rules', () => {
  for (const date of ['2026-02-30', '2026-2-01', '', null, '2026-11-05T12:00:00Z']) assert.throws(() => calendarDate(date), { code: 'invalid-argument' });
  for (const input of [null, [], { frequency: 'yearly' }, { version: 2, frequency: 'weekly' }, { frequency: 'weekly', interval: 0 }, { frequency: 'weekly', interval: 1.5 }, { frequency: 'weekly', weekday: 3 }, { frequency: 'monthly', monthlyMode: 'unknown' }, { frequency: 'monthly', monthlyMode: 'weekday', ordinal: 5 }, { frequency: 'monthly', monthlyMode: 'weekday', ordinal: 2 }, { frequency: 'monthly', dayOfMonth: 31 }]) assert.throws(() => normalizeRecurrence(input, '2026-11-05'), { code: 'invalid-argument' });
  const rule = normalizeRecurrence({ frequency: 'weekly', anchorDate: '2000-01-01', companyId: 'foreign' }, '2026-11-05');
  assert.equal(rule.anchorDate, '2026-11-05'); assert.equal(rule.companyId, undefined);
});
test('availability projects only future unmaterialized calendar or legacy occurrences within inclusive bounds', () => {
  const recurrence = normalizeRecurrence({ frequency: 'monthly' }, '2027-01-31');
  assert.deepEqual(occurrenceDates({ active: true, recurrence, nextServiceDate: '2027-02-28' }, '2027-01-01', '2027-04-30'), ['2027-02-28', '2027-03-31', '2027-04-30']);
  assert.deepEqual(occurrenceDates({ active: true, frequencyDays: 30, nextServiceDate: '2027-01-31' }, '2027-02-01', '2027-04-01'), ['2027-03-02', '2027-04-01']);
  assert.deepEqual(occurrenceDates({ active: false }, '2027-01-01', '2027-04-30'), []);
  assert.throws(() => occurrenceDates({ active: true, frequencyDays: 1, nextServiceDate: '2027-01-01' }, '2027-01-01', '2027-01-05', { limit: 3 }), { code: 'failed-precondition' });
});
