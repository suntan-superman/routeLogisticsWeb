const { HttpsError } = require('firebase-functions/v2/https');
const { requireCapability, hasCapability } = require('./access');
const { documentId, hash, normalizeEmail, rateLimit } = require('./security');
const { calculateTotals, approvedBillingSnapshot, canonical, fingerprint, financialReviewReasons } = require('./shared/invoiceMath');
const { assertCurrentInvoice, publicSnapshot } = require('./shared/invoiceV2');
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
  const jobIds = Array.isArray(invoice.jobIds) ? invoice.jobIds : invoice.jobId ? [invoice.jobId] : [];
  for (const id of jobIds) {
    const job = await tx.get(db.doc(`jobs/${documentId(id, 'invoice job')}`));
    if (!job.exists || !scoped(scope, job.data()) || job.get('customerId') !== invoice.customerId || invoice.financialVersion === 2 && (job.get('status') !== 'completed' || job.get('deletedAt'))) fail('failed-precondition', 'An invoice visit changed or is unavailable. Review its billing source.');
    if (invoice.financialVersion === 2 && invoice.sourceJobVersions && fingerprint(job.get('updatedAt') || null) !== fingerprint(invoice.sourceJobVersions[id] || null)) fail('aborted', 'A billed visit changed since this draft was created. Review the invoice source.');
  }
}
function invoiceHandlers(db, { now = () => Date.now(), trustedSystem = false } = {}) {
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
    if (claim.exists && !invoices.some(row => row.id === claim.get('invoiceId'))) {
      const linked = await tx.get(ref('invoices', documentId(claim.get('invoiceId'), 'claimed invoice')));
      if (linked.exists && scoped(scope, linked.data()) && Array.isArray(linked.get('jobIds')) && linked.get('jobIds').includes(jobId)) invoices.push(linked);
    }
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
    const metadata = ['status', 'notes', 'customerFacingSummary', 'paymentTerms', 'approvedPhotos', 'lineItems', 'taxRate', 'totalCents', 'pricingOverrideReason', 'issueDate', 'dueDate', 'approvedAt', 'issuedAt', 'voidedAt'];
    const changedFields = metadata.filter(key => fingerprint(before?.[key] ?? null) !== fingerprint(after[key] ?? null));
    tx.create(operationRef, { companyId: scope.companyId || null, userId: scope.uid, invoiceId, fingerprint: operationFingerprint, action, result, createdAt: new Date(now()) });
    tx.create(ref('rlInvoiceAudit', auditId), { companyId: scope.companyId || null, actorId: scope.uid, invoiceId, action, fromRevision: before ? invoiceRevision(before) : null, toRevision: invoiceRevision(after), fromStatus: before?.status || null, toStatus: after.status, totalCents: after.totalCents ?? null, sourceFingerprint: after.sourceFingerprint || null,
      changedFields, before: canonical(Object.fromEntries(changedFields.map(key => [key, before?.[key] ?? null]))), after: canonical(Object.fromEntries(changedFields.map(key => [key, after[key] ?? null]))), createdAt: new Date(now()) });
  }
  return { handle: async request => {
    const scope = await requireCapability(db, request, 'invoices.manage'), data = request.data || {}, action = data.action;
    if (!['preview', 'create', 'replace', 'previewGroup', 'createGroup', 'createManual', 'update', 'status'].includes(action)) fail('invalid-argument', 'Choose a supported invoice action.');
    const allowed = action === 'preview' ? ['action','jobId','replacementOf','expectedRevision'] : ['create','replace'].includes(action) ? ['action','jobId','operationId','sourceFingerprint','notes','dueInDays', ...(action === 'replace' ? ['replacementOf','expectedRevision'] : [])] : action === 'previewGroup' ? ['action','jobIds'] : action === 'createGroup' ? ['action','jobIds','operationId','sourceFingerprint','dueInDays'] : action === 'createManual' ? ['action','customerId','lineItems','taxRate','servicePropertyAddress','customerFacingSummary','paymentTerms','dueInDays','operationId'] : action === 'update' ? ['action','invoiceId','operationId','expectedRevision','changes'] : ['action','invoiceId','operationId','expectedRevision','status','paymentMethod'];
    knownFields(data, allowed);
    if (!trustedSystem) await rateLimit(db, 'invoice-' + action, scope.uid, action === 'preview' ? 60 : 30);
    let operationRef, operationFingerprint;
    if (!['preview', 'previewGroup'].includes(action)) {
      const operationId = documentId(data.operationId, 'operation');
      if (!/^[A-Za-z0-9_-]{16,100}$/.test(operationId)) fail('invalid-argument', 'Use a stable invoice operation ID.');
      operationRef = ref('rlInvoiceOperations', hash(`${scopeKey(scope)}:${scope.uid}:${operationId}`)); operationFingerprint = fingerprint(data);
    }
    if (['previewGroup','createGroup'].includes(action)) {
      const jobIds = data.jobIds;
      if (!Array.isArray(jobIds) || jobIds.length < 2 || jobIds.length > 20 || new Set(jobIds).size !== jobIds.length) fail('invalid-argument', 'Choose 2–20 distinct completed jobs for one customer.');
      jobIds.forEach(id => documentId(id, 'job'));
      const sorted = [...jobIds].sort();
      return db.runTransaction(async tx => {
        const prior = operationRef ? await tx.get(operationRef) : null;
        if (prior?.exists) { if (prior.get('fingerprint') !== operationFingerprint) fail('already-exists', 'This operation ID belongs to another invoice action.'); return prior.get('result'); }
        const contexts = [];
        for (const id of sorted) contexts.push(await context(tx, scope, id));
        const existing = contexts.map(item => item.existing).filter(Boolean);
        if (existing.length) {
          if (existing.length === sorted.length && existing.every(row => row.id === existing[0].id) && existing[0].get('status') !== 'void') return existingResult(existing[0], contexts[0].job);
          fail('failed-precondition', 'One or more visits already have an invoice. Review those invoices before consolidating.');
        }
        const sources = [];
        for (const item of contexts) sources.push(await billingSource(tx, scope, item.job));
        if (new Set(sources.map(item => item.customer.id)).size !== 1 || new Set(sources.map(item => item.snapshot.taxRate)).size !== 1) fail('failed-precondition', 'Consolidated visits must share one customer and tax rate.');
        const lines = sources.flatMap((source, index) => source.snapshot.lineItems.map(line => ({ ...line, description: `${line.description} — ${source.snapshot.serviceProperty?.address || contexts[index].job.get('date') || 'Service visit'}`.slice(0, 300) })));
        const snapshot = calculateTotals(lines, sources[0].snapshot.taxRate);
        if (sources.reduce((total, source) => total + source.snapshot.totalCents, 0) !== snapshot.totalCents) fail('failed-precondition', 'Combined tax rounding differs from individual visits. Invoice these visits separately.');
        const sourceFingerprint = fingerprint({ jobIds: sorted, sources: sources.map(source => source.sourceFingerprint) });
        const preview = { jobIds: sorted, customerId: sources[0].customer.id, sourceFingerprint, ...snapshot };
        if (action === 'previewGroup') return preview;
        if (sourceFingerprint !== data.sourceFingerprint) fail('aborted', 'Billing sources changed. Review the consolidated preview again.');
        const dueInDays = data.dueInDays === undefined ? 14 : data.dueInDays;
        if (!Number.isInteger(dueInDays) || dueInDays < 0 || dueInDays > 365) fail('invalid-argument', 'Invoice payment terms must be 0–365 days.');
        const groupId = hash(`${scopeKey(scope)}:group:${sorted.join(':')}`), invoiceId = `rl_inv_${groupId}_1`, destination = ref('invoices', invoiceId);
        if ((await tx.get(destination)).exists) fail('failed-precondition', 'This consolidated invoice already exists. Refresh before retrying.');
        const issueDate = new Date(now()).toISOString().slice(0,10), dueDate = new Date(Date.parse(issueDate) + dueInDays * 86400000).toISOString().slice(0,10);
        const invoice = { companyId: scope.companyId || null, userId: contexts[0].job.get('userId') || scope.uid, jobId: sorted[0], jobIds: sorted,
          customerId: sources[0].customer.id, customerName: sources[0].customer.get('name') || '', customerEmail: normalizeEmail(sources[0].customer.get('email')),
          customerAddress: sources[0].customer.get('address') || '', ...snapshot, billingSource: { kind: 'consolidated', jobIds: sorted, sources: sources.map(source => source.snapshot) }, sourceFingerprint,
          sourceJobVersions: Object.fromEntries(contexts.map(item => [item.job.id, item.job.get('updatedAt') || null])),
          invoiceNumber: invoiceNumber(groupId, 1), financialVersion: 2, status: 'draft', revision: 1, rlManaged: true, paidCents: 0, creditCents: 0, balanceCents: snapshot.totalCents,
          notes: '', customerFacingSummary: '', issueDate, dueDate, createdAt: new Date(now()), updatedAt: new Date(now()) };
        const result = { id: invoiceId, invoiceId, invoice: canonical({ ...invoice, id: invoiceId }), existing: false };
        tx.create(destination, invoice);
        contexts.forEach(item => tx.set(item.claimRef, { companyId: scope.companyId || null, userId: scope.uid, jobId: item.job.id, invoiceId, generation: 1, updatedAt: new Date(now()) }));
        recordMutation(tx, scope, operationRef, operationFingerprint, invoiceId, null, invoice, 'invoice.createGroup', result);
        return result;
      });
    }
    if (action === 'createManual') {
      const customerId = documentId(data.customerId, 'customer'), dueInDays = data.dueInDays === undefined ? 14 : data.dueInDays;
      if (!Number.isInteger(dueInDays) || dueInDays < 0 || dueInDays > 365) fail('invalid-argument', 'Choose payment terms of 0–365 days.');
      const totals = calculateTotals(data.lineItems, data.taxRate ?? 0);
      const servicePropertyAddress = data.servicePropertyAddress === undefined ? '' : cleanText(data.servicePropertyAddress, 300, 'Service property address');
      const customerFacingSummary = data.customerFacingSummary === undefined ? '' : cleanText(data.customerFacingSummary, 2000, 'Service summary');
      const paymentTerms = data.paymentTerms === undefined ? '' : cleanText(data.paymentTerms, 1000, 'Payment terms');
      return db.runTransaction(async tx => {
        await assertInvoiceActor(db, tx, scope);
        const prior = await tx.get(operationRef);
        if (prior.exists) { if (prior.get('fingerprint') !== operationFingerprint) fail('already-exists', 'This operation ID belongs to another invoice action.'); return prior.get('result'); }
        const customer = await tx.get(ref('customers', customerId));
        if (!customer.exists || !scoped(scope, customer.data()) || customer.get('isActive') === false || customer.get('deletedAt')) fail('permission-denied', 'Choose an active customer in this workspace.');
        const claimId = hash(`${scopeKey(scope)}:manual:${operationRef.id}`), invoiceId = `rl_inv_${claimId}_1`, destination = ref('invoices', invoiceId);
        if ((await tx.get(destination)).exists) fail('failed-precondition', 'This invoice already exists. Refresh before retrying.');
        const number = invoiceNumber(claimId, 1), duplicateNumber = await tx.get(db.collection('invoices').where('invoiceNumber', '==', number));
        if (!duplicateNumber.empty) fail('failed-precondition', 'Invoice number collision. No invoice was created.');
        const issueDate = new Date(now()).toISOString().slice(0, 10), dueDate = new Date(Date.parse(issueDate) + dueInDays * 86400000).toISOString().slice(0, 10);
        const invoice = { companyId: scope.companyId || null, userId: scope.uid, customerId, customerName: customer.get('name') || '', customerEmail: normalizeEmail(customer.get('email')),
          customerAddress: customer.get('address') || '', billingSource: { kind: 'manual', serviceProperty: { address: servicePropertyAddress } }, sourceFingerprint: fingerprint({ customerId, totals, servicePropertyAddress }),
          ...totals, invoiceNumber: number, financialVersion: 2, status: 'draft', revision: 1, rlManaged: true, paidCents: 0, creditCents: 0, balanceCents: totals.totalCents,
          notes: '', customerFacingSummary, paymentTerms, issueDate, dueDate, createdAt: new Date(now()), updatedAt: new Date(now()) };
        const result = { id: invoiceId, invoiceId, invoice: canonical({ ...invoice, id: invoiceId }), existing: false };
        tx.create(destination, invoice); recordMutation(tx, scope, operationRef, operationFingerprint, invoiceId, null, invoice, 'invoice.createManual', result);
        return result;
      });
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
          billingSource: snapshot, sourceFingerprint: source.sourceFingerprint, sourceJobVersions: { [jobId]: job.get('updatedAt') || null }, invoiceNumber: displayNumber,
          status: 'draft', financialVersion: 2, paidCents: 0, creditCents: 0, balanceCents: snapshot.totalCents,
          revision: 1, rlManaged: true, notes, customerFacingSummary: '', issueDate, dueDate, createdAt: new Date(now()), updatedAt: new Date(now()), ...(existing ? { replacementOf: existing.id } : {}) };
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
      assertCurrentInvoice(invoice);
      if (invoice.status === 'paid' || invoice.status === 'void') fail('failed-precondition', 'Paid and voided invoices are immutable. Review the financial history before taking another action.');
      if (invoice.paymentLock) fail('failed-precondition', 'Cancel or finish the payment attempt before changing this invoice.');
      const patch = { revision: revision + 1, updatedAt: new Date(now()) };
      if (action === 'update') {
        if (invoice.status !== 'draft') fail('failed-precondition', 'Issued invoice terms cannot be changed silently. Void and explicitly replace the invoice after reviewing the source.');
        if (!data.changes || typeof data.changes !== 'object' || Array.isArray(data.changes) || !Object.keys(data.changes).length) fail('invalid-argument', 'Include a permitted draft metadata change.');
        knownFields(data.changes, ['notes','dueDate','issueDate','customerFacingSummary','paymentTerms','approvedPhotoIds','lineItems','taxRate','pricingOverrideReason']);
        if (data.changes.notes !== undefined) patch.notes = cleanText(data.changes.notes, 4000, 'Invoice notes');
        if (data.changes.customerFacingSummary !== undefined) patch.customerFacingSummary = cleanText(data.changes.customerFacingSummary, 2000, 'Service summary');
        if (data.changes.paymentTerms !== undefined) patch.paymentTerms = cleanText(data.changes.paymentTerms, 1000, 'Payment terms');
        if (data.changes.lineItems !== undefined || data.changes.taxRate !== undefined) {
          if (invoice.billingSource?.kind === 'approved-estimate') fail('failed-precondition', 'Approved estimate pricing is immutable. Correct the source estimate through its authorized version workflow.');
          const reason = cleanText(data.changes.pricingOverrideReason || '', 500, 'Pricing change reason');
          if (reason.length < 5) fail('invalid-argument', 'Explain the management pricing change.');
          Object.assign(patch, calculateTotals(data.changes.lineItems || invoice.lineItems, data.changes.taxRate ?? invoice.taxRate));
          patch.balanceCents = patch.totalCents; patch.pricingOverrideReason = reason;
        }
        if (data.changes.approvedPhotoIds !== undefined) {
          const ids = data.changes.approvedPhotoIds;
          if (!Array.isArray(ids) || ids.length > 12 || new Set(ids).size !== ids.length || !invoice.jobId) fail('invalid-argument', 'Choose up to 12 unique photos from this job.');
          const photos = [];
          for (const id of ids) {
            const photo = await tx.get(ref('photos', documentId(id, 'photo')));
            if (!photo.exists || photo.get('jobId') !== invoice.jobId || photo.get('customerId') !== invoice.customerId || (photo.get('companyId') || null) !== (scope.companyId || null)
              || typeof photo.get('storagePath') !== 'string' || !photo.get('storagePath').startsWith(`rlJobPhotos/${scope.companyId || scope.uid}/${invoice.jobId}/`)) fail('permission-denied', 'Selected photo does not belong to this invoice visit.');
            photos.push({ photoId: photo.id, storagePath: photo.get('storagePath'), caption: String(photo.get('caption') || '').slice(0, 300), approved: true });
          }
          patch.approvedPhotos = photos;
        }
        if (data.changes.issueDate !== undefined) patch.issueDate = day(data.changes.issueDate, 'issue date');
        if (data.changes.dueDate !== undefined) patch.dueDate = day(data.changes.dueDate, 'due date');
        if ((patch.dueDate || invoice.dueDate) < (patch.issueDate || invoice.issueDate)) fail('invalid-argument', 'Due date cannot be before the issue date.');
      } else {
        const transitions = { draft: ['awaiting_approval', 'void'], awaiting_approval: ['draft', 'approved', 'void'], approved: ['draft', 'issued', 'void'], issued: ['void'], partially_paid: [] };
        if (!transitions[invoice.status]?.includes(data.status)) fail('failed-precondition', 'That invoice transition is not permitted. Refresh the invoice.');
        if (data.paymentMethod !== undefined) fail('invalid-argument', 'Record payments through the audited payment ledger.');
        if (['approved', 'issued'].includes(data.status)) { assertInvoiceTerms(invoice); await assertInvoiceRelationships(db, tx, scope, invoice); }
        patch.status = data.status;
        if (data.status === 'approved') { patch.approvedAt = new Date(now()); patch.approvedBy = scope.uid; }
        if (data.status === 'draft') { patch.approvedAt = null; patch.approvedBy = null; }
        if (data.status === 'issued') {
          if (!invoice.approvedAt || !invoice.approvedBy) fail('failed-precondition', 'Management approval is required before issuing.');
          const company = scope.companyId ? await tx.get(ref('companies', scope.companyId)) : null;
          patch.issuedSnapshot = publicSnapshot(invoice, company?.data() || {});
          patch.issuedAt = new Date(now());
          patch.balanceCents = invoice.totalCents;
        }
        if (data.status === 'void') {
          if (invoice.paidCents || invoice.creditCents) fail('failed-precondition', 'An invoice with payment activity requires an audited correction before voiding.');
          patch.voidedAt = new Date(now());
        }
      }
      const updated = { ...invoice, ...patch }, result = { id: invoiceId, invoiceId, invoice: canonical({ ...updated, id: invoiceId }), existing: false };
      tx.update(invoiceRef, patch);
      recordMutation(tx, scope, operationRef, operationFingerprint, invoiceId, invoice, updated, action === 'status' ? 'invoice.' + data.status : 'invoice.update', result);
      return result;
    });
  } };
}
module.exports = { invoiceHandlers, assertInvoiceActor, invoiceRevision, expectedRevision, historicalReview, invoiceNumber, assertInvoiceTerms, assertInvoiceRelationships };
