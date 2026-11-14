const { test } = require('node:test');
const assert = require('node:assert/strict');
const { policyFor, active, shiftView, captureTime, distanceMeters, transition } = require('./workTracking');

test('tracking policies allow only supported intervals and bounded retention', () => {
  assert.deepEqual(policyFor({}), { intervalMinutes: 3, retentionHours: 24, maxShiftHours: 12, freshAfterSeconds: 300 });
  for (const intervalMinutes of [1,3,5]) assert.equal(policyFor({ rlLocationIntervalMinutes: intervalMinutes }).freshAfterSeconds, intervalMinutes * 60 + 120);
  assert.equal(policyFor({ rlLocationIntervalMinutes: 0, rlLocationRetentionHours: 999 }).retentionHours, 24);
});
test('expired shifts are off duty and capture timestamps cannot extend a bounded shift', () => {
  const start = Date.parse('2026-11-13T09:00:00Z'), shift = { id: 'shift', trackingConsent: true, status: 'on-duty', startedAt: new Date(start), expiresAt: new Date(start + 43200000) };
  assert.equal(active(shift, start), true); assert.equal(active(shift, start + 43200000), false);
  assert.equal(shiftView(shift, start + 43200000).endReason, 'expired');
  assert.equal(captureTime(new Date(start).toISOString(), start + 3600000, start, 24), start);
  for (const value of ['bad', new Date(start - 180000).toISOString(), new Date(start + 180000).toISOString()]) assert.throws(() => captureTime(value, start, start, 24));
});
test('GPS evidence requires accuracy-aware entry and exit hysteresis', () => {
  assert.ok(distanceMeters({lat:35,lng:-119},{lat:35.001,lng:-119}) > 100);
  assert.equal(transition(null, 50, 20), 'arrived'); assert.equal(transition(null, 90, 20), null);
  assert.equal(transition({inside:true}, 210, 20), null); assert.equal(transition({inside:true}, 230, 20), 'departed');
  assert.equal(transition(null, 0, 100), null); assert.equal(transition({inside:true}, 10, 5), null);
});
