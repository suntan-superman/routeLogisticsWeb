const { validateRequest, getExpectedTwilioSignature } = require('twilio');

// Twilio signs the exact public URL followed by sorted form keys and values.
// URLs come from deployment configuration, never an untrusted Host header.
function signature(url, params, token) {
  return getExpectedTwilioSignature(token, url, params);
}
function verifySignature(url, params, token, supplied) {
  if (!token || typeof supplied !== 'string' || !params || typeof params !== 'object' || Array.isArray(params)
    || Object.values(params).some(value => typeof value !== 'string') || Object.keys(params).length > 100) return false;
  return validateRequest(token, supplied, url, params);
}
function phoneE164(value) {
  if (typeof value !== 'string' || /[a-z]/i.test(value)) return null;
  let cleaned = value.trim().replace(/[().\s-]/g, '');
  if (/^\d{10}$/.test(cleaned)) cleaned = '+1' + cleaned;
  else if (/^1\d{10}$/.test(cleaned)) cleaned = '+' + cleaned;
  return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
}
function createTwilioTransport({ accountSid, authToken, messagingServiceSid, statusUrl, fetchImpl = fetch }) {
  if (!/^AC[a-fA-F0-9]{32}$/.test(accountSid || '') || !authToken || !/^MG[a-fA-F0-9]{32}$/.test(messagingServiceSid || '')) throw new Error('Configure the Route Logistics Twilio secrets before enabling delivery.');
  return {
    async send(message) {
      let response;
      try {
        response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: message.to, MessagingServiceSid: messagingServiceSid, Body: message.body, StatusCallback: `${statusUrl}?id=${message.id}` }),
          signal: AbortSignal.timeout(15000), redirect: 'error',
        });
      } catch {
        // A timeout may occur after Twilio accepted the request. Never blindly
        // retry an ambiguous create; its signed callback can resolve the row.
        return { state: 'uncertain', code: 'provider-response-unknown' };
      }
      let data; try { data = await response.json(); } catch { data = {}; }
      if (response.ok && /^SM[a-fA-F0-9]{32}$/.test(data.sid || '')) return { state: 'accepted', sid: data.sid };
      if (response.status === 429) return { state: 'retry', code: String(data.code || 'provider-rate-limit') };
      if (response.status >= 500 || response.ok) return { state: 'uncertain', code: 'provider-response-unknown' };
      return { state: 'failed', code: String(data.code || `http-${response.status}`).slice(0, 50) };
    },
  };
}
module.exports = { signature, verifySignature, phoneE164, createTwilioTransport };
