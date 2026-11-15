const { test } = require('node:test');
const assert = require('node:assert/strict');
const { aboutAppMessage } = require('../services/appInfo');

test('About identifies the installed EAS binary instead of checked-in version/build placeholders', () => {
  const text = aboutAppMessage({ application: { nativeApplicationVersion: '1.2.3', nativeBuildVersion: '42' }, config: { version: '1.0.0', ios: { buildNumber: '1' } }, platform: { OS: 'ios', Version: '26.1' }, executionEnvironment: 'standalone' });
  assert.match(text, /Version: 1\.2\.3\nBuild: 42\nPlatform: iOS 26\.1/);
  assert.doesNotMatch(text, /1\.0\.0|preview/);
});

test('Android support details show its installed versionCode and OS level', () => {
  const text = aboutAppMessage({ application: { nativeApplicationVersion: '1.0.0', nativeBuildVersion: '19' }, platform: { OS: 'android', Version: 35 } });
  assert.match(text, /Version: 1\.0\.0\nBuild: 19\nPlatform: Android \(API 35\)/);
});

test('Expo Go never reports the Expo host version or host build as Route Logistics', () => {
  const text = aboutAppMessage({ application: { nativeApplicationVersion: '54.0.0', nativeBuildVersion: '999' }, config: { version: '1.0.0', ios: { buildNumber: '1' } }, executionEnvironment: 'storeClient', platform: { OS: 'ios' } });
  assert.match(text, /Version: 1\.0\.0 \(preview\)\nBuild: Unavailable in preview/);
  assert.doesNotMatch(text, /54\.0\.0|999|Build: 1/);
});

test('missing native metadata is explicit and never presents configured build numbers as installed', () => {
  assert.match(aboutAppMessage({ config: { version: '1.0.0', ios: { buildNumber: '1' } }, platform: { OS: 'ios' } }), /Version: 1\.0\.0 \(preview\)\nBuild: Unavailable/);
  assert.match(aboutAppMessage(), /Version: Unavailable\nBuild: Unavailable/);
  const web = aboutAppMessage({ application: { nativeBuildVersion: '999' }, config: { version: '1.0.0' }, platform: { OS: 'web' } });
  assert.match(web, /Platform: Web preview/); assert.doesNotMatch(web, /999|undefined|null/);
});
