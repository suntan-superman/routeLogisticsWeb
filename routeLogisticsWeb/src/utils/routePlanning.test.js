import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appointmentWarnings, googleNavigation } from './routePlanning.js';
test('appointment checking waits for early stops, includes service time, and reports late arrivals', () => {
  const stops = [{ customerName: 'A', windowStart: '09:00', durationMinutes: 60 }, { customerName: 'B', windowStart: '10:00', windowEnd: '10:15', durationMinutes: 0 }];
  assert.equal(appointmentWarnings(stops, [{ durationMillis: 30 * 60000 }, { durationMillis: 30 * 60000 }], '08:00').length, 1);
  assert.equal(appointmentWarnings(stops, [{ durationMillis: 30 * 60000 }, { durationMillis: 10 * 60000 }], '08:00').length, 0);
});
test('navigation encodes customer addresses and includes every stop in the supplied group', () => {
  const url = new URL(googleNavigation([{ address: 'A & B Road' }, { location: { lat: 10, lng: 20 } }]));
  assert.equal(url.searchParams.get('waypoints'), 'A & B Road'); assert.equal(url.searchParams.get('destination'), '10,20');
});
