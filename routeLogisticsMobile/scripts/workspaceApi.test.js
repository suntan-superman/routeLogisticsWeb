const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), babel = require('@babel/core');
const events = require('../services/workQueryEvents');
let received, detach, resolveCall, reply, rejected, claims, workspace, callableCalls;
const auth = { currentUser: { uid: 'operator', emailVerified: true } }, moduleUnderTest = { exports: {} };
const file = path.resolve(__dirname, '../services/workspaceApi.js');
new Function('require', 'module', 'exports', babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, configFile: false, babelrc: false, plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code)(name => {
  if (name === 'firebase/functions') return { httpsCallable: (_functions, name, options) => { callableCalls.push({ name, options }); return async () => { if (resolveCall) await resolveCall; if (rejected) throw rejected; return { data: reply }; }; } };
  if (name === '../constants/firebase') return { functions: {}, auth };
  if (name === './tenancy') return { getClaims: () => claims, getWorkspace: () => workspace };
  if (name === './workQueryPolicy') return require('../services/workQueryPolicy');
  if (name === './workQueryEvents') return events;
  throw Error(name);
}, moduleUnderTest, moduleUnderTest.exports);
beforeEach(() => { received = []; callableCalls = []; detach = events.subscribeWorkWrites(event => received.push(event)); resolveCall = null; rejected = null; reply = { status: 'synced' }; claims = { companyId: 'acme', role: 'manager', membershipId: 'member' }; workspace = { status: 'company' }; auth.currentUser = { uid: 'operator', emailVerified: true }; });
afterEach(() => detach());
test('successful writes emit only identifiers and resource categories under their verified identity scope', async () => {
  await moduleUnderTest.exports.callWorkspace('rlManageJob', { action: 'update', id: 'job', job: { notes: 'Private work note never broadcast' } });
  assert.equal(received.length, 1); assert.deepEqual(received[0].resources, ['jobs']); assert.equal(received[0].jobId, 'job');
  assert.equal(JSON.stringify(received).includes('Private work note'), false);
  assert.equal(received[0].scope[2], 'operator'); assert.equal(received[0].scope[3], 'acme');
});
test('reads, GPS samples, rejected writes and version conflicts never emit successful-write events', async () => {
  await moduleUnderTest.exports.readWorkspace('jobs'); await moduleUnderTest.exports.callWorkspace('rlWorkShift', { action: 'status' }); await moduleUnderTest.exports.callWorkspace('rlUpdateWorkLocation', { action: 'position' });
  reply = { status: 'conflict' }; await moduleUnderTest.exports.callWorkspace('rlApplyJobOperation', { jobId: 'job' });
  rejected = new Error('Rejected'); await assert.rejects(moduleUnderTest.exports.callWorkspace('rlManageJob', { action: 'assign' }));
  assert.deepEqual(received, []);
});
test('read callers can set a narrow callable timeout without changing the request payload', async () => {
  await moduleUnderTest.exports.readWorkspace('jobs', { id: 'job' }, { timeout: 12000 });
  assert.deepEqual(callableCalls.at(-1), { name: 'rlReadWorkspace', options: { timeout: 12000 } });
  assert.deepEqual(received, []);
});
test('a late write response cannot invalidate another user or company after a scope switch', async () => {
  let release; resolveCall = new Promise(done => { release = done; });
  const pending = moduleUnderTest.exports.callWorkspace('rlManageJob', { action: 'update', id: 'job' });
  claims = { companyId: 'other', role: 'manager', membershipId: 'other-member' };
  release(); await pending; assert.deepEqual(received, []);
});
