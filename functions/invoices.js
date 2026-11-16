const { HttpsError } = require('firebase-functions/v2/https');
const { requireCapability, hasCapability } = require('./access');
const { documentId, hash, normalizeEmail, rateLimit } = require('./security');
const { calculateTotals, approvedBillingSnapshot, canonical, fingerprint, financialReviewReasons } = require('./shared/invoiceMath');
const fail = (code, message, details) => { throw new HttpsError(code, message, details); };
const scoped = (scope, data) => !!data && (scope.companyId ? data.companyId === scope.companyId : !data.companyId && data.userId === scope.uid);
const scopeKey = scope => scope.companyId ? `company:${scope.companyId}` : `solo:${scope.uid}`;
const invoiceNumber = (claimId, generation) => `INV-${hash(`${claimId}:${generation}`).slice(0,16).toUpperCase()}`;
const invoiceRevision = invoice => invoice.revision === undefined ? 0 : Number.isInteger(invoice.revision) && invoice.revision >= 0 ? invoice.revision : fail('failed-precondition', 'The invoice revision needs authorized review.');
function expectedRevision(invoice, expected) {
  const actual = invoiceRevision(invoice);
  if (!Number.isInteger(expected) || expected < 0) fail('invalid-argument', 'The displayed invoice revision is required. Refresh the invoice.');
  if (actual !== expected) fail('aborted', 'This invoice changed. Refresh it and review the latest revision before retrying.', { currentRevision: actual });
  return actual;
}
async function assertInvoiceActor(db, tx, scope) {
  const deleted = await tx.get(db.doc(`rlAccountDeletions/${scope.uid}`));
  if (deleted.exists) fail('permission-denied', 'This account is no longer active.');
  if (scope.companyId) {
    const company = await tx.get(db.doc(`companies/${scope.companyId}`));
    if (!company.exists || company.get('isActive') === false || company.get('deletedAt')) fail('permission-denied', 'The company workspace is no longer active.');
    if (scope.role === 'owner') {
      if (company.get('ownerId') !== scope.uid) fail('permission-denied', 'Company ownership changed. Refresh your access.');
    } else {
      const member = await tx.get(db.doc(`teamMembers/${documentId(scope.memberId, 'membership')}`));
      if (member.get('uid') !== scope.uid || member.get('companyId') !== scope.companyId || member.get('status') !== 'active' || member.get('role') !== scope.role || !hasCapability(scope.role, 'invoices.manage')) fail('permission-denied', 'Your current membership no longer allows financial changes.');
    }
  } else {
    const [profile, companies, memberships] = await Promise.all([tx.get(db.doc(`users/${scope.uid}`)), tx.get(db.collection('companies').where('ownerId', '==', scope.uid).limit(1)), tx.get(db.collection('teamMembers').where('uid', '==', scope.uid).limit(1))]);
    if (profile.get('rlCompanyId') || profile.get('companyId') || !companies.empty || !memberships.empty) fail('permission-denied', 'Your workspace changed. Refresh access before billing.');
  }
}
function cleanText(value, limit, label) {
  if (typeof value !== 'string' || value.length > limit) fail('invalid-argument', `${label} must be text of at most ${limit} characters.`);
  return value.trim();
}
function day(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('invalid-argument', `Choose a valid ${label}.`);
  return value;
}
function knownFields(data, allowed) {
  if (Object.keys(data).some(key => !allowed.includes(key))) fail('invalid-argument', 'Invoice amounts, customer details and financial terms are calculated on the server. Refresh and use the supported invoice action.');
}
function invoiceView(row) { return canonical({ ...row.data(), id: row.id }); }
function historicalReview(invoice, job) {
  const reasons = [];
  if (!['draft', 'sent', 'paid', 'void'].includes(invoice.status)) reasons.push('invalid-status');
  if (invoice.customerId !== job.customerId) reasons.push('customer-mismatch');
  reasons.push(...financialReviewReasons(invoice));
  return reasons;
}
function assertInvoiceTerms(invoice) {
  const reviewReasons = financialReviewReasons(invoice);
  if (reviewReasons.length) fail('failed-precondition', 'These invoice financial terms require authorized review before issuing or recording payment. Existing values have not been changed.', { reviewReasons });
}
async function assertInvoiceRelationships(db, tx, scope, invoice) {
  if (typeof invoice.customerId !== 'string' || !invoice.customerId || invoice.customerId.includes('/')) fail('failed-precondition', 'The historical invoice customer requires authorized review.');
  const customer = await tx.get(db.doc(`customers/${documentId(invoice.customerId, 'invoice customer')}`));
  if (!customer.exists || !scoped(scope, customer.data()) || customer.get('isActive') === false || customer.get('deletedAt')) fail('failed-precondition', 'The historical invoice customer is unavailable or belongs to a different workspace. Authorized review is required.');
  if (invoice.jobId) {
    const job = await tx.get(db.doc(`jobs/${documentId(invoice.jobId, 'invoice job')}`));
    if (!job.exists || !scoped(scope, job.data()) || job.get('customerId') !== invoice.customerId) fail('failed-precondition', 'The historical invoice job/customer relationship requires authorized review.');
  }
}
function invoiceHandlers(db, { now = () => Date.now() } = {}) {
  const ref = (name, id) => db.doc(`${name}/${id}`);
  async function billingSource(tx, scope, jobRow) {
    const job = jobRow.data();
    if (job.status !== 'completed') fail('failed-precondition', 'Complete the job before creating its invoice.');
    const kind = String(job.appointmentKind || job.kind || job.jobType || job.visitType || job.appointmentType || '').trim().toLowerCase();
    if (job.billable === false || job.isBillable === false || job.nonBillable === true || ['estimate', 'estimate-visit', 'estimate_visit', 'estimate appointment', 'estimate-appointment'].includes(kind)) fail('failed-precondition', 'This is a nonbillable estimate visit and cannot be invoiced as an ordinary service.');
    if (job.deletedAt || job.archived === true) fail('failed-precondition', 'This job is archived and needs authorized review before billing.');
    const customerId = documentId(job.customerId, 'job customer'), customer = await tx.get(ref('customers', customerId));
    if (!customer.exists || !scoped(scope, customer.data()) || customer.get('isActive') === false || customer.get('deletedAt')) fail('permission-denied', 'The job must reference an active customer in the same workspace.');
    let snapshot;
    if (job.estimateId || job.estimateVersion || job.billingSnapshot?.kind === 'approved-estimate') {
      const estimateId = documentId(job.estimateId, 'approved estimate');
      if (!Number.isInteger(job.estimateVersion) || job.estimateVersion < 1) fail('failed-precondition', 'The approved estimate version is missing. Authorized review is required.');
      const [estimate, version, approval, conversion] = await Promise.all([tx.get(ref('estimates', estimateId)), tx.get(ref('rlEstimateVersions', hash(`${estimateId}:${job.estimateVersion}`))), tx.get(ref('rlEstimateApprovalSecrets', estimateId)), tx.get(ref('rlEstimateConversions', estimateId))]);
      if (!estimate.exists || !version.exists || !scoped(scope, estimate.data()) || !scoped(scope, version.data())
        || !['approved', 'converted'].includes(estimate.get('status')) || estimate.get('version') !== job.estimateVersion
        || approval.get('status') !== 'approved' || approval.get('version') !== job.estimateVersion || !approval.get('approvedAt')
        || !conversion.exists || conversion.get('jobId') !== jobRow.id || conversion.get('customerId') !== customerId || conversion.get('version') !== job.estimateVersion || (conversion.get('companyId') || null) !== (scope.companyId || null)
        || estimate.get('convertedJobId') !== jobRow.id || estimate.get('convertedCustomerId') !== customerId) fail('failed-precondition', 'The approved estimate/customer/job linkage is incomplete or inconsistent. Authorized review is required.');
      if (version.get('customerId') ? version.get('customerId') !== customerId : normalizeEmail(version.get('recipient.email')) !== normalizeEmail(customer.get('email'))) fail('failed-precondition', 'The approved estimate belongs to a different customer. Authorized review is required.');
      snapshot = approvedBillingSnapshot(version.data(), { estimateId, estimateVersion: job.estimateVersion, customerId });
      if (job.billingSnapshot && fingerprint(job.billingSnapshot) !== fingerprint(snapshot)) fail('failed-precondition', 'The job billing snapshot differs from the approved version. Authorized review is required.');
    } else {
      if (!Object.hasOwn(job, 'totalCost') || typeof job.totalCost !== 'number' || !Number.isFinite(job.totalCost)) fail('failed-precondition', 'This job has no explicit valid pricing source. Add and review the job price before invoicing; missing pricing is never treated as zero.');
      snapshot = { kind: 'job-price', customerId, serviceProperty: job.serviceProperty || { address: job.address || '' }, approvedScope: { serviceType: job.serviceType || '', scopeOfWork: job.scopeOfWork || '' },
        ...calculateTotals([{ description: job.serviceType || job.title || 'Service', kind: 'service', quantity: 1, unitPrice: job.totalCost }], job.taxRate === undefined ? 0 : job.taxRate) };
    }
    const sourceFingerprint = fingerprint({ jobId: jobRow.id, jobVersion: job.updatedAt || null, customerId, snapshot });
    return { snapshot, sourceFingerprint, customer };
  }
  async function context(tx, scope, jobId) {
    await assertInvoiceActor(db, tx, scope);
    const job = await tx.get(ref('jobs', jobId));
    if (!job.exists || !scoped(scope, job.data())) fail('permission-denied', 'This job is not available in your workspace.');
    const claimId = hash(`${scopeKey(scope)}:${jobId}`), claimRef = ref('rlInvoiceClaims', claimId);
    const [claim, historical] = await Promise.all([tx.get(claimRef), tx.get(db.collection('invoices').where('jobId', '==', jobId))]);
    const invoices = historical.docs.filter(row => scoped(scope, row.data()));
    const active = invoices.filter(row => row.get('status') !== 'void');
    if (active.length > 1) fail('failed-precondition', 'Multiple historical invoices exist for this job. Authorized financial review is required; no invoice was changed.');
    let existing = null;
    if (claim.exists) {
      existing = invoices.find(row => row.id === claim.get('invoiceId'));
      if (!existing || claim.get('jobId') !== jobId || (claim.get('companyId') || null) !== (scope.companyId || null) || active.length && active[0].id !== existing.id) fail('failed-precondition', 'The historical billing claim is inconsistent. Authorized financial review is required.');
    } else if (active.length) existing = active[0];
    else if (invoices.length === 1) existing = invoices[0];
    else if (invoices.length > 1) fail('failed-precondition', 'Several voided historical invoices need an explicit billing review before replacement.');
    return { job, claimId, claimRef, claim, existing };
  }
  function existingResult(row, job) {
    const invoice = invoiceView(row), reasons = historicalReview(row.data(), job.data());
    return { id: row.id, invoiceId: row.id, invoice, existing: true, existingInvoice: invoice, replacementRequired: invoice.status === 'void', reviewRequired: reasons.length > 0, reviewReasons: reasons };
  }
  function recordMutation(tx, scope, operationRef, operationFingerprint, invoiceId, before, after, action, result) {
    const auditId = hash(`mutation:${scopeKey(scope)}:${scope.uid}:${operationRef.id}`);
    const metadata = ['status', 'notes', 'issueDate', 'dueDate', 'paymentMethod', 'sentAt', 'paidAt', 'voidedAt'];
    const changedFields = metadata.filter(key => fingerprint(before?.[key] ?? null) !== fingerprint(after[key] ?? null));
    tx.create(operationRef, { companyId: scope.companyId || null, userId: scope.uid, invoiceId, fingerprint: operationFingerprint, action, result, createdAt: new Date(now()) });
    tx.create(ref('rlInvoiceAudit', auditId), { companyId: scope.companyId || null, actorId: scope.uid, invoiceId, action, fromRevision: before ? invoiceRevision(before) : null, toRevision: invoiceRevision(after), fromStatus: before?.status || null, toStatus: after.status, totalCents: after.totalCents ?? null, sourceFingerprint: after.sourceFingerprint || null,
      changedFields, before: canonical(Object.fromEntries(changedFields.map(key => [key, before?.[key] ?? null]))), after: canonical(Object.fromEntries(changedFields.map(key => [key, after[key] ?? null]))), createdAt: new Date(now()) });
  }
  return { handle: async request => {
    const scope = await requireCapability(db, request, 'invoices.manage'), data = request.data || {}, action = data.action;
    if (!['preview', 'create', 'replace', 'update', 'status'].includes(action)) fail('invalid-argument', 'Choose a supported invoice action.');
    const allowed = action === 'preview' ? ['action','jobId','replacementOf','expectedRevision'] : ['create','replace'].includes(action) ? ['action','jobId','operationId','sourceFingerprint','notes','dueInDays', ...(action === 'replace' ? ['replacementOf','expectedRevision'] : [])] : action === 'update' ? ['action','invoiceId','operationId','expectedRevision','changes'] : ['action','invoiceId','operationId','expectedRevision','status','paymentMethod'];
    knownFields(data, allowed);
    await rateLimit(db, 'invoice-' + action, scope.uid, action === 'preview' ? 60 : 30);
    let operationRef, operationFingerprint;
    if (action !== 'preview') {
      const operationId = documentId(data.operationId, 'operation');
      if (!/^[A-Za-z0-9_-]{16,100}$/.test(operationId)) fail('invalid-argument', 'Use a stable invoice operation ID.');
      operationRef = ref('rlInvoiceOperations', hash(`${scopeKey(scope)}:${scope.uid}:${operationId}`)); operationFingerprint = fingerprint(data);
    }
    if (['preview', 'create', 'replace'].includes(action)) {
      const jobId = documentId(data.jobId, 'job');
      return db.runTransaction(async tx => {
        const current = await context(tx, scope, jobId), { job, claimId, claimRef, claim, existing } = current;
        const prior = operationRef ? await tx.get(operationRef) : null;
        if (prior?.exists) { if (prior.get('fingerprint') !== operationFingerprint) fail('already-exists', 'This operation ID was already used for another invoice action.'); return prior.get('result'); }
        if (existing && !(action === 'replace' || action === 'preview' && data.replacementOf)) return existingResult(existing, job);
        if (action === 'replace' || data.replacementOf) {
          const replacementOf = documentId(data.replacementOf, 'voided invoice');
          if (existing?.get('replacementOf') === replacementOf && existing.get('status') !== 'void') return existingResult(existing, job);
          if (!existing || existing.id !== replacementOf || existing.get('status') !== 'void') fail('failed-precondition', 'Only the current explicitly selected voided invoice can be replaced. Refresh the billing history.');
          expectedRevision(existing.data(), data.expectedRevision);
          if (existing.get('paymentLock')) fail('failed-precondition', 'Cancel the payment attempt before replacing this invoice.');
        }
        const source = await billingSource(tx, scope, job), snapshot = source.snapshot;
        const preview = { jobId, sourceKind: snapshot.kind, sourceLabel: snapshot.kind === 'approved-estimate' ? `Approved estimate ${snapshot.estimateId}, version ${snapshot.estimateVersion}` : 'Reviewed job price', billingSource: snapshot, sourceFingerprint: source.sourceFingerprint,
          ...snapshot, ...(existing ? { replacementOf: existing.id, existingInvoice: invoiceView(existing), replacementRequired: true } : {}) };
        if (action === 'preview') return preview;
        if (data.sourceFingerprint !== source.sourceFingerprint) fail('aborted', 'The job or approved billing source changed. Refresh the invoice preview and review its amounts before creating.', { refreshPreview: true });
        const dueInDays = data.dueInDays === undefined ? 14 : data.dueInDays;
        if (!Number.isInteger(dueInDays) || dueInDays < 0 || dueInDays > 365) fail('invalid-argument', 'Invoice payment terms must be 0–365 days.');
        const notes = data.notes === undefined ? '' : cleanText(data.notes, 4000, 'Invoice notes'), generation = (claim.get('generation') || (existing ? 1 : 0)) + 1;
        if (!Number.isSafeInteger(generation) || generation < 1) fail('failed-precondition', 'The billing generation needs authorized review.');
        const invoiceId = `rl_inv_${claimId}_${generation}`, destination = ref('invoices', invoiceId), collision = await tx.get(destination);
        if (collision.exists) fail('failed-precondition', 'The invoice identity needs financial review; no existing invoice was overwritten.');
        const displayNumber = invoiceNumber(claimId, generation), sameNumber = await tx.get(db.collection('invoices').where('invoiceNumber', '==', displayNumber));
        if (!sameNumber.empty) fail('failed-precondition', 'The invoice number needs financial review; no existing invoice was renumbered or overwritten.');
        const issueDate = new Date(now()).toISOString().slice(0,10), dueDate = new Date(Date.parse(issueDate) + dueInDays * 86400000).toISOString().slice(0,10);
        const invoice = { companyId: scope.companyId || null, userId: job.get('userId') || scope.uid, jobId, customerId: source.customer.id, customerName: source.customer.get('name') || job.get('customerName') || '',
          customerEmail: normalizeEmail(source.customer.get('email')), customerAddress: snapshot.serviceProperty?.address || source.customer.get('address') || '', ...snapshot,
          billingSource: snapshot, sourceFingerprint: source.sourceFingerprint, invoiceNumber: displayNumber,
          status: 'draft', revision: 1, rlManaged: true, notes, issueDate, dueDate, createdAt: new Date(now()), updatedAt: new Date(now()), ...(existing ? { replacementOf: existing.id } : {}) };
        const result = { id: invoiceId, invoiceId, invoice: canonical({ ...invoice, id: invoiceId }), existing: false };
        tx.create(destination, invoice);
        tx.set(claimRef, { companyId: scope.companyId || null, userId: scope.uid, jobId, invoiceId, generation, ...(existing ? { previousInvoiceId: existing.id } : {}), updatedAt: new Date(now()) });
        recordMutation(tx, scope, operationRef, operationFingerprint, invoiceId, null, invoice, action === 'replace' ? 'invoice.replace' : 'invoice.create', result);
        return result;
      });
    }
    const invoiceId = documentId(data.invoiceId, 'invoice'), invoiceRef = ref('invoices', invoiceId);
    return db.runTransaction(async tx => {
      await assertInvoiceActor(db, tx, scope);
      const [row, previous] = await Promise.all([tx.get(invoiceRef), tx.get(operationRef)]);
      if (!row.exists || !scoped(scope, row.data())) fail('permission-denied', 'This invoice is not available in your workspace.');
      if (previous.exists) { if (previous.get('fingerprint') !== operationFingerprint) fail('already-exists', 'This operation ID was already used for another invoice action.'); return previous.get('result'); }
      const invoice = row.data(), revision = expectedRevision(invoice, data.expectedRevision);
      if (invoice.status === 'paid' || invoice.status === 'void') fail('failed-precondition', 'Paid and voided invoices are immutable. Review the financial history before taking another action.');
      if (invoice.paymentLock) fail('failed-precondition', 'Cancel or finish the payment attempt before changing this invoice.');
      const patch = { revision: revision + 1, updatedAt: new Date(now()) };
      if (action === 'update') {
        if (invoice.status !== 'draft') fail('failed-precondition', 'Issued invoice terms cannot be changed silently. Void and explicitly replace the invoice after reviewing the source.');
        if (!data.changes || typeof data.changes !== 'object' || Array.isArray(data.changes) || !Object.keys(data.changes).length) fail('invalid-argument', 'Include a permitted draft metadata change.');
        knownFields(data.changes, ['notes','dueDate','issueDate']);
        if (data.changes.notes !== undefined) patch.notes = cleanText(data.changes.notes, 4000, 'Invoice notes');
        if (data.changes.issueDate !== undefined) patch.issueDate = day(data.changes.issueDate, 'issue date');
        if (data.changes.dueDate !== undefined) patch.dueDate = day(data.changes.dueDate, 'due date');
        if ((patch.dueDate || invoice.dueDate) < (patch.issueDate || invoice.issueDate)) fail('invalid-argument', 'Due date cannot be before the issue date.');
      } else {
        if (!((invoice.status === 'draft' && ['sent','void'].includes(data.status)) || (invoice.status === 'sent' && ['paid','void'].includes(data.status)))) fail('failed-precondition', 'That invoice status transition is not permitted. Refresh the invoice.');
        if (['sent','paid'].includes(data.status)) { assertInvoiceTerms(invoice); await assertInvoiceRelationships(db, tx, scope, invoice); }
        patch.status = data.status;
        patch[data.status === 'sent' ? 'sentAt' : data.status === 'paid' ? 'paidAt' : 'voidedAt'] = new Date(now());
        if (data.status === 'paid') patch.paymentMethod = data.paymentMethod === undefined ? 'other' : cleanText(data.paymentMethod, 100, 'Payment method');
        else if (data.paymentMethod !== undefined) fail('invalid-argument', 'A payment method is allowed only when recording an invoice as paid.');
      }
      const updated = { ...invoice, ...patch }, result = { id: invoiceId, invoiceId, invoice: canonical({ ...updated, id: invoiceId }), existing: false };
      tx.update(invoiceRef, patch);
      recordMutation(tx, scope, operationRef, operationFingerprint, invoiceId, invoice, updated, action === 'status' ? 'invoice.' + data.status : 'invoice.update', result);
      return result;
    });
  } };
}
module.exports = { invoiceHandlers, assertInvoiceActor, invoiceRevision, expectedRevision, historicalReview, invoiceNumber, assertInvoiceTerms, assertInvoiceRelationships };
