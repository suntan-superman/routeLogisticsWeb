const { HttpsError } = require('firebase-functions/v2/https');
const { requireCapability } = require('./access');
const { documentId, hash, normalizeEmail, validEmail, rateLimit } = require('./security');
const { authorizeInvoice, amountInCents } = require('./payments');
const SUPPORTED_EVENTS = ['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.processing', 'payment_intent.canceled', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed'];
const iso = value => value?.toDate ? value.toDate().toISOString() : value instanceof Date ? value.toISOString() : value || null;
function paymentLifecycleHandlers(db, config = {}) {
  const mode = () => config.mode?.() === 'live' ? 'live' : 'test';
  return {
    readiness: async request => {
      const scope = await requireCapability(db, request, 'invoices.manage');
      await rateLimit(db, 'payment-readiness', scope.uid, 30);
      const rows = await db.collection('rlPayments').where(scope.companyId ? 'companyId' : 'userId', '==', scope.companyId || scope.uid).limit(100).get();
      return { enabled: config.enabled?.() === true, mode: mode(), liveApproved: config.liveApproved?.() === true,
        liveCollectionEnabled: config.enabled?.() === true && mode() === 'live' && config.liveApproved?.() === true,
        webhookEvents: SUPPORTED_EVENTS, testChangesInvoiceBalance: false,
        review: rows.docs.filter(row => row.get('reviewRequired') === true).map(row => ({ invoiceId: row.get('invoiceId'), mode: row.get('mode'), status: row.get('status'), updatedAt: iso(row.get('updatedAt')) })) };
    },
    history: async request => {
      if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to view payment history.');
      const invoice = await db.doc('invoices/' + documentId(request.data?.invoiceId, 'invoice')).get();
      if (!invoice.exists) throw new HttpsError('not-found', 'Invoice not found.');
      await authorizeInvoice(db, request, invoice.data());
      await rateLimit(db, 'payment-history', request.auth.uid, 40);
      const rows = await db.collection('rlPaymentEvents').where('invoiceId', '==', invoice.id).orderBy('recordedAt', 'desc').limit(200).get();
      const history = rows.docs.filter(row => row.get('companyId') === (invoice.get('companyId') || null)
        && ['test', 'live'].includes(row.get('mode'))).map(row => ({ id: row.id, type: row.get('type'), mode: row.get('mode'),
        status: row.get('status'), amount: row.get('amount'), refundedAmount: row.get('refundedAmount') || 0,
        disputeStatus: row.get('disputeStatus') || null, reviewRequired: row.get('reviewRequired') === true, recordedAt: iso(row.get('recordedAt')) }))
        .sort((a,b) => String(b.recordedAt).localeCompare(String(a.recordedAt)));
      return { history, truncated: rows.size === 200 };
    },
    receipt: async event => {
      // A receipt is triggered only by an already reconciled, approved live capture.
      // Test events never enqueue customer email or mark an actual invoice paid.
      if (!config.enabled?.() || mode() !== 'live' || !config.liveApproved?.() || !config.emailEnabled?.()) return { skipped: true };
      const ref = event.data?.ref;
      if (!ref) return { skipped: true };
      return db.runTransaction(async tx => {
        const audit = await tx.get(ref);
        if (!audit.exists || audit.get('mode') !== 'live' || audit.get('type') !== 'payment_intent.succeeded' || audit.get('reviewRequired') || audit.get('status') !== 'succeeded') return { skipped: true };
        const [payment, invoice] = await Promise.all([tx.get(db.doc('rlPayments/' + documentId(audit.get('paymentId')))), tx.get(db.doc('invoices/' + documentId(audit.get('invoiceId'))))]);
        if (!payment.exists || !invoice.exists || payment.get('mode') !== 'live' || payment.get('status') !== 'succeeded' || payment.get('reviewRequired')
          || invoice.get('status') !== 'paid' || invoice.get('paymentIntentId') !== payment.get('intentId')
          || payment.get('companyId') !== (invoice.get('companyId') || null) || payment.get('userId') !== invoice.get('userId')
          || payment.get('customerId') !== invoice.get('customerId') || amountInCents(invoice.data()) !== payment.get('amount')) return { skipped: true };
        const customer = await tx.get(db.doc('customers/' + documentId(invoice.get('customerId'))));
        if (!customer.exists || customer.get('isActive') === false || customer.get('deletedAt')
          || (invoice.get('companyId') ? customer.get('companyId') !== invoice.get('companyId') : customer.get('companyId') || customer.get('userId') !== invoice.get('userId'))) return { skipped: true };
        const to = normalizeEmail(customer.get('email'));
        if (!validEmail(to)) return { skipped: true };
        const company = invoice.get('companyId') ? await tx.get(db.doc('companies/' + documentId(invoice.get('companyId')))) : null;
        const mail = db.doc('rlMail/payment_receipt_' + hash(payment.id + ':' + payment.get('intentId'))), previous = await tx.get(mail);
        if (previous.exists) return { duplicate: true };
        const companyName = company?.get('name') || 'Your service provider', amount = (payment.get('amount') / 100).toFixed(2);
        tx.create(mail, { to, subject: 'Payment confirmation from ' + companyName,
          text: companyName + '\nPayment received for invoice ' + (invoice.get('invoiceNumber') || invoice.id) + ': $' + amount + ' USD.\nView your invoice: ' + (config.appUrl?.() || 'https://route-logistics.com').replace(/\/$/, '') + '/portal',
          paymentConfirmationInvoiceId: invoice.id, paymentConfirmationId: payment.id, paymentCustomerId: customer.id,
          status: 'queued', availableAt: Date.now(), createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400000) });
        return { queued: true };
      });
    },
  };
}
module.exports = { paymentLifecycleHandlers, SUPPORTED_EVENTS };
