const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { paymentHandlers, reconcilePayment, amountInCents } = require('../functions/payments');
let app, db, provider, handlers, intent, creates = 0;
const auth = { uid: 'payment-owner', token: { companyId: 'payment-co', role: 'owner', email_verified: true } };
const request = { auth, data: { invoiceId: 'payment-invoice', total: 1, currency: 'eur' } };
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'payment-tests'); db = getFirestore(app);
  await db.doc('companies/payment-co').set({ ownerId: auth.uid });
  await db.doc('customers/payment-customer').set({ companyId: 'payment-co', email: 'payer@payments.test' });
  await db.doc('invoices/payment-invoice').set({ companyId: 'payment-co', userId: auth.uid, customerId: 'payment-customer', status: 'sent', total: 20 });
  provider = { paymentIntents: { create: async (data) => { if (!intent) { creates++; intent = { ...data, id: 'pi_test', livemode: false, status: 'requires_payment_method', client_secret: 'test-client-secret' }; } return { ...intent }; }, retrieve: async () => ({ ...intent }) }, charges: { retrieve: async () => ({ amount_refunded: 500, disputed: false }) } };
  handlers = paymentHandlers(db, () => provider, { enabled: () => true });
});
after(() => deleteApp(app));
test('payment amount validation rejects unsupported, negative and fractional-cent values', () => {
  for (const total of [NaN, -1, 0, 1.001, Infinity]) assert.throws(() => amountInCents({ total }));
  assert.throws(() => amountInCents({ total: 10, currency: 'eur' }));
  assert.equal(amountInCents({ total: 20 }), 2000);
});
test('concurrent intent creation uses server totals, preserves durable identity and enforces tenant access', async () => {
  const results = await Promise.all([handlers.create(request), handlers.create(request)]);
  assert.equal(creates, 1); assert.equal(intent.amount, 2000); assert.equal(intent.currency, 'usd');
  assert.equal(results[0].intentId, results[1].intentId);
  await assert.rejects(handlers.create({ auth: { uid: 'other', token: { companyId: 'other' } }, data: request.data }));
  await assert.rejects(handlers.create({ auth: { uid: 'portal', token: { portal: true, portalEmail: 'wrong@payments.test' } }, data: request.data }));
  assert.equal((await handlers.status({ auth: { uid: 'portal', token: { portal: true, portalEmail: 'payer@payments.test' } }, data: request.data })).amount, 2000);
});
test('test settlement is idempotent and cannot mark a production invoice paid', async () => {
  intent.status = 'succeeded'; intent.amount_received = 2000;
  const event = { id: 'evt_payment_success', type: 'payment_intent.succeeded', livemode: false, created: 1, data: { object: intent } };
  await Promise.all([reconcilePayment(db, provider, event, 'test'), reconcilePayment(db, provider, event, 'test')]);
  const invoice = await db.doc('invoices/payment-invoice').get();
  assert.equal(invoice.get('status'), 'sent'); assert.equal(invoice.get('testPaymentStatus'), 'succeeded'); assert.equal(invoice.get('paymentLock'), null);
  assert.equal((await db.collection('rlPaymentEvents').where('invoiceId', '==', 'payment-invoice').get()).size, 1);
});
test('refund reconciliation uses provider state and older failure events cannot regress settlement', async () => {
  intent.latest_charge = 'ch_test';
  await reconcilePayment(db, provider, { id: 'evt_refund', type: 'charge.refunded', livemode: false, created: 2, data: { object: { id: 'ch_test', payment_intent: intent.id } } }, 'test');
  await reconcilePayment(db, provider, { id: 'evt_old_failure', type: 'payment_intent.payment_failed', livemode: false, created: 0, data: { object: { id: intent.id } } }, 'test');
  assert.equal((await handlers.status(request)).status, 'partially_refunded');
});
test('void invoices, unapproved live mode and unsigned webhooks are rejected', async () => {
  await db.doc('invoices/payment-invoice').update({ status: 'void' });
  await assert.rejects(handlers.create(request));
  const live = paymentHandlers(db, () => provider, { enabled: () => true, mode: () => 'live' });
  await assert.rejects(live.create(request), { code: 'failed-precondition' });
  provider.webhooks = new (req('stripe'))('sk_test_fixture').webhooks;
  let status;
  await handlers.webhook({ rawBody: Buffer.from('{}'), headers: {} }, { status: (code) => { status = code; return { send() {} }; } }, 'whsec_fixture');
  assert.equal(status, 400);
});
