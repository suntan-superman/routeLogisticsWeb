// Uses the existing workspace JSX compiler and React renderer; no Firebase calls.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const mobileRequire = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json'));
const webRequire = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobileRequire('react');
const { create, act } = mobileRequire('react-test-renderer');
const { transformSync } = webRequire('esbuild');
global.IS_REACT_ACT_ENVIRONMENT = true;
let role, customers, writes;
const user = { uid: 'test-user', emailVerified: true, getIdToken: async () => 'test-token', getIdTokenResult: async () => ({ claims: { companyId: 'test-company', role, membershipId: 'test-member' } }) };
const service = {
  getCustomers: async () => ({ success: true, customers, hasMore: false }),
  getCustomerStats: async () => ({ success: true, stats: { totalCustomers: customers.length } }),
  createCustomer: async data => { writes.push(data); return { success: true, customer: { id: 'new', ...data } }; },
};
const cache = new Map();
function load(relative) {
  const filename = path.resolve(__dirname, '../routeLogisticsWeb/src', relative);
  if (cache.has(filename)) return cache.get(filename);
  const module = { exports: {} };
  const mockRequire = specifier => {
    if (specifier === 'react') return React;
    if (specifier === 'framer-motion') return { motion: { div: 'div' } };
    if (specifier === '@heroicons/react/24/outline') return new Proxy({}, { get: (_, key) => key });
    if (specifier === 'react-hot-toast') return { error() {}, success() {} };
    if (specifier.endsWith('/customerService')) return service;
    if (specifier.endsWith('/ConfirmProvider')) return { useConfirm: () => async () => true };
    if (specifier.endsWith('/CustomerImport')) return () => React.createElement('aside', null, 'Import customers');
    if (specifier.endsWith('/CustomerSmsConsent')) return () => React.createElement('aside', null, 'SMS consent controls');
    if (specifier === 'firebase/firestore') return { where() {} };
    if (specifier === 'firebase/functions') return { httpsCallable: () => async () => ({ data: { workspace: { status: 'company' } } }) };
    if (specifier === './firebase') return { auth: { currentUser: user }, functions: {} };
    if (specifier.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filename), specifier);
      return load(path.extname(resolved) ? resolved : resolved + '.js');
    }
    throw new Error(`Unexpected dependency: ${specifier}`);
  };
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), { loader: filename.endsWith('.json') ? 'json' : filename.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs' });
  new Function('require', 'module', 'exports', code)(mockRequire, module, module.exports);
  cache.set(filename, module.exports);
  return module.exports;
}
const Page = load('pages/CustomerManagementPage.jsx').default;
const tenancy = load('services/tenancy.js');
async function setRole(value) { role = value; await tenancy.syncTenancy(); }
async function render(value, records = [{ id: 'active', name: 'Active customer', isActive: true }, { id: 'inactive', name: 'Inactive customer', isActive: false }]) {
  await setRole(value); customers = records; writes = [];
  let tree;
  await act(async () => { tree = create(React.createElement(Page)); });
  return tree;
}
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const buttons = (tree, label) => tree.root.findAll(node => node.type === 'button' && text(node).trim() === label);
const icons = (tree, name) => tree.root.findAllByType(name);

test('customer component has no technician mutation controls even if mounted outside the route guard', async () => {
  const tree = await render('technician');
  for (const label of ['Add Customer', 'Restore']) assert.equal(buttons(tree, label).length, 0);
  assert.equal(tree.root.findAllByType('aside').length, 0);
  assert.equal(icons(tree, 'PencilIcon').length, 0);
  assert.equal(icons(tree, 'TrashIcon').length, 0);
  const view = icons(tree, 'EyeIcon')[0].parent;
  await act(async () => view.props.onClick());
  assert.ok(buttons(tree, 'Close').length >= 1);
  assert.equal(buttons(tree, 'Edit Customer').length, 0);
  await act(async () => tree.unmount());
});
test('empty customer list never invites a technician to add a customer', async () => {
  const tree = await render('technician', []);
  assert.equal(buttons(tree, 'Add Customer').length, 0);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /adding your first customer/);
  await act(async () => tree.unmount());
});
for (const value of ['owner', 'admin', 'manager']) test(`${value} retains customer management controls and can open the edit form`, async () => {
  const tree = await render(value);
  assert.equal(buttons(tree, 'Add Customer').length, 1);
  assert.equal(buttons(tree, 'Restore').length, 1);
  assert.equal(icons(tree, 'TrashIcon').length, 1);
  await act(async () => icons(tree, 'PencilIcon')[0].parent.props.onClick());
  assert.equal(buttons(tree, 'Save Changes').length, 1);
  await act(async () => tree.unmount());
});
test('an already-open add form cannot submit after claims downgrade to technician', async () => {
  const tree = await render('manager');
  await act(async () => buttons(tree, 'Add Customer')[0].props.onClick());
  const input = tree.root.findAllByType('input').find(node => node.props.placeholder === 'Enter customer name');
  await act(async () => input.props.onChange({ target: { value: 'Test customer' } }));
  const submit = buttons(tree, 'Add Customer').at(-1).props.onClick;
  await setRole('technician');
  await act(async () => submit());
  assert.equal(writes.length, 0);
  await act(async () => tree.update(React.createElement(Page)));
  assert.equal(buttons(tree, 'Add Customer').length, 0);
  await act(async () => tree.unmount());
});
