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
let shiftProps, shiftMounts, shiftUnmounts, pushProps;
const modeStorage = new Map();
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
function ShiftControl(props) {
  shiftProps = props;
  const [opened, setOpened] = React.useState(false);
  React.useEffect(() => { shiftMounts++; return () => { shiftUnmounts++; }; }, []);
  const report = (busy, hasDraft) => props.onInteractionChange?.({ busy, hasDraft });
  const button = React.createElement('View', { testID: 'header-shift-control' },
    React.createElement('Text', null, 'Explicit foreground location controls'),
    buttonElement({ title: 'Open shift controls', disabled: props.disabled, onPress: () => { if (props.active === false || props.disabled) return; setOpened(true); report(true, false); } }));
  const dialog = opened && props.active !== false && React.createElement('View', { testID: 'test-shift-dialog', accessibilityViewIsModal: true },
      buttonElement({ title: 'Begin shift operation', onPress: () => report(true, false) }),
      buttonElement({ title: 'Finish shift operation', onPress: () => report(true, false) }),
      buttonElement({ title: 'Close shift controls', onPress: () => { setOpened(false); report(false, false); } }));
  return typeof props.children === 'function' ? props.children({ button, dialog }) : React.createElement(React.Fragment, null, button, dialog);
}
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} }; modules.set(filename, module);
  const localRequire = createRequire(filename);
  const mockRequire = name => {
    if (name === 'react-native') return native;
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (name === '@react-native-async-storage/async-storage') return { getItem: async key => modeStorage.get(key) || null, setItem: async (key, value) => modeStorage.set(key, value) };
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
    if (name.endsWith('/components/WorkLocation')) return ShiftControl;
    if (name.endsWith('/components/NativePushBridge')) return props => { pushProps = props; return null; };
    if (name === './SettingsScreen') return () => React.createElement('Text', null, 'Settings and company services catalogue');
    if (name === './EstimatesScreen') return () => React.createElement('Text', null, 'Authorized estimate management');
    if (name === './HomeScreen') return props => { managementProps = props; return React.createElement('View', { testID: 'management-home' }, React.createElement('Text', null, 'Legacy management workspace'), buttonElement({ title: 'Management schedule', onPress: () => props.navigation.navigate('schedule') })); };
    if (name === './ManagementScreen') return props => { managementProps = props; return React.createElement('View', { testID: 'management-dashboard' }, React.createElement('Text', null, `Management dashboard ${props.view}`), buttonElement({ title: 'Open management job', onPress: () => props.onOpenJob(job('team-job')) })); };
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
  shiftProps = pushProps = null; shiftMounts = shiftUnmounts = 0;
  modeStorage.clear();
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

test('assigned estimate visits stay in normal Field Home and Schedule with their property and outcome context', async () => {
  const estimate=job('estimate-field',{appointmentKind:'estimate_visit',billable:false,estimateOutcome:'estimate_pending',inquiryId:'inquiry-field',servicePropertyId:'property-rental',serviceProperty:{address:'22 Selected Rental Road',unit:'B'},propertyAccessInstructions:'Gate 2468',dispatchNotes:'Inspect the exterior only'});
  day=query('day',[estimate]);detail={...query('detail'),job:estimate};await render();assert.match(visibleText(),/Estimate Visit/);assert.match(visibleText(),/22 Selected Rental Road/);assert.doesNotMatch(visibleText(),/Create Invoice|Approve estimate|Customers tab/);
  await press('Schedule tab');assert.match(visibleText(),/Estimate Visit/);await openCard('estimate-field');assert.equal(workflowProps.job.id,'estimate-field');assert.equal(workflowProps.job.billable,false);assert.equal(workflowProps.job.servicePropertyId,'property-rental');assert.equal(workflowProps.job.propertyAccessInstructions,'Gate 2468');assert.equal(workflowProps.job.dispatchNotes,'Inspect the exterior only');assert.equal(workflowProps.job.inquiryId,'inquiry-field');
  await press('Close job details');assert.match(visibleText(),/Schedule/);assert.match(visibleText(),/Estimate Visit/);assert.equal(alertCalls.length,0);
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
  await press('Refresh after saved work'); assert.deepEqual(refreshes, ['day']);
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

test('manager defaults to personal Field Mode and can switch to scoped Management tabs without changing identity', async () => {
  setRole('manager'); await render();
  const originalIdentity = JSON.stringify(currentAuth.user);
  assert.match(visibleText(), /Hello, Luis|Active work order/); assert.doesNotMatch(visibleText(), /Legacy management workspace|Management dashboard/);
  assert.equal(button('Field mode').props.accessibilityState.selected, true);
  assert.equal(hookCalls.filter(call => call.type === 'jobs' && call.enabled).every(call => call.personal === true), true);
  await press('Management mode'); assert.match(visibleText(), /Management dashboard overview/);
  for (const label of ['Overview', 'Team', 'Map', 'Schedule']) assert.ok(button(`${label} tab`));
  assert.equal(button('Route tab'), undefined);
  assert.equal(managementProps.active, true);
  assert.equal(hookCalls.filter(call => call.type === 'jobs').slice(-3).every(call => !call.enabled), true);
  await press('Team tab'); assert.equal(managementProps.view, 'team');
  await press('Field mode'); assert.equal(button('Home tab').props.accessibilityState.selected, true);
  await press('Settings tab'); assert.match(visibleText(), /Settings and company services catalogue/);
  assert.equal(JSON.stringify(currentAuth.user), originalIdentity);
  assert.equal(modeStorage.size, 1);
});

test('manager work-order editing and follow-up use the web workflow while retaining the current work order', async () => {
  setRole('manager'); await render(); await press('Schedule tab'); await openCard('active');
  assert.equal(typeof workflowProps.onEdit, 'function');
  await act(async () => workflowProps.onEdit(workflowProps.job)); await settle();
  assert.equal(workflowProps.job.id, 'active'); assert.equal(workflowMounts, 1);
  assert.match(visibleText(), /full job editing.*continue on the web|work order remains open here/);
  assert.equal(navigationCalls[0], 'https://route-logistics.com/jobs');
  await press('Close job details');
  await press('Route tab'); detail.job = { ...route.stops[0], status: 'completed' };
  await press('Open work order for stop 1');
  await act(async () => workflowProps.onFollowUp(workflowProps.job)); await settle();
  assert.equal(workflowProps.job.id, 'second-stop');
  assert.deepEqual(navigationCalls, ['https://route-logistics.com/jobs', 'https://route-logistics.com/jobs']);
});

test('technicians never receive management callbacks and manager handoff cannot discard a draft', async () => {
  await render(); await openCard('active');
  assert.equal(workflowProps.onEdit, undefined); assert.equal(workflowProps.onFollowUp, undefined);
  await press('Close job details'); setRole('manager'); await rerender(); await press('Schedule tab'); await openCard('active');
  await press('Create photo draft');
  await act(async () => workflowProps.onEdit(workflowProps.job)); await settle();
  assert.equal(navigationCalls.length, 0); assert.match(visibleText(), /Retained selected photo/);
});

test('owner and manager retain a work draft and prevent mode switching during photo capture', async () => {
  for (const role of ['owner', 'manager']) {
    if (tree) { await act(async () => tree.unmount()); tree = null; }
    setRole(role); await render(); await openCard('active'); await press('Create photo draft');
    const previousMounts = workflowMounts;
    await press('Management mode');
    assert.match(visibleText(), /draft is still here.*switching modes/);
    assert.match(visibleText(), /Retained selected photo/);
    assert.equal(workflowMounts, previousMounts); assert.equal(button('Field mode').props.accessibilityState.selected, true);
    await press('Discard draft and close'); await openCard('active'); await press('Begin photo picker');
    assert.equal(button('Management mode').props.disabled, true);
    await act(async () => button('Management mode').props.onPress()); await settle();
    assert.match(visibleText(), /Finish or cancel.*before switching modes/);
    await press('Finish photo picker'); await press('Close job details'); await press('Management mode');
    assert.match(visibleText(), /Management dashboard/);
    await press('Field mode'); assert.match(visibleText(), /Hello, Luis/);
  }
});

test('management job details return to their original team view and refreshes invalidate the shared work scope', async () => {
  setRole('owner'); await render(); await press('Management mode'); await press('Team tab');
  detail.job = job('team-job'); await press('Open management job');
  assert.equal(workflowProps.job.id, 'team-job'); assert.equal(managementProps.active, false);
  await press('Refresh after saved work'); assert.deepEqual(refreshes, ['day']);
  await press('Close job details'); assert.equal(managementProps.view, 'team'); assert.equal(managementProps.active, true);
  assert.equal(button('Team tab').props.accessibilityState.selected, true);
});

test('remembered mode restores only for the same authorized identity and disappears on role revocation', async () => {
  setRole('manager'); await render(); await press('Management mode');
  await act(async () => tree.unmount()); tree = null; await render();
  assert.equal(button('Management mode').props.accessibilityState.selected, true);
  currentAuth = { ...currentAuth, user: { ...currentAuth.user, companyId: 'other' } };
  await rerender(); assert.equal(button('Field mode').props.accessibilityState.selected, true);
  assert.doesNotMatch(visibleText(), /Management dashboard/);
  setRole('technician'); await rerender();
  assert.equal(button('Management mode'), undefined); assert.equal(button('Field mode'), undefined);
  assert.equal(visibleNodes(node => node.props.testID === 'management-dashboard').length, 0);
});

test('technicians never mount management data and one shift/sync surface survives mode changes', async () => {
  await render(); assert.equal(managementProps, null); assert.equal(button('Management mode'), undefined);
  setRole('manager'); await rerender();
  const shift = tree.root.findAll(node => node.type === 'Text' && node.children.includes('Explicit foreground location controls'))[0];
  const sync = tree.root.findAll(node => node.type === 'Text' && node.children.includes('Compact sync summary'))[0];
  await press('Management mode'); await press('Field mode');
  assert.equal(tree.root.findAll(node => node.type === 'Text' && node.children.includes('Explicit foreground location controls')).length, 1);
  assert.equal(tree.root.findAll(node => node.type === 'Text' && node.children.includes('Explicit foreground location controls'))[0], shift);
  assert.equal(tree.root.findAll(node => node.type === 'Text' && node.children.includes('Compact sync summary'))[0], sync);
});

test('Home places a single duty control in its header and suspends its dialog on other work views', async () => {
  setRole('owner'); await render();
  const control = tree.root.findAll(node => node.type === 'View' && node.props.testID === 'header-shift-control')[0];
  assert.ok(control);
  const ancestors = []; for (let parent = control.parent; parent; parent = parent.parent) ancestors.push(parent);
  assert.ok(ancestors.some(parent => parent.type?.name === 'ScreenHeader'), 'Duty control belongs to the Home header');
  assert.ok(!ancestors.some(parent => parent.type === 'ScrollView'), 'Duty control is outside the scrolling job list');
  assert.equal(shiftProps.active, true); assert.equal(shiftMounts, 1);
  await press('Schedule tab'); assert.equal(shiftProps.active, false);
  await press('Home tab'); assert.equal(shiftProps.active, true);
  await openCard('active'); assert.equal(shiftProps.active, false);
  await press('Close job details'); assert.equal(shiftProps.active, true);
  await press('Management mode'); assert.equal(shiftProps.active, false);
  await press('Field mode'); assert.equal(shiftProps.active, true);
  assert.equal(shiftMounts, 1); assert.equal(shiftUnmounts, 0);
  assert.equal(tree.root.findAll(node => node.type === 'View' && node.props.testID === 'header-shift-control')[0], control);
});

test('the duty dialog blocks mode, tab and notification handoffs without discarding field drafts', async () => {
  setRole('manager'); await render();
  const modeButton = button('Management mode'), routeButton = button('Route tab'), fieldButton = button('Field mode'), settingsButton = button('Settings tab');
  await press('Open shift controls');
  assert.equal(pushProps.blocked, true);
  assert.equal(button('Management mode'), undefined, 'Underlying navigation is hidden from accessibility while the dialog is open');
  await act(async () => modeButton.props.onPress()); await settle(); assert.equal(fieldButton.props.accessibilityState.selected, true);
  await act(async () => routeButton.props.onPress()); await settle(); assert.equal(routeButton.props.accessibilityState.selected, false);
  await act(async () => pushProps.onOpenJob(currentJob)); await settle();
  assert.equal(workflowMounts, 0);
  await press('Begin shift operation'); assert.equal(modeButton.props.disabled, true); assert.equal(settingsButton.props.disabled, true);
  await press('Finish shift operation'); await press('Close shift controls');
  assert.equal(pushProps.blocked, false);
  await openCard('active'); await press('Create photo draft');
  // A late/hidden shift reset must not clear the work-order interaction guard.
  await act(async () => shiftProps.onInteractionChange({ busy: false, hasDraft: false })); await settle();
  assert.equal(pushProps.blocked, true);
  await press('Management mode'); assert.equal(button('Field mode').props.accessibilityState.selected, true);
  assert.match(visibleText(), /Retained selected photo/);
});
