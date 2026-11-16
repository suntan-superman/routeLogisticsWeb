const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
const { createWorkspaceQueryMock, selectControlMock } = require('./support/workspaceQueryMock.cjs');
const hooks = createWorkspaceQueryMock(React);
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, env;
const base = (id, extra = {}) => ({ id, companyId: 'synthetic-company', customerName: id === 'job-one' ? 'First customer' : 'Second customer', serviceType: id === 'job-one' ? 'Ant prevention' : 'Pool service', address: '100 Synthetic Street', date: '2026-11-16', time: '09:00', status: 'completed', updatedAt: 'v1', ...extra });
const moduleCache = new Map();
function compile(relative) {
  if (moduleCache.has(relative)) return moduleCache.get(relative);
  const module = { exports: {} };
  const importer = name => {
    if (name === 'react') return React;
    if (name.endsWith('/useWorkspaceQuery')) return hooks;
    if (name.endsWith('/SelectControl')) return { __esModule: true, default: selectControlMock(React) };
    if (name === 'framer-motion') return { motion: { div: ({ children, ...props }) => React.createElement('div', props, children) } };
    if (name === '@heroicons/react/24/outline') return new Proxy({}, { get: () => () => null });
    if (name === 'react-router-dom') return { useNavigate: () => destination => env.navigation.push(destination) };
    if (name === 'react-hot-toast') return { __esModule: true, default: { success: value => env.toasts.push(value), error: value => env.toasts.push(value) } };
    if (name.endsWith('/tenancy')) return { canManage: () => true, can: () => true };
    if (name.endsWith('/ConfirmProvider')) return { useConfirm: () => async () => false };
    if (name.endsWith('/useUnsavedChanges')) return { useUnsavedChanges: () => ({ confirmDiscard: async () => true }) };
    if (name.endsWith('/workspaceQueryPolicy')) return { workspaceAccessError: error => ['permission-denied', 'unauthenticated', 'not-found'].includes(String(error?.code || '').replace(/^functions\//, '')) };
    if (name.endsWith('/jobManagementService')) return { __esModule: true, default: {
      getJobs: async () => ({ success: true, jobs: env.jobs }),
      getJob: async id => { env.reads.push({ resource: 'job', id }); if (env.jobFailure) throw env.jobFailure; return { success: true, job: env.jobs.find(row => row.id === id) }; },
      updateJobStatus: async () => { throw Error('Read-only details must not update a job.'); },
    } };
    if (name.endsWith('/customerService')) return { __esModule: true, default: { getCustomers: async () => ({ success: true, customers: [] }) } };
    if (name.endsWith('/invoiceService')) return {
      previewInvoiceFromJob: async jobId => { env.invoicePreviews.push(jobId); return { success: true, sourceKind: 'job-price', sourceFingerprint: 'preview-only', lineItems: [{ description: 'Saved service', quantity: 1, unitPrice: 100, amount: 100 }], subtotal: 100, tax: 0, total: 100 }; },
      createInvoiceFromJob: async () => { env.invoiceMutations++; throw Error('Viewing details must not create invoices.'); },
    };
    if (name.endsWith('/workspaceApi')) return { callWorkspace: async (name, data) => {
      env.calls.push({ name, data });
      assert.equal(name, 'rlJobVisit'); assert.equal(data.action, 'list');
      if (env.visitPending) await env.visitPending;
      if (env.visitFailure) throw env.visitFailure;
      return { events: env.visits[data.jobId] || [] };
    } };
    if (name.endsWith('/JobChangeHistory')) return { __esModule: true, default: () => null, ModifiedBadge: () => null };
    if (name.endsWith('/JobFormModal')) return { __esModule: true, default: () => null };
    const section = ['/JobPhotos', '/ServiceChecklist', '/JobApplicationLog'].find(suffix => name.endsWith(suffix));
    if (section) return { __esModule: true, default: ({ job }) => React.createElement('section', { 'aria-label': section.slice(1) }, `${section.slice(1)} for ${job.id}`) };
    if (name.startsWith('.')) {
      const file = path.resolve(path.dirname(path.resolve(__dirname, '../routeLogisticsWeb/src', relative)), name);
      return compile(path.relative(path.resolve(__dirname, '../routeLogisticsWeb/src'), path.extname(file) ? file : fs.existsSync(file + '.jsx') ? file + '.jsx' : file + '.js'));
    }
    throw Error('Unexpected Job Details dependency ' + name);
  };
  new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src', relative), 'utf8'), { loader: relative.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs' }).code)(React, importer, module, module.exports);
  moduleCache.set(relative, module.exports); return module.exports;
}
const Page = compile('pages/JobManagementPage.jsx').default;
const textOf = node => typeof node === 'string' ? node : (Array.isArray(node) ? node : node?.children || []).map(textOf).join('');
const content = () => textOf(tree.toJSON());
const button = label => tree.root.findAll(node => node.type === 'button' && textOf(node).trim() === label)[0];
const dialog = () => tree.root.findAll(node => node.props.role === 'dialog' && node.props['aria-label'] === 'Job Details')[0];
const section = label => tree.root.findAll(node => node.type === 'section' && node.props['aria-label'] === label)[0];
const click = async label => { const target = button(label); assert.ok(target, label); await act(async () => target.props.onClick({ currentTarget: { focus() {}, isConnected: true } })); };
const mount = async () => act(async () => { tree = create(React.createElement(Page), { createNodeMock: () => ({ focus() {}, contains: () => false, querySelectorAll: () => [], isConnected: true }) }); });
beforeEach(() => {
  global.window = new EventTarget(); global.document = { body: { style: { overflow: '' } }, activeElement: null, querySelectorAll: () => [] };
  env = { jobs: [base('job-one', { workNotes: 'Observed exterior damage.\nDiscussed with dispatch.', dispatchNotes: 'Gate code 2468.', notes: 'Legacy instructions.', actualWorkDone: 'Exterior inspection', completionNotes: 'No product applied.' }), base('job-two', { workNotes: 'Second job work log.' })], visits: { 'job-one': [{ id: 'arrival-one', type: 'arrived', capturedAt: '2026-11-16T17:10:00Z', source: 'manual-gps', accuracy: 12, note: 'Access confirmed.' }, { id: 'departure-one', type: 'departed', capturedAt: '2026-11-16T17:50:00Z', source: 'manual', note: 'Service completed.' }] }, reads: [], calls: [], invoicePreviews: [], invoiceMutations: 0, navigation: [], toasts: [], visitFailure: null, visitPending: null, jobFailure: null };
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; delete global.window; delete global.document; });

test('Jobs service name opens details without relying on the offscreen Actions column', async () => {
  await mount(); const opener = button('Ant prevention'); assert.ok(opener, 'Service name is a native keyboard-operable button'); assert.equal(dialog(), undefined);
  await click('Ant prevention'); assert.ok(dialog()); assert.match(textOf(dialog()), /First customer/);
  assert.ok(env.reads.some(row => row.id === 'job-one')); assert.deepEqual(env.calls, [{ name: 'rlJobVisit', data: { action: 'list', jobId: 'job-one' } }]);
  assert.equal(env.navigation.length, 0);
});

test('Jobs details show canonical notes, dispatcher instructions, completed work and existing child sections', async () => {
  await mount(); await click('Ant prevention');
  assert.match(textOf(section('Work notes')), /Observed exterior damage\.\nDiscussed with dispatch\./);
  assert.doesNotMatch(textOf(section('Work notes')), /2468|Legacy instructions/);
  assert.match(textOf(section('Job instructions')), /Gate code 2468/);
  assert.doesNotMatch(textOf(section('Job instructions')), /exterior damage|Legacy instructions/);
  assert.match(textOf(section('Completed work')), /Exterior inspection.*No product applied/);
  for (const child of ['JobPhotos', 'ServiceChecklist', 'JobApplicationLog']) assert.equal(textOf(section(child)), `${child} for job-one`);
});

test('Jobs details render tenant-authorized arrival and departure evidence with their notes', async () => {
  await mount(); await click('Ant prevention'); const visits = textOf(section('Visit record'));
  assert.match(visits, /Arrived/); assert.match(visits, /Departed/); assert.match(visits, /Access confirmed/); assert.match(visits, /Service completed/); assert.match(visits, /GPS accuracy: ±12 m/);
  assert.match(visits, /Manual reports and GPS evidence do not independently verify access/);
});

test('intentionally empty work notes do not display legacy dispatcher instructions as a work log', async () => {
  env.jobs[0] = { ...env.jobs[0], workNotes: '', dispatchNotes: undefined, notes: 'Legacy gate instructions only.' };
  await mount(); await click('Ant prevention'); assert.equal(section('Work notes'), undefined);
  assert.match(textOf(section('Job instructions')), /Legacy gate instructions only/);
});

test('visit loading and failure remain visible in Job Details and Retry only refetches visit records', async () => {
  let release; env.visitPending = new Promise(resolve => { release = resolve; });
  await mount(); await click('Ant prevention'); assert.match(content(), /Loading visit records/);
  env.visitFailure = Error('Visit history could not be retrieved.');
  await act(async () => { release(); }); assert.match(textOf(section('Visit record')), /Visit history could not be retrieved/);
  const reads = env.reads.length; env.visitFailure = null; env.visitPending = null; await click('Retry visit records');
  assert.match(textOf(section('Visit record')), /Access confirmed/); assert.equal(env.reads.length, reads);
  assert.equal(env.calls.length, 2); assert.ok(dialog());
});

test('closing, reopening and choosing another Jobs row preserve the correct note and visit context', async () => {
  await mount(); await click('Ant prevention'); await click('Close'); assert.equal(dialog(), undefined);
  await click('Ant prevention'); assert.match(textOf(section('Work notes')), /Observed exterior damage/); await click('Close');
  await click('Pool service'); assert.match(textOf(section('Work notes')), /Second job work log/); assert.doesNotMatch(textOf(dialog()), /Observed exterior damage|Access confirmed/);
  assert.match(textOf(section('Visit record')), /No visit events recorded/); assert.equal(env.calls.at(-1).data.jobId, 'job-two');
});

test('targeted job refresh updates displayed work notes while leaving Job Details open', async () => {
  await mount(); await click('Ant prevention');
  env.jobs = env.jobs.map(job => job.id === 'job-one' ? { ...job, workNotes: 'Synchronized from the mobile app.', updatedAt: 'v2' } : job);
  await act(async () => hooks.useInvalidateWorkspace()(['job', 'jobs']));
  assert.ok(dialog()); assert.match(textOf(section('Work notes')), /Synchronized from the mobile app/); assert.doesNotMatch(textOf(section('Work notes')), /Observed exterior damage/);
});

test('an authorization failure during refresh removes private selected job details instead of displaying a stale snapshot', async () => {
  await mount(); await click('Ant prevention');
  env.jobFailure = Object.assign(Error('This job is not assigned to your workspace.'), { code: 'functions/permission-denied' });
  await act(async () => hooks.useInvalidateWorkspace()(['job']));
  assert.equal(dialog(), undefined); assert.doesNotMatch(content(), /Observed exterior damage|Access confirmed|Gate code 2468/);
  assert.ok(button('Close unavailable job'));
});

test('completed Job Details opens an explicit invoice review and closing preview does not create or send an invoice', async () => {
  await mount(); await click('Ant prevention'); assert.equal(env.invoicePreviews.length, 0); assert.equal(env.invoiceMutations, 0);
  await click('Create Invoice'); assert.equal(dialog(), undefined); assert.deepEqual(env.invoicePreviews, ['job-one']); assert.equal(env.invoiceMutations, 0);
  const preview = tree.root.findAll(node => node.props.role === 'dialog' && node.props['aria-labelledby'] === 'invoice-preview-title')[0]; assert.ok(preview); assert.match(textOf(preview), /Create draft invoice/);
  await click('Close preview'); assert.ok(dialog()); assert.equal(env.invoiceMutations, 0); assert.equal(env.navigation.length, 0);
});
