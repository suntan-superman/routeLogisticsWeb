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

// Provider calls stay in memory. Only Stripe's local signature utilities are used.
async function fixture(name) {
  const invoiceId = `stripe-${name}`;
  const companyId = `payment-co-${name}`, userId = `payment-owner-${name}`, customerId = `payment-customer-${name}`;
  const fixtureAuth = { uid: userId, token: { companyId, role: 'owner', email_verified: true } };
  const invoiceRef = db.doc(`invoices/${invoiceId}`);
  await db.doc(`companies/${companyId}`).set({ ownerId: userId });
  await db.doc(`customers/${customerId}`).set({ companyId, email: 'payer@payments.test' });
  await invoiceRef.set({ companyId, userId, customerId, status: 'sent', total: 20, currency: 'usd' });
  let current;
  const charge = { id: `ch_${name}`, amount_refunded: 0, disputed: false };
  const dispute = { id: `dp_${name}`, status: 'needs_response' };
  const stripe = {
    paymentIntents: {
      create: async data => (current = { ...data, id: `pi_${name}`, livemode: false, status: 'requires_payment_method', client_secret: 'fixture-only' }),
      retrieve: async () => ({ ...current, metadata: { ...current.metadata } }),
      cancel: async () => { current.status = 'canceled'; return { ...current }; },
    },
    charges: { retrieve: async () => ({ ...charge }) },
    disputes: { retrieve: async () => ({ ...dispute }) },
    webhooks: new (req('stripe'))('rk_test_fixture').webhooks,
  };
  const handlers = paymentHandlers(db, () => stripe, { enabled: () => true });
  const request = { auth: fixtureAuth, data: { invoiceId, amount: 1, currency: 'eur' } };
  await handlers.create(request);
  return { handlers, stripe, intent: current, charge, dispute, invoiceRef, request, paymentRef: db.doc(`rlPayments/${current.metadata.rlPaymentId}`) };
}

async function signedWebhook(f, event, options = {}) {
  const payload = JSON.stringify(event);
  const signature = f.stripe.webhooks.generateTestHeaderString({ payload, secret: options.secret || 'whsec_fixture', ...(options.timestamp ? { timestamp: options.timestamp } : {}) });
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, send(body) { this.body = body; return this; }, json(body) { this.body = body; return this; } };
  await f.handlers.webhook({ rawBody: Buffer.from(options.body || payload), headers: { 'stripe-signature': signature } }, response, 'whsec_fixture');
  return response;
}

test('valid signed test callbacks reconcile once under concurrent delivery without settling the invoice', async () => {
  const f = await fixture('signed');
  f.intent.status = 'succeeded'; f.intent.amount_received = 2000; f.intent.latest_charge = f.charge.id;
  const event = { id: 'evt_signed_success', type: 'payment_intent.succeeded', livemode: false, created: 10, data: { object: { id: f.intent.id } } };
  const responses = await Promise.all([signedWebhook(f, event), signedWebhook(f, event)]);
  assert.ok(responses.every(r => r.statusCode === 200 && r.body.received));
  assert.equal((await f.invoiceRef.get()).get('status'), 'sent');
  assert.equal((await f.invoiceRef.get()).get('testPaymentStatus'), 'succeeded');
  assert.equal((await db.collection('rlPaymentEvents').where('invoiceId', '==', f.invoiceRef.id).get()).size, 1);
});

test('tampered, incorrectly signed and expired webhook signatures cannot write reconciliation records', async () => {
  const f = await fixture('signature');
  const event = { id: 'evt_signature_rejected', type: 'payment_intent.succeeded', livemode: false, created: 11, data: { object: { id: f.intent.id } } };
  for (const options of [{ body: JSON.stringify({ ...event, id: 'evt_tampered' }) }, { secret: 'whsec_wrong' }, { timestamp: Math.floor(Date.now() / 1000) - 1000 }]) {
    assert.equal((await signedWebhook(f, event, options)).statusCode, 400);
  }
  assert.equal((await db.doc(`rlPaymentEvents/${event.id}`).get()).exists, false);
  assert.equal((await f.invoiceRef.get()).get('testPaymentStatus'), undefined);
});

test('all eight supported event types reconcile current provider state, including refunds and disputes', async () => {
  const f = await fixture('events');
  f.intent.latest_charge = f.charge.id;
  const cases = [
    ['payment_intent.processing', 'processing', 0, null, 'processing'],
    ['payment_intent.payment_failed', 'requires_payment_method', 0, null, 'requires_payment_method'],
    ['payment_intent.canceled', 'canceled', 0, null, 'canceled'],
    ['payment_intent.succeeded', 'succeeded', 0, null, 'succeeded'],
    ['charge.refunded', 'succeeded', 500, null, 'partially_refunded'],
    ['charge.dispute.created', 'succeeded', 500, 'needs_response', 'disputed'],
    ['charge.dispute.updated', 'succeeded', 500, 'under_review', 'disputed'],
    ['charge.dispute.closed', 'succeeded', 500, 'won', 'partially_refunded'],
  ];
  for (const [index, [type, status, refunded, disputeStatus, expected]] of cases.entries()) {
    Object.assign(f.intent, { status, amount_received: status === 'succeeded' ? 2000 : 0 });
    f.charge.amount_refunded = refunded;
    if (disputeStatus) f.dispute.status = disputeStatus;
    const object = type.startsWith('payment_intent.') ? { id: f.intent.id } : { id: disputeStatus ? f.dispute.id : f.charge.id, payment_intent: f.intent.id };
    const response = await signedWebhook(f, { id: `evt_supported_${index}`, type, livemode: false, created: 20 + index, data: { object } });
    assert.equal(response.statusCode, 200);
    assert.equal((await f.paymentRef.get()).get('status'), expected);
    assert.equal((await f.invoiceRef.get()).get('status'), 'sent');
  }
});

test('invoice amount, currency and ownership changes require review instead of reconciliation', async () => {
  const changes = [{ total: 25 }, { currency: 'eur' }, { userId: 'other-owner' }, { companyId: 'other-company' }, { customerId: 'other-customer' }];
  for (const [index, patch] of changes.entries()) {
    const f = await fixture(`mismatch-${index}`);
    await f.invoiceRef.update(patch);
    Object.assign(f.intent, { status: 'succeeded', amount_received: 2000 });
    const event = { id: `evt_mismatch_${index}`, type: 'payment_intent.succeeded', livemode: false, created: 40, data: { object: { id: f.intent.id } } };
    const result = await reconcilePayment(db, f.stripe, event, 'test');
    assert.equal(result.reviewRequired, true);
    assert.equal((await f.invoiceRef.get()).get('testPaymentStatus'), undefined);
    assert.equal((await f.invoiceRef.get()).get('status'), 'sent');
  }
});

test('retrieved intents with foreign tenant metadata never expose a client secret', async () => {
  const f = await fixture('foreign-intent');
  f.intent.metadata.rlCompanyId = 'other-company';
  await assert.rejects(f.handlers.create(f.request), { code: 'failed-precondition' });
});

test('wrong-mode and non-RL events do not modify invoices', async () => {
  const f = await fixture('foreign-event');
  const event = { id: 'evt_wrong_mode', type: 'payment_intent.succeeded', livemode: true, created: 50, data: { object: { id: f.intent.id } } };
  await assert.rejects(reconcilePayment(db, f.stripe, event, 'test'), /mode mismatch/);
  f.intent.metadata = {};
  assert.deepEqual(await reconcilePayment(db, f.stripe, { ...event, id: 'evt_mf_ignored', livemode: false }, 'test'), { ignored: true });
  assert.deepEqual(await reconcilePayment(db, f.stripe, { ...event, id: 'evt_unsupported', livemode: false, type: 'customer.created' }, 'test'), { ignored: true });
  assert.equal((await f.invoiceRef.get()).get('testPaymentStatus'), undefined);
  assert.equal((await db.doc('rlPaymentEvents/evt_mf_ignored').get()).exists, false);
});

test('manager cancellation reconciles and unlocks the invoice while portal cancellation is forbidden', async () => {
  const f = await fixture('cancel');
  await assert.rejects(f.handlers.cancel({ ...f.request, auth: { uid: 'payer', token: { portal: true, portalEmail: 'payer@payments.test' } } }));
  assert.deepEqual(await f.handlers.cancel(f.request), { status: 'canceled' });
  assert.equal((await f.invoiceRef.get()).get('paymentLock'), null);
  assert.equal((await f.paymentRef.get()).get('status'), 'canceled');
});

test('matching portal email cannot bypass customer tenancy and claimed staff roles require current membership', async () => {
  const f = await fixture('authorization');
  const invoice = (await f.invoiceRef.get()).data();
  const portalRequest = { ...f.request, auth: { uid: 'portal-payer', token: { portal: true, portalEmail: 'payer@payments.test' } } };
  assert.equal((await f.handlers.status(portalRequest)).amount, 2000);
  await db.doc(`customers/${invoice.customerId}`).update({ companyId: 'foreign-company' });
  await assert.rejects(f.handlers.create(portalRequest), { code: 'permission-denied' });
  await assert.rejects(f.handlers.create({ ...f.request, auth: { uid: 'former-manager', token: { companyId: invoice.companyId, role: 'owner', email_verified: true } } }), { code: 'permission-denied' });
});

test('moving an invoice cannot expose the previous tenant payment to its new owner', async () => {
  const f = await fixture('moved-invoice');
  await db.doc('companies/moved-payment-company').set({ ownerId: 'new-payment-owner' });
  await f.invoiceRef.update({ companyId: 'moved-payment-company', userId: 'new-payment-owner' });
  const request = { ...f.request, auth: { uid: 'new-payment-owner', token: { companyId: 'moved-payment-company', role: 'owner' } } };
  await assert.rejects(f.handlers.create(request), { code: 'failed-precondition' });
});
