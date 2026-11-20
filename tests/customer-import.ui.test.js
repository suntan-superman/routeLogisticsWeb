const { test, afterEach } = require('node:test');
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
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
const text = node => typeof node === 'string' ? node : (Array.isArray(node) ? node : node?.children || []).map(text).join('');

function component(env) {
  const filename = path.resolve(__dirname, '../routeLogisticsWeb/src/components/CustomerImport.jsx');
  const importer = specifier => {
    if (specifier === 'react') return React;
    if (specifier === 'firebase/functions') return { httpsCallable: () => async payload => {
      env.calls.push(payload);
      if (env.calls.length === 2 && !env.failed) { env.failed = true; throw Error('Synthetic interruption'); }
      return { data: env.calls.length === 3 ? { created: 0, skipped: payload.customers.length } : { created: payload.customers.length, skipped: 0 } };
    } };
    if (specifier.endsWith('/services/firebase')) return { functions: {} };
    if (specifier.endsWith('/utils/customerCsv')) return { previewCustomers: () => { throw Error('The retained preview should not reread a file.'); } };
    throw Error(`Unexpected dependency ${specifier}`);
  };
  const module = { exports: {} };
  new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'jsx', format: 'cjs' }).code)(React, importer, module, module.exports);
  return module.exports.default;
}

test('a validated onboarding CSV is retained through activation and interrupted imports retry without another file selection', async () => {
  const env = { calls: [], failed: false, completed: 0 };
  const preview = { customers: Array.from({ length: 101 }, (_, index) => ({ name: `Customer ${index}`, email: `customer-${index}@example.test` })), duplicates: 2, errors: [] };
  const CustomerImport = component(env);
  await act(async () => { tree = create(React.createElement(CustomerImport, { initialPreview: preview, openInitially: true, onComplete: async () => { env.completed++; } })); });
  assert.match(text(tree.toJSON()), /101 customers ready, 2 duplicates/);
  const file = tree.root.findByProps({ 'aria-label': 'Customer CSV file' });
  assert.equal(file.props.value, undefined);
  const importButton = () => tree.root.findAll(node => node.type === 'button' && text(node).trim() === 'Import customers')[0];
  await act(async () => importButton().props.onClick());
  assert.equal(env.calls.length, 2); assert.equal(env.completed, 0);
  assert.match(text(tree.toJSON()), /Import interrupted: Synthetic interruption/);
  assert.ok(importButton(), 'The retained preview remains retryable.');
  await act(async () => importButton().props.onClick());
  assert.equal(env.calls.length, 4); assert.equal(env.completed, 1);
  assert.match(text(tree.toJSON()), /Imported 1 customers; skipped 100 already present/);
  assert.equal(tree.root.findAll(node => node.type === 'button' && text(node).trim() === 'Import customers').length, 0);
});
