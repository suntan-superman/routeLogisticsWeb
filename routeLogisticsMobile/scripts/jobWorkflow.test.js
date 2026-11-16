const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { create, act } = require('react-test-renderer');
const babel = require('@babel/core');
const { workspacePermissions } = require('../services/workspacePolicy');
global.IS_REACT_ACT_ENVIRONMENT = true;
let account, tree, photoProps, workProps, checklistProps, photoMounts, photoUnmounts, calls, loader, savedRead, reads, changes, closes, interactions, discarded, navigationCalls;
let workDrafts, checklistDrafts, savedDraftCalls, discardedDraftCalls, saveWorkDrafts, saveChecklistDrafts, discardWorkDrafts;
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
      const panel = ({ title, message, children, ...props }) => React.createElement('View', props, title && React.createElement('Text', null, title), message && React.createElement('Text', null, message), children);
      return { Card: panel, ScreenHeader: panel, SectionHeader: panel, InlineNotice: panel, ConfirmationPanel: panel, ActionDialog: panel, StatusBadge: ({ status, syncState }) => React.createElement('Text', null, status || syncState) };
    }
    if (specifier === './JobPhotos') return Photos;
    if (specifier === './FieldWorkTools') return props => {
      workProps = props;
      if (props.draftActionsRef) props.draftActionsRef.current = { getDrafts: () => workDrafts, saveDrafts: () => saveWorkDrafts(), discardDrafts: () => discardWorkDrafts() };
      return React.createElement('WorkTools');
    };
    if (specifier === './ServiceChecklist') return props => {
      checklistProps = props;
      if (props.draftActionsRef) props.draftActionsRef.current = { getDrafts: () => checklistDrafts, saveDrafts: () => saveChecklistDrafts(), discardDrafts: () => { discardedDraftCalls.push('checklist'); checklistDrafts = { checklist: false, hasDraft: false }; props.onDraftChange(false); return { success: true }; } };
      return React.createElement('ServiceChecklist');
    };
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
const visible = node => { for (let parent = node; parent; parent = parent.parent) { if (parent.props.accessibilityElementsHidden) return false; const styles = Array.isArray(parent.props.style) ? parent.props.style.flat(Infinity) : [parent.props.style]; if (styles.some(style => style?.display === 'none')) return false; } return true; };
const control = label => tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label && visible(node))[0];
async function press(label) { const node = control(label); assert.ok(node, `Expected ${label}`); assert.equal(!!node.props.disabled, false, `${label} should be enabled`); await act(async () => node.props.onPress()); }
async function input(label, value) { const field = tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === label && visible(node))[0]; assert.ok(field, `Expected visible ${label}`); await act(async () => field.props.onChangeText(value)); }
async function draft() { await press('Complete'); await input('Work completed', 'Inspected and treated the site'); await input('Actual hours worked', '1.5'); await input('Completion notes', 'Gate secured'); }
beforeEach(() => {
  const user = { id: 'technician', companyId: 'acme', membershipId: 'member', role: 'technician', emailVerified: true, workspace: { status: 'company' } };
  account = { user, permissions: workspacePermissions(user.workspace, user) };
  tree = null; photoProps = workProps = null; navigationCalls = []; photoMounts = photoUnmounts = changes = closes = 0; calls = []; interactions = []; discarded = []; reads = []; saved.clear(); savedRead = async id => saved.get(id);
  loader = async selected => ({ status: 'synced', operationId: 'operation', jobId: selected.id, message: 'Job completed and synchronized.' });
  workDrafts = checklistDrafts = undefined; savedDraftCalls = []; discardedDraftCalls = []; checklistProps = null;
  saveWorkDrafts = async () => { savedDraftCalls.push('work'); workDrafts = { notes: false, application: false, visit: false, hasDraft: false }; workProps.onDraftChange(false); return { success: true }; };
  saveChecklistDrafts = async () => { savedDraftCalls.push('checklist'); checklistDrafts = { checklist: false, hasDraft: false }; checklistProps.onDraftChange(false); return { success: true }; };
  discardWorkDrafts = () => { discardedDraftCalls.push('work'); workDrafts = { notes: false, application: false, visit: false, hasDraft: false }; workProps.onDraftChange(false); return { success: true }; };
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
  await press('Complete'); assert.match(text(), /A selected photo has not been saved/); assert.match(text(), /Job Details/);
  await press('Keep editing');
  await press('Close job details'); assert.equal(closes, 0);
  await act(async () => photoProps.onDraftChange(false));
  await press('Close job details'); assert.equal(closes, 1);
});

test('completion validates fields, shows saving, suppresses duplicate taps and returns to updated details', async () => {
  await render(); await press('Complete'); await press('Review completion');
  assert.match(text(), /Describe the work completed/); assert.equal(calls.length, 0);
  await press('Keep editing');
  await input('Work completed', 'Inspection'); await input('Actual hours worked', '-1'); await press('Review completion');
  assert.match(text(), /between 0 and 744/); await press('Keep editing'); await input('Actual hours worked', '1'); await press('Review completion');
  let resolve;
  loader = () => new Promise(done => { resolve = done; });
  const confirm = control('Confirm completion').props.onPress;
  let first, second;
  await act(async () => { first = confirm(); second = confirm(); });
  assert.equal(calls.length, 1); assert.match(text(), /Saving completion/); assert.equal(control('Close job details').props.disabled, true);
  await act(async () => { resolve({ status: 'synced', operationId: 'once', jobId: 'assigned' }); await Promise.all([first, second]); });
  assert.equal(changes, 1); assert.match(text(), /Job Details/); assert.match(text(), /Status:.*completed/); assert.match(text(), /Job completed and synchronized/);
  assert.equal(control('Complete'), undefined); assert.ok(control('Return to work order'));
  await press('Return to work order'); assert.equal(interactions.at(-1).hasDraft, false);
});

test('completion failure keeps context and draft and retries the same durable operation after review', async () => {
  await render(); await draft(); await press('Review completion');
  loader = async () => { throw Object.assign(new Error('Assignment changed. Ask your manager.'), { code: 'permission-denied', operationId: 'saved-failure' }); };
  await press('Confirm completion');
  assert.match(text(), /Assignment changed/); assert.match(text(), /Assigned Customer/);
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work completed' }).props.value, 'Inspected and treated the site');
  saved.set('saved-failure', { state: 'conflict', server: { status: 'in-progress', actualWorkDone: 'Existing work', notes: 'Manager note' } });
  await press('Keep editing');
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
  await press('Keep editing');
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
  await press('Confirm completion'); await press('Keep editing'); await press('Cancel completion'); await press('Close job details');
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
  await press('Return to work order');
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
  await press('Keep editing');
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
  await press('Complete'); assert.match(text(), /Work notes, a product application or a visit record has unsaved changes/); assert.equal(calls.length, 0);
  await press('Keep editing');
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

test('technician and management roles see selectable multiline dispatch instructions separately from work and completion notes', async () => {
  const instructions = 'Gate code: synthetic 2468\nUse the side entrance.\nKeep the gate closed.';
  for (const role of ['technician', 'owner', 'manager']) {
    if (tree) { await act(async () => tree.unmount()); tree = null; }
    account.user = { ...account.user, role }; account.permissions = workspacePermissions(account.user.workspace, account.user);
    await render(job({ dispatchNotes: instructions, serviceInstructions: 'Customer prefers the rear path.', workNotes: 'Technician observed activity.', notes: 'Legacy work-note alias.', completionNotes: 'Previous completion summary.' }));
    const note = tree.root.findAll(node => node.type === 'Text' && node.props.testID === 'job-dispatch-notes');
    assert.equal(note.length, 1); assert.equal(note[0].props.selectable, true);
    assert.equal(note[0].children.join(''), instructions);
    assert.match(text(), /Job instructions/); assert.match(text(), /Customer prefers the rear path/); assert.match(text(), /Previous completion summary/);
    assert.equal(workProps.job.workNotes, 'Technician observed activity.');
    assert.equal(tree.root.findAll(node => node.type === 'TextInput' && node.props.value === instructions).length, 0);
    assert.doesNotMatch(text(), /Legacy work-note alias/);
  }
  assert.equal(calls.length, 0); assert.equal(reads.length, 0); assert.equal(changes, 0);
});

test('blank or malformed dispatch instructions do not render an empty card or fall back to the offline notes alias', async () => {
  for (const dispatchNotes of [undefined, '', ' \n\t ', 42, { text: 'Not an instruction string' }, ['Not an instruction string']]) {
    const selected = job({ dispatchNotes, notes: 'Legacy alias must not become dispatch instructions' });
    if (!tree) await render(selected);
    else await act(async () => tree.update(React.createElement(Workflow, props(selected))));
    assert.equal(tree.root.findAll(node => node.props.testID === 'job-dispatch-notes').length, 0);
    assert.doesNotMatch(text(), /Job instructions|Legacy alias must not become dispatch instructions/);
  }
  assert.equal(calls.length, 0);
});

test('same-job instruction refresh preserves photo, work-tool and completion drafts without submitting changes', async () => {
  let selected = job({ dispatchNotes: 'Original gate instructions', workNotes: 'Saved observations' });
  await render(selected);
  await act(async () => { photoProps.onDraftChange(true); workProps.onDraftChange(true); });
  selected = { ...selected, dispatchNotes: 'Updated gate instructions\nUse the side path.', updatedAt: '2026-11-13T20:01:00.000Z' };
  await act(async () => { await Promise.resolve(); tree.update(React.createElement(Workflow, props(selected))); });
  assert.equal(tree.root.findByProps({ testID: 'job-dispatch-notes' }).children.join(''), selected.dispatchNotes);
  assert.equal(photoMounts, 1); assert.equal(photoUnmounts, 0);
  assert.deepEqual(interactions.at(-1), { busy: false, hasDraft: true });
  await press('Close job details'); assert.equal(closes, 0); assert.match(text(), /Save or discard the selected photo/);
  await act(async () => photoProps.onDraftChange(false));
  await press('Close job details'); assert.equal(closes, 0); assert.match(text(), /Keep your work/);
  await press('Keep editing'); await act(async () => workProps.onDraftChange(false));
  await draft();
  selected = { ...selected, dispatchNotes: 'Newest gate instructions', updatedAt: '2026-11-13T20:02:00.000Z' };
  await act(async () => { await Promise.resolve(); tree.update(React.createElement(Workflow, props(selected))); });
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work completed' }).props.value, 'Inspected and treated the site');
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Completion notes' }).props.value, 'Gate secured');
  await press('Cancel completion');
  assert.equal(tree.root.findByProps({ testID: 'job-dispatch-notes' }).children.join(''), 'Newest gate instructions');
  assert.equal(photoMounts, 1); assert.equal(photoUnmounts, 0);
  assert.equal(calls.length, 0); assert.equal(reads.length, 0); assert.equal(changes, 0);
});

test('switching jobs replaces dispatch instructions and never carries another visit’s instructions or completion draft', async () => {
  await render(job({ dispatchNotes: 'First property gate instructions' }));
  await draft();
  await act(async () => tree.update(React.createElement(Workflow, props(job({ id: 'another', customerName: 'Another property', dispatchNotes: 'Second property access instructions' })))));
  assert.match(text(), /Second property access instructions/); assert.doesNotMatch(text(), /First property gate instructions|Gate secured/);
  assert.equal(tree.root.findByProps({ testID: 'job-dispatch-notes' }).children.join(''), 'Second property access instructions');
  assert.ok(control('Complete')); assert.equal(control('Resume completion'), undefined);
  assert.equal(calls.length, 0); assert.equal(photoMounts, 2); assert.equal(photoUnmounts, 1);
});

test('an untouched optional product form does not require a product application to begin completion', async () => {
  await render();
  workDrafts = { notes: false, application: false, visit: false, hasDraft: false };
  await press('Complete');
  assert.ok(tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Work completed' && visible(node)).length);
  assert.equal(tree.root.findAll(node => node.props.testID === 'completion-action-dialog').length, 0);
  assert.deepEqual(savedDraftCalls, []); assert.deepEqual(discardedDraftCalls, []); assert.equal(calls.length, 0);
});

test('completion explains an optional product draft in an overlay and requires explicit discard before continuing', async () => {
  await render(job({ dispatchNotes: 'Read-only gate access instructions' }));
  workDrafts = { notes: false, application: true, visit: false, hasDraft: true };
  await act(async () => workProps.onDraftChange(true));
  await press('Complete');
  const dialog = tree.root.findByProps({ testID: 'completion-action-dialog' });
  const ancestors = []; for (let parent = dialog.parent; parent; parent = parent.parent) ancestors.push(parent);
  assert.equal(ancestors.some(node => node.type === 'ScrollView'), false);
  assert.equal(tree.root.findAllByType('Modal').length, 0);
  assert.match(text(), /An optional product application is open and has not been saved/);
  assert.match(text(), /A new product application is optional/);
  assert.deepEqual(discardedDraftCalls, []); assert.equal(control('Complete'), undefined);
  assert.deepEqual(interactions.at(-1), { busy: false, hasDraft: true });
  await press('Keep editing'); assert.equal(workDrafts.application, true);
  await press('Complete'); await press('Discard unsaved drafts and continue');
  assert.deepEqual(discardedDraftCalls, ['work']); assert.deepEqual(savedDraftCalls, []);
  assert.equal(calls.length, 0); assert.equal(photoMounts, 1); assert.equal(photoUnmounts, 0);
  assert.ok(tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Work completed' && visible(node)).length);
  assert.equal(workProps.job.dispatchNotes, 'Read-only gate access instructions');
});

test('save-and-continue names and saves pending work and checklist drafts before requesting completion details', async () => {
  await render();
  workDrafts = { notes: true, application: true, visit: true, visitType: 'arrived', visitAttempted: false, hasDraft: true };
  checklistDrafts = { checklist: true, hasDraft: true };
  await act(async () => { workProps.onDraftChange(true); checklistProps.onDraftChange(true); });
  await press('Complete');
  assert.match(text(), /Work notes have unsaved changes/); assert.match(text(), /An arrival record has not been confirmed as saved/); assert.match(text(), /service checklist has unsaved answers/);
  await press('Save drafts and continue');
  assert.deepEqual(savedDraftCalls, ['work', 'checklist']); assert.deepEqual(discardedDraftCalls, []);
  assert.equal(calls.length, 0); assert.equal(photoMounts, 1);
  await input('Work completed', 'Completed the assigned visit'); await press('Review completion'); await press('Confirm completion');
  assert.equal(calls.length, 1); assert.ok(control('Return to work order'));
  await press('Return to work order'); assert.equal(interactions.at(-1).hasDraft, false);
});

test('an invalid optional draft shows its actual save error in the overlay and retains the draft for correction', async () => {
  await render(); workDrafts = { application: true, hasDraft: true };
  await act(async () => workProps.onDraftChange(true));
  saveWorkDrafts = async () => { savedDraftCalls.push('work'); return { success: false, message: 'Enter a product, target pest and positive quantity before saving.' }; };
  await press('Complete'); await press('Save drafts and continue');
  const dialog = tree.root.findByProps({ testID: 'completion-action-dialog' });
  assert.equal(dialog.props.tone, 'error'); assert.match(text(), /Enter a product, target pest and positive quantity/);
  assert.equal(workDrafts.application, true); assert.deepEqual(discardedDraftCalls, []); assert.equal(calls.length, 0);
  await press('Keep editing');
  saveWorkDrafts = async () => { savedDraftCalls.push('work'); workDrafts = { hasDraft: false }; workProps.onDraftChange(false); return { success: true }; };
  await press('Complete'); await press('Save drafts and continue');
  assert.equal(tree.root.findAll(node => node.props.testID === 'completion-action-dialog').length, 0);
  assert.deepEqual(savedDraftCalls, ['work', 'work']); assert.equal(calls.length, 0);
});

test('an unconfirmed attempted visit cannot be discarded and retains its retry identity', async () => {
  await render(); workDrafts = { visit: true, visitType: 'arrived', visitAttempted: true, operationId: 'same-visit-attempt', hasDraft: true };
  await act(async () => workProps.onDraftChange(true));
  saveWorkDrafts = async () => { savedDraftCalls.push('work'); return { success: false, unconfirmed: true, message: 'The visit could not be confirmed. Retry the same arrival record.' }; };
  await press('Complete');
  const discard = control('Discard unsaved drafts and continue');
  assert.equal(discard.props.disabled, true);
  await act(async () => discard.props.onPress());
  assert.deepEqual(discardedDraftCalls, []); assert.equal(workDrafts.operationId, 'same-visit-attempt');
  assert.match(text(), /cannot be discarded here/);
  await press('Save drafts and continue');
  assert.match(text(), /Retry the same arrival record/);
  assert.equal(workDrafts.operationId, 'same-visit-attempt'); assert.equal(calls.length, 0);
});

test('draft saving suppresses duplicate taps and ignores continuation after its work order unmounts', async () => {
  await render(); workDrafts = { notes: true, hasDraft: true };
  await act(async () => workProps.onDraftChange(true)); await press('Complete');
  let resolve, first, second;
  saveWorkDrafts = () => { savedDraftCalls.push('work'); return new Promise(done => { resolve = done; }); };
  const save = control('Save drafts and continue').props.onPress;
  await act(async () => { first = save(); second = save(); });
  assert.deepEqual(savedDraftCalls, ['work']); assert.equal(control('Keep editing').props.disabled, true);
  await act(async () => tree.unmount()); tree = null;
  await act(async () => { resolve({ success: true }); await Promise.all([first, second]); });
  assert.equal(calls.length, 0); assert.equal(changes, 0); assert.equal(closes, 0);
  assert.deepEqual(interactions.at(-1), { busy: false, hasDraft: false });
});

test('required completion validation stays visible outside the scroll view and preserves invalid input', async () => {
  await render(); await press('Complete');
  await input('Work completed', 'x'.repeat(10001)); await press('Review completion');
  const dialog = tree.root.findByProps({ testID: 'completion-action-dialog' });
  assert.match(dialog.props.message, /at most 10,000 characters/);
  assert.equal(control('Review completion'), undefined);
  assert.equal(interactions.at(-1).hasDraft, true);
  await press('Keep editing');
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work completed' }).props.value.length, 10001);
  assert.equal(calls.length, 0);
});
