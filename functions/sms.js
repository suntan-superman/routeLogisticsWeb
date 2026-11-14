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
const PURPOSES = ['appointment-confirmation', 'pre-visit', 'en-route', 'service-completed', 'service-follow-up'];
const DEFAULT_TEMPLATES = {
  'appointment-confirmation': 'Your service appointment is confirmed for {date} {time}.',
  'pre-visit': 'Reminder: your service appointment is scheduled for {date} {time}.',
  'en-route': 'Your service technician is on the way.',
  'service-completed': 'Your scheduled service visit is complete. Contact us if you need help.',
  'service-follow-up': 'Following up on your recent service visit. Contact us if you need help.'
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
const disclosure = company => `I agree to receive ${company} service text messages for the purposes selected below. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase. Optional follow-up messages require separate consent.`;
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
  const active = () => enabled() === true && approved() === true;
  const inboundUrl = config.inboundUrl || 'https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsInbound';
  const statusUrl = config.statusUrl || 'https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsStatus';
  const accountSid = config.accountSid || (() => ''),
    authToken = config.authToken || (() => ''),
    serviceSid = config.messagingServiceSid || (() => '');
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
  async function queue(jobId, purpose, {
    actor = null,
    automatic = false
  } = {}) {
    if (!active()) return {
      skipped: true,
      reason: 'delivery-disabled'
    };
    if (!PURPOSES.includes(purpose)) throw new HttpsError('invalid-argument', 'Unsupported SMS purpose.');
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
      // Producers have no provider secrets. The worker rechecks this operator
      // approval against its bound Messaging Service immediately before sending.
      if (!company.exists || !settings.enabled || !settings.purposes.includes(purpose) || registration.get('status') !== 'approved' || !/^MG[a-fA-F0-9]{32}$/.test(registration.get('messagingServiceSid') || '') || automatic && registration.get('automationApproved') !== true) return {
        skipped: true,
        reason: 'company-delivery-not-approved'
      };
      if (customer.get('companyId') !== companyId || customer.get('isActive') === false) return {
        skipped: true,
        reason: 'customer-unavailable'
      };
      if (['appointment-confirmation', 'pre-visit'].includes(purpose) && job.get('status') !== 'scheduled' || purpose === 'en-route' && job.get('status') !== 'en-route' || ['service-completed', 'service-follow-up'].includes(purpose) && job.get('status') !== 'completed') return {
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
      const eventVersion = purpose === 'appointment-confirmation' || purpose === 'pre-visit' ? `${job.get('date')}:${job.get('time')}` : purpose;
      const id = hash(`${companyId}:${job.id}:${purpose}:${eventVersion}`),
        outbox = ref('rlSmsOutbox', id),
        old = await tx.get(outbox);
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
        body: renderMessage(company.data(), settings, job.data(), purpose),
        status: 'queued',
        availableAt: now(),
        attempts: 0,
        createdAt: new Date(now()),
        expiresAt: new Date(now() + 7200000),
        actorId: actor?.uid || null,
        automatic,
        consentVersion: consent.get('version'),
        jobSchedule: hash(`${job.get('date')}:${job.get('time')}`)
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
    if (!settings.get('enabled') || registration.get('status') !== 'approved' || registration.get('messagingServiceSid') !== serviceSid() || data.automatic && registration.get('automationApproved') !== true || !settings.get('purposes')?.includes(data.purpose) || customer.get('companyId') !== data.companyId || customer.get('isActive') === false || phoneE164(customer.get('phone')) !== data.to || consent.get('status') !== 'granted' || consent.get('phone') !== data.to || consent.get('version') !== data.consentVersion || !consent.get('purposes')?.includes(data.purpose) || suppression.get('blocked') || new Set((recipient.get('owners') || []).map(owner => owner.companyId)).size !== 1 || job.get('companyId') !== data.companyId || job.get('customerId') !== data.customerId || ['appointment-confirmation', 'pre-visit'].includes(data.purpose) && data.jobSchedule !== hash(`${job.get('date')}:${job.get('time')}`)) return false;
    if (data.actorId) {
      const members = await tx.get(db.collection('teamMembers').where('companyId', '==', data.companyId).where('uid', '==', data.actorId).limit(5));
      const company = await tx.get(ref('companies', data.companyId));
      if (company.get('ownerId') !== data.actorId && !members.docs.some(member => member.get('status') === 'active' && ['manager', 'admin'].includes(member.get('role')))) return false;
    }
    return ['appointment-confirmation', 'pre-visit'].includes(data.purpose) ? job.get('status') === 'scheduled' : data.purpose === 'en-route' ? job.get('status') === 'en-route' : job.get('status') === 'completed';
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
      const [stored, registration] = await Promise.all([settingsRef(companyId).get(), ref('rlSmsSenderApprovals', companyId).get()]);
      return {
        settings: settingsData(stored),
        delivery: {
          enabled: enabled(),
          liveApproved: approved(),
          active: active(),
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
      return db.runTransaction(async tx => {
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
          ambiguous: new Set(owners.map(owner => owner.companyId)).size > 1
        };
      });
    },
    queue: async request => {
      const staff = await scope(request, 'jobs.schedule');
      await rateLimit(db, 'sms-queue', staff.uid, 10);
      return queue(request.data?.jobId, request.data?.purpose, {
        actor: staff
      });
    },
    onJob: async (before, after, id) => {
      if (!active() || !after?.companyId) return {
        skipped: true
      };
      const purposes = [];
      if (after.status === 'scheduled' && (!before || before.date !== after.date || before.time !== after.time)) purposes.push('appointment-confirmation');
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
      const companies = await db.collection('rlSmsSettings').where('enabled', '==', true).limit(25).get();
      let queued = 0;
      for (const company of companies.docs) {
        const settings = settingsData(company),
          start = new Date(now() - 86400000).toISOString().slice(0, 10),
          end = new Date(now() + 172800000).toISOString().slice(0, 10);
        const jobs = await db.collection('jobs').where('companyId', '==', company.id).where('date', '>=', start).where('date', '<=', end).orderBy('date').limit(100).get();
        for (const job of jobs.docs) {
          const at = appointmentTime(job.data(), settings.timeZone);
          if (job.get('status') === 'scheduled' && Number.isFinite(at) && at - now() >= 0 && at - now() <= settings.reminderMinutes * 60000) {
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
          if (result.code === '21610') tx.set(ref('rlSmsSuppressions', hash(message.to)), { blocked:true, reason:'provider-opt-out', updatedAt:new Date(now()) });
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
        if (result.state === 'accepted') sent++;
      }
      return {
        sent
      };
    },
    inbound: async (req, res) => {
      const body = req.body;
      if (req.method !== 'POST' || !verifySignature(inboundUrl, body, authToken(), req.get('X-Twilio-Signature')) || body.AccountSid !== accountSid() || body.MessagingServiceSid !== serviceSid()) return res.status(403).send('Forbidden');
      const phone = phoneE164(body.From),
        sid = body.MessageSid;
      if (!phone || !/^SM[a-fA-F0-9]{32}$/.test(sid || '')) return res.status(400).send('Invalid message');
      const command = String(body.OptOutType || body.Body || '').trim().toUpperCase();
      if (!['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT', 'START', 'UNSTOP', 'YES', 'HELP', 'INFO'].includes(command)) return res.type('text/xml').status(200).send('<Response/>');
      await db.runTransaction(async tx => {
        const eventRef = ref('rlSmsInboundEvents', sid),
          [event, binding] = await Promise.all([tx.get(eventRef), tx.get(ref('rlSmsRecipients', hash(phone)))]);
        if (event.exists) return;
        const owners = binding.get('owners') || [],
          ambiguous = new Set(owners.map(owner => owner.companyId)).size !== 1;
        const start = ['START', 'UNSTOP', 'YES'].includes(command),
          help = ['HELP', 'INFO'].includes(command);
        const consents = await Promise.all(owners.map(owner => tx.get(consentRef(owner.companyId, owner.customerId))));
        if (!help) {
          tx.set(ref('rlSmsSuppressions', hash(phone)), {
            blocked: !start || ambiguous,
            reason: ambiguous && start ? 'ambiguous-shared-number' : start ? 'customer-start' : 'customer-stop',
            updatedAt: new Date(now()),
            providerEventId: sid
          });
          for (let i = 0; i < consents.length; i++) {
            const consent = consents[i];
            if (!consent.exists || consent.get('phone') !== phone) continue;
            if (!start) tx.update(consent.ref, {
              status: 'stopped',
              updatedAt: new Date(now()),
              version: (consent.get('version') || 0) + 1
            });else if (!ambiguous && consent.get('status') === 'stopped') tx.update(consent.ref, {
              status: 'granted',
              source: 'customer-start',
              updatedAt: new Date(now()),
              version: (consent.get('version') || 0) + 1
            });
          }
        }
        tx.create(eventRef, {
          phoneHash: hash(phone),
          command,
          ambiguous,
          createdAt: new Date(now())
        });
        for (const owner of owners) tx.create(ref('rlSmsAudit', hash(`${sid}:${owner.companyId}:${owner.customerId}`)), {
          ...owner,
          event: `customer-${help ? 'help' : start ? 'start' : 'stop'}`,
          ambiguous,
          createdAt: new Date(now())
        });
      });
      // Advanced Opt-Out on the approved Messaging Service supplies provider
      // STOP/START/HELP acknowledgements. Never send a second automatic reply.
      return res.type('text/xml').status(200).send('<Response/>');
    },
    status: async (req, res) => {
      const id = String(req.query?.id || '');
      if (req.method !== 'POST' || !/^[a-f0-9]{64}$/.test(id) || !verifySignature(`${statusUrl}?id=${id}`, req.body, authToken(), req.get('X-Twilio-Signature')) || req.body.AccountSid !== accountSid()) return res.status(403).send('Forbidden');
      const sid = req.body.MessageSid,
        status = req.body.MessageStatus;
      if (!/^SM[a-fA-F0-9]{32}$/.test(sid || '') || !['accepted', 'queued', 'sending', 'sent', ...TERMINAL].includes(status)) return res.status(400).send('Invalid status');
      await db.runTransaction(async tx => {
        const target = ref('rlSmsOutbox', id),
          row = await tx.get(target);
        if (!row.exists || phoneE164(req.body.To) !== row.get('to') || row.get('providerSid') && row.get('providerSid') !== sid) return;
        const eventRef = ref('rlSmsStatusEvents', hash(`${sid}:${status}:${req.body.ErrorCode || ''}`)),
          old = await tx.get(eventRef);
        if (old.exists) return;
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
      });
      return res.status(200).send('OK');
    }
  };
}
module.exports = {
  smsHandlers,
  PURPOSES,
  DEFAULT_SETTINGS,
  disclosure,
  cleanSettings,
  renderMessage,
  appointmentTime
};
