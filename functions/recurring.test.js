const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextVisit, buildInitialPlan, assignmentSettings, todayInZone } = require('./recurring');
const { normalizeRecurrence } = require('./recurrenceRules');

test('legacy frequencyDays advancement remains unchanged while explicit calendar rules avoid monthly drift', () => {
  const base = { active: true, userId: 'owner', customerId: 'customer', nextServiceDate: '2027-01-31', frequencyDays: 30, price: 95 };
  assert.deepEqual(nextVisit(base), { date: '2027-01-31', nextServiceDate: '2027-03-02' });
  const calendar = { ...base, recurrence: normalizeRecurrence({ frequency: 'monthly' }, base.nextServiceDate) };
  assert.equal(nextVisit(calendar).nextServiceDate, '2027-02-28');
  assert.equal(nextVisit({ ...calendar, nextServiceDate: '2027-02-28' }).nextServiceDate, '2027-03-31');
});
test('initial recurring plan advances past its atomic first visit and keeps verified geography and explicit assignment policy', context => {
  context.mock.method(Date, 'now', () => Date.UTC(2026, 10, 15, 20));
  const property = { address: 'Synthetic verified service property', latitude: 35, longitude: -119, postalCode: '93312', validated: true };
  const plan = buildInitialPlan({ uid: 'owner', companyId: 'company' }, { companyId: 'foreign', userId: 'foreign', customerId: 'customer', customerName: 'Synthetic customer', date: '2030-01-03', time: '09:15', estimatedDuration: 1.5, totalCost: 125, assignedTo: 'technician', serviceProperty: property }, { recurrence: { frequency: 'weekly' } });
  assert.equal(plan.userId, 'owner'); assert.equal(plan.companyId, 'company'); assert.equal(plan.nextServiceDate, '2030-01-10');
  assert.equal(plan.preferredTechnicianId, 'technician'); assert.equal(plan.assignmentFallback, 'unassigned'); assert.equal(plan.estimatedDuration, 1.5); assert.equal(plan.price, 125);
  assert.deepEqual(plan.serviceProperty, property); assert.equal(plan.latitude, 35); assert.equal(plan.frequencyDays, 7);
  assert.deepEqual(assignmentSettings({ preferredTechnicianId: null, assignmentFallback: 'auto' }), { preferredTechnicianId: null, assignmentFallback: 'auto' });
});
test('new recurring starts respect company-local today and never silently create a historical series', context => {
  context.mock.method(Date, 'now', () => Date.UTC(2026, 10, 16, 1));
  assert.equal(todayInZone('America/Los_Angeles'), '2026-11-15'); assert.equal(todayInZone('Pacific/Auckland'), '2026-11-16');
  const job = { customerId: 'customer', date: '2026-11-15', time: '09:00' }, settings = { recurrence: { frequency: 'weekly' } };
  assert.equal(buildInitialPlan({ uid: 'owner' }, job, settings).recurrence.anchorDate, '2026-11-15');
  assert.throws(() => buildInitialPlan({ uid: 'owner', company: { timeZone: 'Pacific/Auckland' } }, job, settings), { code: 'invalid-argument' });
  assert.throws(() => buildInitialPlan({ uid: 'owner' }, { ...job, date: '2026-11-14' }, settings), { code: 'invalid-argument' });
});
test('invalid calendar patterns, duration, price and fallback cannot create a recurring plan', context => {
  context.mock.method(Date, 'now', () => Date.UTC(2026, 10, 15, 20));
  const scope = { uid: 'owner' }, job = { customerId: 'customer', date: '2030-01-03', time: '09:00' }, settings = { recurrence: { frequency: 'weekly' } };
  for (const patch of [{ estimatedDuration: 0 }, { estimatedDuration: 25 }, { time: '25:00' }, { totalCost: -1 }, { totalCost: Infinity }]) assert.throws(() => buildInitialPlan(scope, { ...job, ...patch }, settings), { code: 'invalid-argument' });
  assert.throws(() => buildInitialPlan(scope, job, { ...settings, assignmentFallback: 'owner-privileges' }), { code: 'invalid-argument' });
  assert.throws(() => buildInitialPlan(scope, job, { recurrence: { frequency: 'monthly', monthlyMode: 'weekday', ordinal: 2 } }), { code: 'invalid-argument' });
});
