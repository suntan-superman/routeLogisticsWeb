const { randomBytes, randomUUID, timingSafeEqual } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { hash, normalizeEmail, validEmail, documentId, rateLimit } = require('./security');
const { requireCapability } = require('./access');
const { phoneE164 } = require('./smsProvider');
const { associationEmail } = require('./portal');

const DAY = 86400000;
const DEFAULT_SETTINGS = { enabled: false, emailEnabled: true, smsEnabled: false, delayMinutes: 60, reminderEnabled: false, reminderDelayMinutes: 2880, expiresDays: 14, revision: 0 };
const millis = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value || '');
const iso = value => Number.isFinite(millis(value)) ? new Date(millis(value)).toISOString() : null;
const settingsFor = snap => ({ ...DEFAULT_SETTINGS, ...(snap?.exists ? snap.data() : {}) });
const scoped = (row, companyId, userId) => row?.exists && (companyId ? row.get('companyId') === companyId : !row.get('companyId') && row.get('userId') === userId);
const completionKeyFor = job => require('./reviews').completionKeyFor(job);
const reviewIdFor = jobId => require('./reviews').reviewIdFor(jobId);
const reviewSmsOutboxId = (companyId, jobId, invitationId, suffix) => hash(`${companyId}:${jobId}:review-invitation:${invitationId}:${suffix}`);
function sameTimestamp(actual, expected) {
  if (typeof actual?.isEqual === 'function' && actual.isEqual(expected)) return true;
  const seconds = value => value?.seconds ?? value?._seconds, nanos = value => value?.nanoseconds ?? value?._nanoseconds;
  return Number.isInteger(seconds(actual)) && Number.isInteger(nanos(actual)) && seconds(actual) === seconds(expected) && nanos(actual) === nanos(expected);
}
function testGrantEligible(grant, live, now, mailId, recipient) {
  const at = millis(grant.get('createdAt')), expires = millis(grant.get('expiresAt'));
  return grant.exists && grant.id === live.invitation.id && grant.get('enabled') === true && grant.get('invitationId') === live.invitation.id && grant.get('companyId') === live.data.companyId && grant.get('jobId') === live.job.id && grant.get('customerId') === live.customer.id
    && grant.get('recipientHash') === hash(live.data.customerEmail) && normalizeEmail(recipient) === live.data.customerEmail && grant.get('maxMessages') === 1 && grant.get('mailId') === mailId
    && live.job.get('isTestRecord') === true && (live.job.get('synthetic') === true || live.job.get('testFixture') === true) && live.customer.get('isTestRecord') === true && Number.isFinite(at) && Number.isFinite(expires) && at <= now && expires > now && expires - at <= 3600000;
}

function cleanSettings(input = {}) {
  const delayMinutes = Number(input.delayMinutes), reminderDelayMinutes = Number(input.reminderDelayMinutes), expiresDays = Number(input.expiresDays);
  if (!Number.isInteger(delayMinutes) || delayMinutes < 0 || delayMinutes > 10080 || !Number.isInteger(reminderDelayMinutes) || reminderDelayMinutes < 60 || reminderDelayMinutes > 20160 || !Number.isInteger(expiresDays) || expiresDays < 1 || expiresDays > 30) throw new HttpsError('invalid-argument', 'Choose a delay of 0–10080 minutes, one reminder after 60–20160 minutes, and a link lifetime of 1–30 days.');
  if (input.reminderEnabled === true && reminderDelayMinutes >= expiresDays * 1440) throw new HttpsError('invalid-argument', 'Schedule the reminder before the review link expires.');
  return { enabled: input.enabled === true, emailEnabled: input.emailEnabled !== false, smsEnabled: input.smsEnabled === true, delayMinutes, reminderEnabled: input.reminderEnabled === true, reminderDelayMinutes, expiresDays };
}

async function readLiveInvitation(tx, db, id, now) {
  const invitation = await tx.get(db.doc(`rlReviewInvitations/${documentId(id, 'review invitation')}`));
  if (!invitation.exists) return null;
  const data = invitation.data();
  if (!['scheduled', 'open'].includes(data.status) || !Number.isFinite(millis(data.expiresAt)) || millis(data.expiresAt) <= now || !/^[a-f0-9]{64}$/.test(data.tokenHash || '')) return null;
  const [job, customer, company, review] = await Promise.all([
    tx.get(db.doc(`jobs/${documentId(data.jobId)}`)), tx.get(db.doc(`customers/${documentId(data.customerId)}`)),
    tx.get(db.doc(`companies/${documentId(data.companyId)}`)), tx.get(db.doc(`rlReviews/${reviewIdFor(data.jobId)}`)),
  ]);
  if (!scoped(job, data.companyId, data.userId) || job.get('status') !== 'completed' || job.get('deletedAt') || job.get('invalidatedAt') || job.get('voidedAt') || job.get('isActive') === false || job.get('customerId') !== customer.id || completionKeyFor(job) !== data.completionKey
    || !scoped(customer, data.companyId, data.userId) || customer.get('isActive') === false || customer.get('deletedAt') || associationEmail(customer) !== data.customerEmail
    || !company.exists || company.get('isActive') === false || company.get('deletedAt') || review.exists) return null;
  return { invitation, job, customer, company, data };
}

// Called only by existing private workers. An operator may authorize exactly one
// synthetic email without enabling broad outbound invitations.
async function reviewDeliveryEligible(tx, db, message, { now = Date.now(), enabled = process.env.RL_REVIEW_INVITATIONS_ENABLED === 'true', channel = 'email' } = {}) {
  const id = message.reviewInvitationId;
  if (!id || !['email', 'sms'].includes(channel)) return false;
  const live = await readLiveInvitation(tx, db, id, now);
  if (!live || live.data.tokenHash !== message.reviewInvitationHash || live.data.status !== 'open' || message.reviewCompletionKey !== live.data.completionKey || message.companyId !== live.data.companyId || message.jobId !== live.job.id || message.customerId !== live.customer.id) return false;
  const settings = settingsFor(await tx.get(db.doc(`rlReviewInvitationSettings/${live.data.companyId}`)));
  if (enabled && settings.enabled && settings[`${channel}Enabled`] && settings.revision === live.data.settingsRevision) return channel !== 'email' || live.customer.get('emailConsent') !== false && live.customer.get('reviewEmailConsent') !== false && normalizeEmail(message.to) === live.data.customerEmail;
  if (channel !== 'email' || !message.reviewTestGrantId) return false;
  const grant = await tx.get(db.doc(`rlReviewTestGrants/${documentId(message.reviewTestGrantId)}`));
  return testGrantEligible(grant, live, now, message.reviewMailId, message.to);
}

function reviewInvitationHandlers(db, config = {}) {
  const now = config.now || (() => Date.now()), enabled = config.enabled || (() => false), emailEnabled = config.emailEnabled || (() => false), appUrl = config.appUrl || (() => 'https://route-logistics.com');
  const ref = (collection, id) => db.doc(`${collection}/${documentId(id)}`);
  async function staff(request) {
    const scope = await requireCapability(db, request, 'jobs.schedule');
    if (!scope.companyId || !['owner', 'manager'].includes(scope.role) || request.data?.companyId !== undefined && request.data.companyId !== scope.companyId) throw new HttpsError('permission-denied', 'Only this company’s owner or manager can manage review invitations.');
    return scope;
  }
  async function assertActor(tx, scope) {
    const row = await tx.get(ref(scope.role === 'owner' ? 'companies' : 'teamMembers', scope.role === 'owner' ? scope.companyId : scope.memberId));
    if (!row.exists || (scope.role === 'owner' ? row.get('ownerId') !== scope.uid : row.get('uid') !== scope.uid || row.get('companyId') !== scope.companyId || row.get('status') !== 'active' || row.get('role') !== 'manager')) throw new HttpsError('permission-denied', 'Refresh your current company access before saving.');
  }
  async function cancel(id, reason = 'job-or-recipient-changed') {
    return db.runTransaction(async tx => {
      const invitation = await tx.get(ref('rlReviewInvitations', id));
      if (!invitation.exists || ['submitted', 'cancelled'].includes(invitation.get('status'))) return;
      const ids = invitation.get('deliveryIds') || {}, paths = [...Object.values(ids)].filter(value => typeof value === 'string');
      const rows = await Promise.all(paths.map(path => tx.get(db.doc(path))));
      tx.update(invitation.ref, { status: 'cancelled', cancellationReason: reason, cancelledAt: new Date(now()), pendingSms: null, pendingSmsActive: false, updatedAt: new Date(now()) });
      for (const row of rows) if (['queued', 'sending', 'dispatching'].includes(row.get('status'))) tx.update(row.ref, { status: 'cancelled', failureCode: reason, updatedAt: new Date(now()) });
    });
  }
  function messageText(company, job, link, reminder) {
    const name = String(company.get('name') || 'Your service provider').replace(/[\r\n<>]/g, ' ').slice(0, 100);
    return { subject: `${reminder ? 'Reminder: ' : ''}How was your service from ${name}?`, text: `${name}\n\nPlease share honest feedback about your completed ${String(job.get('serviceType') || 'service').slice(0, 150)} visit. All ratings are welcome. Your review is private unless you separately permit public display; permission does not automatically publish it.\n\n${link}\n\nThis secure link expires and can be used once. If you already shared feedback, no action is needed.` };
  }
  // Durable, server-only producer intent. Its bearer link is confined to private
  // invitation/outbox records and never included in settings or history DTOs.
  async function recoverSmsOutbox(tx, row, pending) {
    const id = reviewSmsOutboxId(row.get('companyId'), pending.jobId, pending.invitationId, pending.suffix), message = await tx.get(ref('rlSmsOutbox', id));
    return message.exists && message.get('companyId') === row.get('companyId') && message.get('customerId') === row.get('customerId') && message.get('jobId') === row.get('jobId') && message.get('purpose') === 'review-invitation' && message.get('reviewInvitationId') === row.id && message.get('reviewInvitationHash') === pending.invitationHash && message.get('reviewCompletionKey') === row.get('completionKey') ? { queued: true, existing: true, id } : null;
  }
  async function dispatchPendingSms(id) {
    const claimId = randomUUID();
    const request = await db.runTransaction(async tx => {
      const row = await tx.get(ref('rlReviewInvitations', id)), pending = row.get('pendingSms');
      if (!pending || row.get('pendingSmsActive') !== true) return null;
      const suffix = pending.suffix === 'reminder' ? 'reminder' : 'initial';
      const finish = (reason, outboxId) => { const deliveryIds = { ...row.get('deliveryIds') }; if (outboxId) deliveryIds[`${suffix}Sms`] = `rlSmsOutbox/${outboxId}`; tx.update(row.ref, { deliveryIds, pendingSms: null, pendingSmsActive: false, pendingSmsResumeAt: null, [`${suffix}SmsResult`]: reason, nextActionAt: row.get('pendingSmsResumeAt') || row.get('expiresAt'), updatedAt: new Date(now()) }); return null; };
      if (!enabled()) return finish('review-delivery-disabled');
      const live = await readLiveInvitation(tx, db, id, now());
      if (!live || live.data.status !== 'open' || pending.invitationId !== id || pending.invitationHash !== live.data.tokenHash || pending.jobId !== live.job.id) return finish('review-invitation-no-longer-authorized');
      const settings = settingsFor(await tx.get(ref('rlReviewInvitationSettings', live.data.companyId)));
      if (!settings.enabled || !settings.smsEnabled || settings.revision !== live.data.settingsRevision || !config.sms?.queueReviewInvitation) return finish('review-sms-not-authorized');
      if ((pending.attempts || 0) >= 5) { const recovered = await recoverSmsOutbox(tx, row, pending); return finish(recovered ? 'queued' : 'review-sms-queue-failed', recovered?.id); }
      if (millis(pending.nextAttemptAt) > now()) return null;
      const next = { ...pending, attempts: (pending.attempts || 0) + 1, claimId, nextAttemptAt: new Date(now() + 120000) };
      tx.update(row.ref, { pendingSms: next, nextActionAt: next.nextAttemptAt, updatedAt: new Date(now()) });
      return next;
    });
    if (!request) return { skipped: true };
    let result, failed = false;
    try { result = await config.sms.queueReviewInvitation({ jobId: request.jobId, invitationId: request.invitationId, invitationHash: request.invitationHash, link: request.link, suffix: request.suffix }); }
    catch { failed = true; }
    const disposition = await db.runTransaction(async tx => {
      const row = await tx.get(ref('rlReviewInvitations', id)), pending = row.get('pendingSms');
      if (!row.exists || row.get('pendingSmsActive') !== true || pending?.claimId !== claimId || pending.invitationHash !== request.invitationHash) return;
      let queueResult = result, queueFailed = failed;
      if (queueFailed && pending.attempts >= 5) { const recovered = await recoverSmsOutbox(tx, row, pending); if (recovered) { queueResult = recovered; queueFailed = false; } }
      if (queueFailed && pending.attempts < 5 && millis(row.get('expiresAt')) > now()) {
        const nextAttemptAt = new Date(Math.min(now() + 60000 * 2 ** (pending.attempts - 1), millis(row.get('expiresAt'))));
        tx.update(row.ref, { pendingSms: { ...pending, claimId: null, nextAttemptAt }, [`${request.suffix}SmsResult`]: 'review-sms-queue-retry', nextActionAt: nextAttemptAt, updatedAt: new Date(now()) }); return { retryPending: true };
      }
      const deliveryIds = { ...row.get('deliveryIds') }; if (queueResult?.id) deliveryIds[`${request.suffix}Sms`] = `rlSmsOutbox/${queueResult.id}`;
      tx.update(row.ref, { deliveryIds, pendingSms: null, pendingSmsActive: false, pendingSmsResumeAt: null, [`${request.suffix}SmsResult`]: queueFailed ? 'review-sms-queue-failed' : queueResult?.reason || (queueResult?.queued ? 'queued' : 'not-queued'), nextActionAt: row.get('pendingSmsResumeAt') || row.get('expiresAt'), updatedAt: new Date(now()) });
      return queueFailed ? { failed: true } : queueResult;
    });
    return disposition || { skipped: true };
  }
  async function queueDelivery(id, reminder = false) {
    if (!enabled()) return { skipped: true, reason: 'review-delivery-disabled' };
    const token = randomBytes(32).toString('hex'), tokenHash = hash(token), suffix = reminder ? 'reminder' : 'initial', mailId = `review_${id}_${suffix}`;
    const result = await db.runTransaction(async tx => {
      const live = await readLiveInvitation(tx, db, id, now());
      if (!live) return { cancelled: true };
      const { invitation, data, job, customer, company } = live, stored = await tx.get(ref('rlReviewInvitationSettings', data.companyId)), settings = settingsFor(stored);
      if (!settings.enabled || settings.revision !== data.settingsRevision || !settings.emailEnabled && !settings.smsEnabled || data.pendingSmsActive === true || reminder && (!settings.reminderEnabled || data.reminderQueuedAt) || !reminder && data.firstQueuedAt) return { skipped: true, reason: 'preferences-or-duplicate' };
      const due = reminder ? millis(data.reminderDueAt) : millis(data.dueAt);
      if (!Number.isFinite(due) || due > now()) return { skipped: true, reason: 'not-due' };
      const oldMail = await tx.get(ref('rlMail', mailId));
      const link = `${appUrl().replace(/\/$/, '')}/review#id=${id}&token=${token}`;
      const deliveryIds = { ...(data.deliveryIds || {}) };
      const emailResult = !settings.emailEnabled ? 'channel-disabled' : !emailEnabled() ? 'email-delivery-disabled' : customer.get('emailConsent') === false || customer.get('reviewEmailConsent') === false ? 'customer-email-opted-out' : !validEmail(data.customerEmail) ? 'customer-email-unavailable' : 'queued';
      if (settings.emailEnabled && emailEnabled() && customer.get('emailConsent') !== false && customer.get('reviewEmailConsent') !== false && validEmail(data.customerEmail) && !oldMail.exists) {
        tx.create(oldMail.ref, { ...messageText(company, job, link, reminder), to: data.customerEmail, companyId: data.companyId, customerId: customer.id, jobId: job.id, status: 'queued', availableAt: now(), attempts: 0, createdAt: new Date(now()), expiresAt: data.expiresAt, reviewInvitationId: id, reviewInvitationHash: tokenHash, reviewCompletionKey: data.completionKey, reviewMailId: mailId });
        deliveryIds[`${suffix}Email`] = oldMail.ref.path;
      }
      const pendingSms = settings.smsEnabled && config.sms?.queueReviewInvitation ? { jobId: job.id, invitationId: id, invitationHash: tokenHash, link, suffix, attempts: 0, nextAttemptAt: new Date(now()) } : null;
      const nextActionAt = !reminder && settings.reminderEnabled ? new Date(Math.min(now() + settings.reminderDelayMinutes * 60000, millis(data.expiresAt))) : data.expiresAt;
      tx.update(invitation.ref, { tokenHash, status: 'open', deliveryIds, pendingSms, pendingSmsActive: !!pendingSms, pendingSmsResumeAt: pendingSms ? nextActionAt : null, nextActionAt: pendingSms ? new Date(now()) : nextActionAt, [`${suffix}EmailResult`]: emailResult, ...(reminder ? { reminderQueuedAt: new Date(now()) } : { firstQueuedAt: new Date(now()), reminderDueAt: new Date(now() + settings.reminderDelayMinutes * 60000) }), updatedAt: new Date(now()) });
      return { queued: Object.keys(deliveryIds).length > Object.keys(data.deliveryIds || {}).length || !!pendingSms, pendingSms: !!pendingSms, id };
    });
    if (result.cancelled) { await cancel(id); return { skipped: true, reason: 'job-or-recipient-changed' }; }
    if (result.pendingSms) await dispatchPendingSms(id);
    return result;
  }
  return {
    settings: async request => {
      const scope = await staff(request), target = ref('rlReviewInvitationSettings', scope.companyId), data = request.data || {};
      await rateLimit(db, 'review-invitation-settings', scope.uid, 30, 60000, now());
      if (data.action === 'save') {
        const clean = cleanSettings(data.settings);
        if (!Number.isInteger(data.expectedRevision) || data.expectedRevision < 0) throw new HttpsError('invalid-argument', 'Reload review invitation settings before saving.');
        await db.runTransaction(async tx => { const current = await tx.get(target); await assertActor(tx, scope); if ((current.get('revision') || 0) !== data.expectedRevision) throw new HttpsError('aborted', 'Review invitation settings changed. Reload before saving.'); const revision = data.expectedRevision + 1; tx.set(target, { ...clean, revision, updatedBy: scope.uid, updatedAt: new Date(now()) }); tx.create(db.collection('rlReviewAudit').doc(), { action: 'invitation-settings.save', companyId: scope.companyId, actorId: scope.uid, revision, createdAt: new Date(now()) }); });
      } else if (data.action !== 'status') throw new HttpsError('invalid-argument', 'Choose a review invitation settings action.');
      const [current, invitations] = await Promise.all([target.get(), db.collection('rlReviewInvitations').where('companyId', '==', scope.companyId).orderBy('createdAt', 'desc').limit(50).get()]);
      const history = [];
      for (const invitation of invitations.docs) {
        const deliveries = {};
        for (const [key, path] of Object.entries(invitation.get('deliveryIds') || {})) { const row = await db.doc(path).get(); deliveries[key] = { status: row.get('status') || 'unavailable', failureCode: row.get('failureCode') || null }; }
        history.push({ id: invitation.id, jobId: invitation.get('jobId'), serviceType: invitation.get('serviceType') || 'Service', completedAt: iso(invitation.get('completedAt')), status: invitation.get('status'), expiresAt: iso(invitation.get('expiresAt')), email: deliveries.initialEmail || { status: 'not-queued', failureCode: invitation.get('initialEmailResult') || null }, sms: deliveries.initialSms || { status: 'not-queued', failureCode: invitation.get('initialSmsResult') || null }, reminderEmail: deliveries.reminderEmail || null, reminderSms: deliveries.reminderSms || null, failureCode: invitation.get('cancellationReason') || null });
      }
      return { settings: settingsFor(current), delivery: { enabled: enabled() === true, emailEnabled: emailEnabled() === true, smsEnabled: enabled() === true && config.sms?.reviewDeliveryEnabled?.() === true }, history };
    },
    invitation: async request => {
      const data = request.data || {}, id = documentId(data.invitationId || data.id, 'review invitation'), token = data.token;
      await rateLimit(db, 'review-link', request.rawRequest?.ip || 'unknown', 30, 60000, now());
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new HttpsError('permission-denied', 'This review link is invalid, expired or already used. Sign in to your customer portal for your service feedback.');
      const supplied = hash(token);
      return db.runTransaction(async tx => {
        const live = await readLiveInvitation(tx, db, id, now());
        if (!live || live.data.status !== 'open' || supplied.length !== live.data.tokenHash.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(live.data.tokenHash))) throw new HttpsError('permission-denied', 'This review link is invalid, expired or already used. Sign in to your customer portal for your service feedback.');
        if (data.action === 'get') return { invitation: { id, status: live.data.status, expiresAt: iso(live.data.expiresAt), companyName: live.company.get('name') || 'Your service provider', serviceType: live.job.get('serviceType') || 'Service', serviceDate: String(live.job.get('date') || '').slice(0, 10), synthetic: live.job.get('synthetic') === true || live.job.get('testFixture') === true } };
        if (data.action !== 'submit') throw new HttpsError('invalid-argument', 'Choose a review action.');
        const core = require('./reviews').reviewHandlers(db, { now });
        return core.submitInTransaction(tx, { job: live.job, customer: live.customer, company: live.company, actor: { portalEmail: live.data.customerEmail }, source: 'invitation', input: data, invitationId: id, invitationToken: token });
      });
    },
    onJob: async (before, after, jobId, eventId, afterUpdateTime) => {
      const stateRef = ref('rlReviewJobState', hash(jobId));
      const latestJob = await ref('jobs', jobId).get();
      if (!after && latestJob.exists || afterUpdateTime && latestJob.exists && !sameTimestamp(latestJob.updateTime, afterUpdateTime)) return { skipped: true, reason: 'superseded-job-event' };
      if (!after || after.status !== 'completed' || after.deletedAt || after.invalidatedAt || after.voidedAt || after.isActive === false || before?.companyId !== undefined && before.companyId !== after.companyId || before?.customerId !== undefined && before.customerId !== after.customerId) {
        const state = await stateRef.get(); if (state.get('invitationId')) await cancel(state.get('invitationId'), 'job-reopened-or-invalidated');
        if (!after || after.status !== 'completed' || after.deletedAt || after.invalidatedAt || after.voidedAt || after.isActive === false) return { skipped: true, reason: 'job-not-completed' };
      }
      if (!enabled() || !after.companyId || before?.status === 'completed') return { skipped: true, reason: !enabled() ? 'review-delivery-disabled' : 'not-a-completion' };
      return db.runTransaction(async tx => {
        const job = await tx.get(ref('jobs', jobId));
        if (!job.exists || afterUpdateTime && !sameTimestamp(job.updateTime, afterUpdateTime) || job.get('status') !== 'completed' || job.get('companyId') !== after.companyId || job.get('customerId') !== after.customerId) return { skipped: true, reason: 'job-changed' };
        const [customer, company, stored, state, review] = await Promise.all([tx.get(ref('customers', documentId(job.get('customerId')))), tx.get(ref('companies', job.get('companyId'))), tx.get(ref('rlReviewInvitationSettings', job.get('companyId'))), tx.get(stateRef), tx.get(ref('rlReviews', reviewIdFor(jobId)))]);
        const settings = settingsFor(stored), completionKey = completionKeyFor(job), id = hash(`review-invitation:${jobId}:${eventId || completionKey}`), invitation = await tx.get(ref('rlReviewInvitations', id));
        if (!settings.enabled || review.exists || invitation.exists || !settings.emailEnabled && !settings.smsEnabled || !scoped(customer, job.get('companyId'), job.get('userId')) || customer.get('isActive') === false || customer.get('deletedAt') || !company.exists || company.get('isActive') === false || company.get('deletedAt')) return { skipped: true, reason: 'preferences-or-ineligible' };
        if (state.get('invitationId') && state.get('completionKey') === completionKey && state.get('eventId') === (eventId || completionKey)) return { skipped: true, reason: 'duplicate-completion' };
        const previous = state.get('invitationId') ? await tx.get(ref('rlReviewInvitations', state.get('invitationId'))) : null;
        if (previous?.exists && !['submitted', 'cancelled'].includes(previous.get('status'))) tx.update(previous.ref, { status: 'cancelled', cancellationReason: 'superseded-completion', cancelledAt: new Date(now()) });
        const completed = millis(job.get('completedAt')) || now(), dueAt = Math.max(now(), completed + settings.delayMinutes * 60000);
        tx.create(invitation.ref, { companyId: job.get('companyId'), userId: job.get('userId'), customerId: customer.id, customerEmail: associationEmail(customer), jobId, completionKey, tokenHash: hash(randomBytes(32).toString('hex')), status: 'scheduled', settingsRevision: settings.revision, serviceType: String(job.get('serviceType') || 'Service').slice(0, 300), completedAt: new Date(completed), dueAt: new Date(dueAt), nextActionAt: new Date(dueAt), expiresAt: new Date(dueAt + settings.expiresDays * DAY), createdAt: new Date(now()), updatedAt: new Date(now()), deliveryIds: {} });
        tx.set(stateRef, { companyId: job.get('companyId'), jobId, invitationId: id, completionKey, eventId: eventId || completionKey, updatedAt: new Date(now()) });
        return { scheduled: true, id };
      });
    },
    schedule: async () => {
      if (!enabled()) { const pending = await db.collection('rlReviewInvitations').where('pendingSmsActive', '==', true).limit(200).get(); for (const row of pending.docs) await dispatchPendingSms(row.id); return { skipped: true, reason: 'review-delivery-disabled' }; }
      const rows = await db.collection('rlReviewInvitations').where('status', 'in', ['scheduled', 'open']).where('nextActionAt', '<=', new Date(now())).orderBy('nextActionAt').limit(200).get(); let queued = 0, cancelled = 0;
      for (const row of rows.docs) {
        if (row.get('pendingSmsActive') === true) { const result = await dispatchPendingSms(row.id); if (result?.queued) queued++; continue; }
        const live = await db.runTransaction(tx => readLiveInvitation(tx, db, row.id, now()));
        if (!live) { await cancel(row.id); cancelled++; continue; }
        const settings = settingsFor(await ref('rlReviewInvitationSettings', row.get('companyId')).get());
        if (!settings.enabled || settings.revision !== row.get('settingsRevision')) { await cancel(row.id, 'preferences-changed'); cancelled++; continue; }
        const reminder = row.get('status') === 'open';
        if (!reminder && millis(row.get('dueAt')) <= now() || reminder && settings.reminderEnabled && !row.get('reminderQueuedAt') && millis(row.get('reminderDueAt')) <= now()) { const result = await queueDelivery(row.id, reminder); if (result.queued) queued++; }
      }
      return { queued, cancelled };
    },
    // Operator-only library entry point. Never bind this method to a callable.
    queueTestEmail: async id => {
      if (!emailEnabled()) throw new HttpsError('failed-precondition', 'Email delivery is disabled.');
      const token = randomBytes(32).toString('hex'), tokenHash = hash(token), mailId = `review_${documentId(id)}_test`;
      return db.runTransaction(async tx => {
        const live = await readLiveInvitation(tx, db, id, now());
        if (!live) throw new HttpsError('failed-precondition', 'The synthetic review invitation is unavailable.');
        const stateRef = ref('rlReviewJobState', hash(live.job.id));
        const [grant, mail, state] = await Promise.all([tx.get(ref('rlReviewTestGrants', id)), tx.get(ref('rlMail', mailId)), tx.get(stateRef)]);
        if (!testGrantEligible(grant, live, now(), mailId, live.data.customerEmail)) throw new HttpsError('permission-denied', 'A private, unexpired single-email synthetic test grant is required.');
        if (state.exists && state.get('invitationId') !== id) throw new HttpsError('failed-precondition', 'Another invitation already belongs to this synthetic visit.');
        if (mail.exists) return { queued: true, existing: true, id, mailId };
        const link = `${appUrl().replace(/\/$/, '')}/review#id=${id}&token=${token}`;
        tx.create(mail.ref, { ...messageText(live.company, live.job, link, false), subject: 'Route Logistics synthetic service review test', to: live.data.customerEmail, companyId: live.data.companyId, customerId: live.customer.id, jobId: live.job.id, status: 'queued', availableAt: now(), attempts: 0, createdAt: new Date(now()), expiresAt: live.data.expiresAt, reviewInvitationId: id, reviewInvitationHash: tokenHash, reviewCompletionKey: live.data.completionKey, reviewTestGrantId: id, reviewMailId: mailId });
        tx.update(live.invitation.ref, { tokenHash, status: 'open', firstQueuedAt: new Date(now()), nextActionAt: live.data.expiresAt, deliveryIds: { initialEmail: mail.ref.path }, pendingSms: null, pendingSmsActive: false, pendingSmsResumeAt: null, updatedAt: new Date(now()) });
        if (!state.exists) tx.create(stateRef, { companyId: live.data.companyId, jobId: live.job.id, invitationId: id, completionKey: live.data.completionKey, eventId: 'operator-test:' + id, updatedAt: new Date(now()) });
        tx.update(grant.ref, { queuedAt: new Date(now()) });
        return { queued: true, existing: false, id, mailId };
      });
    },
    queueDelivery,
  };
}
module.exports = { reviewInvitationHandlers, reviewDeliveryEligible, readLiveInvitation, reviewSmsOutboxId, cleanSettings, DEFAULT_SETTINGS };
