const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app'), { getFirestore } = req('firebase-admin/firestore');
const { reviewHandlers, reviewIdFor, completionKeyFor } = require('../functions/reviews');
const { portalHandlers, customerUid, linkId } = require('../functions/portal');
const { hash } = require('../functions/security');
let app, db, sequence = 0;
before(() => { if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Local Firestore emulator required; production reviews must never be changed by tests.'); app = initializeApp({ projectId: 'demo-routelogistics' }, 'review-core-tests'); db = getFirestore(app); });
after(() => deleteApp(app));
async function fixture() {
  const id = `reviews-core-${++sequence}`, email = id + '@example.test', companyA = id + '-company-a', companyB = id + '-company-b', customerA = id + '-customer-a', customerB = id + '-customer-b', ownerId = id + '-owner', memberId = id + '-manager';
  let clock = Date.parse('2026-11-14T21:00:00Z');
  for (const [companyId, owner] of [[companyA, ownerId], [companyB, id + '-owner-b']]) await db.doc('companies/' + companyId).set({ ownerId: owner, name: 'Synthetic provider', isActive: true });
  for (const [customerId, companyId] of [[customerA, companyA], [customerB, companyB]]) await db.doc('customers/' + customerId).set({ companyId, name: 'Synthetic customer', email, emailNormalized: email, isActive: true, address: 'PRIVATE BILLING ADDRESS' });
  for (const [customerId, companyId] of [[customerA, companyA], [customerB, companyB]]) await db.doc(`rlPortalLinks/${linkId(customerId,email)}`).set({ customerId, scopeId: `company:${companyId}`, email, status: 'active', portalUid: customerUid(email) });
  await db.doc('teamMembers/' + memberId).set({ uid: id + '-manager-user', companyId: companyA, role: 'manager', status: 'active' });
  const jobs = { a: id + '-job-a', b: id + '-job-b' };
  for (const [jobId, companyId, customerId] of [[jobs.a, companyA, customerA], [jobs.b, companyB, customerB]]) await db.doc('jobs/' + jobId).set({ companyId, userId: companyId === companyA ? ownerId : id + '-owner-b', customerId, serviceType: 'Inspection', date: '2026-11-14', time: '10:00', status: 'completed', completedAt: new Date(clock).toISOString(), updatedAt: new Date(clock).toISOString(), internalNotes: 'PRIVATE JOB NOTE' });
  const auth = { uid: customerUid(email), token: { portal: true, portalEmail: email } }, owner = { uid: ownerId, token: { companyId: companyA, role: 'owner', email_verified: true } }, manager = { uid: id + '-manager-user', token: { companyId: companyA, membershipId: memberId, role: 'manager', email_verified: true } };
  const handlers = reviewHandlers(db, { now: () => clock }), accountId = 'company:' + companyA;
  const customer = (action, data = {}, identity = auth) => handlers.customer({ auth: identity, data: { action, accountId, ...data } });
  const provider = (action, data = {}, identity = owner) => handlers.provider({ auth: identity, data: { action, ...data } });
  const submit = (input = {}, jobId = jobs.a) => customer('submit', { jobId, rating: 3, comment: 'Synthetic private feedback', onTime: true, ...input });
  return { id, email, companyA, companyB, customerA, customerB, ownerId, memberId, jobs, auth, owner, manager, handlers, accountId, customer, provider, submit, now: () => clock, advance: ms => clock += ms };
}
async function invitation(f, overrides = {}) {
  const job = await db.doc('jobs/' + f.jobs.a).get(), id = f.id + '-invitation', token = 'a'.repeat(64);
  await db.doc('rlReviewInvitations/' + id).set({ companyId: f.companyA, userId: f.ownerId, customerId: f.customerA, jobId: f.jobs.a, customerEmail: f.email, status: 'open', completionKey: completionKeyFor(job), tokenHash: hash(token), expiresAt: new Date(f.now() + 3600000), ...overrides });
  const submit = input => db.runTransaction(tx => f.handlers.submitInTransaction(tx, { jobId: f.jobs.a, source: 'invitation', invitationId: id, invitationToken: token, input: { rating: 4, comment: 'Invited private feedback', ...input } }));
  return { id, token, submit };
}

test('OTP-authenticated customers review completed visits and retain reviews while switching providers', async () => {
  const f = await fixture(); let minted;
  const portal = portalHandlers(db, { createCustomToken: async (uid, claims) => { minted = { uid, token: claims }; return 'synthetic-token'; } }, () => true, { now: f.now });
  const challenge = await portal.requestCustomerOTP({ data: { email: f.email }, rawRequest: { ip: f.id } });
  const mail = await db.collection('rlMail').where('to', '==', f.email).get(), code = mail.docs[0].get('text').match(/\b\d{6}\b/)[0];
  await portal.verifyCustomerOTP({ data: { challengeId: challenge.challengeId, code }, rawRequest: { ip: f.id } });
  const listed = await f.customer('list', {}, minted); assert.deepEqual(listed.eligibleVisits.map(row => row.jobId), [f.jobs.a]);
  const result = await f.customer('submit', { jobId: f.jobs.a, rating: 1, comment: 'The visit was late.', onTime: false, publicConsent: false }, minted);
  assert.equal(result.review.verifiedService, true); assert.equal(result.review.publicStatus, 'private'); assert.equal(result.existing, false);
  assert.equal(result.review.customerName, undefined); assert.equal(result.review.internalNotes, undefined);
  const other = await f.customer('list', { accountId: 'company:' + f.companyB }); assert.equal(other.reviews.length, 0); assert.deepEqual(other.eligibleVisits.map(row => row.jobId), [f.jobs.b]);
  const original = await f.customer('list'); assert.equal(original.reviews[0].rating, 1); assert.equal(original.eligibleVisits.length, 0);
});

test('staff email matching, forged portal identities and cross-provider service IDs never grant review access', async () => {
  const f = await fixture();
  for (const identity of [{ uid: 'staff', token: { email: f.email, email_verified: true } }, { uid: 'forged', token: { portal: true, portalEmail: f.email } }]) await assert.rejects(f.customer('list', {}, identity), { code: 'unauthenticated' });
  await assert.rejects(f.submit({}, f.jobs.b), { code: 'permission-denied' });
  await assert.rejects(f.customer('list', { accountId: 'company:unknown' }), { code: 'permission-denied' });
});

test('only completed, valid services with active tenant/customer associations can receive feedback', async () => {
  for (const update of [{ status: 'scheduled' }, { status: 'in-progress' }, { status: 'cancelled' }, { invalidatedAt: '2026-11-14' }, { deletedAt: '2026-11-14' }, { voidedAt: '2026-11-14' }, { isActive: false }]) {
    const f = await fixture(); await db.doc('jobs/' + f.jobs.a).update(update); await assert.rejects(f.submit(), { code: 'failed-precondition' }); assert.equal((await db.doc('rlReviews/' + reviewIdFor(f.jobs.a)).get()).exists, false);
  }
  const f = await fixture(); await db.doc('customers/' + f.customerA).update({ isActive: false }); await assert.rejects(f.submit(), { code: 'permission-denied' });
  const g = await fixture(); await db.doc('companies/' + g.companyA).update({ isActive: false }); await assert.rejects(g.submit(), { code: 'permission-denied' });
});

test('concurrent duplicate submissions create one immutable review and count one rating', async () => {
  const f = await fixture(), results = await Promise.all([f.submit(), f.submit()]);
  assert.equal(results.filter(result => result.existing).length, 1);
  assert.equal((await db.collection('rlReviews').where('jobId', '==', f.jobs.a).get()).size, 1);
  const listed = await f.provider('list'); assert.deepEqual(listed.stats, { count: 1, averageRating: 3 });
  await assert.rejects(f.submit({ rating: 5, comment: 'Attempted replacement' }), { code: 'already-exists' });
  assert.equal((await db.doc('rlReviews/' + reviewIdFor(f.jobs.a)).get()).get('rating'), 3);
});

test('duplicate customer identities remain independently linked to their actual service visits', async () => {
  const f = await fixture(), duplicate = f.id + '-duplicate'; await db.doc('customers/' + duplicate).set({ companyId: f.companyA, email: f.email, isActive: true });
  await db.doc(`rlPortalLinks/${linkId(duplicate,f.email)}`).set({ customerId: duplicate, scopeId: `company:${f.companyA}`, email: f.email, status: 'active', portalUid: customerUid(f.email) });
  const jobId = f.id + '-duplicate-job'; await db.doc('jobs/' + jobId).set({ companyId: f.companyA, userId: f.ownerId, customerId: duplicate, status: 'completed', date: '2026-11-13', completedAt: new Date(f.now()).toISOString() });
  assert.equal((await f.customer('list')).eligibleVisits.length, 2); await f.submit({}, jobId); assert.equal((await f.customer('list')).reviews.length, 1);
});

test('public-display permission is separate, withdrawable, and cannot be restored by retry or provider actions', async () => {
  const f = await fixture(), result = await f.submit({ publicConsent: true }), reviewId = result.review.id;
  await f.provider('moderate', { reviewId, status: 'approved', reason: 'Genuine service feedback meets the same standards for every rating.' });
  assert.equal((await f.customer('list')).reviews[0].publicEligible, true);
  await f.customer('consent', { reviewId, publicConsent: false });
  assert.equal((await f.submit({ publicConsent: true })).review.publicConsent, false);
  await f.provider('respond', { reviewId, response: 'Thank you. We will follow up.', publicConsent: true, rating: 5, comment: 'Forged' });
  const stored = await db.doc('rlReviews/' + reviewId).get(); assert.equal(stored.get('publicConsent'), false); assert.equal(stored.get('rating'), 3); assert.equal(stored.get('comment'), 'Synthetic private feedback');
  assert.equal((await f.customer('list')).reviews[0].publicEligible, false); assert.equal(stored.get('publicStatus'), 'private');
});

test('genuine negative and positive reviews use identical moderation and contribute equally to averages', async () => {
  const f = await fixture(), second = f.id + '-second-job'; await db.doc('jobs/' + second).set({ ...(await db.doc('jobs/' + f.jobs.a).get()).data(), serviceType: 'Cleaning', date: '2026-11-13' });
  for (const [jobId, rating] of [[f.jobs.a, 1], [second, 5]]) { const { review } = await f.submit({ rating, publicConsent: true }, jobId); await f.provider('moderate', { reviewId: review.id, status: 'approved', reason: 'Verified, relevant service feedback without private details.' }); }
  const listed = await f.provider('list'); assert.equal(listed.reviews.every(row => row.publicEligible), true); assert.deepEqual(listed.stats, { count: 2, averageRating: 3 });
  await f.provider('moderate', { reviewId: reviewIdFor(f.jobs.a), status: 'flagged', reason: 'Investigating a privacy concern using the same rules for every rating.' });
  assert.deepEqual((await f.provider('list')).stats, { count: 2, averageRating: 3 });
});

test('provider management is scoped to current owners/managers and never exposes internal notes to customers', async () => {
  const f = await fixture(), { review } = await f.submit();
  await f.provider('note', { reviewId: review.id, note: 'PRIVATE FOLLOW UP' }, f.manager); await f.provider('respond', { reviewId: review.id, response: 'We will contact you.' }, f.manager);
  const management = await f.provider('list'); assert.equal(management.reviews[0].internalNotes[0].text, 'PRIVATE FOLLOW UP');
  const customer = (await f.customer('list')).reviews[0]; assert.equal(customer.internalNotes, undefined); assert.equal(customer.moderationHistory, undefined); assert.equal(customer.providerResponse.text, 'We will contact you.');
  for (const role of ['admin', 'technician']) { const memberId = f.id + '-' + role; await db.doc('teamMembers/' + memberId).set({ companyId: f.companyA, uid: memberId, role, status: 'active' }); await assert.rejects(f.provider('list', {}, { uid: memberId, token: { companyId: f.companyA, membershipId: memberId, role, email_verified: true } }), { code: 'permission-denied' }); }
  const other = await fixture(); await assert.rejects(other.provider('respond', { reviewId: review.id, response: 'Foreign response' }), { code: 'permission-denied' });
  await db.doc('teamMembers/' + f.memberId).update({ status: 'revoked' }); await assert.rejects(f.provider('note', { reviewId: review.id, note: 'Revoked access' }, f.manager), { code: 'permission-denied' });
});

test('moderation preserves original customer content and an auditable reason/history', async () => {
  const f = await fixture(), { review } = await f.submit({ rating: 1 });
  await assert.rejects(f.provider('moderate', { reviewId: review.id, status: 'hidden', reason: '' }), { code: 'invalid-argument' });
  await f.provider('moderate', { reviewId: review.id, status: 'hidden', reason: 'Contains a private access code; use the same privacy standard for every review.', rating: 5, comment: 'Tampered' });
  const row = await db.doc('rlReviews/' + review.id).get(); assert.equal(row.get('rating'), 1); assert.equal(row.get('comment'), 'Synthetic private feedback'); assert.equal(row.get('moderationHistory')[0].status, 'hidden');
  assert.equal((await f.provider('history', { reviewId: review.id })).history.some(event => event.action === 'provider.moderate' && event.reason.includes('privacy')), true);
  await f.provider('respond', { reviewId: review.id, response: 'A public reply' }); await f.provider('respond', { reviewId: review.id, response: '' }); assert.equal((await f.customer('list')).reviews[0].providerResponse, null);
});

test('invitation links validate token, expiration and completion cycle and permit one idempotent submission', async () => {
  const f = await fixture(), link = await invitation(f);
  await assert.rejects(db.runTransaction(tx => f.handlers.submitInTransaction(tx, { jobId: f.jobs.a, source: 'invitation', invitationId: link.id, invitationToken: 'b'.repeat(64), input: { rating: 4 } })), { code: 'permission-denied' });
  const first = await link.submit(), repeated = await link.submit(); assert.equal(first.existing, false); assert.equal(repeated.existing, true); assert.equal((await db.doc('rlReviewInvitations/' + link.id).get()).get('status'), 'submitted');
  await assert.rejects(link.submit({ rating: 5 }), { code: 'already-exists' });
  f.advance(3600001); await assert.rejects(link.submit(), { code: 'permission-denied' });
  const g = await fixture(), stale = await invitation(g); await db.doc('jobs/' + g.jobs.a).update({ completedAt: new Date(g.now() + 1).toISOString() }); await assert.rejects(stale.submit(), { code: 'permission-denied' });
});

test('changed recipient, tenant, revoked invitation or reopened job invalidates secure review submission', async () => {
  for (const type of ['recipient', 'tenant', 'cancelled', 'reopened']) {
    const f = await fixture(), link = await invitation(f);
    if (type === 'recipient') await db.doc('customers/' + f.customerA).update({ email: 'new-' + f.email });
    if (type === 'tenant') await db.doc('jobs/' + f.jobs.a).update({ companyId: f.companyB });
    if (type === 'cancelled') await db.doc('rlReviewInvitations/' + link.id).update({ status: 'cancelled' });
    if (type === 'reopened') await db.doc('jobs/' + f.jobs.a).update({ status: 'in-progress' });
    await assert.rejects(link.submit(), error => ['permission-denied', 'failed-precondition'].includes(error.code)); assert.equal((await db.doc('rlReviews/' + reviewIdFor(f.jobs.a)).get()).exists, false);
  }
});

test('review history and publication permissions do not move to a different email identity on the same customer row', async () => {
  const f = await fixture(), { review } = await f.submit({ publicConsent: true }); await f.provider('moderate', { reviewId: review.id, status: 'approved', reason: 'Meets common moderation standards.' });
  const nextEmail = 'new-' + f.email; await db.doc('customers/' + f.customerA).update({ email: nextEmail, emailNormalized: nextEmail });
  await assert.rejects(f.customer('consent', { reviewId: review.id, publicConsent: false }), { code: 'permission-denied' });
  const nextIdentity = { uid: customerUid(nextEmail), token: { portal: true, portalEmail: nextEmail } };
  await assert.rejects(f.customer('list', {}, nextIdentity), { code: 'permission-denied' }); await assert.rejects(f.customer('consent', { reviewId: review.id, publicConsent: true }, nextIdentity), { code: 'permission-denied' });
  assert.equal((await f.provider('list')).reviews[0].publicEligible, false);
});

test('server-marked synthetic feedback can never become publicly eligible despite consent and approval', async () => {
  const f = await fixture(); await db.doc('jobs/' + f.jobs.a).update({ synthetic: true }); const { review } = await f.submit({ publicConsent: true, synthetic: false });
  assert.equal(review.synthetic, true); await f.provider('moderate', { reviewId: review.id, status: 'approved', reason: 'Synthetic acceptance check only.' });
  assert.equal((await f.customer('list')).reviews[0].publicEligible, false); assert.equal((await f.provider('list')).reviews[0].publicEligible, false);
});

test('reopening, voiding, deactivation and invalidation all remove public eligibility without deleting authentic historical feedback', async () => {
  for (const update of [{ status: 'in-progress' }, { voidedAt: '2026-11-14' }, { isActive: false }, { deletedAt: '2026-11-14' }, { invalidatedAt: '2026-11-14' }]) {
    const f = await fixture(), { review } = await f.submit({ publicConsent: true });
    await f.provider('moderate', { reviewId: review.id, status: 'approved', reason: 'Meets common moderation standards.' });
    await db.doc('jobs/' + f.jobs.a).update(update);
    assert.equal((await f.customer('list')).reviews[0].publicEligible, false);
    assert.equal((await f.provider('list')).reviews[0].publicEligible, false);
    assert.equal((await f.customer('consent', { reviewId: review.id, publicConsent: true })).review.publicEligible, false);
    assert.equal((await db.doc('rlReviews/' + review.id).get()).get('rating'), 3);
  }
});

test('provider rating, service type, date and status filters are validated without altering global rating statistics', async () => {
  const f = await fixture(); await f.submit({ rating: 2 });
  const result = await f.provider('list', { rating: 2, serviceType: 'Inspection', fromDate: '2026-11-14', toDate: '2026-11-14', status: 'unreviewed' }); assert.equal(result.reviews.length, 1); assert.equal(result.stats.averageRating, 2);
  assert.equal((await f.provider('list', { rating: 5 })).reviews.length, 0);
  for (const filter of [{ rating: 6 }, { fromDate: '2026-02-30' }, { fromDate: '2026-11-15', toDate: '2026-11-14' }, { status: 'published' }]) await assert.rejects(f.provider('list', filter), { code: 'invalid-argument' });
});

test('ordered customer history reaches reviews older than one hundred rows and rejects foreign cursors', async () => {
  const f = await fixture(), { review } = await f.submit({ publicConsent: true }), original = (await db.doc('rlReviews/' + review.id).get()).data();
  const batch = db.batch(); let oldestId;
  for (let index = 0; index < 104; index++) {
    const jobId = `${f.id}-older-job-${index}`, id = reviewIdFor(jobId), createdAt = new Date(f.now() - (index + 1) * 1000).toISOString();
    batch.create(db.doc('rlReviews/' + id), { ...original, jobId, synthetic: true, createdAt, updatedAt: createdAt, comment: `Synthetic historical feedback ${index}` }); oldestId = id;
  }
  await batch.commit();
  const first = await f.customer('list'); assert.equal(first.reviews.length, 100); assert.equal(first.reviews[0].id, review.id); assert.equal(first.hasMoreReviews, true); assert.equal(typeof first.reviewCursor, 'string');
  const second = await f.customer('list', { reviewCursor: first.reviewCursor }); assert.equal(second.reviews.length, 5); assert.equal(second.hasMoreReviews, false); assert.equal(second.reviewCursor, null); assert.equal(second.reviews.at(-1).id, oldestId);
  assert.equal(new Set([...first.reviews, ...second.reviews].map(row => row.id)).size, 105);
  await f.customer('consent', { reviewId: oldestId, publicConsent: false }); assert.equal((await db.doc('rlReviews/' + oldestId).get()).get('publicConsent'), false);
  const other = await fixture(), foreign = await other.submit(); await assert.rejects(f.customer('list', { reviewCursor: foreign.review.id }), { code: 'permission-denied' });
  const sameEmailOtherProvider = await f.customer('submit', { accountId: 'company:' + f.companyB, jobId: f.jobs.b, rating: 3 });
  await assert.rejects(f.customer('list', { reviewCursor: sameEmailOtherProvider.review.id }), { code: 'permission-denied' });
});

test('private historical feedback and consent withdrawal survive deleted jobs while foreign review-row reassignment is denied', async () => {
  const f = await fixture(), { review } = await f.submit({ publicConsent: true }); await f.provider('moderate', { reviewId: review.id, status: 'approved', reason: 'Meets common moderation standards.' });
  await db.doc('jobs/' + f.jobs.a).delete();
  const history = await f.customer('list'); assert.equal(history.reviews[0].id, review.id); assert.equal(history.reviews[0].publicEligible, false);
  const withdrawn = await f.customer('consent', { reviewId: review.id, publicConsent: false }); assert.equal(withdrawn.review.publicConsent, false); assert.equal(withdrawn.review.publicEligible, false);
  await db.doc('rlReviews/' + review.id).update({ companyId: f.companyB });
  assert.equal((await f.customer('list')).reviews.length, 0); assert.equal((await f.customer('list', { accountId: 'company:' + f.companyB })).reviews.length, 0);
  await assert.rejects(f.customer('consent', { reviewId: review.id, publicConsent: true }), { code: 'permission-denied' });
  await assert.rejects(f.customer('list', { reviewCursor: review.id }), { code: 'permission-denied' });
  await db.doc('rlReviews/' + review.id).update({ companyId: f.companyA, customerId: f.customerB });
  assert.equal((await f.customer('list')).reviews.length, 0); await assert.rejects(f.customer('list', { reviewCursor: review.id }), { code: 'permission-denied' });
});
