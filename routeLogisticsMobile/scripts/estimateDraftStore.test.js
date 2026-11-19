const { test } = require('node:test');
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), babel = require('@babel/core');

function fixture() {
  const storage = new Map(), files = new Map();
  const env = { uid: 'tech-a', claims: { companyId: 'acme', membershipId: 'member-a', role: 'technician' }, storage, files, copies: [], deleted: [] };
  const mockRequire = name => {
    if (name.startsWith('@babel/runtime/')) return require(name);
    if (name === '@react-native-async-storage/async-storage') return { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key) };
    if (name === 'expo-file-system/legacy') return { documentDirectory: 'file:///documents/', makeDirectoryAsync: async uri => files.set(uri, 'directory'), copyAsync: async ({ from, to }) => { env.copies.push({ from, to }); files.set(to, files.get(from) || 'photo'); }, deleteAsync: async uri => { env.deleted.push(uri); files.delete(uri); } };
    if (name === '../constants/firebase') return { auth: { app: { options: { projectId: 'mi-factotum-field-service' } }, get currentUser() { return env.uid ? { uid: env.uid } : null; } } };
    if (name === './tenancy') return { getClaims: () => env.claims };
    if (name === './offlineTimings') return { recordOfflineTiming() {} };
    throw new Error(`Unexpected dependency ${name}`);
  };
  const filename = path.resolve(__dirname, '../services/estimateDraftStore.js'), module = { exports: {} };
  const transformed = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [require.resolve('babel-preset-expo')], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] });
  new Function('require', 'module', 'exports', transformed.code)(mockRequire, module, module.exports); env.api = module.exports; return env;
}

test('estimate drafts survive a process-style reload with stable operation, revision and exact scoped content', async () => {
  const env = fixture(), identity = 'visit:assigned-visit';
  const first = await env.api.saveEstimateDraft(identity, { draft: { scopeOfWork: 'Inspect attic', technicianNotes: 'Call before arrival', lineItems: [{ kind: 'labor', description: 'Inspection', quantity: '1', unitPrice: '75.00' }] }, photos: [], operationId: 'stable-operation', syncState: 'waiting' });
  const second = await env.api.saveEstimateDraft(identity, { ...first, draft: { ...first.draft, scopeOfWork: 'Inspect attic and eaves' } });
  const restored = await env.api.loadEstimateDraft(identity);
  assert.equal(restored.draft.scopeOfWork, 'Inspect attic and eaves'); assert.equal(restored.operationId, 'stable-operation'); assert.equal(restored.syncState, 'waiting'); assert.equal(restored.draftRevision, 2); assert.match(restored.localEditedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('draft keys isolate company, user, membership and role and never expose another workspace draft', async () => {
  const env = fixture(); await env.api.saveEstimateDraft('visit:one', { draft: { scopeOfWork: 'Private scope' }, photos: [] });
  env.uid = 'tech-b'; env.claims = { companyId: 'other', membershipId: 'member-b', role: 'technician' };
  assert.equal(await env.api.loadEstimateDraft('visit:one'), null);
  env.uid = 'tech-a'; env.claims = { companyId: 'acme', membershipId: 'replacement-membership', role: 'technician' };
  assert.equal(await env.api.loadEstimateDraft('visit:one'), null);
  env.claims = { companyId: 'acme', membershipId: 'member-a', role: 'manager' };
  assert.equal(await env.api.loadEstimateDraft('visit:one'), null);
});

test('offline estimate photos are copied to durable app storage and removed only on explicit confirmed discard', async () => {
  const env = fixture(), retained = await env.api.retainEstimatePhoto('visit:one', 'photo-one', { uri: 'file:///picker/temporary.jpg', width: 1200, height: 900 });
  assert.match(retained.uri, /^file:\/\/\/documents\/rl-estimate-drafts\//); assert.equal(env.copies.length, 1); assert.equal(env.deleted.length, 0);
  await env.api.saveEstimateDraft('visit:one', { draft: { scopeOfWork: 'Photo scope' }, photos: [{ id: 'photo-one', uri: retained.uri }], syncState: 'waiting' });
  assert.equal((await env.api.loadEstimateDraft('visit:one')).photos[0].uri, retained.uri);
  await env.api.discardEstimateDraft('visit:one', [{ uri: retained.uri }, { uri: 'https://private.example.invalid/photo' }]);
  assert.deepEqual(env.deleted, [retained.uri]); assert.equal(await env.api.loadEstimateDraft('visit:one'), null);
});
