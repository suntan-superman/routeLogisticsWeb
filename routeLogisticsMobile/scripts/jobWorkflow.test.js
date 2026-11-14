const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { create, act } = require('react-test-renderer');
const babel = require('@babel/core');
const { workspacePermissions } = require('../services/workspacePolicy');
global.IS_REACT_ACT_ENVIRONMENT = true;
let account, tree, photoProps, workProps, photoMounts, photoUnmounts, calls, loader, savedRead, reads, changes, closes, interactions, discarded, navigationCalls;
const saved = new Map();
const native = Object.fromEntries(['View', 'Text', 'ScrollView', 'ActivityIndicator'].map(name => [name, name]));
native.Linking = { openURL: async url => navigationCalls.push(url) };
const palette = { text: '#FFF', secondary: '#CCC', danger: '#F00', accent: '#0F0', background: '#000' };
function Photos(props) {
  photoProps = props;
  React.useEffect(() => { photoMounts++; return () => { photoUnmounts++; }; }, []);
  return React.createElement('PhotoPanel', { jobId: props.job.id });
}
function button({ title, accessibilityLabel, onPress, disabled, busy }) {
  return React.createElement('Pressable', { accessibilityLabel: accessibilityLabel || title, onPress, disabled: disabled || busy, busy }, React.createElement('Text', null, title));
}
function load() {
  const filename = path.resolve(__dirname, '../components/JobWorkflow.js'), module = { exports: {} };
  const requireMock = specifier => {
    if (specifier.startsWith('@babel/runtime/')) return require(specifier);
    if (specifier === 'react') return React;
    if (specifier === 'react-native') return native;
    if (specifier.endsWith('/contexts/AuthContext')) return { useAuth: () => account };
    if (specifier.endsWith('/theme/ThemeProvider')) return { useTheme: () => ({ palette }) };
    if (specifier === './Glass') return { GlassButton: button, GlassInput: ({ label, ...props }) => React.createElement('TextInput', { accessibilityLabel: label, ...props }) };
    if (specifier === './MobileUI') {
      const panel = ({ title, message, children }) => React.createElement('View', null, title && React.createElement('Text', null, title), message && React.createElement('Text', null, message), children);
      return { Card: panel, ScreenHeader: panel, SectionHeader: panel, InlineNotice: panel, ConfirmationPanel: panel, StatusBadge: ({ status, syncState }) => React.createElement('Text', null, status || syncState) };
    }
    if (specifier === './JobPhotos') return Photos;
    if (specifier === './FieldWorkTools') return props => { workProps = props; return React.createElement('WorkTools'); };
    if (specifier === './ServiceChecklist') return () => React.createElement('ServiceChecklist');
    if (specifier.endsWith('/services/jobCompletion')) return { completeJob: async (job, draft, options) => { calls.push({ job, draft, options }); return loader(job, draft, options); } };
    if (specifier.endsWith('/services/offline')) return { getQueuedOperation: async id => { reads.push(id); return savedRead(id); }, resolveOffline: async (id, action) => { discarded.push({ id, action }); saved.delete(id); } };
    throw new Error(`Unexpected dependency ${specifier}`);
  };
  const transformed = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  new Function('require', 'module', 'exports', transformed)(requireMock, module, module.exports);
  return module.exports.default;
}
const Workflow = load();
const job = overrides => ({ id: 'assigned', companyId: 'acme', assignedTo: 'member', status: 'in-progress', customerName: 'Assigned Customer', serviceType: 'Inspection', date: '2026-11-13', time: '15:00', ...overrides });
const props = selected => ({ job: selected, onClose: () => { closes++; }, onChanged: async () => { changes++; }, onInteractionChange: state => interactions.push(state) });
async function render(selected = job(), overrides = {}) { await act(async () => { tree = create(React.createElement(Workflow, { ...props(selected), ...overrides })); }); }
const text = () => JSON.stringify(tree.toJSON());
const control = label => tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
async function press(label) { const node = control(label); assert.ok(node, `Expected ${label}`); assert.equal(!!node.props.disabled, false, `${label} should be enabled`); await act(async () => node.props.onPress()); }
async function input(label, value) { await act(async () => tree.root.findByProps({ accessibilityLabel: label }).props.onChangeText(value)); }
async function draft() { await press('Complete'); await input('Work completed', 'Inspected and treated the site'); await input('Actual hours worked', '1.5'); await input('Completion notes', 'Gate secured'); }
beforeEach(() => {
  const user = { id: 'technician', companyId: 'acme', membershipId: 'member', role: 'technician', emailVerified: true, workspace: { status: 'company' } };
  account = { user, permissions: workspacePermissions(user.workspace, user) };
  tree = null; photoProps = workProps = null; navigationCalls = []; photoMounts = photoUnmounts = changes = closes = 0; calls = []; interactions = []; discarded = []; reads = []; saved.clear(); savedRead = async id => saved.get(id);
  loader = async selected => ({ status: 'synced', operationId: 'operation', jobId: selected.id, message: 'Job completed and synchronized.' });
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });

test('job workflow uses exclusive inline pages and preserves one photo owner through child navigation', async () => {
  await render(); assert.equal(photoMounts, 1); assert.equal(tree.root.findAllByType('Modal').length, 0);
  await draft(); await press('Review completion');
  assert.match(text(), /Review completion/); assert.equal(control('Complete'), undefined);
  await press('Back to completion'); await press('Cancel completion');
  assert.match(text(), /Job Details/); assert.ok(control('Resume completion')); assert.equal(photoMounts, 1); assert.equal(photoUnmounts, 0);
  await press('Resume completion');
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work completed' }).props.value, 'Inspected and treated the site');
});

test('native picker and unsaved photo state block transitions until cancellation or save completes', async () => {
  await render();
  await act(async () => photoProps.onBusyChange(true));
  assert.equal(control('Complete').props.disabled, true); assert.equal(control('Close job details').props.disabled, true);
  assert.deepEqual(interactions.at(-1), { busy: true, hasDraft: false });
  await act(async () => { photoProps.onBusyChange(false); photoProps.onDraftChange(true); });
  await press('Complete'); assert.match(text(), /Save or discard the selected photo/); assert.match(text(), /Job Details/);
  await press('Close job details'); assert.equal(closes, 0);
  await act(async () => photoProps.onDraftChange(false));
  await press('Close job details'); assert.equal(closes, 1);
});

test('completion validates fields, shows saving, suppresses duplicate taps and returns to updated details', async () => {
  await render(); await press('Complete'); await press('Review completion');
  assert.match(text(), /Describe the work completed/); assert.equal(calls.length, 0);
  await input('Work completed', 'Inspection'); await input('Actual hours worked', '-1'); await press('Review completion');
  assert.match(text(), /between 0 and 744/); await input('Actual hours worked', '1'); await press('Review completion');
  let resolve;
  loader = () => new Promise(done => { resolve = done; });
  const confirm = control('Confirm completion').props.onPress;
  let first, second;
  await act(async () => { first = confirm(); second = confirm(); });
  assert.equal(calls.length, 1); assert.match(text(), /Saving completion/); assert.equal(control('Close job details').props.disabled, true);
  await act(async () => { resolve({ status: 'synced', operationId: 'once', jobId: 'assigned' }); await Promise.all([first, second]); });
  assert.equal(changes, 1); assert.match(text(), /Job Details/); assert.match(text(), /Status:.*completed/); assert.match(text(), /Job completed and synchronized/);
  assert.equal(control('Complete'), undefined); assert.equal(interactions.at(-1).hasDraft, false);
});

test('completion failure keeps context and draft and retries the same durable operation after review', async () => {
  await render(); await draft(); await press('Review completion');
  loader = async () => { throw Object.assign(new Error('Assignment changed. Ask your manager.'), { code: 'permission-denied', operationId: 'saved-failure' }); };
  await press('Confirm completion');
  assert.match(text(), /Assignment changed/); assert.match(text(), /Assigned Customer/);
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work completed' }).props.value, 'Inspected and treated the site');
  saved.set('saved-failure', { state: 'conflict', server: { status: 'in-progress', actualWorkDone: 'Existing work', notes: 'Manager note' } });
  await press('Review completion'); assert.match(text(), /Review the latest online work/); assert.match(text(), /Manager note/);
  loader = async () => ({ status: 'synced', operationId: 'reviewed' });
  await press('Confirm completion'); assert.equal(calls[1].options.retryOperationId, 'saved-failure'); assert.equal(changes, 1);
});

test('queued completion is explicit and later synchronization failure restores its draft for retry', async () => {
  await render(); await draft(); await press('Review completion');
  loader = async () => ({ status: 'queued', operationId: 'offline-completion', message: 'Completion saved on this device and awaiting authorized synchronization.' });
  await press('Confirm completion'); assert.match(text(), /awaiting authorized synchronization/); assert.match(text(), /awaiting synchronization/);
  await act(async () => tree.update(React.createElement(Workflow, props(job({ status: 'in-progress', syncState: 'failed', syncOperationId: 'offline-completion', syncError: 'Your assignment was removed.' })))));
  assert.match(text(), /Your assignment was removed/);
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work completed' }).props.value, 'Inspected and treated the site');
  await press('Review completion'); loader = async () => ({ status: 'synced', operationId: 'offline-completion' });
  await press('Confirm completion'); assert.equal(calls.at(-1).options.retryOperationId, 'offline-completion');
});

test('unauthorized, unverified and cross-company jobs cannot submit completion or show management actions', async () => {
  for (const selected of [job({ assignedTo: 'another-member' }), job({ companyId: 'another-company' })]) {
    if (tree) await act(async () => tree.unmount());
    await render(selected, { onEdit() {}, onFollowUp() {} });
    assert.equal(control('Complete'), undefined); assert.equal(control('Edit job'), undefined);
  }
  account.user.emailVerified = false;
  await act(async () => tree.update(React.createElement(Workflow, props(job()))));
  assert.equal(control('Complete'), undefined); assert.equal(calls.length, 0); assert.match(text(), /Verify your email/);
});

test('closing and reopening the same job or selecting another job produces clean details without a modal backdrop', async () => {
  let close;
  function Host() {
    const [selected, select] = React.useState(job());
    close = () => select(null);
    return selected ? React.createElement(Workflow, { ...props(selected), onClose: close }) : React.createElement('Pressable', { accessibilityLabel: 'Open job', onPress: () => select(job()) });
  }
  await act(async () => { tree = create(React.createElement(Host)); });
  for (let count = 0; count < 3; count++) { await press('Close job details'); assert.equal(tree.root.findAllByType(Workflow).length, 0); await press('Open job'); assert.match(text(), /Job Details/); }
  assert.equal(tree.root.findAllByType('Modal').length, 0);
  await act(async () => tree.update(React.createElement(Workflow, props(job({ id: 'another', customerName: 'Another Customer' })))));
  assert.match(text(), /Another Customer/); assert.doesNotMatch(text(), /Assigned Customer/);
});

test('discarding a failed saved completion is explicit and a late completion callback cannot navigate an unmounted job', async () => {
  await render(); await draft(); await press('Review completion');
  loader = async () => { throw Object.assign(new Error('Sync failed'), { operationId: 'saved-draft' }); };
  await press('Confirm completion'); await press('Cancel completion'); await press('Close job details');
  assert.equal(closes, 0); await press('Keep editing'); assert.equal(discarded.length, 0);
  await press('Close job details'); await press('Discard draft and close');
  assert.deepEqual(discarded, [{ id: 'saved-draft', action: 'discard' }]); assert.equal(closes, 1);
  await act(async () => tree.unmount()); tree = null;
  await render(); await draft(); await press('Review completion');
  let resolve, pending;
  loader = () => new Promise(done => { resolve = done; });
  await act(async () => { pending = control('Confirm completion').props.onPress(); });
  await act(async () => tree.unmount()); tree = null;
  await act(async () => { resolve({ status: 'synced', operationId: 'late' }); await pending; });
  assert.equal(changes, 0);
});

test('a confirmed server refresh supersedes local completion when management reopens or cancels the job', async () => {
  await render(job({ updatedAt: '2026-11-13T20:00:00.000Z' })); await draft(); await press('Review completion'); await press('Confirm completion');
  assert.match(text(), /Status:.*completed/);
  await act(async () => tree.update(React.createElement(Workflow, props(job({ status: 'completed', updatedAt: '2026-11-13T20:01:00.000Z' })))));
  await act(async () => tree.update(React.createElement(Workflow, props(job({ status: 'scheduled', updatedAt: '2026-11-13T20:02:00.000Z' })))));
  assert.match(text(), /Status:.*scheduled/); assert.ok(control('Complete'));
  await act(async () => tree.update(React.createElement(Workflow, props(job({ status: 'cancelled', updatedAt: '2026-11-13T20:03:00.000Z' })))));
  assert.match(text(), /Status:.*cancelled/); assert.equal(control('Complete'), undefined);
});

test('saved-work review ignores duplicate taps and asynchronous results after unmount', async () => {
  await render(); await draft(); await press('Review completion');
  loader = async () => { throw Object.assign(new Error('Job changed online'), { operationId: 'conflict' }); };
  await press('Confirm completion');
  let resolve, first, second;
  savedRead = () => new Promise(done => { resolve = done; });
  const review = control('Review completion').props.onPress;
  await act(async () => { first = review(); second = review(); });
  assert.deepEqual(reads, ['conflict']); assert.match(text(), /Loading saved work/);
  await act(async () => tree.unmount()); tree = null;
  await act(async () => { resolve({ state: 'conflict', server: { status: 'in-progress' } }); await Promise.all([first, second]); });
  assert.equal(changes, 0); assert.deepEqual(interactions.at(-1), { busy: false, hasDraft: false });
});

test('work details retain durations and completion facts while quote prices require the pricing capability', async () => {
  const selected = job({ estimatedDuration: 2.5, estimatedCost: 123.45, actualHours: 1.5, completedAt: '2026-11-13T20:01:00.000Z' });
  await render(selected); assert.match(text(), /Estimated duration:.*2.5/); assert.match(text(), /Actual hours:.*1.5/); assert.match(text(), /Completed:/); assert.doesNotMatch(text(), /123.45/);
  account.user = { ...account.user, role: 'manager' }; account.permissions = workspacePermissions(account.user.workspace, account.user);
  await act(async () => tree.update(React.createElement(Workflow, props(selected))));
  assert.match(text(), /Estimated cost:.*123.45/);
});

test('work-note, application and visit drafts protect back navigation and completion without remounting photo owner', async () => {
  await render();
  await act(async () => workProps.onDraftChange(true));
  assert.deepEqual(interactions.at(-1), { busy: false, hasDraft: true });
  await press('Complete'); assert.match(text(), /Save or cancel your work notes, product application, visit record or service checklist draft/); assert.equal(calls.length, 0);
  await press('Close job details'); assert.equal(closes, 0); await press('Keep editing');
  await act(async () => workProps.onBusyChange(true));
  assert.equal(control('Close job details').props.disabled, true);
  await act(async () => { workProps.onBusyChange(false); workProps.onDraftChange(false); });
  await press('Complete'); await press('Cancel completion');
  assert.equal(photoMounts, 1); assert.equal(photoUnmounts, 0);
});

test('structured job details expose accessible navigation and safe customer contact actions', async () => {
  await render(job({ address: '1 Service Street', city: 'Bakersfield', state: 'CA', customerPhone: '(555) 010-2000' }));
  assert.match(text(), /Service location/); assert.match(text(), /Visit photos/);
  await press('Navigate to job'); await press('Call customer');
  assert.match(navigationCalls[0], /google.com\/maps\/dir/); assert.equal(navigationCalls[1], 'tel:5550102000');
});
