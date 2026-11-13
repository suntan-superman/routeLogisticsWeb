const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getMobileFirebaseConfig, validateFirebaseConfig } = require('../constants/firebaseConfig');

test('default mobile configuration targets the existing Firebase project without local environment files', () => {
  const names = Object.keys(process.env).filter(name => name.startsWith('EXPO_PUBLIC_FIREBASE_'));
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  try {
    const config = getMobileFirebaseConfig();
    assert.equal(config.projectId, 'mi-factotum-field-service');
    assert.equal(config.messagingSenderId, '1030013411579');
    assert.equal(config.appId, '1:1030013411579:web:37cdb1ce1e57c1e75c505e');
    assert.ok(/^AIza[0-9A-Za-z_-]{35}$/.test(config.apiKey));
  } finally { Object.assign(process.env, previous); }
});

test('placeholder and cross-project overrides fail before native initialization', () => {
  const valid = getMobileFirebaseConfig();
  for (const [field, value] of Object.entries({ apiKey: 'YOUR_FIREBASE_API_KEY_HERE', projectId: 'another-project', messagingSenderId: '123', storageBucket: 'another-project.appspot.com', authDomain: 'another-project.firebaseapp.com', appId: '1:123:web:abc' })) {
    assert.throws(() => validateFirebaseConfig({ ...valid, [field]: value }), new RegExp(field));
  }
});

test('environment overrides are shared and invalid ones report field names without values', () => {
  const previous = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'do-not-print-this-value';
  try {
    assert.throws(getMobileFirebaseConfig, error => error.message.includes('projectId') && !error.message.includes('do-not-print-this-value'));
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
    else process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = previous;
  }
});
