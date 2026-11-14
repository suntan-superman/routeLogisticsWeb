const { randomUUID } = require('node:crypto');
const { validEmail } = require('./security');

// Leased delivery tolerates trigger/scheduler retries. SMTP is at-least-once: a crash after
// acceptance but before recording success can resend; stable Message-ID aids deduplication.
async function deliverMail(db, ref, transport, from, now = Date.now(), options = {}) {
  const lease = randomUUID();
  const mail = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref), data = snap.data();
    if (!data || !['queued', 'sending'].includes(data.status) || data.availableAt > now) return null;
    if (data.staffLoginChallengeId) {
      const challenge = await tx.get(db.doc(`rlStaffLoginChallenges/${data.staffLoginChallengeId}`));
      const latest = challenge.exists ? await tx.get(db.doc(`rlStaffLoginRequests/${challenge.get('emailHash')}`)) : null;
      if (!challenge.exists || challenge.get('consumed') || challenge.get('expiresAt').toMillis() <= now || latest?.get('challengeId') !== challenge.id) {
        tx.update(ref, { status: 'cancelled' }); return null;
      }
    }
    if (data.invitationId) {
      const [member, secret] = await Promise.all([tx.get(db.collection('teamMembers').doc(data.invitationId)), tx.get(db.collection('rlInviteSecrets').doc(data.invitationId))]);
      if (member.get('status') !== 'pending' || secret.get('codeHash') !== data.invitationHash) { tx.update(ref, { status: 'cancelled' }); return null; }
    }
    if (data.invoiceId) {
      const invoice = await tx.get(db.collection('invoices').doc(data.invoiceId));
      if (!invoice.exists || invoice.get('status') !== 'sent') { tx.update(ref, { status: 'cancelled' }); return null; }
    }
    if (data.estimateId) {
      const { hash, normalizeEmail } = require('./security');
      const enabled = options.estimateEmailEnabled ? options.estimateEmailEnabled() : process.env.RL_ESTIMATE_EMAIL_ENABLED === 'true';
      if (!enabled) { tx.update(ref, { status:'cancelled', failureCode:'estimate-email-disabled' }); return null; }
      const [estimate, version, secret] = await Promise.all([
        tx.get(db.doc(`estimates/${data.estimateId}`)), tx.get(db.doc(`rlEstimateVersions/${hash(`${data.estimateId}:${data.estimateVersion}`)}`)), tx.get(db.doc(`rlEstimateApprovalSecrets/${data.estimateId}`)),
      ]);
      const scope = estimate.get('companyId') || estimate.get('userId');
      const expectedPath = `rlEstimateDocuments/${scope}/${data.estimateId}/v${data.estimateVersion}.pdf`;
      const customer = estimate.get('customerId') ? await tx.get(db.doc(`customers/${estimate.get('customerId')}`)) : null;
      const company = estimate.get('companyId') ? await tx.get(db.doc(`companies/${estimate.get('companyId')}`)) : null;
      const members = company && data.estimateSenderUid !== company.get('ownerId') ? await tx.get(db.collection('teamMembers').where('companyId','==',company.id).where('uid','==',data.estimateSenderUid || '').limit(5)) : null;
      const actorAuthorized = company ? data.estimateSenderUid === company.get('ownerId') || members?.docs.some(member => member.get('status') === 'active' && ['admin','manager'].includes(member.get('role'))) : data.estimateSenderUid === estimate.get('userId');
      const customerValid = !customer || customer.exists && customer.get('isActive') !== false && normalizeEmail(customer.get('email')) === data.to
        && (estimate.get('companyId') ? customer.get('companyId') === estimate.get('companyId') : !customer.get('companyId') && customer.get('userId') === estimate.get('userId'));
      if (!estimate.exists || estimate.get('rlManaged') !== true || !['sent','approved'].includes(estimate.get('status')) || !version.exists || !secret.exists
        || estimate.get('version') !== data.estimateVersion || secret.get('version') !== data.estimateVersion || !['open','approved'].includes(secret.get('status'))
        || secret.get('tokenHash') !== data.estimateApprovalHash || secret.get('expiresAt')?.toMillis() <= now
        || version.get('totalCents') !== estimate.get('totalCents') || normalizeEmail(estimate.get('recipient')?.email) !== data.to
        || data.estimateRecipient !== data.to || (estimate.get('companyId') || null) !== data.estimateCompanyId || data.estimatePdfPath !== expectedPath || !customerValid || !actorAuthorized) {
        tx.update(ref,{status:'cancelled',failureCode:'estimate-version-or-recipient-changed'}); return null;
      }
    }
    if (data.paymentConfirmationInvoiceId) {
      const [invoice, payment, customer] = await Promise.all([
        tx.get(db.doc('invoices/' + data.paymentConfirmationInvoiceId)), tx.get(db.doc('rlPayments/' + data.paymentConfirmationId)), tx.get(db.doc('customers/' + data.paymentCustomerId)),
      ]);
      if (!invoice.exists || !payment.exists || !customer.exists || invoice.get('status') !== 'paid' || payment.get('mode') !== 'live'
        || payment.get('status') !== 'succeeded' || payment.get('reviewRequired') || invoice.get('paymentIntentId') !== payment.get('intentId')
        || payment.get('companyId') !== (invoice.get('companyId') || null) || payment.get('userId') !== invoice.get('userId')
        || payment.get('customerId') !== customer.id || invoice.get('customerId') !== customer.id
        || (invoice.get('companyId') ? customer.get('companyId') !== invoice.get('companyId') : customer.get('companyId') || customer.get('userId') !== invoice.get('userId'))
        || customer.get('isActive') === false || customer.get('deletedAt') || String(customer.get('email') || '').trim().toLowerCase() !== data.to) {
        tx.update(ref, { status: 'cancelled' }); return null;
      }
    }
    if (!validEmail(data.to) || (data.expiresAt && data.expiresAt.toMillis() <= now) || (data.attempts || 0) >= 5) {
      tx.update(ref, { status: 'failed', failureCode: 'expired-or-invalid' }); return null;
    }
    tx.update(ref, { status: 'sending', lease, availableAt: now + 120_000, attempts: (data.attempts || 0) + 1 });
    return data;
  });
  if (!mail) return;
  let accepted = false, code = '';
  try {
    let attachments;
    if (mail.estimateId) {
      const bucket = options.bucketProvider ? options.bucketProvider() : require('firebase-admin/storage').getStorage().bucket();
      const file = bucket.file(mail.estimatePdfPath), [metadata] = await file.getMetadata();
      if (!Number.isFinite(Number(metadata.size)) || Number(metadata.size) > 10 * 1024 * 1024 || metadata.contentType !== 'application/pdf') throw Object.assign(new Error('Unsupported estimate document.'),{code:'estimate-pdf-invalid'});
      const [bytes] = await file.download();
      if (bytes.length > 10 * 1024 * 1024 || bytes.subarray(0,5).toString() !== '%PDF-') throw Object.assign(new Error('Unsupported estimate document.'),{code:'estimate-pdf-invalid'});
      attachments = [{ filename:`estimate-v${mail.estimateVersion}.pdf`, content:bytes, contentType:'application/pdf' }];
    }
    const result = await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, ...(attachments ? {attachments} : {}), messageId: `<rl-${ref.id}@route-logistics.com>`, disableFileAccess: true, disableUrlAccess: true });
    accepted = result.accepted?.length > 0;
    if (!accepted) code = 'recipient-rejected';
  } catch (error) { code = String(error.code || 'smtp-error').slice(0, 60); }
  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (current.get('lease') !== lease) return;
    if (accepted) tx.update(ref, { status: 'sent', sentAt: new Date(), failureCode: null });
    else tx.update(ref, { status: current.get('attempts') >= 5 ? 'failed' : 'queued', availableAt: now + 60_000 * 2 ** current.get('attempts'), failureCode: code });
  });
}
async function drainMail(db, smtpUrl, from) {
  if (!smtpUrl || !validEmail(from)) throw new Error('Configure RL_SMTP_URL and RL_EMAIL_FROM before enabling email delivery.');
  const transport = require('nodemailer').createTransport({ url: smtpUrl, requireTLS: true, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000, disableFileAccess: true, disableUrlAccess: true });
  const snap = await db.collection('rlMail').where('status', 'in', ['queued', 'sending']).where('availableAt', '<=', Date.now()).orderBy('availableAt').limit(25).get();
  for (let i = 0; i < snap.size; i += 5) await Promise.all(snap.docs.slice(i, i + 5).map((d) => deliverMail(db, d.ref, transport, from)));
}
module.exports = { deliverMail, drainMail };
