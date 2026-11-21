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
const { invoiceEmailHandlers, invoiceMailId } = require('../functions/invoiceEmail');
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
  assert.equal(created.invoice.invoiceNumber, null);
  await assert.rejects(f.status(created.invoiceId, 'issued'), { code: 'failed-precondition' });
  await f.issue(created.invoiceId);
  const issued = await f.stored(created.invoiceId);
  assert.equal(issued.status, 'issued'); assert.equal(issued.issuedSnapshot.totalCents, 10000);
  assert.match(issued.invoiceNumber, /^\d{8}-I001$/);
  assert.equal(issued.issuedSnapshot.invoiceNumber, issued.invoiceNumber);
  assert.equal(publicInvoice(created.invoiceId, issued).totalCents, 10000);
  await assert.rejects(f.call({ action: 'update', invoiceId: created.invoiceId, expectedRevision: issued.revision, operationId: `${f.id}-invalid-update`, changes: { notes: 'Forbidden' } }), { code: 'failed-precondition' });
  assert.equal((await f.stored(created.invoiceId)).issuedSnapshot.fingerprint, issued.issuedSnapshot.fingerprint);
});
test('approved invoice requires explicit audited unlock; issued number cannot be reused', async () => {
  const f = await fixture(), created = await f.fromJob();
  await f.status(created.invoiceId, 'awaiting_approval');
  await f.status(created.invoiceId, 'approved');
  const approved = await f.stored(created.invoiceId);
  await assert.rejects(f.status(created.invoiceId, 'draft'), { code: 'failed-precondition' });
  await f.call({ action: 'unlock', invoiceId: created.invoiceId, operationId: `${f.id}-unlock-0001`, expectedRevision: approved.revision, reason: 'Correct customer-facing scope' });
  const draft = await f.stored(created.invoiceId);
  assert.equal(draft.status, 'draft'); assert.equal(draft.approvalRevocationReason, 'Correct customer-facing scope');
  await f.status(created.invoiceId, 'awaiting_approval'); await f.status(created.invoiceId, 'approved'); await f.status(created.invoiceId, 'issued');
  const issued = await f.stored(created.invoiceId);
  await assert.rejects(f.call({ action: 'unlock', invoiceId: created.invoiceId, operationId: `${f.id}-unlock-0002`, expectedRevision: issued.revision, reason: 'Should remain immutable' }), { code: 'failed-precondition' });
  const second = await f.call({ action: 'createManual', operationId: `${f.id}-manual-number-0001`, customerId: f.customerId, lineItems: [{ description: 'Synthetic follow-up', quantity: 1, unitPrice: 25 }], taxRate: 0 });
  await f.issue(second.invoiceId);
  assert.notEqual((await f.stored(second.invoiceId)).invoiceNumber, issued.invoiceNumber);
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
    to: `${f.customerId}@example.invalid`, subject: `Invoice ${invoice.invoiceNumber}`, text: 'Approved invoice attached.' });
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

test('invoice email reports delivery and cancels stale customer addresses before SMTP', async () => {
  const f = await fixture(), created = await f.fromJob(); await f.issue(created.invoiceId);
  const handlers = invoiceEmailHandlers(db, () => 'https://route-logistics.com', () => true);
  const request = { auth: f.auth('manager'), data: { invoiceId: created.invoiceId, expectedRevision: (await f.stored(created.invoiceId)).revision, expectedRecipient: `${f.customerId}@example.invalid` } };
  const first = await handlers.emailInvoice(request);
  assert.equal(first.queued, true);
  const before = await handlers.emailInvoice({ ...request, data: { action: 'status', invoiceId: created.invoiceId } });
  assert.equal(before.recipient, `${f.customerId}@example.invalid`);
  assert.equal(before.delivery.status, 'queued');
  await db.doc(`customers/${f.customerId}`).update({ email: `${f.customerId}-corrected@example.invalid` });
  await assert.rejects(handlers.emailInvoice(request), { code: 'aborted' });
  const oldId = invoiceMailId(created.invoiceId, Math.floor(Date.now() / 86400_000), before.recipient);
  const sends = [];
  const transport = { sendMail: async message => { sends.push(message); return { accepted: [message.to] }; } };
  await deliverMail(db, db.doc(`rlMail/${oldId}`), transport, 'notifications@example.invalid');
  assert.equal(sends.length, 0);
  assert.equal((await db.doc(`rlMail/${oldId}`).get()).get('status'), 'cancelled');
  const correctedRequest = { ...request, data: { ...request.data, expectedRecipient: `${f.customerId}-corrected@example.invalid` } };
  const corrected = await handlers.emailInvoice(correctedRequest);
  assert.equal(corrected.queued, true);
  assert.equal(corrected.recipient, `${f.customerId}-corrected@example.invalid`);
  const correctedId = invoiceMailId(created.invoiceId, Math.floor(Date.now() / 86400_000), corrected.recipient);
  await deliverMail(db, db.doc(`rlMail/${correctedId}`), transport, 'notifications@example.invalid');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].to, corrected.recipient);
  const after = await handlers.emailInvoice({ ...request, data: { action: 'status', invoiceId: created.invoiceId } });
  assert.equal(after.delivery.status, 'sent');
  assert.equal((await handlers.emailInvoice(correctedRequest)).status, 'sent');
  await assert.rejects(handlers.emailInvoice({ ...request, auth: f.auth('technician'), data: { action: 'status', invoiceId: created.invoiceId } }), { code: 'permission-denied' });
});

test('issued invoice resends the same PDF only on explicit, bounded and idempotent request', async () => {
  const f = await fixture(), created = await f.fromJob(); await f.issue(created.invoiceId);
  const handlers = invoiceEmailHandlers(db, () => 'https://route-logistics.com', () => true);
  const invoice = await f.stored(created.invoiceId);
  const request = { auth: f.auth('manager'), data: { invoiceId: created.invoiceId, expectedRevision: invoice.revision, expectedRecipient: `${f.customerId}@example.invalid` } };
  await handlers.emailInvoice(request);
  const originalId = invoiceMailId(created.invoiceId, Math.floor(Date.now() / 86400_000), request.data.expectedRecipient);
  const transport = { sendMail: async message => ({ accepted: [message.to] }) };
  await deliverMail(db, db.doc(`rlMail/${originalId}`), transport, 'notifications@example.invalid');
  const firstStatus = await handlers.emailInvoice({ ...request, data: { action: 'status', invoiceId: created.invoiceId } });
  assert.equal(firstStatus.delivery.status, 'sent');
  const resend = { ...request, data: { ...request.data, action: 'resend', operationId: 'invoice-resend-operation-001' } };
  await assert.rejects(handlers.emailInvoice({ ...resend, auth: f.auth('technician') }), { code: 'permission-denied' });
  const first = await handlers.emailInvoice(resend);
  assert.equal(first.queued, true);
  assert.equal(first.resent, true);
  const retry = await handlers.emailInvoice(resend);
  assert.equal(retry.existing, true);
  const queuedStatus = await handlers.emailInvoice({ ...request, data: { action: 'status', invoiceId: created.invoiceId } });
  assert.equal(queuedStatus.delivery.status, 'queued');
  const mailId = (await db.doc(`invoices/${created.invoiceId}`).get()).get('invoiceEmailLastMailId');
  const mail = await db.doc(`rlMail/${mailId}`).get();
  assert.equal(mail.get('invoiceSnapshotFingerprint'), invoice.issuedSnapshot.fingerprint);
  assert.equal(mail.get('to'), request.data.expectedRecipient);
  assert.equal((await db.doc(`invoices/${created.invoiceId}`).get()).get('invoiceEmailResendCount'), 1);
  await deliverMail(db, mail.ref, transport, 'notifications@example.invalid');
  assert.equal((await handlers.emailInvoice({ ...request, data: { action: 'status', invoiceId: created.invoiceId } })).delivery.status, 'sent');
  for (const suffix of ['002', '003']) {
    await handlers.emailInvoice({ ...resend, data: { ...resend.data, operationId: `invoice-resend-operation-${suffix}` } });
    const latestId = (await db.doc(`invoices/${created.invoiceId}`).get()).get('invoiceEmailLastMailId');
    await deliverMail(db, db.doc(`rlMail/${latestId}`), transport, 'notifications@example.invalid');
  }
  await assert.rejects(handlers.emailInvoice({ ...resend, data: { ...resend.data, operationId: 'invoice-resend-operation-004' } }), { code: 'resource-exhausted' });
  assert.equal((await db.doc(`invoices/${created.invoiceId}`).get()).get('revision'), invoice.revision);
  const audits = await db.collection('rlInvoiceAudit').where('invoiceId', '==', created.invoiceId).get();
  assert.equal(audits.docs.filter(doc => doc.get('action') === 'invoice.email.resent').length, 3);
});

test('queued invoice email is cancelled if its payment balance changes before attachment delivery', async () => {
  const f = await fixture(), created = await f.fromJob(); await f.issue(created.invoiceId);
  const handlers = invoiceEmailHandlers(db, () => 'https://route-logistics.com', () => true);
  const invoice = await f.stored(created.invoiceId);
  const recipient = `${f.customerId}@example.invalid`;
  await handlers.emailInvoice({ auth: f.auth('manager'), data: { invoiceId: created.invoiceId, expectedRevision: invoice.revision, expectedRecipient: recipient } });
  const mailId = invoiceMailId(created.invoiceId, Math.floor(Date.now() / 86400_000), recipient);
  const mailRef = db.doc(`rlMail/${mailId}`), queued = await mailRef.get();
  assert.equal(queued.get('invoiceBalanceCents'), invoice.totalCents);
  await db.doc(`invoices/${created.invoiceId}`).update({ paidCents: 100, balanceCents: invoice.totalCents - 100, status: 'partially_paid' });
  let sends = 0;
  await deliverMail(db, mailRef, { sendMail: async () => { sends++; return { accepted: [recipient] }; } }, 'notifications@example.invalid');
  assert.equal(sends, 0);
  assert.equal((await mailRef.get()).get('status'), 'cancelled');
  assert.equal((await mailRef.get()).get('failureCode'), 'invoice-or-recipient-changed');
});

test('management may email a paid issued invoice with a zero-balance PDF', async () => {
  const f = await fixture(), created = await f.fromJob(); await f.issue(created.invoiceId);
  const invoice = await f.stored(created.invoiceId);
  await db.doc(`invoices/${created.invoiceId}`).update({ paidCents: invoice.totalCents, balanceCents: 0, status: 'paid' });
  const handlers = invoiceEmailHandlers(db, () => 'https://route-logistics.com', () => true);
  const recipient = `${f.customerId}@example.invalid`;
  await handlers.emailInvoice({ auth: f.auth('manager'), data: { invoiceId: created.invoiceId, expectedRevision: invoice.revision, expectedRecipient: recipient } });
  const mailRef = db.doc(`rlMail/${invoiceMailId(created.invoiceId, Math.floor(Date.now() / 86400_000), recipient)}`);
  assert.match((await mailRef.get()).get('text'), /paid in full/);
  const sent = [];
  await deliverMail(db, mailRef, { sendMail: async message => { sent.push(message); return { accepted: [message.to] }; } }, 'notifications@example.invalid');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].attachments[0].content.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await mailRef.get()).get('status'), 'sent');
});
