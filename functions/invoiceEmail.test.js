const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reminderLocalDay } = require('./invoiceEmail');

test('reminder eligibility uses the company-local calendar day at UTC boundaries', () => {
  const instant = new Date('2026-11-22T02:00:00.000Z');
  assert.equal(reminderLocalDay(instant, 'America/Los_Angeles'), '2026-11-21');
  assert.equal(reminderLocalDay(instant, 'America/New_York'), '2026-11-21');
  assert.equal(reminderLocalDay(instant, 'Pacific/Auckland'), '2026-11-22');
});
