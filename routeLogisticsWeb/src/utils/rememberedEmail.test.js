import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rememberedEmail, rememberEmail } from './rememberedEmail.js';

test('remember me stores only a normalized email and clears it when unchecked', () => {
  const data = new Map();
  globalThis.window = { localStorage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) } };
  assert.equal(rememberedEmail(), '');
  rememberEmail(' OWNER@Example.com ', true);
  assert.equal(rememberedEmail(), 'owner@example.com');
  assert.deepEqual([...data], [['rl.rememberedEmail', 'owner@example.com']]);
  rememberEmail('', false); assert.equal(rememberedEmail(), '');
  rememberEmail('invalid', true); assert.equal(data.size, 0);
  delete globalThis.window;
});

test('blocked storage does not prevent sign-in', () => {
  globalThis.window = { get localStorage() { throw new Error('Storage blocked'); } };
  assert.equal(rememberedEmail(), '');
  assert.doesNotThrow(() => rememberEmail('owner@example.com', true));
  assert.doesNotThrow(() => rememberEmail('', false));
  delete globalThis.window;
});
