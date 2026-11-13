const { HttpsError } = require('firebase-functions/v2/https');
const { requireAuth, requireManager, rateLimit, documentId, normalizeEmail, validEmail } = require('./security');
function invoiceMessage(invoice, companyName, reminder, appUrl) {
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.total);
  return { subject: `${reminder ? 'Payment reminder: ' : ''}Invoice ${invoice.invoiceNumber || ''} from ${companyName}`, text: `${companyName}\nInvoice ${invoice.invoiceNumber || ''}\nTotal: ${amount}\nDue: ${invoice.dueDate || ''}\n\n${(invoice.lineItems || []).map((i) => `${i.description}: ${i.quantity} x ${i.unitPrice}`).join('\n')}\n\nView your visits and invoices: ${appUrl.replace(/\/$/, '')}/portal\nContact your service provider for payment arrangements.${reminder ? '\nIf you have already paid, please contact your provider so they can update the invoice.' : ''}` };
}
async function queueInvoiceEmail(db, id, { reminder = false, appUrl, authorize = async () => {} } = {}) {
  const invoiceRef = db.collection('invoices').doc(documentId(id, 'invoice'));
  return db.runTransaction(async (tx) => {
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists) throw new HttpsError('not-found', 'Invoice not found.');
    const invoice = invoiceSnap.data();
    await authorize(invoice);
    if (!['draft', 'sent'].includes(invoice.status) || !Number.isFinite(invoice.total) || invoice.total < 0) throw new HttpsError('failed-precondition', 'Only unpaid valid invoices can be emailed.');
    if (!invoice.customerId) throw new HttpsError('failed-precondition', 'Link the invoice to a customer with an email address.');
    const customer = await tx.get(db.collection('customers').doc(documentId(invoice.customerId)));
    if (!customer.exists || (invoice.companyId ? customer.get('companyId') !== invoice.companyId : customer.get('userId') !== invoice.userId || customer.get('companyId'))) throw new HttpsError('failed-precondition', 'Invoice customer does not match its company.');
    const email = normalizeEmail(customer.get('email'));
    if (!validEmail(email)) throw new HttpsError('failed-precondition', 'Add a valid customer email address.');
    const company = invoice.companyId ? await tx.get(db.collection('companies').doc(invoice.companyId)) : null;
    if (reminder && (invoice.status !== 'sent' || !invoice.dueDate || invoice.dueDate >= new Date().toISOString().slice(0, 10) || company?.get('invoiceRemindersEnabled') !== true || customer.get('emailConsent') !== true)) return { skipped: true };
    const now = Date.now();
    const period = Math.floor(now / ((reminder ? 7 : 1) * 86400_000));
    const mailRef = db.collection('rlMail').doc(`invoice_${reminder ? 'reminder' : 'send'}_${id}_${period}`);
    const old = await tx.get(mailRef);
    if (old.exists) {
      if (['failed', 'cancelled'].includes(old.get('status'))) throw new HttpsError('failed-precondition', 'The previous email failed or was cancelled. Try again tomorrow or contact your administrator.');
      return { queued: true, existing: true };
    }
    tx.create(mailRef, { ...invoiceMessage(invoice, company?.get('name') || 'Your service provider', reminder, appUrl), invoiceId: id, to: email, status: 'queued', availableAt: now, createdAt: new Date(now), expiresAt: new Date(now + 86400_000) });
    if (invoice.status === 'draft') tx.update(invoiceRef, { status: 'sent', sentAt: new Date(), updatedAt: new Date() });
    return { queued: true };
  });
}
function invoiceEmailHandlers(db, appUrl, emailEnabled = () => true) {
  return {
    emailInvoice: async (request) => {
      requireAuth(request, true);
      if (!emailEnabled()) throw new HttpsError('failed-precondition', 'Email delivery is disabled. Download the invoice to share it directly.');
      await rateLimit(db, 'email-invoice', request.auth.uid, 20, 60 * 60_000);
      return queueInvoiceEmail(db, request.data?.invoiceId, { appUrl: appUrl(), authorize: (invoice) => requireManager(db, request, invoice) });
    },
    reminders: async () => {
      if (!emailEnabled()) return { skipped: true };
      const today = new Date().toISOString().slice(0, 10);
      let cursor;
      do {
        let query = db.collection('invoices').where('status', '==', 'sent').where('dueDate', '<', today).orderBy('dueDate').limit(200);
        if (cursor) query = query.startAfter(cursor);
        const snap = await query.get();
        for (const invoice of snap.docs) {
          try { await queueInvoiceEmail(db, invoice.id, { reminder: true, appUrl: appUrl() }); }
          catch (error) { console.error('Invoice reminder skipped', { invoiceId: invoice.id, code: error.code || 'unknown' }); }
        }
        cursor = snap.size === 200 ? snap.docs.at(-1) : null;
      } while (cursor);
    },
  };
}
module.exports = { invoiceEmailHandlers, queueInvoiceEmail, invoiceMessage };
