const { requireCapability } = require('./access');
const requireFinance = (db, request, data) => requireCapability(db, request, 'invoices.manage', data);
const { HttpsError } = require('firebase-functions/v2/https');
const { requireAuth, rateLimit, documentId, normalizeEmail, validEmail } = require('./security');
const { assertInvoiceActor, invoiceRevision, expectedRevision, assertInvoiceTerms } = require('./invoices');
const { hash } = require('./security');
const { assertCurrentInvoice } = require('./shared/invoiceV2');
const invoiceMailId = (id, period, email, reminder = false) => `invoice_${reminder ? 'reminder' : 'send'}_${id}_${period}_${hash(email).slice(0, 12)}`;
function invoiceMessage(invoice, companyName, reminder, appUrl) {
  const snapshot = invoice.issuedSnapshot;
  const total = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(snapshot.totalCents / 100);
  const balance = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.balanceCents / 100);
  return { subject: `${reminder ? 'Payment reminder: ' : ''}Invoice ${snapshot.invoiceNumber} from ${companyName}`, text: `${companyName}\nInvoice ${snapshot.invoiceNumber}\nTotal: ${total}\nOutstanding: ${balance}\nDue: ${snapshot.dueDate}\n\nThe approved invoice PDF is attached.\nView your visits and invoices: ${appUrl.replace(/\/$/, '')}/portal\nContact your service provider for payment arrangements.${reminder ? '\nIf you have already paid, please contact your provider so they can update the invoice.' : ''}` };
}
async function queueInvoiceEmail(db, id, { reminder = false, appUrl, authorize = async () => {}, revision, expectedRecipient } = {}) {
  const invoiceRef = db.collection('invoices').doc(documentId(id, 'invoice'));
  return db.runTransaction(async (tx) => {
    const invoiceSnap = await tx.get(invoiceRef);
    if (!invoiceSnap.exists) throw new HttpsError('not-found', 'Invoice not found.');
    const invoice = invoiceSnap.data();
    const actor = await authorize(invoice);
    if (actor) await assertInvoiceActor(db, tx, actor);
    assertCurrentInvoice(invoice);
    if (!['issued', 'partially_paid'].includes(invoice.status) || !invoice.issuedSnapshot || !Number.isSafeInteger(invoice.balanceCents) || invoice.balanceCents <= 0) throw new HttpsError('failed-precondition', 'Approve and issue this invoice before emailing it.');
    assertInvoiceTerms(invoice);
    if (!invoice.customerId) throw new HttpsError('failed-precondition', 'Link the invoice to a customer with an email address.');
    const customer = await tx.get(db.collection('customers').doc(documentId(invoice.customerId)));
    if (!customer.exists || customer.get('isActive') === false || customer.get('deletedAt') || (invoice.companyId ? customer.get('companyId') !== invoice.companyId : customer.get('userId') !== invoice.userId || customer.get('companyId'))) throw new HttpsError('failed-precondition', 'Invoice customer is unavailable or does not match its company.');
    const email = normalizeEmail(customer.get('email'));
    if (!validEmail(email)) throw new HttpsError('failed-precondition', 'Add a valid customer email address.');
    if (expectedRecipient !== undefined && email !== normalizeEmail(expectedRecipient)) throw new HttpsError('aborted', 'The customer email changed. Review the current recipient before sending.');
    const company = invoice.companyId ? await tx.get(db.collection('companies').doc(invoice.companyId)) : null;
    if (reminder && (!invoice.dueDate || invoice.dueDate >= new Date().toISOString().slice(0, 10) || company?.get('invoiceRemindersEnabled') !== true || customer.get('emailConsent') !== true)) return { skipped: true };
    const now = Date.now();
    const period = Math.floor(now / ((reminder ? 7 : 1) * 86400_000));
    const mailRef = db.collection('rlMail').doc(invoiceMailId(id, period, email, reminder));
    const legacyRef = db.collection('rlMail').doc(`invoice_${reminder ? 'reminder' : 'send'}_${id}_${period}`);
    const [old, legacy] = await Promise.all([tx.get(mailRef), tx.get(legacyRef)]);
    const previous = old.exists ? old : legacy.exists && legacy.get('to') === email ? legacy : null;
    if (previous) {
      if (['failed', 'cancelled'].includes(previous.get('status'))) throw new HttpsError('failed-precondition', 'The previous email failed or was cancelled. Contact your administrator before trying again.');
      return { queued: previous.get('status') !== 'sent', existing: true, status: previous.get('status'), recipient: email };
    }
    if (revision !== undefined) expectedRevision(invoice, revision);
    tx.create(mailRef, { ...invoiceMessage(invoice, company?.get('name') || 'Your service provider', reminder, appUrl), invoiceId: id, invoiceSnapshotFingerprint: invoice.issuedSnapshot.fingerprint,
      to: email, status: 'queued', availableAt: now, createdAt: new Date(now), expiresAt: new Date(now + 86400_000) });
    tx.create(db.doc(`rlInvoiceAudit/${hash(`email:${mailRef.id}`)}`), { companyId: invoice.companyId || null, actorId: actor?.uid || 'system', invoiceId: id, action: 'invoice.email.queued', fromRevision: invoiceRevision(invoice), toRevision: invoiceRevision(invoice), fromStatus: invoice.status, toStatus: invoice.status, totalCents: invoice.totalCents, mailId: mailRef.id, createdAt: new Date(now) });
    return { queued: true, status: 'queued', recipient: email };
  });
}
function invoiceEmailHandlers(db, appUrl, emailEnabled = () => true) {
  return {
    emailInvoice: async (request) => {
      requireAuth(request, true);
      if (request.data?.action === 'status') {
        const id = documentId(request.data?.invoiceId, 'invoice');
        const invoice = await db.collection('invoices').doc(id).get();
        if (!invoice.exists) throw new HttpsError('not-found', 'Invoice not found.');
        await requireFinance(db, request, invoice.data());
        if (invoice.get('financialVersion') !== 2 || !invoice.get('issuedSnapshot')) throw new HttpsError('failed-precondition', 'Issue the approved invoice before checking delivery.');
        const customer = await db.collection('customers').doc(documentId(invoice.get('customerId'), 'customer')).get();
        if (!customer.exists || customer.get('isActive') === false || customer.get('deletedAt') || (invoice.get('companyId') ? customer.get('companyId') !== invoice.get('companyId') : customer.get('companyId') || customer.get('userId') !== invoice.get('userId'))) throw new HttpsError('failed-precondition', 'Invoice customer is unavailable or does not match its company.');
        const recipient = normalizeEmail(customer.get('email'));
        if (!validEmail(recipient)) throw new HttpsError('failed-precondition', 'Add a valid customer email address.');
        const period = Math.floor(Date.now() / 86400_000);
        const ids = [invoiceMailId(id, period, recipient), `invoice_send_${id}_${period}`, invoiceMailId(id, period - 1, recipient), `invoice_send_${id}_${period - 1}`];
        const mails = await Promise.all(ids.map(mailId => db.collection('rlMail').doc(mailId).get()));
        const latest = mails.find(mail => mail.exists && mail.get('to') === recipient && mail.get('invoiceSnapshotFingerprint') === invoice.get('issuedSnapshot.fingerprint'));
        return { recipient, delivery: latest ? { status: latest.get('status'), sentAt: latest.get('sentAt')?.toDate?.()?.toISOString() || null, failureCode: latest.get('failureCode') || null } : null };
      }
      if (!Number.isInteger(request.data?.expectedRevision) || request.data.expectedRevision < 0) throw new HttpsError('invalid-argument', 'The displayed invoice revision is required. Refresh the invoice before emailing.');
      if (!validEmail(normalizeEmail(request.data?.expectedRecipient))) throw new HttpsError('invalid-argument', 'Review the current customer email before sending.');
      if (!emailEnabled()) throw new HttpsError('failed-precondition', 'Email delivery is disabled. Download the invoice to share it directly.');
      await rateLimit(db, 'email-invoice', request.auth.uid, 20, 60 * 60_000);
      return queueInvoiceEmail(db, request.data?.invoiceId, { appUrl: appUrl(), revision: request.data.expectedRevision, expectedRecipient: request.data.expectedRecipient, authorize: (invoice) => requireFinance(db, request, invoice) });
    },
    reminders: async () => {
      if (!emailEnabled()) return { skipped: true };
      const today = new Date().toISOString().slice(0, 10);
      let cursor;
      do {
        let query = db.collection('invoices').where('financialVersion', '==', 2).where('status', 'in', ['issued','partially_paid']).where('dueDate', '<', today).orderBy('dueDate').limit(200);
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
module.exports = { invoiceEmailHandlers, queueInvoiceEmail, invoiceMessage, invoiceMailId };
