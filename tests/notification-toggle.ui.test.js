const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json'));
const web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react');
const { create, act } = mobile('react-test-renderer');
const { transformSync } = web('esbuild');
global.IS_REACT_ACT_ENVIRONMENT = true;

let tree;
let env;
const message = 'DuckDuckGo for Windows does not support web push notifications. Use Chrome or Edge to receive browser notifications.';
const toast = (text, options) => env.toasts.push({ text, options });
toast.success = text => env.toasts.push({ text, success: true });
toast.error = text => env.toasts.push({ text, error: true });

function loadControl() {
  const source = fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src/components/NotificationToggle.jsx'), 'utf8');
  const module = { exports: {} };
  const importer = dependency => {
    if (dependency === 'react') return React;
    if (dependency === 'react-hot-toast') return { __esModule: true, default: toast };
    if (dependency.endsWith('/services/push')) return {
      pushSupported: async () => { env.supportChecks++; return env.supported; },
      pushEnabled: () => false,
      enablePush: async () => {},
      disablePush: async () => {},
      onForegroundMessage: async () => () => {},
    };
    if (dependency.endsWith('/services/pushRegistration')) return {
      DUCKDUCKGO_PUSH_MESSAGE: message,
      getUnsupportedWebPushBrowser: () => env.unsupportedBrowser,
    };
    throw new Error(`Unexpected notification control dependency: ${dependency}`);
  };
  new Function('React', 'require', 'module', 'exports', transformSync(source, { loader: 'jsx', format: 'cjs' }).code)(React, importer, module, module.exports);
  return module.exports.default;
}

const Control = loadControl();

beforeEach(() => {
  env = { unsupportedBrowser: null, supported: true, supportChecks: 0, toasts: [] };
});

afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
});

test('DuckDuckGo on Windows receives a visible explanation without attempting push registration', async () => {
  env.unsupportedBrowser = 'duckduckgo-windows';
  await act(async () => { tree = create(React.createElement(Control)); });
  const button = tree.root.findByProps({ 'aria-label': 'Web notifications unavailable' });

  assert.equal(button.props.title, message);
  assert.match(button.findAllByType('span').flatMap(span => span.children).join(''), /Notifications unavailable/);
  assert.equal(env.supportChecks, 0);
  await act(async () => button.props.onClick());
  assert.deepEqual(env.toasts, [{ text: message, options: { icon: 'ℹ️' } }]);
});

test('supported browsers retain the normal notification enable control', async () => {
  await act(async () => { tree = create(React.createElement(Control)); });
  assert.equal(env.supportChecks, 1);
  assert.ok(tree.root.findByProps({ 'aria-label': 'Enable notifications' }));
});

