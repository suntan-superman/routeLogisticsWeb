import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locationState, dutyLabel, nearestOnDuty, distanceMeters } from './workLocations.js';
const now = Date.parse('2026-11-13T20:00:00Z');
const fix = overrides => ({ lat:35, lng:-119, accuracy:10, capturedAt:new Date(now-60000).toISOString(), sharing:true, state:'live', ...overrides });
test('GPS freshness follows owner cadence and never implies shift availability', () => {
  assert.equal(locationState(null,now),'unavailable'); assert.equal(dutyLabel({onDuty:true}),'On duty');
  assert.equal(locationState(fix({capturedAt:new Date(now-240000).toISOString()}),now,420),'live');
  assert.equal(locationState(fix({capturedAt:new Date(now-240000).toISOString()}),now,180),'stale');
  assert.equal(locationState(fix({capturedAt:new Date(now-1000000).toISOString(),receivedAt:new Date(now).toISOString()}),now,420),'stale');
  assert.equal(locationState(fix({state:'sharing-disabled',sharing:false}),now),'sharing-disabled');
});
test('nearest recommendations exclude off-duty, stale, inaccurate and missing fixes', () => {
  const roster=[{memberId:'near',onDuty:true,location:fix()},{memberId:'far',onDuty:true,location:fix({lat:36})},
    {memberId:'off',onDuty:false,location:fix()},{memberId:'stale',onDuty:true,location:fix({state:'stale'})},
    {memberId:'coarse',onDuty:true,location:fix({accuracy:1000})},{memberId:'missing',onDuty:true}];
  assert.deepEqual(nearestOnDuty(roster,{lat:35,lng:-119},now).map(row=>row.memberId),['near','far']);
  assert.equal(distanceMeters({lat:35,lng:-119},{lat:35,lng:-119}),0); assert.equal(distanceMeters({lat:100,lng:0},{lat:0,lng:0}),null);
});
