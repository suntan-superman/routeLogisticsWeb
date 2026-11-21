const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
const {createWorkspaceQueryMock,selectControlMock}=require('./support/workspaceQueryMock.cjs');
const workspaceHooks=createWorkspaceQueryMock(React,{scopeId:'test-workspace'});
const {createPrincipalQueryMock}=require('./support/principalQueryMock.cjs');
const principalHooks=createPrincipalQueryMock(React);
global.IS_REACT_ACT_ENVIRONMENT = true;
const client = { name: 'isolated-customer-functions' };
let tree, user = { uid: 'synthetic-portal-user' }, listener, calls = [], accounts, pendingPortal = null, pendingFile = null, fileError = null, portalError = null, otpError = null, requestNumber = 0, paymentProps = [], allowDiscard = true, legacyPortalResponse = false, portalStoredEmail = '';
const portalAuth = { get currentUser() { return user; } };
const a = { id: 'company:provider-a', companyName: 'Provider A', contactEmail: 'a@example.invalid', customerNames: ['Alex Customer'], duplicateCustomerCount: 1, jobs: [{ id: 'visit-a', serviceType: 'Provider A service visit', date: '2026-11-14', time: '10:00', status: 'completed' }], invoices: [{ id: 'invoice-a', invoiceNumber: 'INV-A', total: 35, dueDate: '2026-11-20', status: 'sent', lineItems: [{ description: 'Service A', quantity: 1, unitPrice: 35, amount: 35 }] }], photos: [{ id: 'photo-a', jobId: 'visit-a', kind: 'photo', caption: 'Shared provider A visit photo' }], documents: [{ id: 'document-a', jobId: 'visit-a', kind: 'document', name: 'Provider A service report' }], hasMore: false };
const b = { id: 'company:provider-b', companyName: 'Provider B', contactEmail: 'b@example.invalid', customerNames: ['Alexander Client'], jobs: [{ id: 'visit-b', serviceType: 'Provider B service visit', date: '2026-11-15', time: '11:00', status: 'scheduled' }], invoices: [{ id: 'invoice-b', invoiceNumber: 'INV-B', total: 80, dueDate: '2026-11-25', status: 'sent', lineItems: [] }], photos: [], documents: [], hasMore: false };
accounts = [a, b];
const call = async (name, data, functionClient) => {
  calls.push({ name, data, client: functionClient });
  if (name === 'getCustomerPortal') { if (pendingPortal) return pendingPortal; if (portalError) throw portalError; return legacyPortalResponse ? { accounts: accounts.map(({ customerNames, ...account }) => account), hasMoreAccounts: false } : { accounts, loginEmail: 'verified@example.invalid', hasMoreAccounts: false }; }
  if (name === 'rlRequestCustomerOTP') return { challengeId: `synthetic-challenge-${++requestNumber}`, message: 'If your provider has registered this email, a code will arrive shortly.' };
  if (name === 'rlVerifyCustomerOTP') { if (otpError) throw otpError; return { token: 'synthetic-local-custom-token' }; }
  if (name === 'rlGetCustomerPortalFile') { if (pendingFile) return pendingFile; if (fileError) throw fileError; return data.kind === 'photo' ? { dataUri: 'data:image/png;base64,cGhvdG8=', contentType: 'image/png', name: 'Shared service photo' } : { dataUri: 'data:application/pdf;base64,cGRm', contentType: 'application/pdf', name: 'Service report.pdf' }; }
  if (name === 'rlClaimPortalLink') return { status: 'connected' };
  if (name === 'rlDisconnectPortalLink') return { status: 'disconnected' };
  if (name === 'rlGetInvoicePaymentHistory') return { history: [], truncated: false };
  throw Error('Unexpected portal API: ' + name);
};
const mock = name => {
  if (name === 'react') return React;
  if (name.endsWith('/ThemeControl')) return { __esModule: true, default: () => null };
    if(name.endsWith('/useWorkspaceQuery'))return workspaceHooks;
    if(name.endsWith('/SelectControl'))return{__esModule:true,default:selectControlMock(React)};
    if(name.endsWith('/workspaceQueryPolicy'))return{workspaceAccessError:error=>['permission-denied','unauthenticated','not-found','user-changed'].includes(String(error?.code||'').split('/').pop())};
    if(name.endsWith('/usePrincipalQuery'))return principalHooks;
  if (name.endsWith('/utils/rememberedEmail')) return { rememberedPortalEmail: () => portalStoredEmail, rememberPortalEmail: (value, remember) => { portalStoredEmail = remember && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : ''; } };
  if (name === 'react-router-dom') return { Link: ({ children, to, ...props }) => React.createElement('a', { ...props, href: to }, children) };
  if (name === 'react-helmet-async') return { Helmet: props => React.createElement(React.Fragment, null, props.children) };
  if (name === 'firebase/auth') return {
    onAuthStateChanged: (auth, callback) => { assert.equal(auth, portalAuth); listener = callback; queueMicrotask(() => { if (listener === callback) callback(user); }); return () => { if (listener === callback) listener = null; }; },
    signOut: async auth => { assert.equal(auth, portalAuth); user = null; listener?.(null); },
    signInWithCustomToken: async (auth, token) => { assert.equal(auth, portalAuth); assert.equal(token, 'synthetic-local-custom-token'); user = { uid: 'new-synthetic-portal-user' }; listener?.(user); },
  };
  if (name === 'firebase/functions') return { httpsCallable: (functionClient, endpoint) => async data => ({ data: await call(endpoint, data, functionClient) }) };
  if (name.endsWith('/services/portal')) return { portalAuth, portalFunctions: client, portalReady: Promise.resolve() };
  if (name.endsWith('/services/paymentConfig')) return { paymentsConfigured: true, paymentMode: 'test' };
  if (name.endsWith('/components/CustomerReviews')) return { __esModule: true, default: props => { const [draft,setDraft]=React.useState('');return React.createElement('section', { 'aria-label': 'Selected provider review scope', 'data-review-account': props.accountId, 'data-review-user': props.userId },React.createElement('input',{'aria-label':'Unsent synthetic review',value:draft,onChange:event=>setDraft(event.target.value)})); } };
  if (name.endsWith('/hooks/useUnsavedChanges')) return { useConfirmUnsavedChanges: () => async () => allowDiscard };
  if (name.endsWith('/components/InvoicePayment')) return { __esModule: true, default: props => { React.useEffect(() => { paymentProps.push(props); }, [props]); return React.createElement('div', { role: 'dialog', 'aria-label': 'Invoice payment', 'data-payment-invoice': props.invoiceId, 'data-isolated-client': props.functionClient === client }, React.createElement('button', { onClick: props.onClose }, 'Close test payment')); } };
  if (name.endsWith('/components/PaymentHistory')) return { __esModule: true, default: props => { React.useEffect(() => { call('rlGetInvoicePaymentHistory', { invoiceId: props.invoiceId }, props.functionClient); }, [props.invoiceId, props.functionClient]); return React.createElement('section', { 'aria-label': 'Payment history', 'data-history-invoice': props.invoiceId, 'data-isolated-client': props.functionClient === client }, 'Payment history'); } };
  throw Error('Unexpected dependency: ' + name);
};
const moduleFile = { exports: {} }, source = fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src/pages/CustomerPortalPage.jsx'), 'utf8');
const { code } = transformSync(source, { loader: 'jsx', format: 'cjs' });
new Function('React', 'require', 'module', 'exports', code)(React, mock, moduleFile, moduleFile.exports);
const Portal = moduleFile.exports.default;
const text = () => JSON.stringify(tree.toJSON());
const paragraphs = () => tree.root.findAllByType('p').map(node => node.children.join('')).join('\n');
const button = label => tree.root.findAll(node => node.type === 'button' && node.children.join('') === label)[0];
const mount = async () => { await act(async () => { tree = create(React.createElement(Portal)); }); };
const choose = async id => act(async () => tree.root.findAllByType('select')[0].props.onChange({ target: { value: id } }));
const expandInvoice = async index => act(async () => tree.root.findAllByType('details')[index].props.onToggle({ currentTarget: { open: true } }));
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null; user = { uid: 'synthetic-portal-user' }; listener = null; calls = []; accounts = [a, b]; pendingPortal = null; pendingFile = null; fileError = null; portalError = null; otpError = null; requestNumber = 0; paymentProps = []; allowDiscard = true; legacyPortalResponse = false; portalStoredEmail = '';
});

test('review scope follows the selected provider and unsaved review protection blocks switching, refresh and sign-out', async () => {
  await mount(); assert.equal(tree.root.findByProps({ 'aria-label': 'Selected provider review scope' }).props['data-review-account'], a.id);
  const before = calls.filter(row => row.name === 'getCustomerPortal').length; allowDiscard = false;
  await choose(b.id); await act(async () => button('Refresh visits and invoices').props.onClick()); await act(async () => button('Sign out').props.onClick());
  assert.equal(tree.root.findAllByType('select')[0].props.value, a.id); assert.equal(calls.filter(row => row.name === 'getCustomerPortal').length, before); assert.equal(user.uid, 'synthetic-portal-user');
  allowDiscard = true; await choose(b.id); assert.equal(tree.root.findByProps({ 'aria-label': 'Selected provider review scope' }).props['data-review-account'], b.id);
});

test('multi-provider records and payment buttons are shown only for the explicitly selected provider', async () => {
  await mount();
  assert.equal(tree.root.findAllByType('select')[0].props.value, a.id);
  assert.match(text(), /Provider A service visit/); assert.doesNotMatch(text(), /Provider B service visit|INV-B/);
  assert.match(text(), /Matching customer records have been combined/);
  assert.equal(tree.root.findByProps({ name: 'robots' }).props.content, 'noindex,nofollow');
  await choose(b.id);
  assert.match(text(), /Provider B service visit|INV-B/); assert.doesNotMatch(text(), /Provider A service visit|INV-A|Shared provider A visit photo/);
  assert.ok(button('Test payment for INV-B')); assert.equal(button('Test payment for INV-A'), undefined);
});

test('greeting uses the authorized selected-provider customer name and keeps login email separate', async () => {
  await mount();
  assert.match(text(), /Welcome, Alex Customer/);
  assert.match(paragraphs(), /Verified sign-in email: verified@example.invalid/);
  assert.match(paragraphs(), /Provider contact: a@example.invalid/);
  assert.doesNotMatch(text(), /Welcome, a@example.invalid|Alexander Client/);
  await choose(b.id);
  assert.match(text(), /Welcome, Alexander Client/);
  assert.doesNotMatch(text(), /Welcome, Alex Customer|Provider contact: a@example.invalid/);
});

test('single-provider customer sees only that provider and its authorized overview', async () => {
  accounts = [{ ...a, duplicateCustomerCount: 0 }];
  await mount();
  assert.equal(tree.root.findAllByType('select')[0].findAllByType('option').length, 1);
  assert.match(text(), /Welcome, Alex Customer/);
  assert.ok(tree.root.findByProps({ 'aria-label': 'Portal overview' }));
  assert.doesNotMatch(text(), /Provider B service visit|Alexander Client/);
});

test('missing and different provider-specific names do not become guessed identities', async () => {
  accounts = [{ ...a, customerNames: [] }, { ...b, customerNames: ['First Name', 'Second Name'] }];
  await mount(); assert.match(text(), /Welcome to your portal/); assert.doesNotMatch(text(), /Welcome, verified@example.invalid/);
  await choose(b.id); assert.match(paragraphs(), /Names on this provider account: First Name · Second Name/);
  assert.doesNotMatch(text(), /Welcome, First Name/);
});

test('an older portal response does not leave the identity loading indefinitely', async () => {
  legacyPortalResponse = true;
  await mount();
  assert.match(text(), /Welcome to your portal/);
  assert.doesNotMatch(text(), /Verified sign-in email: Loading|Welcome, Alex Customer/);
  assert.match(text(), /Provider A service visit/);
});

test('customer portal remembers the email on this device but still requests an OTP', async () => {
  user = null;
  await mount();
  const field = () => tree.root.findByProps({ type: 'email' });
  const checkbox = () => tree.root.findByProps({ type: 'checkbox' });
  assert.equal(field().props.value, '');
  assert.equal(checkbox().props.checked, false);
  await act(async () => field().props.onChange({ target: { value: ' Customer@Example.com ' } }));
  await act(async () => checkbox().props.onChange({ target: { checked: true } }));
  assert.equal(portalStoredEmail, 'customer@example.com');
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(calls.filter(row => row.name === 'rlRequestCustomerOTP').length, 1);
  assert.equal(tree.root.findByProps({ inputMode: 'numeric' }).props.value, '');
  await act(async () => tree.unmount()); tree = null;
  await mount();
  assert.equal(field().props.value, 'customer@example.com');
  assert.equal(checkbox().props.checked, true);
  await act(async () => checkbox().props.onChange({ target: { checked: false } }));
  assert.equal(portalStoredEmail, '');
  assert.equal(field().props.value, 'customer@example.com');
});

test('provider switching closes payment/file context and old payment refresh callbacks cannot reload another provider', async () => {
  await mount(); await act(async () => button('View photo').props.onClick());
  assert.equal(tree.root.findByType('img').props.alt, 'Shared provider A visit photo');
  await act(async () => button('Test payment for INV-A').props.onClick());
  assert.equal(tree.root.findByProps({ role: 'dialog' }).props['data-payment-invoice'], 'invoice-a');
  const previousRefresh = paymentProps.at(-1).onRefresh, initialLoads = calls.filter(row => row.name === 'getCustomerPortal').length;
  await choose(b.id); await act(async () => previousRefresh());
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0); assert.equal(tree.root.findAllByType('img').length, 0);
  assert.equal(calls.filter(row => row.name === 'getCustomerPortal').length, initialLoads);
});

test('refresh removes revoked associations and preserves a selected provider only while it remains authorized', async () => {
  await mount(); await choose(b.id);
  await act(async () => button('Refresh visits and invoices').props.onClick());
  assert.equal(tree.root.findAllByType('select')[0].props.value, b.id);
  await act(async () => button('Test payment for INV-B').props.onClick());
  accounts = [a]; await act(async () => button('Refresh visits and invoices').props.onClick());
  assert.equal(tree.root.findAllByType('select')[0].props.value, a.id);
  assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 0); assert.doesNotMatch(text(), /Provider B service visit|INV-B/);
});

test('automatic provider refresh preserves unsent feedback until the selected association is revoked',async()=>{
  await mount();await choose(b.id);
  await act(async()=>tree.root.findByProps({'aria-label':'Unsent synthetic review'}).props.onChange({target:{value:'Unsent feedback for provider B'}}));allowDiscard=false;
  accounts=[a,{...b,jobs:[...b.jobs,{id:'visit-new',serviceType:'New authorized provider B visit',date:'2026-11-16',time:'09:00',status:'scheduled'}]}];
  await act(async()=>principalHooks.refresh(['rl-customer-portal']));
  assert.equal(tree.root.findAllByType('select')[0].props.value,b.id);assert.equal(tree.root.findByProps({'aria-label':'Unsent synthetic review'}).props.value,'Unsent feedback for provider B');assert.match(text(),/New authorized provider B visit/);
  accounts=[a];await act(async()=>principalHooks.refresh(['rl-customer-portal']));
  assert.equal(tree.root.findAllByType('select')[0].props.value,a.id);assert.equal(tree.root.findByProps({'aria-label':'Unsent synthetic review'}).props.value,'');assert.doesNotMatch(text(),/New authorized provider B visit|INV-B/);
});

test('late file responses cannot render data after a provider switch', async () => {
  await mount(); let release; pendingFile = new Promise(resolve => { release = resolve; }); let work;
  await act(async () => { work = button('View photo').props.onClick(); });
  await choose(b.id);
  await act(async () => { release({ dataUri: 'data:image/png;base64,cHJpdmF0ZQ==', contentType: 'image/png', name: 'Old provider private photo' }); await work; });
  assert.equal(tree.root.findAllByType('img').length, 0); assert.doesNotMatch(text(), /Old provider private photo|Shared file preview/);
});

test('a late records response cannot restore private data after sign-out', async () => {
  await mount(); let release; pendingPortal = new Promise(resolve => { release = resolve; }); let work;
  await act(async () => { work = button('Refresh visits and invoices').props.onClick(); });
  assert.equal(button('Sign out').props.disabled, false);
  await act(async () => button('Sign out').props.onClick());
  await act(async () => { release({ accounts: [a, b], hasMoreAccounts: false }); await work; });
  assert.match(text(), /Email a sign-in code/); assert.equal(tree.root.findAllByType('select').length, 0);
  assert.doesNotMatch(text(), /Provider A service visit|Provider B service visit|INV-A|INV-B/);
});

test('requesting a new OTP clears the prior code/challenge and binds verification to the fresh challenge', async () => {
  user = null; await mount();
  await act(async () => tree.root.findByProps({ type: 'email' }).props.onChange({ target: { value: 'customer@example.invalid' } }));
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  await act(async () => tree.root.findByProps({ autoComplete: 'one-time-code' }).props.onChange({ target: { value: '111222' } }));
  await act(async () => button('Request a new code or change email').props.onClick());
  assert.equal(tree.root.findAllByProps({ autoComplete: 'one-time-code' }).length, 0); assert.equal(tree.root.findByProps({ type: 'email' }).props.disabled, false);
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(tree.root.findByProps({ autoComplete: 'one-time-code' }).props.value, '');
  await act(async () => tree.root.findByProps({ autoComplete: 'one-time-code' }).props.onChange({ target: { value: '333444' } }));
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  const verification = calls.find(row => row.name === 'rlVerifyCustomerOTP');
  assert.equal(verification.data.challengeId, 'synthetic-challenge-2'); assert.equal(verification.client, client);
});

test('invalid or expired OTP is visible and clears the entered code without losing the request-new-code action', async () => {
  user = null; await mount();
  await act(async () => tree.root.findByProps({ type: 'email' }).props.onChange({ target: { value: 'customer@example.invalid' } }));
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  await act(async () => tree.root.findByProps({ autoComplete: 'one-time-code' }).props.onChange({ target: { value: '111222' } }));
  otpError = Error('Code is invalid or expired. Request a new code.');
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.match(text(), /Code is invalid or expired/); assert.equal(tree.root.findByProps({ autoComplete: 'one-time-code' }).props.value, '');
  assert.ok(button('Request a new code or change email'));
});

test('shared files send the exact association/kind/file scope and PDFs are downloads rather than embedded pages', async () => {
  await mount(); await act(async () => button('Open document').props.onClick());
  const request = calls.find(row => row.name === 'rlGetCustomerPortalFile');
  assert.deepEqual(request.data, { accountId: a.id, kind: 'document', fileId: 'document-a' }); assert.equal(request.client, client);
  const download = tree.root.findAllByType('a').find(node => node.props.download);
  assert.equal(download.props.download, 'Service report.pdf'); assert.match(download.props.href, /^data:application\/pdf;base64,/);
  assert.equal(tree.root.findAllByType('iframe').length, 0); assert.equal(tree.root.findAllByType('object').length, 0);
  await act(async () => button('Close file').props.onClick()); fileError = Error('This service file is no longer available.');
  await act(async () => button('View photo').props.onClick());
  assert.match(text(), /This service file is no longer available/); assert.ok(button('Retry file'));
});

test('payment history is lazy per opened invoice and uses the isolated portal Functions client', async () => {
  accounts = [{ ...a, invoices: Array.from({ length: 50 }, (_, index) => ({ ...a.invoices[0], id: 'invoice-' + index, invoiceNumber: 'INV-' + index })) }];
  await mount(); assert.equal(calls.filter(row => row.name === 'rlGetInvoicePaymentHistory').length, 0);
  await expandInvoice(0);
  let history = calls.filter(row => row.name === 'rlGetInvoicePaymentHistory'); assert.equal(history.length, 1); assert.deepEqual(history[0].data, { invoiceId: 'invoice-0' }); assert.equal(history[0].client, client);
  await expandInvoice(1); history = calls.filter(row => row.name === 'rlGetInvoicePaymentHistory'); assert.equal(history.length, 2);
  assert.equal(tree.root.findAllByProps({ 'aria-label': 'Payment history' }).length, 1);
});

test('empty and load-failure states expose a useful recovery action without stale records', async () => {
  accounts = []; await mount(); assert.match(text(), /No providers are connected yet/);
  accounts = [a]; portalError = Error('Your customer association is no longer available.');
  await act(async () => button('Refresh visits and invoices').props.onClick());
  assert.match(text(), /Your customer association is no longer available/); assert.doesNotMatch(text(), /Provider A service visit/);
  portalError = null; await act(async () => button('Refresh visits and invoices').props.onClick()); assert.match(text(), /Provider A service visit/);
});

test('property selection filters visits within the selected provider and connecting uses the isolated portal client', async () => {
  accounts = [{ ...a, properties: [
    { customerId: 'customer-a', id: 'home', label: 'Home', address: '100 Example Lane' },
    { customerId: 'customer-a', id: 'rental', label: 'Rental', address: '200 Example Lane' },
  ], jobs: [
    { ...a.jobs[0], propertyKey: 'customer-a:home' },
    { id: 'visit-rental', serviceType: 'Rental inspection', date: '2026-11-15', time: '10:00', status: 'scheduled', propertyKey: 'customer-a:rental' },
  ] }, b];
  await mount();
  await act(async () => tree.root.findByProps({ 'aria-label': 'Service property' }).props.onChange({ target: { value: 'customer-a:rental' } }));
  assert.match(text(), /Rental inspection/); assert.doesNotMatch(text(), /Provider A service visit|Provider B service visit/);
  assert.equal(button('View photo'), undefined);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Service property' }).props.onChange({ target: { value: '' } })); assert.match(text(), /Provider A service visit/);
  assert.ok(button('View photo'));
  assert.equal(tree.root.findAllByProps({ placeholder: 'Paste your invitation link' }).length, 0);
  await act(async () => button('Connect provider').props.onClick());
  const input = tree.root.findByProps({ placeholder: 'Paste your invitation link' });
  await act(async () => input.props.onChange({ target: { value: `https://route-logistics.com/portal#link=${'a'.repeat(64)}` } }));
  await act(async () => button('Connect provider').props.onClick());
  assert.equal(calls.find(row => row.name === 'rlClaimPortalLink')?.client, client);
  assert.deepEqual(calls.find(row => row.name === 'rlClaimPortalLink')?.data, { token: 'a'.repeat(64) });
});
