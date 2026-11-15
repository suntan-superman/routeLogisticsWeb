import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appointmentRecurrence, describeAppointmentRecurrence, isDateOnAppointmentRecurrence } from './appointmentRecurrence.js';

test('weekly Thursday choices describe and filter alternate dates without changing the draft', () => {
  const rule = appointmentRecurrence({ frequency: 'weekly' }, '2030-01-03');
  assert.equal(describeAppointmentRecurrence(rule), 'Every Thursday');
  assert.equal(isDateOnAppointmentRecurrence(rule, '2030-01-10'), true);
  assert.equal(isDateOnAppointmentRecurrence(rule, '2030-01-04'), false);
  assert.equal(rule.anchorDate, '2030-01-03');
});

test('monthly day and quarterly weekday choices preserve their calendar pattern', () => {
  const month = appointmentRecurrence({ frequency: 'monthly' }, '2032-01-31');
  assert.equal(isDateOnAppointmentRecurrence(month, '2032-02-29'), true);
  assert.equal(isDateOnAppointmentRecurrence(month, '2032-03-31'), true);
  assert.equal(isDateOnAppointmentRecurrence(month, '2032-03-29'), false);
  const quarter = appointmentRecurrence({ frequency: 'quarterly', monthlyMode: 'weekday' }, '2027-02-11');
  assert.equal(describeAppointmentRecurrence(quarter), 'Every 3 months on the second Thursday');
  assert.equal(isDateOnAppointmentRecurrence(quarter, '2027-05-13'), true);
  assert.equal(isDateOnAppointmentRecurrence(quarter, '2027-04-08'), false);
  assert.equal(isDateOnAppointmentRecurrence(quarter, '2027-05-20'), false);
});

test('a fifth weekday uses the last weekday and invalid dates cannot form a recurrence', () => {
  const rule = appointmentRecurrence({ frequency: 'monthly', monthlyMode: 'weekday' }, '2026-10-29');
  assert.equal(describeAppointmentRecurrence(rule), 'Every month on the last Thursday');
  assert.equal(isDateOnAppointmentRecurrence(rule, '2026-11-26'), true);
  assert.equal(appointmentRecurrence({ frequency: 'weekly' }, '2030-02-30'), null);
  assert.equal(appointmentRecurrence(null, '2030-01-03'), null);
});
