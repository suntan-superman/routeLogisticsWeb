const test = require('node:test');
const assert = require('node:assert/strict');
const { stripeKeyMatchesMode, stripeKeyForMode } = require('./payments');

test('Stripe accepts restricted and standard server keys only in their configured mode', () => {
  for (const prefix of ['rk', 'sk']) {
    for (const mode of ['test', 'live']) {
      const fixture = `${prefix}_${mode}_fixture`;
      assert.equal(stripeKeyMatchesMode(fixture, mode), true);
      assert.equal(stripeKeyMatchesMode(fixture, mode === 'test' ? 'live' : 'test'), false);
    }
  }
});

test('Stripe rejects public, webhook, missing and malformed keys without exposing them', () => {
  for (const key of ['', undefined, null, 'pk_test_fixture', 'whsec_fixture', 'rk_test_', 'rk_test_fixture\n']) {
    assert.equal(stripeKeyMatchesMode(key, 'test'), false);
  }
  assert.equal(stripeKeyMatchesMode('rk_test_fixture', 'invalid'), false);
});

test('secret loading accepts surrounding whitespace while retaining strict test/live separation', () => {
  assert.equal(stripeKeyForMode('  rk_test_fixture\r\n', 'test'), 'rk_test_fixture');
  assert.equal(stripeKeyForMode('\nsk_test_fixture\n', 'test'), 'sk_test_fixture');
  for (const key of ['rk_live_fixture\n', 'rk_test_bad key', 'pk_test_fixture', '', undefined]) {
    assert.throws(() => stripeKeyForMode(key, 'test'), { code: 'failed-precondition', message: 'Stripe credentials do not match the configured mode.' });
  }
});
