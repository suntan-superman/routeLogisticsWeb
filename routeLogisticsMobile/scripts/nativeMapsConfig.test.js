const test = require('node:test');
const assert = require('node:assert/strict');
const { getNativeMapsConfig } = require('../constants/nativeMapsConfig');

test('missing or placeholder Android map key leaves native map disabled without changing Firebase', () => {
  for (const key of ['', 'YOUR_API_KEY', 'test', 'AIza-invalid']) {
    assert.deepEqual(getNativeMapsConfig({ EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY: key }), { android: {}, androidConfigured: false });
  }
});
test('dedicated Android native client key takes precedence over the legacy client variable', () => {
  const dedicated = 'AIza' + 'a'.repeat(35), legacy = 'AIza' + 'b'.repeat(35);
  const result = getNativeMapsConfig({ EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY: dedicated, EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: legacy });
  assert.equal(result.android.googleMaps.apiKey, dedicated); assert.equal(result.androidConfigured, true);
  assert.equal(getNativeMapsConfig({ EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: legacy }).android.googleMaps.apiKey, legacy);
});

test('native prebuild bounds CMake object paths idempotently without changing new architecture or signing', () => {
  const { configureCmakePaths } = require('../plugins/withAndroidCmakePaths');
  const original = 'android { defaultConfig { applicationId "com.workside.routelogistics" } }';
  const configured = configureCmakePaths(original);
  assert.equal(configureCmakePaths(configured), configured);
  assert.ok(configured.startsWith(original)); assert.match(configured, /CMAKE_OBJECT_PATH_MAX=256/);
  assert.match(configured, /buildStagingDirectory.*\.migration\/cxx/);
  assert.doesNotMatch(configured, /newArchEnabled|signingConfig/);
});
