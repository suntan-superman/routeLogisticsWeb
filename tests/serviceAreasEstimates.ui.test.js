const { test } = require('node:test');
const assert = require('node:assert/strict');
const helpers = import('../routeLogisticsWeb/src/utils/estimateDraft.js');
const draft = () => ({ customerId: 'synthetic', title: 'Synthetic estimate', serviceType: 'Inspection', scopeOfWork: 'Inspect the service property', lineItems: [{ kind: 'labor', description: 'Inspection', quantity: '1', unitPrice: '25' }], prospect: { address: 'Billing address must not become the property' } });

test('estimate input does not infer service property from contact or billing addresses', async () => {
  const { estimateInput } = await helpers;
  const input = estimateInput(draft());
  assert.equal(input.serviceProperty, undefined);
  assert.equal(input.propertyAddress, undefined);
});

test('estimate service property carries explicit address and category but strips client validation and coordinates', async () => {
  const { estimateInput } = await helpers;
  const input = estimateInput({ ...draft(), serviceProperty: { address: '  100 Synthetic Street, Bakersfield, CA 93312  ', latitude: 90, validated: true }, serviceCategory: ' Pest Control ', serviceAreaExceptionId: 'owner-approved-property', eligible: true });
  assert.deepEqual(input.serviceProperty, { address: '100 Synthetic Street, Bakersfield, CA 93312' });
  assert.equal(input.serviceCategory, 'Pest Control');
  assert.equal(input.serviceAreaExceptionId, 'owner-approved-property');
  assert.equal(input.eligible, undefined);
});

test('stored estimate property is preserved across draft loading and ordinary edits', async () => {
  const { draftFromEstimate, estimateInput } = await helpers;
  const saved = { ...draft(), serviceProperty: { address: '100 Synthetic Street, Bakersfield, CA 93312', validated: true }, serviceCategory: 'Pest Control' };
  const value = draftFromEstimate(saved);
  assert.deepEqual(estimateInput(value).serviceProperty, { address: saved.serviceProperty.address });
  assert.equal(estimateInput({ ...value, notes: 'Ordinary historical change' }).serviceCategory, 'Pest Control');
});

test('conversion carries separate scheduling exception and never substitutes billing addresses', async () => {
  const { conversionInput } = await helpers;
  const schedule = { date: '2026-11-16', time: '09:00', serviceProperty: { address: '100 Synthetic Street, Bakersfield, CA 93312', latitude: 90, validated: true }, serviceCategory: 'Pest Control', serviceAreaExceptionId: 'scheduling-exception' };
  const input = conversionInput(schedule, { customerId: 'synthetic' });
  assert.deepEqual(input.schedule.serviceProperty, { address: schedule.serviceProperty.address });
  assert.equal(input.schedule.serviceAreaExceptionId, 'scheduling-exception');
  assert.equal(conversionInput({ date: schedule.date, time: schedule.time }, { customerId: 'synthetic' }).schedule.serviceProperty, undefined);
});

test('overlong service-property addresses fail before an estimate is submitted', async () => {
  const { estimateInput, conversionInput } = await helpers;
  assert.throws(() => estimateInput({ ...draft(), serviceProperty: { address: 'a'.repeat(279) } }), /278/);
  assert.throws(() => conversionInput({ date: '2026-11-16', time: '09:00', serviceProperty: { address: 'a'.repeat(279) } }), /278/);
});

test('clearing an explicitly selected property or category is sent for server rejection rather than silently retaining old geography', async () => {
  const { estimateInput } = await helpers;
  const input = estimateInput({ ...draft(), serviceProperty: { address: '' }, serviceCategory: '', serviceAreaExceptionId: 'previous-exception' });
  assert.deepEqual(input.serviceProperty, { address: '' });
  assert.equal(input.serviceCategory, '');
  assert.equal(input.serviceAreaExceptionId, null);
});
