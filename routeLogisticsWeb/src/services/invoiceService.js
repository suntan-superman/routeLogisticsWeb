import { collection, getDocsFromServer, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import { scopeWhere } from './tenancy';
import { callWorkspace } from './workspaceApi';

const ok = (data = {}) => ({ success: true, ...data });
const fail = error => {
  console.error('Invoice operation failed', { code: error.code || 'unknown' });
  return { success: false, error: error.message || String(error), ...(error.code ? { code: error.code } : {}) };
};
const jobIdentity = job => typeof job === 'string' ? job : job?.id;
const operationId = options => options.operationId || crypto.randomUUID();
const invoke = async (action, data) => {
  try { return ok(await callWorkspace('rlManageInvoice', { action, ...data })); }
  catch (error) { return fail(error); }
};

export async function listInvoices(max = 200) {
  try {
    // Keep the last confirmed server snapshot when a background refresh fails.
    const snap = await getDocsFromServer(query(collection(db, 'invoices'), scopeWhere(), orderBy('createdAt', 'desc'), limit(max)));
    return ok({ invoices: snap.docs.map(d => ({ ...d.data(), id: d.id })) });
  } catch (error) { return fail(error); }
}

export const previewInvoiceFromJob = (job, options = {}) => invoke('preview', {
  jobId: jobIdentity(job),
  ...(options.replacementOf ? { replacementOf: options.replacementOf, expectedRevision: options.expectedRevision } : {}),
});

// Pricing comes exclusively from the canonical job/approved estimate on the
// server. Legacy caller-supplied lines, customer details and totals are ignored.
export async function createInvoice({ jobId, notes, dueInDays } = {}, options = {}) {
  if (!jobId) return fail(new Error('Select a completed job before creating an invoice.'));
  let fingerprint = options.sourceFingerprint;
  if (!fingerprint) {
    const preview = await previewInvoiceFromJob(jobId, options);
    if (!preview.success) return preview;
    if (preview.existingInvoice && !options.replacementOf) return ok({ id: preview.existingInvoice.id, invoiceId: preview.existingInvoice.id, invoice: preview.existingInvoice, existing: true, replacementRequired: preview.replacementRequired === true });
    fingerprint = preview.sourceFingerprint;
  }
  return invoke(options.replacementOf ? 'replace' : 'create', {
    jobId, operationId: operationId(options), sourceFingerprint: fingerprint,
    ...(notes !== undefined ? { notes } : {}), ...(dueInDays !== undefined ? { dueInDays } : {}),
    ...(options.replacementOf ? { replacementOf: options.replacementOf, expectedRevision: options.expectedRevision } : {}),
  });
}
export const createInvoiceFromJob = (job, options = {}) => createInvoice({ jobId: jobIdentity(job), ...(options.notes !== undefined ? { notes: options.notes } : {}), ...(options.dueInDays !== undefined ? { dueInDays: options.dueInDays } : {}) }, options);

export const updateInvoice = (id, changes = {}, options = {}) => invoke('update', {
  invoiceId: id, changes, expectedRevision: options.expectedRevision, operationId: operationId(options),
});
export const createManualInvoice = (details, options = {}) => invoke('createManual', { ...details, operationId: operationId(options) });
const setStatus = (id, status, options = {}, extra = {}) => invoke('status', {
  invoiceId: id, status, expectedRevision: options.expectedRevision, operationId: operationId(options), ...extra,
});
export const submitInvoiceForApproval = (id, options = {}) => setStatus(id, 'awaiting_approval', options);
export const approveInvoice = (id, options = {}) => setStatus(id, 'approved', options);
export const issueInvoice = (id, options = {}) => setStatus(id, 'issued', options);
export const voidInvoice = (id, options = {}) => setStatus(id, 'void', options);

// Compatibility entry point: drafts are voided with an audit trail, never deleted.
export const deleteDraftInvoice = (id, options = {}) => voidInvoice(id, options);
