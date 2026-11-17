// Synthetic local-emulator records only. Never connects to production/providers.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict'), path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app'), { getFirestore } = req('firebase-admin/firestore');
const { estimateHandlers } = require('../functions/estimates');
const { serviceAreaHandlers } = require('../functions/serviceAreas');
const { invoiceHandlers } = require('../functions/invoices');
const { hash } = require('../functions/security');
let app, db, sequence = 0;
before(() => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local Firestore emulator required; production access forbidden.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'invoice-integrity-tests'); db = getFirestore(app);
});
after(() => deleteApp(app));
async function fixture({ amount = 100, missingAmount = false } = {}) {
  const id = `invoice-integrity-${process.pid}-${++sequence}`, uid = `${id}-owner`, customerId = `${id}-customer`, jobId = `${id}-job`;
  await db.doc(`companies/${id}`).set({ ownerId: uid, name: 'Synthetic invoice company' });
  for (const role of ['admin', 'manager', 'technician']) await db.doc(`teamMembers/${id}-${role}`).set({ companyId: id, uid: `${id}-${role}`, role, status: 'active' });
  await db.doc(`customers/${customerId}`).set({ userId: uid, companyId: id, name: 'Synthetic customer', email: `${id}@example.invalid`, isActive: true, address: '100 Synthetic Street, Example, CA 93312' });
  await db.doc(`jobs/${jobId}`).set({ userId: uid, companyId: id, customerId, serviceType: 'Synthetic service', date: '2026-11-16', time: '09:00', status: 'completed', ...(missingAmount ? {} : { totalCost: amount }), updatedAt: '2026-11-16T18:00:00.000Z' });
  const f = { id, uid, customerId, jobId, concurrent: 0, reads: 0, waiting: [], operation: 0 };
  f.auth = (role = 'owner') => ({ uid: role === 'owner' ? uid : `${id}-${role}`, token: { companyId: id, role, ...(role === 'owner' ? {} : { membershipId: `${id}-${role}` }), email_verified: true } });
  f.request = (data, role = 'owner') => ({ data, auth: f.auth(role) });
  f.job = async () => ({ id: f.jobId, ...(await db.doc(`jobs/${f.jobId}`).get()).data() });
  f.handlers = invoiceHandlers(db);
  f.call = (data, role = 'owner') => f.handlers.handle(f.request(data, role));
  f.preview = (extra = {}, role = 'owner') => f.call({ action: 'preview', jobId: f.jobId, ...extra }, role);
  f.op = label => `${id}-${label}-${++f.operation}`;
  f.create = async ({ role = 'owner', preview, ...extra } = {}) => {
    const source = preview || await f.preview({}, role);
    return f.call({ action: 'create', jobId: f.jobId, operationId: f.op('create'), sourceFingerprint: source.sourceFingerprint, ...extra }, role);
  };
  f.stored = async result => (await db.doc(`invoices/${result.id || result.invoiceId}`).get()).data();
  f.status = (invoice, status, extra = {}, role = 'owner') => f.call({ action: 'status', invoiceId: invoice.id || invoice.invoiceId, expectedRevision: invoice.invoice?.revision ?? invoice.revision ?? 0, operationId: f.op(status), status, ...extra }, role);
  return f;
}
async function approvedConvertedJob(f) {
  const files = new Map(), now = () => Date.parse('2026-11-16T18:00:00Z');
  const bucket = { file: key => ({ save: async (bytes, options) => files.set(key, { bytes, options }), getMetadata: async () => [{ size: files.get(key).bytes.length }], download: async () => [files.get(key).bytes] }) };
  const serviceAreas = serviceAreaHandlers(db, { now, geocode: async address => ({ formattedAddress: address, latitude: 35, longitude: -119, postalCode: '93312', countryCode: 'US', locationType: 'PREMISE', streetAddressVerified: true }) });
  const handler = estimateHandlers(db, { enabled: () => true, emailEnabled: () => true, appUrl: () => 'https://example.invalid', bucketProvider: () => bucket, now, serviceAreas });
  const { estimate } = await handler.handle(f.request({ action: 'save', operationId: `${f.id}-estimate-save`, data: { customerId: f.customerId, title: 'Synthetic approved scope', serviceType: 'Synthetic quote service', scopeOfWork: 'Approved scope', lineItems: [{ kind: 'labor', description: 'Approved labor', quantity: 2, unitPrice: 40 }, { kind: 'material', description: 'Approved material', quantity: 1, unitPrice: 20 }], taxRate: 8.25, validDays: 30, photoIds: [] } }));
  await handler.handle(f.request({ action: 'review', estimateId: estimate.id, expectedVersion: estimate.version, decision: 'approve', comments: 'Synthetic management approval for the exact version.' }));
  const delivery = await handler.handle(f.request({ action: 'deliver', estimateId: estimate.id, expectedVersion: estimate.version }));
  const token = (await db.doc(`rlMail/${delivery.mailId}`).get()).get('text').match(/token=([a-f0-9]{64})/)[1];
  await handler.approval({ data: { action: 'approve', estimateId: estimate.id, token, signerName: 'Synthetic signer', acceptedTerms: true }, rawRequest: { ip: f.id } });
  const converted = await handler.handle(f.request({ action: 'convert', estimateId: estimate.id, expectedVersion: estimate.version, schedule: { date: '2026-12-01', time: '10:00' } }));
  f.jobId = converted.jobId; await db.doc(`jobs/${f.jobId}`).update({ status: 'completed' });
  return estimate;
}

test('A: actual approved estimate conversion preserves 100 subtotal, 8.25 tax, 108.25 total and approved lines in invoice', async () => {
  const f = await fixture(), estimate = await approvedConvertedJob(f);
  const result = await f.create(), invoice = await f.stored(result);
  assert.equal(invoice.subtotal, 100); assert.equal(invoice.tax, 8.25); assert.equal(invoice.total, 108.25);
  assert.deepEqual(invoice.lineItems.map(line => [line.description, line.quantity, line.unitPrice]), estimate.lineItems.map(line => [line.description, line.quantity, line.unitPrice]));
  assert.equal(invoice.estimateId, estimate.id); assert.equal(invoice.estimateVersion, estimate.version);
});

test('B: concurrent requests create exactly one canonical invoice for an eligible completed job', async () => {
  const f = await fixture(), preview = await f.preview();
  const results = await Promise.all([f.create({ preview }), f.create({ preview })]);
  assert.equal(new Set(results.map(result => result.id || result.invoiceId)).size, 1);
  assert.equal((await db.collection('invoices').where('companyId', '==', f.id).where('jobId', '==', f.jobId).get()).size, 1);
});

test('C: untrusted client prices and totals cannot replace canonical job pricing', async () => {
  const f = await fixture(), preview = await f.preview();
  await assert.rejects(f.create({ preview, lineItems: [{ description: 'Forged client price', quantity: 1, unitPrice: 1 }], total: 1, subtotal: 1, tax: 0 }), { code: 'invalid-argument' });
  assert.equal((await db.collection('invoices').where('companyId', '==', f.id).get()).size, 0);
});

test('five concurrent creation requests by owner and admin create one invoice, claim and billing audit effect', async () => {
  const f = await fixture(), preview = await f.preview();
  const results = await Promise.all(Array.from({ length: 5 }, (_, index) => f.create({ preview, role: index % 2 ? 'admin' : 'owner' })));
  assert.equal(new Set(results.map(row => row.id || row.invoiceId)).size, 1);
  for (const collection of ['invoices', 'rlInvoiceClaims', 'rlInvoiceOperations', 'rlInvoiceAudit']) {
    assert.equal((await db.collection(collection).where('companyId', '==', f.id).get()).size, 1, collection);
  }
  assert.equal((await db.collection('rlMail').where('companyId', '==', f.id).get()).size, 0);
});

test('preview alone exposes server-calculated terms without creating a financial record or delivery', async () => {
  const f = await fixture(), preview = await f.preview();
  assert.equal(preview.totalCents, 10000); assert.equal(preview.subtotalCents, 10000); assert.equal(preview.lineItems[0].description, 'Synthetic service'); assert.match(preview.sourceFingerprint, /^[a-f0-9]{64}$/);
  for (const collection of ['invoices', 'rlInvoiceClaims', 'rlInvoiceOperations', 'rlInvoiceAudit', 'rlMail']) assert.equal((await db.collection(collection).where('companyId', '==', f.id).get()).size, 0, collection);
});

test('stable operation replay after an apparent lost response returns the same identity and does not repeat audit', async () => {
  const f = await fixture(), preview = await f.preview(), operationId = f.op('lost-response');
  const payload = { action: 'create', jobId: f.jobId, sourceFingerprint: preview.sourceFingerprint, operationId };
  const first = await f.call(payload), replay = await f.call(payload);
  assert.equal(first.id || first.invoiceId, replay.id || replay.invoiceId);
  assert.equal((await db.collection('rlInvoiceOperations').where('companyId', '==', f.id).get()).size, 1);
  assert.equal((await db.collection('rlInvoiceAudit').where('companyId', '==', f.id).get()).size, 1);
  await assert.rejects(f.call({ ...payload, notes: 'Different request using consumed operation ID' }), error => ['already-exists', 'failed-precondition'].includes(error.code));
});

test('missing ordinary job amount fails and an explicit authorized zero-dollar source remains distinguishable', async () => {
  const missing = await fixture({ missingAmount: true });
  await assert.rejects(missing.preview(), error => error.code === 'failed-precondition' && /pric|amount|source/i.test(error.message));
  assert.equal((await db.collection('invoices').where('companyId', '==', missing.id).get()).size, 0);
  const zero = await fixture({ amount: 0 }), result = await zero.create(), invoice = await zero.stored(result);
  assert.equal(invoice.total, 0); assert.equal(invoice.totalCents, 0); assert.equal(invoice.subtotalCents, 0);
});

test('negative, fractional-cent, nonnumeric and nonfinite ordinary source amounts fail safely', async () => {
  for (const amount of [-1, 1.001, '100', NaN, Infinity]) {
    const f = await fixture({ amount }); await assert.rejects(f.preview(), error => ['invalid-argument', 'failed-precondition'].includes(error.code));
    assert.equal((await db.collection('invoices').where('companyId', '==', f.id).get()).size, 0);
  }
});

test('approved historical version controls pricing instead of current company prices or alternate job amount fields', async () => {
  const f = await fixture(), estimate = await approvedConvertedJob(f);
  await db.doc(`companies/${f.id}`).update({ servicePrice: 999 });
  await db.doc(`jobs/${f.jobId}`).update({ totalCost: 999, estimatedCost: 777, total: 888 });
  const result = await f.create(), invoice = await f.stored(result);
  assert.equal(invoice.totalCents, 10825); assert.equal(invoice.taxCents, 825); assert.equal(invoice.subtotalCents, 10000);
  assert.equal(invoice.estimateId, estimate.id); assert.equal(invoice.estimateVersion, 1);
  assert.equal(String(invoice.currency).toUpperCase(), 'USD');
  assert.equal((await db.doc(`rlEstimateVersions/${hash(`${estimate.id}:1`)}`).get()).get('totalCents'), 10825);
});

test('historical converted job without a copied billing snapshot resolves immutable approved terms and missing version requires review', async () => {
  const f = await fixture(), estimate = await approvedConvertedJob(f), job = await f.job();
  const historical = Object.fromEntries(Object.entries(job).filter(([key]) => !['id', 'billingSnapshot', 'billingSource', 'approvedBillingSnapshot', 'invoiceBillingSnapshot'].includes(key)));
  await db.doc(`jobs/${f.jobId}`).set(historical);
  const invoice = await f.stored(await f.create()); assert.equal(invoice.total, 108.25); assert.equal(invoice.estimateVersion, estimate.version);
  const missing = await fixture(); await approvedConvertedJob(missing); const incomplete = await missing.job(); delete incomplete.id; delete incomplete.estimateVersion;
  await db.doc(`jobs/${missing.jobId}`).set(incomplete);
  await assert.rejects(missing.preview(), error => error.code === 'failed-precondition' && /estimate|version|review/i.test(error.message));
});

test('foreign approved estimate and mismatched approved customer references cannot be billed', async () => {
  const local = await fixture(), foreign = await fixture(), quote = await approvedConvertedJob(foreign);
  await db.doc(`jobs/${local.jobId}`).update({ estimateId: quote.id, estimateVersion: quote.version });
  await assert.rejects(local.preview(), error => ['permission-denied', 'failed-precondition'].includes(error.code));
  const f = await fixture(); await approvedConvertedJob(f);
  await db.doc(`customers/${f.id}-other-customer`).set({ companyId: f.id, userId: f.uid, name: 'Another synthetic customer', isActive: true, email: 'different@example.invalid' });
  await db.doc(`jobs/${f.jobId}`).update({ customerId: `${f.id}-other-customer` });
  await assert.rejects(f.preview(), error => ['permission-denied', 'failed-precondition'].includes(error.code));
});

test('inconsistent stored approved arithmetic cannot become an authoritative invoice', async () => {
  const f = await fixture(), estimate = await approvedConvertedJob(f);
  await db.doc(`rlEstimateVersions/${hash(`${estimate.id}:1`)}`).update({ totalCents: 1 });
  await assert.rejects(f.preview(), error => error.code === 'failed-precondition');
  assert.equal((await db.collection('invoices').where('companyId', '==', f.id).get()).size, 0);
});

test('source change between preview and confirmed creation is an explicit conflict without a written invoice', async () => {
  const f = await fixture(), preview = await f.preview();
  await db.doc(`jobs/${f.jobId}`).update({ totalCost: 101, updatedAt: '2026-11-16T18:01:00.000Z' });
  await assert.rejects(f.create({ preview }), { code: 'aborted' });
  assert.equal((await db.collection('invoices').where('companyId', '==', f.id).get()).size, 0);
});

test('incomplete jobs, explicit nonbillable visits and unavailable canonical customers cannot be invoiced', async () => {
  for (const patch of [{ status: 'scheduled' }, { status: 'in-progress' }, { status: 'cancelled' }, { billable: false }, { kind: 'estimate' }]) {
    const f = await fixture(); await db.doc(`jobs/${f.jobId}`).update(patch); await assert.rejects(f.preview(), { code: 'failed-precondition' });
  }
  for (const invalid of ['missing', 'foreign', 'inactive']) {
    const f = await fixture();
    if (invalid === 'missing') await db.doc(`customers/${f.customerId}`).delete();
    if (invalid === 'foreign') await db.doc(`customers/${f.customerId}`).update({ companyId: 'other-company' });
    if (invalid === 'inactive') await db.doc(`customers/${f.customerId}`).update({ isActive: false });
    await assert.rejects(f.preview(), error => ['permission-denied', 'failed-precondition'].includes(error.code));
  }
});

test('owner and active admin may create while manager, technician, revoked and unverified identities are denied', async () => {
  const admin = await fixture(); assert.ok((await admin.create({ role: 'admin' })).id);
  for (const role of ['manager', 'technician']) {
    const f = await fixture(); await assert.rejects(f.preview({}, role), { code: 'permission-denied' });
  }
  const removed = await fixture(); await db.doc(`teamMembers/${removed.id}-admin`).update({ status: 'removed' });
  await assert.rejects(removed.preview({}, 'admin'), { code: 'permission-denied' });
  const f = await fixture(), unverified = f.request({ action: 'preview', jobId: f.jobId }); unverified.auth.token.email_verified = false;
  await assert.rejects(f.handlers.handle(unverified), { code: 'failed-precondition' });
});

test('membership revocation between the initial role check and invoice transaction is rechecked before financial commit', async () => {
  const f = await fixture(), preview = await f.preview({}, 'admin'); let transactions = 0;
  const scopedDb = { doc: db.doc.bind(db), collection: db.collection.bind(db), runTransaction: async (...args) => {
    transactions++; if (transactions === 2) await db.doc(`teamMembers/${f.id}-admin`).update({ status: 'removed' });
    return db.runTransaction(...args);
  } };
  const handlers = invoiceHandlers(scopedDb);
  await assert.rejects(handlers.handle(f.request({ action: 'create', jobId: f.jobId, operationId: f.op('revoked-during-create'), sourceFingerprint: preview.sourceFingerprint }, 'admin')), { code: 'permission-denied' });
  assert.equal((await db.collection('invoices').where('companyId', '==', f.id).get()).size, 0);
});

test('another tenant and a customer portal identity cannot create or revise native invoice terms', async () => {
  const f = await fixture(), other = await fixture();
  await assert.rejects(other.call({ action: 'preview', jobId: f.jobId }), { code: 'permission-denied' });
  const created = await f.create();
  await assert.rejects(other.call({ action: 'update', invoiceId: created.id, expectedRevision: 1, operationId: other.op('foreign-update'), changes: { notes: 'Foreign edit' } }), { code: 'permission-denied' });
  const portal = { uid: `rl_customer_${hash(`${f.id}@example.invalid`)}`, token: { portal: true, portalEmail: `${f.id}@example.invalid`, email_verified: true } };
  await assert.rejects(f.handlers.handle({ auth: portal, data: { action: 'create', jobId: f.jobId, operationId: f.op('portal') } }), { code: 'unauthenticated' });
});

test('historical random-ID invoice is returned unchanged even when the source job price is incomplete', async () => {
  const f = await fixture({ missingAmount: true }), historicalId = `${f.id}-random-invoice`;
  const historical = { id: 'wrong-legacy-data-id', userId: f.uid, companyId: f.id, customerId: f.customerId, jobId: f.jobId, invoiceNumber: 'HISTORICAL-UNCHANGED', status: 'sent', total: 57.25, subtotal: 50, tax: 7.25, notes: 'Historical value retained', createdAt: new Date('2024-01-01') };
  await db.doc(`invoices/${historicalId}`).set(historical);
  const before = (await db.doc(`invoices/${historicalId}`).get()).data(), result = await f.create();
  assert.equal(result.id, historicalId); assert.equal(result.invoiceId, historicalId); assert.equal(result.invoice.id, historicalId); assert.equal(result.existingInvoice.id, historicalId); assert.equal(result.existing, true);
  assert.deepEqual((await db.doc(`invoices/${historicalId}`).get()).data(), before);
  assert.equal((await db.collection('invoices').where('companyId', '==', f.id).get()).size, 1);
});

test('historical lookup sees beyond five void documents and multiple active historical invoices require review', async () => {
  const f = await fixture();
  for (let index = 0; index < 6; index++) await db.doc(`invoices/${f.id}-old-${index}`).set({ companyId: f.id, userId: f.uid, customerId: f.customerId, jobId: f.jobId, status: 'void', total: index });
  const live = `${f.id}-old-zzz-live`; await db.doc(`invoices/${live}`).set({ companyId: f.id, userId: f.uid, customerId: f.customerId, jobId: f.jobId, status: 'sent', total: 100 });
  assert.equal((await f.create()).id, live);
  const multiple = await fixture();
  for (const suffix of ['one', 'two']) await db.doc(`invoices/${multiple.id}-${suffix}`).set({ companyId: multiple.id, userId: multiple.uid, customerId: multiple.customerId, jobId: multiple.jobId, status: 'draft', total: 100 });
  const before = (await db.collection('invoices').where('companyId', '==', multiple.id).get()).docs.map(row => ({ id: row.id, ...row.data() }));
  await assert.rejects(multiple.preview(), error => error.code === 'failed-precondition' && /review|multiple|duplicate/i.test(error.message));
  const after = (await db.collection('invoices').where('companyId', '==', multiple.id).get()).docs.map(row => ({ id: row.id, ...row.data() })); assert.deepEqual(after, before);
});

test('ordinary create retry never replaces a void invoice; explicit concurrent replacement creates one next generation', async () => {
  const f = await fixture(), created = await f.create(), voided = await f.status(created, 'void');
  const oldId = created.id, oldBefore = (await db.doc(`invoices/${oldId}`).get()).data();
  const ordinary = await f.create(); assert.equal(ordinary.id, oldId); assert.equal(ordinary.replacementRequired, true);
  const expectedRevision = voided.invoice?.revision ?? voided.revision, preview = await f.preview({ replacementOf: oldId, expectedRevision });
  const replacement = () => f.call({ action: 'replace', jobId: f.jobId, replacementOf: oldId, expectedRevision, sourceFingerprint: preview.sourceFingerprint, operationId: f.op('replace') });
  const results = await Promise.all([replacement(), replacement(), replacement()]);
  assert.equal(new Set(results.map(row => row.id)).size, 1); assert.notEqual(results[0].id, oldId);
  assert.equal((await db.collection('invoices').where('companyId', '==', f.id).where('jobId', '==', f.jobId).get()).size, 2);
  assert.deepEqual((await db.doc(`invoices/${oldId}`).get()).data(), oldBefore);
});

test('draft metadata updates are revisioned and audited; stale or monetary changes do not overwrite it', async () => {
  const f = await fixture(), created = await f.create(), payload = { action: 'update', invoiceId: created.id, operationId: f.op('metadata'), expectedRevision: 1, changes: { notes: 'Reviewed invoice note', dueDate: '2026-12-20' } };
  const updated = await f.call(payload); assert.equal(updated.invoice.revision, 2); assert.equal(updated.invoice.notes, 'Reviewed invoice note');
  const replay = await f.call(payload); assert.equal(replay.invoice.revision, 2);
  await assert.rejects(f.call({ ...payload, operationId: f.op('stale'), changes: { notes: 'Stale overwriting note' } }), { code: 'aborted' });
  await assert.rejects(f.call({ ...payload, operationId: f.op('price'), expectedRevision: 2, changes: { total: 1, lineItems: [] } }), { code: 'invalid-argument' });
  const stored = await f.stored(created); assert.equal(stored.revision, 2); assert.equal(stored.total, 100);
  assert.equal((await db.collection('rlInvoiceAudit').where('companyId', '==', f.id).get()).size, 2);
});

test('historical invoice revision zero is explicit and stale mutations preserve its number, terms and history', async () => {
  const f = await fixture(), id = `${f.id}-legacy-revision-zero`, historical = { companyId: f.id, userId: f.uid, customerId: f.customerId, jobId: f.jobId, invoiceNumber: 'ORIGINAL-LEGACY-NUMBER', status: 'draft', lineItems: [{ description: 'Historical service', quantity: 1, unitPrice: 100, amount: 100 }], subtotal: 100, tax: 0, taxRate: 0, total: 100, issueDate: '2026-11-16', dueDate: '2026-11-30' };
  await db.doc(`invoices/${id}`).set(historical);
  await assert.rejects(f.call({ action: 'update', invoiceId: id, operationId: f.op('missing-revision'), changes: { notes: 'Missing displayed revision' } }), { code: 'invalid-argument' });
  const updated = await f.call({ action: 'update', invoiceId: id, expectedRevision: 0, operationId: f.op('legacy-revision'), changes: { notes: 'Explicit reviewed metadata only' } });
  assert.equal(updated.invoice.revision, 1); assert.equal(updated.invoice.invoiceNumber, historical.invoiceNumber); assert.deepEqual(updated.invoice.lineItems, historical.lineItems); assert.equal(updated.invoice.total, 100);
  await assert.rejects(f.call({ action: 'status', invoiceId: id, expectedRevision: 0, operationId: f.op('legacy-stale'), status: 'sent' }), { code: 'aborted' });
  assert.equal((await db.doc(`invoices/${id}`).get()).get('status'), 'draft');
});

test('malformed historical line amounts, aggregates and currency block issuance, payment marking and email without rewriting records', async () => {
  const { invoiceEmailHandlers } = require('../functions/invoiceEmail');
  const changes = [
    { lineItems: [{ description: 'Legacy service', quantity: 1, unitPrice: 100 }] },
    { lineItems: [{ description: 'Legacy service', quantity: 1, unitPrice: 100, amount: 1 }] },
    { subtotal: 1 }, { tax: 1 }, { currency: 'EUR' },
  ];
  for (const patch of changes) for (const status of ['draft', 'sent']) {
    const f = await fixture(), id = `${f.id}-malformed-historical`, original = { companyId: f.id, userId: f.uid, jobId: f.jobId, customerId: f.customerId, invoiceNumber: 'LEGACY-UNCHANGED', status, lineItems: [{ description: 'Legacy service', quantity: 1, unitPrice: 100, amount: 100 }], subtotal: 100, tax: 0, taxRate: 0, total: 100, ...patch };
    await db.doc(`invoices/${id}`).set(original); const before = (await db.doc(`invoices/${id}`).get()).data();
    await assert.rejects(f.call({ action: 'status', invoiceId: id, expectedRevision: 0, operationId: f.op('malformed-status'), status: status === 'draft' ? 'sent' : 'paid' }), error => error.code === 'failed-precondition' && /review/i.test(error.message));
    await assert.rejects(invoiceEmailHandlers(db, () => 'https://example.invalid', () => true).emailInvoice(f.request({ invoiceId: id, expectedRevision: 0 })), error => error.code === 'failed-precondition' && /review/i.test(error.message));
    assert.deepEqual((await db.doc(`invoices/${id}`).get()).data(), before);
    assert.equal((await db.collection('rlMail').where('invoiceId', '==', id).get()).size, 0);
    assert.equal((await db.collection('rlInvoiceAudit').where('companyId', '==', f.id).get()).size, 0);
  }
});

test('valid legacy terms retain revision-zero compatibility for explicit issuance, payment marking and deduplicated email', async () => {
  const { invoiceEmailHandlers } = require('../functions/invoiceEmail');
  const f = await fixture(), id = `${f.id}-valid-historical`, terms = { companyId: f.id, userId: f.uid, jobId: f.jobId, customerId: f.customerId, invoiceNumber: 'ORIGINAL-LEGACY-BILL', status: 'draft', lineItems: [{ description: 'Legacy service', quantity: 1, unitPrice: 100, amount: 100 }], subtotal: 100, tax: 0, taxRate: 0, total: 100, issueDate: '2026-11-16', dueDate: '2026-11-30' };
  await db.doc(`invoices/${id}`).set(terms);
  const issued = await f.call({ action: 'status', invoiceId: id, expectedRevision: 0, operationId: f.op('legacy-issue'), status: 'sent' });
  assert.equal(issued.invoice.revision, 1); assert.equal(issued.invoice.status, 'sent');
  const paid = await f.status(issued, 'paid', { paymentMethod: 'check' });
  assert.equal(paid.invoice.revision, 2); assert.equal(paid.invoice.status, 'paid'); assert.equal(paid.invoice.invoiceNumber, terms.invoiceNumber); assert.deepEqual(paid.invoice.lineItems, terms.lineItems); assert.equal(paid.invoice.total, 100);
  const emailFixture = await fixture(), emailId = `${emailFixture.id}-email-valid-legacy`;
  await db.doc(`invoices/${emailId}`).set({ ...terms, companyId: emailFixture.id, userId: emailFixture.uid, jobId: emailFixture.jobId, customerId: emailFixture.customerId });
  const email = invoiceEmailHandlers(db, () => 'https://example.invalid', () => true), request = emailFixture.request({ invoiceId: emailId, expectedRevision: 0 });
  assert.equal((await email.emailInvoice(request)).queued, true); assert.equal((await email.emailInvoice(request)).existing, true);
  const emailed = (await db.doc(`invoices/${emailId}`).get()).data(); assert.equal(emailed.revision, 1); assert.equal(emailed.status, 'sent'); assert.equal(emailed.total, 100); assert.equal(emailed.invoiceNumber, terms.invoiceNumber);
  assert.equal((await db.collection('rlMail').where('invoiceId', '==', emailId).get()).size, 1); assert.equal((await db.collection('rlInvoiceAudit').where('invoiceId', '==', emailId).get()).size, 1);
});

test('invalid immutable approved line kind or noncanonical description cannot be silently normalized into billing', async () => {
  for (const patch of [{ kind: 'unsupported-kind' }, { description: ' Approved labor ' }]) {
    const f = await fixture(), quote = await approvedConvertedJob(f), versionRef = db.doc(`rlEstimateVersions/${hash(`${quote.id}:1`)}`), version = (await versionRef.get()).data();
    await versionRef.update({ lineItems: version.lineItems.map((line, index) => index === 0 ? { ...line, ...patch } : line) });
    const historical = await f.job(); delete historical.id; delete historical.billingSnapshot; await db.doc(`jobs/${f.jobId}`).set(historical);
    await assert.rejects(f.preview(), error => error.code === 'failed-precondition' && /approved|line|review/i.test(error.message));
    assert.equal((await db.collection('invoices').where('companyId', '==', f.id).get()).size, 0);
  }
});

test('sent financial terms, paid invoices, void invoices and payment-locked mutations are protected', async () => {
  const f = await fixture(), created = await f.create(), sent = await f.status(created, 'sent');
  await assert.rejects(f.call({ action: 'update', invoiceId: created.id, operationId: f.op('sent-price'), expectedRevision: sent.invoice.revision, changes: { taxRate: 0, total: 1 } }), { code: 'failed-precondition' });
  await assert.rejects(f.status(sent, 'draft'), error => ['invalid-argument', 'failed-precondition'].includes(error.code));
  const paid = await f.status(sent, 'paid', { paymentMethod: 'check' });
  await assert.rejects(f.call({ action: 'update', invoiceId: created.id, operationId: f.op('paid-edit'), expectedRevision: paid.invoice.revision, changes: { notes: 'Cannot change paid invoice' } }), { code: 'failed-precondition' });
  await assert.rejects(f.status(paid, 'void'), { code: 'failed-precondition' });
  const locked = await fixture(), lockedInvoice = await locked.create(); await db.doc(`invoices/${lockedInvoice.id}`).update({ paymentLock: 'synthetic-payment-lock' });
  for (const action of ['sent', 'void', 'paid']) await assert.rejects(locked.status(lockedInvoice, action), { code: 'failed-precondition' });
  await assert.rejects(locked.call({ action: 'update', invoiceId: lockedInvoice.id, expectedRevision: 1, operationId: locked.op('locked-meta'), changes: { notes: 'Blocked' } }), { code: 'failed-precondition' });
});

test('generated invoice identities and display numbers differ across source jobs without renumbering history', async () => {
  const f = await fixture(), olderId = `${f.id}-older-timestamp-invoice`;
  await db.doc(`invoices/${olderId}`).set({ companyId: f.id, userId: f.uid, customerId: f.customerId, invoiceNumber: 'OLDER-TIMESTAMP-INVOICE', status: 'paid', total: 10, createdAt: new Date('2020-01-01T00:00:00.000Z') });
  const first = await f.create(), firstStored = await f.stored(first), firstNumber = firstStored.invoiceNumber;
  assert.equal(typeof firstStored.createdAt.toDate, 'function'); assert.equal(typeof firstStored.createdAt.toMillis, 'function'); assert.equal(typeof first.invoice.createdAt, 'string');
  const ordered = await db.collection('invoices').where('companyId', '==', f.id).orderBy('createdAt', 'desc').get();
  assert.deepEqual(ordered.docs.map(row => row.id), [first.id, olderId]);
  const secondJob = `${f.id}-second-job`, data = await f.job(); delete data.id;
  await db.doc(`jobs/${secondJob}`).set({ ...data, totalCost: 50 });
  f.jobId = secondJob; const second = await f.create();
  assert.notEqual(first.id, second.id); assert.notEqual(firstNumber, (await f.stored(second)).invoiceNumber); assert.equal((await f.stored(first)).invoiceNumber, firstNumber);
});

test('authoritative quote invoice remains compatible with Stripe signed test reconciliation, portal projection and email queue', async () => {
  const { paymentHandlers } = require('../functions/payments'), { paymentLifecycleHandlers } = require('../functions/paymentLifecycle');
  const { portalHandlers } = require('../functions/portal'), { invoiceEmailHandlers } = require('../functions/invoiceEmail');
  const f = await fixture(); await approvedConvertedJob(f); const created = await f.create(), sent = await f.status(created, 'sent');
  const customerEmail = `${f.id}@example.invalid`;
  let intent, providerCreates = 0;
  const stripe = {
    paymentIntents: { create: async data => { providerCreates++; intent = { ...data, id: `pi_${sequence}_invoice_integrity`, livemode: false, status: 'requires_payment_method', client_secret: 'synthetic-client-secret-only' }; return { ...intent }; }, retrieve: async () => ({ ...intent }), cancel: async () => ({ ...intent, status: 'canceled' }) },
    webhooks: new (req('stripe'))('rk_test_synthetic_fixture').webhooks,
  };
  const payment = paymentHandlers(db, () => stripe, { enabled: () => true, mode: () => 'test', liveApproved: () => false });
  const request = f.request({ invoiceId: created.id, amount: 1, currency: 'eur' });
  await payment.create(request); assert.equal(intent.amount, 10825); assert.equal(intent.currency, 'usd'); assert.equal(providerCreates, 1);
  await assert.rejects(f.status(sent, 'void'), { code: 'failed-precondition' });
  intent.status = 'succeeded'; intent.amount_received = 10825;
  const event = { id: `${f.id}-stripe-event`, type: 'payment_intent.succeeded', livemode: false, created: 10, data: { object: { id: intent.id } } }, body = JSON.stringify(event), secret = 'whsec_synthetic_invoice_fixture';
  const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  const webhook = async () => { const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, send(value) { this.body = value; return this; }, json(value) { this.body = value; return this; } }; await payment.webhook({ rawBody: Buffer.from(body), headers: { 'stripe-signature': signature } }, response, secret); return response; };
  const responses = await Promise.all([webhook(), webhook()]); assert.ok(responses.every(response => response.statusCode === 200));
  const stored = await f.stored(created); assert.equal(stored.total, 108.25); assert.equal(stored.status, 'sent'); assert.equal(stored.testPaymentStatus, 'succeeded'); assert.equal(stored.paymentLock, null);
  assert.equal((await db.collection('rlPaymentEvents').where('invoiceId', '==', created.id).get()).size, 1);
  const portalAuth = { uid: `rl_customer_${hash(customerEmail)}`, token: { portal: true, portalEmail: customerEmail } };
  const portal = portalHandlers(db, { createCustomToken: async () => { throw Error('No OTP delivery/token mint occurs in invoice compatibility.'); } });
  const portalResult = await portal.getCustomerPortal({ auth: portalAuth, data: { accountId: `company:${f.id}` } });
  const visible = portalResult.accounts[0].invoices.find(invoice => invoice.id === created.id); assert.equal(visible.total, 108.25); assert.equal(visible.lineItems.length, 2);
  const history = await paymentLifecycleHandlers(db, { enabled: () => true, mode: () => 'test', liveApproved: () => false }).history({ auth: portalAuth, data: { invoiceId: created.id } });
  assert.equal(history.history.length, 1); assert.equal(history.history[0].amount, 10825);
  const email = invoiceEmailHandlers(db, () => 'https://example.invalid', () => true);
  const emailRequest = f.request({ invoiceId: created.id, expectedRevision: stored.revision });
  assert.equal((await email.emailInvoice(emailRequest)).queued, true); assert.equal((await email.emailInvoice(emailRequest)).existing, true);
  const queued = await db.collection('rlMail').where('invoiceId', '==', created.id).get(); assert.equal(queued.size, 1); assert.match(queued.docs[0].get('text'), /108\.25/);
  assert.equal((await f.stored(created)).status, 'sent');
});

test('corrected invoice supports read-only QuickBooks sandbox preview while writes and unsupported tax fail safely', async () => {
  const { quickBooksHandlers, mappingId } = require('../functions/quickbooks');
  const f = await fixture(), created = await f.create(); await f.status(created, 'sent');
  const realm = `8${String(process.pid)}${String(sequence)}`, clientId = 'synthetic-invoice-qb-client', connection = db.doc(`rlQuickBooksConnections/${mappingId(f.id, 'sandbox', 'connection', 'current')}`);
  await connection.set({ companyId: f.id, environment: 'sandbox', credentialEnvironment: 'sandbox', realmId: realm, credentialHash: hash('sandbox:' + clientId), connected: true, connectionId: `${f.id}-connection`, accessToken: 'synthetic-access-only', refreshToken: 'synthetic-refresh-only', accessExpiresAt: Date.now() + 3600000, refreshExpiresAt: Date.now() + 86400000, refreshLeaseUntil: 0, incomeAccountId: '400', defaultItemId: '500' });
  await db.doc(`rlQbMappings/${mappingId(f.id, 'sandbox', 'Customer', f.customerId)}`).set({ companyId: f.id, environment: 'sandbox', realmId: realm, type: 'Customer', localId: f.customerId, remoteId: '600', status: 'adopted' });
  const calls = [], transport = async (url, options) => {
    const parsed = new URL(url); assert.equal(parsed.hostname, 'sandbox-quickbooks.api.intuit.com'); assert.equal(options.method, 'GET', 'Invoice integrity tests must not export accounting records.'); calls.push(parsed.pathname);
    if (parsed.pathname.endsWith('/item/500')) return { ok: true, json: async () => ({ Item: { Id: '500', Active: true, Type: 'Service', IncomeAccountRef: { value: '400' } } }) };
    if (parsed.pathname.endsWith('/account/400')) return { ok: true, json: async () => ({ Account: { Id: '400', Active: true, AccountType: 'Income' } }) };
    throw Error('Unexpected synthetic accounting read');
  };
  const qb = quickBooksHandlers(db, { enabled: () => true, environment: () => 'sandbox', credentialEnvironment: () => 'sandbox', productionApproved: () => false, writesEnabled: () => false, clientId: () => clientId, clientSecret: () => 'synthetic-secret-only' }, transport);
  const preview = await qb.preview(f.request({ type: 'Invoice', localId: created.id }));
  assert.equal(preview.payload.Line.reduce((sum, line) => sum + line.Amount, 0), 100); assert.equal(preview.payload.CustomerRef.value, '600'); assert.equal(preview.payload.CurrencyRef.value, 'USD'); assert.equal(preview.writesEnabled, false); assert.ok(calls.length >= 2);
  await assert.rejects(qb.sync(f.request({ type: 'Invoice', localId: created.id, fingerprint: preview.fingerprint })), error => error.code === 'failed-precondition' && /disabled/i.test(error.message));
  const taxed = await fixture(); await approvedConvertedJob(taxed); const taxedInvoice = await taxed.create(); await taxed.status(taxedInvoice, 'sent');
  const taxedRealm = `${realm}2`;
  await db.doc(`rlQuickBooksConnections/${mappingId(taxed.id, 'sandbox', 'connection', 'current')}`).set({ ...(await connection.get()).data(), companyId: taxed.id, realmId: taxedRealm, connectionId: `${taxed.id}-connection` });
  await db.doc(`rlQbMappings/${mappingId(taxed.id, 'sandbox', 'Customer', taxed.customerId)}`).set({ companyId: taxed.id, environment: 'sandbox', realmId: taxedRealm, type: 'Customer', localId: taxed.customerId, remoteId: '600', status: 'adopted' });
  await assert.rejects(qb.preview(taxed.request({ type: 'Invoice', localId: taxedInvoice.id })), error => error.code === 'failed-precondition' && /tax|mapping|review/i.test(error.message));
});
