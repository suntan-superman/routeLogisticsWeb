import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPhone } from './format.js';

test('formats progressively', () => {
  assert.equal(formatPhone(''), '');
  assert.equal(formatPhone('6'), '(6');
  assert.equal(formatPhone('661602'), '(661) 602');
  assert.equal(formatPhone('6616025407'), '(661) 602-5407');
});

test('strips country code, junk and extra digits', () => {
  assert.equal(formatPhone('+1 661-602-5407'), '(661) 602-5407');
  assert.equal(formatPhone('16616025407'), '(661) 602-5407');
  assert.equal(formatPhone('66160254079999'), '(661) 602-5407');
});

test('is idempotent and leaves international numbers alone', () => {
  assert.equal(formatPhone('(661) 602-5407'), '(661) 602-5407');
  assert.equal(formatPhone('+44 20 7946 0958'), '+44 20 7946 0958');
});
