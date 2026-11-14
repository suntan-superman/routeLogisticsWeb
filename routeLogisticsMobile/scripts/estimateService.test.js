const { test } = require('node:test');
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), babel = require('@babel/core');
function fixture() {
  const env = { allowed: true, claims: { companyId: 'acme', role: 'manager', membershipId: 'member' }, uid: 'manager', calls: [], files: [], shared: [], deleted: [], shareFailure: null, base64: 'AAAA' };
  env.request = async () => ({ dataUri: 'data:application/pdf;base64,JVBERg==' });
  const mockRequire = name => {
    if (name.startsWith('@babel/runtime/')) return require(name);
    if (name === 'expo-image-manipulator') return { SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: async () => ({ uri: 'file:///compressed.jpg', base64: env.base64 }) };
    if (name === 'expo-file-system/legacy') return { cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' }, writeAsStringAsync: async (file, contents) => env.files.push({ file, contents }), deleteAsync: async file => env.deleted.push(file) };
    if (name === 'expo-sharing') return { isAvailableAsync: async () => true, shareAsync: async file => { env.shared.push(file); if (env.shareFailure) throw env.shareFailure; } };
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
test('private PDF export shares a cache-only file and deletes it after the OS share completes or fails', async () => {
  const env = fixture(); await env.api.shareEstimatePdf('estimate', 2); assert.equal(env.shared[0], 'file:///cache/estimate-estimate-v2.pdf'); assert.deepEqual(env.deleted, env.shared); assert.equal(env.files[0].contents, 'JVBERg==');
  env.shareFailure = new Error('Share sheet failed'); await assert.rejects(env.api.shareEstimatePdf('estimate', 2), /Share sheet/); assert.equal(env.deleted.length, 2);
});
test('a role or account change during PDF retrieval cannot open a share sheet or create a private file', async () => {
  const env = fixture(); let finish; env.request = () => new Promise(resolve => { finish = resolve; }); const result = env.api.shareEstimatePdf('estimate', 2);
  env.claims = { companyId: 'other', role: 'technician', membershipId: 'other' }; env.allowed = false; finish({ dataUri: 'data:application/pdf;base64,JVBERg==' }); await assert.rejects(result, /work account changed/); assert.equal(env.files.length, 0); assert.equal(env.shared.length, 0);
});
test('overlarge photo compression remains a retryable preparation failure without uploading data', async () => {
  const env = fixture(); env.base64 = 'A'.repeat(2 * 1024 * 1024 + 1); await assert.rejects(env.api.prepareEstimatePhoto({ uri: 'file:///photo.jpg', width: 1600, height: 1200 }), /selection remains/); assert.equal(env.calls.length, 0);
});
