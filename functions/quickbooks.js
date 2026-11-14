const { hasCapability } = require('./access');
const { randomBytes, createHmac, timingSafeEqual } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { hash, documentId, requireAuth, requireStaff, requireCompanyOwner, rateLimit } = require('./security');
const SOURCES = { Customer: 'customers', Item: 'estimateTemplates', Invoice: 'invoices' };
const mappingId = (company, environment, type, id) => hash(`${company}:${environment}:${type}:${id}`);
const remoteId = (value) => { if (!/^\d{1,30}$/.test(String(value || ''))) throw new HttpsError('invalid-argument', 'Invalid QuickBooks identifier.'); return String(value); };
function validSignature(raw, signature, secret) {
  if (!Buffer.isBuffer(raw) || typeof signature !== 'string' || !secret) return false;
  const expected = createHmac('sha256', secret).update(raw).digest(), actual = Buffer.from(signature, 'base64');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function quickBooksHandlers(db, config, transport = fetch) {
  const checkedEnvironment = value => { if (!['sandbox', 'production'].includes(value)) throw new HttpsError('failed-precondition', 'QuickBooks environment must be sandbox or production.'); return value; };
  const environment = () => checkedEnvironment(config.environment?.() || 'sandbox');
  const credentialEnvironment = () => checkedEnvironment(config.credentialEnvironment?.() || 'sandbox');
  const enabled = () => config.enabled?.() === true;
  const productionApproved = () => environment() !== 'production' || config.productionApproved?.() === true;
  const connectionRef = (companyId) => db.doc(`rlQuickBooksConnections/${mappingId(companyId, environment(), 'connection', 'current')}`);
  const mapRef = (companyId, type, id) => db.doc(`rlQbMappings/${mappingId(companyId, environment(), type, id)}`);
  const intentRef = companyId => db.doc(`rlQbOAuthIntents/${mappingId(companyId, environment(), 'authorization', 'current')}`);
  const realmRef = realmId => db.doc(`rlQbRealms/${hash(`${environment()}:${realmId}`)}`);
  const safeError = error => error instanceof HttpsError ? error.message : 'QuickBooks is temporarily unavailable. Retry, or reconnect if access has expired.';
  const currentCredentialHash = () => { const id = config.clientId?.(); if (typeof id !== 'string' || !id.trim()) throw new HttpsError('failed-precondition', 'QuickBooks platform credentials are not configured.'); return hash(`${credentialEnvironment()}:${id}`); };
  const sameConnection = (current, expected) => current?.connected === true && current.companyId === expected.companyId && current.environment === expected.environment && current.realmId === expected.realmId && current.connectionId === expected.connectionId;
  const apiHost = () => environment() === 'sandbox' ? 'sandbox-quickbooks.api.intuit.com' : 'quickbooks.api.intuit.com';
  const ensureEnabled = () => {
    if (!enabled()) throw new HttpsError('failed-precondition', 'QuickBooks connection is awaiting configuration.');
    if (environment() !== credentialEnvironment()) throw new HttpsError('failed-precondition', 'QuickBooks credentials and accounting environment do not match.');
    if (!productionApproved()) throw new HttpsError('failed-precondition', 'Production QuickBooks synchronization is awaiting explicit operator approval.');
  };
  const credentials = () => Buffer.from(`${config.clientId()}:${config.clientSecret()}`).toString('base64');
  async function http(url, options, { parseJson = true } = {}) {
    let response;
    try { response = await transport(url, { ...options, signal: AbortSignal.timeout(20000) }); }
    catch (cause) { const error = new HttpsError('unavailable', 'QuickBooks is temporarily unavailable. Retry shortly.'); error.providerFailure = ['TimeoutError', 'AbortError'].includes(cause?.name) ? 'timeout' : 'transport'; throw error; }
    if (!response.ok) { const error = new HttpsError(response.status === 401 ? 'unauthenticated' : [429, 500, 502, 503, 504].includes(response.status) ? 'unavailable' : 'failed-precondition', response.status === 401 ? 'Reconnect QuickBooks to renew access.' : `QuickBooks request failed (${response.status}). Review the connection and accounting record.`); error.providerStatus = response.status; throw error; }
    if (!parseJson) return { httpStatus: response.status };
    if (response.status === 204) return {};
    try { return await response.json(); } catch { throw new HttpsError('unavailable', 'QuickBooks returned an incomplete response. Retry shortly.'); }
  }
  const tokenRequest = async values => {
    try { return await http('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', { method: 'POST', headers: { Authorization: `Basic ${credentials()}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(values).toString() }); }
    catch (error) { if ([400,401].includes(error.providerStatus)) { const failure = new HttpsError('failed-precondition', 'QuickBooks authorization expired or was revoked. Reconnect QuickBooks.'); failure.reconnectRequired = true; throw failure; } throw error; }
  };
  const tokenFields = (data) => { if (!data.access_token || !data.refresh_token) throw new HttpsError('unavailable', 'QuickBooks did not provide a complete connection. Reconnect.'); return { accessToken: data.access_token, refreshToken: data.refresh_token, accessExpiresAt: Date.now() + Number(data.expires_in || 3600) * 1000, refreshExpiresAt: Date.now() + Number(data.x_refresh_token_expires_in || 8640000) * 1000 }; };
  async function connection(companyId) {
    ensureEnabled(); const ref = connectionRef(companyId), leaseId = randomBytes(16).toString('hex'), credentialHash = currentCredentialHash();
    const state = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref), current = snap.data();
      if (!current?.connected) throw new HttpsError('failed-precondition', 'Connect this company to QuickBooks first.');
      if (current.companyId !== companyId || current.environment !== environment()) throw new HttpsError('permission-denied', 'QuickBooks connection belongs to another workspace or environment.');
      remoteId(current.realmId);
      if (current.credentialHash && current.credentialHash !== credentialHash) throw new HttpsError('failed-precondition', 'QuickBooks platform credentials changed. Reconnect QuickBooks.');
      if (current.reconnectRequired || current.refreshExpiresAt <= Date.now()) throw new HttpsError('failed-precondition', 'QuickBooks authorization expired. Reconnect QuickBooks.');
      if (current.credentialHash && current.accessExpiresAt > Date.now() + 120000) return { current, refresh: false };
      if (current.refreshLeaseUntil > Date.now()) throw new HttpsError('unavailable', 'QuickBooks access is refreshing. Retry shortly.');
      tx.update(ref, { refreshLeaseId: leaseId, refreshLeaseUntil: Date.now() + 60000 }); return { current, refresh: true };
    });
    if (!state.refresh) return state.current;
    try {
      const tokens = tokenFields(await tokenRequest({ grant_type: 'refresh_token', refresh_token: state.current.refreshToken }));
      // A pre-existing connection without an app identity is verified through the
      // current platform credentials and the selected environment before adoption.
      if (!state.current.credentialHash) await companyInfo(state.current.realmId, tokens.accessToken);
      await db.runTransaction(async (tx) => { const latest = await tx.get(ref); if (!sameConnection(latest.data(), state.current) || latest.get('refreshLeaseId') !== leaseId) throw new HttpsError('aborted', 'QuickBooks connection changed.'); tx.update(ref, { ...tokens, credentialHash, credentialEnvironment: credentialEnvironment(), refreshLeaseUntil: 0, reconnectRequired: false, lastError: null, updatedAt: new Date() }); });
      return { ...state.current, ...tokens, credentialHash };
    } catch (error) { await db.runTransaction(async (tx) => { const latest = await tx.get(ref); if (sameConnection(latest.data(), state.current) && latest.get('refreshLeaseId') === leaseId) tx.update(ref, { refreshLeaseUntil: 0, lastError: safeError(error), ...(error.reconnectRequired ? { reconnectRequired: true } : {}) }); }); throw error; }
  }
  async function companyInfo(realm, accessToken) {
    const id = remoteId(realm), result = await http(`https://${apiHost()}/v3/company/${id}/companyinfo/${id}`, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    // CompanyInfo.Id is an entity ID (often "1"), not the OAuth realm ID.
    // Intuit authorizes this token against the realm in the environment-specific URL.
    if (!result.CompanyInfo || !/^\d{1,30}$/.test(String(result.CompanyInfo.Id || '')) || typeof result.CompanyInfo.CompanyName !== 'string' || !result.CompanyInfo.CompanyName.trim()) throw new HttpsError('failed-precondition', 'QuickBooks did not return valid company information. Reconnect and choose the intended company.');
    return result.CompanyInfo;
  }
  async function api(companyId, path, body, requestId, expected) {
    const current = await connection(companyId);
    if (expected && !sameConnection(current, expected)) throw new HttpsError('aborted', 'QuickBooks connection changed. Refresh before retrying.');
    const host = apiHost();
    const url = new URL(`https://${host}/v3/company/${remoteId(current.realmId)}/${path}`);
    if (requestId) url.searchParams.set('requestid', requestId);
    return http(url.href, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${current.accessToken}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  async function checkCurrent(tx, companyId, expected, ownerUid) {
    const latest = await tx.get(connectionRef(companyId));
    if (!sameConnection(latest.data(), expected)) throw new HttpsError('aborted', 'QuickBooks connection changed. Refresh before retrying.');
    if (ownerUid) { const company = await tx.get(db.doc(`companies/${companyId}`)); if (company.get('ownerId') !== ownerUid) throw new HttpsError('permission-denied', 'Only the current company owner can manage accounting.'); }
    return latest;
  }
  const oauthFailure = code => Object.assign(new HttpsError('failed-precondition', 'QuickBooks authorization could not be completed. Reconnect from Company integrations.'), { qbCode: code });
  async function finishOAuthFailure(identity, code) {
    if (!identity?.attemptId) return;
    await db.runTransaction(async tx => {
      const ref = intentRef(identity.companyId), latest = await tx.get(ref);
      if (latest.get('attemptId') === identity.attemptId && latest.get('status') === 'authorizing') tx.update(ref, { status: 'failed', lastError: 'QuickBooks authorization was not completed. Reconnect QuickBooks.', errorCode: code, updatedAt: new Date() });
    });
  }
  async function scope(request, owner = false) {
    const { uid, token } = requireAuth(request, true), companyId = documentId(token.companyId, 'company');
    if (owner) await requireCompanyOwner(db, request, companyId);
    else if (!hasCapability((await requireStaff(db, request, companyId)).role, 'integrations.read')) throw new HttpsError('permission-denied', 'Manager access required.');
    await rateLimit(db, 'quickbooks', uid, 40); return companyId;
  }
  async function source(companyId, type, id) {
    if (!SOURCES[type]) throw new HttpsError('invalid-argument', 'Select a customer, service or invoice.');
    const snap = await db.doc(`${SOURCES[type]}/${documentId(id)}`).get();
    if (!snap.exists || snap.get('companyId') !== companyId) throw new HttpsError('permission-denied', 'This record belongs to another workspace.'); return snap;
  }
  async function payload(companyId, type, snap, current) {
    const data = snap.data();
    if (type === 'Customer') {
      const name = String(data.name || data.displayName || [data.firstName, data.lastName].filter(Boolean).join(' ')).trim();
      if (!name) throw new HttpsError('failed-precondition', 'Enter a customer name before syncing.');
      return { DisplayName: name.slice(0, 500), ...(data.email ? { PrimaryEmailAddr: { Address: data.email } } : {}), ...(data.phone || data.phoneNumber ? { PrimaryPhone: { FreeFormNumber: String(data.phone || data.phoneNumber) } } : {}) };
    }
    if (type === 'Item') {
      if (!current.incomeAccountId) throw new HttpsError('failed-precondition', 'Select an income account in accounting settings first.');
      const name = String(data.name || data.serviceType || data.title || '').trim();
      if (!name) throw new HttpsError('failed-precondition', 'Enter a service name first.');
      return { Name: name.slice(0, 100), Type: 'Service', IncomeAccountRef: { value: current.incomeAccountId } };
    }
    if (data.status === 'draft' || data.status === 'void' || data.paymentLock) throw new HttpsError('failed-precondition', 'Send the invoice and finish any payment attempt before syncing.');
    const customer = await mapRef(companyId, 'Customer', documentId(data.customerId)).get();
    if (!customer.exists || customer.get('realmId') !== current.realmId) throw new HttpsError('failed-precondition', 'Map or sync the customer first.');
    if (!Array.isArray(data.lineItems) || !data.lineItems.length) throw new HttpsError('failed-precondition', 'Invoice has no line items.');
    // Tax must be mapped deliberately; do not silently create an incorrect tax treatment.
    if (Number(data.tax || 0) !== 0) throw new HttpsError('failed-precondition', 'Taxed invoices require an accounting tax mapping before export.');
    const lines = [];
    for (const item of data.lineItems) {
      let itemId = current.defaultItemId;
      if (item.templateId) { const mapped = await mapRef(companyId, 'Item', documentId(item.templateId)).get(); if (mapped.get('realmId') === current.realmId) itemId = mapped.get('remoteId'); }
      const quantity = Number(item.quantity), unitPrice = Number(item.unitPrice), amount = Number(item.amount);
      if (!itemId || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || Math.abs(amount - quantity * unitPrice) > 0.011) throw new HttpsError('failed-precondition', 'Each line needs a mapped service and valid amount.');
      lines.push({ DetailType: 'SalesItemLineDetail', Description: String(item.description || '').slice(0, 4000), Amount: amount, SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: quantity, UnitPrice: unitPrice } });
    }
    const lineTotal = lines.reduce((sum, line) => sum + line.Amount, 0);
    if (typeof data.total !== 'number' || !Number.isFinite(data.total) || data.total < 0 || !Number.isFinite(lineTotal)
      || Math.abs(lineTotal - data.total) > 0.011) throw new HttpsError('failed-precondition', 'Invoice totals require review.');
    return { CustomerRef: { value: customer.get('remoteId') }, Line: lines, ...(data.invoiceNumber ? { DocNumber: String(data.invoiceNumber).slice(0, 21) } : {}), ...(data.issueDate ? { TxnDate: data.issueDate } : {}), ...(data.dueDate ? { DueDate: data.dueDate } : {}) };
  }
  async function preview(companyId, type, id) {
    const snap = await source(companyId, type, id), current = await connection(companyId), map = await mapRef(companyId, type, id).get();
    if (map.exists && map.get('realmId') !== current.realmId) throw new HttpsError('failed-precondition', 'Existing mapping belongs to a different QuickBooks company.');
    const body = await payload(companyId, type, snap, current);
    if (map.exists) {
      const remote = (await api(companyId, `${type.toLowerCase()}/${remoteId(map.get('remoteId'))}`, undefined, undefined, current))[type];
      if (String(remote.SyncToken) !== map.get('syncToken')) throw new HttpsError('aborted', 'This record changed in QuickBooks. Review and adopt its latest version before retrying.');
      Object.assign(body, { Id: remote.Id, SyncToken: remote.SyncToken, sparse: true });
    }
    return { body, sourceHash: hash(JSON.stringify(body)), map, current, source: snap };
  }
  async function reconcileInvoice(companyId, remoteInvoiceId, expected) {
    const current = await connection(companyId);
    if (expected && !sameConnection(current, expected)) throw new HttpsError('aborted', 'QuickBooks connection changed.');
    const id = remoteId(remoteInvoiceId), remote = (await api(companyId, `invoice/${id}`, undefined, undefined, current)).Invoice;
    if (!remote || String(remote.Id) !== id) throw new HttpsError('failed-precondition', 'QuickBooks returned a different invoice. Review the mapping.');
    const maps = await db.collection('rlQbMappings').where('companyId', '==', companyId).where('environment', '==', environment()).where('type', '==', 'Invoice').where('remoteId', '==', String(remote.Id)).get();
    const localIds = [];
    for (const mapping of maps.docs) {
      if (mapping.get('realmId') !== current.realmId) continue;
      const ref = db.doc(`invoices/${documentId(mapping.get('localId'))}`), eventRef = db.doc(`rlQbReconciliations/${hash(`${current.connectionId}:${mapping.id}:${remote.SyncToken}:${remote.Balance}:${remote.TotalAmt}`)}`);
      await db.runTransaction(async (tx) => {
        const [invoice, seen, latestMap] = await Promise.all([tx.get(ref), tx.get(eventRef), tx.get(mapping.ref)]);
        await checkCurrent(tx, companyId, current);
        if (latestMap.get('companyId') !== companyId || latestMap.get('environment') !== environment() || latestMap.get('realmId') !== current.realmId || latestMap.get('remoteId') !== id) throw new HttpsError('aborted', 'QuickBooks invoice mapping changed.');
        if (seen.exists) return;
        const eligible = invoice.get('companyId') === companyId && ['sent', 'paid'].includes(invoice.get('status')) && !invoice.get('paymentLock') && (remote.CurrencyRef?.value || 'USD') === 'USD' && Math.abs(Number(invoice.get('total')) - Number(remote.TotalAmt)) < 0.011 && Number.isFinite(Number(remote.Balance)) && Number(remote.Balance) >= 0 && Number(remote.Balance) <= Number(remote.TotalAmt);
        const paid = eligible && Number(remote.Balance) === 0;
        const updates = environment() === 'sandbox' ? { qbTestPaymentStatus: paid ? 'paid' : eligible ? 'open' : 'review' } : { qbBalance: Number(remote.Balance) || 0, qbPaymentReview: !eligible || (invoice.get('status') === 'paid' && !paid), ...(paid && invoice.get('status') === 'sent' ? { status: 'paid', paidAt: new Date().toISOString(), paidVia: 'quickbooks' } : {}) };
        if (invoice.exists && invoice.get('companyId') === companyId) tx.update(ref, { ...updates, qbReconciledAt: new Date().toISOString() });
        tx.create(eventRef, { companyId, environment: environment(), realmId: current.realmId, connectionId: current.connectionId, invoiceId: ref.id, remoteId: String(remote.Id), eligible, paid, createdAt: new Date() });
      });
      localIds.push(ref.id);
    }
    return localIds;
  }
  async function eventConnection(data) {
    if (data.environment !== environment()) return null;
    const [connection, realm] = await Promise.all([connectionRef(documentId(data.companyId)).get(), realmRef(remoteId(data.realmId)).get()]);
    const current = connection.data();
    if (!current?.connected || current.companyId !== data.companyId || current.environment !== environment() || current.realmId !== data.realmId || realm.get('companyId') !== data.companyId || realm.get('active') === false) return null;
    if (data.connectionId ? data.connectionId !== current.connectionId : !current.connectedAt || (data.createdAt?.toMillis?.() || 0) < (current.connectedAt?.toMillis?.() || 0)) return null;
    return current;
  }
  return {
    status: async (request) => {
      const companyId = await scope(request), snap = await connectionRef(companyId).get(), intent = await intentRef(companyId).get();
      const [maps, operations, events] = await Promise.all([
        db.collection('rlQbMappings').where('companyId', '==', companyId).where('environment', '==', environment()).limit(200).get(),
        db.collection('rlQbOperations').where('companyId', '==', companyId).where('environment', '==', environment()).limit(100).get(),
        db.collection('rlQbWebhookEvents').where('companyId', '==', companyId).where('environment', '==', environment()).limit(100).get(),
      ]);
      const connected = snap.get('connected') === true;
      const configuredHash = config.clientId?.() ? currentCredentialHash() : null;
      const credentialMismatch = credentialEnvironment() !== environment() || !!snap.get('credentialEnvironment') && snap.get('credentialEnvironment') !== credentialEnvironment() || !!snap.get('credentialHash') && !!configuredHash && snap.get('credentialHash') !== configuredHash;
      const reconnectRequired = snap.get('reconnectRequired') === true || connected && snap.get('refreshExpiresAt') <= Date.now();
      const disconnectRetryAfterMs = Math.max(0, Number(intent.get('disconnectLeaseUntil') || 0) - Date.now()), disconnecting = disconnectRetryAfterMs > 0;
      const health = !enabled() ? 'disabled' : !productionApproved() ? 'awaiting-production-approval' : credentialMismatch ? 'credentials-mismatch' : disconnecting ? 'disconnecting' : !connected ? 'disconnected'
        : reconnectRequired ? 'reconnect-required' : snap.get('accessExpiresAt') <= Date.now() ? 'refresh-needed' : 'connected';
      return { enabled: enabled() && productionApproved() && credentialEnvironment() === environment(), configured: enabled(), environment: environment(), productionApproved: config.productionApproved?.() === true, environmentReady: productionApproved(),
        writesEnabled: enabled() && config.writesEnabled?.() === true && productionApproved() && !credentialMismatch, connected, health,
        realmId: snap.get('realmId') || null, companyName: snap.get('companyName') || null, credentialMismatch, reconnectRequired, disconnecting, disconnectRetryAfterMs, disconnectWarning: snap.get('disconnectWarning') || null,
        lastError: snap.get('lastError') || intent.get('lastError') || null,
        accessExpiresAt: snap.get('accessExpiresAt') || null, refreshExpiresAt: snap.get('refreshExpiresAt') || null,
        incomeAccountId: snap.get('incomeAccountId') || '', defaultItemId: snap.get('defaultItemId') || '',
        mappings: maps.docs.map(row => ({ type: row.get('type'), localId: row.get('localId'), remoteId: row.get('remoteId'), status: row.get('status'), lastSyncedAt: row.get('lastSyncedAt') || null })),
        operations: operations.docs.map(row => ({ id: row.id, type: row.get('type'), localId: row.get('localId'), status: row.get('status'), error: row.get('error') || null, attempts: row.get('attempts') || 0 })),
        webhookEvents: events.docs.map(row => ({ id: row.id, type: row.get('type'), status: row.get('status'), error: row.get('error') || null, attempts: row.get('attempts') || 0 })),
      };
    },
    begin: async (request) => {
      const companyId = await scope(request, true); ensureEnabled();
      const state = randomBytes(32).toString('hex'), attemptId = randomBytes(16).toString('hex'), credentialHash = currentCredentialHash();
      await db.runTransaction(async tx => {
        const intent = intentRef(companyId), latest = await tx.get(intent), company = await tx.get(db.doc(`companies/${companyId}`));
        if (company.get('ownerId') !== request.auth.uid) throw new HttpsError('permission-denied', 'Only the current company owner can connect QuickBooks.');
        if (latest.get('disconnectLeaseUntil') > Date.now()) throw new HttpsError('unavailable', 'QuickBooks is finishing the disconnect. Retry shortly.');
        tx.set(intent, { companyId, environment: environment(), userId: request.auth.uid, attemptId, status: 'authorizing', credentialHash, lastError: null, updatedAt: new Date() });
        tx.create(db.doc(`rlQbOAuthStates/${hash(state)}`), { companyId, userId: request.auth.uid, environment: environment(), credentialHash, attemptId, expiresAt: Date.now() + 600000, used: false });
      });
      const url = new URL('https://appcenter.intuit.com/connect/oauth2');
      Object.entries({ client_id: config.clientId(), scope: 'com.intuit.quickbooks.accounting', redirect_uri: config.redirectUri(), response_type: 'code', state }).forEach(([key, value]) => url.searchParams.set(key, value));
      return { url: url.href };
    },
    callback: async (req, res) => {
      let identity, claim;
      try {
        ensureEnabled(); const state = String(req.query.state || ''), code = String(req.query.code || ''), credentialHash = currentCredentialHash();
        if (!/^[a-f0-9]{64}$/.test(state)) throw oauthFailure('failed');
        const ref = db.doc(`rlQbOAuthStates/${hash(state)}`);
        // A recognized state permits only safe error navigation, never authority
        // supplied by callback query parameters or a different signed-in tenant.
        const known = await ref.get();
        if (!known.exists || known.get('used')) throw oauthFailure('expired');
        identity = known.data();
        await db.runTransaction(async tx => {
          const saved = await tx.get(ref), intent = await tx.get(intentRef(identity.companyId)), company = await tx.get(db.doc(`companies/${identity.companyId}`));
          if (saved.get('used') || saved.get('expiresAt') <= Date.now() || saved.get('environment') !== environment()) throw oauthFailure('expired');
          if (company.get('ownerId') !== saved.get('userId')) throw oauthFailure('owner-changed');
          if (!saved.get('attemptId') || intent.get('attemptId') !== saved.get('attemptId') || intent.get('status') !== 'authorizing') throw oauthFailure('superseded');
          if (saved.get('credentialHash') !== credentialHash) throw oauthFailure('credentials-changed');
          tx.update(ref, { used: true, consumedAt: new Date() });
        });
        if (req.query.error) throw oauthFailure(req.query.error === 'access_denied' ? 'cancelled' : 'failed');
        if (!code || code.length > 4000) throw oauthFailure('failed');
        const realmId = remoteId(req.query.realmId), realm = realmRef(realmId);
        claim = db.doc(`rlQbRealmClaims/${hash(`${environment()}:${realmId}`)}`);
        await db.runTransaction(async tx => {
          const [existing, reservation] = await Promise.all([tx.get(realm), tx.get(claim)]);
          if (existing.exists && existing.get('companyId') !== identity.companyId || reservation.get('expiresAt') > Date.now() && reservation.get('companyId') !== identity.companyId) throw oauthFailure('realm-in-use');
          tx.set(claim, { companyId: identity.companyId, environment: environment(), attemptId: identity.attemptId, expiresAt: Date.now() + 120000 });
        });
        const tokens = tokenFields(await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri() }));
        const info = await companyInfo(realmId, tokens.accessToken), connection = connectionRef(identity.companyId), connectionId = randomBytes(16).toString('hex');
        await db.runTransaction(async tx => {
          const [existing, old, intent, company, reservation] = await Promise.all([tx.get(realm), tx.get(connection), tx.get(intentRef(identity.companyId)), tx.get(db.doc(`companies/${identity.companyId}`)), tx.get(claim)]);
          if (company.get('ownerId') !== identity.userId) throw oauthFailure('owner-changed');
          if (intent.get('attemptId') !== identity.attemptId || intent.get('status') !== 'authorizing' || reservation.get('attemptId') !== identity.attemptId) throw oauthFailure('superseded');
          if (currentCredentialHash() !== identity.credentialHash) throw oauthFailure('credentials-changed');
          if (existing.exists && existing.get('companyId') !== identity.companyId) throw oauthFailure('realm-in-use');
          const changedRealm = old.get('realmId') && old.get('realmId') !== realmId;
          if (changedRealm) {
            const mappings = await tx.get(db.collection('rlQbMappings').where('companyId','==',identity.companyId).where('environment','==',environment()).limit(1));
            const payments = await tx.get(db.collection('rlQbPaymentMappings').where('companyId','==',identity.companyId).where('environment','==',environment()).limit(1));
            if (old.get('connected') || !mappings.empty || !payments.empty) throw oauthFailure('company-mismatch');
          }
          tx.set(realm, { companyId: identity.companyId, realmId, environment: environment(), connectionId, active: true });
          tx.set(connection, { ...tokens, companyId: identity.companyId, realmId, companyName: String(info.CompanyName || '').slice(0,300), environment: environment(), credentialEnvironment: credentialEnvironment(), credentialHash, connected: true, connectionId, connectedBy: identity.userId, connectedAt: new Date(), updatedAt: new Date(), disconnectedAt: null, disconnectWarning: null, reconnectRequired: false, lastError: null, refreshLeaseUntil: 0, ...(changedRealm ? { incomeAccountId: '', defaultItemId: '' } : {}) }, { merge: true });
          tx.set(intentRef(identity.companyId), { status: 'connected', connectionId, lastError: null, disconnectLeaseUntil: 0 }, { merge: true });
          tx.set(claim, { expiresAt: 0 }, { merge: true });
          tx.create(db.collection('rlQbAudit').doc(), { action: 'oauth.connected', companyId: identity.companyId, environment: environment(), realmId, connectionId, actorId: identity.userId, createdAt: new Date() });
        });
        res.redirect(303, `${config.appUrl()}/integrations?connected=1`);
      } catch (error) {
        const code = error.qbCode || (error.reconnectRequired ? 'reconnect-required' : 'failed');
        if (identity) { await finishOAuthFailure(identity, code).catch(() => {}); res.redirect(303, `${config.appUrl()}/integrations?qbError=${code}`); }
        else res.status(400).send('QuickBooks connection could not be completed. Return to Route Logistics and reconnect from Company Integrations.');
      } finally {
        if (claim && identity) await db.runTransaction(async tx => { const latest = await tx.get(claim); if (latest.get('attemptId') === identity.attemptId) tx.set(claim, { expiresAt: 0 }, { merge: true }); }).catch(() => {});
      }
    },
    disconnect: async request => {
      const companyId = await scope(request, true), ref = connectionRef(companyId), attemptId = randomBytes(16).toString('hex'), connectionId = randomBytes(16).toString('hex');
      const previous = await db.runTransaction(async tx => {
        const [snap, intent, company] = await Promise.all([tx.get(ref), tx.get(intentRef(companyId)), tx.get(db.doc(`companies/${companyId}`))]);
        if (company.get('ownerId') !== request.auth.uid) throw new HttpsError('permission-denied', 'Only the current company owner can disconnect QuickBooks.');
        if (intent.get('disconnectLeaseUntil') > Date.now()) return null;
        const old = snap.data(), revoke = old?.connected === true && !!old.refreshToken;
        const realm = old?.realmId ? await tx.get(realmRef(old.realmId)) : null;
        tx.set(ref, { companyId, environment: environment(), connected: false, accessToken: null, refreshToken: null, connectionId, refreshLeaseId: null, refreshLeaseUntil: 0, disconnectedAt: new Date(), disconnectWarning: null }, { merge: true });
        tx.set(intentRef(companyId), { companyId, environment: environment(), userId: request.auth.uid, attemptId, status: revoke ? 'disconnecting' : 'disconnected', disconnectLeaseUntil: revoke ? Date.now()+60000 : 0, updatedAt: new Date(), lastError: null });
        if (realm?.get('companyId') === companyId) tx.set(realm.ref, { active: false }, { merge: true });
        tx.create(db.collection('rlQbAudit').doc(), { action: 'oauth.disconnected', companyId, environment: environment(), actorId: request.auth.uid, createdAt: new Date() });
        return revoke ? old : null;
      });
      if (!previous) return { disconnected: true };
      let warning = null, uncertain = false, httpStatus = null, failureCategory = null; const revokeStarted = Date.now();
      // Intuit confirms revocation by HTTP status; its successful body can be empty.
      try { ensureEnabled(); if (previous.credentialHash && previous.credentialHash !== currentCredentialHash()) throw new HttpsError('failed-precondition', 'Credentials changed.'); const result = await http('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', { method: 'POST', headers: { Authorization: `Basic ${credentials()}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ token: previous.refreshToken }) }, { parseJson: false }); httpStatus = result.httpStatus; }
      catch (error) { warning = 'QuickBooks is disconnected in Route Logistics. Intuit could not confirm revocation; reconnect to authorize again.'; uncertain = error.code === 'unavailable'; httpStatus = Number.isInteger(error.providerStatus) ? error.providerStatus : null; failureCategory = error.providerFailure || (httpStatus ? 'http-error' : 'configuration'); }
      await db.runTransaction(async tx => {
        const [latest, intent] = await Promise.all([tx.get(ref), tx.get(intentRef(companyId))]);
        if (latest.get('connectionId') === connectionId && intent.get('attemptId') === attemptId) {
          tx.update(ref, { disconnectWarning: warning }); tx.update(intentRef(companyId), { status: 'disconnected', disconnectLeaseUntil: uncertain ? intent.get('disconnectLeaseUntil') : 0 });
          tx.create(db.collection('rlQbAudit').doc(), { action: 'oauth.revocation', companyId, environment: environment(), connectionId, outcome: warning ? 'unconfirmed' : 'confirmed', httpStatus, failureCategory, durationMs: Date.now()-revokeStarted, createdAt: new Date() });
        }
      });
      return { disconnected: true, ...(warning ? { warning } : {}) };
    },
    settings: async request => { const companyId = await scope(request, true), current = await connection(companyId); const incomeAccountId = remoteId(request.data?.incomeAccountId), defaultItemId = remoteId(request.data?.defaultItemId); const account = (await api(companyId, `account/${incomeAccountId}`, undefined, undefined, current)).Account, item = (await api(companyId, `item/${defaultItemId}`, undefined, undefined, current)).Item; if (!['Income', 'Other Income'].includes(account.AccountType) || account.Active === false || item.Active === false || item.Type !== 'Service') throw new HttpsError('invalid-argument', 'Choose an active income account and service item.'); await db.runTransaction(async tx => { await checkCurrent(tx, companyId, current, request.auth.uid); tx.update(connectionRef(companyId), { incomeAccountId, defaultItemId }); }); return { saved: true }; },
    adopt: async request => {
      const companyId = await scope(request, true), { type, localId } = request.data || {}, id = remoteId(request.data?.remoteId), local = await source(companyId, type, localId);
      const current = await connection(companyId), remote = (await api(companyId, `${type.toLowerCase()}/${id}`, undefined, undefined, current))[type];
      if (!remote?.Id || String(remote.Id) !== id) throw new HttpsError('not-found', 'Accounting record not found.');
      const unique = db.doc(`rlQbRemoteMappings/${hash(`${environment()}:${current.realmId}:${type}:${id}`)}`), ref = mapRef(companyId, type, localId);
      await db.runTransaction(async tx => {
        const [taken, previous, latestSource] = await Promise.all([tx.get(unique), tx.get(ref), tx.get(local.ref)]); await checkCurrent(tx, companyId, current, request.auth.uid);
        if (latestSource.get('companyId') !== companyId) throw new HttpsError('permission-denied', 'Accounting source is no longer available.');
        if (taken.exists && (taken.get('companyId') !== companyId || taken.get('localId') !== localId)) throw new HttpsError('already-exists', 'This accounting record is already mapped.');
        if (previous.exists && (previous.get('remoteId') !== id || previous.get('realmId') !== current.realmId)) throw new HttpsError('failed-precondition', 'Changing an existing mapping requires a reviewed migration.');
        const data = { companyId, environment: environment(), realmId: current.realmId, type, localId, remoteId: id, syncToken: String(remote.SyncToken), status: 'adopted', adoptedBy: request.auth.uid, adoptedAt: new Date() };
        tx.set(ref, data); tx.set(unique, { companyId, localId }); tx.create(db.collection('rlQbAudit').doc(), { ...data, previous: previous.data() || null });
      });
      return { adopted: true, displayName: remote.DisplayName || remote.Name || remote.DocNumber || id };
    },
    preview: async (request) => { const companyId = await scope(request); const result = await preview(companyId, request.data?.type, request.data?.localId); return { payload: result.body, fingerprint: result.sourceHash, action: result.map.exists ? 'update' : 'create', environment: environment(), writesEnabled: config.writesEnabled?.() === true }; },
    sync: async (request) => {
      const companyId = await scope(request, true); if (config.writesEnabled?.() !== true) throw new HttpsError('failed-precondition', 'Accounting writes are disabled. Review and authorize the integration before enabling them.');
      const { type, localId, fingerprint } = request.data || {};
      await source(companyId, type, localId);
      if (!/^[a-f0-9]{64}$/.test(fingerprint || '')) throw new HttpsError('invalid-argument', 'Preview this record first.');
      const currentConnection = await connection(companyId);
      const requestId = hash(`${companyId}:${environment()}:${currentConnection.realmId}:${type}:${localId}:${fingerprint}`).slice(0, 48), operation = db.doc(`rlQbOperations/${requestId}`), lease = randomBytes(16).toString('hex');
      const prior = await operation.get();
      if (prior.get('status') === 'synced') return { status: 'synced', remoteId: prior.get('remoteId') };
      // A lost provider response must retry the exact original body and request ID,
      // even if the provider already incremented SyncToken. Never create a new operation.
      if (prior.exists && (prior.get('connectionId') !== currentConnection.connectionId || Date.now() - prior.get('createdAt') > 23 * 3600000)) throw new HttpsError('failed-precondition', 'An uncertain export requires accounting review before retrying.');
      const result = prior.exists ? { body: prior.get('payload'), sourceHash: fingerprint, current: currentConnection } : await preview(companyId, type, localId);
      if (fingerprint !== result.sourceHash) throw new HttpsError('aborted', 'The record changed. Preview it again.');
      const saved = await db.runTransaction(async (tx) => { const previous = await tx.get(operation); if (previous.get('status') === 'synced') return previous.data(); if (previous.get('leaseUntil') > Date.now()) throw new HttpsError('unavailable', 'This record is already syncing. Retry shortly.'); if ((previous.get('attempts') || 0) >= 5) throw new HttpsError('failed-precondition', 'Sync retry limit reached. Review the accounting record.'); tx.set(operation, { companyId, environment: environment(), type, localId, payload: result.body, connectionId: currentConnection.connectionId, createdAt: previous.get('createdAt') || Date.now(), status: 'syncing', lease, leaseUntil: Date.now() + 60000, attempts: (previous.get('attempts') || 0) + 1 }, { merge: true }); return null; });
      if (saved) return { status: 'synced', remoteId: saved.remoteId };
      try {
        const remote = (await api(companyId, type.toLowerCase(), result.body, requestId, result.current))[type];
        const unique = db.doc(`rlQbRemoteMappings/${hash(`${environment()}:${result.current.realmId}:${type}:${remote.Id}`)}`);
        await db.runTransaction(async (tx) => { const [current, taken] = await Promise.all([tx.get(operation), tx.get(unique)]); await checkCurrent(tx, companyId, result.current, request.auth.uid); if (current.get('lease') !== lease) throw new HttpsError('aborted', 'Sync lease changed.'); if (taken.exists && (taken.get('companyId') !== companyId || taken.get('localId') !== localId)) throw new HttpsError('already-exists', 'Accounting record is already mapped.'); tx.set(mapRef(companyId, type, localId), { companyId, environment: environment(), realmId: result.current.realmId, type, localId, remoteId: String(remote.Id), syncToken: String(remote.SyncToken), status: 'synced', sourceHash: fingerprint, lastSyncedAt: new Date().toISOString() }); tx.set(unique, { companyId, localId }); tx.update(operation, { status: 'synced', remoteId: String(remote.Id), leaseUntil: 0 }); }); return { status: 'synced', remoteId: String(remote.Id) };
      } catch (error) { await operation.update({ status: 'failed', leaseUntil: 0, error: safeError(error) }); throw error; }
    },
    reconcile: async (request) => { const companyId = await scope(request); const mapping = await mapRef(companyId, 'Invoice', documentId(request.data?.localId)).get(); if (!mapping.exists) throw new HttpsError('failed-precondition', 'Map the invoice first.'); await reconcileInvoice(companyId, mapping.get('remoteId')); return { reconciled: true }; },
    webhook: async (req, res) => {
      if (!enabled() || !productionApproved() || environment() !== credentialEnvironment() || !validSignature(req.rawBody, req.headers['intuit-signature'], config.webhookSecret?.())) return res.status(401).send('Invalid or disabled webhook');
      try {
        const body = JSON.parse(req.rawBody.toString('utf8')); const notifications = body.eventNotifications; if (!Array.isArray(notifications)) return res.status(400).send('Invalid notification');
        for (const group of notifications.slice(0, 100)) {
          const realmId = remoteId(group.realmId), realm = await realmRef(realmId).get();
          if (!realm.exists || realm.get('active') === false) continue;
          const companyId = documentId(realm.get('companyId')), connection = await connectionRef(companyId).get(), current = connection.data();
          if (!current?.connected || current.companyId !== companyId || current.environment !== environment() || current.realmId !== realmId) continue;
          for (const entity of (group.dataChangeEvent?.entities || []).slice(0, 100)) {
            if (!['Customer', 'Item', 'Invoice', 'Payment'].includes(entity.name)) continue;
            const id = remoteId(entity.id), ref = db.doc(`rlQbWebhookEvents/${hash(`${environment()}:${realmId}:${current.connectionId}:${entity.name}:${id}:${entity.operation}:${entity.lastUpdated}`)}`);
            await db.runTransaction(async tx => {
              const [seen, latestRealm] = await Promise.all([tx.get(ref), tx.get(realm.ref)]);
              const latest = await tx.get(connection.ref);
              if (seen.exists || !sameConnection(latest.data(), current) || latestRealm.get('companyId') !== companyId || latestRealm.get('active') === false) return;
              tx.create(ref, { companyId, environment: environment(), realmId, connectionId: current.connectionId, type: entity.name, remoteId: id, status: 'pending', attempts: 0, nextAttempt: 0, createdAt: new Date() });
            });
          }
        }
        return res.status(200).send('Accepted');
      } catch { return res.status(503).send('Retry notification'); }
    },
    drain: async () => {
      if (!enabled() || !productionApproved() || environment() !== credentialEnvironment()) return;
      const rows = await db.collection('rlQbWebhookEvents').where('status', '==', 'pending').where('environment', '==', environment()).limit(100).get();
      for (const row of rows.docs) {
        const lease = randomBytes(16).toString('hex');
        const data = await db.runTransaction(async tx => {
          const latest = await tx.get(row.ref);
          if (latest.get('status') !== 'pending' || latest.get('nextAttempt') > Date.now() || latest.get('leaseUntil') > Date.now()) return null;
          tx.update(row.ref, { lease, leaseUntil: Date.now()+60000 }); return latest.data();
        });
        if (!data) continue;
        const finish = patch => db.runTransaction(async tx => { const latest = await tx.get(row.ref); if (latest.get('lease') === lease) tx.update(row.ref, { ...patch, leaseUntil: 0 }); });
        try {
          const current = await eventConnection(data);
          if (!current) { await finish({ status: 'superseded', error: 'The accounting connection changed. Check the current company payment balance if needed.', completedAt: new Date() }); continue; }
          if (data.type === 'Invoice') await reconcileInvoice(data.companyId, data.remoteId, current);
          else if (data.type === 'Payment') {
            const id = remoteId(data.remoteId), payment = (await api(data.companyId, `payment/${id}`, undefined, undefined, current)).Payment;
            if (!payment || String(payment.Id) !== id) throw new HttpsError('failed-precondition', 'QuickBooks returned a different payment. Review the accounting record.');
            const ids = [...new Set((payment.Line || []).flatMap(line => (line.LinkedTxn || []).filter(link => link.TxnType === 'Invoice').map(link => remoteId(link.TxnId))))].slice(0,100), invoiceIds = [];
            for (const invoiceId of ids) invoiceIds.push(...await reconcileInvoice(data.companyId, invoiceId, current));
            const ref = db.doc(`rlQbPaymentMappings/${hash(`${data.companyId}:${environment()}:${current.realmId}:${id}`)}`);
            await db.runTransaction(async tx => { await checkCurrent(tx, data.companyId, current); tx.set(ref, { companyId: data.companyId, environment: environment(), realmId: current.realmId, connectionId: current.connectionId, remotePaymentId: id, remoteInvoiceIds: ids, invoiceIds: [...new Set(invoiceIds)], syncToken: String(payment.SyncToken || ''), updatedAt: new Date() }); });
          }
          if (!(await eventConnection(data))) { await finish({ status: 'superseded', completedAt: new Date() }); continue; }
          await finish({ status: ['Invoice', 'Payment'].includes(data.type) ? 'reconciled' : 'review', completedAt: new Date(), error: null });
        } catch (error) { const attempts = (data.attempts || 0)+1; await finish({ attempts, status: attempts >= 5 ? 'failed' : 'pending', nextAttempt: Date.now()+Math.min(3600000,60000*2**attempts), error: safeError(error) }); }
      }
    },
    // Exposed to emulator tests; no client endpoint returns credentials.
    connection, api,
  };
}
module.exports = { quickBooksHandlers, validSignature, mappingId };
