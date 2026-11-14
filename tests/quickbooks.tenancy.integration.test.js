const { test: nodeTest, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { createHmac } = require('node:crypto');
const req = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app'), { getFirestore } = req('firebase-admin/firestore');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');
const { quickBooksHandlers, mappingId } = require('../functions/quickbooks');
let app, db, rules, sequence = 0;
const test = (name, run) => nodeTest(name, { timeout: 30000 }, run);
const connected = result => result?.status === 303 && new URL(result.location).searchParams.get('connected') === '1';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
before(async () => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local emulator required; production access is prohibited.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'qb-tenancy-tests'); db = getFirestore(app);
  rules = await initializeTestEnvironment({ projectId: 'demo-routelogistics', firestore: { rules: fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8') } });
});
after(async () => { await rules?.cleanup(); await deleteApp(app); });

async function fixture({ connect = true } = {}) {
  const prefix = `qb-tenancy-${++sequence}`, calls = [], gates = {}, identities = {};
  const env = { currentClientId: 'dedicated-platform-development-client', environment: 'sandbox', credentialEnvironment: 'sandbox', productionApproved: false, refreshFailure: false, revokeFailure: false, revokeTimeout: false, companyInfoFailure: false, companyInfoMalformed: false, tokenCount: 0, refreshCount: 0 };
  const config = { enabled: () => true, environment: () => env.environment, credentialEnvironment: () => env.credentialEnvironment, productionApproved: () => env.productionApproved, writesEnabled: () => false, clientId: () => env.currentClientId, clientSecret: () => 'fixture-platform-secret', redirectUri: () => 'https://example.invalid/rlQuickBooksOAuthCallback', appUrl: () => 'https://example.invalid', webhookSecret: () => 'fixture-platform-verifier' };
  const transport = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body, authorization: options.headers.Authorization });
    if (url.includes('/tokens/bearer')) {
      const fields = new URLSearchParams(options.body);
      if (fields.get('grant_type') === 'refresh_token') { env.refreshCount++; if (gates.refresh) await gates.refresh(fields); if (env.refreshFailure) return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'Synthetic invalidated grant' }) }; }
      else if (gates.exchange) await gates.exchange(fields);
      const version = ++env.tokenCount;
      return { ok: true, json: async () => ({ access_token: `fixture-access-${prefix}-${version}`, refresh_token: `fixture-refresh-${prefix}-${version}`, expires_in: 3600, x_refresh_token_expires_in: 8640000 }) };
    }
    if (url.includes('/tokens/revoke')) { if (gates.revoke) await gates.revoke(); if (env.revokeTimeout) throw new DOMException('Synthetic provider deadline', 'TimeoutError'); return env.revokeFailure ? { ok: false, status: 400, json: async () => ({ error: 'invalid_token' }) } : new Response('', { status: 200 }); }
    const match = new URL(url).pathname.match(/\/v3\/company\/(\d+)\/(\w+)(?:\/(\d+))?/), realm = match?.[1], type = match?.[2], id = match?.[3] || '77';
    if (type === 'companyinfo') {
      assert.equal(new URL(url).hostname, env.environment === 'production' ? 'quickbooks.api.intuit.com' : 'sandbox-quickbooks.api.intuit.com');
      assert.equal(id, realm, 'Company metadata request must use the authorized realm in its resource path.');
      return env.companyInfoFailure ? { ok: false, status: 401, json: async () => ({ error: 'fixture-token-not-valid-for-this-environment' }) } : { ok: true, json: async () => ({ CompanyInfo: env.companyInfoMalformed ? { Id: '', CompanyName: '' } : { Id: '1', CompanyName: `Controlled sandbox ${realm}`, Country: 'US' } }) };
    }
    if (type === 'invoice') return { ok: true, json: async () => ({ Invoice: { Id: id, SyncToken: '1', TotalAmt: 20, Balance: 0, CurrencyRef: { value: 'USD' }, CustomerRef: { value: '5' } } }) };
    if (type === 'payment') return { ok: true, json: async () => ({ Payment: { Id: id, SyncToken: '1', TotalAmt: 20, TxnDate: '2026-11-14', CurrencyRef: { value: 'USD' }, CustomerRef: { value: '5' }, Line: [{ Amount: 20, LinkedTxn: [{ TxnId: '77', TxnType: 'Invoice' }] }] } }) };
    const key = type === 'item' ? 'Item' : 'Customer';
    return { ok: true, json: async () => ({ [key]: { Id: id, SyncToken: '0', DisplayName: `Controlled ${key}`, Name: 'Controlled service' } }) };
  };
  const handlers = quickBooksHandlers(db, config, transport);
  const request = (tenant, data = {}) => ({ auth: identities[tenant].auth, data });
  const connection = tenant => db.doc(`rlQuickBooksConnections/${mappingId(identities[tenant].companyId, env.environment, 'connection', 'current')}`);
  const callback = async (state, code, realm) => { let result; const res = { redirect: (status, location) => { result = { status, location }; }, status: status => ({ send: () => { result = { status }; } }) }; await handlers.callback({ query: { state, code, realmId: realm } }, res); return result; };
  const begin = async tenant => { const result = await handlers.begin(request(tenant)); return new URL(result.url).searchParams.get('state'); };
  const authorize = async (tenant, code = tenant, realm = identities[tenant].realm) => callback(await begin(tenant), code, realm);
  for (const [tenant, index] of [['A', 1], ['B', 2]]) {
    const companyId = `${prefix}-${tenant}`, uid = `${companyId}-owner`, realm = String(100000 + sequence * 10 + index);
    identities[tenant] = { companyId, uid, realm, auth: { uid, token: { companyId, role: 'owner', email_verified: true } } };
    await db.doc(`companies/${companyId}`).set({ ownerId: uid, name: `Controlled ${tenant}` });
    await db.doc(`teamMembers/${companyId}-tech`).set({ companyId, uid: `${companyId}-tech`, role: 'technician', status: 'active' });
    await db.doc(`customers/${companyId}-customer`).set({ companyId, userId: uid, name: `Controlled ${tenant} customer` });
    await db.doc(`invoices/${companyId}-invoice`).set({ companyId, userId: uid, customerId: `${companyId}-customer`, total: 20, status: 'sent' });
  }
  if (connect) for (const tenant of ['A', 'B']) assert.ok(connected(await authorize(tenant)), 'Controlled tenant authorization must succeed.');
  const sign = payload => { const rawBody = Buffer.from(JSON.stringify(payload)); return { rawBody, headers: { 'intuit-signature': createHmac('sha256', config.webhookSecret()).update(rawBody).digest('base64') } }; };
  const webhook = async payload => { let status; await handlers.webhook(sign(payload), { status: value => ({ send: () => { status = value; } }) }); return status; };
  const payload = (type = 'Invoice', tenants = ['A', 'B']) => ({ eventNotifications: tenants.map(tenant => ({ realmId: identities[tenant].realm, companyId: identities[tenant === 'A' ? 'B' : 'A'].companyId, dataChangeEvent: { entities: [{ name: type, id: type === 'Payment' ? '55' : '77', operation: 'Update', lastUpdated: '2026-11-14T12:00:00Z' }] } })) });
  const invoiceMapping = async tenant => { const item = identities[tenant], localId = `${item.companyId}-invoice`; await db.doc(`rlQbMappings/${mappingId(item.companyId, env.environment, 'Invoice', localId)}`).set({ companyId: item.companyId, environment: env.environment, realmId: item.realm, type: 'Invoice', localId, remoteId: '77', syncToken: '0' }); await db.doc(`rlQbMappings/${mappingId(item.companyId, env.environment, 'Customer', `${item.companyId}-customer`)}`).set({ companyId:item.companyId, environment:env.environment, realmId:item.realm, type:'Customer', localId:`${item.companyId}-customer`, remoteId:'5', syncToken:'0' }); };
  return { prefix, calls, gates, env, config, identities, handlers, request, connection, callback, begin, authorize, sign, webhook, payload, invoiceMapping };
}

test('each tenant authorizes independently with the shared platform client and cannot target another company through request data', async () => {
  const f = await fixture(), a = await f.connection('A').get(), b = await f.connection('B').get();
  assert.equal(a.get('realmId'), f.identities.A.realm); assert.equal(b.get('realmId'), f.identities.B.realm); assert.notEqual(a.get('accessToken'), b.get('accessToken'));
  const status = await f.handlers.status(f.request('A', { companyId: f.identities.B.companyId })); assert.equal(status.realmId, f.identities.A.realm); assert.equal(status.accessToken, undefined); assert.equal(status.refreshToken, undefined);
  const forged = { auth: { uid: f.identities.A.uid, token: f.identities.B.auth.token }, data: {} };
  await assert.rejects(f.handlers.begin(forged), { code: 'permission-denied' }); await assert.rejects(f.handlers.disconnect(forged), { code: 'permission-denied' });
  const technician = { auth: { uid: `${f.identities.A.companyId}-tech`, token: { companyId: f.identities.A.companyId, membershipId: `${f.identities.A.companyId}-tech`, role: 'technician', email_verified: true } }, data: {} };
  await assert.rejects(f.handlers.begin(technician), { code: 'permission-denied' }); await assert.rejects(f.handlers.disconnect(technician), { code: 'permission-denied' });
  await assert.rejects(f.handlers.preview(f.request('A', { type: 'Customer', localId: `${f.identities.B.companyId}-customer` })), { code: 'permission-denied' });
  await assert.rejects(f.handlers.adopt(f.request('A', { type: 'Customer', localId: `${f.identities.B.companyId}-customer`, remoteId: '5' })), { code: 'permission-denied' });
  await f.handlers.disconnect(f.request('A', { companyId: f.identities.B.companyId })); assert.equal((await f.connection('A').get()).get('connected'), false); assert.equal((await f.connection('B').get()).get('connected'), true);
});

test('a realm already owned by another RL tenant cannot be attached through OAuth', async () => {
  const f = await fixture(), previous = (await f.connection('B').get()).get('connectionId'), tokenRequests = f.calls.filter(call => call.url.includes('/tokens/bearer')).length;
  assert.equal(connected(await f.authorize('B', 'foreign-realm', f.identities.A.realm)), false);
  assert.equal(f.calls.filter(call => call.url.includes('/tokens/bearer')).length, tokenRequests, 'A foreign realm must fail before a token exchange.');
  assert.equal((await f.connection('B').get()).get('connectionId'), previous); assert.equal((await f.connection('B').get()).get('realmId'), f.identities.B.realm);
});

test('concurrent token refresh rotates one tenant once and leaves other tenant credentials unchanged', async () => {
  const f = await fixture(), entered = deferred(), release = deferred(), other = (await f.connection('B').get()).get('refreshToken');
  await f.connection('A').update({ accessExpiresAt: 0 }); f.gates.refresh = async () => { entered.resolve(); await release.promise; };
  const first = f.handlers.connection(f.identities.A.companyId), second = f.handlers.connection(f.identities.A.companyId), allResults = Promise.allSettled([first, second]);
  await entered.promise; release.resolve(); const results = await allResults;
  assert.ok(results.some(result => result.status === 'fulfilled')); assert.equal(f.env.refreshCount, 1); assert.equal((await f.connection('A').get()).get('refreshLeaseUntil'), 0); assert.equal((await f.connection('B').get()).get('refreshToken'), other);
});

test('a disconnected tenant cannot be reactivated by an OAuth callback delayed at the provider', async () => {
  const f = await fixture(), state = await f.begin('A'), entered = deferred(), release = deferred();
  f.gates.exchange = async fields => { if (fields.get('code') === 'late-disconnected') { entered.resolve(); await release.promise; } };
  const late = f.callback(state, 'late-disconnected', f.identities.A.realm); await entered.promise;
  await f.handlers.disconnect(f.request('A')); release.resolve(); assert.equal(connected(await late), false); assert.equal((await f.connection('A').get()).get('connected'), false); assert.equal((await f.connection('A').get()).get('refreshToken'), null);
});

test('newer OAuth authorization supersedes older delayed callbacks without overwriting its tokens', async () => {
  const f = await fixture(), oldState = await f.begin('A'), entered = deferred(), release = deferred();
  f.gates.exchange = async fields => { if (fields.get('code') === 'older-attempt') { entered.resolve(); await release.promise; } };
  const late = f.callback(oldState, 'older-attempt', f.identities.A.realm); await entered.promise;
  assert.ok(connected(await f.authorize('A', 'newer-attempt'))); const current = (await f.connection('A').get()).get('connectionId');
  release.resolve(); assert.equal(connected(await late), false); assert.equal((await f.connection('A').get()).get('connectionId'), current);
});

test('OAuth callback rechecks actual company ownership after the token exchange', async () => {
  const f = await fixture(), state = await f.begin('A'), entered = deferred(), release = deferred(), previous = (await f.connection('A').get()).get('connectionId');
  f.gates.exchange = async fields => { if (fields.get('code') === 'owner-changed') { entered.resolve(); await release.promise; } };
  const late = f.callback(state, 'owner-changed', f.identities.A.realm); await entered.promise;
  await db.doc(`companies/${f.identities.A.companyId}`).update({ ownerId: 'replacement-owner' }); release.resolve(); assert.equal(connected(await late), false); assert.equal((await f.connection('A').get()).get('connectionId'), previous);
});

test('disconnect fences provider revocation before allowing another owner authorization', async () => {
  const f = await fixture(), entered = deferred(), release = deferred(); f.gates.revoke = async () => { entered.resolve(); await release.promise; };
  const disconnect = f.handlers.disconnect(f.request('A')); await entered.promise;
  let disconnected;
  try { await assert.rejects(f.handlers.begin(f.request('A'))); } finally { release.resolve(); disconnected = await disconnect; }
  assert.equal(disconnected.disconnected, true); assert.ok(connected(await f.authorize('A', 'after-disconnect'))); assert.equal((await f.connection('A').get()).get('connected'), true);
});

test('empty-body revocation success clears local tokens and permits immediate owner reconnect', async () => {
  const f = await fixture(), previous = (await f.connection('A').get()).data(), other = (await f.connection('B').get()).get('refreshToken');
  const result = await f.handlers.disconnect(f.request('A'));
  assert.deepEqual(result, { disconnected: true });
  const call = f.calls.find(row => row.url.includes('/tokens/revoke'));
  assert.equal(call.url, 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'); assert.equal(call.method, 'POST');
  assert.equal(call.authorization, 'Basic ' + Buffer.from(f.env.currentClientId + ':fixture-platform-secret').toString('base64'));
  assert.deepEqual(JSON.parse(call.body), { token: previous.refreshToken });
  const state = (await f.connection('A').get()).data(), status = await f.handlers.status(f.request('A'));
  assert.equal(state.connected, false); assert.equal(state.accessToken, null); assert.equal(state.refreshToken, null); assert.notEqual(state.connectionId, previous.connectionId);
  assert.equal(status.disconnecting, false); assert.equal(status.disconnectWarning, null); assert.equal(status.disconnectRetryAfterMs, 0);
  const realms = await db.collection('rlQbRealms').where('companyId','==',f.identities.A.companyId).get(); assert.equal(realms.docs[0].get('active'), false);
  const audit = await db.collection('rlQbAudit').where('companyId','==',f.identities.A.companyId).where('action','==','oauth.revocation').get();
  assert.equal(audit.size, 1); assert.equal(audit.docs[0].get('httpStatus'), 200); assert.equal(audit.docs[0].get('outcome'), 'confirmed'); assert.equal(audit.docs[0].get('failureCategory'), null);
  assert.ok(connected(await f.authorize('A', 'after-empty-response'))); assert.equal((await f.connection('B').get()).get('refreshToken'), other);
});

test('revocation timeout keeps local tokens invalid and reconnect fenced only until its safety lease expires', async () => {
  const f = await fixture(); f.env.revokeTimeout = true;
  const result = await f.handlers.disconnect(f.request('A')); assert.match(result.warning, /disconnected in Route Logistics/);
  const state = (await f.connection('A').get()).data(), status = await f.handlers.status(f.request('A'));
  assert.equal(state.connected, false); assert.equal(state.accessToken, null); assert.equal(state.refreshToken, null);
  assert.equal(status.disconnecting, true); assert.ok(status.disconnectRetryAfterMs > 0 && status.disconnectRetryAfterMs <= 60000);
  await assert.rejects(f.begin('A'), { code:'unavailable' });
  const audit = await db.collection('rlQbAudit').where('companyId','==',f.identities.A.companyId).where('action','==','oauth.revocation').get();
  assert.equal(audit.docs[0].get('outcome'), 'unconfirmed'); assert.equal(audit.docs[0].get('httpStatus'), null); assert.equal(audit.docs[0].get('failureCategory'), 'timeout');
  const intent = db.doc(`rlQbOAuthIntents/${mappingId(f.identities.A.companyId,'sandbox','authorization','current')}`); await intent.update({ disconnectLeaseUntil:Date.now()-1 });
  assert.equal((await f.handlers.status(f.request('A'))).disconnecting, false); f.env.revokeTimeout = false; assert.ok(await f.begin('A'));
});

test('an already-invalid provider grant cannot prevent local disconnect or owner reconnect', async () => {
  const f = await fixture(); f.env.revokeFailure = true;
  assert.equal((await f.handlers.disconnect(f.request('A'))).disconnected, true); assert.equal((await f.connection('A').get()).get('connected'), false);
  const audit = await db.collection('rlQbAudit').where('companyId','==',f.identities.A.companyId).where('action','==','oauth.revocation').get(); assert.equal(audit.docs[0].get('httpStatus'), 400); assert.equal(audit.docs[0].get('failureCategory'), 'http-error');
  f.env.revokeFailure = false; assert.ok(connected(await f.authorize('A', 'recover-invalid-grant')));
});

test('invalid-grant refresh failures expose a safe reconnect action only to the affected tenant', async () => {
  const f = await fixture(); await f.connection('A').update({ accessExpiresAt: 0 }); f.env.refreshFailure = true;
  await assert.rejects(f.handlers.connection(f.identities.A.companyId));
  const a = await f.handlers.status(f.request('A')), b = await f.handlers.status(f.request('B'));
  assert.match(a.lastError || '', /reconnect/i); assert.ok(!/fixture-(access|refresh)/.test(a.lastError || '')); assert.equal(b.lastError, null);
});

test('invalid environments and mismatched platform credential environments never reach the provider', async () => {
  const f = await fixture({ connect: false });
  for (const [environment, credentialEnvironment] of [['typo', 'sandbox'], ['production', 'sandbox'], ['sandbox', 'production']]) {
    f.env.environment = environment; f.env.credentialEnvironment = credentialEnvironment; f.env.productionApproved = true;
    await assert.rejects(f.handlers.begin(f.request('A')));
  }
  assert.equal(f.calls.length, 0);
});

test('changing the shared OAuth client identity requires a new tenant authorization before stored tokens can be used', async () => {
  const f = await fixture(), before = f.calls.length; f.env.currentClientId = 'different-platform-client';
  await assert.rejects(f.handlers.connection(f.identities.A.companyId)); assert.equal(f.calls.length, before);
  const status = await f.handlers.status(f.request('A')); assert.equal(status.credentialMismatch, true); assert.equal(status.enabled, true, 'Owner must still be able to reconnect after the platform client changes.');
  assert.ok(connected(await f.authorize('A', 'renewed-platform-client'))); assert.equal((await f.handlers.status(f.request('A'))).credentialMismatch, false);
});

test('OAuth verifies provider environment and valid company metadata before storing tokens and permits recovery through a new authorization', async () => {
  const f = await fixture({ connect: false }); f.env.companyInfoMalformed = true;
  assert.equal(connected(await f.authorize('A', 'malformed-provider-company')), false); assert.notEqual((await f.connection('A').get()).get('connected'), true); assert.ok(!(await f.connection('A').get()).get('accessToken'));
  f.env.companyInfoMalformed = false; f.env.companyInfoFailure = true;
  assert.equal(connected(await f.authorize('A', 'wrong-token-environment')), false); assert.notEqual((await f.connection('A').get()).get('connected'), true); assert.ok(!(await f.connection('A').get()).get('refreshToken'));
  const realms = await db.collection('rlQbRealms').where('companyId', '==', f.identities.A.companyId).get(); assert.equal(realms.size, 0);
  f.env.companyInfoFailure = false; assert.ok(connected(await f.authorize('A', 'correct-provider-company'))); assert.equal((await f.connection('A').get()).get('realmId'), f.identities.A.realm);
});

test('signed webhook routing resolves each active realm to its tenant and deduplicates identical remote IDs', async () => {
  const f = await fixture(), body = f.payload('Customer'), request = f.sign(body); let code;
  await f.handlers.webhook({ ...request, headers: { 'intuit-signature': 'invalid' } }, { status: value => ({ send: () => { code = value; } }) }); assert.equal(code, 401);
  assert.equal(await f.webhook(body), 200); assert.equal(await f.webhook(body), 200);
  for (const tenant of ['A', 'B']) { const rows = await db.collection('rlQbWebhookEvents').where('companyId', '==', f.identities[tenant].companyId).get(); assert.equal(rows.size, 1); assert.equal(rows.docs[0].get('realmId'), f.identities[tenant].realm); }
});

test('queued events from a disconnected connection cannot reconcile or read through another tenant', async () => {
  const f = await fixture(); for (const tenant of ['A', 'B']) await f.invoiceMapping(tenant);
  assert.equal(await f.webhook(f.payload()), 200); await f.handlers.disconnect(f.request('A')); const before = f.calls.length;
  await f.handlers.drain();
  assert.equal(f.calls.slice(before).filter(call => call.url.includes(`/v3/company/${f.identities.A.realm}/`)).length, 0);
  const a = await db.doc(`invoices/${f.identities.A.companyId}-invoice`).get(), b = await db.doc(`invoices/${f.identities.B.companyId}-invoice`).get();
  assert.equal(a.get('qbTestPaymentStatus'), undefined); assert.equal(a.get('status'), 'sent'); assert.equal(b.get('qbTestPaymentStatus'), 'paid'); assert.equal(b.get('status'), 'sent');
  const events = await db.collection('rlQbWebhookEvents').where('companyId', '==', f.identities.A.companyId).get(); assert.ok(events.docs.every(event => !['pending', 'reconciled'].includes(event.get('status'))));
});

test('inbound payment links use tenant, environment and realm even when provider payment IDs are identical', async () => {
  const f = await fixture(); for (const tenant of ['A', 'B']) await f.invoiceMapping(tenant);
  assert.equal(await f.webhook(f.payload('Payment')), 200); await f.handlers.drain(); const ids = [];
  for (const tenant of ['A', 'B']) {
    const rows = await db.collection('rlQbPaymentMappings').where('companyId', '==', f.identities[tenant].companyId).get(); assert.equal(rows.size, 1); assert.equal(rows.docs[0].get('realmId'), f.identities[tenant].realm); assert.equal(rows.docs[0].get('environment'), 'sandbox'); ids.push(rows.docs[0].id);
    assert.equal((await db.doc(`invoices/${f.identities[tenant].companyId}-invoice`).get()).get('status'), 'sent');
  }
  assert.notEqual(ids[0], ids[1]);
});

test('browser clients cannot read or write tenant OAuth tokens, realm routing, mappings or event records', async () => {
  const f = await fixture(), companyId = f.identities.A.companyId, client = rules.authenticatedContext(f.identities.A.uid, { companyId, role: 'owner', email_verified: true }).firestore();
  for (const collection of ['rlQuickBooksConnections', 'rlQbOAuthStates', 'rlQbOAuthIntents', 'rlQbRealms', 'rlQbMappings', 'rlQbRemoteMappings', 'rlQbPaymentMappings', 'rlQbWebhookEvents', 'rlQbOperations']) {
    const id = `${f.prefix}-private`; await db.doc(`${collection}/${id}`).set({ companyId, environment: 'sandbox', accessToken: 'fixture-private-token' });
    await assertFails(getDoc(doc(client, `${collection}/${id}`))); await assertFails(setDoc(doc(client, `${collection}/${id}`), { companyId, connected: false }));
  }
});
