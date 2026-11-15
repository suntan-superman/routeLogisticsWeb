import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const moduleUrl = new URL('./calendarDate.js', import.meta.url).href;
const dates = ['2026-11-14', '2026-01-01', '2026-12-31', '2026-03-08', '2026-11-01'];
const expected = ['Nov 14, 2026', 'Jan 1, 2026', 'Dec 31, 2026', 'Mar 8, 2026', 'Nov 1, 2026'];
function runInZone(zone, body) {
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    `import { formatCalendarDate } from ${JSON.stringify(moduleUrl)};\n${body}`,
  ], { env: { ...process.env, TZ: zone }, encoding: 'utf8' }));
}

for (const zone of ['America/Los_Angeles', 'America/New_York', 'UTC']) {
  test(`calendar-only dates retain their day, including year boundaries and DST, in ${zone}`, () => {
    const result = runInZone(zone, `console.log(JSON.stringify(${JSON.stringify(dates)}.map(formatCalendarDate)));`);
    assert.deepEqual(result, expected);
  });
  test(`invalid and missing dates display a placeholder without rolling into another month in ${zone}`, () => {
    const result = runInZone(zone, `
      const values = [null, undefined, '', ' ', 'bad-date', '2026-02-30', '2026-13-01', '2026-11-31',
        '2025-02-29', '2026-00-10', '0000-01-01', new Date(NaN), NaN, Infinity, false, {},
        { toDate() { throw Error('invalid timestamp'); } }, { toDate() { return 'not a Date'; } }];
      console.log(JSON.stringify(values.map(formatCalendarDate)));
    `);
    assert.deepEqual(result, Array(18).fill('—'));
  });
  test(`actual timestamps keep their existing timezone conversion and millisecond units in ${zone}`, () => {
    const result = runInZone(zone, `
      const original = new Date('2026-11-14T00:30:00Z'), before = original.getTime();
      const values = ['2026-11-14T00:30:00Z', '2026-11-14T00:30:00-08:00', original, before, 0, 86400000,
        'Sat, 14 Nov 2026 00:30:00 GMT'];
      const options = { year: 'numeric', month: 'short', day: 'numeric' };
      console.log(JSON.stringify({ actual: values.map(formatCalendarDate),
        existing: values.map(value => new Date(value).toLocaleDateString('en-US', options)),
        firestore: formatCalendarDate({ toDate: () => original }), unchanged: original.getTime() === before,
        first: formatCalendarDate(values[0]), leap: formatCalendarDate('2024-02-29'), earlyYear: formatCalendarDate('0099-01-01') }));
    `);
    assert.deepEqual(result.actual, result.existing);
    assert.equal(result.firestore, result.actual[0]);
    assert.equal(result.unchanged, true);
    assert.equal(result.first, zone === 'UTC' ? 'Nov 14, 2026' : 'Nov 13, 2026');
    assert.equal(result.leap, 'Feb 29, 2024');
    assert.equal(result.earlyYear, 'Jan 1, 99');
  });
}
