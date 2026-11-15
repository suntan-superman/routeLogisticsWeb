const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const React = require('react');
const { create, act } = require('react-test-renderer');
const babel = require('@babel/core');
const { workspacePermissions } = require('../services/workspacePolicy');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..'), cache = new Map(), AuthContext = React.createContext(null);
let currentAuth, changes = [], sent = [], verified = [], stored = new Map();
let jobRequests = [], jobLoader = async () => ({ success: true, jobs: [] }), detailLoader, authRefreshes = 0;
let nativePushMounts = 0;
const mounted = new Set();
const appListeners = new Set(), networkListeners = new Set();
const pass = ({ children }) => children;
const native = Object.fromEntries(['View','Text','TextInput','Pressable','TouchableOpacity','ScrollView','KeyboardAvoidingView','ActivityIndicator','Image','Switch','Button','StatusBar','RefreshControl'].map(name => [name, name]));
native.ScrollView = ({ refreshControl, children, ...props }) => React.createElement('ScrollView', props, refreshControl, children);
native.AppState = { currentState: 'active', addEventListener: (_event, listener) => { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
Object.assign(native, { StyleSheet: { create: x => x, absoluteFill: {}, absoluteFillObject: {} }, Platform: { OS: 'ios', select: x => x.ios }, Alert: { alert() {} }, Linking: { openURL: async () => {} }, Modal: ({ visible, children }) => visible ? React.createElement('Modal', null, children) : null });
const palette = { background: '#07120F', surface: '#14241F', glass: '#14241F', text: '#EFFAF5', secondary: '#B0C8BE', border: '#405D4E', input: '#14241F', accent: '#62E3B3', button: '#087B55', danger: '#FFAAA3', highlight: '#FFFFFF', glow: '#164D38' };
function NativePushSettingsMock() {
  React.useEffect(() => { nativePushMounts++; }, []);
  return React.createElement('View', { accessibilityLabel: 'Native work notification preferences' });
}
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const localRequire = createRequire(filename);
  const mockRequire = specifier => {
    if (specifier === 'react-native') return native;
    if (specifier === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView', SafeAreaProvider: pass };
    if (specifier === 'expo-status-bar') return { StatusBar: 'StatusBar' };
    if (specifier === 'expo-blur') return { BlurView: 'BlurView' };
    if (specifier === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
    if (specifier === '@expo/vector-icons') return { Ionicons: 'Icon', MaterialIcons: 'Icon', AntDesign: 'Icon', MaterialCommunityIcons: 'Icon' };
    if (specifier === '@react-native-community/datetimepicker') return () => null;
    if (specifier === '@react-native-community/netinfo') return { addEventListener: listener => { networkListeners.add(listener); listener({ isConnected: true, isInternetReachable: true }); return () => networkListeners.delete(listener); } };
    if (specifier === '@react-native-async-storage/async-storage') return { getItem: async key => stored.get(key) || null, setItem: async (key, value) => stored.set(key, value), removeItem: async key => stored.delete(key) };
    if (specifier === './AuthContext' || specifier.endsWith('/contexts/AuthContext')) return { AuthContext, AuthProvider: pass, useAuth: () => currentAuth };
    if (specifier.endsWith('/contexts/LanguageContext')) return { LanguageProvider: pass, useLanguage: () => ({ t: key => key, language: 'en', changeLanguage() {} }) };
    if (specifier.endsWith('/theme/ThemeProvider')) return { ThemeProvider: pass, useTheme: () => ({ palette, colors: load('constants/colors.js').COLORS, isDark: true, ready: true, mode: 'dark', changeMode: async value => changes.push(value), reduceTransparency: false }) };
    if (specifier.endsWith('/constants/responsiveSizes')) return { FONT_SIZES: new Proxy({}, { get: () => 16 }), SPACING: new Proxy({}, { get: () => 12 }), BORDER_RADIUS: new Proxy({}, { get: () => 12 }), ICON_SIZES: new Proxy({}, { get: () => 20 }), hp: () => 20, wp: () => 20, rf: () => 16 };
    if (specifier.endsWith('/components/NativePushSettings')) return NativePushSettingsMock;
    if (/\/components\/(JobPhotos|WorkLocation|OfflineStatus|FieldWorkTools|MyRoute|NativePushBridge)$/.test(specifier)) return () => null;
    if (specifier === './EstimatesScreen') return () => null;
    if (specifier.endsWith('/components/JobWorkflow')) return ({ job, onClose }) => React.createElement('View', null,
      React.createElement('Text', null, job.customerName), React.createElement('Pressable', { accessibilityLabel: 'Close job details', onPress: onClose }, 'Close'));
    if (specifier.endsWith('/services/tenancy')) return { canManage: () => currentAuth.permissions.canManage, localDate: () => '2026-11-13' };
    if (specifier === './offline' || specifier.endsWith('/services/offline')) return { cachedRead: (_key, loader) => loader(), readCache: async () => null, overlayJobs: async jobs => jobs };
    if (specifier === './workspaceApi' || specifier.endsWith('/services/workspaceApi')) return { callWorkspace: async () => ({ stops: [], saved: null }), readWorkspace: async (resource, options) => { assert.equal(resource, 'jobs'); return detailLoader(options); } };
    if (specifier === './firebase' || specifier.endsWith('/services/firebase')) return { CustomerService: { getCustomers: async () => ({ success: true, customers: [] }) }, JobService: { getJobsByDateRange: async (startDate, endDate) => { const range = { startDate, endDate }; jobRequests.push(range); return jobLoader(range); } }, EstimateService: {} };
    if (specifier.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filename), specifier);
      return load(resolved.endsWith('.js') ? resolved : resolved + '.js');
    }
    return localRequire(specifier);
  };
  const transformed = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  new Function('require','module','exports',transformed)(mockRequire, module, module.exports);
  return module.exports;
}
function account(role = 'technician', status = 'company') {
  jobRequests = []; jobLoader = async () => ({ success: true, jobs: [] }); native.AppState.currentState = 'active'; authRefreshes = 0;
  nativePushMounts = 0; native.Linking.openURL = async () => {}; native.Alert.alert = () => {};
  detailLoader = async ({ id }) => ({ job: { id, companyId: 'acme', assignedTo: 'membership', customerName: 'Assigned customer', status: 'scheduled' }, customer: null });
  const user = { id: 'luis', name: 'Luis Gonzales', email: 'luis@example.com', emailVerified: true, companyId: status === 'company' ? 'acme' : null, role: status === 'company' ? role : null, membershipId: status === 'company' ? 'membership' : null,
    workspace: { status, invitations: [{ id: 'invite', companyName: 'Acme Pest Control', role: 'technician' }] }, companyName: 'Acme Pest Control', businessName: 'Acme Pest Control', businessPhone: '555-0100', businessAddress: '1 Main St', services: ['Termite Inspection', 'Rodent Control'] };
  currentAuth = { user, isAuthenticated: true, isLoading: false, accessStatus: status === 'company' ? 'ready' : status, permissions: workspacePermissions(user.workspace, user), refreshUser: async () => { authRefreshes++; return { success: true, user: currentAuth.user, authoritative: true, accessStatus: currentAuth.accessStatus }; }, signOut: async () => {}, updateUserProfile: async () => ({ success: true }), getAccountDeletionSummary: async () => ({ pendingOperations: 0, pendingPhotos: 0 }), deleteAccount: async () => ({ success: true }), requestStaffCode: async email => { sent.push(email); return { challengeId: 'c'.repeat(48), message: 'Check your inbox.' }; }, signInWithCode: async (...args) => { verified.push(args); return { success: true }; } };
}
async function render(file, props = {}) {
  let tree;
  await act(async () => {
    let content = React.createElement(load(file).default, { navigation: { navigate() {}, goBack() {} }, ...props });
    if (file !== 'App.js') content = React.createElement(load('contexts/WorkQueryProvider.js').default, null, content);
    tree = create(React.createElement(AuthContext.Provider, { value: currentAuth }, content));
    mounted.add(tree);
  });
  await settle();
  return tree;
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
async function unmount(tree) { if (!mounted.delete(tree)) return; await act(async () => tree.unmount()); }
afterEach(async () => {
  // Cleanup must run after failed assertions too; providers own native listeners
  // and timers and must never keep a failed screen suite alive.
  for (const tree of [...mounted]) await unmount(tree);
  assert.equal(appListeners.size, 0); assert.equal(networkListeners.size, 0);
});
const textOf = tree => JSON.stringify(tree.toJSON());
async function press(tree, label) {
  const button = tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
  assert.ok(button, `Button '${label}' must exist`);
  await act(async () => button.props.onPress());
  await settle();
}
test('pending staff see an explicit acceptance screen rather than the personal dashboard', async () => {
  account('technician', 'pending');
  const tree = await render('App.js');
  assert.match(textOf(tree), /Join your company/); assert.match(textOf(tree), /Acceptance pending/);
  assert.doesNotMatch(textOf(tree), /Manage work|Your schedule/);
  await unmount(tree);
});

test('only authoritative revocation says access was removed; pending and unavailable states keep their distinct guidance', async () => {
  for (const status of ['pending', 'unavailable', 'revoked']) {
    account('technician', status === 'pending' ? 'pending' : 'unavailable');
    currentAuth.accessStatus = status;
    const tree = await render('screens/WorkspaceAccessScreen.js');
    if (status === 'revoked') {
      assert.match(textOf(tree), /Company access removed/); assert.match(textOf(tree), /checked online/);
      assert.match(textOf(tree), /saved work and photos remain on this device/);
    } else {
      assert.doesNotMatch(textOf(tree), /Company access removed|checked online and no longer grants access/);
      assert.match(textOf(tree), status === 'pending' ? /Join your company/ : /Company access needed/);
    }
    await unmount(tree);
  }
});
test('pending and revoked verified accounts can review deletion and legal links without accepting company access', async () => {
  for (const status of ['pending', 'revoked']) {
    account('technician', status === 'pending' ? 'pending' : 'unavailable');
    currentAuth.accessStatus = status;
    let accepts = 0, reviews = 0, deletes = 0;
    currentAuth.acceptInvitation = async () => { accepts++; return { success: true }; };
    currentAuth.getAccountDeletionSummary = async () => { reviews++; return { pendingOperations: 1, pendingPhotos: 0 }; };
    currentAuth.deleteAccount = async () => { deletes++; return { success: true }; };
    const links = [];
    native.Linking.openURL = async url => links.push(url);
    const tree = await render('App.js');
    assert.match(textOf(tree), /Legal & account/);
    await press(tree, 'Privacy policy'); await press(tree, 'Terms of service');
    assert.deepEqual(links, ['https://route-logistics.com/privacy', 'https://route-logistics.com/terms']);
    await press(tree, 'Delete my account');
    assert.match(textOf(tree), /Review account deletion|1 unsynced edit/);
    assert.equal(reviews, 1); assert.equal(accepts, 0); assert.equal(deletes, 0);
    assert.doesNotMatch(textOf(tree), /Manage work|Open company settings on the web|Your schedule|Manage services|Save profile & preferences/);
    await press(tree, 'Cancel account deletion');
    assert.match(textOf(tree), status === 'pending' ? /Join your company/ : /Company access removed/);
    native.Linking.openURL = async () => { throw new Error('Unavailable'); };
    await press(tree, 'Terms of service');
    assert.match(textOf(tree), /Could not open the terms of service.*https:\/\/route-logistics.com\/terms/);
    await unmount(tree);
  }
});
test('technician Home and Settings display company data without management controls', async () => {
  account();
  const home = await render('screens/HomeScreen.js');
  assert.match(textOf(home), /Acme Pest Control/); assert.doesNotMatch(textOf(home), /Termite Inspection|Rodent Control/);
  assert.doesNotMatch(textOf(home), /Manage work|Schedule service|"Customers"|"Estimates"/);
  await unmount(home);
  const settings = await render('screens/SettingsScreen.js');
  assert.match(textOf(settings), /555-0100/); assert.doesNotMatch(textOf(settings), /Termite Inspection|Rodent Control/);
  await press(settings, 'Services');
  assert.match(textOf(settings), /Termite Inspection/); assert.match(textOf(settings), /Rodent Control/);
  assert.doesNotMatch(textOf(settings), /Manage services|Open company settings on the web/);
  assert.equal(settings.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Business name').length, 0);
  assert.equal(settings.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityRole === 'radio').length, 3);
  await unmount(settings);
});
test('manager Home keeps work management but company ownership controls remain owner-only', async () => {
  account('manager');
  const home = await render('screens/HomeScreen.js');
  assert.match(textOf(home), /Manage work/); assert.match(textOf(home), /Schedule service/);
  await unmount(home);
  const manager = await render('screens/SettingsScreen.js');
  assert.doesNotMatch(textOf(manager), /Open company settings on the web/);
  await unmount(manager);
  account('owner');
  const owner = await render('screens/SettingsScreen.js');
  assert.match(textOf(owner), /Open company settings on the web/);
  await unmount(owner);
});
test('mobile code sign-in calls the existing challenge flow and never saves codes or passwords', async () => {
  account(); sent = []; verified = []; stored = new Map();
  const tree = await render('screens/LoginScreen.js');
  const tab = tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityRole === 'tab')[1];
  await act(async () => tab.props.onPress());
  const email = tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Email address')[0];
  await act(async () => email.props.onChangeText('luis@example.com'));
  await press(tree, 'Email a sign-in code');
  assert.deepEqual(sent, ['luis@example.com']);
  const code = tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Six-digit sign-in code')[0];
  await act(async () => code.props.onChangeText('123456'));
  await press(tree, 'Sign in');
  assert.deepEqual(verified, [['c'.repeat(48), '123456']]); assert.equal(stored.size, 0);
  await unmount(tree);
});

test('Settings formats personal phone input and saves the displayed number without editing company data', async () => {
  account(); currentAuth.user.phoneNumber = '6616025407'; let saved;
  currentAuth.updateUserProfile = async data => { saved = data; return { success: true }; };
  const tree = await render('screens/SettingsScreen.js');
  const phone = () => tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Your phone number')[0];
  assert.equal(phone().props.value, '(661) 602-5407');
  await act(async () => phone().props.onChangeText('16615550123'));
  assert.equal(phone().props.value, '(661) 555-0123');
  assert.equal(phone().props.keyboardType, 'phone-pad');
  await press(tree, 'Save profile & preferences');
  assert.equal(saved.phoneNumber, '(661) 555-0123'); assert.equal(saved.businessName, undefined);
});

test('Settings starts with services and notifications collapsed and hides the inactive language selector', async () => {
  account();
  const tree = await render('screens/SettingsScreen.js');
  const section = label => tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
  assert.equal(section('Services').props.accessibilityState.expanded, false);
  assert.equal(section('Notification preferences').props.accessibilityState.expanded, false);
  assert.match(textOf(tree), /Services.*2/);
  assert.doesNotMatch(textOf(tree), /English|Español|Language|Termite Inspection|Email notifications|SMS notifications/);
  assert.match(textOf(tree), /Business name|Business address|1 Main St/);
  assert.equal(nativePushMounts, 0);
  await press(tree, 'Services');
  assert.equal(section('Services').props.accessibilityState.expanded, true);
  assert.match(textOf(tree), /Termite Inspection|Rodent Control/);
  await press(tree, 'Services');
  assert.doesNotMatch(textOf(tree), /Termite Inspection|Rodent Control/);
  assert.match(textOf(tree), /1 Main St/);
});

test('notification collapse preserves unsaved changes and keeps an activated native panel mounted', async () => {
  account(); currentAuth.user.emailNotifications = false; currentAuth.user.smsNotifications = true;
  let saved;
  currentAuth.updateUserProfile = async value => { saved = value; return { success: true }; };
  const tree = await render('screens/SettingsScreen.js');
  await press(tree, 'Notification preferences');
  assert.equal(nativePushMounts, 1);
  const notification = label => tree.root.findAll(node => node.type === 'Switch' && node.props.accessibilityLabel === label)[0];
  assert.equal(notification('Email notifications').props.value, false);
  assert.equal(notification('SMS notifications').props.value, true);
  await act(async () => notification('Email notifications').props.onValueChange(true));
  const name = tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Display name')[0];
  await act(async () => name.props.onChangeText('Updated name'));
  await press(tree, 'Notification preferences');
  const hiddenPanel = tree.root.findAll(node => node.type === 'View' && node.props.importantForAccessibility === 'no-hide-descendants')[0];
  assert.equal(hiddenPanel.props.style.display, 'none');
  await press(tree, 'Notification preferences');
  assert.equal(notification('Email notifications').props.value, true);
  assert.equal(nativePushMounts, 1);
  await press(tree, 'Save profile & preferences');
  assert.deepEqual({ name: saved.name, email: saved.emailNotifications, sms: saved.smsNotifications }, { name: 'Updated name', email: true, sms: true });
});

test('Settings opens Route Logistics legal links and reports browser failures', async () => {
  account(); const links = [];
  native.Linking.openURL = async url => links.push(url);
  const tree = await render('screens/SettingsScreen.js');
  await press(tree, 'Privacy policy'); await press(tree, 'Terms of service');
  assert.deepEqual(links, ['https://route-logistics.com/privacy', 'https://route-logistics.com/terms']);
  native.Linking.openURL = async () => { throw new Error('Unavailable'); };
  await press(tree, 'Privacy policy');
  assert.match(textOf(tree), /Could not open the privacy policy.*https:\/\/route-logistics.com\/privacy/);
});

test('account deletion requires review, typed confirmation, and explicit unsynced-work consent', async () => {
  account(); const requests = []; let resolveDeletion;
  currentAuth.getAccountDeletionSummary = async () => ({ pendingOperations: 2, pendingPhotos: 1 });
  currentAuth.deleteAccount = async value => { requests.push(value); return new Promise(resolve => { resolveDeletion = resolve; }); };
  const tree = await render('screens/SettingsScreen.js');
  await press(tree, 'Delete my account');
  assert.equal(requests.length, 0); assert.match(textOf(tree), /2 unsynced edits and 1 unsynced photo/);
  assert.match(textOf(tree), /Company-owned customers, jobs, invoices, photos, and service history remain/);
  assert.equal(tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Type DELETE to confirm').length, 0);
  await press(tree, 'Continue to confirmation');
  const final = () => tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Permanently delete my account')[0];
  assert.equal(final().props.disabled, true);
  const confirmation = tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Type DELETE to confirm')[0];
  await act(async () => confirmation.props.onChangeText('DELETE'));
  assert.equal(final().props.disabled, true);
  const discard = tree.root.findAll(node => node.type === 'Switch' && node.props.accessibilityLabel === 'Discard unsynced work on this device')[0];
  await act(async () => discard.props.onValueChange(true));
  assert.equal(final().props.disabled, false);
  await act(async () => { final().props.onPress(); final().props.onPress(); });
  assert.equal(requests.length, 1); assert.deepEqual(requests[0], { confirmation: 'DELETE', discardPendingWork: true });
  assert.equal(final().props.accessibilityState.busy, true);
  await act(async () => resolveDeletion({ success: true }));
  assert.match(textOf(tree), /Your Route Logistics account was deleted/);
});

test('deletion failures retain confirmation context, owner restrictions, and a retry path', async () => {
  account('owner'); let attempts = 0;
  currentAuth.deleteAccount = async () => ++attempts === 1 ? { success: false, error: { code: 'functions/failed-precondition', message: 'Transfer ownership before deleting your account because other staff remain.' } } : { success: true };
  const tree = await render('screens/SettingsScreen.js');
  await press(tree, 'Delete my account');
  assert.match(textOf(tree), /transfer ownership in company settings on the web/);
  await press(tree, 'Continue to confirmation');
  const confirmation = () => tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Type DELETE to confirm')[0];
  await act(async () => confirmation().props.onChangeText('DELETE'));
  await press(tree, 'Permanently delete my account');
  assert.match(textOf(tree), /Transfer ownership before deleting your account because other staff remain/);
  assert.equal(confirmation().props.value, 'DELETE');
  await press(tree, 'Permanently delete my account');
  assert.equal(attempts, 2); assert.match(textOf(tree), /Your Route Logistics account was deleted/);
});

test('account deletion review errors and recent-login failures are actionable without deleting automatically', async () => {
  account(); let reviews = 0, deletions = 0, signouts = 0;
  currentAuth.getAccountDeletionSummary = async () => { if (++reviews === 1) throw new Error('Connect to the internet and retry.'); return { pendingOperations: 0, pendingPhotos: 0 }; };
  currentAuth.deleteAccount = async () => { deletions++; return { success: false, error: { code: 'functions/failed-precondition', message: 'Sign out and sign back in, then delete your account within five minutes.' } }; };
  currentAuth.signOut = async () => { signouts++; };
  const tree = await render('screens/SettingsScreen.js');
  await press(tree, 'Delete my account');
  assert.match(textOf(tree), /Connect to the internet and retry/); assert.equal(deletions, 0);
  await press(tree, 'Retry account deletion review'); await press(tree, 'Continue to confirmation');
  const confirmation = tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Type DELETE to confirm')[0];
  await act(async () => confirmation.props.onChangeText('DELETE'));
  await press(tree, 'Permanently delete my account');
  assert.match(textOf(tree), /sign out and sign back in/); assert.equal(deletions, 1);
  assert.equal(signouts, 0);
  await press(tree, 'Sign out to verify your identity'); assert.equal(signouts, 1);
});

test('cancelled deletion ignores late review results and never submits deletion', async () => {
  account(); let resolveReview, deletions = 0;
  currentAuth.getAccountDeletionSummary = () => new Promise(resolve => { resolveReview = resolve; });
  currentAuth.deleteAccount = async () => { deletions++; return { success: true }; };
  const tree = await render('screens/SettingsScreen.js');
  const open = tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Delete my account')[0];
  await act(async () => { open.props.onPress(); });
  await press(tree, 'Cancel account deletion');
  await act(async () => resolveReview({ pendingOperations: 7, pendingPhotos: 9 }));
  assert.equal(deletions, 0); assert.doesNotMatch(textOf(tree), /7 unsynced|Continue to confirmation/);
  assert.ok(tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Delete my account').length);
});

test('durably accepted deletion reports pending cleanup without claiming it already finished', async () => {
  account(); const alerts = [];
  native.Alert.alert = (...args) => alerts.push(args);
  currentAuth.deleteAccount = async () => ({ success: true, deletionPending: true });
  const tree = await render('screens/SettingsScreen.js');
  await press(tree, 'Delete my account'); await press(tree, 'Continue to confirmation');
  const confirmation = tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Type DELETE to confirm')[0];
  await act(async () => confirmation.props.onChangeText('DELETE'));
  await press(tree, 'Permanently delete my account');
  assert.equal(alerts.length, 1); assert.equal(alerts[0][0], 'Deletion requested');
  assert.match(alerts[0][1], /access is revoked.*cleanup will retry automatically/);
  assert.doesNotMatch(textOf(tree), /Your Route Logistics account was deleted/);
});

test('server-provided ownership blockers disable final confirmation', async () => {
  account('owner');
  currentAuth.getAccountDeletionSummary = async () => ({ pendingOperations: 0, pendingPhotos: 0, blockers: [{ message: 'Transfer ownership to an active owner before continuing.' }] });
  const tree = await render('screens/SettingsScreen.js');
  await press(tree, 'Delete my account');
  assert.match(textOf(tree), /Transfer ownership to an active owner before continuing/);
  const next = tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Continue to confirmation')[0];
  assert.equal(next.props.disabled, true);
  await press(tree, 'Cancel account deletion');
  assert.doesNotMatch(textOf(tree), /Type DELETE to confirm|Continue to confirmation/);
});

test('confirmed server deletion with failed local cleanup offers cleanup only and never requests reauthentication', async () => {
  account(); let reviews = 0, attempts = 0;
  currentAuth.getAccountDeletionSummary = async () => { reviews++; return { pendingOperations: 0, pendingPhotos: 0 }; };
  currentAuth.deleteAccount = async () => ++attempts === 1 ? { success: false, deletionRecorded: true, localCleanupPending: true, error: { code: 'account/local-cleanup-failed', message: 'Your deletion request is confirmed and account access is revoked. Retry cleanup.' } } : { success: true, deleted: true };
  const tree = await render('screens/SettingsScreen.js');
  await press(tree, 'Delete my account'); await press(tree, 'Continue to confirmation');
  const confirmation = tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Type DELETE to confirm')[0];
  await act(async () => confirmation.props.onChangeText('DELETE'));
  await press(tree, 'Permanently delete my account');
  assert.match(textOf(tree), /Your deletion request is already accepted and account access is revoked/);
  assert.doesNotMatch(textOf(tree), /Your account has not been deleted|Sign out to verify|Cancel account deletion|Type DELETE to confirm/);
  await press(tree, 'Retry device cleanup');
  assert.equal(attempts, 2); assert.equal(reviews, 1);
  assert.match(textOf(tree), /Your Route Logistics account was deleted/);
});

test('assigned work refreshes manually, on return and reconnect, using the selected period', async () => {
  account();
  const home = await render('screens/HomeScreen.js');
  const result = label => ({ success: true, jobs: [{ id: label, customerName: label, serviceType: 'Inspection', status: 'scheduled' }] });
  jobLoader = async () => result('New remote assignment');
  await press(home, 'Refresh jobs');
  assert.match(textOf(home), /New remote assignment/);
  jobLoader = async () => result('After returning');
  await act(async () => {
    native.AppState.currentState = 'background'; appListeners.forEach(listener => listener('background'));
    native.AppState.currentState = 'active'; appListeners.forEach(listener => listener('active'));
  });
  await settle();
  assert.match(textOf(home), /After returning/);
  jobLoader = async () => result('After reconnecting');
  await act(async () => {
    networkListeners.forEach(listener => listener({ isConnected: false, isInternetReachable: false }));
    networkListeners.forEach(listener => listener({ isConnected: true, isInternetReachable: true }));
  });
  await settle();
  assert.match(textOf(home), /After reconnecting/);
  jobLoader = async () => result('After pulling');
  const refresh = home.root.findAll(node => node.type === 'RefreshControl')[0];
  await act(async () => refresh.props.onRefresh());
  await settle();
  assert.match(textOf(home), /After pulling/);
  await press(home, 'View schedule');
  const week = home.root.findAll(node => node.type === 'TouchableOpacity' && node.findAll(child => child.type === 'Text' && child.props.children === 'week').length)[0];
  await act(async () => week.props.onPress());
  await settle();
  const { periodRange, localDay } = require('../services/workQueryPolicy');
  assert.deepEqual(jobRequests.at(-1), periodRange('week', localDay()));
  await act(async () => {
    native.AppState.currentState = 'background'; appListeners.forEach(listener => listener('background'));
    native.AppState.currentState = 'active'; appListeners.forEach(listener => listener('active'));
  });
  await settle();
  assert.deepEqual(jobRequests.at(-1), periodRange('week', localDay()));
  await unmount(home);
  assert.equal(appListeners.size, 0); assert.equal(networkListeners.size, 0);
});

test('an overlapping foreground refresh shares the pending schedule request', async () => {
  account();
  let resolveFirst, calls = 0;
  jobLoader = async () => ++calls === 1 ? new Promise(resolve => { resolveFirst = resolve; }) : { success: true, jobs: [{ id: 'new', customerName: 'Latest assignment', serviceType: 'Inspection', status: 'scheduled' }] };
  const home = await render('screens/HomeScreen.js');
  await act(async () => {
    native.AppState.currentState = 'background'; appListeners.forEach(listener => listener('background'));
    native.AppState.currentState = 'active'; appListeners.forEach(listener => listener('active'));
  });
  assert.equal(calls, 1);
  await act(async () => resolveFirst({ success: true, jobs: [{ id: 'new', customerName: 'Latest assignment', serviceType: 'Inspection', status: 'scheduled' }] }));
  await settle();
  assert.match(textOf(home), /Latest assignment/);
  await unmount(home);
});

test('a filtered list omission preserves details and single-job denial shows a resource error without revoking company access', async () => {
  account();
  const job = { id: 'assigned', companyId: 'acme', customerName: 'Private job details', serviceType: 'Inspection', status: 'scheduled' };
  jobLoader = async () => ({ success: true, jobs: [job] });
  detailLoader = async () => ({ job: { ...job, status: 'completed' }, customer: null });
  const home = await render('screens/HomeScreen.js');
  const card = home.root.findAll(node => node.type === 'TouchableOpacity' && node.findAll(child => child.type === 'Text' && child.props.children === 'Private job details').length)[0];
  await act(async () => card.props.onPress()); await settle();
  const details = () => home.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Job details')[0];
  assert.equal(details().props.pointerEvents, 'auto');
  assert.equal(home.root.findAllByType('Modal').length, 0);
  // Completion/filtering removes the list row, while the independently fetched
  // single-job document remains readable under the same active membership.
  jobLoader = async () => ({ success: true, jobs: [] });
  await press(home, 'Refresh jobs');
  assert.equal(details().props.pointerEvents, 'auto');
  assert.match(textOf(home), /Private job details/); assert.equal(authRefreshes, 0);
  detailLoader = async () => { throw Object.assign(new Error('You are no longer assigned to this job. Ask your manager.'), { code: 'functions/permission-denied' }); };
  await press(home, 'Refresh jobs'); await settle();
  const resourceError = home.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Work order access check')[0];
  assert.ok(resourceError); assert.match(textOf(home), /no longer assigned/);
  assert.equal(details().props.pointerEvents, 'none'); assert.equal(details().props.accessibilityElementsHidden, true);
  assert.equal(currentAuth.permissions.canAccess, true); assert.equal(currentAuth.accessStatus, 'ready'); assert.equal(authRefreshes, 1);
  assert.doesNotMatch(textOf(home), /Job access changed|Your company access has changed|Join your company/);
  assert.equal(home.root.findAllByType('Modal').length, 0);
  await press(home, 'Return to jobs');
  assert.equal(home.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Job details').length, 0);
});

test('job details close and reopen repeatedly without native modal backdrops or delayed transitions', async () => {
  account();
  const assignments = [
    { id: 'first', customerName: 'First assigned job', status: 'scheduled' },
    { id: 'second', customerName: 'Second assigned job', status: 'scheduled' },
  ];
  jobLoader = async () => ({ success: true, jobs: assignments });
  detailLoader = async ({ id }) => ({ job: assignments.find(job => job.id === id), customer: null });
  const home = await render('screens/HomeScreen.js');
  for (const name of ['First assigned job', 'First assigned job', 'Second assigned job', 'First assigned job']) {
    const card = home.root.findAll(node => node.type === 'TouchableOpacity' && node.findAll(child => child.type === 'Text' && (child.props.children === name || (Array.isArray(child.props.children) && child.props.children.includes(name)))).length)[0];
    assert.ok(card);
    await act(async () => card.props.onPress()); await settle();
    assert.equal(home.root.findAllByType('Modal').length, 0);
    const details = home.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Job details')[0];
    assert.match(JSON.stringify(details.props.children.props.job.customerName), new RegExp(name));
    // A temporary background read error must retain the selected job screen.
    jobLoader = async () => ({ success: false, error: 'Temporarily unavailable.', code: 'functions/unavailable' });
    await press(home, 'Refresh jobs');
    assert.equal(home.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Job details').length, 1);
    jobLoader = async () => ({ success: true, jobs: [
      { id: 'first', customerName: 'First assigned job', status: 'scheduled' },
      { id: 'second', customerName: 'Second assigned job', status: 'scheduled' },
    ] });
    await press(home, 'Close job details');
    await press(home, 'Refresh jobs');
    assert.equal(home.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Job details').length, 0);
    assert.equal(home.root.findAllByType('Modal').length, 0);
  }
  await unmount(home);
});

test('single-job detail restores safe customer location, phone and instructions for technicians', async () => {
  account();
  const job = { id: 'field', companyId: 'acme', assignedTo: 'membership', customerName: 'Field customer', status: 'scheduled' };
  jobLoader = async () => ({ success: true, jobs: [job] });
  detailLoader = async () => ({ job, customer: { address: { street: '3 Service Road', city: 'Bakersfield', state: 'CA', zipCode: '93312' }, phoneNumber: '555-0100', serviceInstructions: 'Keep the gate closed.', totalRevenue: 900, email: 'private@example.com' } });
  const home = await render('screens/HomeScreen.js');
  const card = home.root.findAll(node => node.type === 'TouchableOpacity' && node.findAll(child => child.type === 'Text' && child.props.children === 'Field customer').length)[0];
  await act(async () => card.props.onPress()); await settle();
  const selected = home.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Job details')[0].props.children.props.job;
  assert.equal(selected.address, '3 Service Road'); assert.equal(selected.city, 'Bakersfield'); assert.equal(selected.customerPhone, '555-0100');
  assert.equal(selected.serviceInstructions, 'Keep the gate closed.'); assert.equal(selected.totalRevenue, undefined); assert.equal(selected.email, undefined);
});

test('manager action requests open the established edit and follow-up forms with the correct job', async () => {
  account('manager');
  const job = { id: 'managed', companyId: 'acme', customerName: 'Managed customer', serviceType: 'Termite inspection', status: 'completed', date: '2026-11-13', time: '09:00' };
  detailLoader = async () => ({ job, customer: null });
  const consumed = [];
  const edit = await render('screens/HomeScreen.js', { embedded: true, managementAction: { id: 1, kind: 'edit', job }, onManagementActionHandled: id => consumed.push(id) });
  const panel = edit.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Edit job')[0];
  assert.ok(panel); assert.match(textOf(edit), /Edit Job/);
  assert.equal(panel.findAll(node => node.type === 'TextInput' && node.props.placeholder === 'Enter customer name')[0].props.value, 'Managed customer');
  await act(async () => panel.findAllByType('TouchableOpacity')[0].props.onPress()); await settle();
  assert.equal(edit.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Edit job').length, 0);
  assert.deepEqual(consumed, [1]);
  await unmount(edit);
  const followUp = await render('screens/HomeScreen.js', { embedded: true, managementAction: { id: 2, kind: 'follow-up', job }, onManagementActionHandled: id => consumed.push(id) });
  assert.match(textOf(followUp), /scheduleServiceTitle/); assert.match(textOf(followUp), /Managed customer/); assert.match(textOf(followUp), /Termite inspection/);
  assert.deepEqual(consumed, [1, 2]);
});

test('management form requests cannot grant technicians or other tenants edit access', async () => {
  for (const role of ['technician', 'manager']) {
    account(role);
    const job = { id: 'blocked', companyId: role === 'manager' ? 'other-company' : 'acme', customerName: 'Blocked job', status: 'completed' };
    const home = await render('screens/HomeScreen.js', { managementAction: { id: 3, kind: 'edit', job } });
    assert.equal(home.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Edit job').length, 0);
    assert.doesNotMatch(textOf(home), /Blocked job/);
    await unmount(home);
  }
});
