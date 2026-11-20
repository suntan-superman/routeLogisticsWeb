const { FieldPath } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const { documentId, rateLimit } = require('./security');

const STATUSES = ['trial', 'active', 'paused', 'canceled', 'expired'];
const PAGE_SIZE = 25;
const emptySubscription = { plan: '', status: 'unassigned', endDate: '', revision: 0, updatedAt: null };

function cleanText(value, label, max) {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (!clean || clean.length > max || /[\u0000-\u001f\u007f]/.test(clean)) {
    throw new HttpsError('invalid-argument', `Enter a ${label} of 1–${max} characters.`);
  }
  return clean;
}

function cleanSubscription(data) {
  const plan = cleanText(data.plan, 'plan name', 100);
  if (!STATUSES.includes(data.status)) throw new HttpsError('invalid-argument', 'Choose a subscription status.');
  const endDate = data.endDate ?? '';
  if (endDate !== '') {
    const date = typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? new Date(endDate) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== endDate) {
      throw new HttpsError('invalid-argument', 'Enter a valid end date.');
    }
  }
  return { plan, status: data.status, endDate };
}

function projectSubscription(row) {
  if (!row.exists) return { ...emptySubscription };
  const { plan, status, endDate, revision, updatedAt } = row.data();
  return { plan, status, endDate, revision, updatedAt };
}

function projectCompany(row, subscription) {
  const name = [row.get('businessName'), row.get('name')].find(value => typeof value === 'string' && value.trim());
  return { id: row.id, name: name?.trim().slice(0, 200) || 'Unnamed company', subscription };
}

function platformSubscriptionHandler(db, requireAdmin) {
  const subscriptions = db.collection('rlCompanySubscriptions');
  const companies = db.collection('companies');
  return async request => {
    const auth = await requireAdmin(request);
    await rateLimit(db, 'platform-subscriptions', auth.uid, 90);
    const data = request.data || {};

    if (data.action === 'list') {
      let query = companies.select('name', 'businessName').orderBy(FieldPath.documentId());
      if (data.cursor != null) query = query.startAfter(documentId(data.cursor, 'company cursor'));
      const { docs } = await query.limit(PAGE_SIZE + 1).get();
      const page = docs.slice(0, PAGE_SIZE);
      const rows = page.length ? await db.getAll(...page.map(row => subscriptions.doc(row.id))) : [];
      return {
        items: page.map((row, index) => projectCompany(row, projectSubscription(rows[index]))),
        nextCursor: docs.length > PAGE_SIZE ? page.at(-1).id : null,
      };
    }

    if (!['get', 'save'].includes(data.action)) throw new HttpsError('invalid-argument', 'Choose a subscription action.');
    const id = documentId(data.companyId, 'company ID');
    const companyRef = companies.doc(id);
    const subscriptionRef = subscriptions.doc(id);
    const historyRef = subscriptionRef.collection('history');

    if (data.action === 'get') {
      const [company, subscription, history] = await Promise.all([
        companyRef.get(), subscriptionRef.get(), historyRef.orderBy('revision', 'desc').limit(20).get(),
      ]);
      if (!company.exists) throw new HttpsError('not-found', 'Company not found.');
      return { item: projectCompany(company, projectSubscription(subscription)), history: history.docs.map(row => row.data()) };
    }

    const change = cleanSubscription(data);
    const reason = cleanText(data.reason, 'change reason', 500);
    if (!Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0) {
      throw new HttpsError('invalid-argument', 'Reload the subscription before saving.');
    }
    return db.runTransaction(async tx => {
      const actor = await requireAdmin(request, tx);
      const [company, current] = await Promise.all([tx.get(companyRef), tx.get(subscriptionRef)]);
      if (!company.exists) throw new HttpsError('not-found', 'Company not found.');
      const before = projectSubscription(current);
      if (before.revision !== data.expectedRevision) {
        throw new HttpsError('aborted', 'This subscription changed in another session. Reload before saving.');
      }
      if (Object.keys(change).every(key => change[key] === before[key])) {
        return { item: projectCompany(company, before), unchanged: true };
      }
      const after = { ...change, revision: before.revision + 1, updatedAt: new Date().toISOString() };
      tx.set(subscriptionRef, after);
      const entry = { revision: after.revision, actorId: actor.uid, reason, before, after, createdAt: after.updatedAt };
      tx.create(historyRef.doc(String(after.revision)), entry);
      return { item: projectCompany(company, after), entry };
    });
  };
}

module.exports = { platformSubscriptionHandler };
