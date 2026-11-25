const {
  randomUUID
} = require('node:crypto');
const {
  HttpsError
} = require('firebase-functions/v2/https');
const {
  requireCapability
} = require('./access');
const {
  requireCompanyOwner,
  documentId,
  hash,
  rateLimit
} = require('./security');
const {
  phoneE164,
  verifySignature
} = require('./smsProvider');
const { pilotEligible } = require('./smsPilot');
const PURPOSES = ['appointment-confirmation', 'pre-visit', 'en-route', 'service-completed', 'service-follow-up', 'review-invitation'];
const appointmentNotificationEligible = job => job?.status === 'scheduled' && job.rescheduleRequired !== true && !job.schedulingAttention;
const DEFAULT_TEMPLATES = {
  'appointment-confirmation': 'Your service appointment is confirmed for {date} {time}.',
  'pre-visit': 'Reminder: your service appointment is scheduled for {date} {time}.',
  'en-route': 'Your service technician is on the way.',
  'service-completed': 'Your scheduled service visit is complete. Contact us if you need help.',
  'service-follow-up': 'Following up on your recent service visit. Contact us if you need help.',
  'review-invitation': 'Please share honest feedback about your completed service in your customer portal.'
};
const DEFAULT_SETTINGS = {
  enabled: false,
  reminderMinutes: 1440,
  followUpMinutes: 1440,
  purposes: PURPOSES.slice(0, 4),
  templates: DEFAULT_TEMPLATES,
  timeZone: 'America/Los_Angeles'
};
const TERMINAL = ['delivered', 'undelivered', 'failed', 'canceled'];
const time = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value || '');
const publicDate = value => Number.isFinite(time(value)) ? new Date(time(value)).toISOString() : null;
const disclosure = company => `I agree to receive ${company} service text messages for the purposes selected below. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase. Optional follow-up messages and review invitations require separate consent.`;
function cleanSettings(data) {
  const purposes = data.purposes;
  if (!Array.isArray(purposes) || purposes.some(item => !PURPOSES.includes(item)) || ![30, 60, 120, 1440].includes(data.reminderMinutes) || ![60, 1440, 2880].includes(data.followUpMinutes)) throw new HttpsError('invalid-argument', 'Choose supported SMS purposes and reminder intervals.');
  if (typeof data.timeZone !== 'string' || !data.timeZone) throw new HttpsError('invalid-argument', 'Choose a company time zone.');
  try {
    new Intl.DateTimeFormat('en-US', {
      timeZone: data.timeZone
    }).format();
  } catch {
    throw new HttpsError('invalid-argument', 'Choose a valid company time zone.');
  }
  const templates = {
    ...DEFAULT_TEMPLATES
  };
  for (const purpose of PURPOSES) {
    const text = String(data.templates?.[purpose] || templates[purpose]).trim();
    if (!text || text.length > 300 || /[<>]|https?:|\b(invoice|balance|payment|paid|credit.?card|diagnosis|password|verification code)\b|\d{5}/i.test(text) || [...text.matchAll(/\{([^}]+)\}/g)].some(match => !['date', 'time'].includes(match[1]))) throw new HttpsError('invalid-argument', 'Templates may use {date} and {time} only, and must not contain sensitive, financial, account or link content.');
    templates[purpose] = text;
  }
  return {
    enabled: data.enabled === true,
    purposes: [...new Set(purposes)],
    reminderMinutes: data.reminderMinutes,
    followUpMinutes: data.followUpMinutes,
    timeZone: data.timeZone,
    templates
  };
}
function renderMessage(company, settings, job, purpose) {
  const name = String(company.name || company.businessName || 'Your service provider').replace(/[\r\n<>]/g, ' ').slice(0, 80);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(job.date || '') ? job.date : 'the agreed date';
  const slot = /^(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*(?:AM|PM))?$/i.test(job.time || '') ? job.time : 'the agreed time';
  return `${name}: ${(settings.templates[purpose] || DEFAULT_TEMPLATES[purpose]).replace(/\{date\}/g, date).replace(/\{time\}/g, slot)} Reply STOP to opt out, HELP for help.`;
}
function appointmentTime(job, zone) {
  const match = String(job.time || '').match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(job.date || '') || !match) return NaN;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3] && (hour < 1 || hour > 12)) return NaN;
  if (match[3]) hour = hour % 12 + (/pm/i.test(match[3]) ? 12 : 0);
  if (hour > 23 || minute > 59) return NaN;
  const wanted = Date.parse(`${job.date}T${String(hour).padStart(2, '0')}:${match[2]}:00Z`);
  let guess = wanted;
  try {
    for (let i = 0; i < 3; i++) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).formatToParts(new Date(guess)).map(part => [part.type, part.value]));
      const local = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
      guess += wanted - local;
    }
    return guess;
  } catch {
    return NaN;
  }
}
function smsHandlers(db, config = {}) {
  const enabled = config.enabled || (() => false),
    approved = config.liveApproved || (() => false),
    now = config.now || (() => Date.now());
  const broadActive = () => enabled() === true && approved() === true;
  const pilotEnabled = config.pilotEnabled || (() => false);
  const configuredPilotId = () => {
    const id = config.pilotId?.();
    return pilotEnabled() === true && typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : null;
  };
  const active = () => broadActive() || !!configuredPilotId();
  const inboundUrl = config.inboundUrl || 'https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsInbound';
  const statusUrl = config.statusUrl || 'https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsStatus';
  const accountSid = config.accountSid || (() => ''),
    authToken = config.authToken || (() => ''),
    serviceSid = config.messagingServiceSid || (() => ''),
    senderMode = config.senderMode || (() => 'messaging-service'),
    fromNumber = config.fromNumber || (() => '');
  const approvedSender = (registration, checkRuntime = false) => {
    if (registration.get('status') !== 'approved') return null;
    const mode = registration.get('senderMode') || 'messaging-service';
    const reference = mode === 'phone-number' ? phoneE164(registration.get('fromNumber')) : registration.get('messagingServiceSid');
    if (!['messaging-service', 'phone-number'].includes(mode) || (mode === 'phone-number' ? !reference : !/^MG[a-fA-F0-9]{32}$/.test(reference || ''))) return null;
    if (checkRuntime && (mode !== senderMode() || reference !== (mode === 'phone-number' ? phoneE164(fromNumber()) : serviceSid()))) return null;
    return { mode, reference };
  };
  const ref = (name, id) => db.doc(`${name}/${id}`);
  const settingsRef = companyId => ref('rlSmsSettings', companyId),
    consentRef = (companyId, id) => ref('rlSmsConsents', hash(`${companyId}:${id}`));
  async function scope(request, capability = 'customers.manage') {
    const staff = await requireCapability(db, request, capability);
    if (!staff.companyId) throw new HttpsError('failed-precondition', 'Company SMS is available to active company staff.');
    return staff;
  }
  const settingsData = snap => ({
    ...DEFAULT_SETTINGS,
    ...(snap?.exists ? snap.data() : {}),
    templates: {
      ...DEFAULT_TEMPLATES,
      ...snap?.get('templates')
    }
  });
  function publicConsent(data) {
    return data ? {
      status: data.status,
      purposes: data.purposes || [],
      source: data.source,
      grantedAt: publicDate(data.grantedAt),
      revokedAt: publicDate(data.revokedAt),
      disclosure: data.disclosure,
      phoneLast4: data.phone?.slice(-4),
      updatedAt: publicDate(data.updatedAt)
    } : null;
  }
  async function cancelQueued(filters, reason, predicate = () => true) {
    // Re-read each row transactionally: never overwrite a delivery callback or
    // cancel a row that another worker has already submitted to the provider.
    let query = db.collection('rlSmsOutbox').where('status', '==', 'queued');
    for (const [field, value] of filters) query = query.where(field, '==', value);
    let cursor, cancelled = 0;
    for (let page = 0; page < 10; page++) {
      const rows = await (cursor ? query.startAfter(cursor) : query).limit(100).get();
      if (rows.empty) return cancelled;
      cancelled += await db.runTransaction(async tx => {
        const current = await Promise.all(rows.docs.map(row => tx.get(row.ref)));
        let count = 0;
        for (const row of current) {
          if (!row.exists || row.get('status') !== 'queued' || !filters.every(([field, value]) => row.get(field) === value) || !predicate(row)) continue;
          tx.update(row.ref, { status: 'cancelled', failureCode: reason, updatedAt: new Date(now()) });
          tx.create(ref('rlSmsAudit', randomUUID()), {
            companyId: row.get('companyId'), customerId: row.get('customerId') || null,
            jobId: row.get('jobId') || null, event: 'queued-cancelled',
            failureCode: reason, createdAt: new Date(now())
          });
          count++;
        }
        return count;
      });
      if (rows.size < 100) return cancelled;
      cursor = rows.docs.at(-1);
    }
    throw new HttpsError('resource-exhausted', 'SMS suppression is saved. Pending message cleanup requires another attempt; delivery remains blocked.');
  }
  async function applyOptOut({ phone, sid, command, eventTime, origin = 'signed-inbound', providerEventId = null }) {
    phone = phoneE164(phone);
    command = String(command || '').trim().toUpperCase();
    const stop = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'].includes(command);
    const start = ['START', 'UNSTOP'].includes(command) || senderMode() !== 'phone-number' && ['YES', 'SUBSCRIBE'].includes(command);
    const help = ['HELP', 'INFO'].includes(command);
    const at = eventTime === undefined ? now() : time(eventTime);
    if (!phone || !/^SM[a-fA-F0-9]{32}$/.test(sid || '') || !Number.isFinite(at) || at <= 0) throw new HttpsError('invalid-argument', 'A valid provider message and event timestamp are required.');
    if (!stop && !start && !help) return { ignored: true };
    const result = await db.runTransaction(async tx => {
      const eventRef = ref('rlSmsInboundEvents', sid), suppressionRef = ref('rlSmsSuppressions', hash(phone));
      const [event, binding, suppression] = await Promise.all([tx.get(eventRef), tx.get(ref('rlSmsRecipients', hash(phone))), tx.get(suppressionRef)]);
      const owners = binding.get('owners') || [];
      // The shared sender also receives Merxus traffic. Never import unrelated
      // recipients or grant their numbers a Route Logistics customer association.
      if (!owners.length) return { ignored: true };
      if (event.exists) return { duplicate: true, cancel: stop && suppression.get('blocked') === true };
      const ambiguous = new Set(owners.map(owner => owner.companyId)).size !== 1;
      const previousAt = time(suppression.get('providerEventAt'));
      const stale = !help && Number.isFinite(previousAt) && (at < previousAt || at === previousAt && !stop && suppression.get('providerCommand') === 'STOP');
      const consents = !stale && stop ? await Promise.all(owners.map(owner => tx.get(consentRef(owner.companyId, owner.customerId)))) : [];
      if (!stale && !help) {
        tx.set(suppressionRef, {
          blocked: stop || ambiguous,
          reason: ambiguous && start ? 'ambiguous-shared-number' : start ? 'customer-start' : 'customer-stop',
          updatedAt: new Date(now()), providerEventAt: new Date(at), providerEventId: sid,
          providerCommand: stop ? 'STOP' : 'START', providerOrigin: origin
        });
        for (const consent of consents) {
          if (!consent.exists || consent.get('phone') !== phone) continue;
          tx.update(consent.ref, {
            ...(consent.get('status') === 'granted' ? { status: 'stopped' } : {}),
            updatedAt: new Date(now()), version: (consent.get('version') || 0) + 1
          });
        }
        // START changes provider suppression only. A stopped or revoked RL
        // preference requires a fresh, independently evidenced consent grant.
      }
      tx.create(eventRef, {
        phoneHash: hash(phone), command, ambiguous, ignored: stale,
        origin, providerEventId, eventTime: new Date(at), createdAt: new Date(now())
      });
      for (const owner of owners) tx.create(ref('rlSmsAudit', hash(`${sid}:${owner.companyId}:${owner.customerId}`)), {
        ...owner, event: `customer-${stale ? 'stale-opt-out-event' : help ? 'help' : start ? 'start' : 'stop'}`,
        ambiguous, origin, providerEventAt: new Date(at), createdAt: new Date(now())
      });
      return { ignored: stale, blocked: stale ? suppression.get('blocked') === true : stop || ambiguous, cancel: !stale && stop };
    });
    if (result.cancel) result.cancelled = await cancelQueued([['to', phone]], 'customer-stop');
    const { cancel, ...publicResult } = result;
    return publicResult;
  }
  async function queue(jobId, purpose, {
    actor = null,
    automatic = false,
    reviewInvitation = null
  } = {}) {
    if (!active()) return {
      skipped: true,
      reason: 'delivery-disabled'
    };
    if (!PURPOSES.includes(purpose)) throw new HttpsError('invalid-argument', 'Unsupported SMS purpose.');
    if (purpose === 'review-invitation' && !reviewInvitation) return { skipped: true, reason: 'secure-review-invitation-required' };
    const jobRef = ref('jobs', documentId(jobId, 'job'));
    return db.runTransaction(async tx => {
      const job = await tx.get(jobRef),
        companyId = job.get('companyId');
      if (!job.exists || !companyId) return {
        skipped: true,
        reason: 'job-unavailable'
      };
      if (actor && actor.companyId !== companyId) throw new HttpsError('permission-denied', 'This job belongs to another workspace.');
      if (!job.get('customerId')) return {
        skipped: true,
        reason: 'customer-missing'
      };
      const [customer, company, stored, registration] = await Promise.all([tx.get(ref('customers', documentId(job.get('customerId'), 'customer'))), tx.get(ref('companies', companyId)), tx.get(settingsRef(companyId)), tx.get(ref('rlSmsSenderApprovals', companyId))]);
      const settings = settingsData(stored);
      const sender = approvedSender(registration);
      const broadAllowed = broadActive() && settings.enabled && settings.purposes.includes(purpose)
        && (!automatic || registration.get('automationApproved') === true);
      // Producers have no provider secrets. The worker rechecks this operator
      // approval against its bound sender immediately before sending.
      if (!company.exists || !sender || !broadAllowed && !configuredPilotId()) return {
        skipped: true,
        reason: 'company-delivery-not-approved'
      };
      if (customer.get('companyId') !== companyId || customer.get('isActive') === false) return {
        skipped: true,
        reason: 'customer-unavailable'
      };
      if (['appointment-confirmation', 'pre-visit'].includes(purpose) && !appointmentNotificationEligible(job.data()) || purpose === 'en-route' && job.get('status') !== 'en-route' || ['service-completed', 'service-follow-up'].includes(purpose) && job.get('status') !== 'completed') return {
        skipped: true,
        reason: 'job-status-changed'
      };
      const consent = await tx.get(consentRef(companyId, customer.id)),
        phone = phoneE164(customer.get('phone'));
      if (!phone || consent.get('status') !== 'granted' || consent.get('phone') !== phone || !consent.get('purposes')?.includes(purpose)) return {
        skipped: true,
        reason: 'consent-required'
      };
      const [suppression, recipient] = await Promise.all([tx.get(ref('rlSmsSuppressions', hash(phone))), tx.get(ref('rlSmsRecipients', hash(phone)))]);
      if (suppression.get('blocked') || new Set((recipient.get('owners') || []).map(owner => owner.companyId)).size !== 1) return {
        skipped: true,
        reason: 'suppressed-or-ambiguous'
      };
      let reviewMetadata = {}, reviewBody = null;
      if (purpose === 'review-invitation') {
        const invitation = await tx.get(ref('rlReviewInvitations', documentId(reviewInvitation.invitationId, 'review invitation')));
        const token = new URLSearchParams(String(reviewInvitation.link || '').split('#')[1] || '').get('token');
        const expectedLink = `https://route-logistics.com/review#id=${invitation.id}&token=${token}`;
        if (reviewInvitation.link !== expectedLink || !/^[a-f0-9]{64}$/.test(token || '') || hash(token) !== reviewInvitation.invitationHash) return { skipped: true, reason: 'review-link-invalid' };
        reviewMetadata = { reviewInvitationId: invitation.id, reviewInvitationHash: reviewInvitation.invitationHash, reviewCompletionKey: invitation.get('completionKey') };
        if (!(await require('./reviewInvitations').reviewDeliveryEligible(tx, db, { ...reviewMetadata, companyId, customerId: customer.id, jobId: job.id, to: phone }, { now: now(), enabled: config.reviewInvitationsEnabled ? config.reviewInvitationsEnabled() : process.env.RL_REVIEW_INVITATIONS_ENABLED === 'true', channel: 'sms' }))) return { skipped: true, reason: 'review-delivery-not-authorized' };
        const name = String(company.get('name') || 'Your service provider').replace(/[\r\n<>]/g, ' ').slice(0, 80);
        reviewBody = `${name}: Please share honest feedback about your completed service. All ratings are welcome. ${reviewInvitation.link} Reply STOP to opt out, HELP for help.`;
      }
      const eventVersion = reviewInvitation ? `${reviewInvitation.invitationId}:${reviewInvitation.suffix}` : purpose === 'appointment-confirmation' || purpose === 'pre-visit' ? `${job.get('date')}:${job.get('time')}` : purpose;
      const pilotId = broadAllowed ? null : configuredPilotId();
      const pilotRef = pilotId ? ref('rlSmsPilots', pilotId) : null;
      const pilot = pilotRef ? await tx.get(pilotRef) : null;
      const id = purpose === 'review-invitation' ? require('./reviewInvitations').reviewSmsOutboxId(companyId, job.id, reviewInvitation.invitationId, reviewInvitation.suffix) : hash(`${companyId}:${job.id}:${purpose}:${eventVersion}${pilotId ? `:pilot:${pilotId}:${pilot.get('version')}` : ''}`),
        outbox = ref('rlSmsOutbox', id),
        old = await tx.get(outbox);
      if (pilotId && (registration.get('pilotApproved') !== true || !pilotEligible(pilot.data(), {
        companyId, customerId: customer.id, customer: customer.data(), phone,
        consent: consent.data(), suppression: suppression.data(), purpose, now: now(), dispatch: old.exists
      }))) return { skipped: true, reason: 'pilot-recipient-not-approved' };
      if (old.exists) return {
        queued: true,
        existing: true,
        id
      };
      const companyLimit = ref('rlSmsRateLimits', hash(`${companyId}:${Math.floor(now() / 86400000)}`)),
        phoneLimit = ref('rlSmsRateLimits', hash(`${phone}:${Math.floor(now() / 86400000)}`));
      const [companyCount, phoneCount] = await Promise.all([tx.get(companyLimit), tx.get(phoneLimit)]);
      if ((companyCount.get('count') || 0) >= 50 || (phoneCount.get('count') || 0) >= 5) return {
        skipped: true,
        reason: 'daily-limit'
      };
      if (pilotId) tx.update(pilotRef, { reservedMessages: pilot.get('reservedMessages') + 1, updatedAt: new Date(now()) });
      tx.set(companyLimit, {
        count: (companyCount.get('count') || 0) + 1,
        expiresAt: new Date(now() + 172800000)
      });
      tx.set(phoneLimit, {
        count: (phoneCount.get('count') || 0) + 1,
        expiresAt: new Date(now() + 172800000)
      });
      tx.create(outbox, {
        companyId,
        customerId: customer.id,
        jobId: job.id,
        purpose,
        to: phone,
        body: reviewBody || renderMessage(company.data(), settings, job.data(), purpose),
        status: 'queued',
        availableAt: now(),
        attempts: 0,
        createdAt: new Date(now()),
        expiresAt: new Date(now() + 7200000),
        actorId: actor?.uid || null,
        automatic,
        senderMode: sender.mode,
        senderReference: sender.reference,
        ...(pilotId ? { pilotId, pilotVersion: pilot.get('version') } : {}),
        consentVersion: consent.get('version'),
        jobSchedule: hash(`${job.get('date')}:${job.get('time')}`),
        ...reviewMetadata
      });
      tx.create(ref('rlSmsAudit', `${id}-queued`), {
        companyId,
        customerId: customer.id,
        jobId: job.id,
        purpose,
        event: 'queued',
        actorId: actor?.uid || null,
        createdAt: new Date(now())
      });
      return {
        queued: true,
        id
      };
    });
  }
  async function eligible(row, tx) {
    const data = row.data(),
      [customer, consent, settings, registration, suppression, recipient, job] = await Promise.all([tx.get(ref('customers', data.customerId)), tx.get(consentRef(data.companyId, data.customerId)), tx.get(settingsRef(data.companyId)), tx.get(ref('rlSmsSenderApprovals', data.companyId)), tx.get(ref('rlSmsSuppressions', hash(data.to))), tx.get(ref('rlSmsRecipients', hash(data.to))), tx.get(ref('jobs', data.jobId))]);
    const sender = approvedSender(registration, true);
    let deliveryAllowed = !data.pilotId && broadActive() && settings.get('enabled') === true
      && settings.get('purposes')?.includes(data.purpose) && (!data.automatic || registration.get('automationApproved') === true);
    if (data.pilotId && data.pilotId === configuredPilotId() && registration.get('pilotApproved') === true) {
      const pilot = await tx.get(ref('rlSmsPilots', data.pilotId));
      deliveryAllowed = data.pilotVersion === pilot.get('version') && pilotEligible(pilot.data(), {
        companyId: data.companyId, customerId: data.customerId, customer: customer.data(), phone: data.to,
        consent: consent.data(), suppression: suppression.data(), purpose: data.purpose, now: now(), dispatch: true
      });
    }
    if (!deliveryAllowed || !sender || (data.senderMode || 'messaging-service') !== sender.mode || data.senderReference !== undefined && data.senderReference !== sender.reference || customer.get('companyId') !== data.companyId || customer.get('isActive') === false || phoneE164(customer.get('phone')) !== data.to || consent.get('status') !== 'granted' || consent.get('phone') !== data.to || consent.get('version') !== data.consentVersion || !consent.get('purposes')?.includes(data.purpose) || suppression.get('blocked') || new Set((recipient.get('owners') || []).map(owner => owner.companyId)).size !== 1 || job.get('companyId') !== data.companyId || job.get('customerId') !== data.customerId || ['appointment-confirmation', 'pre-visit'].includes(data.purpose) && data.jobSchedule !== hash(`${job.get('date')}:${job.get('time')}`)) return false;
    if (data.purpose === 'review-invitation' && !(await require('./reviewInvitations').reviewDeliveryEligible(tx, db, data, { now: now(), enabled: config.reviewInvitationsEnabled ? config.reviewInvitationsEnabled() : process.env.RL_REVIEW_INVITATIONS_ENABLED === 'true', channel: 'sms' }))) return false;
    if (data.actorId) {
      const members = await tx.get(db.collection('teamMembers').where('companyId', '==', data.companyId).where('uid', '==', data.actorId).limit(5));
      const company = await tx.get(ref('companies', data.companyId));
      if (company.get('ownerId') !== data.actorId && !members.docs.some(member => member.get('status') === 'active' && ['manager', 'admin'].includes(member.get('role')))) return false;
    }
    return ['appointment-confirmation', 'pre-visit'].includes(data.purpose) ? appointmentNotificationEligible(job.data()) : data.purpose === 'en-route' ? job.get('status') === 'en-route' : job.get('status') === 'completed';
  }
  return {
    config: async request => {
      const companyId = documentId(request.data?.companyId, 'company'),
        company = await requireCompanyOwner(db, request, companyId);
      await rateLimit(db, 'sms-settings', request.auth.uid, 20);
      if (request.data.action === 'save') {
        const settings = cleanSettings(request.data.settings || {});
        await settingsRef(companyId).set({
          ...settings,
          updatedAt: new Date(now()),
          updatedBy: request.auth.uid
        });
      } else if (request.data.action !== 'status') throw new HttpsError('invalid-argument', 'Choose a settings action.');
      const pilotId = configuredPilotId();
      const [stored, registration, pilot] = await Promise.all([settingsRef(companyId).get(), ref('rlSmsSenderApprovals', companyId).get(), pilotId ? ref('rlSmsPilots', pilotId).get() : null]);
      return {
        settings: settingsData(stored),
        delivery: {
          enabled: enabled(),
          liveApproved: approved(),
          active: broadActive(),
          pilotEnabled: !!pilot && pilot.get('companyId') === companyId && pilot.get('testOnly') === true
            && pilot.get('status') === 'active' && time(pilot.get('createdAt')) <= now() && time(pilot.get('expiresAt')) > now(),
          senderApproved: registration.get('status') === 'approved',
          automationApproved: registration.get('automationApproved') === true
        },
        disclosure: disclosure(company.get('name') || 'Your service provider'),
        purposes: PURPOSES
      };
    },
    consent: async request => {
      const staff = await scope(request),
        customerId = documentId(request.data?.customerId, 'customer'),
        target = consentRef(staff.companyId, customerId),
        action = request.data?.action;
      await rateLimit(db, 'sms-consent', staff.uid, 30);
      const customer = await ref('customers', customerId).get();
      if (customer.get('companyId') !== staff.companyId) throw new HttpsError('permission-denied', 'Customer access denied.');
      const companyName = staff.company.get('name') || 'Your service provider',
        text = disclosure(companyName);
      if (action === 'status') {
        const old = await target.get(),
          phone = phoneE164(customer.get('phone')),
          suppression = phone ? await ref('rlSmsSuppressions', hash(phone)).get() : null,
          binding = phone ? await ref('rlSmsRecipients', hash(phone)).get() : null;
        const history = await db.collection('rlSmsOutbox').where('companyId', '==', staff.companyId).where('customerId', '==', customerId).orderBy('createdAt', 'desc').limit(20).get();
        return {
          consent: publicConsent(old.data()),
          suppressed: suppression?.get('blocked') === true,
          ambiguous: new Set((binding?.get('owners') || []).map(owner => owner.companyId)).size > 1,
          disclosure: text,
          purposes: PURPOSES,
          history: history.docs.map(row => ({
            id: row.id,
            purpose: row.get('purpose'),
            status: row.get('status'),
            createdAt: publicDate(row.get('createdAt')),
            failureCode: row.get('failureCode') || null
          }))
        };
      }
      if (!['grant', 'revoke'].includes(action)) throw new HttpsError('invalid-argument', 'Choose a consent action.');
      const savedConsent = action === 'revoke' ? await target.get() : null;
      const phone = phoneE164(customer.get('phone')) || savedConsent?.get('phone');
      if (!phone) throw new HttpsError('failed-precondition', 'Add a valid customer phone number with country code before recording SMS preferences.');
      const purposes = request.data.purposes,
        source = request.data.source,
        evidence = String(request.data.evidence || '').trim();
      if (action === 'grant' && (!Array.isArray(purposes) || !purposes.length || purposes.some(p => !PURPOSES.includes(p)) || !['written', 'web-form', 'verbal'].includes(source) || request.data.disclosureAccepted !== true || request.data.disclosure !== text || !evidence || evidence.length > 500)) throw new HttpsError('invalid-argument', 'Record the selected purposes, exact disclosure, consent source and evidence reference.');
      const result = await db.runTransaction(async tx => {
        const [previous, binding, suppression] = await Promise.all([tx.get(target), tx.get(ref('rlSmsRecipients', hash(phone))), tx.get(ref('rlSmsSuppressions', hash(phone)))]);
        if (action === 'grant' && suppression.get('blocked')) throw new HttpsError('failed-precondition', 'This number opted out. Staff cannot override STOP; the customer must reply START.');
        const version = (previous.get('version') || 0) + 1,
          data = action === 'grant' ? {
            companyId: staff.companyId,
            customerId,
            phone,
            status: 'granted',
            purposes: [...new Set(purposes)],
            source,
            evidence,
            disclosure: text,
            disclosureVersion: 1,
            grantedAt: new Date(now()),
            updatedAt: new Date(now()),
            actorId: staff.uid,
            version
          } : {
            ...(previous.data() || {}),
            companyId: staff.companyId,
            customerId,
            phone,
            status: 'revoked',
            revokedAt: new Date(now()),
            updatedAt: new Date(now()),
            actorId: staff.uid,
            version
          };
        const owners = [...(binding.get('owners') || []).filter(owner => !(owner.companyId === staff.companyId && owner.customerId === customerId)), {
          companyId: staff.companyId,
          customerId
        }];
        if (owners.length > 20) throw new HttpsError('failed-precondition', 'This phone requires an operator review before messaging.');
        tx.set(target, data);
        tx.set(ref('rlSmsRecipients', hash(phone)), {
          phone,
          owners,
          updatedAt: new Date(now())
        });
        tx.create(ref('rlSmsAudit', randomUUID()), {
          companyId: staff.companyId,
          customerId,
          event: `consent-${action}`,
          actorId: staff.uid,
          purposes: data.purposes || [],
          source: source || 'staff-revocation',
          disclosure: text,
          evidence: evidence || null,
          createdAt: new Date(now())
        });
        return {
          consent: publicConsent(data),
          ambiguous: new Set(owners.map(owner => owner.companyId)).size > 1,
          consentVersion: version
        };
      });
      await cancelQueued([['companyId', staff.companyId], ['customerId', customerId]], 'consent-changed', row => row.get('consentVersion') !== result.consentVersion);
      const { consentVersion, ...response } = result;
      return response;
    },
    queue: async request => {
      const staff = await scope(request, 'jobs.schedule');
      await rateLimit(db, 'sms-queue', staff.uid, 10);
      return queue(request.data?.jobId, request.data?.purpose, {
        actor: staff
      });
    },
    // Internal producer only. Public staff requests cannot supply trusted links.
    queueReviewInvitation: data => queue(data.jobId, 'review-invitation', { automatic: true, reviewInvitation: data }),
    reviewDeliveryEnabled: () => broadActive(),
    onJob: async (before, after, id) => {
      if (!active() || !after?.companyId) return {
        skipped: true
      };
      const purposes = [];
      if (appointmentNotificationEligible(after) && (!before || before.date !== after.date || before.time !== after.time)) purposes.push('appointment-confirmation');
      if (after.status !== before?.status && after.status === 'en-route') purposes.push('en-route');
      if (after.status !== before?.status && after.status === 'completed') purposes.push('service-completed');
      return Promise.all(purposes.map(purpose => queue(id, purpose, {
        automatic: true
      })));
    },
    schedule: async () => {
      if (!active()) return {
        skipped: true
      };
      const broadCompanies = broadActive() ? await db.collection('rlSmsSettings').where('enabled', '==', true).limit(25).get() : null;
      const companies = new Map((broadCompanies?.docs || []).map(row => [row.id, row]));
      const pilotId = configuredPilotId();
      if (pilotId) {
        const pilot = await ref('rlSmsPilots', pilotId).get();
        const companyId = pilot.get('companyId');
        if (pilot.get('status') === 'active' && typeof companyId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(companyId) && !companies.has(companyId)) companies.set(companyId, await settingsRef(companyId).get());
      }
      let queued = 0;
      for (const company of companies.values()) {
        const settings = settingsData(company),
          start = new Date(now() - 86400000).toISOString().slice(0, 10),
          end = new Date(now() + 172800000).toISOString().slice(0, 10);
        const jobs = await db.collection('jobs').where('companyId', '==', company.id).where('date', '>=', start).where('date', '<=', end).orderBy('date').limit(100).get();
        for (const job of jobs.docs) {
          const at = appointmentTime(job.data(), settings.timeZone);
          if (appointmentNotificationEligible(job.data()) && Number.isFinite(at) && at - now() >= 0 && at - now() <= settings.reminderMinutes * 60000) {
            const result = await queue(job.id, 'pre-visit', {
              automatic: true
            });
            if (result.queued && !result.existing) queued++;
          }
          if (job.get('status') === 'completed' && Number.isFinite(time(job.get('completedAt'))) && now() - time(job.get('completedAt')) >= settings.followUpMinutes * 60000 && now() - time(job.get('completedAt')) < settings.followUpMinutes * 60000 + 900000) {
            const result = await queue(job.id, 'service-follow-up', {
              automatic: true
            });
            if (result.queued && !result.existing) queued++;
          }
        }
      }
      return {
        queued
      };
    },
    drain: async transport => {
      if (!active()) return {
        skipped: true
      };
      const rows = await db.collection('rlSmsOutbox').where('status', 'in', ['queued', 'dispatching']).where('availableAt', '<=', now()).orderBy('availableAt').limit(10).get();
      let sent = 0;
      for (const row of rows.docs) {
        const lease = randomUUID();
        const message = await db.runTransaction(async tx => {
          const current = await tx.get(row.ref);
          if (current.get('availableAt') > now() || !['queued', 'dispatching'].includes(current.get('status'))) return null;
          if (current.get('status') === 'dispatching') {
            tx.update(row.ref, {
              status: 'uncertain',
              failureCode: 'dispatch-lease-expired'
            });
            return null;
          }
          if (time(current.get('expiresAt')) <= now() || !(await eligible(current, tx))) {
            tx.update(row.ref, {
              status: 'cancelled',
              failureCode: 'consent-or-job-changed'
            });
            return null;
          }
          tx.update(row.ref, {
            status: 'dispatching',
            lease,
            attempts: (current.get('attempts') || 0) + 1,
            availableAt: now() + 120000
          });
          return {
            id: row.id,
            ...current.data()
          };
        });
        if (!message) continue;
        const result = await transport.send(message);
        await db.runTransaction(async tx => {
          const current = await tx.get(row.ref);
          if (current.get('lease') !== lease || current.get('providerSid')) return;
          let status = result.state === 'accepted' ? 'accepted' : result.state === 'retry' && (current.get('attempts') || 0) < 5 ? 'queued' : result.state === 'uncertain' ? 'uncertain' : 'failed';
          if (result.code === '21610') tx.set(ref('rlSmsSuppressions', hash(message.to)), { blocked:true, reason:'provider-opt-out', providerCommand:'STOP', providerEventAt:new Date(now()), providerOrigin:'provider-rejection', updatedAt:new Date(now()) });
          tx.update(row.ref, {
            status,
            ...(result.sid ? {
              providerSid: result.sid
            } : {}),
            failureCode: result.code || null,
            availableAt: now() + 60000 * 2 ** (current.get('attempts') || 1),
            updatedAt: new Date(now())
          });
          tx.create(ref('rlSmsAudit', randomUUID()), {
            companyId: message.companyId,
            customerId: message.customerId,
            jobId: message.jobId,
            event: `provider-${status}`,
            failureCode: result.code || null,
            createdAt: new Date(now())
          });
        });
        if (result.code === '21610') await cancelQueued([['to', message.to]], 'provider-opt-out');
        if (result.state === 'accepted') sent++;
      }
      return {
        sent
      };
    },
    inbound: async (req, res) => {
      const body = req.body;
      if (req.method !== 'POST' || !verifySignature(inboundUrl, body, authToken(), req.get('X-Twilio-Signature')) || body.AccountSid !== accountSid()
        || (senderMode() === 'phone-number' ? !phoneE164(fromNumber()) || phoneE164(body.To) !== phoneE164(fromNumber()) : senderMode() !== 'messaging-service' || body.MessagingServiceSid !== serviceSid())) return res.status(403).send('Forbidden');
      const phone = phoneE164(body.From),
        sid = body.MessageSid;
      if (!phone || !/^SM[a-fA-F0-9]{32}$/.test(sid || '')) return res.status(400).send('Invalid message');
      await applyOptOut({ phone, sid, command: body.OptOutType || body.Body, origin: 'signed-inbound' });
      // Provider opt-out handling stays on the approved sender/service.
      // Never send a second automatic reply from this callback.
      return res.type('text/xml').status(200).send('<Response/>');
    },
    status: async (req, res) => {
      const id = String(req.query?.id || '');
      if (req.method !== 'POST' || !/^[a-f0-9]{64}$/.test(id) || !verifySignature(`${statusUrl}?id=${id}`, req.body, authToken(), req.get('X-Twilio-Signature')) || req.body.AccountSid !== accountSid()) return res.status(403).send('Forbidden');
      const sid = req.body.MessageSid,
        status = req.body.MessageStatus;
      if (!/^SM[a-fA-F0-9]{32}$/.test(sid || '') || !['accepted', 'queued', 'sending', 'sent', ...TERMINAL].includes(status)) return res.status(400).send('Invalid status');
      const optedOutPhone = await db.runTransaction(async tx => {
        const target = ref('rlSmsOutbox', id),
          row = await tx.get(target);
        if (!row.exists || phoneE164(req.body.To) !== row.get('to') || row.get('providerSid') && row.get('providerSid') !== sid) return;
        if (row.get('senderMode') === 'phone-number' && phoneE164(req.body.From) !== row.get('senderReference')) return;
        const eventRef = ref('rlSmsStatusEvents', hash(`${sid}:${status}:${req.body.ErrorCode || ''}`)),
          old = await tx.get(eventRef);
        const providerOptOut = ['failed', 'undelivered'].includes(status) && req.body.ErrorCode === '21610';
        if (old.exists) return providerOptOut ? row.get('to') : null;
        const rank = {
          accepted: 0,
          queued: 1,
          sending: 2,
          sent: 3,
          delivered: 5,
          undelivered: 4,
          failed: 4,
          canceled: 4
        };
        if (row.get('status') !== 'delivered' && (rank[row.get('status')] == null || rank[status] >= rank[row.get('status')])) tx.update(target, {
          providerSid: sid,
          status,
          failureCode: /^\d{1,8}$/.test(req.body.ErrorCode || '') ? req.body.ErrorCode : null,
          updatedAt: new Date(now())
        });
        if (providerOptOut) tx.set(ref('rlSmsSuppressions', hash(row.get('to'))), {
          blocked: true, reason: 'provider-opt-out', providerCommand: 'STOP',
          providerEventAt: new Date(now()), providerOrigin: 'signed-status', providerEventId: sid,
          updatedAt: new Date(now())
        });
        tx.create(eventRef, {
          companyId: row.get('companyId'),
          outboxId: id,
          status,
          createdAt: new Date(now())
        });
        tx.create(ref('rlSmsAudit', randomUUID()), {
          companyId: row.get('companyId'),
          customerId: row.get('customerId'),
          event: `delivery-${status}`,
          createdAt: new Date(now())
        });
        return providerOptOut ? row.get('to') : null;
      });
      if (optedOutPhone) await cancelQueued([['to', optedOutPhone]], 'provider-opt-out');
      return res.status(200).send('OK');
    },
    // Internal provider adapter hook; never exported as an unauthenticated callable.
    applyOptOut
  };
}
module.exports = {
  smsHandlers,
  PURPOSES,
  DEFAULT_SETTINGS,
  disclosure,
  cleanSettings,
  renderMessage,
  appointmentTime,
  appointmentNotificationEligible
};
