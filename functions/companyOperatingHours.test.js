const { test } = require('node:test');
const assert = require('node:assert/strict');
const { operatingSlot, nextOpenSlot } = require('./companyOperatingHours');

const hours = Object.fromEntries(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map(day => [day, { closed: ['sunday', 'saturday'].includes(day), open: '08:00', close: '17:00' }]));
const company = { timeZone: 'America/Los_Angeles', businessHours: { ...hours, closedDates: ['2030-01-08'] } };
const slot = date => ({ date, time: '09:00', estimatedDuration: 1 });

test('company-local weekdays, exceptional closures and hours gate only configured schedules', () => {
  assert.equal(operatingSlot({}, slot('2030-01-06')).open, true);
  assert.equal(operatingSlot(company, slot('2030-01-06')).code, 'closed-day');
  assert.equal(operatingSlot(company, slot('2030-01-05')).code, 'closed-day');
  assert.equal(operatingSlot(company, slot('2030-01-08')).code, 'closed-date');
  assert.equal(operatingSlot(company, slot('2030-01-07')).open, true);
  assert.equal(operatingSlot(company, { ...slot('2030-01-07'), time: '16:30' }).code, 'outside-hours');
  assert.equal(nextOpenSlot(company, slot('2030-01-06')), '2030-01-07');
  assert.equal(nextOpenSlot({ businessHours: Object.fromEntries(Object.entries(hours).map(([day, value]) => [day, { ...value, closed: true }])) }, slot('2030-01-06')), null);
});

test('DST changes do not shift the recurrence date or the company-local weekday', () => {
  const sundayOpen = { businessHours: { ...hours, sunday: { closed: false, open: '08:00', close: '17:00' } } };
  for (const date of ['2027-03-14', '2027-11-07']) assert.equal(operatingSlot(sundayOpen, slot(date)).open, true);
  assert.equal(nextOpenSlot(company, slot('2027-03-14')), '2027-03-15');
});
