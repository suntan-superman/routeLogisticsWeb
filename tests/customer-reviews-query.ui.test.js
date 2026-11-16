// Real CustomerReviews and TanStack observers; only provider transport and DOM
// integrations are replaced. No email, accounting or provider writes are made.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
global.IS_REACT_ACT_ENVIRONMENT = true;
global.window = new EventTarget(); global.document = { visibilityState: 'visible' };
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), queries = mobile('@tanstack/react-query'), { transformSync } = web('esbuild');
const { QueryClient, QueryClientProvider, focusManager, onlineManager } = queries;
let tree, client, env, modules;
const clone = value => JSON.parse(JSON.stringify(value));
const baseReview = () => ({ id: 'review-one', jobId: 'older-job', rating: 4, comment: 'Saved service feedback', publicConsent: false, serviceType: 'Inspection', serviceDate: '2026-11-14', verifiedService: true });
async function customerReviews(action, data) {
  env.calls.push({ action, data: clone(data) });
  if (action === 'list') {
    if (env.denied) throw Object.assign(Error('Customer association revoked.'), { code: 'functions/permission-denied' });
    return { eligibleVisits: clone(env.eligible), reviews: clone(env.reviews), hasMore: false };
  }
  if (action === 'submit') {
    const review = { ...baseReview(), id: 'submitted-review', ...data };
    env.reviews = [review, ...env.reviews]; env.eligible = env.eligible.filter(row => row.jobId !== data.jobId);
    return { review: clone(review), existing: false };
  }
  if (action === 'consent') {
    env.reviews = env.reviews.map(review => review.id === data.reviewId ? { ...review, publicConsent: data.publicConsent } : review);
    return { review: clone(env.reviews.find(review => review.id === data.reviewId)) };
  }
  throw Error('Unexpected review operation');
}
function load(relative) {
  const file = path.resolve(__dirname, '../routeLogisticsWeb/src', relative);
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} }; modules.set(file, module);
  const importer = name => {
    if (name === 'react') return React;
    if (name === '@tanstack/react-query') return { ...queries, useQuery: options => queries.useQuery({ ...options, gcTime: Infinity }) };
    if (name === 'react-hot-toast') return { __esModule: true, default: { success() {}, error() {} } };
    if (name.endsWith('/services/portal')) return { portalAuth: env.auth };
    if (name.endsWith('/services/reviews')) return { customerReviews };
    if (name.endsWith('/hooks/useUnsavedChanges')) return { useUnsavedChanges: () => ({ confirmDiscard: async () => true }), useConfirmUnsavedChanges: () => async () => true };
    if (name.startsWith('.')) { const target = path.resolve(path.dirname(file), name), resolved = path.extname(target) ? target : fs.existsSync(target + '.jsx') ? target + '.jsx' : target + '.js'; return load(path.relative(path.resolve(__dirname, '../routeLogisticsWeb/src'), resolved)); }
    throw Error('Unexpected dependency ' + name);
  };
  new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs' }).code)(React, importer, module, module.exports);
  return module.exports;
}
async function settle(t) { for (let turn = 0; turn < 6; turn++) await act(async () => { await Promise.resolve(); t.mock.timers.tick(0); await Promise.resolve(); }); }
async function render(t) {
  const Reviews = load('components/CustomerReviews.jsx').default;
  await act(async () => { tree = create(React.createElement(QueryClientProvider, { client }, React.createElement(Reviews, { accountId: 'company:acme', userId: 'portal-user' }))); });
  await settle(t);
}
const text = () => JSON.stringify(tree.toJSON());
const buttons = label => tree.root.findAll(node => node.type === 'button' && node.children.join('') === label);
const field = label => tree.root.findByProps({ 'aria-label': label });
async function click(t, label) { const button = buttons(label)[0]; assert.ok(button, label); assert.notEqual(button.props.disabled, true); await act(async () => button.props.onClick()); await settle(t); }
beforeEach(t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: new Date('2026-11-15T12:00:00Z').getTime() });
  tree = null; modules = new Map(); env = { auth: { currentUser: { uid: 'portal-user' } }, calls: [], denied: false, eligible: [{ jobId: 'completed-job', serviceType: 'Inspection', date: '2026-11-15' }], reviews: [baseReview()] };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  focusManager.setFocused(true); onlineManager.setOnline(true);
});
afterEach(async t => { if (tree) await act(async () => tree.unmount()); client.clear(); t.mock.timers.reset(); focusManager.setFocused(true); onlineManager.setOnline(true); });

test('customer review metadata polls every thirty seconds without resetting rating, comments or public permission drafts', async t => {
  await render(t); assert.equal(env.calls.length, 1); await click(t, 'Review this visit');
  await act(async () => {
    tree.root.findAll(node => node.type === 'input' && node.props.type === 'radio' && node.props.value === 2)[0].props.onChange();
    field('Review comments').props.onChange({ target: { value: 'Unsaved customer concern' } });
    tree.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } });
  });
  env.eligible.push({ jobId: 'newly-completed', serviceType: 'New remote completed visit', date: '2026-11-15' });
  env.reviews[0].providerResponse = { text: 'New provider response from another device' };
  await act(async () => t.mock.timers.tick(30_000)); await settle(t);
  assert.equal(env.calls.filter(row => row.action === 'list').length, 2);
  assert.match(text(), /New remote completed visit/); assert.match(text(), /New provider response from another device/);
  assert.equal(field('Review comments').props.value, 'Unsaved customer concern');
  assert.equal(tree.root.findAll(node => node.type === 'input' && node.props.type === 'radio' && node.props.value === 2)[0].props.checked, true);
  assert.equal(tree.root.findByProps({ type: 'checkbox' }).props.checked, true);
  assert.ok(env.calls.every(row => row.action === 'list'), 'polling must never submit feedback or change consent');
  focusManager.setFocused(false); await act(async () => t.mock.timers.tick(90_000)); await settle(t);
  assert.equal(env.calls.length, 2);
  onlineManager.setOnline(false); focusManager.setFocused(true); await settle(t);
  await act(async () => t.mock.timers.tick(90_000)); await settle(t); assert.equal(env.calls.length, 2);
});

test('confirmed review and consent writes immediately refresh their authorized metadata', async t => {
  await render(t); await click(t, 'Review this visit');
  await act(async () => tree.root.findAll(node => node.type === 'input' && node.props.type === 'radio' && node.props.value === 5)[0].props.onChange());
  await act(async () => tree.root.findByProps({ 'aria-label': 'Service feedback form' }).props.onSubmit({ preventDefault() {} })); await settle(t);
  assert.deepEqual(env.calls.map(row => row.action), ['list', 'submit', 'list']); assert.equal(buttons('Review this visit').length, 0);
  await click(t, 'Grant public-display permission');
  assert.deepEqual(env.calls.slice(-2).map(row => row.action), ['consent', 'list']); assert.match(text(), /permission recorded/);
});

test('revoked portal association hides feedback and stops automatic retries without exposing staff authority', async t => {
  await render(t); env.denied = true;
  await act(async () => t.mock.timers.tick(30_000)); await settle(t);
  assert.match(text(), /Customer association revoked/); assert.doesNotMatch(text(), /Saved service feedback/);
  const before = env.calls.length; window.dispatchEvent(new Event('focus'));
  await act(async () => t.mock.timers.tick(120_000)); await settle(t); assert.equal(env.calls.length, before);
  assert.ok(client.getQueryCache().getAll().every(query => query.queryKey[0] === 'rl-customer-reviews' && query.queryKey[1] === 'portal-user' && query.queryKey[2] === 'company:acme'));
});
