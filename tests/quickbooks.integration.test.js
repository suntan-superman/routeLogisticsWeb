const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { quickBooksHandlers, mappingId, validSignature } = require('../functions/quickbooks');
let app, db, qb, calls = [], writes = false, syncToken = '0', refreshes = 0;
const auth = { uid: 'qb-owner', token: { companyId: 'qb-co', role: 'owner', email_verified: true } }, request = (data = {}) => ({ auth, data });
const config = { enabled: () => true, environment: () => 'sandbox', writesEnabled: () => writes, clientId: () => 'fixture', clientSecret: () => 'fixture', redirectUri: () => 'https://example.test/callback', appUrl: () => 'https://example.test', webhookSecret: () => 'fixture-verifier' };
const connectionPath = `rlQuickBooksConnections/${mappingId('qb-co', 'sandbox', 'connection', 'current')}`;
const transport = async (url, options) => {
  calls.push({ url, options });
  if (url.includes('/tokens/bearer')) { refreshes++; return { ok: true, json: async () => ({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600 }) }; }
  const entity = url.includes('/invoice') ? 'Invoice' : url.includes('/item') ? 'Item' : 'Customer';
  const posted = options.body ? JSON.parse(options.body) : {};
  return { ok: true, json: async () => ({ [entity]: { ...posted, Id: '123', SyncToken: syncToken, DisplayName: 'Fixture', TotalAmt: 20, Balance: 0, CurrencyRef: { value: 'USD' } } }) };
};
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'qb-tests'); db = getFirestore(app);
  await db.doc('companies/qb-co').set({ ownerId: auth.uid });
  await db.doc('customers/qb-customer').set({ companyId: 'qb-co', name: 'Fixture Customer', email: 'fixture@example.test', quickbooksCustomerId: '123' });
  await db.doc('invoices/qb-invoice').set({ companyId: 'qb-co', customerId: 'qb-customer', status: 'sent', total: 20, tax: 0, lineItems: [{ description: 'Service', amount: 20, unitPrice: 20, quantity: 1 }] });
  qb = quickBooksHandlers(db, config, transport);
});
after(() => deleteApp(app));
test('production accounting requires explicit operator approval for OAuth and reconciliation', async () => {
  const production = quickBooksHandlers(db, { ...config, environment: () => 'production', productionApproved: () => false, writesEnabled: () => true }, transport);
  const before = calls.length;
  await assert.rejects(production.begin(request()), { code: 'failed-precondition' });
  await assert.rejects(production.reconcile(request({ localId: 'qb-invoice' })), { code: 'failed-precondition' });
  const status = await production.status(request()); assert.equal(status.enabled, false); assert.equal(status.writesEnabled, false); assert.equal(status.health, 'awaiting-production-approval');
  assert.equal(calls.length, before);
});
test('QuickBooks OAuth uses owner-bound single-use state and never returns credentials', async () => {
  await assert.rejects(qb.begin({ auth: { uid: 'outsider', token: auth.token }, data: {} }), { code: 'permission-denied' });
  const begin = await qb.begin(request()), url = new URL(begin.url), state = url.searchParams.get('state');
  let result;
  const res = { redirect: (code, target) => { result = { code, target }; }, status: (code) => ({ send: () => { result = { code }; } }) };
  await qb.callback({ query: { state, code: 'fixture-code', realmId: '456' } }, res); assert.equal(result.code, 303);
  await qb.callback({ query: { state, code: 'fixture-code', realmId: '456' } }, res); assert.equal(result.code, 400);
  const status = await qb.status(request()); assert.equal(status.connected, true); assert.equal(status.realmId, '456'); assert.equal(status.accessToken, undefined); assert.equal(status.refreshToken, undefined);
});
test('token refresh serializes rotation and saves the latest refresh token', async () => {
  await db.doc(connectionPath).update({ accessExpiresAt: 0 }); const before = refreshes;
  const results = await Promise.allSettled([qb.connection('qb-co'), qb.connection('qb-co')]);
  assert.ok(results.some((value) => value.status === 'fulfilled')); assert.equal(refreshes, before + 1); assert.equal((await db.doc(connectionPath).get()).get('refreshLeaseUntil'), 0);
});
test('legacy IDs require explicit adoption, cross-tenant mappings fail, and provider changes cause conflicts', async () => {
  const original = await qb.preview(request({ type: 'Customer', localId: 'qb-customer' })); assert.equal(original.action, 'create');
  await assert.rejects(qb.adopt(request({ type: 'Customer', localId: 'missing', remoteId: '123' })), { code: 'permission-denied' });
  await qb.adopt(request({ type: 'Customer', localId: 'qb-customer', remoteId: '123' }));
  assert.equal((await qb.preview(request({ type: 'Customer', localId: 'qb-customer' }))).action, 'update');
  syncToken = '1'; await assert.rejects(qb.preview(request({ type: 'Customer', localId: 'qb-customer' })), { code: 'aborted' }); syncToken = '0';
});
test('accounting writes stay disabled until explicitly configured and reviewed', async () => {
  const preview = await qb.preview(request({ type: 'Customer', localId: 'qb-customer' })), before = calls.length;
  await assert.rejects(qb.sync(request({ type: 'Customer', localId: 'qb-customer', fingerprint: preview.fingerprint })), { code: 'failed-precondition' }); assert.equal(calls.length, before);
  writes = true;
  await qb.sync(request({ type: 'Customer', localId: 'qb-customer', fingerprint: preview.fingerprint }));
  const posts = calls.filter((call) => call.options.method === 'POST' && call.url.includes('/v3/company/'));
  assert.equal(posts.length, 1); assert.ok(new URL(posts[0].url).searchParams.get('requestid'));
  await qb.sync(request({ type: 'Customer', localId: 'qb-customer', fingerprint: preview.fingerprint }));
  assert.equal(calls.filter((call) => call.options.method === 'POST' && call.url.includes('/v3/company/')).length, 1); writes = false;
});
test('sandbox payment reconciliation never marks a real invoice paid and remains idempotent', async () => {
  await qb.adopt(request({ type: 'Invoice', localId: 'qb-invoice', remoteId: '123' }));
  await qb.reconcile(request({ localId: 'qb-invoice' })); await qb.reconcile(request({ localId: 'qb-invoice' }));
  const invoice = await db.doc('invoices/qb-invoice').get(); assert.equal(invoice.get('status'), 'sent'); assert.equal(invoice.get('qbTestPaymentStatus'), 'paid');
  assert.equal((await db.collection('rlQbReconciliations').where('companyId', '==', 'qb-co').get()).size, 1);
});
test('a lost accounting response retries the identical request without duplicating an export', async () => {
  await db.doc('customers/qb-retry').set({ companyId: 'qb-co', name: 'Retry fixture' });
  const submitted = []; let first = true;
  const retryTransport = async (url, options) => {
    if (options.method === 'POST' && url.includes('/v3/company/')) { submitted.push({ url, body: options.body }); if (first) { first = false; throw new Error('Simulated lost response'); } return { ok: true, json: async () => ({ Customer: { Id: '124', SyncToken: '1' } }) }; }
    return transport(url, options);
  };
  const retry = quickBooksHandlers(db, { ...config, writesEnabled: () => true }, retryTransport);
  const preview = await retry.preview(request({ type: 'Customer', localId: 'qb-retry' }));
  const data = { type: 'Customer', localId: 'qb-retry', fingerprint: preview.fingerprint };
  await assert.rejects(retry.sync(request(data)), /Simulated lost response/);
  await retry.sync(request(data)); await retry.sync(request(data));
  assert.equal(submitted.length, 2); assert.deepEqual(submitted[0], submitted[1]);
});
test('webhook signatures are raw-body verified and duplicate notifications create one event', async () => {
  const rawBody = Buffer.from(JSON.stringify({ eventNotifications: [{ realmId: '456', dataChangeEvent: { entities: [{ name: 'Invoice', id: '123', operation: 'Update', lastUpdated: '2026-11-13' }] } }] }));
  const signature = createHmac('sha256', config.webhookSecret()).update(rawBody).digest('base64');
  assert.ok(validSignature(rawBody, signature, config.webhookSecret())); assert.equal(validSignature(Buffer.from('{}'), signature, config.webhookSecret()), false);
  let code; const res = { status: (value) => ({ send: () => { code = value; } }) };
  await qb.webhook({ rawBody, headers: { 'intuit-signature': 'bad' } }, res); assert.equal(code, 401);
  await qb.webhook({ rawBody, headers: { 'intuit-signature': signature } }, res); await qb.webhook({ rawBody, headers: { 'intuit-signature': signature } }, res); assert.equal(code, 200);
  assert.equal((await db.collection('rlQbWebhookEvents').where('companyId', '==', 'qb-co').get()).size, 1);
  await qb.drain(); assert.equal((await db.collection('rlQbWebhookEvents').where('companyId', '==', 'qb-co').get()).docs[0].get('status'), 'reconciled');
});

test('accounting invoice export rejects missing, non-numeric, negative and non-finite totals', async () => {
  await db.doc(connectionPath).update({ defaultItemId: '123' });
  for (const total of [undefined, null, 'invalid', NaN, Infinity, -1]) {
    const invoice = { companyId: 'qb-co', customerId: 'qb-customer', status: 'sent', tax: 0, lineItems: [{ description: 'Service', amount: 20, unitPrice: 20, quantity: 1 }], ...(total === undefined ? {} : { total }) };
    await db.doc('invoices/qb-invalid-total').set(invoice);
    await assert.rejects(qb.preview(request({ type: 'Invoice', localId: 'qb-invalid-total' })), { code: 'failed-precondition' });
  }
});
