const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
const { createWorkspaceQueryMock } = require('./support/workspaceQueryMock.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
let env, tree;
const hooks = createWorkspaceQueryMock(React, { scopeId: () => env.scope });
const pending = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve: value => resolve(value) }; };
const source = () => ({ success: true, jobId: 'job-one', sourceKind: 'approved-estimate', sourceLabel: 'Approved estimate terms', sourceFingerprint: 'approved-source-one',
  billingSource: { kind: 'approved-estimate', estimateId: 'estimate-one', estimateVersion: 2 }, currency: 'USD',
  lineItems: [{ id: 'line-one', description: 'Approved inspection', quantity: 2, unitPriceCents: 5000, amountCents: 10000 }], subtotalCents: 10000, taxCents: 825, totalCents: 10825, taxRate: 8.25 });
const invoice = (extra = {}) => ({ id: 'invoice-one', jobId: 'job-one', invoiceNumber: 'INV-ONE', customerName: 'Synthetic customer', status: 'draft', revision: 1, total: 108.25, subtotal: 100, tax: 8.25, taxRate: 8.25, dueDate: '2030-01-02', billingSource: { kind: 'approved-estimate' }, ...extra });
const service = {
  previewInvoiceFromJob: async (jobId, options) => { env.previews.push({ jobId, options }); if (env.previewPending) await env.previewPending.promise; if (env.previewError) return { success: false, error: env.previewError, code: env.previewCode }; return typeof env.preview === 'function' ? env.preview(options) : env.preview; },
  createInvoiceFromJob: async (jobId, options) => { env.creations.push({ jobId, options }); if (env.createPending) await env.createPending.promise; if (env.createError) return { success: false, error: env.createError, code: env.createCode }; return { success: true, id: 'invoice-one', invoice: invoice(), existing: env.existingResult }; },
  listInvoices: async () => ({ success: true, invoices: env.invoices }),
  submitInvoiceForApproval: (id, options) => mutate(id, 'awaiting_approval', options),
  approveInvoice: (id, options) => mutate(id, 'approved', options),
  issueInvoice: (id, options) => mutate(id, 'issued', options),
  markInvoiceSent: (id, options) => mutate(id, 'sent', options),
  markInvoicePaid: (id, method, options) => mutate(id, 'paid', options, method),
  voidInvoice: (id, options) => mutate(id, 'void', options),
};
async function mutate(id, status, options, method) {
  env.mutations.push({ id, status, options, method }); if (env.mutationPending) await env.mutationPending.promise;
  if (env.mutationError) return { success: false, error: env.mutationError, code: 'functions/aborted' };
  const updated = { ...env.invoices.find(row => row.id === id), status, revision: (options.expectedRevision || 0) + 1 };
  env.invoices = env.invoices.map(row => row.id === id ? updated : row); return { success: true, invoice: updated };
}
function compile(relative) {
  const module = { exports: {} };
  const importer = name => {
    if (name === 'react') return React;
    if (name.endsWith('/useWorkspaceQuery')) return hooks;
    if (name.endsWith('/workspaceQueryPolicy')) return { workspaceAccessError: error => ['functions/permission-denied', 'permission-denied'].includes(error?.code) };
    if (name.endsWith('/invoiceService')) return service;
    if (name.endsWith('/InvoiceCreationDialog')) return { __esModule: true, default: compile('components/InvoiceCreationDialog.jsx').default };
    if (name.endsWith('/InvoiceLedgerDialog') || name.endsWith('/InvoiceEditorDialog')) return { __esModule: true, default: () => null };
    if (name.endsWith('/invoiceMath')) return { isOverdue: () => false };
    if (name.endsWith('/tenancy')) return { can: () => env.finance };
    if (name.endsWith('/ConfirmProvider')) return { useConfirm: () => async () => true };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ userProfile: { businessName: 'Synthetic provider' } }) };
    if (name.endsWith('/workspaceApi')) return { callWorkspace: async (name, data) => { env.email.push({ name, data }); return data.action === 'status' ? { recipient: 'customer@example.invalid', delivery: env.email.length > 1 ? { status: 'queued' } : null } : { queued: true }; } };
    if (name.endsWith('/InvoicePayment') || name.endsWith('/PaymentHistory')) return { __esModule: true, default: () => null };
    if (name.endsWith('/paymentConfig')) return { paymentsConfigured: false, paymentMode: 'test' };
    if (name === 'react-hot-toast') return { __esModule: true, default: { success: message => env.toasts.push({ kind: 'success', message }), error: message => env.toasts.push({ kind: 'error', message }) } };
    throw Error('Unexpected invoice UI dependency ' + name);
  };
  new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src', relative), 'utf8'), { loader: 'jsx', format: 'cjs' }).code)(React, importer, module, module.exports);
  return module.exports;
}
const Dialog = compile('components/InvoiceCreationDialog.jsx').default, Page = compile('pages/InvoicesPage.jsx').default;
const text = node => typeof node === 'string' ? node : (node?.children || []).map(text).join('');
const content = () => text(tree.toJSON());
const button = name => tree.root.findAll(node => node.type === 'button' && text(node).trim() === name)[0];
async function click(name) { const target = button(name); assert.ok(target, name); await act(async () => target.props.onClick()); }
const dialogProps = () => ({ jobId: 'job-one', onClose: () => env.closed++, onCreated: result => env.confirmed.push(result), onOpenInvoice: id => env.opened.push(id) });
async function mount(Component = Dialog, props = dialogProps()) { env.Component = Component; env.props = props; await act(async () => { tree = create(React.createElement(Component, props), { createNodeMock: () => ({ focus() {}, querySelectorAll: () => [], contains: () => false }) }); }); }
beforeEach(() => {
  env = { scope: 'company-one', finance: true, preview: source(), previews: [], creations: [], confirmed: [], opened: [], closed: 0, previewPending: null, previewError: null, createPending: null, createError: null, existingResult: false,
    invoices: [invoice()], mutations: [], mutationPending: null, mutationError: null, email: [], toasts: [] };
  global.window = new EventTarget(); global.document = { body: { style: { overflow: 'auto' } }, activeElement: null, getElementById: () => null };
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; delete global.window; delete global.document; });

test('opening invoice review fetches only authoritative preview and displays approved lines, version and exact tax cents', async () => {
  await mount(); assert.equal(env.previews.length, 1); assert.equal(env.creations.length, 0); assert.match(content(), /Approved estimate version 2/);
  for (const value of ['Approved inspection', '$100.00', '$8.25', '$108.25']) assert.ok(content().includes(value));
  await click('Close preview'); assert.equal(env.closed, 1); assert.equal(env.creations.length, 0);
});
test('preview loading/failure is visible and Refresh retries only the preview', async () => {
  env.previewPending = pending(); await mount(); assert.match(content(), /Loading invoice preview/);
  env.previewError = 'Missing pricing source. Review the job.';
  await act(async () => env.previewPending.resolve()); assert.match(content(), /Missing pricing source/); assert.equal(button('Create draft invoice'), undefined);
  env.previewError = null; env.previewPending = null; await click('Refresh invoice preview'); assert.ok(button('Create draft invoice')); assert.equal(env.creations.length, 0); assert.equal(env.previews.length, 2);
  env.previewError = 'The billing source could not be refreshed.'; await act(async () => hooks.useInvalidateWorkspace()(['invoice-preview']));
  assert.equal(button('Create draft invoice').props.disabled, true); await click('Create draft invoice'); assert.equal(env.creations.length, 0);
});
test('double create tap submits one pinned source and remains pending until server acknowledgement', async () => {
  env.createPending = pending(); await mount(); const submit = button('Create draft invoice').props.onClick; let first;
  await act(async () => { first = submit(); submit(); }); assert.equal(env.creations.length, 1); assert.equal(env.confirmed.length, 0); assert.ok(button('Confirming invoice…')); assert.equal(button('Close preview').props.disabled, true);
  assert.equal(env.creations[0].options.sourceFingerprint, 'approved-source-one'); assert.equal(Object.hasOwn(env.creations[0].options, 'total'), false);
  await act(async () => { env.createPending.resolve(); await first; }); assert.equal(env.confirmed.length, 1);
});
test('failed or uncertain create retains preview and retries with the same operation identity', async () => {
  env.createError = 'Request status is uncertain. Retry the same request.'; await mount(); await click('Create draft invoice');
  assert.match(content(), /Request status is uncertain/); assert.equal(env.confirmed.length, 0); assert.ok(content().includes('$108.25'));
  assert.deepEqual(env.toasts.at(-1), { kind: 'error', message: env.createError }, 'The standard viewport toast reports submission failure even when the preview has scrolled to its final action');
  env.createError = null; env.existingResult = true; await click('Create draft invoice');
  assert.equal(env.creations.length, 2); assert.equal(env.creations[0].options.operationId, env.creations[1].options.operationId); assert.equal(env.confirmed.length, 1); assert.equal(env.confirmed[0].existing, true);
});
test('stale source requires refreshed preview and a deliberate submission against the newly displayed terms', async () => {
  env.createError = 'The job changed. Refresh the invoice preview.'; await mount(); await click('Create draft invoice');
  assert.deepEqual(env.toasts.at(-1), { kind: 'error', message: env.createError }, 'A stale-source conflict is immediately visible through the standard toast');
  const first = env.creations[0].options; env.preview = { ...source(), sourceFingerprint: 'new-source', totalCents: 10925, subtotalCents: 10100 };
  env.createError = null; await click('Refresh invoice preview'); assert.equal(env.creations.length, 1); assert.ok(content().includes('$109.25'));
  await click('Create draft invoice'); assert.notEqual(env.creations[1].options.operationId, first.operationId); assert.equal(env.creations[1].options.sourceFingerprint, 'new-source');
});
test('existing historical invoice preserves stored values and only opens the existing record', async () => {
  env.preview = { success: true, existingInvoice: invoice({ total: 79.13, subtotal: undefined, tax: undefined, revision: undefined }), reviewRequired: true };
  await mount(); assert.match(content(), /Existing invoice/); assert.ok(content().includes('$79.13')); assert.equal(button('Create draft invoice'), undefined); assert.match(content(), /authorized review/);
  await click('Open existing invoice'); assert.deepEqual(env.opened, ['invoice-one']); assert.equal(env.creations.length, 0);
});
test('a voided invoice requires explicit replacement review and carries its revision into a new deliberate draft request', async () => {
  env.preview = options => options.replacementOf ? { ...source(), replacementOf: 'invoice-one', existingInvoice: invoice({ status: 'void', revision: 4 }), replacementRequired: true }
    : { success: true, existingInvoice: invoice({ status: 'void', revision: 4 }), replacementRequired: true };
  await mount(); assert.equal(button('Create draft invoice'), undefined); await click('Review replacement'); assert.ok(button('Create replacement draft')); assert.equal(env.creations.length, 0);
  await click('Create replacement draft'); assert.equal(env.creations[0].options.replacementOf, 'invoice-one'); assert.equal(env.creations[0].options.expectedRevision, 4);
});
test('a late create acknowledgement after workspace change cannot open or confirm another company invoice', async () => {
  env.createPending = pending(); await mount(); let request; await act(async () => { request = button('Create draft invoice').props.onClick(); });
  env.scope = 'company-two'; env.preview = { success: false, error: 'No financial access.', code: 'permission-denied' };
  await act(async () => tree.update(React.createElement(Dialog, env.props)));
  await act(async () => { env.createPending.resolve(); await request; }); assert.equal(env.confirmed.length, 0); assert.equal(env.opened.length, 0); assert.doesNotMatch(content(), /Approved inspection/);
});
test('an authorization error in the same workspace hides billing terms and suppresses a late create acknowledgement', async () => {
  env.createPending = pending(); await mount(); let request; await act(async () => { request = button('Create draft invoice').props.onClick(); });
  env.preview = { success: false, error: 'Financial access was revoked.', code: 'permission-denied' };
  await act(async () => hooks.useInvalidateWorkspace()(['invoice-preview']));
  await act(async () => { env.createPending.resolve(); await request; });
  assert.equal(env.confirmed.length, 0); assert.doesNotMatch(content(), /Approved inspection|108.25/); assert.match(content(), /Financial access was revoked/);
});
test('invoice approval submission carries displayed revision, locks duplicate taps and preserves failure feedback', async () => {
  env.invoices = [invoice({ financialVersion: 2 })]; env.mutationPending = pending(); await mount(Page, {}); const submit = button('Submit for approval').props.onClick; let request;
  await act(async () => { request = submit(); submit(); }); assert.equal(env.mutations.length, 1); assert.equal(env.mutations[0].options.expectedRevision, 1); assert.equal(button('Submit for approval').props.disabled, true);
  env.mutationError = 'This invoice changed. Refresh before retrying.';
  await act(async () => { env.mutationPending.resolve(); await request; }); assert.match(content(), /This invoice changed/); assert.ok(button('Refresh invoice before retrying')); assert.equal(env.toasts.filter(value => value.kind === 'success').length, 0);
  env.mutationError = null; env.mutationPending = null; await click('Submit for approval'); assert.equal(env.mutations[0].options.operationId, env.mutations[1].options.operationId); assert.ok(button('Approve'));
});
test('historical test invoice amount is displayed unchanged and cannot enter new payment workflow', async () => {
  env.invoices = [invoice({ total: 17.31, subtotal: undefined, tax: undefined, billingSource: undefined, revision: undefined })];
  await mount(Page, {}); assert.ok(content().includes('$17.31')); assert.match(content(), /Legacy test record/); assert.equal(button('Delete'), undefined); assert.equal(button('Payments & credits'), undefined); assert.equal(env.mutations.length, 0);
});
test('invoice email reviews the recipient and includes current revision and recipient when sent', async () => {
  env.invoices = [invoice({ financialVersion: 2, status: 'issued', issuedSnapshot: { invoiceNumber: 'INV-ONE' } })];
  await mount(Page, {}); await click('Email PDF'); assert.deepEqual(env.email, [{ name: 'emailInvoice', data: { action: 'status', invoiceId: 'invoice-one' } }]);
  assert.match(content(), /customer@example.invalid/); assert.equal(env.toasts.length, 0);
  await click('Send invoice PDF'); assert.deepEqual(env.email[1], { name: 'emailInvoice', data: { invoiceId: 'invoice-one', expectedRevision: 1, expectedRecipient: 'customer@example.invalid' } });
  assert.match(content(), /Delivery is in progress/);
});

function realService(callWorkspace) {
  const module = { exports: {} };
  const importer = name => {
    if (name === './firebase') return { db: {} }; if (name === './tenancy') return { scopeWhere: () => ({ companyId: 'company-one' }) }; if (name === './workspaceApi') return { callWorkspace };
    if (name === 'firebase/firestore') return { collection() {}, query() {}, orderBy() {}, limit() {}, getDocsFromServer() { throw Error('This mutation must not read or write Firestore directly.'); } };
    throw Error('Unexpected authoritative invoice service dependency ' + name);
  };
  new Function('require', 'module', 'exports', transformSync(fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src/services/invoiceService.js'), 'utf8'), { format: 'cjs' }).code)(importer, module, module.exports); return module.exports;
}
test('invoice client forwards identifiers and pinned source, ignoring untrusted totals/lines/customer details', async () => {
  const calls = [], actual = realService(async (name, data) => { calls.push({ name, data }); return data.action === 'preview' ? source() : { id: 'invoice-one' }; });
  const result = await actual.createInvoice({ jobId: 'job-one', customerId: 'forged-customer', total: 0.01, taxRate: 0, lineItems: [{ unitPrice: 0.01 }] }, { operationId: 'stable-operation-one' });
  assert.equal(result.success, true); assert.equal(calls.length, 2); assert.deepEqual(calls[0], { name: 'rlManageInvoice', data: { action: 'preview', jobId: 'job-one' } });
  assert.deepEqual(calls[1], { name: 'rlManageInvoice', data: { action: 'create', jobId: 'job-one', operationId: 'stable-operation-one', sourceFingerprint: 'approved-source-one' } });
});
test('invoice client sends versioned metadata/status actions and has no mark-paid shortcut', async () => {
  const calls = [], actual = realService(async (name, data) => { calls.push({ name, data }); return { id: 'invoice-one' }; });
  const options = { expectedRevision: 7, operationId: 'stable-operation-one' };
  await actual.updateInvoice('invoice-one', { notes: 'Reviewed metadata' }, options); await actual.submitInvoiceForApproval('invoice-one', options); await actual.deleteDraftInvoice('invoice-one', options);
  assert.equal(actual.markInvoicePaid, undefined); assert.deepEqual(calls.map(row => row.data.action), ['update', 'status', 'status']); assert.deepEqual(calls[0].data.changes, { notes: 'Reviewed metadata' }); assert.equal(calls[1].data.status, 'awaiting_approval'); assert.equal(calls[2].data.status, 'void');
  for (const row of calls) { assert.equal(row.name, 'rlManageInvoice'); assert.equal(row.data.expectedRevision, 7); assert.equal(row.data.operationId, options.operationId); }
});
