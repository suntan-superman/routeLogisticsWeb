const { validateRequestWithBody } = require('twilio');
const { phoneE164 } = require('./smsProvider');

const INBOUND_TYPE = 'com.twilio.messaging.inbound-message.received';
const DEFAULT_URL = 'https://us-central1-mi-factotum-field-service.cloudfunctions.net/rlSmsProviderEvents';
const schemaVersion = value => String(value || '').match(/^https:\/\/events-schemas\.twilio\.com\/Messaging\.InboundMessageV1\/(\d+)$/)?.[1];

// Event Streams is additive: it does not change the shared number's Merxus
// inbound webhook. Only Twilio's classified, signed opt-out events reach the
// consent reducer. Neither raw messages nor unrelated recipients are logged.
function createSmsProviderEventsHandler({ applyOptOut, accountSid = () => '', authToken = () => '', fromNumber = () => '', url = DEFAULT_URL, log = () => {} }) {
  if (typeof applyOptOut !== 'function') throw new Error('Configure the SMS opt-out reducer.');
  const destination = new URL(url);
  if (destination.protocol !== 'https:' || destination.search || destination.hash || destination.username || destination.password) throw new Error('Configure an HTTPS Event Streams destination without credentials or a query string.');
  return async (req, res) => {
    const token = authToken(), expectedAccount = accountSid(), expectedSender = phoneE164(fromNumber());
    const hash = req.query?.bodySHA256;
    const raw = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : typeof req.rawBody === 'string' ? req.rawBody : null;
    const query = typeof hash === 'string' && /^[a-fA-F0-9]{64}$/.test(hash) ? `bodySHA256=${hash}` : null;
    const requestUrl = req.originalUrl || req.url;
    const originalQuery = typeof requestUrl === 'string' ? requestUrl.split('?').slice(1).join('?') : query;
    let valid = false;
    if (req.method === 'POST' && token && /^AC[a-fA-F0-9]{32}$/.test(expectedAccount) && expectedSender && raw !== null && Buffer.byteLength(raw) <= 1048576 && query && Object.keys(req.query || {}).length === 1 && originalQuery === query) {
      try { valid = validateRequestWithBody(token, req.get('X-Twilio-Signature'), `${url}?${query}`, raw); } catch { /* Invalid requests cannot change consent. */ }
    }
    if (!valid) return res.status(403).send('Forbidden');
    let events;
    try { events = JSON.parse(raw); } catch { return res.status(400).send('Invalid event batch'); }
    if (!Array.isArray(events) || events.length > 1000) return res.status(400).send('Invalid event batch');
    const candidates = [];
    for (const event of events) {
      if (!event || event.type !== INBOUND_TYPE || Number(schemaVersion(event.dataschema)) < 5 || !schemaVersion(event.dataschema)) continue;
      let data = event.data;
      if (typeof data === 'string') { try { data = JSON.parse(data); } catch { continue; } }
      if (!data || data.accountSid !== expectedAccount || phoneE164(data.to) !== expectedSender) continue;
      const command = data.optOutType;
      if (!['STOP', 'START'].includes(command)) continue;
      // YES may clear an Advanced Opt-Out preference but cannot undo the
      // underlying toll-free carrier block. Only START/UNSTOP clear that gate.
      if (command === 'START' && !['START', 'UNSTOP'].includes(String(data.body || '').trim().toUpperCase())) continue;
      const phone = phoneE164(data.from), sid = data.messageSid;
      if (!phone || !/^SM[a-fA-F0-9]{32}$/.test(sid || '')) continue;
      const eventTime = Date.parse(data.timestamp || event.time || '');
      if (!Number.isFinite(eventTime)) {
        log({ event: 'rl-sms-provider-events', received: events.length, invalidTimestamp: 1 });
        return res.status(500).send('Retry event processing');
      }
      candidates.push({ phone, sid, command, eventTime, origin: 'twilio-event-streams', ...(typeof event.id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(event.id) ? { providerEventId: event.id } : {}) });
    }
    // Ordering inside this batch reduces work; the transactional reducer also
    // orders and deduplicates across retries, batches and inbound callbacks.
    candidates.sort((a, b) => a.eventTime - b.eventTime || (a.command === b.command ? 0 : a.command === 'STOP' ? 1 : -1));
    let processed = 0, ignored = events.length - candidates.length;
    const seen = new Set();
    try {
      for (const event of candidates) {
        if (seen.has(event.sid)) { ignored++; continue; }
        seen.add(event.sid);
        const result = await applyOptOut(event);
        if (result?.ignored) ignored++; else processed++;
      }
    } catch {
      // Do not return the provider body, token, recipient or reducer error.
      log({ event: 'rl-sms-provider-events', received: events.length, processed, retry: true });
      return res.status(500).send('Retry event processing');
    }
    log({ event: 'rl-sms-provider-events', received: events.length, processed, ignored });
    return res.status(200).send('OK');
  };
}

module.exports = { createSmsProviderEventsHandler };
