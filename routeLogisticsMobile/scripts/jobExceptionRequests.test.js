const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const React = require(path.join(root, 'node_modules/react'));
const { act, create } = require(path.join(root, 'node_modules/react-test-renderer'));
const babel = require(path.join(root, 'node_modules/@babel/core'));
global.IS_REACT_ACT_ENVIRONMENT = true;

function harness() {
  const env = { calls: [], changes: 0, drafts: [], busy: [], sequence: 0 };
  const panel = ({ title, message, children }) => React.createElement('View', null, title, message, children);
  const button = ({ title, onPress, disabled, busy }) => React.createElement('Pressable', { accessibilityLabel: title, onPress, disabled: !!disabled || !!busy }, title);
  const modules = new Map();
  env.send = async () => ({ request: { id: 'pending-request', status: 'pending', revision: 1, reason: 'vehicle', notes: 'Synthetic vehicle issue' } });
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} }; modules.set(file, module);
    const importer = name => {
      if (name === 'react') return React;
      if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable' };
      if (name === 'expo-crypto') return { randomUUID: () => `test-operation-${++env.sequence}` };
      if (name.endsWith('/workspaceApi')) return { callWorkspace: async (name, data) => { env.calls.push({ name, data }); return env.send(name, data); } };
      if (name.endsWith('/theme/ThemeProvider')) return { useTheme: () => ({ palette: { text: '#111', secondary: '#555', accent: '#087', glow: '#dfd', input: '#fff', border: '#ccc' } }) };
      if (name === './Glass') return { GlassInput: ({ label, ...props }) => React.createElement('TextInput', { accessibilityLabel: label, ...props }) };
      if (name === './MobileUI') return { Card: panel, SectionHeader: panel, InlineNotice: panel, PrimaryButton: button, SecondaryButton: button };
      if (name.startsWith('.')) { const resolved = path.resolve(path.dirname(file), name); return load(path.extname(resolved) ? resolved : `${resolved}.js`); }
      return require(name);
    };
    const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, configFile: false, babelrc: false, presets: [[require.resolve(path.join(root, 'node_modules/@babel/preset-react')), { runtime: 'classic' }]], plugins: [require.resolve(path.join(root, 'node_modules/@babel/plugin-transform-modules-commonjs'))] }).code;
    new Function('require', 'module', 'exports', code)(importer, module, module.exports);
    return module.exports;
  }
  env.Component = load(path.join(root, 'components/JobReassignmentRequest.js')).default;
  env.operations = load(path.join(root, 'services/jobExceptionOperations.js'));
  env.props = { job: { id: 'job', companyId: 'tenant', assignedTo: 'member', assignedToUid: 'tech', updatedAt: 'original-revision', status: 'scheduled' }, user: { id: 'tech', companyId: 'tenant', membershipId: 'member', role: 'technician', emailVerified: true }, permissions: { canAccess: true, can: capability => capability === 'jobs.work' }, onChanged: async () => env.changes++, onBusyChange: value => env.busy.push(value), onDraftChange: value => env.drafts.push(value) };
  env.render = async () => act(async () => { env.tree = create(React.createElement(env.Component, env.props)); });
  env.update = async patch => act(async () => { env.props = { ...env.props, ...patch }; env.tree.update(React.createElement(env.Component, env.props)); });
  env.button = label => env.tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
  env.press = async label => { const control = env.button(label); assert.ok(control, `Missing ${label}`); assert.equal(control.props.disabled, false); await act(async () => control.props.onPress()); };
  env.text = () => JSON.stringify(env.tree.toJSON());
  env.draft = async () => { await env.press('Request Reassignment'); await env.press('Vehicle problem'); await act(async () => env.tree.root.findByType('TextInput').props.onChangeText('Synthetic vehicle issue')); await env.press('Review reassignment request'); };
  env.close = async () => act(async () => env.tree.unmount());
  return env;
}

test('assigned technician explicitly confirms a request, preserves appointment and refreshes affected work', async () => {
  const env = harness(); const original = JSON.stringify(env.props.job); await env.render(); await env.draft();
  assert.equal(env.calls.length, 0); assert.equal(env.drafts.at(-1), true);
  await env.press('Send reassignment request');
  assert.equal(env.calls.length, 1); assert.equal(env.calls[0].name, 'rlJobException');
  assert.deepEqual(env.calls[0].data, { action: 'request', jobId: 'job', expectedVersion: 'original-revision', operationId: 'test-operation-1', reason: 'vehicle', notes: 'Synthetic vehicle issue' });
  assert.equal(JSON.stringify(env.props.job), original); assert.equal(env.changes, 1); assert.equal(env.drafts.at(-1), false);
  assert.match(env.text(), /waiting for management/); assert.equal(env.button('Request Reassignment'), undefined); await env.close();
});

test('failed request retains its reason, notes and original operation/revision for a safe retry', async () => {
  const env = harness(); env.send = async () => { throw new Error('Network unavailable; reconnect and retry'); }; await env.render(); await env.draft(); await env.press('Send reassignment request');
  assert.match(env.text(), /Network unavailable/); assert.match(env.text(), /Synthetic vehicle issue/); assert.equal(env.drafts.at(-1), true);
  await env.update({ job: { ...env.props.job, updatedAt: 'newer-server-revision' } });
  env.send = async () => ({ request: { id: 'pending-request', status: 'pending', revision: 1 } });
  await env.press('Retry reassignment request'); assert.deepEqual(env.calls[0], env.calls[1]); await env.close();
});

test('double tapping request confirmation invokes the callable once', async () => {
  const env = harness(); let finish; env.send = () => new Promise(resolve => { finish = resolve; }); await env.render(); await env.draft();
  const control = env.button('Send reassignment request'); let first;
  await act(async () => { first = control.props.onPress(); await control.props.onPress(); });
  assert.equal(env.calls.length, 1); assert.equal(env.busy.at(-1), true);
  await act(async () => { finish({ request: { id: 'request', status: 'pending' } }); await first; }); await env.close();
});

test('request visibility rejects foreign tenants, another assignee, revoked access and closed work', async () => {
  const env = harness();
  for (const patch of [{ companyId: 'foreign' }, { assignedTo: 'other', assignedToUid: 'other-user' }, { status: 'completed' }]) assert.equal(env.operations.canRequestReassignment({ ...env.props.job, ...patch }, env.props.user, env.props.permissions), false);
  assert.equal(env.operations.canRequestReassignment(env.props.job, env.props.user, { canAccess: false, can: () => true }), false);
  assert.equal(env.operations.canRequestReassignment(env.props.job, { ...env.props.user, emailVerified: false }, env.props.permissions), false);
  await env.render(); await env.update({ job: { ...env.props.job, assignedTo: 'other', assignedToUid: 'other-user' } }); assert.equal(env.button('Request Reassignment'), undefined); assert.equal(env.calls.length, 0); await env.close();
});

test('late response after an account switch cannot show the previous tenant request or refresh its work', async () => {
  const env = harness(); let finish; env.send = () => new Promise(resolve => { finish = resolve; }); await env.render(); await env.draft(); let saved;
  await act(async () => { saved = env.button('Send reassignment request').props.onPress(); });
  await env.update({ user: { ...env.props.user, id: 'other-user', companyId: 'other-tenant' } });
  await act(async () => { finish({ request: { id: 'private-old-request', status: 'pending' } }); await saved; });
  assert.equal(env.changes, 0); assert.doesNotMatch(env.text(), /private-old-request/); await env.close();
});

test('cancelling an unsubmitted draft never calls the backend or changes assignment', async () => {
  const env = harness(); await env.render(); await env.draft(); await env.press('Cancel request draft');
  assert.equal(env.calls.length, 0); assert.equal(env.drafts.at(-1), false); assert.equal(env.props.job.assignedTo, 'member'); await env.close();
});

test('a completed or read-only job retains a reachable cancellation path for its open request draft', async () => {
  for (const patch of [{ job: { status: 'completed' } }, { readOnly: true }]) {
    const env = harness(); await env.render(); await env.draft();
    await env.update(patch.job ? { job: { ...env.props.job, ...patch.job } } : patch);
    assert.match(env.text(), /no longer allows/); assert.equal(env.button('Send reassignment request').props.disabled, true);
    await env.press('Cancel request draft'); assert.equal(env.drafts.at(-1), false); assert.equal(env.calls.length, 0); await env.close();
  }
});

test('a pending request arriving during polling does not hide the local draft cancellation control', async () => {
  const env = harness(); await env.render(); await env.draft();
  await env.update({ job: { ...env.props.job, reassignmentRequest: { id: 'other-operation-request', status: 'pending', reason: 'other', notes: 'Already submitted' } } });
  assert.match(env.text(), /unsubmitted local draft/); assert.match(env.text(), /Synthetic vehicle issue/);
  await env.press('Cancel request draft'); assert.equal(env.drafts.at(-1), false); assert.match(env.text(), /Already submitted/); assert.equal(env.calls.length, 0); await env.close();
});

test('closing an ambiguous request editor retains the immutable operation and makes no cancellation claim', async () => {
  const env = harness(); env.send = async () => { throw new Error('Response unavailable'); }; await env.render(); await env.draft(); await env.press('Send reassignment request');
  await env.press('Close request editor'); assert.equal(env.drafts.at(-1), false); assert.match(env.text(), /does not cancel a submitted request/);
  await env.press('Review unconfirmed request'); await env.press('Retry reassignment request'); assert.deepEqual(env.calls[0], env.calls[1]);
  await env.close();
});
