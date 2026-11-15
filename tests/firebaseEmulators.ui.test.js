const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
function fixture(enabled, hostname = '127.0.0.1') {
  const calls = [];
  const source = fs.readFileSync(path.join(__dirname, '../routeLogisticsWeb/src/services/emulators.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replaceAll('export function', 'function')
    .replaceAll('import.meta.env', 'env').replaceAll('globalThis.location', 'location');
  const api = new Function('env', 'location', 'connectAuthEmulator', 'connectFirestoreEmulator', 'connectFunctionsEmulator', 'connectStorageEmulator', `${source}; return { connect: connectLocalEmulators, transport: localFirestoreTransport };`)
    ({ VITE_FIREBASE_EMULATORS: enabled }, { hostname }, ...['auth','firestore','functions','storage'].map(kind => (...args) => calls.push({ kind, args })));
  return { calls, ...api };
}
test('emulator streaming compatibility options never change production Firestore transport', () => {
  assert.deepEqual(fixture(undefined).transport(), {});
  assert.deepEqual(fixture('false').transport(), {});
  assert.deepEqual(fixture('true').transport(), { experimentalForceLongPolling: true, experimentalAutoDetectLongPolling: false, useFetchStreams: false });
});
test('normal web initialization never connects to emulators', () => {
  const f = fixture(undefined, 'route-logistics.com');
  f.connect({ auth: {}, db: {}, functions: {}, storage: {} }, 'mi-factotum-field-service');
  assert.deepEqual(f.calls, []);
});
test('emulator opt-in rejects real project IDs before connecting any SDK', () => {
  const f = fixture('true');
  assert.throws(() => f.connect({ auth: {} }, 'mi-factotum-field-service'), /demo project/);
  assert.deepEqual(f.calls, []);
});
test('emulator opt-in rejects hosted browser origins', () => {
  const f = fixture('true', 'route-logistics.com');
  assert.throws(() => f.connect({ auth: {} }, 'demo-routelogistics'), /localhost/);
  assert.deepEqual(f.calls, []);
});
test('both staff and isolated portal apps connect only to fixed loopback emulator ports', () => {
  const f = fixture('true');
  f.connect({ auth: 'staff', db: 'db', functions: 'staff-functions', storage: 'storage' }, 'demo-routelogistics');
  f.connect({ auth: 'portal', functions: 'portal-functions' }, 'demo-routelogistics');
  assert.deepEqual(f.calls.map(row => [row.kind, ...row.args.slice(0, 3)]), [
    ['auth','staff','http://127.0.0.1:9099',{ disableWarnings: true }], ['firestore','db','127.0.0.1',8080],
    ['functions','staff-functions','127.0.0.1',5001], ['storage','storage','127.0.0.1',9199],
    ['auth','portal','http://127.0.0.1:9099',{ disableWarnings: true }], ['functions','portal-functions','127.0.0.1',5001],
  ]);
});
