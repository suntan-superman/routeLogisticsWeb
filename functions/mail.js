const { randomUUID } = require('node:crypto');
const { validEmail } = require('./security');

// Leased delivery tolerates trigger/scheduler retries. SMTP is at-least-once: a crash after
// acceptance but before recording success can resend; stable Message-ID aids deduplication.
async function deliverMail(db, ref, transport, from, now = Date.now()) {
  const lease = randomUUID();
  const mail = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref), data = snap.data();
    if (!data || !['queued', 'sending'].includes(data.status) || data.availableAt > now) return null;
    if (data.invoiceId) {
      const invoice = await tx.get(db.collection('invoices').doc(data.invoiceId));
      if (!invoice.exists || invoice.get('status') !== 'sent') { tx.update(ref, { status: 'cancelled' }); return null; }
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
    const result = await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, messageId: `<rl-${ref.id}@route-logistics.com>`, disableFileAccess: true, disableUrlAccess: true });
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
