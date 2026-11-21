const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const req = createRequire(resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { allocateDocumentNumber } = require('../functions/shared/documentNumbers');

let app, db;
before(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'document-number-tests');
  db = getFirestore(app);
});
after(() => deleteApp(app));

test('concurrent approvals allocate distinct tenant-local numbers without reusing a committed number', async () => {
  const base = { companyId: 'number-test-acme', kind: 'E', timeZone: 'America/Los_Angeles', date: '2026-11-21T18:00:00Z' };
  const create = options => db.runTransaction(tx => allocateDocumentNumber(tx, db, options), { maxAttempts: 20 });
  const numbers = await Promise.all(Array.from({ length: 12 }, () => create(base)));
  assert.deepEqual(numbers.sort(), Array.from({ length: 12 }, (_, i) => `20261121-E${String(i + 1).padStart(3, '0')}`));
  assert.equal(await create(base), '20261121-E013');
  assert.equal(await create({ ...base, kind: 'I' }), '20261121-I001');
  assert.equal(await create({ ...base, companyId: 'number-test-bls' }), '20261121-E001');
  assert.equal(await create({ ...base, date: '2026-11-22T18:00:00Z' }), '20261122-E001');
});
