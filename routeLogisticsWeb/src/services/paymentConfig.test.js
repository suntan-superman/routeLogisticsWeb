import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePaymentConfiguration } from './paymentConfig.js';
test('frontend payment mode defaults to test and never accepts a mismatched key', () => {
  assert.equal(resolvePaymentConfiguration({VITE_STRIPE_PUBLISHABLE_KEY:'pk_test_fixture'}).configured,true);
  assert.equal(resolvePaymentConfiguration({VITE_STRIPE_PUBLISHABLE_KEY:'pk_live_fixture'}).configured,false);
  assert.equal(resolvePaymentConfiguration({VITE_STRIPE_MODE:'live',VITE_STRIPE_PUBLISHABLE_KEY:'pk_test_fixture',VITE_STRIPE_LIVE_APPROVED:'true'}).configured,false);
});
test('live readiness requires a separate explicit frontend approval in addition to server approval', () => {
  const value={VITE_STRIPE_MODE:'live',VITE_STRIPE_PUBLISHABLE_KEY:'pk_live_fixture'};
  assert.equal(resolvePaymentConfiguration(value).configured,false);
  assert.equal(resolvePaymentConfiguration({...value,VITE_STRIPE_LIVE_APPROVED:'true'}).configured,true);
  assert.equal(resolvePaymentConfiguration({...value,VITE_STRIPE_MODE:'invalid',VITE_STRIPE_LIVE_APPROVED:'true'}).configured,false);
});
