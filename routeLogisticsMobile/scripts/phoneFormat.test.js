const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatPhone, displayPhone } = require('../services/phoneFormat');
test('phone input formats typing, deletion, paste and North American country codes', () => {
  assert.equal(formatPhone(''), ''); assert.equal(formatPhone('6'), '(6');
  assert.equal(formatPhone('661602'), '(661) 602'); assert.equal(formatPhone('6616025407'), '(661) 602-5407');
  assert.equal(formatPhone('(661) 602-'), '(661) 602'); assert.equal(formatPhone('+1 6616025407'), '(661) 602-5407');
  assert.equal(formatPhone('16616025407'), '(661) 602-5407');
});
test('display keeps legacy local and international phone numbers intact', () => {
  assert.equal(displayPhone('6616025407'), '(661) 602-5407'); assert.equal(displayPhone('555-0100'), '555-0100');
  assert.equal(formatPhone('+44 20 1234 5678'), '+44 20 1234 5678'); assert.equal(displayPhone('+44 20 1234 5678'), '+44 20 1234 5678');
});
