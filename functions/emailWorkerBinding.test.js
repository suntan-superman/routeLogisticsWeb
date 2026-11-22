const test = require('node:test');
const assert = require('node:assert/strict');

test('mail worker always binds SMTP secret before runtime email flag is evaluated', () => {
  const previous = process.env.RL_EMAIL_ENABLED;
  process.env.RL_EMAIL_ENABLED = 'false';
  try {
    const endpoint = require('./index').rlDeliverEmail.__endpoint;
    assert.deepEqual(endpoint.secretEnvironmentVariables, [{ key: 'RL_SMTP_URL' }]);
  } finally {
    if (previous === undefined) delete process.env.RL_EMAIL_ENABLED;
    else process.env.RL_EMAIL_ENABLED = previous;
  }
});
