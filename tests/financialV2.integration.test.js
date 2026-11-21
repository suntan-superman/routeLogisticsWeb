// Local Firestore emulator only. Synthetic records, no provider calls or production access.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { invoiceHandlers } = require('../functions/invoices');
const { invoiceLedgerHandlers } = require('../functions/invoiceLedger');
const { createBillingScheduler } = require('../functions/billingScheduler');
const { publicInvoice } = require('../functions/portal');
const { deliverMail } = require('../functions/mail');
let app, db, sequence = 0;
before(() => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('A local Firestore emulator is required. Production access is forbidden.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'financial-v2-tests'); db = getFirestore(app);
});
after(() => app && deleteApp(app));
async function fixture() {
  const id = `financial-v2-${process.pid}-${++sequence}`, uid = `${id}-owner`, managerId = `${id}-manager`, customerId = `${id}-customer`, jobId = `${id}-job`;
  await db.doc(`companies/${id}`).set({ ownerId: uid, name: 'Synthetic Services LLC', isActive: true, timeZone: 'America/Los_Angeles' });
  await db.doc(`users/${uid}`).set({ email: `${uid}@example.invalid` });
  await db.doc(`teamMembers/${managerId}`).set({ companyId: id, uid: managerId, role: 'manager', status: 'active', email: `${managerId}@example.invalid` });
  await db.doc(`customers/${customerId}`).set({ companyId: id, userId: uid, name: 'Synthetic Customer', email: `${customerId}@example.invalid`, address: '100 Example Street', isActive: true });
  await db.doc(`jobs/${jobId}`).set({ companyId: id, userId: uid, customerId, customerName: 'Synthetic Customer', serviceType: 'Synthetic service',
    date: '2026-11-20', status: 'completed', totalCost: 100, completedAt: new Date('2026-11-20T18:00:00Z'), updatedAt: '2026-11-20T18:00:00Z' });
  const auth = role => ({ uid: role === 'owner' ? uid : managerId, token: { companyId: id, role, membershipId: role === 'manager' ? managerId : undefined, email_verified: true, email: `${role === 'owner' ? uid : managerId}@example.invalid` } });
  const call = (data, role = 'owner') => invoiceHandlers(db).handle({ auth: auth(role), data });
  const ledger = (data, role = 'owner') => invoiceLedgerHandlers(db).handle({ auth: auth(role), data });
  const stored = async invoiceId => (await db.doc(`invoices/${invoiceId}`).get()).data();
  const status = async (invoiceId, next, role = 'owner') => call({ action: 'status', invoiceId, status: next, expectedRevision: (await stored(invoiceId)).revision, operationId: `${id}-${next}-${++sequence}` }, role);
  const fromJob = async () => { const preview = await call({ action: 'preview', jobId }); return call({ action: 'create', jobId, sourceFingerprint: preview.sourceFingerprint, operationId: `${id}-create-${++sequence}` }); };
  const issue = async invoiceId => { await status(invoiceId, 'awaiting_approval'); await status(invoiceId, 'approved', 'manager'); await status(invoiceId, 'issued'); };
  return { id, uid, managerId, customerId, jobId, auth, call, ledger, stored, status, fromJob, issue };
}

test('new invoices require management review and preserve an immutable issued source', async () => {
  const f = await fixture(), created = await f.fromJob();
  await assert.rejects(f.status(created.invoiceId, 'issued'), { code: 'failed-precondition' });
  await f.issue(created.invoiceId);
  const issued = await f.stored(created.invoiceId);
  assert.equal(issued.status, 'issued'); assert.equal(issued.issuedSnapshot.totalCents, 10000);
  assert.equal(publicInvoice(created.invoiceId, issued).totalCents, 10000);
  await assert.rejects(f.call({ action: 'update', invoiceId: created.invoiceId, expectedRevision: issued.revision, operationId: `${f.id}-invalid-update`, changes: { notes: 'Forbidden' } }), { code: 'failed-precondition' });
  assert.equal((await f.stored(created.invoiceId)).issuedSnapshot.fingerprint, issued.issuedSnapshot.fingerprint);
});

test('manual invoices and same-customer consolidated invoices are distinct, idempotent drafts', async () => {
  const f = await fixture(), operationId = `${f.id}-manual-create`;
  const input = { action: 'createManual', operationId, customerId: f.customerId, lineItems: [{ description: 'Synthetic inspection', quantity: 2, unitPrice: 40 }], taxRate: 0 };
  const first = await f.call(input), replay = await f.call(input);
  assert.equal(first.invoiceId, replay.invoiceId);
  await f.issue(first.invoiceId);
  assert.equal((await f.stored(first.invoiceId)).totalCents, 8000);
  const otherJob = `${f.id}-second`;
  await db.doc(`jobs/${otherJob}`).set({ companyId: f.id, userId: f.uid, customerId: f.customerId, serviceType: 'Second visit', status: 'completed', totalCost: 20, updatedAt: '2026-11-20T19:00:00Z' });
  const preview = await f.call({ action: 'previewGroup', jobIds: [f.jobId, otherJob] });
  const grouped = await f.call({ action: 'createGroup', jobIds: [otherJob, f.jobId], sourceFingerprint: preview.sourceFingerprint, operationId: `${f.id}-group-create` });
  assert.equal((await f.stored(grouped.invoiceId)).totalCents, 12000);
  assert.equal((await db.collection('rlInvoiceClaims').where('companyId','==',f.id).get()).size, 2);
});

test('ledger supports split payments, credits, reversal, retry protection, and owner/manager scope', async () => {
  const f = await fixture(), first = await f.fromJob(); await f.issue(first.invoiceId);
  const second = await f.call({ action: 'createManual', customerId: f.customerId, lineItems: [{ description: 'Second charge', quantity: 1, unitPrice: 50 }], taxRate: 0, operationId: `${f.id}-second-invoice` });
  await f.issue(second.invoiceId);
  const payload = { action: 'record', operationId: `${f.id}-split-payment`, method: 'check', allocations: [{ invoiceId: first.invoiceId, amountCents: 3000 }, { invoiceId: second.invoiceId, amountCents: 2000 }] };
  const receipt = await f.ledger(payload, 'manager');
  assert.equal((await f.ledger(payload, 'manager')).receiptId, receipt.receiptId);
  assert.equal((await f.stored(first.invoiceId)).balanceCents, 7000);
  assert.equal((await f.stored(second.invoiceId)).balanceCents, 3000);
  await assert.rejects(f.ledger({ ...payload, allocations: [{ invoiceId: first.invoiceId, amountCents: 4000 }] }, 'manager'), { code: 'already-exists' });
  await assert.rejects(f.ledger({ action: 'record', operationId: `${f.id}-overpay`, method: 'cash', allocations: [{ invoiceId: first.invoiceId, amountCents: 7001 }] }), { code: 'failed-precondition' });
  const credit = await f.ledger({ action: 'credit', operationId: `${f.id}-credit`, reason: 'Approved service adjustment', allocations: [{ invoiceId: first.invoiceId, amountCents: 7000 }] });
  assert.equal((await f.stored(first.invoiceId)).status, 'paid');
  await f.ledger({ action: 'reverse', operationId: `${f.id}-reverse`, reason: 'Credit entered in error', receiptId: credit.receiptId });
  assert.equal((await f.stored(first.invoiceId)).balanceCents, 7000);
  assert.equal((await db.collection('rlFinancialLedger').where('scopeId','==',f.id).get()).size, 4);
});

test('scheduled invoice drafts do not bill estimate visits or repeat on retry', async () => {
  const f = await fixture(), estimateJobId = `${f.id}-estimate`;
  await db.doc(`jobs/${estimateJobId}`).set({ companyId: f.id, userId: f.uid, customerId: f.customerId, appointmentKind: 'estimate-visit', status: 'completed', totalCost: 0,
    completedAt: new Date('2026-11-20T18:00:00Z'), updatedAt: '2026-11-20T18:00:00Z' });
  await db.doc(`companies/${f.id}`).update({ billingSettings: { invoiceCadence: 'daily', invoiceAnchorDate: '2026-11-20', invoiceActivatedAt: new Date('2026-11-20T17:00:00Z'),
    reportCadence: 'manual', grouping: 'per_visit', paymentTermsDays: 14, holidays: [] } });
  const schedule = createBillingScheduler(db, () => new Date('2026-11-23T18:00:00Z'));
  await schedule('invoice'); await schedule('invoice');
  const invoices = await db.collection('invoices').where('companyId','==',f.id).get();
  assert.equal(invoices.size, 1); assert.equal(invoices.docs[0].get('jobId'), f.jobId); assert.equal(invoices.docs[0].get('status'), 'draft');
  assert.equal((await db.collection('rlNotifications').where('companyId','==',f.id).get()).size, 2); // owner and manager
});

test('issued invoice email includes its approved PDF and records one accepted delivery', async () => {
  const f = await fixture(), created = await f.fromJob(); await f.issue(created.invoiceId);
  const invoice = await f.stored(created.invoiceId), ref = db.doc(`rlMail/${f.id}-invoice-mail`);
  await ref.set({ status: 'queued', availableAt: Date.now() - 1000, attempts: 0,
    invoiceId: created.invoiceId, invoiceSnapshotFingerprint: invoice.issuedSnapshot.fingerprint,
    to: 'test@example.com', subject: `Invoice ${invoice.invoiceNumber}`, text: 'Approved invoice attached.' });
  const sends = [];
  const transport = { sendMail: async message => { sends.push(message); return { accepted: [message.to] }; } };
  await deliverMail(db, ref, transport, 'notifications@example.com');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].attachments.length, 1);
  assert.equal(sends[0].attachments[0].contentType, 'application/pdf');
  assert.equal(sends[0].attachments[0].content.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await ref.get()).get('status'), 'sent');
  await deliverMail(db, ref, transport, 'notifications@example.com');
  assert.equal(sends.length, 1);
});
