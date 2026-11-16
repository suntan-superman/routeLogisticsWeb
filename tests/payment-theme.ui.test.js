const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json'));
const web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');

global.IS_REACT_ACT_ENVIRONMENT = true;
const client = { app: { name: 'synthetic-payment-client' } };
let tree, theme = 'light', calls = [], options = [], elementMounts = 0;
const stripe = { confirmPayment: () => { throw Error('Theme tests must never submit payments'); } };
const elements = {};
function Elements({ options: nextOptions, children }) {
  options.push(nextOptions);
  return children;
}
function PaymentElement() {
  const [draft, setDraft] = React.useState('');
  React.useEffect(() => { elementMounts++; }, []);
  return React.createElement('input', { 'aria-label': 'Synthetic card input', value: draft, onChange: event => setDraft(event.target.value) });
}
const importer = name => {
  if (name === 'react') return React;
  if (name === '@stripe/stripe-js') return { loadStripe: () => Promise.resolve(stripe) };
  if (name === '@stripe/react-stripe-js') return { Elements, PaymentElement, useStripe: () => stripe, useElements: () => elements };
  if (name === 'firebase/functions') return { httpsCallable: (functionClient, endpoint) => async data => {
    calls.push({ functionClient, endpoint, data });
    assert.equal(endpoint, 'rlCreateInvoicePayment');
    return { data: { clientSecret: 'synthetic-client-secret', mode: 'test', amount: 2500 } };
  } };
  if (name.endsWith('/services/firebase')) return { functions: client };
  if (name.endsWith('/services/paymentConfig')) return { stripePublishableKey: 'pk_test_synthetic_fixture', paymentMode: 'test', paymentsConfigured: true };
  if (name.endsWith('/contexts/ThemeContext')) return { useTheme: () => ({ theme }) };
  if (name.endsWith('/PaymentHistory')) return { __esModule: true, default: () => null };
  throw Error('Unexpected payment theme dependency ' + name);
};
const loaded = { exports: {} };
new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src/components/InvoicePayment.jsx'), 'utf8'), { loader: 'jsx', format: 'cjs' }).code)(React, importer, loaded, loaded.exports);
const InvoicePayment = loaded.exports.default;
const render = () => React.createElement(InvoicePayment, { invoiceId: 'synthetic-test-invoice', functionClient: client });

afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null; theme = 'light'; calls = []; options = []; elementMounts = 0;
});

test('payment fields follow the resolved app theme while retaining input and the original payment session', async () => {
  await act(async () => { tree = create(render()); });
  assert.equal(options.at(-1).appearance.theme, 'stripe');
  assert.equal(options.at(-1).appearance.variables.colorBackground, '#ffffff');
  await act(async () => tree.root.findByProps({ 'aria-label': 'Synthetic card input' }).props.onChange({ target: { value: 'unfinished synthetic card input' } }));
  for (const nextTheme of ['dark', 'light']) {
    theme = nextTheme;
    await act(async () => tree.update(render()));
    assert.equal(options.at(-1).appearance.theme, nextTheme === 'dark' ? 'night' : 'stripe');
    assert.equal(options.at(-1).appearance.variables.colorBackground, nextTheme === 'dark' ? '#10251d' : '#ffffff');
    assert.equal(options.at(-1).clientSecret, 'synthetic-client-secret');
    assert.equal(tree.root.findByProps({ 'aria-label': 'Synthetic card input' }).props.value, 'unfinished synthetic card input');
  }
  assert.equal(elementMounts, 1);
  assert.equal(calls.length, 1, 'theme changes must not recreate a payment');
  assert.equal(calls[0].functionClient, client);
  assert.deepEqual(calls[0].data, { invoiceId: 'synthetic-test-invoice' });
});
