const { test } = require('node:test');
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), babel = require('@babel/core');
function fixture() {
  const env = { allowed: true, claims: { companyId: 'acme', role: 'manager', membershipId: 'member' }, uid: 'manager', calls: [], base64: 'AAAA' };
  env.request = async () => ({ dataUri: 'data:application/pdf;base64,JVBERg==' });
  const mockRequire = name => {
    if (name.startsWith('@babel/runtime/')) return require(name);
    if (name === 'expo-image-manipulator') return { SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: async () => ({ uri: 'file:///compressed.jpg', base64: env.base64 }) };
    if (name === './workspaceApi') return { callWorkspace: async (name, data) => { env.calls.push({ name, ...data }); return env.request(); } };
    if (name === './tenancy') return { getPermissions: () => ({ can: () => env.allowed }), getClaims: () => env.claims };
    if (name === '../constants/firebase') return { auth: { get currentUser() { return env.uid ? { uid: env.uid } : null; } } };
    throw new Error(`Unexpected dependency ${name}`);
  };
  const filename = path.resolve(__dirname, '../services/estimateService.js'), module = { exports: {} };
  const transformed = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [require.resolve('babel-preset-expo')], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] });
  new Function('require', 'module', 'exports', transformed.code)(mockRequire, module, module.exports); env.api = module.exports; return env;
}
test('native estimate API rejects roles without estimate capability before any financial request', async () => {
  const env = fixture(); env.allowed = false; await assert.rejects(env.api.callEstimate('get', { estimateId: 'estimate' }), /permission/); assert.equal(env.calls.length, 0);
});
test('the native estimate service exposes preparation only, not formal PDF or delivery helpers', () => {
  const env = fixture(); assert.equal(env.api.shareEstimatePdf, undefined); assert.equal(env.api.downloadEstimatePdf, undefined); assert.equal(env.api.deliverEstimate, undefined);
});
test('overlarge photo compression remains a retryable preparation failure without uploading data', async () => {
  const env = fixture(); env.base64 = 'A'.repeat(2 * 1024 * 1024 + 1); await assert.rejects(env.api.prepareEstimatePhoto({ uri: 'file:///photo.jpg', width: 1600, height: 1200 }), /selection remains/); assert.equal(env.calls.length, 0);
});
