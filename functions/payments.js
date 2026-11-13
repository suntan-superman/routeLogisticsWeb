const { HttpsError } = require('firebase-functions/v2/https');
const { hash, normalizeEmail, validEmail, documentId, requireManager, rateLimit } = require('./security');

function amountInCents(invoice) {
  const value = Number(invoice.total);
  if (!Number.isFinite(value) || value < 0.50 || value > 999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw new HttpsError('failed-precondition', 'Invoice amount must be a valid USD amount of at least $0.50.');
  if (String(invoice.currency || 'usd').toLowerCase() !== 'usd') throw new HttpsError('failed-precondition', 'This release supports USD invoices only.');
  return Math.round(value * 100);
}
async function authorizeInvoice(db, request, invoice) {
  if (request.auth?.token.portal === true) {
    if (!validEmail(request.auth.token.portalEmail)) throw new HttpsError('permission-denied', 'Customer invoice access required.');
    if (!invoice.customerId) throw new HttpsError('permission-denied', 'Customer invoice access required.');
    const customer = await db.collection('customers').doc(documentId(invoice.customerId)).get();
    const scopeMatches = invoice.companyId ? customer.get('companyId') === invoice.companyId : customer.get('userId') === invoice.userId && !customer.get('companyId');
    if (!customer.exists || !scopeMatches || customer.get('isActive') === false || customer.get('deletedAt') || normalizeEmail(customer.get('email')) !== normalizeEmail(request.auth.token.portalEmail)) throw new HttpsError('permission-denied', 'Customer invoice access required.');
  } else await requireManager(db, request, invoice);
}
function paymentHandlers(db, getStripe, { enabled = () => false, mode = () => 'test', liveApproved = () => false } = {}) {
  function provider() {
    if (!enabled()) throw new HttpsError('failed-precondition', 'Card payments are not configured yet. Contact your provider.');
    if (!['test', 'live'].includes(mode()) || (mode() === 'live' && !liveApproved())) throw new HttpsError('failed-precondition', 'Live payment collection is disabled.');
    return getStripe();
  }
  async function paymentFor(request) {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to view this invoice.');
    const invoiceId = documentId(request.data?.invoiceId, 'invoice');
    const invoice = await db.doc(`invoices/${invoiceId}`).get();
    if (!invoice.exists) throw new HttpsError('not-found', 'Invoice not found.');
    await authorizeInvoice(db, request, invoice.data());
    return { invoiceId, invoice, ref: db.doc(`rlPayments/${hash(`${mode()}:${invoiceId}`)}`) };
  }
  return {
    create: async (request) => {
      const stripe = provider();
      const { invoiceId, invoice: authorized, ref } = await paymentFor(request);
      await rateLimit(db, 'payment-create', request.auth.uid, 10, 60_000);
      const pending = await db.runTransaction(async (tx) => {
        const [invoice, payment] = await Promise.all([tx.get(db.doc(`invoices/${invoiceId}`)), tx.get(ref)]);
        if (['companyId', 'userId', 'customerId'].some((field) => invoice.get(field) !== authorized.get(field))) throw new HttpsError('aborted', 'Invoice ownership changed. Refresh and try again.');
        if (invoice.get('status') !== 'sent') throw new HttpsError('failed-precondition', 'Only sent, unpaid invoices can be paid.');
        const amount = amountInCents(invoice.data());
        if (payment.exists && payment.get('status') !== 'canceled') {
          if (payment.get('reviewRequired')) throw new HttpsError('failed-precondition', 'The previous payment needs administrator review.');
          if (payment.get('amount') !== amount || payment.get('currency') !== 'usd') throw new HttpsError('failed-precondition', 'Cancel the previous payment attempt before changing its amount.');
          if (!payment.get('intentId') && Date.now() - payment.get('createdAt').toMillis() > 23 * 3600_000) throw new HttpsError('failed-precondition', 'The incomplete payment attempt needs administrator review before retrying.');
          return payment.data();
        }
        const data = { invoiceId, companyId: invoice.get('companyId') || null, userId: invoice.get('userId'), amount, currency: 'usd', mode: mode(), generation: (payment.get('generation') || 0) + 1, status: 'creating', createdAt: new Date(), updatedAt: new Date() };
        tx.set(ref, data);
        tx.update(invoice.ref, { paymentLock: { paymentId: ref.id, mode: mode(), amount, currency: 'usd' } });
        return data;
      });
      const intent = pending.intentId ? await stripe.paymentIntents.retrieve(pending.intentId) : await stripe.paymentIntents.create({ amount: pending.amount, currency: 'usd', automatic_payment_methods: { enabled: true }, metadata: { rlPaymentId: ref.id, rlInvoiceId: invoiceId, rlCompanyId: pending.companyId || '', rlMode: mode() } }, { idempotencyKey: `rl-${ref.id}-${pending.generation}` });
      if (intent.livemode !== (mode() === 'live') || intent.amount !== pending.amount || intent.currency !== pending.currency) throw new HttpsError('failed-precondition', 'Payment configuration does not match the invoice.');
      await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (current.get('generation') !== pending.generation) throw new HttpsError('aborted', 'Payment changed. Refresh the invoice.');
        // Do not regress a webhook-set status if a callback won the race.
        tx.update(ref, { intentId: intent.id, ...(current.get('status') === 'creating' ? { status: intent.status } : {}), updatedAt: new Date() });
      });
      return { clientSecret: intent.client_secret, mode: mode(), intentId: intent.id, amount: pending.amount, currency: pending.currency };
    },
    status: async (request) => {
      const { ref } = await paymentFor(request);
      await rateLimit(db, 'payment-status', request.auth.uid, 60);
      const payment = await ref.get();
      return payment.exists ? { mode: payment.get('mode'), status: payment.get('status'), amount: payment.get('amount'), refundedAmount: payment.get('refundedAmount') || 0, disputeStatus: payment.get('disputeStatus') || null, reviewRequired: payment.get('reviewRequired') === true } : { mode: mode(), status: 'not-started' };
    },
    cancel: async (request) => {
      const stripe = provider();
      const { invoice, ref } = await paymentFor(request);
      await requireManager(db, request, invoice.data());
      await rateLimit(db, 'payment-cancel', request.auth.uid, 10);
      const payment = await ref.get();
      if (!payment.get('intentId')) throw new HttpsError('failed-precondition', 'No cancellable payment was found.');
      const intent = await stripe.paymentIntents.cancel(payment.get('intentId'));
      await reconcilePayment(db, stripe, { id: `cancel_${intent.id}`, type: 'payment_intent.canceled', livemode: intent.livemode, data: { object: intent }, created: Math.floor(Date.now() / 1000) }, mode());
      return { status: 'canceled' };
    },
    webhook: async (request, response, webhookSecret) => {
      let event, stripe;
      try { stripe = provider(); event = stripe.webhooks.constructEvent(request.rawBody, request.headers['stripe-signature'], webhookSecret); }
      catch { response.status(400).send('Invalid or unavailable webhook'); return; }
      try { await reconcilePayment(db, stripe, event, mode()); response.json({ received: true }); }
      catch (error) { console.error('Stripe reconciliation failed', { eventId: event.id, code: error.code || 'unknown' }); response.status(500).send('Reconciliation retry required'); }
    },
  };
}
async function reconcilePayment(db, stripe, event, mode) {
  if (event.livemode !== (mode === 'live')) throw new Error('Payment mode mismatch');
  const eventRef = db.doc(`rlPaymentEvents/${documentId(event.id)}`);
  if ((await eventRef.get()).exists) return { duplicate: true };
  const object = event.data.object;
  const supported = /^(payment_intent\.(succeeded|payment_failed|processing|canceled)|charge\.refunded|charge\.dispute\.(created|updated|closed))$/;
  if (!supported.test(event.type)) return { ignored: true };
  const intentId = event.type.startsWith('payment_intent.') ? object.id : typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;
  if (!intentId) return { ignored: true };
  const intent = await stripe.paymentIntents.retrieve(intentId);
  const paymentId = intent.metadata?.rlPaymentId;
  if (!paymentId) return { ignored: true }; // MF/other Stripe payments are outside RL ownership.
  if (intent.livemode !== (mode === 'live')) throw new Error('Provider mode mismatch');
  const charge = intent.latest_charge ? await stripe.charges.retrieve(typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge.id) : null;
  const dispute = event.type.startsWith('charge.dispute.') ? await stripe.disputes.retrieve(object.id) : null;
  const paymentRef = db.doc(`rlPayments/${documentId(paymentId)}`);
  return db.runTransaction(async (tx) => {
    const [seen, payment] = await Promise.all([tx.get(eventRef), tx.get(paymentRef)]);
    if (seen.exists) return { duplicate: true };
    if (!payment.exists) throw new Error('RL payment mapping is missing');
    const invoice = await tx.get(db.doc(`invoices/${payment.get('invoiceId')}`));
    const amount = payment.get('amount'), refundedAmount = charge?.amount_refunded || 0;
    const mismatch = !invoice.exists || payment.get('mode') !== mode || intent.amount !== amount || intent.currency !== payment.get('currency') || (payment.get('intentId') && payment.get('intentId') !== intent.id) || intent.metadata.rlInvoiceId !== payment.get('invoiceId') || (intent.metadata.rlCompanyId || null) !== payment.get('companyId') || (invoice.exists && (Math.round(Number(invoice.get('total')) * 100) !== amount || (invoice.get('companyId') || null) !== payment.get('companyId')));
    const disputeStatus = dispute?.status || payment.get('disputeStatus') || null;
    const disputed = disputeStatus ? !['won', 'warning_closed'].includes(disputeStatus) : charge?.disputed;
    const status = disputed ? 'disputed' : refundedAmount >= amount ? 'refunded' : refundedAmount > 0 ? 'partially_refunded' : intent.status;
    const settled = intent.status === 'succeeded' && intent.amount_received === amount;
    const reviewRequired = mismatch || (intent.status === 'succeeded' && !settled) || (invoice.exists && invoice.get('status') === 'void' && settled);
    const audit = { eventId: event.id, type: event.type, paymentId, intentId, invoiceId: payment.get('invoiceId'), companyId: payment.get('companyId'), mode, amount, refundedAmount, status, disputeStatus, reviewRequired, providerCreated: event.created, recordedAt: new Date() };
    tx.create(eventRef, audit);
    tx.update(paymentRef, { ...(mismatch ? { lastUnexpectedIntentId: intentId } : { intentId, status, refundedAmount, disputeStatus }), reviewRequired, updatedAt: new Date() });
    if (!reviewRequired) {
      const update = mode === 'test' ? { testPaymentStatus: status, testPaymentUpdatedAt: new Date() } : { paymentStatus: status, amountRefunded: refundedAmount / 100, paymentUpdatedAt: new Date() };
      if (settled && mode === 'live') Object.assign(update, { status: 'paid', paidAt: invoice.get('paidAt') || new Date(), paymentIntentId: intent.id });
      if (settled || intent.status === 'canceled') update.paymentLock = null;
      tx.update(invoice.ref, update);
    }
    return { reconciled: !reviewRequired, reviewRequired };
  });
}
module.exports = { paymentHandlers, reconcilePayment, amountInCents, authorizeInvoice };
