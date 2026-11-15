const { test } = require('node:test');
const assert = require('node:assert/strict');
const { availabilityView, unavailableIntervals, assertAvailable, parsePeriod } = require('./staffAvailability');
const at = Date.parse('2030-01-03T17:00:00Z');
const vacation = { status: 'unavailable', reason: 'vacation', startsAt: '2030-01-03T16:00:00.000Z', endsAt: '2030-01-04T02:00:00.000Z' };
const emergency = { status: 'available', reason: 'emergency', startsAt: '2030-01-03T18:00:00.000Z', endsAt: '2030-01-03T20:00:00.000Z' };
test('availability is time bounded, preserves revisions and exposes future periods without inventing duty', () => {
  assert.deepEqual(availabilityView(null, at), { state: 'normal', active: false, revision: 0, reason: '', startsAt: null, endsAt: null, scheduled: 0, status: null, nextChangeAt: null });
  const data = { revision: 4, periods: [vacation] };
  assert.equal(availabilityView(data, at).state, 'unavailable');
  const future = availabilityView(data, Date.parse('2030-01-03T15:00:00Z'));
  assert.equal(future.active, false); assert.equal(future.state, 'normal'); assert.equal(future.scheduled, 1); assert.equal(future.status, 'unavailable'); assert.equal(future.revision, 4);
  assert.equal(availabilityView(data, Date.parse(vacation.endsAt)).state, 'normal');
  assert.equal(availabilityView(data, Date.parse(vacation.endsAt)).scheduled, 0);
  const pendingOverride = availabilityView({ periods: [vacation, { ...vacation, status: 'available', reason: 'emergency' }] }, Date.parse('2030-01-03T15:00:00Z'));
  assert.equal(pendingOverride.state, 'normal'); assert.equal(pendingOverride.status, 'available'); assert.equal(pendingOverride.scheduled, 2);
});
test('temporary emergency override preserves and resumes underlying vacation', () => {
  const data = { periods: [vacation, emergency] };
  assert.equal(availabilityView(data, Date.parse('2030-01-03T19:00:00Z')).state, 'available');
  assert.equal(availabilityView(data, Date.parse(emergency.endsAt)).state, 'unavailable');
  assert.deepEqual(unavailableIntervals(data).map(span => ({ reason: span.reason, duration: span.end - span.start })), [{ reason: 'vacation', duration: 120 }, { reason: 'vacation', duration: 360 }]);
  assertAvailable(data, Date.parse('2030-01-03T19:00:00Z'));
  assert.throws(() => assertAvailable(data, Date.parse('2030-01-03T21:00:00Z')), { code: 'failed-precondition' });
});
test('overlapping newer unavailable periods override previous availability and adjacent boundaries remain half open', () => {
  const data = { periods: [emergency, vacation] };
  assert.equal(availabilityView(data, Date.parse('2030-01-03T19:00:00Z')).state, 'unavailable');
  assert.equal(unavailableIntervals(data).length, 1);
  assertAvailable(data, Date.parse(vacation.endsAt));
});
test('intervals use company calendar time across Pacific, Eastern and UTC including DST', () => {
  const data = { periods: [{ ...vacation, startsAt: '2030-03-10T09:00:00.000Z', endsAt: '2030-03-10T11:00:00.000Z' }] };
  const [pacific] = unavailableIntervals(data, 'America/Los_Angeles'), [eastern] = unavailableIntervals(data, 'America/New_York'), [utc] = unavailableIntervals(data, 'UTC');
  assert.equal(pacific.start % 1440, 60); assert.equal(pacific.end % 1440, 240);
  assert.equal(eastern.start % 1440, 300); assert.equal(eastern.end % 1440, 420);
  assert.equal(utc.start % 1440, 540); assert.equal(utc.end % 1440, 660);
});
test('fall-back repeated-hour absences conservatively reserve both Pacific and Eastern wall-clock occurrences', () => {
  for (const [zone, startsAt, endsAt] of [['America/Los_Angeles', '2030-11-03T08:30:00.000Z', '2030-11-03T09:30:00.000Z'], ['America/New_York', '2030-11-03T05:30:00.000Z', '2030-11-03T06:30:00.000Z']]) {
    const [span] = unavailableIntervals({ periods: [{ ...vacation, startsAt, endsAt }] }, zone);
    assert.equal(span.start % 1440, 60); assert.equal(span.end % 1440, 120); assert.equal(span.end - span.start, 60);
  }
});
test('a fall-back interval with decreasing local endpoints cannot fail open and spring boundaries remain covered', () => {
  const [fold] = unavailableIntervals({ periods: [{ ...vacation, startsAt: '2030-11-03T08:50:00.000Z', endsAt: '2030-11-03T09:10:00.000Z' }] }, 'America/Los_Angeles');
  assert.equal(fold.start % 1440, 60); assert.equal(fold.end % 1440, 120);
  const [spring] = unavailableIntervals({ periods: [{ ...vacation, startsAt: '2030-03-10T09:50:00.000Z', endsAt: '2030-03-10T10:10:00.000Z' }] }, 'America/Los_Angeles');
  assert.equal(spring.start % 1440, 110); assert.equal(spring.end % 1440, 190);
});
test('availability dates and reasons reject indefinite, expired, oversized, and invalid input', () => {
  const valid = { ...vacation, startsAt: new Date(at).toISOString() };
  assert.equal(parsePeriod(valid, at).status, 'unavailable');
  for (const patch of [{ status: 'active' }, { reason: 'owner' }, { endsAt: null }, { startsAt: 'bad' }, { endsAt: new Date(at).toISOString() }, { startsAt: '2020-01-01T00:00:00Z' }, { endsAt: '2031-01-03T00:00:00Z' }, { endsAt: '2030-02-30T10:00:00Z' }, { endsAt: '2030-01-04T24:00:00Z' }]) assert.throws(() => parsePeriod({ ...valid, ...patch }, at), { code: 'invalid-argument' });
});
