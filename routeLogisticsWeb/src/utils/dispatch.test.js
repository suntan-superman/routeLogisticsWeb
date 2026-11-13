import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleWarning, jobPosition } from './dispatch.js';
test('dispatch flags use service dates and windows in company time, never invented traffic ETAs', () => {
  const now = new Date('2026-11-13T18:00:00Z'), job = { date: '2026-11-13', time: '09:00', status: 'scheduled' };
  assert.equal(scheduleWarning(job, now, 'America/Los_Angeles'), 'Scheduled start passed');
  assert.equal(scheduleWarning({ ...job, time: '11:00' }, now, 'America/Los_Angeles'), '');
  assert.equal(scheduleWarning({ ...job, time: 'invalid' }, now, 'America/Los_Angeles'), '');
  assert.equal(scheduleWarning({ ...job, status: 'completed' }, now, 'America/Los_Angeles'), '');
  assert.equal(scheduleWarning({ ...job, windowEnd: '09:30', status: 'in-progress' }, now, 'America/Los_Angeles'), 'Service window passed');
  assert.equal(scheduleWarning({ ...job, date: '2026-11-12' }, now, 'America/Los_Angeles'), 'Past service date');
});
test('dispatch rejects absent or invalid coordinates', () => {
  assert.equal(jobPosition({ latitude: null, longitude: null }), null);
  assert.equal(jobPosition({ latitude: 91, longitude: 10 }), null);
  assert.deepEqual(jobPosition({ latitude: 0, longitude: 0 }), { lat: 0, lng: 0 });
});
