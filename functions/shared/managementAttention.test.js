const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyManagementAttention, summarizeManagementAttention } = require('./managementAttention');

const base = overrides => ({ id: 'job-1', status: 'scheduled', date: '2026-11-18', time: '09:00', duration: 1, assignedTo: 'tech-1', ...overrides });
const at = '2026-11-18T18:30:00.000Z'; // 10:30 AM Pacific

test('missed classification requires a passed end, unresolved schedule and no visit evidence', () => {
  assert.equal(classifyManagementAttention(base(), { now: at, timeZone: 'America/Los_Angeles' }).missed, true);
  assert.equal(classifyManagementAttention(base({ visitEvidence: { arrivedAt: '2026-11-18T17:15:00.000Z' } }), { now: at, timeZone: 'America/Los_Angeles' }).missed, false);
  assert.equal(classifyManagementAttention(base({ status: 'in-progress' }), { now: at, timeZone: 'America/Los_Angeles' }).missed, false);
  for (const status of ['completed', 'cancelled', 'deleted']) assert.equal(classifyManagementAttention(base({ status }), { now: at, timeZone: 'America/Los_Angeles' }).missed, false);
});

test('assignment, reassignment and explicit rescheduling are unresolved and deduplicated', () => {
  const rows = [base({ id: 'one', assignedTo: null }), base({ id: 'one', assignedTo: null }), base({ id: 'two', reassignmentRequest: { status: 'pending' } }), base({ id: 'three', rescheduleRequired: true }), base({ id: 'closed', status: 'cancelled', assignedTo: null, rescheduleRequired: true })];
  const result = summarizeManagementAttention(rows, { now: '2026-11-18T16:00:00.000Z', timeZone: 'America/Los_Angeles' });
  assert.deepEqual(result.jobIds.unassignedOrReassignment, ['one', 'two']);
  assert.deepEqual(result.jobIds.rescheduleRequired, ['three']);
  assert.equal(result.counts.totalUnique, 3);
});

test('invalid schedules fail safely and do not become missed appointments', () => {
  assert.equal(classifyManagementAttention(base({ date: 'not-a-date' }), { now: at }).missed, false);
});
