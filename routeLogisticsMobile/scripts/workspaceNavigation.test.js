// Actual workspace screens/design components, with native/query side effects isolated.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const React = require('react');
const { create, act } = require('react-test-renderer');
const babel = require('@babel/core');
const { workspacePermissions } = require('../services/workspacePolicy');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..'), modules = new Map(), backListeners = new Set();
let tree, currentAuth, day, week, month, detail, route, hookCalls, refreshes, navigationCalls, alertCalls, workflowProps, workflowMounts, workflowUnmounts, managementProps;
const palette = { background: '#07120F', surface: '#14241F', text: '#EFFAF5', secondary: '#B0C8BE', border: '#405D4E', input: '#14241F', accent: '#62E3B3', button: '#087B55', danger: '#FFAAA3', glow: '#164D38' };
const primitive = Object.fromEntries(['View','Text','Pressable','ActivityIndicator','RefreshControl'].map(name => [name, name]));
const native = { ...primitive,
  ScrollView: ({ children, refreshControl, ...props }) => React.createElement('ScrollView', props, refreshControl, children),
  Linking: { openURL: async url => navigationCalls.push(url) },
  Alert: { alert: (...args) => alertCalls.push(args) },
  BackHandler: { addEventListener: (_event, listener) => { backListeners.add(listener); return { remove: () => backListeners.delete(listener) }; } },
};
const buttonElement = ({ title, accessibilityLabel, onPress, disabled, busy, ...props }) => React.createElement('Pressable', {
  ...props, accessibilityLabel: accessibilityLabel || title, accessibilityRole: 'button', disabled: disabled || busy, onPress,
}, React.createElement('Text', null, title));
function Workflow(props) {
  workflowProps = props;
  const [draft, setDraft] = React.useState('');
  React.useEffect(() => { workflowMounts++; return () => { workflowUnmounts++; }; }, []);
  return React.createElement('View', { testID: 'test-workflow' },
    React.createElement('Text', null, `Work order ${props.job.customerName || props.job.id}`),
    React.createElement('Text', null, `Status ${props.job.status}`),
    React.createElement('Text', null, draft),
    buttonElement({ title: 'Close job details', onPress: props.onClose }),
    buttonElement({ title: 'Create photo draft', onPress: () => { setDraft('Retained selected photo'); props.onInteractionChange({ busy: false, hasDraft: true }); } }),
    buttonElement({ title: 'Begin photo picker', onPress: () => props.onInteractionChange({ busy: true, hasDraft: false }) }),
    buttonElement({ title: 'Finish photo picker', onPress: () => props.onInteractionChange({ busy: false, hasDraft: false }) }),
    buttonElement({ title: 'Discard draft and close', onPress: () => { props.onInteractionChange({ busy: false, hasDraft: false }); props.onClose(); } }),
    buttonElement({ title: 'Refresh after saved work', onPress: props.onChanged }));
}
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} }; modules.set(filename, module);
  const localRequire = createRequire(filename);
  const mockRequire = name => {
    if (name === 'react-native') return native;
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (name.endsWith('/AuthContext')) return { useAuth: () => currentAuth };
    if (name.endsWith('/ThemeProvider')) return { useTheme: () => ({ palette, isDark: true }) };
    if (name === './Glass' || name.endsWith('/components/Glass')) return {
      GlassScreen: ({ children }) => React.createElement('View', null, children),
      GlassCard: ({ children, ...props }) => React.createElement('View', props, children),
      GlassButton: buttonElement,
      GlassInput: props => React.createElement('TextInput', props),
      IconButton: ({ label, onPress }) => buttonElement({ title: label, onPress }),
    };
    if (name.endsWith('/services/useWorkQueries')) return {
      useWorkJobs: (period, options) => { hookCalls.push({ type: 'jobs', period, ...options }); return period === 'week' ? week : period === 'month' ? month : day; },
      useWorkJob: (id, options) => { hookCalls.push({ type: 'detail', id, ...options }); return { ...detail, job: id ? detail.job : null }; },
      useMyDailyRoute: options => { hookCalls.push({ type: 'route', ...options }); return route; },
    };
    if (name.endsWith('/components/JobWorkflow')) return Workflow;
    if (name.endsWith('/components/OfflineStatus')) return ({ onSynced }) => React.createElement('View', null, React.createElement('Text', null, 'Compact sync summary'), buttonElement({ title: 'Simulate synchronized work', onPress: onSynced }));
    if (name.endsWith('/components/WorkLocation')) return () => React.createElement('Text', null, 'Explicit foreground location controls');
    if (name.endsWith('/components/NativePushBridge')) return () => null;
    if (name === './SettingsScreen') return () => React.createElement('Text', null, 'Settings and company services catalogue');
    if (name === './EstimatesScreen') return () => React.createElement('Text', null, 'Authorized estimate management');
    if (name === './HomeScreen') return props => { managementProps = props; return React.createElement('View', { testID: 'management-home' }, React.createElement('Text', null, 'Legacy management workspace'), buttonElement({ title: 'Management schedule', onPress: () => props.navigation.navigate('schedule') })); };
    if (name.startsWith('.')) { const next = path.resolve(path.dirname(filename), name); return load(next.endsWith('.js') ? next : next + '.js'); }
    return localRequire(name);
  };
  const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] });
  new Function('require', 'module', 'exports', result.code)(mockRequire, module, module.exports);
  return module.exports;
}
const Workspace = load('screens/WorkspaceScreen.js').default;
const job = (id, overrides = {}) => ({ id, companyId: 'acme', assignedTo: 'member', customerName: `${id} customer`, serviceType: 'Inspection', date: '2026-11-13', time: '10:00', status: 'scheduled', address: '1 Field Street', ...overrides });
const currentJob = job('active', { status: 'in-progress', time: '14:00' });
function query(type, jobs = []) {
  const refresh = async () => { refreshes.push(type); };
  return { jobs, isSuccess: true, isLoading: false, isFetching: false, error: null, canAccess: true, canReadWork: true,
    accessStatus: 'ready', resourceDenied: false, dataChecked: true, refetch: refresh, refreshWork: refresh };
}
function setRole(role) {
  const user = { id: 'luis', name: 'Luis Gonzales', emailVerified: true, companyId: 'acme', role, membershipId: 'member', workspace: { status: 'company' }, companyName: 'Acme Pest Control', services: ['Business services catalogue'] };
  currentAuth = { user, permissions: workspacePermissions(user.workspace, user), accessStatus: 'ready', refreshUser: async () => { refreshes.push('access'); } };
}
function isVisible(node) {
  for (let parent = node; parent; parent = parent.parent) {
    if (parent.props.accessibilityElementsHidden === true) return false;
    const styles = Array.isArray(parent.props.style) ? parent.props.style.flat(Infinity) : [parent.props.style];
    if (styles.some(style => style?.display === 'none')) return false;
  }
  return true;
}
const visibleText = () => tree.root.findAll(node => node.type === 'Text' && isVisible(node)).map(node => (node.children || []).filter(child => typeof child === 'string').join('')).join('\n');
const visibleNodes = (predicate) => tree.root.findAll(node => predicate(node) && isVisible(node));
const button = label => visibleNodes(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
async function settle() { for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); }); }
async function render() { await act(async () => { tree = create(React.createElement(Workspace)); }); await settle(); }
async function rerender() { await act(async () => tree.update(React.createElement(Workspace))); await settle(); }
async function press(label) { const node = button(label); assert.ok(node, `Visible action '${label}' exists`); assert.notEqual(node.props.disabled, true, `${label} must be enabled`); await act(async () => node.props.onPress()); await settle(); }
async function openCard(id) { const card = visibleNodes(node => node.type === 'Pressable' && node.props.testID === `job-card-${id}`)[0]; assert.ok(card); await act(async () => card.props.onPress()); await settle(); }
beforeEach(() => {
  tree = null; refreshes = []; hookCalls = []; navigationCalls = []; alertCalls = []; workflowProps = managementProps = null; workflowMounts = workflowUnmounts = 0;
  setRole('technician');
  day = query('day', [job('later', { time: '16:00', estimatedCost: 999 }), currentJob, job('early', { time: '08:00' }), job('completed', { status: 'completed', time: '07:00' })]);
  week = query('week', [job('friday', { date: '2026-11-13', time: '11:00' }), job('monday', { date: '2026-11-09', time: '10:00' }), job('early-friday', { date: '2026-11-13', time: '08:00' })]);
  month = query('month', [job('month-last', { date: '2026-11-30' }), job('month-first', { date: '2026-11-01' })]);
  detail = { ...query('detail'), job: currentJob };
  route = { ...query('route'), stops: [job('second-stop', { customerName: 'Saved first stop', location: { lat: 35, lng: -119 } }), job('first-stop', { customerName: 'Saved second stop' })], data: { saved: { jobIds: ['second-stop','first-stop'] } } };
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); assert.equal(backListeners.size, 0); });

test('technician Home prioritizes the active job and exposes four accessible navigation tabs', async () => {
  await render();
  const cards = visibleNodes(node => node.type === 'Pressable' && String(node.props.testID || '').startsWith('job-card-'));
  assert.equal(cards[0].props.testID, 'job-card-active');
  assert.match(visibleText(), /Active work order|Acme Pest Control|Compact sync summary|Explicit foreground location controls/);
  assert.doesNotMatch(visibleText(), /Legacy management|Company services|Business services catalogue|Revenue|Customers|Estimates|Refresh workspace|Refresh jobs|999/);
  for (const tab of ['Home','Schedule','Route','Settings']) assert.ok(button(`${tab} tab`));
  await press('Open work order'); assert.equal(workflowProps.job.id, 'active');
  assert.equal(workflowMounts, 1); assert.equal(alertCalls.length, 0);
});

test('Schedule sorts day/week/month cards and retains its view and filters across work-order navigation', async () => {
  await render(); await press('Schedule tab'); await press('Week schedule');
  const scroll = tree.root.findAll(node => node.type === 'ScrollView' && node.props.testID === 'schedule-scroll')[0];
  const cards = visibleNodes(node => node.type === 'Pressable' && String(node.props.testID || '').startsWith('job-card-'));
  assert.deepEqual(cards.map(node => node.props.testID), ['job-card-monday','job-card-early-friday','job-card-friday']);
  detail.job = week.jobs[1]; await openCard('monday');
  assert.equal(workflowProps.job.id, 'monday'); await press('Close job details');
  assert.equal(tree.root.findAll(node => node.type === 'ScrollView' && node.props.testID === 'schedule-scroll')[0], scroll);
  assert.equal(button('Week schedule').props.accessibilityState.selected, true);
  await press('Month schedule');
  assert.deepEqual(visibleNodes(node => node.type === 'Pressable' && String(node.props.testID || '').startsWith('job-card-')).map(node => node.props.testID), ['job-card-month-first','job-card-month-last']);
  await press('Day schedule'); assert.equal(button('Day schedule').props.accessibilityState.selected, true);
});

test('completion/list disappearance and transient detail errors do not close or remount the selected job', async () => {
  await render(); await openCard('active'); await press('Create photo draft');
  day.jobs = []; detail.job = { ...currentJob, status: 'completed' };
  await rerender(); assert.equal(workflowProps.job.status, 'completed'); assert.equal(workflowMounts, 1);
  assert.match(visibleText(), /Retained selected photo/);
  detail.error = Object.assign(new Error('Connection interrupted.'), { code: 'functions/unavailable' });
  await rerender(); await rerender();
  assert.match(visibleText(), /Connection interrupted|Your current draft is retained/);
  assert.equal(visibleNodes(node => node.props.testID === 'test-workflow').length, 1); assert.equal(workflowMounts, 1); assert.equal(alertCalls.length, 0);
  await press('Refresh after saved work'); assert.deepEqual(refreshes.sort(), ['day','day','detail']);
});

test('a work-order permission error is shown as item access loss and does not claim company revocation', async () => {
  await render(); await openCard('active');
  detail = { ...detail, job: null, resourceDenied: true, error: Object.assign(new Error('This job was reassigned.'), { code: 'functions/permission-denied' }), accessStatus: 'ready' };
  await rerender(); await rerender();
  assert.match(visibleText(), /This job was reassigned/); assert.doesNotMatch(visibleText(), /Your company access has changed|access revoked|Job access changed/);
  assert.equal(visibleNodes(node => node.props.testID === 'test-workflow').length, 0); assert.equal(alertCalls.length, 0);
  await press('Return to schedule'); assert.equal(button('Schedule tab').props.accessibilityState.selected, true);
});

test('authoritative checking hides private work without a repeated revocation alert', async () => {
  await render(); await openCard('active');
  detail = { ...detail, job: null, canReadWork: false, accessStatus: 'checking', isLoading: false };
  await rerender(); await rerender();
  assert.match(visibleText(), /Checking this work order/); assert.doesNotMatch(visibleText(), /Your company access has changed|Job access changed/);
  assert.equal(visibleNodes(node => node.props.testID === 'test-workflow').length, 0); assert.equal(alertCalls.length, 0);
  detail = { ...detail, job: currentJob, canReadWork: true, accessStatus: 'ready' }; await rerender();
  assert.equal(visibleNodes(node => node.props.testID === 'test-workflow').length, 1); assert.equal(workflowMounts, 1);
});

test('tab navigation preserves a draft and blocks changing screens during a photo operation', async () => {
  await render(); await openCard('active'); await press('Create photo draft'); await press('Route tab');
  assert.match(visibleText(), /Your draft is still here/); assert.equal(workflowMounts, 1); assert.match(visibleText(), /Retained selected photo/);
  assert.equal(button('Home tab').props.accessibilityState.selected, true);
  await press('Discard draft and close'); assert.equal(button('Route tab').props.accessibilityState.selected, true);
  detail.job = currentJob; await press('Home tab'); await openCard('active'); await press('Begin photo picker');
  assert.equal(button('Settings tab').props.disabled, true);
  await act(async () => button('Settings tab').props.onPress()); await settle();
  assert.match(visibleText(), /Finish or cancel the current photo/); assert.equal(button('Home tab').props.accessibilityState.selected, true);
  await press('Finish photo picker'); await press('Close job details');
});

test('Route uses saved stop order, provides maps handoff and opens the correct work order', async () => {
  await render(); await press('Route tab');
  const shown = visibleText(); assert.ok(shown.indexOf('1. Saved first stop') < shown.indexOf('2. Saved second stop'));
  assert.match(shown, /An in-app route map is not available/);
  await press('Navigate to stop 1'); assert.equal(new URL(navigationCalls[0]).searchParams.get('destination'), '35,-119');
  detail.job = route.stops[0]; await press('Open work order for stop 1'); assert.equal(workflowProps.job.id, 'second-stop');
  assert.equal(hookCalls.filter(call => call.type === 'detail').at(-1).enabled, true);
  assert.equal(hookCalls.filter(call => call.type === 'route').at(-1).enabled, false);
  await press('Close job details'); assert.equal(button('Route tab').props.accessibilityState.selected, true);
});

test('manager navigation retains the existing management Home path', async () => {
  setRole('manager'); await render();
  assert.match(visibleText(), /Legacy management workspace/); assert.doesNotMatch(visibleText(), /Hello, Luis|Active work order/);
  assert.equal(visibleNodes(node => node.props.testID === 'management-home').length, 1);
  await press('Management schedule'); assert.equal(button('Schedule tab').props.accessibilityState.selected, true);
  await press('Settings tab'); assert.match(visibleText(), /Settings and company services catalogue/);
});

test('manager Schedule edit and Route follow-up hand the selected job to the existing Home forms', async () => {
  setRole('manager'); await render(); await press('Schedule tab'); await openCard('active');
  assert.equal(typeof workflowProps.onEdit, 'function');
  await act(async () => workflowProps.onEdit(workflowProps.job)); await settle();
  assert.equal(button('Home tab').props.accessibilityState.selected, true);
  assert.equal(managementProps.managementAction.kind, 'edit'); assert.equal(managementProps.managementAction.job.id, 'active');
  const firstRequest = managementProps.managementAction.id;
  await act(async () => managementProps.onManagementActionHandled(firstRequest)); await settle();
  assert.equal(managementProps.managementAction, null);
  await press('Route tab'); detail.job = { ...route.stops[0], status: 'completed' };
  await press('Open work order for stop 1');
  await act(async () => workflowProps.onFollowUp(workflowProps.job)); await settle();
  assert.equal(button('Home tab').props.accessibilityState.selected, true);
  assert.equal(managementProps.managementAction.kind, 'follow-up'); assert.equal(managementProps.managementAction.job.id, 'second-stop');
  assert.notEqual(managementProps.managementAction.id, firstRequest);
});

test('technicians never receive management callbacks and manager handoff cannot discard a draft', async () => {
  await render(); await openCard('active');
  assert.equal(workflowProps.onEdit, undefined); assert.equal(workflowProps.onFollowUp, undefined);
  await press('Close job details'); setRole('manager'); await rerender(); await press('Schedule tab'); await openCard('active');
  await press('Create photo draft');
  await act(async () => workflowProps.onEdit(workflowProps.job)); await settle();
  assert.equal(managementProps.managementAction, null); assert.match(visibleText(), /Retained selected photo/);
});
