const { randomUUID, timingSafeEqual } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { accessScope } = require('./access');
const { hash, documentId, normalizeEmail, rateLimit } = require('./security');
const { portalEmailFor, portalAssociations, activeCustomer, associationEmail } = require('./portal');

const REVIEW_STATUSES = ['unreviewed', 'approved', 'flagged', 'hidden'];
const millis = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value || '');
const iso = value => Number.isFinite(millis(value)) ? new Date(millis(value)).toISOString() : null;
const reviewIdFor = jobId => hash('review:' + documentId(jobId, 'service visit'));
const completionKeyFor = job => hash(`completed:${job.id}:${iso(job.get('completedAt') || job.get('updatedAt') || job.createTime) || ''}`);
const scopeKey = data => data.companyId ? 'company:' + data.companyId : 'solo:' + data.userId;
const sameScope = (first, second) => first.companyId ? first.companyId === second?.companyId : !second?.companyId && !!first.userId && first.userId === second.userId;
const validCompleted = data => !!data && data.status === 'completed' && !data.deletedAt && !data.invalidatedAt && !data.voidedAt && data.isActive !== false;
const fail = (code, message) => { throw new HttpsError(code, message); };
function text(value, maximum, label, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.trim().length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || required && !value.trim()) fail('invalid-argument', `Enter ${label}${maximum ? ` (up to ${maximum} characters)` : ''}.`);
  return value.trim();
}
function reviewInput(input = {}) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) fail('invalid-argument', 'Choose a rating from one to five stars.');
  if (input.onTime !== undefined && input.onTime !== null && typeof input.onTime !== 'boolean') fail('invalid-argument', 'Choose yes, no, or prefer not to answer for on-time arrival.');
  if (input.publicConsent !== undefined && typeof input.publicConsent !== 'boolean') fail('invalid-argument', 'Choose whether this feedback may be considered for public display.');
  return { rating: input.rating, comment: text(input.comment, 4000, 'an optional review comment'), onTime: input.onTime ?? null, publicConsent: input.publicConsent === true };
}
function reviewView(row, { provider = false, eligible = false } = {}) {
  const data = typeof row.data === 'function' ? row.data() : row;
  const publicEligible = eligible && data.verifiedService === true && data.synthetic !== true && data.publicConsent === true && data.moderationStatus === 'approved';
  return { id: row.id || data.id, jobId: data.jobId, serviceType: data.serviceType || 'Service', serviceDate: data.serviceDate || '', completedAt: data.completedAt || null, rating: data.rating, comment: data.comment || '', onTime: data.onTime ?? null, publicConsent: data.publicConsent === true, publicEligible, publicStatus: publicEligible ? 'eligible' : 'private', moderationStatus: data.moderationStatus || 'unreviewed', providerResponse: data.providerResponse || null, verifiedService: data.verifiedService === true, synthetic: data.synthetic === true, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt), ...(provider ? { customerName: data.customerName || 'Customer', internalNotes: Array.isArray(data.internalNotes) ? data.internalNotes : [], moderationHistory: Array.isArray(data.moderationHistory) ? data.moderationHistory : [], hasMoreHistory: data.hasMoreHistory === true } : {}) };
}
function reviewHandlers(db, { now = () => Date.now() } = {}) {
  const reviewRef = jobId => db.doc('rlReviews/' + reviewIdFor(jobId));
  const statsRef = scope => db.doc('rlReviewStats/' + hash(scopeKey(scope)));
  const audit = (tx, reviewId, data) => tx.create(db.doc('rlReviewAudit/' + randomUUID()), { reviewId, ...data, createdAt: new Date(now()).toISOString() });
  const providerLive = company => company.exists && company.get('isActive') !== false && !company.get('deletedAt');
  function validateService(job, customer, company) {
    const data = job.data();
    if (!job.exists || !validCompleted(data)) fail('failed-precondition', 'Only a completed, valid service visit can receive feedback.');
    if (!activeCustomer(customer) || customer.id !== data.customerId || !sameScope(data, customer.data()) || data.companyId && !providerLive(company)) fail('permission-denied', 'This service visit is no longer available to this customer.');
    return data;
  }
  async function submitInTransaction(tx, { job: suppliedJob, jobId, actor = {}, source, input, invitationId, invitationToken }) {
    const values = reviewInput(input), job = await tx.get(db.doc('jobs/' + documentId(suppliedJob?.id || jobId, 'service visit')));
    if (!job.exists) fail('permission-denied', 'This service visit is unavailable.');
    const data = job.data(), companyId = data.companyId || null, userId = data.userId || null;
    if (!companyId && !userId) fail('permission-denied', 'This service visit has no valid provider.');
    const target = reviewRef(job.id), destinationStats = statsRef(data), invitationRef = source === 'invitation' ? db.doc('rlReviewInvitations/' + documentId(invitationId, 'review invitation')) : null;
    const [customer, company, previous, stats, invitation] = await Promise.all([tx.get(db.doc('customers/' + documentId(data.customerId, 'service customer'))), companyId ? tx.get(db.doc('companies/' + documentId(companyId, 'provider'))) : Promise.resolve(null), tx.get(target), tx.get(destinationStats), invitationRef ? tx.get(invitationRef) : Promise.resolve(null)]);
    validateService(job, customer, company);
    if (source === 'portal') {
      if (!actor.uid || actor.uid !== require('./portal').customerUid(actor.portalEmail) || associationEmail(customer) !== normalizeEmail(actor.portalEmail)) fail('permission-denied', 'This service visit is not associated with your signed-in customer portal.');
    } else if (source === 'invitation') {
      const storedHash = invitation?.get('tokenHash');
      if (!invitation?.exists || typeof invitationToken !== 'string' || !/^[a-f0-9]{64}$/.test(invitationToken) || typeof storedHash !== 'string' || !/^[a-f0-9]{64}$/.test(storedHash) || !timingSafeEqual(Buffer.from(storedHash), Buffer.from(hash(invitationToken))) || !['open', 'submitted'].includes(invitation.get('status')) || millis(invitation.get('expiresAt')) <= now() || !Number.isFinite(millis(invitation.get('expiresAt'))) || invitation.get('jobId') !== job.id || invitation.get('customerId') !== customer.id || (invitation.get('companyId') || null) !== companyId || !companyId && invitation.get('userId') !== userId || invitation.get('completionKey') !== completionKeyFor(job) || normalizeEmail(invitation.get('customerEmail')) !== associationEmail(customer)) fail('permission-denied', 'This review invitation is invalid, expired, used, or no longer available. Open your customer portal or ask your provider for help.');
    } else fail('permission-denied', 'An authenticated customer or secure invitation is required.');
    if (previous.exists) {
      if (!sameScope(data, previous.data()) || previous.get('customerId') !== customer.id || previous.get('customerIdentityHash') !== hash(associationEmail(customer))) fail('permission-denied', 'This service visit has already been reviewed.');
      if (previous.get('rating') !== values.rating || previous.get('comment') !== values.comment || (previous.get('onTime') ?? null) !== values.onTime) fail('already-exists', 'This service visit already has a review. Ratings and comments cannot be replaced.');
      // A transport retry never restores withdrawn publication permission.
      if (invitation?.get('status') === 'open') tx.update(invitationRef, { status: 'submitted', consumedAt: new Date(now()), reviewId: target.id });
      return { review: reviewView(previous, { eligible: true }), existing: true };
    }
    if (invitation?.get('status') === 'submitted') fail('permission-denied', 'This invitation has already been used.');
    const createdAt = new Date(now()).toISOString(), current = { companyId, userId, customerId: customer.id, customerIdentityHash: hash(associationEmail(customer)), jobId: job.id, customerName: String(customer.get('name') || [customer.get('firstName'), customer.get('lastName')].filter(Boolean).join(' ') || 'Customer').slice(0, 200), serviceType: String(data.serviceType || 'Service').slice(0, 200), serviceDate: typeof data.date === 'string' ? data.date.slice(0, 10) : iso(data.date)?.slice(0, 10) || '', completedAt: iso(data.completedAt) || null, ...values, verifiedService: true, synthetic: data.synthetic === true || data.testFixture === true || data.testOnly === true || data.isTestRecord === true, source, authorId: source === 'portal' ? actor.uid : 'invitation:' + hash(customer.id), ...(invitationId ? { invitationId } : {}), moderationStatus: 'unreviewed', publicStatus: 'private', providerResponse: null, internalNotes: [], moderationHistory: [], publicConsentAt: values.publicConsent ? createdAt : null, publicConsentWithdrawnAt: null, createdAt, updatedAt: createdAt };
    tx.create(target, current);
    tx.set(destinationStats, { companyId, userId, count: Number(stats.get('count') || 0) + 1, totalRating: Number(stats.get('totalRating') || 0) + values.rating, serviceTypes: [...new Set([...(stats.get('serviceTypes') || []), current.serviceType])].slice(0, 500), updatedAt: createdAt });
    if (invitation) tx.update(invitationRef, { status: 'submitted', consumedAt: new Date(now()), reviewId: target.id });
    audit(tx, target.id, { action: 'review.submit', companyId, userId, actorId: current.authorId, source, publicConsent: values.publicConsent });
    return { review: reviewView({ ...current, id: target.id }, { eligible: true }), existing: false };
  }
  async function customer(request) {
    const email = portalEmailFor(request), data = request.data || {}, action = data.action;
    await rateLimit(db, 'customer-reviews', request.auth.uid, 30, 60000, now());
    const group = (await portalAssociations(db, email)).find(row => row.id === data.accountId);
    if (!group) fail('permission-denied', 'This provider association is no longer available. Refresh your customer portal.');
    const inGroup = value => group.companyId ? value?.companyId === group.companyId : !value?.companyId && value?.userId === group.scopeValue;
    if (action === 'list') {
      const eligibleVisits = new Map(), reviews = new Map(), jobsById = new Map(), customerIds = group.customers.map(row => row.id); let hasMore = false;
      let cursor = null;
      if (data.reviewCursor) {
        cursor = await db.doc('rlReviews/' + documentId(data.reviewCursor, 'review history cursor')).get();
        if (!cursor.exists || !inGroup(cursor.data()) || !customerIds.includes(cursor.get('customerId')) || cursor.get('customerIdentityHash') !== hash(email)) fail('permission-denied', 'This review history page is unavailable. Refresh your provider account.');
      }
      for (const person of group.customers) {
        const jobs = await db.collection('jobs').where(group.scopeField, '==', group.scopeValue).where('customerId', '==', person.id).orderBy('date', 'desc').limit(101).get();
        hasMore ||= jobs.size > 100;
        for (const job of jobs.docs.slice(0, 100)) { jobsById.set(job.id, job); if (validCompleted(job.data())) {
          const existing = await reviewRef(job.id).get();
          if (!existing.exists) eligibleVisits.set(job.id, { jobId: job.id, serviceType: String(job.get('serviceType') || 'Service').slice(0, 200), date: typeof job.get('date') === 'string' ? job.get('date') : iso(job.get('date'))?.slice(0, 10) || '', time: String(job.get('time') || '').slice(0, 20), completedAt: iso(job.get('completedAt')) });
        } }
      }
      // Filter identity and tenant inside the ordered query. Filtering after a
      // fixed limit could hide older owned feedback behind a previous identity's
      // rows, or produce a cursor the signed-in customer cannot use.
      const history = [];
      for (let offset = 0; offset < customerIds.length; offset += 30) {
        let query = db.collection('rlReviews').where('customerId', 'in', customerIds.slice(offset, offset + 30)).where('customerIdentityHash', '==', hash(email)).where(group.scopeField, '==', group.scopeValue).orderBy('createdAt', 'desc');
        if (cursor) query = query.startAfter(cursor);
        history.push(...(await query.limit(101).get()).docs);
      }
      history.sort((a, b) => String(b.get('createdAt')).localeCompare(String(a.get('createdAt'))) || b.id.localeCompare(a.id));
      const page = history.slice(0, 100), hasMoreReviews = history.length > 100;
      for (const row of page) {
        if (!inGroup(row.data()) || !customerIds.includes(row.get('customerId')) || row.get('customerIdentityHash') !== hash(email)) continue;
        const job = jobsById.get(row.get('jobId')) || await db.doc('jobs/' + documentId(row.get('jobId'))).get();
        // Feedback belongs to its original customer/provider, independently of a
        // later job deletion or reassignment. Current work is consulted only to
        // determine public eligibility; no foreign job fields are declassified.
        const eligible = job.exists && inGroup(job.data()) && job.get('customerId') === row.get('customerId') && validCompleted(job.data());
        reviews.set(row.id, reviewView(row, { eligible }));
      }
      // Recheck associations after data retrieval; a concurrent revocation must not
      // return service feedback merely because an earlier email index matched.
      const live = (await portalAssociations(db, email)).find(row => row.id === group.id), liveCustomers = new Set(live?.customers.map(row => row.id));
      if (!live || group.customers.some(row => !liveCustomers.has(row.id))) fail('permission-denied', 'Your provider association changed. Refresh the portal before viewing feedback.');
      return { eligibleVisits: [...eligibleVisits.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100), reviews: [...reviews.values()], hasMore: hasMore || eligibleVisits.size > 100, hasMoreReviews, reviewCursor: hasMoreReviews ? page.at(-1).id : null };
    }
    if (action === 'submit') {
      const jobId = documentId(data.jobId, 'service visit');
      return db.runTransaction(async tx => {
        const job = await tx.get(db.doc('jobs/' + jobId));
        if (!job.exists || !inGroup(job.data()) || !group.customers.some(row => row.id === job.get('customerId'))) fail('permission-denied', 'This service visit does not belong to the selected provider account.');
        return submitInTransaction(tx, { job, source: 'portal', actor: { uid: request.auth.uid, portalEmail: email }, input: data });
      });
    }
    if (action === 'consent') {
      if (typeof data.publicConsent !== 'boolean') fail('invalid-argument', 'Choose whether this review may be considered for public display.');
      const target = db.doc('rlReviews/' + documentId(data.reviewId, 'review'));
      return db.runTransaction(async tx => {
        const row = await tx.get(target);
        if (!row.exists || !inGroup(row.data()) || row.get('customerIdentityHash') !== hash(email)) fail('permission-denied', 'This review does not belong to your provider account.');
        const [person, job, company] = await Promise.all([tx.get(db.doc('customers/' + documentId(row.get('customerId')))), tx.get(db.doc('jobs/' + documentId(row.get('jobId')))), group.companyId ? tx.get(db.doc('companies/' + group.companyId)) : Promise.resolve(null)]);
        if (!activeCustomer(person) || !inGroup(person.data()) || associationEmail(person) !== email || group.companyId && !providerLive(company)) fail('permission-denied', 'Your review association is no longer available. Refresh the portal.');
        const at = new Date(now()).toISOString(), changed = row.get('publicConsent') !== data.publicConsent;
        const patch = { publicConsent: data.publicConsent, publicStatus: 'private', ...(changed ? { updatedAt: at, ...(data.publicConsent ? { publicConsentAt: at } : { publicConsentWithdrawnAt: at }) } : {}) };
        if (changed) { tx.update(target, patch); audit(tx, row.id, { action: data.publicConsent ? 'consent.grant' : 'consent.withdraw', companyId: row.get('companyId') || null, userId: row.get('userId') || null, actorId: request.auth.uid }); }
        return { review: reviewView({ ...row.data(), ...patch, id: row.id }, { eligible: job.exists && inGroup(job.data()) && job.get('customerId') === person.id && validCompleted(job.data()) }) };
      });
    }
    fail('invalid-argument', 'Choose a supported customer feedback action.');
  }
  async function provider(request) {
    const scope = await accessScope(db, request), data = request.data || {}, action = data.action;
    if (!['owner', 'manager'].includes(scope.role)) fail('permission-denied', 'Only company owners and managers can manage service feedback.');
    if (data.companyId !== undefined && data.companyId !== scope.companyId) fail('permission-denied', 'Feedback belongs to another provider.');
    await rateLimit(db, 'provider-reviews', scope.uid, 60, 60000, now());
    const inScope = value => scope.companyId ? value?.companyId === scope.companyId : !value?.companyId && value?.userId === scope.uid;
    const queryBase = () => db.collection('rlReviews').where(scope.companyId ? 'companyId' : 'userId', '==', scope.companyId || scope.uid).orderBy('createdAt', 'desc');
    if (action === 'list') {
      if (data.rating !== undefined && data.rating !== '' && (!Number.isInteger(Number(data.rating)) || Number(data.rating) < 1 || Number(data.rating) > 5)) fail('invalid-argument', 'Filter by a rating from one to five.');
      if (data.status && !REVIEW_STATUSES.includes(data.status)) fail('invalid-argument', 'Choose a supported moderation status.');
      const serviceType = data.serviceType ? text(data.serviceType, 200, 'a service type') : '';
      for (const key of ['fromDate', 'toDate']) if (data[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(data[key]) || !Number.isFinite(Date.parse(data[key])) || new Date(data[key]).toISOString().slice(0, 10) !== data[key])) fail('invalid-argument', 'Choose valid review filter dates.');
      if (data.fromDate && data.toDate && data.fromDate > data.toDate) fail('invalid-argument', 'The start date must be before the end date.');
      let query = queryBase();
      if (data.cursor) { const cursor = await db.doc('rlReviews/' + documentId(data.cursor, 'review cursor')).get(); if (!cursor.exists || !inScope(cursor.data())) fail('permission-denied', 'This review page is unavailable. Refresh the list.'); query = query.startAfter(cursor); }
      const [rows, stats] = await Promise.all([query.limit(101).get(), statsRef({ companyId: scope.companyId, userId: scope.uid }).get()]);
      const page = rows.docs.slice(0, 100), filtered = page.filter(row => inScope(row.data()) && (!data.rating || Number(data.rating) === row.get('rating')) && (!serviceType || row.get('serviceType') === serviceType) && (!data.status || row.get('moderationStatus') === data.status) && (!data.fromDate || String(row.get('createdAt')).slice(0, 10) >= data.fromDate) && (!data.toDate || String(row.get('createdAt')).slice(0, 10) <= data.toDate));
      const reviews = [];
      for (const row of filtered) { const [job, person] = await Promise.all([db.doc('jobs/' + documentId(row.get('jobId'))).get(), db.doc('customers/' + documentId(row.get('customerId'))).get()]); reviews.push(reviewView(row, { provider: true, eligible: job.exists && inScope(job.data()) && job.get('customerId') === row.get('customerId') && validCompleted(job.data()) && activeCustomer(person) && inScope(person.data()) && row.get('customerIdentityHash') === hash(associationEmail(person)) })); }
      // Staff authority is checked again after potentially slow reads.
      await assertProvider(scope);
      const count = Number(stats.get('count') || 0), totalRating = Number(stats.get('totalRating') || 0);
      return { reviews, stats: { count, averageRating: count ? Math.round(totalRating / count * 100) / 100 : 0 }, serviceTypes: stats.get('serviceTypes') || [], hasMore: rows.size > 100, cursor: rows.size > 100 ? page.at(-1).id : null };
    }
    const target = db.doc('rlReviews/' + documentId(data.reviewId, 'review'));
    if (action === 'history') {
      const row = await target.get(); if (!row.exists || !inScope(row.data())) fail('permission-denied', 'This review is unavailable to your company.');
      const history = await db.collection('rlReviewAudit').where('reviewId', '==', row.id).limit(501).get();
      await assertProvider(scope);
      return { history: history.docs.filter(item => inScope(item.data())).map(item => ({ id: item.id, action: item.get('action'), actorId: item.get('actorId'), text: item.get('text') || '', status: item.get('status') || '', reason: item.get('reason') || '', createdAt: item.get('createdAt') })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), hasMore: history.size > 500 };
    }
    if (!['respond', 'note', 'moderate'].includes(action)) fail('invalid-argument', 'Choose a supported provider review action.');
    const value = action === 'respond' ? text(data.response, 2000, 'a provider response') : action === 'note' ? text(data.note, 2000, 'an internal follow-up note', true) : text(data.reason, 1000, 'a moderation reason', true);
    if (action === 'moderate' && !REVIEW_STATUSES.includes(data.status)) fail('invalid-argument', 'Choose a supported moderation status.');
    return db.runTransaction(async tx => {
      const row = await tx.get(target); if (!row.exists || !inScope(row.data())) fail('permission-denied', 'This review is unavailable to your company.');
      await assertProvider(scope, tx);
      const at = new Date(now()).toISOString(), patch = { updatedAt: at };
      if (action === 'respond') patch.providerResponse = value ? { text: value, createdAt: at } : null;
      if (action === 'note') { const notes = row.get('internalNotes') || []; patch.internalNotes = [...notes, { text: value, actorId: scope.uid, createdAt: at }].slice(-50); if (notes.length >= 50) patch.hasMoreHistory = true; }
      if (action === 'moderate') { const history = row.get('moderationHistory') || []; patch.moderationStatus = data.status; patch.publicStatus = 'private'; patch.moderationHistory = [...history, { status: data.status, reason: value, actorId: scope.uid, createdAt: at }].slice(-50); if (history.length >= 50) patch.hasMoreHistory = true; }
      tx.update(target, patch); audit(tx, row.id, { action: 'provider.' + action, companyId: row.get('companyId') || null, userId: row.get('userId') || null, actorId: scope.uid, ...(action === 'moderate' ? { status: data.status, reason: value } : { text: value }) });
      // Mutating provider actions cannot publish or restore customer consent.
      return { review: reviewView({ ...row.data(), ...patch, id: row.id }, { provider: true, eligible: false }) };
    });
  }
  async function assertProvider(scope, tx) {
    if (!scope.companyId) return;
    const read = ref => tx ? tx.get(ref) : ref.get(), company = await read(db.doc('companies/' + scope.companyId));
    if (!providerLive(company) || scope.role === 'owner' && company.get('ownerId') !== scope.uid) fail('permission-denied', 'Your company access changed. Refresh before managing feedback.');
    if (scope.role === 'manager') { const member = await read(db.doc('teamMembers/' + documentId(scope.memberId))); if (!member.exists || member.get('uid') !== scope.uid || member.get('companyId') !== scope.companyId || member.get('role') !== 'manager' || member.get('status') !== 'active') fail('permission-denied', 'Your company access changed. Refresh before managing feedback.'); }
  }
  return { customer, provider, submitInTransaction };
}
module.exports = { reviewHandlers, reviewIdFor, completionKeyFor, reviewInput, reviewView, validCompleted, REVIEW_STATUSES };
