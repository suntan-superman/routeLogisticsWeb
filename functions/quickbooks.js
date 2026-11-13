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
  const environment = () => config.environment?.() === 'production' ? 'production' : 'sandbox';
  const enabled = () => config.enabled?.() === true;
  const connectionRef = (companyId) => db.doc(`rlQuickBooksConnections/${mappingId(companyId, environment(), 'connection', 'current')}`);
  const mapRef = (companyId, type, id) => db.doc(`rlQbMappings/${mappingId(companyId, environment(), type, id)}`);
  const ensureEnabled = () => { if (!enabled()) throw new HttpsError('failed-precondition', 'QuickBooks connection is awaiting configuration.'); };
  const credentials = () => Buffer.from(`${config.clientId()}:${config.clientSecret()}`).toString('base64');
  async function http(url, options) {
    const response = await transport(url, { ...options, signal: AbortSignal.timeout(20000) });
    if (!response.ok) { const error = new HttpsError(response.status === 401 ? 'unauthenticated' : [429, 500, 502, 503, 504].includes(response.status) ? 'unavailable' : 'failed-precondition', response.status === 401 ? 'Reconnect QuickBooks to renew access.' : `QuickBooks request failed (${response.status}). Review the connection and accounting record.`); error.providerStatus = response.status; throw error; }
    if (response.status === 204) return {};
    return response.json();
  }
  const tokenRequest = (values) => http('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', { method: 'POST', headers: { Authorization: `Basic ${credentials()}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(values).toString() });
  const tokenFields = (data) => { if (!data.access_token || !data.refresh_token) throw new HttpsError('unavailable', 'QuickBooks did not provide a complete connection. Reconnect.'); return { accessToken: data.access_token, refreshToken: data.refresh_token, accessExpiresAt: Date.now() + Number(data.expires_in || 3600) * 1000, refreshExpiresAt: Date.now() + Number(data.x_refresh_token_expires_in || 8640000) * 1000 }; };
  async function connection(companyId) {
    ensureEnabled(); const ref = connectionRef(companyId), leaseId = randomBytes(16).toString('hex');
    const state = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref), current = snap.data();
      if (!current?.connected) throw new HttpsError('failed-precondition', 'Connect this company to QuickBooks first.');
      if (current.accessExpiresAt > Date.now() + 120000) return { current, refresh: false };
      if (current.refreshLeaseUntil > Date.now()) throw new HttpsError('unavailable', 'QuickBooks access is refreshing. Retry shortly.');
      tx.update(ref, { refreshLeaseId: leaseId, refreshLeaseUntil: Date.now() + 60000 }); return { current, refresh: true };
    });
    if (!state.refresh) return state.current;
    try {
      const tokens = tokenFields(await tokenRequest({ grant_type: 'refresh_token', refresh_token: state.current.refreshToken }));
      await db.runTransaction(async (tx) => { const latest = await tx.get(ref); if (!latest.get('connected') || latest.get('refreshLeaseId') !== leaseId || latest.get('connectionId') !== state.current.connectionId) throw new HttpsError('aborted', 'QuickBooks connection changed.'); tx.update(ref, { ...tokens, refreshLeaseUntil: 0, updatedAt: new Date() }); });
      return { ...state.current, ...tokens };
    } catch (error) { await db.runTransaction(async (tx) => { const latest = await tx.get(ref); if (latest.get('refreshLeaseId') === leaseId) tx.update(ref, { refreshLeaseUntil: 0, lastError: error.message }); }); throw error; }
  }
  async function api(companyId, path, body, requestId) {
    const current = await connection(companyId);
    const host = environment() === 'sandbox' ? 'sandbox-quickbooks.api.intuit.com' : 'quickbooks.api.intuit.com';
    const url = new URL(`https://${host}/v3/company/${remoteId(current.realmId)}/${path}`);
    if (requestId) url.searchParams.set('requestid', requestId);
    return http(url.href, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${current.accessToken}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  async function scope(request, owner = false) {
    const { uid, token } = requireAuth(request, true), companyId = documentId(token.companyId, 'company');
    if (owner) await requireCompanyOwner(db, request, companyId);
    else if ((await requireStaff(db, request, companyId)).role === 'technician') throw new HttpsError('permission-denied', 'Manager access required.');
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
    if (Math.abs(lines.reduce((sum, line) => sum + line.Amount, 0) - Number(data.total)) > 0.011) throw new HttpsError('failed-precondition', 'Invoice totals require review.');
    return { CustomerRef: { value: customer.get('remoteId') }, Line: lines, ...(data.invoiceNumber ? { DocNumber: String(data.invoiceNumber).slice(0, 21) } : {}), ...(data.issueDate ? { TxnDate: data.issueDate } : {}), ...(data.dueDate ? { DueDate: data.dueDate } : {}) };
  }
  async function preview(companyId, type, id) {
    const snap = await source(companyId, type, id), current = await connection(companyId), map = await mapRef(companyId, type, id).get();
    if (map.exists && map.get('realmId') !== current.realmId) throw new HttpsError('failed-precondition', 'Existing mapping belongs to a different QuickBooks company.');
    const body = await payload(companyId, type, snap, current);
    if (map.exists) {
      const remote = (await api(companyId, `${type.toLowerCase()}/${remoteId(map.get('remoteId'))}`))[type];
      if (String(remote.SyncToken) !== map.get('syncToken')) throw new HttpsError('aborted', 'This record changed in QuickBooks. Review and adopt its latest version before retrying.');
      Object.assign(body, { Id: remote.Id, SyncToken: remote.SyncToken, sparse: true });
    }
    return { body, sourceHash: hash(JSON.stringify(body)), map, current, source: snap };
  }
  async function reconcileInvoice(companyId, remoteInvoiceId) {
    const current = await connection(companyId), remote = (await api(companyId, `invoice/${remoteId(remoteInvoiceId)}`)).Invoice;
    const maps = await db.collection('rlQbMappings').where('companyId', '==', companyId).where('environment', '==', environment()).where('type', '==', 'Invoice').where('remoteId', '==', String(remote.Id)).get();
    for (const mapping of maps.docs) {
      if (mapping.get('realmId') !== current.realmId) continue;
      const ref = db.doc(`invoices/${documentId(mapping.get('localId'))}`), eventRef = db.doc(`rlQbReconciliations/${hash(`${mapping.id}:${remote.SyncToken}:${remote.Balance}:${remote.TotalAmt}`)}`);
      await db.runTransaction(async (tx) => {
        const [invoice, seen] = await Promise.all([tx.get(ref), tx.get(eventRef)]); if (seen.exists) return;
        const eligible = invoice.get('companyId') === companyId && ['sent', 'paid'].includes(invoice.get('status')) && !invoice.get('paymentLock') && (remote.CurrencyRef?.value || 'USD') === 'USD' && Math.abs(Number(invoice.get('total')) - Number(remote.TotalAmt)) < 0.011 && Number.isFinite(Number(remote.Balance)) && Number(remote.Balance) >= 0 && Number(remote.Balance) <= Number(remote.TotalAmt);
        const paid = eligible && Number(remote.Balance) === 0;
        const updates = environment() === 'sandbox' ? { qbTestPaymentStatus: paid ? 'paid' : eligible ? 'open' : 'review' } : { qbBalance: Number(remote.Balance) || 0, qbPaymentReview: !eligible || (invoice.get('status') === 'paid' && !paid), ...(paid && invoice.get('status') === 'sent' ? { status: 'paid', paidAt: new Date().toISOString(), paidVia: 'quickbooks' } : {}) };
        if (invoice.exists && invoice.get('companyId') === companyId) tx.update(ref, { ...updates, qbReconciledAt: new Date().toISOString() });
        tx.create(eventRef, { companyId, environment: environment(), invoiceId: ref.id, remoteId: String(remote.Id), eligible, paid, createdAt: new Date() });
      });
    }
  }
  return {
    status: async (request) => { const companyId = await scope(request), snap = await connectionRef(companyId).get(); const maps = await db.collection('rlQbMappings').where('companyId', '==', companyId).where('environment', '==', environment()).limit(200).get(); return { enabled: enabled(), environment: environment(), writesEnabled: config.writesEnabled?.() === true, connected: snap.get('connected') === true, realmId: snap.get('realmId') || null, lastError: snap.get('lastError') || null, incomeAccountId: snap.get('incomeAccountId') || '', defaultItemId: snap.get('defaultItemId') || '', mappings: maps.docs.map((row) => ({ type: row.get('type'), localId: row.get('localId'), remoteId: row.get('remoteId'), status: row.get('status'), lastSyncedAt: row.get('lastSyncedAt') || null })) }; },
    begin: async (request) => { const companyId = await scope(request, true); ensureEnabled(); const state = randomBytes(32).toString('hex'); await db.doc(`rlQbOAuthStates/${hash(state)}`).create({ companyId, userId: request.auth.uid, environment: environment(), expiresAt: Date.now() + 600000, used: false }); const url = new URL('https://appcenter.intuit.com/connect/oauth2'); Object.entries({ client_id: config.clientId(), scope: 'com.intuit.quickbooks.accounting', redirect_uri: config.redirectUri(), response_type: 'code', state }).forEach(([key, value]) => url.searchParams.set(key, value)); return { url: url.href }; },
    callback: async (req, res) => {
      try {
        ensureEnabled(); const state = String(req.query.state || ''), code = String(req.query.code || ''), realmId = remoteId(req.query.realmId);
        if (!/^[a-f0-9]{64}$/.test(state) || !code || code.length > 4000) throw new Error('Invalid callback');
        const ref = db.doc(`rlQbOAuthStates/${hash(state)}`);
        const identity = await db.runTransaction(async (tx) => { const saved = await tx.get(ref); if (!saved.exists || saved.get('used') || saved.get('expiresAt') < Date.now() || saved.get('environment') !== environment()) throw new Error('Expired state'); const company = await tx.get(db.doc(`companies/${saved.get('companyId')}`)); if (company.get('ownerId') !== saved.get('userId')) throw new Error('Owner changed'); tx.update(ref, { used: true }); return saved.data(); });
        const tokens = tokenFields(await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri() }));
        const realm = db.doc(`rlQbRealms/${hash(`${environment()}:${realmId}`)}`), connection = connectionRef(identity.companyId);
        await db.runTransaction(async (tx) => { const [existing, old] = await Promise.all([tx.get(realm), tx.get(connection)]); if (existing.exists && existing.get('companyId') !== identity.companyId) throw new Error('Realm already connected'); if (old.get('realmId') && old.get('realmId') !== realmId) throw new Error('Changing accounting company requires mapping review'); tx.set(realm, { companyId: identity.companyId, realmId, environment: environment() }); tx.set(connection, { ...tokens, companyId: identity.companyId, realmId, environment: environment(), connected: true, connectionId: randomBytes(16).toString('hex'), connectedBy: identity.userId, updatedAt: new Date(), lastError: null, refreshLeaseUntil: 0 }, { merge: true }); });
        res.redirect(303, `${config.appUrl()}/integrations?connected=1`);
      } catch { res.status(400).send('QuickBooks connection could not be completed. Return to Route Logistics and reconnect from Company Integrations.'); }
    },
    disconnect: async (request) => { const companyId = await scope(request, true), ref = connectionRef(companyId), snap = await ref.get(); if (snap.get('connected')) { ensureEnabled(); await http('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', { method: 'POST', headers: { Authorization: `Basic ${credentials()}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ token: snap.get('refreshToken') }) }); } await ref.set({ connected: false, accessToken: null, refreshToken: null, refreshLeaseUntil: 0, disconnectedAt: new Date() }, { merge: true }); return { disconnected: true }; },
    settings: async (request) => { const companyId = await scope(request, true); const incomeAccountId = remoteId(request.data?.incomeAccountId), defaultItemId = remoteId(request.data?.defaultItemId); const account = (await api(companyId, `account/${incomeAccountId}`)).Account, item = (await api(companyId, `item/${defaultItemId}`)).Item; if (!['Income', 'Other Income'].includes(account.AccountType) || account.Active === false || item.Active === false || item.Type !== 'Service') throw new HttpsError('invalid-argument', 'Choose an active income account and service item.'); await connectionRef(companyId).update({ incomeAccountId, defaultItemId }); return { saved: true }; },
    adopt: async (request) => { const companyId = await scope(request, true), { type, localId } = request.data || {}, id = remoteId(request.data?.remoteId); await source(companyId, type, localId); const current = await connection(companyId), remote = (await api(companyId, `${type.toLowerCase()}/${id}`))[type]; if (!remote?.Id) throw new HttpsError('not-found', 'Accounting record not found.'); const unique = db.doc(`rlQbRemoteMappings/${hash(`${environment()}:${current.realmId}:${type}:${id}`)}`), ref = mapRef(companyId, type, localId); await db.runTransaction(async (tx) => { const [taken, previous] = await Promise.all([tx.get(unique), tx.get(ref)]); if (taken.exists && (taken.get('companyId') !== companyId || taken.get('localId') !== localId)) throw new HttpsError('already-exists', 'This accounting record is already mapped.'); if (previous.exists && previous.get('remoteId') !== id) throw new HttpsError('failed-precondition', 'Changing an existing mapping requires a reviewed migration.'); const data = { companyId, environment: environment(), realmId: current.realmId, type, localId, remoteId: id, syncToken: String(remote.SyncToken), status: 'adopted', adoptedBy: request.auth.uid, adoptedAt: new Date() }; tx.set(ref, data); tx.set(unique, { companyId, localId }); tx.create(db.collection('rlQbAudit').doc(), { ...data, previous: previous.data() || null }); }); return { adopted: true, displayName: remote.DisplayName || remote.Name || remote.DocNumber || id }; },
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
        const remote = (await api(companyId, type.toLowerCase(), result.body, requestId))[type];
        const unique = db.doc(`rlQbRemoteMappings/${hash(`${environment()}:${result.current.realmId}:${type}:${remote.Id}`)}`);
        await db.runTransaction(async (tx) => { const current = await tx.get(operation); if (current.get('lease') !== lease) throw new HttpsError('aborted', 'Sync lease changed.'); tx.set(mapRef(companyId, type, localId), { companyId, environment: environment(), realmId: result.current.realmId, type, localId, remoteId: String(remote.Id), syncToken: String(remote.SyncToken), status: 'synced', sourceHash: fingerprint, lastSyncedAt: new Date().toISOString() }); tx.set(unique, { companyId, localId }); tx.update(operation, { status: 'synced', remoteId: String(remote.Id), leaseUntil: 0 }); }); return { status: 'synced', remoteId: String(remote.Id) };
      } catch (error) { await operation.update({ status: 'failed', leaseUntil: 0, error: error.message }); throw error; }
    },
    reconcile: async (request) => { const companyId = await scope(request); const mapping = await mapRef(companyId, 'Invoice', documentId(request.data?.localId)).get(); if (!mapping.exists) throw new HttpsError('failed-precondition', 'Map the invoice first.'); await reconcileInvoice(companyId, mapping.get('remoteId')); return { reconciled: true }; },
    webhook: async (req, res) => {
      if (!enabled() || !validSignature(req.rawBody, req.headers['intuit-signature'], config.webhookSecret?.())) return res.status(401).send('Invalid signature');
      try {
        const body = JSON.parse(req.rawBody.toString('utf8')); const notifications = body.eventNotifications; if (!Array.isArray(notifications)) return res.status(400).send('Invalid notification');
        for (const group of notifications.slice(0, 100)) { const realmId = remoteId(group.realmId), realm = await db.doc(`rlQbRealms/${hash(`${environment()}:${realmId}`)}`).get(); if (!realm.exists) continue; for (const entity of (group.dataChangeEvent?.entities || []).slice(0, 100)) { if (!['Customer', 'Item', 'Invoice', 'Payment'].includes(entity.name)) continue; const id = remoteId(entity.id), ref = db.doc(`rlQbWebhookEvents/${hash(`${environment()}:${realmId}:${entity.name}:${id}:${entity.operation}:${entity.lastUpdated}`)}`); await db.runTransaction(async (tx) => { if (!(await tx.get(ref)).exists) tx.create(ref, { companyId: realm.get('companyId'), environment: environment(), realmId, type: entity.name, remoteId: id, status: 'pending', attempts: 0, nextAttempt: 0, createdAt: new Date() }); }); } }
        return res.status(200).send('Accepted');
      } catch { return res.status(503).send('Retry notification'); }
    },
    drain: async () => {
      if (!enabled()) return;
      const rows = await db.collection('rlQbWebhookEvents').where('status', '==', 'pending').limit(100).get();
      for (const row of rows.docs) {
        const data = row.data(); if (data.environment !== environment() || data.nextAttempt > Date.now()) continue;
        try { if (data.type === 'Invoice') await reconcileInvoice(data.companyId, data.remoteId); else if (data.type === 'Payment') { const payment = (await api(data.companyId, `payment/${remoteId(data.remoteId)}`)).Payment; const ids = new Set((payment.Line || []).flatMap((line) => (line.LinkedTxn || []).filter((link) => link.TxnType === 'Invoice').map((link) => link.TxnId))); for (const id of ids) await reconcileInvoice(data.companyId, id); } await row.ref.update({ status: ['Invoice', 'Payment'].includes(data.type) ? 'reconciled' : 'review', completedAt: new Date() }); }
        catch (error) { const attempts = data.attempts + 1; await row.ref.update({ attempts, status: attempts >= 5 ? 'failed' : 'pending', nextAttempt: Date.now() + Math.min(3600000, 60000 * 2 ** attempts), error: error.message }); }
      }
    },
    // Exposed to emulator tests; no client endpoint returns credentials.
    connection, api,
  };
}
module.exports = { quickBooksHandlers, validSignature, mappingId };
