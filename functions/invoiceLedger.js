const { HttpsError } = require('firebase-functions/v2/https');
const { requireCapability } = require('./access');
const { documentId, hash, rateLimit } = require('./security');
const { assertInvoiceActor } = require('./invoices');
const { assertCurrentInvoice, balanceFor } = require('./shared/invoiceV2');
const { fingerprint } = require('./shared/invoiceMath');
const { authorizeInvoice } = require('./payments');

const fail = (code, message) => { throw new HttpsError(code, message); };
const methods = new Set(['cash', 'check', 'external_card', 'bank_transfer']);
const cents = value => {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000000000) fail('invalid-argument', 'Enter a positive amount in cents.');
  return value;
};
const sameScope = (scope, invoice) => invoice.companyId === (scope.companyId || null) && (scope.companyId || invoice.userId === scope.uid);
const receiptId = (scope, operationId) => hash(`${scope.companyId || `solo:${scope.uid}`}:${scope.uid}:${documentId(operationId, 'payment operation')}`);

function invoiceLedgerHandlers(db, { now = () => Date.now() } = {}) {
  const receipt = id => db.doc(`rlFinancialReceipts/${id}`);
  const invoiceRef = id => db.doc(`invoices/${documentId(id, 'invoice')}`);
  async function loadInvoice(tx, scope, id) {
    const row = await tx.get(invoiceRef(id));
    if (!row.exists || !sameScope(scope, row.data())) fail('permission-denied', 'Invoice is not in this workspace.');
    assertCurrentInvoice(row.data());
    if (!row.get('issuedSnapshot') || !['issued', 'partially_paid', 'paid'].includes(row.get('status'))) fail('failed-precondition', 'Only issued invoices accept payment activity.');
    if (row.get('paymentLock')) fail('failed-precondition', 'Finish or cancel the card test attempt before recording ledger activity.');
    return row;
  }
  return {
    handle: async request => {
      if (!request.auth) fail('unauthenticated', 'Sign in to view invoice activity.');
      const data = request.data || {}, action = data.action;
      if (action === 'history') {
        const invoice = await invoiceRef(data.invoiceId).get();
        if (!invoice.exists) fail('not-found', 'Invoice not found.');
        await authorizeInvoice(db, request, invoice.data());
        if (!invoice.get('issuedSnapshot')) fail('failed-precondition', 'No issued invoice is available.');
        const rows = await db.collection('rlFinancialLedger').where('invoiceId', '==', invoice.id).limit(200).get();
        const portal = request.auth.token.portal === true;
        return { entries: rows.docs.filter(row => row.get('companyId') === (invoice.get('companyId') || null)).map(row => ({
          id: row.id, kind: row.get('kind'), amountCents: row.get('amountCents'), balanceAfterCents: row.get('balanceAfterCents'),
          recordedAt: row.get('recordedAt'),
          ...(!portal ? { receiptId: row.get('receiptId'), reversesReceiptId: row.get('reversesReceiptId') || null } : {}),
        })).sort((a, b) => b.recordedAt.toMillis() - a.recordedAt.toMillis()), truncated: rows.size === 200 };
      }
      const scope = await requireCapability(db, request, 'invoices.manage');
      if (!['record', 'credit', 'reverse'].includes(action)) fail('invalid-argument', 'Choose a supported payment action.');
      await rateLimit(db, 'invoice-ledger', scope.uid, 30);
      const operationId = documentId(data.operationId, 'payment operation');
      if (!/^[A-Za-z0-9_-]{16,100}$/.test(operationId)) fail('invalid-argument', 'Use a stable payment operation ID.');
      const ref = receipt(receiptId(scope, operationId)), operationFingerprint = fingerprint(data);
      let allocations, method, reason, originalId;
      if (action === 'record') {
        method = data.method;
        if (!methods.has(method)) fail('invalid-argument', 'Choose cash, check, external card, or bank transfer.');
      }
      if (action === 'record' || action === 'credit') {
        allocations = data.allocations;
        if (!Array.isArray(allocations) || allocations.length < 1 || allocations.length > 20) fail('invalid-argument', 'Choose 1–20 invoice allocations.');
        const ids = allocations.map(item => documentId(item.invoiceId, 'invoice'));
        if (new Set(ids).size !== ids.length) fail('invalid-argument', 'Each invoice can appear once per payment.');
        allocations.forEach(item => cents(item.amountCents));
      }
      if (action === 'credit' || action === 'reverse') {
        reason = typeof data.reason === 'string' ? data.reason.trim() : '';
        if (reason.length < 5 || reason.length > 500) fail('invalid-argument', 'Provide a reason of 5–500 characters.');
      }
      if (action === 'reverse') originalId = documentId(data.receiptId, 'receipt');
      return db.runTransaction(async tx => {
        await assertInvoiceActor(db, tx, scope);
        const prior = await tx.get(ref);
        if (prior.exists) {
          if (prior.get('fingerprint') !== operationFingerprint) fail('already-exists', 'This operation ID belongs to another payment action.');
          return prior.get('result');
        }
        const original = action === 'reverse' ? await tx.get(receipt(originalId)) : null;
        if (original && (!original.exists || original.get('companyId') !== (scope.companyId || null) || original.get('kind') === 'reverse' || original.get('reversedBy'))) fail('failed-precondition', 'The payment or credit cannot be reversed.');
        const chosen = original ? original.get('allocations') : allocations;
        const rows = [];
        for (const allocation of chosen) rows.push(await loadInvoice(tx, scope, allocation.invoiceId));
        const customerIds = new Set(rows.map(row => row.get('customerId')));
        if (customerIds.size !== 1) fail('failed-precondition', 'A single payment can only cover one customer.');
        const changes = rows.map((row, index) => {
          const invoice = row.data(), amount = cents(chosen[index].amountCents), sign = action === 'reverse' ? -1 : 1;
          const paidCents = (invoice.paidCents || 0) + (action === 'record' || original?.get('kind') === 'record' ? sign * amount : 0);
          const creditCents = (invoice.creditCents || 0) + (action === 'credit' || original?.get('kind') === 'credit' ? sign * amount : 0);
          const next = balanceFor(invoice, paidCents, creditCents);
          return { row, amount, next };
        });
        const timestamp = new Date(now());
        const result = { receiptId: ref.id, kind: action, allocations: chosen.map(item => ({ invoiceId: item.invoiceId, amountCents: item.amountCents })) };
        tx.create(ref, { kind: action, companyId: scope.companyId || null, scopeId: scope.companyId || scope.uid, actorId: scope.uid, customerId: rows[0].get('customerId'), allocations: result.allocations,
          ...(method ? { method } : {}), ...(reason ? { reason } : {}), ...(original ? { originalReceiptId: originalId } : {}),
          fingerprint: operationFingerprint, result, recordedAt: timestamp });
        if (original) tx.update(original.ref, { reversedBy: ref.id, reversedAt: timestamp });
        changes.forEach(({ row, amount, next }, index) => {
          tx.update(row.ref, { ...next, revision: (row.get('revision') || 0) + 1, updatedAt: timestamp,
            ...(next.status === 'paid' ? { paidAt: row.get('paidAt') || timestamp } : { paidAt: null }) });
          tx.create(db.doc(`rlFinancialLedger/${hash(`${ref.id}:${row.id}`)}`), {
            companyId: scope.companyId || null, scopeId: scope.companyId || scope.uid, customerId: row.get('customerId'), invoiceId: row.id, receiptId: ref.id,
            kind: action, amountCents: action === 'reverse' ? -amount : amount, allocationIndex: index,
            balanceAfterCents: next.balanceCents, actorId: scope.uid, recordedAt: timestamp,
            ...(original ? { reversesReceiptId: originalId, reversesKind: original.get('kind') } : {}),
          });
        });
        return result;
      });
    },
  };
}

module.exports = { invoiceLedgerHandlers, cents, receiptId };
