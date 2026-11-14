const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { paymentLifecycleHandlers } = require('../functions/paymentLifecycle');
const { deliverMail } = require('../functions/mail');
let app, db, handler;
const auth = { uid: 'receipt-owner', token: { companyId: 'receipt-co', role: 'owner', email_verified: true } };
const data = { invoiceId: 'receipt-invoice' };
const config = { enabled: () => true, mode: () => 'live', liveApproved: () => true, emailEnabled: () => true };
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'receipt-tests'); db = getFirestore(app);
  await db.doc('companies/receipt-co').set({ ownerId: auth.uid, name: 'Receipt fixture' });
  await db.doc('customers/receipt-customer').set({ companyId: 'receipt-co', email: 'receipt@example.test' });
  await db.doc('invoices/receipt-invoice').set({ companyId: 'receipt-co', userId: auth.uid, customerId: 'receipt-customer', status: 'paid', total: 20, paymentIntentId: 'pi_receipt_fixture' });
  await db.doc('rlPayments/receipt-payment').set({ invoiceId: data.invoiceId, companyId: 'receipt-co', userId: auth.uid, customerId: 'receipt-customer', mode: 'live', status: 'succeeded', amount: 2000, intentId: 'pi_receipt_fixture' });
  await db.doc('rlPaymentEvents/receipt-event').set({ companyId: 'receipt-co', invoiceId: data.invoiceId, paymentId: 'receipt-payment', mode: 'live', status: 'succeeded', type: 'payment_intent.succeeded', amount: 2000, recordedAt: new Date() });
  handler = paymentLifecycleHandlers(db, config);
});
after(() => deleteApp(app));
test('payment history is invoice-scoped and denies unassigned technicians and unrelated portal customers', async () => {
  const value = await handler.history({ auth, data }); assert.equal(value.history.length, 1); assert.equal(value.history[0].amount, 2000);
  assert.equal(value.history[0].paymentId, undefined);
  await assert.rejects(handler.history({ auth: { uid: 'outsider', token: { companyId: 'other', role: 'owner', email_verified: true } }, data }));
  await assert.rejects(handler.history({ auth: { uid: 'portal-other', token: { portal: true, portalEmail: 'other@example.test' } }, data }));
});
test('readiness requires an active financial capability and reports explicit test/live gates', async () => {
  const result = await paymentLifecycleHandlers(db, { enabled: () => true }).readiness({ auth });
  assert.equal(result.mode, 'test'); assert.equal(result.liveCollectionEnabled, false); assert.equal(result.testChangesInvoiceBalance, false);
  await assert.rejects(handler.readiness({ auth: { uid: 'receipt-tech', token: { companyId: 'receipt-co', role: 'technician', email_verified: true } } }));
});
test('test and unapproved live events never enqueue a customer confirmation', async () => {
  const event = { data: { ref: db.doc('rlPaymentEvents/receipt-event') } };
  for (const override of [{ mode: () => 'test' }, { liveApproved: () => false }, { emailEnabled: () => false }]) assert.equal((await paymentLifecycleHandlers(db, { ...config, ...override }).receipt(event)).skipped, true);
  assert.equal((await db.collection('rlMail').where('paymentConfirmationId', '==', 'receipt-payment').get()).size, 0);
});
test('approved reconciled live receipt queues once and delivery rechecks current customer ownership', async () => {
  const event = { data: { ref: db.doc('rlPaymentEvents/receipt-event') } };
  assert.equal((await handler.receipt(event)).queued, true); assert.equal((await handler.receipt(event)).duplicate, true);
  const rows = await db.collection('rlMail').where('paymentConfirmationId', '==', 'receipt-payment').get(); assert.equal(rows.size, 1);
  await db.doc('customers/receipt-customer').update({ email: 'changed@example.test' });
  let sent = 0;
  await deliverMail(db, rows.docs[0].ref, { sendMail: async () => { sent++; return { accepted: ['fixture'] }; } }, 'sender@example.test');
  assert.equal(sent, 0); assert.equal((await rows.docs[0].ref.get()).get('status'), 'cancelled');
});
