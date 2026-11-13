const { test } = require('node:test');
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
let jobRequests = [], jobLoader = async () => ({ success: true, jobs: [] });
const appListeners = new Set(), networkListeners = new Set();
const pass = ({ children }) => children;
const native = Object.fromEntries(['View','Text','TextInput','Pressable','TouchableOpacity','ScrollView','KeyboardAvoidingView','ActivityIndicator','Image','Switch','Button','StatusBar','RefreshControl'].map(name => [name, name]));
native.ScrollView = ({ refreshControl, children, ...props }) => React.createElement('ScrollView', props, refreshControl, children);
native.AppState = { currentState: 'active', addEventListener: (_event, listener) => { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
Object.assign(native, { StyleSheet: { create: x => x, absoluteFill: {}, absoluteFillObject: {} }, Platform: { OS: 'ios', select: x => x.ios }, Alert: { alert() {} }, Linking: { openURL: async () => {} }, Modal: ({ visible, children }) => visible ? React.createElement('Modal', null, children) : null });
const palette = { background: '#07120F', surface: '#14241F', glass: '#14241F', text: '#EFFAF5', secondary: '#B0C8BE', border: '#405D4E', input: '#14241F', accent: '#62E3B3', button: '#087B55', danger: '#FFAAA3', highlight: '#FFFFFF', glow: '#164D38' };
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
    if (/\/components\/(JobPhotos|WorkLocation|OfflineStatus|FieldWorkTools|MyRoute)$/.test(specifier)) return () => null;
    if (specifier.endsWith('/services/tenancy')) return { canManage: () => currentAuth.permissions.canManage, localDate: () => '2026-11-13' };
    if (specifier === './offline' || specifier.endsWith('/services/offline')) return { cachedRead: (_key, loader) => loader() };
    if (specifier === './workspaceApi' || specifier.endsWith('/services/workspaceApi')) return { callWorkspace: async () => ({ stops: [], saved: null }) };
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
  jobRequests = []; jobLoader = async () => ({ success: true, jobs: [] }); native.AppState.currentState = 'active';
  const user = { id: 'luis', name: 'Luis Gonzales', email: 'luis@example.com', emailVerified: true, companyId: status === 'company' ? 'acme' : null, role: status === 'company' ? role : null, membershipId: status === 'company' ? 'membership' : null,
    workspace: { status, invitations: [{ id: 'invite', companyName: 'Acme Pest Control', role: 'technician' }] }, companyName: 'Acme Pest Control', businessName: 'Acme Pest Control', businessPhone: '555-0100', businessAddress: '1 Main St', services: ['Termite Inspection', 'Rodent Control'] };
  currentAuth = { user, isAuthenticated: true, isLoading: false, permissions: workspacePermissions(user.workspace, user), refreshUser: async () => ({ success: true }), signOut: async () => {}, updateUserProfile: async () => ({ success: true }), requestStaffCode: async email => { sent.push(email); return { challengeId: 'c'.repeat(48), message: 'Check your inbox.' }; }, signInWithCode: async (...args) => { verified.push(args); return { success: true }; } };
}
async function render(file) {
  let tree;
  await act(async () => {
    let content = React.createElement(load(file).default, { navigation: { navigate() {}, goBack() {} } });
    if (file !== 'App.js') content = React.createElement(load('contexts/WorkQueryProvider.js').default, null, content);
    tree = create(React.createElement(AuthContext.Provider, { value: currentAuth }, content));
  });
  await settle();
  return tree;
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
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
  await act(async () => tree.unmount());
});
test('technician Home and Settings display company data without management controls', async () => {
  account();
  const home = await render('screens/HomeScreen.js');
  assert.match(textOf(home), /Acme Pest Control/); assert.match(textOf(home), /Termite Inspection/);
  assert.doesNotMatch(textOf(home), /Manage work|Schedule service|"Customers"|"Estimates"/);
  await act(async () => home.unmount());
  const settings = await render('screens/SettingsScreen.js');
  assert.match(textOf(settings), /555-0100/); assert.match(textOf(settings), /Rodent Control/);
  assert.doesNotMatch(textOf(settings), /Manage services|Open company settings on the web/);
  assert.equal(settings.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Business name').length, 0);
  assert.equal(settings.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityRole === 'radio').length, 3);
  await act(async () => settings.unmount());
});
test('manager Home keeps work management but company ownership controls remain owner-only', async () => {
  account('manager');
  const home = await render('screens/HomeScreen.js');
  assert.match(textOf(home), /Manage work/); assert.match(textOf(home), /Schedule service/);
  await act(async () => home.unmount());
  const manager = await render('screens/SettingsScreen.js');
  assert.doesNotMatch(textOf(manager), /Open company settings on the web/);
  await act(async () => manager.unmount());
  account('owner');
  const owner = await render('screens/SettingsScreen.js');
  assert.match(textOf(owner), /Open company settings on the web/);
  await act(async () => owner.unmount());
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
  await act(async () => tree.unmount());
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
  await act(async () => home.unmount());
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
  await act(async () => home.unmount());
});

test('job details close when a refresh removes the assignment or denies access', async () => {
  for (const denied of [false, true]) {
    account();
    jobLoader = async () => ({ success: true, jobs: [{ id: 'assigned', customerName: 'Private job details', serviceType: 'Inspection', status: 'scheduled' }] });
    const home = await render('screens/HomeScreen.js');
    const card = home.root.findAll(node => node.type === 'TouchableOpacity' && node.findAll(child => child.type === 'Text' && child.props.children === 'Private job details').length)[0];
    await act(async () => { card.props.onPress(); await new Promise(resolve => setTimeout(resolve, 110)); });
    assert.equal(home.root.findAllByType('Modal').length, 1);
    jobLoader = async () => denied ? { success: false, error: 'Membership removed.', code: 'functions/permission-denied' } : { success: true, jobs: [] };
    await press(home, 'Refresh jobs');
    assert.equal(home.root.findAllByType('Modal').length, 0);
    assert.doesNotMatch(textOf(home), /Private job details/);
    await act(async () => home.unmount());
  }
});
