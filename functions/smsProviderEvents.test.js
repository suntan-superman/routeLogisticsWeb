const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { getExpectedTwilioSignature } = require('twilio');
const { createSmsProviderEventsHandler } = require('./smsProviderEvents');

const accountSid = 'AC' + '1'.repeat(32), token = 'synthetic-signing-token';
const sender = '+18885550100', phone = '+16615550101', url = 'https://example.invalid/rlSmsProviderEvents';
const makeEvent = (command = 'STOP', overrides = {}) => ({
  specversion: '1.0', type: 'com.twilio.messaging.inbound-message.received',
  id: 'EZ' + '3'.repeat(32), dataschema: 'https://events-schemas.twilio.com/Messaging.InboundMessageV1/8',
  data: { accountSid, from: phone, to: sender, messageSid: 'SM' + '2'.repeat(32), timestamp: '2026-11-14T19:00:00.000Z', optOutType: command, body: command, ...overrides },
});
function fixture(apply) {
  const calls = [], logs = [];
  const handler = createSmsProviderEventsHandler({ applyOptOut: apply || (async event => { calls.push(event); return {}; }), accountSid: () => accountSid, authToken: () => token, fromNumber: () => sender, url, log: row => logs.push(row) });
  const request = (events, modify) => {
    const raw = JSON.stringify(events), hash = createHash('sha256').update(raw).digest('hex');
    const req = { method: 'POST', query: { bodySHA256: hash }, originalUrl: '/rlSmsProviderEvents?bodySHA256=' + hash, rawBody: Buffer.from(raw), get: () => getExpectedTwilioSignature(token, url + '?bodySHA256=' + hash, {}) };
    modify?.(req);
    return req;
  };
  const send = async (events, modify) => {
    const res = { code: 200, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; } };
    await handler(request(events, modify), res); return res;
  };
  return { calls, logs, handler, send };
}

test('genuine JSON signatures and body hash protect the reducer; raw-body tampering and form signatures are rejected', async () => {
  const f = fixture(), event = makeEvent();
  assert.equal((await f.send([event])).code, 200);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0], { phone, sid: event.data.messageSid, command: 'STOP', eventTime: Date.parse(event.data.timestamp), origin: 'twilio-event-streams', providerEventId: event.id });
  for (const alter of [req => { req.rawBody = Buffer.from(JSON.stringify([makeEvent('START')])); }, req => { req.get = () => 'bad'; }, req => { delete req.rawBody; }, req => { req.query.extra = 'value'; }, req => { req.originalUrl += '&extra=value'; }, req => { req.method = 'GET'; }]) assert.equal((await f.send([event], alter)).code, 403);
  assert.equal(f.calls.length, 1);
});

test('the configured destination is trusted, while Host headers cannot redirect signature verification', async () => {
  const f = fixture();
  assert.equal((await f.send([makeEvent()], req => { const get = req.get; req.get = name => name === 'Host' ? 'attacker.invalid' : get(name); })).code, 200);
  assert.throws(() => createSmsProviderEventsHandler({ applyOptOut() {}, url: 'http://example.invalid/events' }), /HTTPS/);
  assert.throws(() => createSmsProviderEventsHandler({ applyOptOut() {}, url: url + '?secret=value' }), /HTTPS/);
});

test('wrong account, wrong receiving sender, old or untrusted schema, normal messages and HELP cannot change provider state', async () => {
  const f = fixture(), old = makeEvent(), untrusted = makeEvent(), normal = makeEvent();
  old.dataschema = 'https://events-schemas.twilio.com/Messaging.InboundMessageV1/4';
  untrusted.dataschema = 'https://attacker.invalid/Messaging.InboundMessageV1/8';
  delete normal.data.optOutType;
  assert.equal((await f.send([makeEvent('STOP', { accountSid: 'AC' + '9'.repeat(32) }), makeEvent('STOP', { to: '+18885550999' }), old, untrusted, normal, makeEvent('HELP')])).code, 200);
  assert.equal(f.calls.length, 0);
});

test('toll-free START/UNSTOP may clear only the provider gate; YES and SUBSCRIBE never substitute for a carrier opt-in', async () => {
  const f = fixture();
  for (const body of ['YES', 'SUBSCRIBE', 'START please']) assert.equal((await f.send([makeEvent('START', { body })])).code, 200);
  assert.equal(f.calls.length, 0);
  for (const body of ['START', ' unstop ']) assert.equal((await f.send([makeEvent('START', { body })])).code, 200);
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(row => row.command === 'START'));
  assert.ok(f.calls.every(row => !Object.hasOwn(row, 'consent') && !Object.hasOwn(row, 'body')));
});

test('batch processing orders provider timestamps, puts STOP last on ties and drops repeated message IDs within the batch', async () => {
  const f = fixture(), later = makeEvent('START', { messageSid: 'SM' + '4'.repeat(32), timestamp: '2026-11-14T19:01:00.000Z' });
  const stop = makeEvent('STOP', { messageSid: 'SM' + '5'.repeat(32), timestamp: later.data.timestamp });
  assert.equal((await f.send([stop, later, makeEvent(), makeEvent()])).code, 200);
  assert.deepEqual(f.calls.map(row => row.command), ['STOP', 'START', 'STOP']);
  assert.deepEqual(f.logs.at(-1), { event: 'rl-sms-provider-events', received: 4, processed: 3, ignored: 1 });
});

test('unregistered RL recipients stay ignored, and transient reducer failures request a safe provider retry without logging payloads', async () => {
  const ignored = fixture(async () => ({ ignored: true }));
  assert.equal((await ignored.send([makeEvent()])).code, 200);
  assert.equal(ignored.logs.at(-1).processed, 0);
  const failed = fixture(async () => { throw Error('private provider body and credentials'); });
  assert.equal((await failed.send([makeEvent()])).code, 500);
  assert.equal(failed.logs.at(-1).retry, true);
  assert.doesNotMatch(JSON.stringify(failed.logs), /private|credentials|16615550101|synthetic|body/);
});

test('authenticated sink test events are acknowledged without invoking the opt-out reducer', async () => {
  const f = fixture();
  assert.equal((await f.send([{ type: 'com.twilio.events.test', id: 'test' }])).code, 200);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.send(makeEvent())).code, 400);
});

test('relevant events without a valid timestamp request retry instead of silently applying an unordered opt-in', async () => {
  const f = fixture();
  assert.equal((await f.send([makeEvent('START', { timestamp: 'invalid' })])).code, 500);
  assert.equal(f.calls.length, 0);
});
