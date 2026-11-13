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
const pass = ({ children }) => children;
const native = Object.fromEntries(['View','Text','TextInput','Pressable','TouchableOpacity','ScrollView','KeyboardAvoidingView','ActivityIndicator','Image','Switch','Button','StatusBar'].map(name => [name, name]));
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
    if (specifier === '@react-native-async-storage/async-storage') return { getItem: async key => stored.get(key) || null, setItem: async (key, value) => stored.set(key, value), removeItem: async key => stored.delete(key) };
    if (specifier.endsWith('/contexts/AuthContext')) return { AuthContext, AuthProvider: pass, useAuth: () => currentAuth };
    if (specifier.endsWith('/contexts/LanguageContext')) return { LanguageProvider: pass, useLanguage: () => ({ t: key => key, language: 'en', changeLanguage() {} }) };
    if (specifier.endsWith('/theme/ThemeProvider')) return { ThemeProvider: pass, useTheme: () => ({ palette, colors: load('constants/colors.js').COLORS, isDark: true, ready: true, mode: 'dark', changeMode: async value => changes.push(value), reduceTransparency: false }) };
    if (specifier.endsWith('/constants/responsiveSizes')) return { FONT_SIZES: new Proxy({}, { get: () => 16 }), SPACING: new Proxy({}, { get: () => 12 }), BORDER_RADIUS: new Proxy({}, { get: () => 12 }), ICON_SIZES: new Proxy({}, { get: () => 20 }), hp: () => 20, wp: () => 20, rf: () => 16 };
    if (/\/components\/(JobPhotos|WorkLocation|OfflineStatus)$/.test(specifier)) return () => null;
    if (specifier.endsWith('/services/tenancy')) return { canManage: () => currentAuth.permissions.canManage, localDate: () => '2026-11-13' };
    if (specifier.endsWith('/services/firebase')) return { CustomerService: { getCustomers: async () => ({ success: true, customers: [] }) }, JobService: Object.fromEntries(['getTodaysJobs','getThisWeeksJobs','getThisMonthsJobs'].map(key => [key, async () => ({ success: true, jobs: [] })])), EstimateService: {} };
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
  const user = { id: 'luis', name: 'Luis Gonzales', email: 'luis@example.com', emailVerified: true, companyId: status === 'company' ? 'acme' : null, role: status === 'company' ? role : null, membershipId: status === 'company' ? 'membership' : null,
    workspace: { status, invitations: [{ id: 'invite', companyName: 'Acme Pest Control', role: 'technician' }] }, companyName: 'Acme Pest Control', businessName: 'Acme Pest Control', businessPhone: '555-0100', businessAddress: '1 Main St', services: ['Termite Inspection', 'Rodent Control'] };
  currentAuth = { user, isAuthenticated: true, isLoading: false, permissions: workspacePermissions(user.workspace, user), refreshUser: async () => ({ success: true }), signOut: async () => {}, updateUserProfile: async () => ({ success: true }), requestStaffCode: async email => { sent.push(email); return { challengeId: 'c'.repeat(48), message: 'Check your inbox.' }; }, signInWithCode: async (...args) => { verified.push(args); return { success: true }; } };
}
async function render(file) {
  let tree;
  await act(async () => { tree = create(React.createElement(AuthContext.Provider, { value: currentAuth }, React.createElement(load(file).default, { navigation: { navigate() {}, goBack() {} } }))); });
  return tree;
}
const textOf = tree => JSON.stringify(tree.toJSON());
async function press(tree, label) {
  const button = tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
  assert.ok(button, `Button '${label}' must exist`);
  await act(async () => button.props.onPress());
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
