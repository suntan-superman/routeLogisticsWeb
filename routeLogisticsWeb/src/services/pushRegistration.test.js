import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForActiveServiceWorker } from './pushRegistration.js';

test('web push uses an already-active service worker immediately', async () => {
  const registration = { active: { state: 'activated' } };
  const container = {};
  Object.defineProperty(container, 'ready', { get: () => { throw new Error('ready should not be read'); } });

  assert.equal(await waitForActiveServiceWorker(container, registration), registration);
});

test('first-time web push registration waits for the worker to become active', async () => {
  const registered = { active: null, installing: { state: 'installing' } };
  const active = { active: { state: 'activated' } };
  let resolveReady;
  const container = { ready: new Promise((resolve) => { resolveReady = resolve; }) };
  const waiting = waitForActiveServiceWorker(container, registered, 100);

  resolveReady(active);
  assert.equal(await waiting, active);
});

test('web push reports an actionable error when activation never completes', async () => {
  const never = new Promise(() => {});
  await assert.rejects(
    waitForActiveServiceWorker({ ready: never }, { active: null }, 5),
    /service worker could not start/i,
  );
});

