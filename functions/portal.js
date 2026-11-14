const { randomBytes, randomInt, timingSafeEqual } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { getStorage } = require('firebase-admin/storage');
const { hash, normalizeEmail, validEmail, rateLimit, documentId } = require('./security');
const OTP_LIFETIME = 10 * 60_000;
const otpHash = (challenge, code) => hash(`${challenge}:${code}`);
const INVALID_CODE = 'Code is invalid or expired. Request a new code.';
const FILE_LIMIT = 2 * 1024 * 1024;
const millis = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : Date.parse(value || '');
const iso = value => Number.isFinite(millis(value)) ? new Date(millis(value)).toISOString() : null;
const customerUid = email => `rl_customer_${hash(normalizeEmail(email))}`;
const associationEmail = customer => normalizeEmail(customer.get('email') || customer.get('emailNormalized'));
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/');
const activeCustomer = customer => customer.exists && customer.get('isActive') !== false && !customer.get('deletedAt');
function portalEmailFor(request) {
  const email = normalizeEmail(request.auth?.token?.portalEmail);
  if (!request.auth || request.auth.token?.portal !== true || !validEmail(email) || request.auth.uid !== customerUid(email)) throw new HttpsError('unauthenticated', 'Sign in to the customer portal.');
  return email;
}
async function customersForEmail(db, email) {
  email = normalizeEmail(email);
  const [normalized, legacy] = await Promise.all([
    db.collection('customers').where('emailNormalized', '==', email).limit(26).get(),
    db.collection('customers').where('email', '==', email).limit(26).get(),
  ]);
  // emailNormalized can lag an edited legacy email. The current email remains
  // authoritative; an old normalized index must never preserve old access.
  return [...new Map([...normalized.docs, ...legacy.docs].map((d) => [d.id, d])).values()]
    .filter(d => activeCustomer(d) && associationEmail(d) === email)
    .sort((a, b) => a.id.localeCompare(b.id));
}
function publicJob(id, data) {
  return { id, serviceType: String(data.serviceType || 'Service').slice(0, 300), date: typeof data.date === 'string' ? data.date : iso(data.date)?.slice(0, 10) || '', time: typeof data.time === 'string' ? data.time : '', status: typeof data.status === 'string' ? data.status : 'scheduled' };
}
function publicInvoice(id, data) {
  return { id, invoiceNumber: data.invoiceNumber || id, issueDate: data.issueDate || '', dueDate: data.dueDate || '', status: data.status, total: Number(data.total) || 0, currency: 'USD', lineItems: (Array.isArray(data.lineItems) ? data.lineItems : []).slice(0, 100).map((i) => ({ description: String(i.description || ''), quantity: Number(i.quantity) || 0, unitPrice: Number(i.unitPrice) || 0, amount: Number(i.amount) || 0 })) };
}
function portalHandlers(db, auth, emailEnabled = () => true, { bucketProvider = () => getStorage().bucket(), now = () => Date.now() } = {}) {
  async function associations(email) {
    const customers = await customersForEmail(db, email), groups = new Map();
    for (const customer of customers) {
      const companyId = customer.get('companyId'), userId = customer.get('userId');
      if (companyId ? !validId(companyId) : !validId(userId)) continue;
      const id = companyId ? `company:${companyId}` : `solo:${userId}`;
      if (!groups.has(id)) {
        const company = companyId ? await db.doc(`companies/${companyId}`).get() : null;
        if (companyId && (!company.exists || company.get('isActive') === false || company.get('deletedAt'))) continue;
        groups.set(id, { id, companyId: companyId || null, scopeField: companyId ? 'companyId' : 'userId', scopeValue: companyId || userId, company, customers: [] });
      }
      groups.get(id).customers.push(customer);
    }
    return [...groups.values()];
  }
  const sameScope = (group, data) => group.companyId ? data?.companyId === group.scopeValue : !data?.companyId && data?.userId === group.scopeValue;
  const ownsJob = (group, job) => job.exists && sameScope(group, job.data()) && group.customers.some(customer => customer.id === job.get('customerId'));
  return {
    requestCustomerOTP: async (request) => {
      if (!emailEnabled()) throw new HttpsError('failed-precondition', 'Customer portal sign-in is unavailable while email delivery is disabled. Contact your service provider.');
      const email = normalizeEmail(request.data?.email);
      if (!validEmail(email)) throw new HttpsError('invalid-argument', 'Enter a valid email address.');
      await rateLimit(db, 'portal-request-ip', request.rawRequest?.ip || 'unknown', 15, 15 * 60_000, now());
      await rateLimit(db, 'portal-request-email', email, 3, 15 * 60_000, now());
      const challengeId = randomBytes(24).toString('hex');
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const customers = await customersForEmail(db, email);
      const at = now();
      // Same response for unknown emails; never return an OTP or disclose customer existence.
      if (customers.length) {
        const batch = db.batch();
        batch.set(db.collection('rlPortalChallenges').doc(challengeId), { email, codeHash: otpHash(challengeId, code), expiresAt: new Date(at + OTP_LIFETIME), attempts: 0, consumed: false });
        batch.create(db.collection('rlMail').doc(), { to: email, subject: 'Your Route Logistics customer portal code', text: `Your customer portal sign-in code is ${code}. Enter it at https://route-logistics.com/portal to view your service records. It expires in 10 minutes and can be used once. Team and platform administration use their own sign-in flow at https://route-logistics.com/login. If you did not request this code, ignore this email.`, status: 'queued', availableAt: at, createdAt: new Date(at), expiresAt: new Date(at + OTP_LIFETIME) });
        await batch.commit();
      }
      return { challengeId, message: 'If your provider has registered this email, a sign-in code will arrive shortly.' };
    },
    verifyCustomerOTP: async (request) => {
      if (!emailEnabled()) throw new HttpsError('failed-precondition', 'Customer portal sign-in is unavailable while email delivery is disabled. Contact your service provider.');
      await rateLimit(db, 'portal-verify-ip', request.rawRequest?.ip || 'unknown', 30, 15 * 60_000, now());
      const id = documentId(request.data?.challengeId, 'challenge');
      const code = String(request.data?.code || '');
      if (!/^[a-f0-9]{48}$/.test(id) || !/^\d{6}$/.test(code)) throw new HttpsError('permission-denied', INVALID_CODE);
      const ref = db.collection('rlPortalChallenges').doc(id);
      const email = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref), data = snap.data();
        if (!data || data.consumed || !Number.isInteger(data.attempts) || data.attempts < 0 || data.attempts >= 5 || !Number.isFinite(millis(data.expiresAt)) || millis(data.expiresAt) <= now() || typeof data.codeHash !== 'string' || !/^[a-f0-9]{64}$/.test(data.codeHash) || !validEmail(data.email)) return null;
        const valid = timingSafeEqual(Buffer.from(data.codeHash), Buffer.from(otpHash(id, code)));
        tx.update(ref, { attempts: data.attempts + 1, consumed: valid });
        return valid ? data.email : null;
      });
      if (!email) throw new HttpsError('permission-denied', INVALID_CODE);
      // Isolated identity: never mint a token for an existing staff email/UID or bypass staff MFA.
      const uid = customerUid(email);
      const claims = { portal: true, portalEmail: email };
      try { return { token: await auth.createCustomToken(uid, claims) }; }
      catch { throw new HttpsError('unavailable', 'Sign-in could not finish. Request a new code and try again.'); }
    },
    getCustomerPortal: async (request) => {
      const email = portalEmailFor(request);
      await rateLimit(db, 'portal-read', request.auth.uid, 30, 60000, now());
      const available = await associations(email), selected = request.data?.accountId;
      if (selected !== undefined && !available.some(group => group.id === selected)) throw new HttpsError('permission-denied', 'This provider association is no longer available. Refresh your portal.');
      const groups = selected === undefined ? available : available.filter(group => group.id === selected);
      const accounts = [];
      for (const group of groups.slice(0, 25)) {
        const visits = new Map(), bills = new Map(), photos = new Map(), documents = new Map();
        let hasMore = false;
        for (const customer of group.customers) {
          const query = collection => db.collection(collection).where(group.scopeField, '==', group.scopeValue).where('customerId', '==', customer.id);
          const [jobs, invoices, imageRows, documentRows] = await Promise.all([
            query('jobs').orderBy('date', 'desc').limit(51).get(),
            query('invoices').where('status', 'in', ['sent', 'paid', 'void']).orderBy('createdAt', 'desc').limit(51).get(),
            query('photos').limit(51).get(), query('rlPortalDocuments').limit(51).get(),
          ]);
          hasMore ||= [jobs, invoices, imageRows, documentRows].some(rows => rows.size > 50);
          for (const row of jobs.docs) if (sameScope(group, row.data())) visits.set(row.id, publicJob(row.id, row.data()));
          for (const row of invoices.docs) if (sameScope(group, row.data())) bills.set(row.id, { ...publicInvoice(row.id, row.data()), sortDate: iso(row.get('createdAt')) || '' });
          for (const row of imageRows.docs) if (row.get('customerVisible') === true && sameScope(group, row.data())) photos.set(row.id, { id: row.id, jobId: row.get('jobId'), caption: String(row.get('caption') || '').slice(0, 500), kind: 'photo', createdAt: iso(row.get('createdAt')) });
          for (const row of documentRows.docs) if (row.get('customerVisible') === true && row.get('status') === 'published' && sameScope(group, row.data())) documents.set(row.id, { id: row.id, jobId: row.get('jobId'), name: String(row.get('name') || 'Service document').slice(0, 200), kind: 'document', createdAt: iso(row.get('createdAt')) });
        }
        // Metadata may itself contain a stale/cross-customer job link. Declassify
        // only attachments belonging to service visits in this live association.
        const visiblePhotos = [...photos.values()].filter(row => visits.has(row.jobId));
        const visibleDocuments = [...documents.values()].filter(row => visits.has(row.jobId));
        hasMore ||= visits.size > 50 || bills.size > 50 || visiblePhotos.length > 50 || visibleDocuments.length > 50;
        accounts.push({ id: group.id, companyId: group.companyId, companyName: group.company?.get('name') || 'Service provider', contactEmail: group.company?.get('email') || '', duplicateCustomerCount: Math.max(0, group.customers.length - 1), jobs: [...visits.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50), invoices: [...bills.values()].sort((a, b) => b.sortDate.localeCompare(a.sortDate)).slice(0, 50).map(({ sortDate, ...invoice }) => invoice), photos: visiblePhotos.slice(0, 50), documents: visibleDocuments.slice(0, 50), hasMore });
      }
      return { accounts, hasMoreAccounts: groups.length > 25 };
    },
    getCustomerPortalFile: async request => {
      const email = portalEmailFor(request), data = request.data || {};
      await rateLimit(db, 'portal-file', request.auth.uid, 40, 60000, now());
      if (!['photo', 'document'].includes(data.kind) || typeof data.accountId !== 'string') throw new HttpsError('invalid-argument', 'Choose a shared service file.');
      const group = (await associations(email)).find(item => item.id === data.accountId);
      if (!group) throw new HttpsError('permission-denied', 'This provider association is no longer available. Refresh your portal.');
      const fileId = documentId(data.fileId, 'file'), row = await db.doc(`${data.kind === 'photo' ? 'photos' : 'rlPortalDocuments'}/${fileId}`).get();
      const denied = () => { throw new HttpsError('permission-denied', 'This service file is not available.'); };
      if (!row.exists || !sameScope(group, row.data()) || row.get('customerVisible') !== true || data.kind === 'document' && row.get('status') !== 'published' || !validId(row.get('jobId'))) denied();
      const job = await db.doc(`jobs/${row.get('jobId')}`).get();
      if (!ownsJob(group, job) || row.get('customerId') !== job.get('customerId')) denied();
      const path = row.get('storagePath');
      const prefixes = data.kind === 'document' ? [`rlPortalDocuments/${group.scopeValue}/${job.id}/`] : [
        `rlJobPhotos/${group.scopeValue}/${job.id}/`,
        `${group.companyId ? 'companies' : 'users'}/${group.scopeValue}/jobs/${job.id}/`,
        ...(group.companyId && validId(job.get('userId')) ? [`users/${job.get('userId')}/jobs/${job.id}/`] : []),
      ];
      if (typeof path !== 'string' || !prefixes.some(prefix => path.startsWith(prefix)) || path.split('/').some(segment => !segment || segment === '.' || segment === '..')) denied();
      let file, metadata;
      try { file = bucketProvider().file(path); [metadata] = await file.getMetadata(); }
      catch { throw new HttpsError('unavailable', 'This shared file is unavailable. Refresh the portal or contact your provider.'); }
      const types = data.kind === 'document' ? ['application/pdf'] : ['image/jpeg', 'image/png', 'image/webp'];
      if (!types.includes(metadata.contentType) || !Number.isFinite(Number(metadata.size)) || Number(metadata.size) <= 0 || Number(metadata.size) > FILE_LIMIT) throw new HttpsError('failed-precondition', 'This shared file must be a supported image or PDF smaller than 2 MB.');
      let bytes;
      try { [bytes] = await file.download({ start: 0, end: FILE_LIMIT }); }
      catch { throw new HttpsError('unavailable', 'This shared file is unavailable. Refresh the portal or contact your provider.'); }
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > FILE_LIMIT) throw new HttpsError('failed-precondition', 'This shared file exceeds the download limit.');
      // Recheck immediately before declassification; no long-lived signed URL or
      // Firebase download token can outlive a revoked provider association.
      const [currentCustomer, currentRow, currentJob, currentCompany] = await Promise.all([db.doc(`customers/${job.get('customerId')}`).get(), row.ref.get(), job.ref.get(), group.companyId ? group.company.ref.get() : Promise.resolve(null)]);
      if (!activeCustomer(currentCustomer) || associationEmail(currentCustomer) !== email || !sameScope(group, currentCustomer.data()) || !ownsJob(group, currentJob) || currentJob.get('customerId') !== currentCustomer.id || currentRow.get('customerVisible') !== true || currentRow.get('storagePath') !== path || currentRow.get('jobId') !== job.id || currentRow.get('customerId') !== currentCustomer.id || data.kind === 'document' && currentRow.get('status') !== 'published' || currentCompany && (!currentCompany.exists || currentCompany.get('isActive') === false || currentCompany.get('deletedAt'))) denied();
      return { dataUri: `data:${metadata.contentType};base64,${bytes.toString('base64')}`, contentType: metadata.contentType, name: String(row.get('name') || (data.kind === 'photo' ? 'Service photo' : 'Service document')).slice(0, 200) };
    },
  };
}
module.exports = { portalHandlers, otpHash, customerUid, customersForEmail, publicJob, publicInvoice, FILE_LIMIT };
