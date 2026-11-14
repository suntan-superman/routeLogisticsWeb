const { createHash } = require('node:crypto');
const PILOT_PURPOSES = ['appointment-confirmation', 'pre-visit', 'en-route', 'service-completed'];
const time = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value || '');
const phoneHash = value => createHash('sha256').update(value).digest('hex');

// This operator-managed document is never writable through company settings or
// a customer preference. It grants a temporary exception for one test recipient.
function pilotEligible(pilot, { companyId, customerId, customer, phone, consent, suppression, purpose, now, dispatch = false }) {
  if (!pilot || pilot.status !== 'active' || pilot.testOnly !== true || pilot.companyId !== companyId || pilot.customerId !== customerId
    || !customer || customer.companyId !== companyId || customer.isTestRecord !== true || customer.smsPilotOnly !== true
    || !/^\+[1-9]\d{7,14}$/.test(phone || '') || pilot.phoneHash !== phoneHash(phone)
    || !Number.isInteger(pilot.version) || pilot.version < 1) return false;
  const created = time(pilot.createdAt), expires = time(pilot.expiresAt);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || created > now || expires <= now || expires <= created || expires - created > 86400000) return false;
  if (!Array.isArray(pilot.purposes) || pilot.purposes.length !== PILOT_PURPOSES.length
    || !PILOT_PURPOSES.every(value => pilot.purposes.includes(value)) || !PILOT_PURPOSES.includes(purpose)
    || !Number.isInteger(pilot.maxMessages) || pilot.maxMessages < 1 || pilot.maxMessages > 4
    || !Number.isInteger(pilot.reservedMessages) || pilot.reservedMessages < 0
    || (dispatch ? pilot.reservedMessages < 1 || pilot.reservedMessages > pilot.maxMessages : pilot.reservedMessages >= pilot.maxMessages)) return false;
  // A carrier START is necessary for this shared-sender pilot, but is never
  // evidence of Route Logistics consent. Both independent records must exist.
  if (!consent || consent.companyId !== companyId || consent.customerId !== customerId || consent.status !== 'granted' || consent.phone !== phone
    || !consent.purposes?.includes(purpose) || consent.disclosureVersion !== 1 || !consent.disclosure
    || !['written', 'web-form', 'verbal'].includes(consent.source) || !String(consent.evidence || '').trim()
    || !Number.isFinite(time(consent.grantedAt)) || time(consent.grantedAt) < created) return false;
  return suppression?.blocked === false && suppression.providerOrigin === 'twilio-event-streams'
    && suppression.providerCommand === 'START' && Number.isFinite(time(suppression.providerEventAt))
    && time(suppression.providerEventAt) >= created;
}

module.exports = { PILOT_PURPOSES, pilotEligible };
