import test from 'node:test';
import assert from 'node:assert/strict';
import { isChunkLoadError, recoverFailedChunk } from './chunkRecovery.js';

function fixture(message) {
  const values = new Map();
  let prevented = 0, reloaded = 0;
  const event = { payload: new TypeError(message), preventDefault: () => { prevented += 1; } };
  const options = {
    storage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    reload: () => { reloaded += 1; },
  };
  return { event, options, counts: () => ({ prevented, reloaded }) };
}

test('stale lazy chunk reloads once and then leaves a retry screen available', () => {
  const { event, options, counts } = fixture('Failed to fetch dynamically imported module: https://route-logistics.com/assets/CompanyOnboardingPage-old.js');
  assert.equal(recoverFailedChunk(event, options), true);
  assert.deepEqual(counts(), { prevented: 1, reloaded: 1 });
  assert.equal(recoverFailedChunk(event, options), false);
  assert.deepEqual(counts(), { prevented: 1, reloaded: 1 });
});

test('unrelated errors do not reload or suppress the failure', () => {
  const { event, options, counts } = fixture('Missing or insufficient permissions');
  assert.equal(isChunkLoadError(event.payload), false);
  assert.equal(recoverFailedChunk(event, options), false);
  assert.deepEqual(counts(), { prevented: 0, reloaded: 0 });
});

test('recovery fails safely when session storage is unavailable', () => {
  const { event, counts } = fixture('Importing a module script failed.');
  assert.equal(recoverFailedChunk(event, { storage: null, reload: () => {} }), false);
  assert.deepEqual(counts(), { prevented: 0, reloaded: 0 });
});
