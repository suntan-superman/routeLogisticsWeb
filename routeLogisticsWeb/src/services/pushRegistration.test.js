import test from 'node:test';
import assert from 'node:assert/strict';
import { getUnsupportedWebPushBrowser, waitForActiveServiceWorker } from './pushRegistration.js';

test('DuckDuckGo on Windows is identified before attempting an unsupported push subscription', () => {
  assert.equal(getUnsupportedWebPushBrowser({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/151.0.0.0 Safari/537.36 DuckDuckGo/6',
    platform: 'Win32',
  }), 'duckduckgo-windows');
  assert.equal(getUnsupportedWebPushBrowser({ userAgent: 'Mozilla/5.0 (Macintosh) Ddg/1.120.0', platform: 'MacIntel' }), null);
  assert.equal(getUnsupportedWebPushBrowser({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Edg/151.0.0.0', platform: 'Win32' }), null);
});

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

