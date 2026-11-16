const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deriveJobExceptions, DEFAULT_TIME_ZONE } = require('./jobExceptions');
const job = () => ({ id: 'synthetic-job', date: '2026-11-16', time: '09:00', estimatedDuration: 1, status: 'scheduled', assignedTo: 'existing-technician' });
const derive = (value, now, extra = {}) => deriveJobExceptions(value, { now, timeZone: 'America/Los_Angeles', ...extra });

test('potential lateness begins at the default grace boundary without mutating the appointment', () => {
  const value = job(), original = structuredClone(value);
  assert.equal(derive(value, '2026-11-16T17:29:59Z').potentiallyLate, false);
  assert.equal(derive(value, '2026-11-16T17:30:00Z').potentiallyLate, true);
  assert.equal(derive(value, '2026-11-16T17:30:00Z').overdue, false);
  assert.deepEqual(value, original);
});
test('overdue is derived after appointment end and also applies to work already in progress', () => {
  assert.equal(derive(job(), '2026-11-16T18:00:00Z').overdue, false);
  assert.equal(derive(job(), '2026-11-16T18:00:01Z').overdue, true);
  const running = derive({ ...job(), status: 'in-progress' }, '2026-11-16T19:00:00Z');
  assert.equal(running.potentiallyLate, false); assert.equal(running.overdue, true);
  for (const status of ['completed', 'cancelled', 'canceled', 'archived', 'deleted']) assert.equal(derive({ ...job(), status }, '2026-11-17T19:00:00Z').needsAttention, false);
});
test('confirmed original arrival suppresses potential lateness when delayed offline evidence arrives', () => {
  const value = job(); assert.equal(derive(value, '2026-11-16T18:15:00Z').potentiallyLate, true);
  const result = derive({ ...value, visitEvidence: { arrivedAt: '2026-11-16T16:58:00Z', lastEventAt: '2026-11-16T18:14:00Z' } }, '2026-11-16T18:15:00Z');
  assert.equal(result.confirmedArrival, true); assert.equal(result.potentiallyLate, false); assert.equal(result.overdue, true);
  assert.equal(derive({ ...value, visitEvidence: { arrivedAt: '2026-11-16T20:00:00Z' } }, '2026-11-16T18:15:00Z').potentiallyLate, true);
  assert.equal(derive({ ...value, visitEvidence: { arrivedAt: '2026-11-15T16:58:00Z' } }, '2026-11-16T18:15:00Z').potentiallyLate, true);
});
test('company timezone, configurable grace and Pacific legacy fallback are deterministic', () => {
  const utc = deriveJobExceptions(job(), { now: '2026-11-16T09:05:00Z', timeZone: 'UTC', graceMinutes: 5 });
  assert.equal(utc.potentiallyLate, true);
  assert.equal(deriveJobExceptions(job(), { now: '2026-11-16T09:45:00Z' }).potentiallyLate, false);
  assert.equal(deriveJobExceptions(job(), { now: '2026-11-16T09:45:00Z', timeZone: 'Invalid/Zone' }).timeZone, DEFAULT_TIME_ZONE);
  assert.equal(derive(job(), '2026-11-16T17:29:59Z', { graceMinutes: -1 }).potentiallyLate, false);
});
test('overnight windows and duration-based ends remain attached to the original service date', () => {
  const value = { ...job(), time: '23:30', estimatedDuration: 2 };
  assert.equal(derive(value, '2026-11-17T08:15:00Z').potentiallyLate, true);
  assert.equal(derive(value, '2026-11-17T08:15:00Z').overdue, false);
  assert.equal(derive(value, '2026-11-17T09:31:00Z').overdue, true);
  assert.equal(derive({ ...value, windowEnd: '01:00' }, '2026-11-17T09:01:00Z').overdue, true);
});
test('invalid schedules fail safely and do not invent a missed appointment', () => {
  for (const invalid of [{ date: '2026-02-30' }, { time: '25:00' }, { estimatedDuration: 'unknown' }, { estimatedDuration: -1 }]) {
    const result = derive({ ...job(), ...invalid }, '2026-11-17T09:00:00Z');
    assert.equal(result.validSchedule, false); assert.equal(result.potentiallyLate, false); assert.equal(result.overdue, false);
  }
});
test('DST gaps are unclassified and repeated times use the later occurrence conservatively', () => {
  const spring = derive({ ...job(), date: '2026-03-08', time: '02:30' }, '2026-03-08T12:00:00Z'); assert.equal(spring.validSchedule, false);
  const fall = { ...job(), date: '2026-11-01', time: '01:30' };
  assert.equal(derive(fall, '2026-11-01T09:45:00Z').potentiallyLate, false);
  assert.equal(derive(fall, '2026-11-01T10:00:00Z').potentiallyLate, true);
});
test('pending reassignment stays independent of time/status and resolved requests disappear from derived attention', () => {
  const request = { status: 'pending', reason: 'vehicle', notes: 'Private management context' };
  const result = derive({ ...job(), reassignmentRequest: request }, '2026-11-16T15:00:00Z');
  assert.equal(result.reassignmentRequested, true); assert.equal(result.needsAttention, true); assert.equal(result.potentiallyLate, false);
  assert.deepEqual(result.indicators.map(row => row.code), ['reassignment-requested']); assert.equal(result.indicators[0].detail, 'Vehicle problem');
  assert.equal(derive({ ...job(), reassignmentRequest: { ...request, status: 'resolved' } }, '2026-11-16T15:00:00Z').needsAttention, false);
});
