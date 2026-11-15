const { test } = require('node:test');
const assert = require('node:assert/strict');
const { schedulingHandlers, dateDay, dayDate, clockMinutes, clock, interval, overlaps, changedSchedule, conflictRows, alternatives, searchOptions } = require('./scheduling');
const appointment = { date: '2030-01-03', time: '09:00', estimatedDuration: 1, assignedTo: 'tech', status: 'scheduled' };
const person = { id: 'tech', uid: 'tech-uid', aliases: ['tech', 'tech-uid', 'legacy-tech'] };

test('schedule arithmetic keeps calendar-local days and strict dates without host timezone conversion', () => {
  assert.equal(dayDate(dateDay('2030-01-03')), '2030-01-03');
  assert.equal(dayDate(dateDay('2028-02-29') + 1), '2028-03-01');
  for (const date of ['2029-02-29', '2030-02-30', '01/03/2030', '', null]) assert.throws(() => dateDay(date), { code: 'invalid-argument' });
  assert.equal(clockMinutes('09:15'), 555); assert.equal(clockMinutes('9:15 AM'), 555); assert.equal(clockMinutes('12:00 AM'), 0); assert.equal(clockMinutes('12:30 PM'), 750);
  for (const value of ['24:00', '9:60', '0:00 PM', '13:00 PM', null]) assert.throws(() => clockMinutes(value));
  assert.equal(clock(1500), '01:00');
});

test('calendar overlap uses duration and exact adjacent boundaries, including overnight work', () => {
  const first = interval(appointment);
  assert.equal(overlaps(first, interval({ ...appointment, time: '10:00' })), false);
  assert.equal(overlaps(first, interval({ ...appointment, time: '09:45' })), true);
  assert.equal(overlaps(interval({ ...appointment, time: '23:30', estimatedDuration: 2 }), interval({ ...appointment, date: '2030-01-04', time: '00:15' })), true);
  assert.equal(interval({ ...appointment, estimatedDuration: undefined }).durationMinutes, 60);
  for (const duration of [0, -1, Infinity, 'invalid', 25]) assert.throws(() => interval({ ...appointment, estimatedDuration: duration }));
});

test('only schedule changes reserve again; unchanged malformed historical notes and completion can proceed', () => {
  const legacy = { ...appointment, date: 'old', time: 'unknown', estimatedDuration: 'unknown' };
  assert.equal(changedSchedule(legacy, { ...legacy, notes: 'Only notes' }), false);
  assert.equal(changedSchedule(appointment, { ...appointment, estimatedDuration: '1' }), false);
  for (const change of [{ assignedTo: 'other' }, { date: '2030-01-04' }, { time: '10:00' }, { estimatedDuration: 2 }, { assignedTo: null }, { status: 'completed' }]) assert.equal(changedSchedule(appointment, { ...appointment, ...change }), true);
  assert.equal(changedSchedule({ ...appointment, status: 'completed' }, { ...appointment, status: 'scheduled' }), true);
  assert.equal(changedSchedule({ ...appointment, status: 'completed' }, { ...appointment, status: 'completed', assignedTo: 'another-technician' }), true);
  assert.equal(changedSchedule(appointment, null), true);
});

test('conflicts include legacy aliases and only busy work; result redacts customer and financial information', () => {
  const rows = [
    { ...appointment, id: 'busy', assignedTo: 'legacy-tech', customerName: 'PRIVATE NAME', address: 'PRIVATE ADDRESS', totalCost: 999 },
    { ...appointment, id: 'cancelled', status: 'cancelled' }, { ...appointment, id: 'completed', status: 'completed' },
    { ...appointment, id: 'other-tech', assignedTo: 'another' },
  ];
  const result = conflictRows(rows, person, interval(appointment));
  assert.equal(result.length, 1); assert.equal(result[0].jobId, 'busy'); assert.equal(result[0].endTime, '10:00');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false); assert.equal(JSON.stringify(result).includes('999'), false);
  assert.equal(conflictRows(rows, person, interval(appointment), 'busy').length, 0);
});

test('an existing assigned job with unknown time blocks that day rather than inventing free slots', () => {
  const result = conflictRows([{ ...appointment, id: 'unknown', time: 'unknown' }], person, interval({ ...appointment, time: '17:00' }));
  assert.equal(result.length, 1); assert.equal(result[0].unknown, true);
  assert.equal(alternatives([{ ...appointment, id: 'unknown', time: 'unknown' }], person, interval(appointment), { searchDays: 1 }).length, 0);
});

test('server-recorded technician UIDs keep reused membership IDs from booking the wrong person', () => {
  const rows = [
    { ...appointment, id: 'old-person', assignedToUid: 'another-uid' },
    { ...appointment, id: 'same-person-new-alias', assignedTo: 'changed-membership-id', assignedToUid: person.uid },
  ];
  const conflicts = conflictRows(rows, person, interval(appointment));
  assert.deepEqual(conflicts.map(row => row.jobId), ['same-person-new-alias']);
});

test('alternative times are quarter hours, retain duration and move to another date when necessary', () => {
  const rows = [{ ...appointment, id: 'busy', time: '08:00', estimatedDuration: 10 }];
  const result = alternatives(rows, person, interval(appointment), { searchDays: 2 });
  assert.equal(result.length, 6); assert.deepEqual(result[0], { date: '2030-01-04', time: '08:00' });
  assert.ok(result.every(row => /:(00|15|30|45)$/.test(row.time)));
  const thursdays = alternatives(rows, person, interval(appointment), { searchDays: 14, allowedWeekdays: [4] });
  assert.equal(thursdays[0].date, '2030-01-10');
  assert.equal(alternatives([], person, interval({ ...appointment, estimatedDuration: 12 }), { searchDays: 2 }).length, 0);
});

test('default alternatives permit weekends; explicit work windows and weekday constraints are bounded', () => {
  const result = alternatives([], person, interval({ ...appointment, date: '2030-01-05', time: '08:01' }));
  assert.deepEqual(result[0], { date: '2030-01-05', time: '08:15' });
  assert.deepEqual(searchOptions({ searchDays: 14, allowedWeekdays: [4, 4] }), { searchDays: 14, allowedWeekdays: [4] });
  for (const data of [{ searchDays: 0 }, { searchDays: 15 }, { allowedWeekdays: [] }, { allowedWeekdays: [7] }, { allowedWeekdays: ['4'] }]) assert.throws(() => searchOptions(data), { code: 'invalid-argument' });
});

test('recurring preference uses its stored account identity while legacy preferences without a UID remain compatible', async () => {
  const records = new Map([
    ['companies/company', { ownerId: 'owner', isActive: true }],
    ['teamMembers/tech', { companyId: 'company', uid: 'replacement-account', role: 'technician', status: 'active', name: 'Current technician' }],
  ]);
  const snapshot = path => ({ id: path.split('/').at(-1), exists: records.has(path), data: () => records.get(path), get: key => records.get(path)?.[key] });
  const query = (collection, filters = [], maximum = Infinity) => {
    const ref = { collection, filters, maximum, where: (field, operator, value) => query(collection, [...filters, [field, operator, value]], maximum), limit: count => query(collection, filters, count), orderBy: () => ref };
    return ref;
  };
  const db = { doc: path => ({ path }), collection: name => query(name) };
  const tx = { get: async ref => {
    if (ref.path) return snapshot(ref.path);
    const docs = [...records].filter(([path, row]) => path.startsWith(ref.collection + '/') && ref.filters.every(([field, operator, value]) => operator === '==' ? row[field] === value : operator === '>=' ? row[field] >= value : row[field] <= value)).slice(0, ref.maximum).map(([path]) => snapshot(path));
    return { docs, size: docs.length };
  } };
  const api = schedulingHandlers(db), scope = { uid: 'owner', companyId: 'company', role: 'owner' };
  const oldIdentity = await api.choose(tx, scope, appointment, { preferredTechnicianId: 'tech', preferredTechnicianUid: 'previous-account', assignmentFallback: 'unassigned' });
  assert.equal(oldIdentity.assignedTo, null); assert.equal(oldIdentity.memberUnavailable, true); assert.equal(oldIdentity.assignmentNeedsAttention, true);
  const legacy = await api.choose(tx, scope, appointment, { preferredTechnicianId: 'tech', preferredTechnicianUid: null });
  assert.equal(legacy.assignedTo, 'tech'); assert.equal(legacy.assignedToUid, 'replacement-account');
  const currentIdentity = await api.choose(tx, scope, appointment, { preferredTechnicianId: 'tech', preferredTechnicianUid: 'replacement-account' });
  assert.equal(currentIdentity.assignedToUid, 'replacement-account'); assert.equal(currentIdentity.assignmentNeedsAttention, false);
});
