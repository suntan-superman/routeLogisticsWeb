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
let customerRows = [], customerSaves = [], jobSaves = [], customerSave, jobSave;
const mounted = new Set();
const appListeners = new Set(), networkListeners = new Set(), backListeners = new Set();
const pass = ({ children }) => children;
const native = Object.fromEntries(['View','Text','TextInput','Pressable','TouchableOpacity','ScrollView','KeyboardAvoidingView','ActivityIndicator','Image','Switch','Button','StatusBar','RefreshControl'].map(name => [name, name]));
native.ScrollView = ({ refreshControl, children, ...props }) => React.createElement('ScrollView', props, refreshControl, children);
native.AppState = { currentState: 'active', addEventListener: (_event, listener) => { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
native.BackHandler = { addEventListener: (_event, listener) => { backListeners.add(listener); return { remove: () => backListeners.delete(listener) }; } };
Object.assign(native, { StyleSheet: { create: x => x, absoluteFill: {}, absoluteFillObject: {} }, Platform: { OS: 'ios', select: x => x.ios }, Alert: { alert() {} }, Linking: { openURL: async () => {} }, Modal: ({ visible, children }) => visible ? React.createElement('Modal', null, children) : null });
const palette = { background: '#07120F', surface: '#14241F', glass: '#14241F', text: '#EFFAF5', secondary: '#B0C8BE', border: '#405D4E', input: '#14241F', accent: '#62E3B3', button: '#087B55', danger: '#FFAAA3', highlight: '#FFFFFF', glow: '#164D38' };
const nativeApplication = { nativeApplicationVersion: '1.0.0', nativeBuildVersion: '27' };
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
    if (specifier === 'expo-application') return nativeApplication;
    if (specifier === 'expo-constants') return { executionEnvironment: 'standalone', expoConfig: { version: '0.8.0', ios: { buildNumber: '1' } } };
    if (specifier === 'expo-blur') return { BlurView: 'BlurView' };
    if (specifier === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
    if (specifier === '@expo/vector-icons') return { Ionicons: 'Icon', MaterialIcons: 'Icon', AntDesign: 'Icon', MaterialCommunityIcons: 'Icon' };
    if (specifier === '@react-native-community/datetimepicker') return 'NativeDatePicker';
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
    if (specifier === './firebase' || specifier.endsWith('/services/firebase')) return { CustomerService: { getCustomers: async () => ({ success: true, customers: customerRows.map(row => ({ ...row })) }), addCustomer: async data => { customerSaves.push({ action: 'create', data }); return customerSave({ action: 'create', data }); }, updateCustomer: async (id, data, expectedVersion) => { customerSaves.push({ action: 'update', id, data, expectedVersion }); return customerSave({ action: 'update', id, data, expectedVersion }); } }, JobService: { addJob: async (data, options) => { jobSaves.push({ action: 'create', data, options }); return jobSave(); }, updateJob: async (id, data, expectedVersion, options) => { jobSaves.push({ action: 'update', id, data, expectedVersion, options }); return jobSave(); }, getJobsByDateRange: async (startDate, endDate) => { const range = { startDate, endDate }; jobRequests.push(range); return jobLoader(range); } }, EstimateService: {} };
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
  customerRows = []; customerSaves = []; jobSaves = []; customerSave = async () => ({ success: true }); jobSave = async () => ({ success: true });
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
  assert.equal(appListeners.size, 0); assert.equal(networkListeners.size, 0); assert.equal(backListeners.size, 0); native.Platform.OS = 'ios';
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

test('About opens a native dialog with installed version and build without changing Settings drafts', async () => {
  account(); const alerts = []; let saves = 0;
  native.Alert.alert = (...args) => alerts.push(args);
  currentAuth.updateUserProfile = async () => { saves++; return { success: true }; };
  const tree = await render('screens/SettingsScreen.js');
  const name = () => tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Display name')[0];
  await act(async () => name().props.onChangeText('Unsaved display name'));
  await press(tree, 'About Route Logistics');
  assert.equal(alerts.length, 1); assert.equal(alerts[0][0], 'About Route Logistics');
  assert.match(alerts[0][1], /Workside Software LLC/);
  assert.match(alerts[0][1], /Version: 1\.0\.0\nBuild: 27/);
  assert.match(alerts[0][1], /Platform: iOS/);
  assert.doesNotMatch(alerts[0][1], /0\.8\.0|luis@example\.com|membership|companyId/);
  assert.equal(alerts[0][2][0].text, 'Close');
  assert.equal(alerts[0][3].cancelable, true);
  // Native Alert owns dismissal: it leaves no React Native Modal backdrop/state.
  await press(tree, 'About Route Logistics');
  assert.equal(alerts.length, 2); assert.equal(name().props.value, 'Unsaved display name');
  assert.equal(saves, 0); assert.equal(tree.root.findAllByType('Modal').length, 0);
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

for (const os of ['ios', 'android']) test(`${os} manager time selection preserves odd-minute records on cancel and reopens without native modals`, async () => {
  account('manager'); native.Platform.OS = os;
  const job = { id: 'quarter-time-job', companyId: 'acme', customerName: 'Quarter customer', serviceType: 'Inspection', status: 'scheduled', date: '2026-11-13', time: '09:07' };
  detailLoader = async () => ({ job, customer: null });
  const home = await render('screens/HomeScreen.js', { managementAction: { id: `time-${os}`, kind: 'edit', job } });
  const open = async () => { const control = home.root.findAll(node => node.type === 'TouchableOpacity' && node.props.accessibilityLabel === 'Edit job time')[0]; assert.ok(control); await act(async () => control.props.onPress()); await settle(); };
  const pickerPanels = () => home.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Choose service time');
  await open(); assert.equal(pickerPanels().length, 1); assert.equal(home.root.findAllByType('Modal').length, 0);
  assert.deepEqual(home.root.findAll(node => node.type === 'Pressable' && /^Minute /.test(node.props.accessibilityLabel || '')).map(node => node.props.accessibilityLabel), ['Minute 00', 'Minute 15', 'Minute 30', 'Minute 45']);
  await press(home, 'Cancel time selection'); assert.equal(pickerPanels().length, 0); assert.match(textOf(home), /9:07 AM/);
  await open(); await press(home, 'Minute 15');
  if (os === 'android') await act(async () => { assert.equal([...backListeners].at(-1)(), true); });
  else await press(home, 'Cancel time selection');
  assert.equal(pickerPanels().length, 0); assert.match(textOf(home), /9:07 AM/);
  assert.ok(home.root.findAll(node => node.type === 'TouchableOpacity' && node.props.accessibilityLabel === 'Edit job time')[0]);
  await open(); await press(home, 'Minute 45'); await press(home, 'Use selected time');
  assert.equal(pickerPanels().length, 0); assert.match(textOf(home), /9:45 AM/); assert.equal(job.time, '09:07');
  assert.equal(home.root.findAllByType('Modal').length, 0);
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

const propertyInput = tree => tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Service property address')[0];
async function touch(tree, label) {
  const target = tree.root.findAll(node => ['Pressable', 'TouchableOpacity'].includes(node.type) && node.props.accessibilityLabel === label)[0];
  assert.ok(target, `Control '${label}' must exist`); assert.notEqual(target.props.disabled, true);
  await act(async () => target.props.onPress()); await settle();
}
async function input(tree, label, value) {
  const target = tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === label)[0];
  assert.ok(target, label); await act(async () => target.props.onChangeText(value)); await settle();
}
const addressCustomer = () => ({ id: 'property-customer', name: 'Property customer', phone: '555-0100', address: { street: '1 Saved St', city: 'Bakersfield', state: 'CA', postalCode: '93312' }, updatedAt: '2026-11-14T10:00:00.000Z' });
const addressJob = () => ({ id: 'property-job', companyId: 'acme', customerId: 'property-customer', customerName: 'Property customer', serviceType: 'Inspection', status: 'scheduled', date: '2026-11-15', time: '09:15', address: '8 Historical St, Bakersfield, CA 93312', updatedAt: '2026-11-14T12:00:00.000Z' });

test('job properties start locked and Google suggestions require explicit application and a separate Save', async () => {
  account('manager'); customerRows = [addressCustomer()]; const job = addressJob(); detailLoader = async () => ({ job });
  const suggestion = '9 Corrected St, Bakersfield, CA 93312';
  jobSave = async () => ({ success: false, error: { message: 'Review this address.', addressValidation: { status: 'confirmation-required', message: 'Review this address.', suggestedAddress: suggestion } } });
  const home = await render('screens/HomeScreen.js', { managementAction: { id: 'address-review', kind: 'edit', job } });
  assert.equal(propertyInput(home).props.value, job.address); assert.equal(propertyInput(home).props.editable, false);
  await input(home, 'Service property address', 'Unapproved overwrite'); assert.equal(propertyInput(home).props.value, job.address);
  await press(home, 'Enable Editing'); await input(home, 'Service property address', '9 Corected');
  await touch(home, 'Save job changes'); assert.equal(jobSaves.length, 1); assert.match(textOf(home), /Review the suggested address/);
  assert.equal(propertyInput(home).props.value, '9 Corected'); assert.equal(jobSaves[0].expectedVersion, job.updatedAt);
  await press(home, 'Use suggested address'); assert.equal(propertyInput(home).props.value, suggestion); assert.equal(jobSaves.length, 1);
  assert.equal(jobSaves[0].options, undefined); assert.equal(jobSaves[0].data.serviceProperty.address, '9 Corected');
  jobSave = async () => ({ success: true }); await touch(home, 'Save job changes');
  assert.equal(jobSaves.length, 2); assert.equal(jobSaves[1].data.address, suggestion); assert.deepEqual(jobSaves[1].data.serviceProperty, { address: suggestion });
  assert.equal(job.address, '8 Historical St, Bakersfield, CA 93312'); assert.equal(customerSaves.length, 0);
});

test('ordinary job edits preserve historical address without recertifying or rewriting the customer', async () => {
  account('manager'); customerRows = [addressCustomer()]; const job = addressJob(); detailLoader = async () => ({ job });
  const home = await render('screens/HomeScreen.js', { managementAction: { id: 'address-unchanged', kind: 'edit', job } });
  await touch(home, 'Save job changes');
  assert.equal(jobSaves.length, 1); assert.equal(Object.hasOwn(jobSaves[0].data, 'address'), false);
  assert.equal(Object.hasOwn(jobSaves[0].data, 'serviceProperty'), false); assert.equal(jobSaves[0].options, undefined); assert.equal(customerSaves.length, 0);
});

test('permanent job address updates are unchecked by default and retain the captured revision and draft after conflict', async () => {
  account('owner'); customerRows = [addressCustomer()]; const job = addressJob(); detailLoader = async () => ({ job });
  jobSave = async () => ({ success: false, error: { code: 'functions/aborted', message: 'The customer changed. Refresh it before saving.' } });
  const home = await render('screens/HomeScreen.js', { managementAction: { id: 'address-permanent', kind: 'edit', job } });
  assert.equal(home.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityRole === 'checkbox').length, 0);
  await press(home, 'Enable Editing');
  const checkbox = () => home.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === "Update customer's saved address")[0];
  assert.equal(checkbox().props.accessibilityState.checked, false); await press(home, "Update customer's saved address");
  const original = customerRows[0].updatedAt; customerRows[0] = { ...customerRows[0], updatedAt: '2026-11-15T10:00:00.000Z' };
  await touch(home, 'Save job changes');
  assert.deepEqual(jobSaves[0].options, { saveCustomerAddress: true, expectedCustomerVersion: original });
  assert.deepEqual(jobSaves[0].data.serviceProperty, { address: job.address });
  assert.match(textOf(home), /The customer changed/); assert.equal(checkbox().props.accessibilityState.checked, true); assert.equal(propertyInput(home).props.value, job.address);
  assert.equal(home.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Edit job').length, 1);
});

test('customer edits capture the loaded revision, retain drafts on failure, and separately save applied proposals', async () => {
  account('owner'); customerRows = [addressCustomer()];
  customerSave = async () => ({ success: false, error: { message: 'Confirm the corrected address.', addressValidation: { status: 'confirmation-required', message: 'Confirm the corrected address.', suggestedAddress: '2 Corrected St, Bakersfield, CA 93312' } } });
  const home = await render('screens/HomeScreen.js'); await press(home, 'Customers'); await touch(home, 'Edit customer Property customer');
  await input(home, 'Customer service address', '2 Corected St'); await touch(home, 'Save customer');
  assert.equal(customerSaves.length, 1); assert.equal(customerSaves[0].expectedVersion, addressCustomer().updatedAt);
  assert.equal(customerSaves[0].data.city, ''); assert.equal(customerSaves[0].data.postalCode, '');
  await press(home, 'Use suggested address'); assert.equal(customerSaves.length, 1);
  assert.equal(home.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Customer service address')[0].props.value, '2 Corrected St, Bakersfield, CA 93312');
  customerSave = async () => ({ success: true }); await touch(home, 'Save customer'); assert.equal(customerSaves.length, 2);
  assert.equal(customerSaves[1].expectedVersion, addressCustomer().updatedAt); assert.equal(home.root.findAllByType('Modal').length, 0);
});

test('new contact-only customers can be saved without a physical address and unavailable checks preserve the draft', async () => {
  account('owner'); const home = await render('screens/HomeScreen.js'); await press(home, 'Customers');
  await input(home, 'Customer name', 'Synthetic contact'); await input(home, 'Customer phone', '555-0100'); await touch(home, 'Add customer');
  assert.equal(customerSaves[0].data.address, ''); assert.equal(customerSaves[0].action, 'create');
  customerSave = async () => ({ success: false, error: { message: 'Try address verification again.', addressValidation: { status: 'unavailable', message: 'Try address verification again.' } } });
  await input(home, 'Customer name', 'Retry customer'); await input(home, 'Customer phone', '555-0101'); await input(home, 'Customer service address', '3 Saved St'); await touch(home, 'Add customer');
  assert.match(textOf(home), /Address verification is unavailable/); assert.doesNotMatch(textOf(home), /Use suggested address/);
  assert.equal(home.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Customer name')[0].props.value, 'Retry customer');
});

test('scheduling prefills the selected property and switching customers resets lock and permanent choice without a native picker overlay', async () => {
  account('owner'); customerRows = [addressCustomer(), { id: 'no-address', name: 'Contact only', phone: '555-0101', updatedAt: null }];
  const home = await render('screens/HomeScreen.js'); await press(home, 'Schedule service');
  await touch(home, 'Select service customer'); assert.equal(home.root.findAllByType('Modal').length, 0);
  await touch(home, 'Select customer Property customer'); assert.equal(propertyInput(home).props.value, '1 Saved St, Bakersfield, CA 93312'); assert.equal(propertyInput(home).props.editable, false);
  await press(home, 'Enable Editing'); await input(home, 'Service property address', '3 Oneoff St'); await press(home, "Update customer's saved address");
  await touch(home, 'Select service customer'); await touch(home, 'Select customer Contact only');
  assert.equal(propertyInput(home).props.value, ''); assert.equal(propertyInput(home).props.editable, false);
  assert.equal(home.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityRole === 'checkbox').length, 0);
  await press(home, 'Enable Editing'); await input(home, 'Service property address', '4 Contact Service St');
  assert.equal(propertyInput(home).props.value, '4 Contact Service St'); assert.equal(jobSaves.length, 0); assert.equal(home.root.findAllByType('Modal').length, 0);
});

for (const permanent of [false, true]) test(`scheduled property ${permanent ? 'permanent' : 'one-visit'} changes save the selected customer ID with explicit address-only metadata`, async () => {
  account('owner'); customerRows = [addressCustomer()]; const notices = []; native.Alert.alert = (...args) => notices.push(args);
  jobSave = async () => ({ success: true, customerAddressUpdated: permanent });
  const home = await render('screens/HomeScreen.js'); await press(home, 'Schedule service');
  await touch(home, 'Select service customer'); await touch(home, 'Select customer Property customer');
  await press(home, 'Enable Editing'); await input(home, 'Service property address', '7 New Service St, Bakersfield, CA 93312');
  if (permanent) await press(home, "Update customer's saved address");
  await touch(home, 'Select service type'); await touch(home, 'Select service Termite Inspection');
  await touch(home, 'Service date'); const date = home.root.findAllByType('NativeDatePicker')[0];
  await act(async () => date.props.onChange({ type: 'set' }, new Date('2026-11-15T12:00:00.000Z'))); await settle();
  await touch(home, 'Service time'); await press(home, 'Hour 9'); await press(home, 'AM'); await press(home, 'Minute 15'); await press(home, 'Use selected time');
  const duration = home.root.findAll(node => node.type === 'TextInput' && node.props.placeholder === '2')[0];
  await act(async () => duration.props.onChangeText('1')); await settle(); await touch(home, 'Save scheduled service');
  assert.equal(jobSaves.length, 1); assert.equal(jobSaves[0].data.customerId, 'property-customer'); assert.equal(jobSaves[0].data.time, '09:15');
  assert.deepEqual(jobSaves[0].data.serviceProperty, { address: '7 New Service St, Bakersfield, CA 93312' });
  assert.equal(jobSaves[0].data.latitude, undefined); assert.equal(jobSaves[0].data.serviceArea, undefined); assert.equal(customerSaves.length, 0);
  assert.deepEqual(jobSaves[0].options, permanent ? { saveCustomerAddress: true, expectedCustomerVersion: addressCustomer().updatedAt } : undefined);
  assert.equal(home.root.findAll(node => node.type === 'View' && node.props.accessibilityLabel === 'Schedule service').length, 0);
  assert.ok(notices.some(args => String(args[1]).includes(permanent ? 'customer address updated' : 'scheduled successfully')));
});
