const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app'), { getFirestore, Timestamp } = req('firebase-admin/firestore');
const { reviewInvitationHandlers, DEFAULT_SETTINGS } = require('../functions/reviewInvitations');
const { reviewIdFor, completionKeyFor } = require('../functions/reviews');
const { deliverMail } = require('../functions/mail');
const { smsHandlers, DEFAULT_SETTINGS: SMS_SETTINGS } = require('../functions/sms');
const { signature } = require('../functions/smsProvider');
const { hash } = require('../functions/security');
let app, db, sequence = 0; const fixtureCompanies = [];
before(() => { if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Local emulator required. Production writes and messages prohibited.'); app = initializeApp({ projectId: 'demo-routelogistics' }, 'review-invitations'); db = getFirestore(app); });
after(() => deleteApp(app));
afterEach(async () => { for (const companyId of fixtureCompanies.splice(0)) { const settings = await db.doc('rlSmsSettings/' + companyId).get(); if (settings.exists) await settings.ref.update({ enabled: false }); const rows = await db.collection('rlSmsOutbox').where('companyId', '==', companyId).get(), batch = db.batch(); for (const row of rows.docs) if (['queued', 'dispatching'].includes(row.get('status'))) batch.update(row.ref, { status: 'cancelled' }); await batch.commit(); } });

async function fixture({ active = true, email = true, smsActive = false, pilotOnly = false, prefs = {}, synthetic = true } = {}) {
  const id = 'review-invite-' + ++sequence, uid = id + '-owner', customerId = id + '-customer', jobId = id + '-job', managerId = id + '-manager', techId = id + '-tech', adminId = id + '-admin';
  fixtureCompanies.push(id);
  let clock = Date.parse('2026-11-15T01:00:00Z'), live = active, smtp = email, phone = '+1202555' + String(sequence).padStart(4, '0');
  await db.doc('companies/' + id).set({ ownerId: uid, name: 'Synthetic review provider' });
  await db.doc('customers/' + customerId).set({ companyId: id, userId: uid, name: 'Synthetic reviewer', email: id + '@example.invalid', phone, isActive: true, isTestRecord: synthetic });
  await db.doc('jobs/' + jobId).set({ companyId: id, userId: uid, customerId, serviceType: 'Synthetic completed service; no real visit', status: 'completed', completedAt: new Date(clock).toISOString(), updatedAt: new Date(clock).toISOString(), date: '2026-11-14', synthetic, isTestRecord: synthetic });
  for (const [member, role] of [[managerId, 'manager'], [techId, 'technician'], [adminId, 'admin']]) await db.doc('teamMembers/' + member).set({ companyId: id, uid: member, role, status: 'active' });
  await db.doc('rlReviewInvitationSettings/' + id).set({ ...DEFAULT_SETTINGS, enabled: true, delayMinutes: 0, revision: 1, ...prefs });
  const owner = { uid, token: { companyId: id, role: 'owner', email_verified: true } }, member = (memberId, role) => ({ uid: memberId, token: { companyId: id, membershipId: memberId, role, email_verified: true } });
  const serviceSid = 'MG' + 'b'.repeat(32), accountSid = 'AC' + 'a'.repeat(32), authToken = 'synthetic-twilio-token', statusUrl = 'https://example.invalid/status';
  const sms = smsHandlers(db, { enabled: () => smsActive, liveApproved: () => smsActive, pilotEnabled: () => pilotOnly, pilotId: () => id, reviewInvitationsEnabled: () => live, now: () => clock, messagingServiceSid: () => serviceSid, accountSid: () => accountSid, authToken: () => authToken, statusUrl });
  const handlers = reviewInvitationHandlers(db, { enabled: () => live, emailEnabled: () => smtp, appUrl: () => 'https://route-logistics.com', now: () => clock, sms });
  const request = (data, auth = owner) => ({ data, auth, rawRequest: { ip: id } });
  const schedule = async (event = 'completion-' + jobId) => handlers.onJob({ status: 'in-progress', companyId: id, customerId }, (await db.doc('jobs/' + jobId).get()).data(), jobId, event);
  const invitation = async () => { const state = await db.doc('rlReviewJobState/' + hash(jobId)).get(); return db.doc('rlReviewInvitations/' + state.get('invitationId')).get(); };
  const mail = async suffix => { const row = await invitation(); return db.doc(`rlMail/review_${row.id}_${suffix || 'initial'}`).get(); };
  const credentials = row => { const match = row.get('text').match(/#id=([a-f0-9]{64})&token=([a-f0-9]{64})/); assert.ok(match); return { id: match[1], token: match[2] }; };
  const queue = async () => { await schedule(); await handlers.schedule(); return mail(); };
  const grant = async (invitationId, overrides = {}) => db.doc('rlReviewTestGrants/' + invitationId).set({ enabled: true, invitationId, companyId: id, customerId, jobId, recipientHash: hash(id + '@example.invalid'), maxMessages: 1, mailId: `review_${invitationId}_test`, createdAt: new Date(clock), expiresAt: new Date(clock + 1800000), ...overrides });
  const syntheticInvite = async () => { const row = await db.doc('jobs/' + jobId).get(), invitationId = hash('test:' + jobId); await db.doc('rlReviewInvitations/' + invitationId).set({ companyId: id, userId: uid, customerId, customerEmail: id + '@example.invalid', jobId, completionKey: completionKeyFor(row), tokenHash: hash('never-issued-test-token'), status: 'scheduled', expiresAt: new Date(clock + 1800000), dueAt: new Date(clock), nextActionAt: new Date(clock), createdAt: new Date(clock), updatedAt: new Date(clock), settingsRevision: 1, deliveryIds: {} }); return invitationId; };
  return { id, uid, customerId, jobId, owner, manager: member(managerId, 'manager'), tech: member(techId, 'technician'), admin: member(adminId, 'admin'), request, handlers, sms, schedule, invitation, mail, credentials, queue, grant, syntheticInvite, phone, serviceSid, accountSid, authToken, statusUrl, advance: ms => clock += ms, disable: () => live = false, clock: () => clock, smtpOff: () => smtp = false };
}

test('global review delivery stays disabled despite tenant settings and a completed job', async () => {
  const f = await fixture({ active: false });
  assert.equal((await f.schedule()).reason, 'review-delivery-disabled');
  assert.equal((await f.handlers.schedule()).reason, 'review-delivery-disabled');
  const status = await f.handlers.settings(f.request({ action: 'status' })); assert.equal(status.settings.enabled, true); assert.equal(status.delivery.enabled, false);
  assert.equal((await db.collection('rlReviewInvitations').where('companyId', '==', f.id).get()).size, 0);
});

test('review invitation preferences require current owner or manager, tenant isolation and revision comparison', async () => {
  const f = await fixture(), other = await fixture();
  for (const auth of [f.tech, f.admin]) await assert.rejects(f.handlers.settings(f.request({ action: 'status' }, auth)), { code: 'permission-denied' });
  await assert.rejects(other.handlers.settings(other.request({ action: 'status', companyId: f.id })), { code: 'permission-denied' });
  const saved = await f.handlers.settings(f.request({ action: 'save', expectedRevision: 1, settings: { ...DEFAULT_SETTINGS, enabled: true, delayMinutes: 15 } }, f.manager)); assert.equal(saved.settings.revision, 2); assert.equal(saved.settings.delayMinutes, 15);
  await assert.rejects(f.handlers.settings(f.request({ action: 'save', expectedRevision: 1, settings: DEFAULT_SETTINGS })), { code: 'aborted' });
  await assert.rejects(f.handlers.settings(f.request({ action: 'save', expectedRevision: 2, settings: { ...DEFAULT_SETTINGS, delayMinutes: -1 } })), { code: 'invalid-argument' });
});

test('completion scheduling is idempotent, delay is honored and one optional reminder rotates the single-use link', async () => {
  const f = await fixture({ prefs: { delayMinutes: 10, reminderEnabled: true, reminderDelayMinutes: 60 } });
  await Promise.all([f.schedule(), f.schedule()]); assert.equal((await db.collection('rlReviewInvitations').where('companyId', '==', f.id).get()).size, 1);
  assert.equal((await f.handlers.schedule()).queued, 0); f.advance(600001); assert.equal((await f.handlers.schedule()).queued, 1); const first = await f.mail(), old = f.credentials(first);
  assert.equal((await f.handlers.schedule()).queued, 0); f.advance(3600001); assert.equal((await f.handlers.schedule()).queued, 1);
  const second = await f.mail('reminder'), fresh = f.credentials(second); assert.notEqual(old.token, fresh.token);
  await assert.rejects(f.handlers.invitation(f.request({ action: 'get', ...old })), { code: 'permission-denied' });
  assert.equal((await f.handlers.invitation(f.request({ action: 'get', ...fresh }))).invitation.serviceType, 'Synthetic completed service; no real visit');
  f.advance(3600001); assert.equal((await f.handlers.schedule()).queued, 0); assert.equal((await db.collection('rlMail').where('companyId', '==', f.id).get()).size, 2);
});

test('secure invitation returns only its service and provider, submits one verified review, and prevents replay', async () => {
  const f = await fixture(), mail = await f.queue(), link = f.credentials(mail);
  const view = await f.handlers.invitation(f.request({ action: 'get', ...link })); assert.equal(view.invitation.companyName, 'Synthetic review provider'); assert.equal(view.invitation.customerEmail, undefined); assert.equal(view.invitation.customerId, undefined);
  await assert.rejects(f.handlers.invitation(f.request({ action: 'get', ...link, token: '0'.repeat(64) })), { code: 'permission-denied' });
  const result = await f.handlers.invitation(f.request({ action: 'submit', ...link, rating: 2, comment: 'Synthetic honest feedback', onTime: false, publicConsent: true })); assert.equal(result.review.verifiedService, true); assert.equal(result.review.publicEligible, false);
  assert.equal((await db.doc('rlReviewInvitations/' + link.id).get()).get('status'), 'submitted');
  await assert.rejects(f.handlers.invitation(f.request({ action: 'submit', ...link, rating: 5, publicConsent: true })), { code: 'permission-denied' });
  assert.equal((await db.doc('rlReviews/' + reviewIdFor(f.jobId)).get()).get('rating'), 2);
});
test('legacy normalized-email-only customers use the portal identity resolver for secure invitations and submission', async () => {
  const f = await fixture(); await db.doc('customers/' + f.customerId).update({ email: null, emailNormalized: f.id + '@example.invalid' });
  const mail = await f.queue(), link = f.credentials(mail); assert.equal(mail.get('to'), f.id + '@example.invalid');
  assert.equal((await f.handlers.invitation(f.request({ action: 'get', ...link }))).invitation.id, link.id);
  const saved = await f.handlers.invitation(f.request({ action: 'submit', ...link, rating: 3, comment: 'Synthetic normalized identity check', onTime: true, publicConsent: false }));
  assert.equal(saved.review.rating, 3); assert.equal(saved.review.verifiedService, true);
});

test('reopening or deleting a job invalidates links and cancels queued delivery without sending', async () => {
  for (const deleted of [false, true]) {
    const f = await fixture(), mail = await f.queue(), link = f.credentials(mail), before = (await db.doc('jobs/' + f.jobId).get()).data();
    if (deleted) await db.doc('jobs/' + f.jobId).delete(); else await db.doc('jobs/' + f.jobId).update({ status: 'scheduled' });
    await f.handlers.onJob(before, deleted ? null : { ...before, status: 'scheduled' }, f.jobId, 'reopened');
    assert.equal((await mail.ref.get()).get('status'), 'cancelled'); await assert.rejects(f.handlers.invitation(f.request({ action: 'get', ...link })), { code: 'permission-denied' });
    let sends = 0; await deliverMail(db, mail.ref, { sendMail: async () => { sends++; return { accepted: ['synthetic@example.invalid'] }; } }, 'sender@example.invalid', f.clock(), { reviewInvitationsEnabled: () => true }); assert.equal(sends, 0);
  }
});

test('dispatch rechecks tenant, customer email, consent, provider status and global delivery before SMTP', async () => {
  for (const change of ['email', 'tenant', 'consent', 'provider', 'global', 'expired', 'bad-expiry']) {
    const f = await fixture(), mail = await f.queue();
    if (change === 'email') await db.doc('customers/' + f.customerId).update({ email: 'changed@example.invalid' });
    if (change === 'tenant') await db.doc('jobs/' + f.jobId).update({ companyId: 'foreign-provider' });
    if (change === 'consent') await db.doc('customers/' + f.customerId).update({ reviewEmailConsent: false });
    if (change === 'provider') await db.doc('companies/' + f.id).update({ isActive: false });
    if (change === 'global') f.disable(); if (change === 'expired') f.advance(15 * 86400000);
    if (change === 'bad-expiry') await (await f.invitation()).ref.update({ expiresAt: 'invalid' });
    let sends = 0; await deliverMail(db, mail.ref, { sendMail: async () => { sends++; return { accepted: ['synthetic@example.invalid'] }; } }, 'sender@example.invalid', f.clock(), { reviewInvitationsEnabled: () => change !== 'global' });
    assert.equal(sends, 0, change); assert.equal((await mail.ref.get()).get('status'), 'cancelled', change);
  }
});

test('same-status deletion, invalidation, voiding and inactive markers cancel invitations and block SMTP', async () => {
  for (const marker of ['deletedAt', 'invalidatedAt', 'voidedAt', 'isActive']) {
    const f = await fixture(), mail = await f.queue(), link = f.credentials(mail), before = (await db.doc('jobs/' + f.jobId).get()).data(), patch = { [marker]: marker === 'isActive' ? false : new Date(f.clock()).toISOString() };
    await db.doc('jobs/' + f.jobId).update(patch); await f.handlers.onJob(before, { ...before, ...patch }, f.jobId, 'invalidated-' + marker);
    assert.equal((await mail.ref.get()).get('status'), 'cancelled'); await assert.rejects(f.handlers.invitation(f.request({ action: 'get', ...link })), { code: 'permission-denied' });
    let sends = 0; await deliverMail(db, mail.ref, { sendMail: async () => { sends++; return { accepted: ['synthetic@example.invalid'] }; } }, 'sender@example.invalid', f.clock(), { reviewInvitationsEnabled: () => true }); assert.equal(sends, 0);
  }
});

test('private operator grant authorizes only one synthetic email while broad invitations remain disabled', async () => {
  const f = await fixture({ active: false }), id = await f.syntheticInvite(); await f.grant(id);
  const first = await f.handlers.queueTestEmail(id), second = await f.handlers.queueTestEmail(id); assert.equal(first.mailId, second.mailId); assert.equal(second.existing, true);
  assert.equal((await db.doc('rlReviewJobState/' + hash(f.jobId)).get()).get('invitationId'), id);
  const mail = await db.doc('rlMail/' + first.mailId).get(); let sends = 0;
  await deliverMail(db, mail.ref, { sendMail: async message => { sends++; assert.equal(message.subject, 'Route Logistics synthetic service review test'); return { accepted: [message.to] }; } }, 'sender@example.invalid', f.clock(), { reviewInvitationsEnabled: () => false });
  await deliverMail(db, mail.ref, { sendMail: async () => { sends++; } }, 'sender@example.invalid', f.clock(), { reviewInvitationsEnabled: () => false });
  assert.equal(sends, 1); assert.equal((await mail.ref.get()).get('status'), 'sent'); assert.equal((await f.handlers.settings(f.request({ action: 'status' }))).delivery.enabled, false);
});

test('test grants cannot authorize real customers, wrong recipients, extra messages or expired approval', async () => {
  for (const variant of ['real', 'recipient', 'limit', 'expiry', 'wrong-mail']) {
    const f = await fixture({ active: false, synthetic: variant !== 'real' }), id = await f.syntheticInvite();
    await f.grant(id, variant === 'recipient' ? { recipientHash: hash('wrong@example.invalid') } : variant === 'limit' ? { maxMessages: 2 } : variant === 'expiry' ? { expiresAt: new Date(f.clock() - 1) } : variant === 'wrong-mail' ? { mailId: 'other' } : {});
    await assert.rejects(f.handlers.queueTestEmail(id), { code: 'permission-denied' });
    assert.equal((await db.doc(`rlMail/review_${id}_test`).get()).exists, false);
  }
});

test('an expired, changed-completion or already-reviewed visit cannot use a review invitation', async () => {
  for (const variant of ['expired', 'completedAt', 'reviewed', 'bad-expiry']) {
    const f = await fixture(), mail = await f.queue(), link = f.credentials(mail);
    if (variant === 'expired') f.advance(15 * 86400000);
    if (variant === 'completedAt') await db.doc('jobs/' + f.jobId).update({ completedAt: new Date(f.clock() + 1).toISOString() });
    if (variant === 'reviewed') await db.doc('rlReviews/' + reviewIdFor(f.jobId)).set({ jobId: f.jobId, companyId: f.id, customerId: f.customerId, rating: 1 });
    if (variant === 'bad-expiry') await db.doc('rlReviewInvitations/' + link.id).update({ expiresAt: 'invalid' });
    await assert.rejects(f.handlers.invitation(f.request({ action: 'get', ...link })), { code: 'permission-denied' });
  }
});

test('stale update and delete triggers cannot cancel an invitation for a newer current job', async () => {
  const f = await fixture(), mail = await f.queue(), before = (await db.doc('jobs/' + f.jobId).get()).data();
  assert.equal((await f.handlers.onJob(before, null, f.jobId, 'stale-delete')).reason, 'superseded-job-event');
  assert.equal((await f.handlers.onJob(before, { ...before, status: 'scheduled' }, f.jobId, 'stale-update', '2020-01-01T00:00:00.000Z')).reason, 'superseded-job-event');
  assert.equal((await mail.ref.get()).get('status'), 'queued');
});
test('trigger fencing distinguishes job versions within the same millisecond without suppressing the current timestamp', async () => {
  const f = await fixture(), mail = await f.queue(), snapshot = await db.doc('jobs/' + f.jobId).get(), stamp = snapshot.updateTime;
  const stale = new Timestamp(stamp.seconds, stamp.nanoseconds === 999999999 ? stamp.nanoseconds - 1 : stamp.nanoseconds + 1);
  assert.equal(stale.toDate().getTime(), stamp.toDate().getTime()); assert.equal(stale.isEqual(stamp), false);
  assert.equal((await f.handlers.onJob(snapshot.data(), { ...snapshot.data(), status: 'scheduled' }, f.jobId, 'same-millisecond-stale-event', stale)).reason, 'superseded-job-event');
  assert.equal((await mail.ref.get()).get('status'), 'queued');
  const current = await fixture(), currentJob = await db.doc('jobs/' + current.jobId).get();
  assert.equal((await current.handlers.onJob(null, currentJob.data(), current.jobId, 'exact-current-event', currentJob.updateTime)).scheduled, true);
});

test('review SMS requires its own consent, approved broad sender and trusted link, then honors signed delivery and STOP', async () => {
  const f = await fixture({ smsActive: true, prefs: { smsEnabled: true } });
  await db.doc('rlSmsSettings/' + f.id).set({ ...SMS_SETTINGS, enabled: true, purposes: [...SMS_SETTINGS.purposes, 'review-invitation'] });
  await db.doc('rlSmsSenderApprovals/' + f.id).set({ status: 'approved', messagingServiceSid: f.serviceSid, automationApproved: true });
  const consent = async purposes => { const status = await f.sms.consent(f.request({ action: 'status', customerId: f.customerId })); return f.sms.consent(f.request({ action: 'grant', customerId: f.customerId, purposes, source: 'written', evidence: 'Synthetic explicit review test authorization', disclosureAccepted: true, disclosure: status.disclosure })); };
  await consent(['service-follow-up']); const mail = await f.queue(), link = f.credentials(mail), invitation = await f.invitation(), smsInput = { jobId: f.jobId, invitationId: invitation.id, invitationHash: invitation.get('tokenHash'), link: `https://route-logistics.com/review#id=${link.id}&token=${link.token}`, suffix: 'initial' };
  assert.equal((await f.sms.queueReviewInvitation(smsInput)).reason, 'consent-required');
  assert.equal((await f.sms.queue(f.request({ jobId: f.jobId, purpose: 'review-invitation' }))).reason, 'secure-review-invitation-required');
  await consent(['review-invitation']); const queued = await f.sms.queueReviewInvitation(smsInput); assert.equal(queued.queued, true); assert.equal((await f.sms.queueReviewInvitation(smsInput)).existing, true);
  let sent = 0; const sid = 'SM' + hash(queued.id).slice(0, 32); await f.sms.drain({ send: async message => { if (message.id === queued.id) { sent++; assert.match(message.body, /All ratings are welcome/); } return { state: 'accepted', sid }; } }); assert.equal(sent, 1);
  const body = { AccountSid: f.accountSid, To: f.phone, MessageSid: sid, MessageStatus: 'delivered' }, response = { status(code) { this.code = code; return this; }, send(value) { this.body = value; return this; } };
  await f.sms.status({ method: 'POST', query: { id: queued.id }, body, get: () => signature(`${f.statusUrl}?id=${queued.id}`, body, f.authToken) }, response); assert.equal(response.code, 200); assert.equal((await db.doc('rlSmsOutbox/' + queued.id).get()).get('status'), 'delivered');
  await db.doc('rlSmsSuppressions/' + hash(f.phone)).set({ blocked: true });
  assert.equal((await f.sms.queueReviewInvitation({ ...smsInput, suffix: 'reminder' })).reason, 'suppressed-or-ambiguous');
});

test('old four-purpose pilot permission cannot authorize review invitations or relax URL templates', async () => {
  const f = await fixture({ smsActive: false, pilotOnly: true, prefs: { smsEnabled: true } });
  await db.doc('customers/' + f.customerId).update({ smsPilotOnly: true });
  await db.doc('rlSmsSettings/' + f.id).set({ ...SMS_SETTINGS, enabled: true, purposes: [...SMS_SETTINGS.purposes, 'review-invitation'] });
  await db.doc('rlSmsSenderApprovals/' + f.id).set({ status: 'approved', messagingServiceSid: f.serviceSid, automationApproved: false, pilotApproved: true });
  await db.doc('rlSmsPilots/' + f.id).set({ status: 'active', testOnly: true, companyId: f.id, customerId: f.customerId, phoneHash: hash(f.phone), version: 1, createdAt: new Date(f.clock()), expiresAt: new Date(f.clock() + 3600000), purposes: ['appointment-confirmation', 'pre-visit', 'en-route', 'service-completed'], maxMessages: 4, reservedMessages: 0 });
  const status = await f.sms.consent(f.request({ action: 'status', customerId: f.customerId })); await f.sms.consent(f.request({ action: 'grant', customerId: f.customerId, purposes: ['review-invitation'], source: 'written', evidence: 'Synthetic review-specific consent', disclosureAccepted: true, disclosure: status.disclosure }));
  await db.doc('rlSmsSuppressions/' + hash(f.phone)).set({ blocked: false, providerOrigin: 'twilio-event-streams', providerCommand: 'START', providerEventAt: new Date(f.clock()) });
  const mail = await f.queue(), link = f.credentials(mail), row = await f.invitation();
  assert.equal((await f.sms.queueReviewInvitation({ jobId: f.jobId, invitationId: row.id, invitationHash: row.get('tokenHash'), link: `https://route-logistics.com/review#id=${link.id}&token=${link.token}`, suffix: 'initial' })).reason, 'pilot-recipient-not-approved');
  assert.equal((await db.collection('rlSmsOutbox').where('companyId', '==', f.id).get()).size, 0);
  await assert.rejects(f.sms.config(f.request({ action: 'save', companyId: f.id, settings: { ...SMS_SETTINGS, templates: { ...SMS_SETTINGS.templates, 'review-invitation': 'https://evil.invalid' } } })), { code: 'invalid-argument' });
});

async function authorizeReviewSms(f) {
  await db.doc('rlSmsSettings/' + f.id).set({ ...SMS_SETTINGS, enabled: true, purposes: [...SMS_SETTINGS.purposes, 'review-invitation'] });
  await db.doc('rlSmsSenderApprovals/' + f.id).set({ status: 'approved', messagingServiceSid: f.serviceSid, automationApproved: true });
  const status = await f.sms.consent(f.request({ action: 'status', customerId: f.customerId }));
  await f.sms.consent(f.request({ action: 'grant', customerId: f.customerId, purposes: ['review-invitation'], source: 'written', evidence: 'Synthetic review-specific queue recovery consent', disclosureAccepted: true, disclosure: status.disclosure }));
}

test('SMS queue recovery preserves its original secure token and creates only one outbox after a lost producer response', async () => {
  const f = await fixture({ smsActive: true, prefs: { emailEnabled: false, smsEnabled: true } }); await authorizeReviewSms(f);
  const queue = f.sms.queueReviewInvitation; let calls = 0;
  f.sms.queueReviewInvitation = async request => { calls++; const result = await queue(request); if (calls === 1) throw Error('Synthetic lost response after queue commit'); return result; };
  await f.schedule(); assert.equal((await f.handlers.schedule()).queued, 1);
  const pending = await f.invitation(), originalToken = pending.get('pendingSms').link, originalHash = pending.get('tokenHash');
  assert.equal(pending.get('pendingSmsActive'), true); assert.equal(pending.get('pendingSms').attempts, 1);
  const visible = await f.handlers.settings(f.request({ action: 'status' })); assert.equal(JSON.stringify(visible).includes(originalToken), false); assert.equal(JSON.stringify(visible).includes(originalHash), false); assert.equal(JSON.stringify(visible).includes('pendingSms'), false);
  f.advance(60001); await Promise.all([f.handlers.schedule(), f.handlers.schedule()]);
  const recovered = await f.invitation(); assert.equal(recovered.get('pendingSmsActive'), false); assert.equal(recovered.get('pendingSms'), null); assert.equal(recovered.get('initialSmsResult'), 'queued'); assert.equal(recovered.get('tokenHash'), originalHash);
  assert.equal((await db.collection('rlSmsOutbox').where('companyId', '==', f.id).get()).size, 1); assert.equal(calls, 2);
  await f.handlers.schedule(); assert.equal(calls, 2);
});

test('pending SMS drops its intent on STOP, consent withdrawal or global disable rather than retrying without authorization', async () => {
  for (const reason of ['stop', 'consent', 'disabled']) {
    const f = await fixture({ smsActive: true, prefs: { emailEnabled: false, smsEnabled: true } }); await authorizeReviewSms(f);
    const queue = f.sms.queueReviewInvitation; let calls = 0;
    f.sms.queueReviewInvitation = async input => { calls++; if (calls === 1) throw Error('Synthetic unavailable SMS queue'); return queue(input); };
    await f.schedule(); await f.handlers.schedule(); assert.equal((await f.invitation()).get('pendingSmsActive'), true);
    if (reason === 'stop') await db.doc('rlSmsSuppressions/' + hash(f.phone)).set({ blocked: true });
    if (reason === 'consent') await f.sms.consent(f.request({ action: 'revoke', customerId: f.customerId }));
    if (reason === 'disabled') f.disable(); f.advance(60001); await f.handlers.schedule();
    assert.equal((await f.invitation()).get('pendingSmsActive'), false, reason); assert.equal((await f.invitation()).get('pendingSms'), null, reason);
    assert.equal((await db.collection('rlSmsOutbox').where('companyId', '==', f.id).get()).size, 0, reason);
    const attempts = calls; f.advance(3600001); await f.handlers.schedule(); assert.equal(calls, attempts, reason);
  }
});

test('SMS queue errors stop after five bounded attempts and remove the pending secret', async () => {
  const f = await fixture({ smsActive: true, prefs: { emailEnabled: false, smsEnabled: true } }); let calls = 0;
  f.sms.queueReviewInvitation = async () => { calls++; throw Error('Synthetic persistent queue failure'); };
  await f.schedule(); await f.handlers.schedule();
  for (let attempt = 0; attempt < 5; attempt++) { f.advance(900001); await f.handlers.schedule(); }
  assert.equal(calls, 5); const row = await f.invitation(); assert.equal(row.get('pendingSmsActive'), false); assert.equal(row.get('pendingSms'), null); assert.equal(row.get('initialSmsResult'), 'review-sms-queue-failed');
});
test('the fifth ambiguous SMS queue response records the committed outbox instead of reporting a false failure', async () => {
  const f = await fixture({ smsActive: true, prefs: { emailEnabled: false, smsEnabled: true } }); await authorizeReviewSms(f);
  const queue = f.sms.queueReviewInvitation; let calls = 0;
  f.sms.queueReviewInvitation = async input => { calls++; if (calls === 5) await queue(input); throw Error('Synthetic response loss on final queue attempt'); };
  await f.schedule(); await f.handlers.schedule(); for (let attempt = 1; attempt < 5; attempt++) { f.advance(900001); await f.handlers.schedule(); }
  const invitation = await f.invitation(), path = invitation.get('deliveryIds').initialSms;
  assert.equal(calls, 5); assert.match(path, /^rlSmsOutbox\/[a-f0-9]{64}$/); assert.equal(invitation.get('initialSmsResult'), 'queued'); assert.equal(invitation.get('pendingSmsActive'), false); assert.equal(invitation.get('pendingSms'), null);
  const outbox = await db.doc(path).get(); assert.equal(outbox.get('reviewInvitationId'), invitation.id); assert.equal(outbox.get('reviewInvitationHash'), invitation.get('tokenHash'));
  assert.equal((await db.collection('rlSmsOutbox').where('companyId', '==', f.id).get()).size, 1);
  let sends = 0; const transport = { send: async () => { sends++; return { state: 'accepted', sid: 'SM' + hash(f.jobId).slice(0, 32) }; } }; await f.sms.drain(transport); await f.sms.drain(transport); assert.equal(sends, 1);
  const history = (await f.handlers.settings(f.request({ action: 'status' }))).history; assert.equal(history[0].sms.status, 'accepted');
});
