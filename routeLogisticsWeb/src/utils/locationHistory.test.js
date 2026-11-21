import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarDays, analyzeLocationHistory, localMidnightUtc } from './locationHistory.js';
import { DEFAULT_MAP_HEIGHT, mapHeight, schematicPosition } from './locationHistoryView.js';

const point = (minute, lat = 36, lng = -119, accuracy = 8, day = '2026-11-19') => ({ lat, lng, accuracy, capturedAt: new Date(Date.parse(`${day}T08:00:00Z`) + minute * 60000).toISOString() });

test('stationary location samples become a stop at the minimum dwell threshold', () => {
  const result = analyzeLocationHistory([point(0), point(6, 36.00001, -119), point(15, 36.00002, -119)]);
  assert.equal(result.stops.length, 1); assert.equal(result.stops[0].durationMs, 15 * 60000);
});

test('GPS drift within the accuracy-adjusted radius remains stationary', () => {
  const result = analyzeLocationHistory([point(0), point(6, 36.0002, -119, 20), point(15, 36.0003, -119, 20)]);
  assert.equal(result.stops.length, 1);
});

test('a stop shorter than the requested duration is omitted', () => {
  assert.equal(analyzeLocationHistory([point(0), point(5), point(10)], { minDwellMinutes: 15 }).stops.length, 0);
});

test('multiple nearby stops are separated by observed movement beyond the radius', () => {
  const result = analyzeLocationHistory([point(0), point(6), point(15), point(18, 36.004, -119), point(24, 36.004, -119), point(33, 36.00401, -119)], { intervalMinutes: 5 });
  assert.equal(result.stops.length, 2);
});

test('long GPS gaps split route segments and are exposed to the timeline', () => {
  const result = analyzeLocationHistory([point(0), point(3), point(30)]);
  assert.equal(result.segments.length, 2); assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].from, point(3).capturedAt); assert.equal(result.gaps[0].to, point(30).capturedAt);
});

test('low quality and malformed fixes are excluded from route and stop detection', () => {
  const result = analyzeLocationHistory([point(0), point(5, 36, -119, 100), { ...point(10), lat: 999 }, point(15)], { intervalMinutes: 5 });
  assert.equal(result.points.length, 2); assert.equal(result.stops.length, 1);
});

test('cross-midnight ordering remains absolute-time based', () => {
  const first = { ...point(0), capturedAt: '2026-11-19T23:55:00-08:00' };
  const next = { ...point(15), capturedAt: '2026-11-20T00:10:00-08:00' };
  assert.equal(analyzeLocationHistory([next, first], { intervalMinutes: 5 }).stops.length, 1);
});

test('company calendar boundaries honor the timezone offset and daylight saving changes', () => {
  assert.equal(localMidnightUtc('2026-11-19', 'America/Los_Angeles'), '2026-11-19T08:00:00.000Z');
  assert.equal(localMidnightUtc('2026-07-19', 'America/Los_Angeles'), '2026-07-19T07:00:00.000Z');
  assert.equal(addCalendarDays('2026-11-19', 1), '2026-11-20');
});

test('Location History map size is bounded and invalid saved preferences reset safely', () => {
  assert.equal(mapHeight(320), 320);
  assert.equal(mapHeight(900), 900);
  assert.equal(mapHeight(319), DEFAULT_MAP_HEIGHT);
  assert.equal(mapHeight(901), DEFAULT_MAP_HEIGHT);
  assert.equal(mapHeight('not a number'), DEFAULT_MAP_HEIGHT);
});

test('print schematic places observed fixes within the page and keeps north above south', () => {
  const points = [{ lat: 35, lng: -119 }, { lat: 36, lng: -118 }];
  const southWest = schematicPosition(points[0], points), northEast = schematicPosition(points[1], points);
  assert.ok(southWest.x < northEast.x);
  assert.ok(southWest.y > northEast.y);
  for (const value of [southWest.x, southWest.y, northEast.x, northEast.y]) assert.ok(value >= 0 && value <= 720);
});
