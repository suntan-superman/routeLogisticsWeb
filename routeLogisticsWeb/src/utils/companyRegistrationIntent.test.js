import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureCompanyAuthorization, companyAuthorization, clearCompanyAuthorization } from './companyRegistrationIntent.js';

test('company authorization stays in this browser session, leaves the URL and clears after use', () => {
  const code = 'A'.repeat(43);
  const values = new Map();
  const previous = globalThis.window;
  globalThis.window = {
    location: { hash: `#authorization=${code}`, pathname: '/onboarding', search: '' },
    history: { state: null, replaceState: (_state, _title, path) => { assert.equal(path, '/onboarding'); globalThis.window.location.hash = ''; } },
    sessionStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
  };
  try {
    captureCompanyAuthorization();
    assert.equal(companyAuthorization(), code);
    assert.equal(globalThis.window.location.hash, '');
    clearCompanyAuthorization();
    assert.equal(companyAuthorization(), '');
    globalThis.window.location.hash = '#authorization=invalid';
    captureCompanyAuthorization();
    assert.equal(companyAuthorization(), '');
  } finally { globalThis.window = previous; }
});
