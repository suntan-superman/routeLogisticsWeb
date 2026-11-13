const { randomBytes, randomInt, timingSafeEqual } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { hash, normalizeEmail, validEmail, rateLimit, documentId } = require('./security');
const OTP_LIFETIME = 10 * 60_000;
const otpHash = (challenge, code) => hash(`${challenge}:${code}`);
const INVALID_CODE = 'Code is invalid or expired. Request a new code.';
async function customersForEmail(db, email) {
  const [normalized, legacy] = await Promise.all([
    db.collection('customers').where('emailNormalized', '==', email).limit(26).get(),
    db.collection('customers').where('email', '==', email).limit(26).get(),
  ]);
  return [...new Map([...normalized.docs, ...legacy.docs].map((d) => [d.id, d])).values()].filter((d) => d.get('isActive') !== false && !d.get('deletedAt'));
}
function publicJob(id, data) {
  return { id, serviceType: data.serviceType || 'Service', date: data.date || '', time: data.time || '', status: data.status || 'scheduled' };
}
function publicInvoice(id, data) {
  return { id, invoiceNumber: data.invoiceNumber || id, issueDate: data.issueDate || '', dueDate: data.dueDate || '', status: data.status, total: Number(data.total) || 0, currency: 'USD', lineItems: (Array.isArray(data.lineItems) ? data.lineItems : []).slice(0, 100).map((i) => ({ description: String(i.description || ''), quantity: Number(i.quantity) || 0, unitPrice: Number(i.unitPrice) || 0, amount: Number(i.amount) || 0 })) };
}
function portalHandlers(db, auth, emailEnabled = () => true) {
  return {
    requestCustomerOTP: async (request) => {
      if (!emailEnabled()) throw new HttpsError('failed-precondition', 'Customer portal sign-in is unavailable while email delivery is disabled. Contact your service provider.');
      const email = normalizeEmail(request.data?.email);
      if (!validEmail(email)) throw new HttpsError('invalid-argument', 'Enter a valid email address.');
      await rateLimit(db, 'portal-request-ip', request.rawRequest?.ip || 'unknown', 15, 15 * 60_000);
      await rateLimit(db, 'portal-request-email', email, 3, 15 * 60_000);
      const challengeId = randomBytes(24).toString('hex');
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const customers = await customersForEmail(db, email);
      const now = Date.now();
      // Same response for unknown emails; never return an OTP or disclose customer existence.
      if (customers.length) {
        const batch = db.batch();
        batch.set(db.collection('rlPortalChallenges').doc(challengeId), { email, codeHash: otpHash(challengeId, code), expiresAt: new Date(now + OTP_LIFETIME), attempts: 0, consumed: false });
        batch.create(db.collection('rlMail').doc(), { to: email, subject: 'Your Route Logistics sign-in code', text: `Your sign-in code is ${code}. It expires in 10 minutes. If you did not request this code, ignore this email.`, status: 'queued', availableAt: now, createdAt: new Date(now), expiresAt: new Date(now + OTP_LIFETIME) });
        await batch.commit();
      }
      return { challengeId, message: 'If your provider has registered this email, a sign-in code will arrive shortly.' };
    },
    verifyCustomerOTP: async (request) => {
      if (!emailEnabled()) throw new HttpsError('failed-precondition', 'Customer portal sign-in is unavailable while email delivery is disabled. Contact your service provider.');
      await rateLimit(db, 'portal-verify-ip', request.rawRequest?.ip || 'unknown', 30, 15 * 60_000);
      const id = documentId(request.data?.challengeId, 'challenge');
      const code = String(request.data?.code || '');
      if (!/^[a-f0-9]{48}$/.test(id) || !/^\d{6}$/.test(code)) throw new HttpsError('permission-denied', INVALID_CODE);
      const ref = db.collection('rlPortalChallenges').doc(id);
      const email = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref), data = snap.data();
        if (!data || data.consumed || data.attempts >= 5 || data.expiresAt.toMillis() <= Date.now()) return null;
        const valid = timingSafeEqual(Buffer.from(data.codeHash), Buffer.from(otpHash(id, code)));
        tx.update(ref, { attempts: data.attempts + 1, consumed: valid });
        return valid ? data.email : null;
      });
      if (!email) throw new HttpsError('permission-denied', INVALID_CODE);
      // Isolated identity: never mint a token for an existing staff email/UID or bypass staff MFA.
      const uid = `rl_customer_${hash(email)}`;
      const claims = { portal: true, portalEmail: email };
      return { token: await auth.createCustomToken(uid, claims) };
    },
    getCustomerPortal: async (request) => {
      if (!request.auth || request.auth.token.portal !== true || !validEmail(request.auth.token.portalEmail)) throw new HttpsError('unauthenticated', 'Sign in to the customer portal.');
      await rateLimit(db, 'portal-read', request.auth.uid, 30);
      const customers = await customersForEmail(db, request.auth.token.portalEmail);
      const accounts = [];
      for (const customer of customers.slice(0, 25)) {
        const companyId = customer.get('companyId');
        const scopeField = companyId ? 'companyId' : 'userId';
        const scopeValue = companyId || customer.get('userId');
        if (!scopeValue) continue;
        const [company, jobs, invoices] = await Promise.all([
          companyId ? db.collection('companies').doc(companyId).get() : Promise.resolve(null),
          db.collection('jobs').where(scopeField, '==', scopeValue).where('customerId', '==', customer.id).orderBy('date', 'desc').limit(51).get(),
          db.collection('invoices').where(scopeField, '==', scopeValue).where('customerId', '==', customer.id).where('status', 'in', ['sent', 'paid', 'void']).orderBy('createdAt', 'desc').limit(51).get(),
        ]);
        accounts.push({ id: customer.id, companyName: company?.get('name') || 'Service provider', contactEmail: company?.get('email') || '', jobs: jobs.docs.slice(0, 50).map((d) => publicJob(d.id, d.data())), invoices: invoices.docs.slice(0, 50).map((d) => publicInvoice(d.id, d.data())), hasMore: jobs.size > 50 || invoices.size > 50 });
      }
      return { accounts, hasMoreAccounts: customers.length > 25 };
    },
  };
}
module.exports = { portalHandlers, otpHash, customersForEmail, publicJob, publicInvoice };
