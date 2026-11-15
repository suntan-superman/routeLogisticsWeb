const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanSettings, DEFAULT_SETTINGS } = require('./reviewInvitations');
test('review invitations default to email preference with all automation disabled', () => {
  assert.equal(DEFAULT_SETTINGS.enabled, false); assert.equal(DEFAULT_SETTINGS.emailEnabled, true); assert.equal(DEFAULT_SETTINGS.smsEnabled, false); assert.equal(DEFAULT_SETTINGS.reminderEnabled, false);
});
test('review invitation settings accept bounded integer delays and one optional reminder', () => {
  const result = cleanSettings({ ...DEFAULT_SETTINGS, enabled: true, delayMinutes: 0, reminderEnabled: true, reminderDelayMinutes: 60, expiresDays: 1 });
  assert.equal(result.delayMinutes, 0); assert.equal(result.reminderEnabled, true); assert.equal(result.expiresDays, 1);
});
test('review invitation settings reject negative, fractional and oversized delays or lifetimes', () => {
  for (const patch of [{ delayMinutes: -1 }, { delayMinutes: 10081 }, { delayMinutes: 0.5 }, { reminderDelayMinutes: 59 }, { reminderDelayMinutes: 20161 }, { expiresDays: 0 }, { expiresDays: 31 }]) assert.throws(() => cleanSettings({ ...DEFAULT_SETTINGS, ...patch }), { code: 'invalid-argument' });
});
test('settings cannot grant global delivery, approval, per-customer consent or token credentials', () => {
  const result = cleanSettings({ ...DEFAULT_SETTINGS, globalEnabled: true, liveApproved: true, reviewTestGrantId: 'forged', token: 'forged', enabled: 'true', smsEnabled: 'true' });
  assert.equal(result.enabled, false); assert.equal(result.smsEnabled, false); assert.equal(result.globalEnabled, undefined); assert.equal(result.token, undefined); assert.equal(result.reviewTestGrantId, undefined);
});
test('an optional reminder must precede the invitation expiry', () => {
  for (const reminderDelayMinutes of [1440, 2880]) assert.throws(() => cleanSettings({ ...DEFAULT_SETTINGS, reminderEnabled: true, reminderDelayMinutes, expiresDays: 1 }), { code: 'invalid-argument' });
  assert.equal(cleanSettings({ ...DEFAULT_SETTINGS, reminderEnabled: false, reminderDelayMinutes: 2880, expiresDays: 1 }).reminderEnabled, false);
});
