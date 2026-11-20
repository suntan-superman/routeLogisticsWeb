const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDraft } = require('./companyOnboarding');

const valid = { profile: { name: 'Owner', businessName: 'Field Co' }, services: ['Pest control', 'Custom service'], timeZone: 'America/Los_Angeles', businessHours: Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { closed: ['saturday','sunday'].includes(day), open: '09:00', close: '17:00' }])), invites: [{ email: 'TEAM@EXAMPLE.COM', role: 'manager' }] };

test('onboarding draft normalizes owner, services, hours, timezone and invite roles', () => {
  const draft = cleanDraft(valid);
  assert.equal(draft.profile.businessName, 'Field Co');
  assert.deepEqual(draft.services, ['Pest control', 'Custom service']);
  assert.equal(draft.businessHours.sunday.closed, true);
  assert.deepEqual(draft.invites, [{ email: 'team@example.com', role: 'manager' }]);
  assert.equal(draft.currentStep, 1);
});

test('onboarding validation rejects invalid time zones, unsafe hours and malformed service-area ZIPs', () => {
  assert.throws(() => cleanDraft({ ...valid, timeZone: 'Mars/Olympus' }), { code: 'invalid-argument' });
  assert.throws(() => cleanDraft({ ...valid, businessHours: { ...valid.businessHours, monday: { closed: false, open: '25:00', close: '26:00' } } }), { code: 'invalid-argument' });
  const draft = cleanDraft({ ...valid, serviceArea: { method: 'zip', zipCodes: ['93301', 'bad', '93301'] } });
  assert.deepEqual(draft.serviceArea.zipCodes, ['93301']);
});
