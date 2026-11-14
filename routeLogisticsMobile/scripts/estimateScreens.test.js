const { test } = require('node:test');
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), babel = require('@babel/core');
const React = require('react'), { create, act } = require('react-test-renderer');
const helpers = require('../../functions/shared/estimateClient');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..'), web = path.resolve(root, '../routeLogisticsWeb'), token = 'a'.repeat(64);
const policy = require('../../functions/shared/capabilities.json');
function fixture(role = 'manager') {
  const modules = new Map(), calls = [], operations = new Map(), listeners = new Set(); let sequence = 0;
  const env = { calls, record: null, photos: [], delivery: null, cancelled: false, uploadFailure: false, ambiguousSave: false, compressionFailure: false, interactions: 0, converted: 0, approvalGets: [], approvals: 0, changes: [], urls: [], revoked: [], role, customers: [{ id: 'customer', name: 'Existing customer', email: 'prospect@example.com' }] };
  env.user = { id: 'manager', companyId: 'acme', membershipId: 'member', role, companyName: 'Acme', services: ['Pest Control'] };
  const can = capability => policy.roles[env.role]?.includes(capability);
  env.auth = () => ({ user: env.user, can, permissions: { can, canManage: can('jobs.schedule') }, accessStatus: 'ready', currentUser: { uid: env.user.id }, company: { id: env.user.companyId }, role: env.role });
  env.window = { location: { hash: `#id=estimate&token=${token}`, pathname: '/estimate-approval', href: 'https://route-logistics.com/estimate-approval' }, history: { replaceState: () => { env.window.location.hash = ''; } }, addEventListener: (_name, listener) => listeners.add(listener), removeEventListener: (_name, listener) => listeners.delete(listener), confirm: () => false };
  env.document = { addEventListener: (_name, listener) => listeners.add(listener), removeEventListener: (_name, listener) => listeners.delete(listener) };
  env.url = { createObjectURL: () => { const value = `blob:photo-${sequence++}`; env.urls.push(value); return value; }, revokeObjectURL: value => env.revoked.push(value) };
  const palette = { text: '#fff', secondary: '#bdd', danger: '#faa', border: '#375', accent: '#6eb' };
  async function callEstimate(action, fields = {}) {
    calls.push({ action, ...fields });
    if (action === 'list') return { estimates: env.record ? [env.record] : [], enabled: true, emailEnabled: true };
    if (action === 'get') return { estimate: env.record, versions: env.record ? [{ version: env.record.version, status: env.record.status, totalCents: env.record.totalCents }] : [], photos: env.photos, emailEnabled: true, delivery: env.delivery };
    if (action === 'save') {
      if (operations.has(fields.operationId)) return operations.get(fields.operationId);
      const result = { estimate: { ...fields.data, id: fields.estimateId || 'estimate', version: (env.record?.version || 0) + 1, status: 'draft', recipient: fields.data.prospect || { name: 'Existing customer', email: 'prospect@example.com' }, totalCents: 10023, subtotalCents: 9900, taxCents: 123, photoIds: fields.data.photoIds || [] } };
      env.record = result.estimate; operations.set(fields.operationId, result);
      if (env.ambiguousSave) { env.ambiguousSave = false; throw new Error('Network response was lost. Retry saved request.'); }
      return result;
    }
    if (action === 'photo-upload') { if (env.uploadFailure) throw new Error('Photo upload failed. Retry while connected.'); return { id: `photo-${fields.operationId}` }; }
    if (action === 'photo-read') return { dataUri: 'data:image/jpeg;base64,AAAA' };
    if (action === 'deliver') { env.delivery = { status: 'queued', attempts: 0 }; env.record = { ...env.record, status: 'sent' }; return { queued: true }; }
    if (action === 'convert') { env.converted++; env.record = { ...env.record, status: 'converted', convertedJobId: 'converted-job' }; return { jobId: 'converted-job', existing: false }; }
    return {};
  }
  function load(file) {
    const filename = path.isAbsolute(file) ? file : path.resolve(root, file); if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const mockRequire = name => {
      if (name === 'react') return React;
      if (name.startsWith('@babel/runtime/')) return require(name);
      if (name === 'react-native') return { View: 'View', Text: 'Text', Image: 'Image', ScrollView: 'ScrollView', Pressable: 'Pressable' };
      if (name === 'expo-crypto') return { randomUUID: () => `11111111-1111-4111-8111-${String(++sequence).padStart(12, '0')}` };
      if (name === 'expo-image-picker') return { UIImagePickerPresentationStyle: { FULL_SCREEN: 'full-screen' }, requestCameraPermissionsAsync: async () => ({ granted: true }), launchCameraAsync: async () => ({ canceled: env.cancelled, assets: [{ uri: 'file:///selected.jpg', width: 1600, height: 1200 }] }), launchImageLibraryAsync: async () => ({ canceled: env.cancelled, assets: [{ uri: 'file:///selected.jpg', width: 1600, height: 1200 }] }) };
      if (name.endsWith('/AuthContext')) return { useAuth: env.auth };
      if (name.endsWith('/ThemeProvider')) return { useTheme: () => ({ palette }) };
      if (name.endsWith('/components/MobileUI')) return { ScreenHeader: ({ title, onBack }) => React.createElement('View', null, React.createElement('Text', null, title), onBack && React.createElement('Pressable', { accessibilityLabel: 'Back', onPress: onBack })) };
      if (name.endsWith('/components/Glass')) return { GlassCard: ({ children }) => React.createElement('View', null, children), GlassButton: ({ title, onPress, disabled, busy }) => React.createElement('Pressable', { accessibilityLabel: title, disabled: disabled || busy, onPress }, React.createElement('Text', null, title)), GlassInput: ({ label, ...props }) => React.createElement('TextInput', { accessibilityLabel: label, ...props }) };
      if (name.endsWith('/nativeInteraction')) return { beginNativeInteraction: () => { env.interactions++; return () => env.interactions--; } };
      if (name.endsWith('/services/firebase')) return { CustomerService: { getCustomers: async () => ({ success: true, customers: env.customers }) } };
      if (name.endsWith('/customerService')) return { getCustomers: async () => ({ success: true, customers: env.customers, hasMore: false }) };
      if (name.endsWith('/estimateService')) return { callEstimate, prepareEstimatePhoto: async () => { if (env.compressionFailure) throw new Error('Photo preparation failed. Selection retained.'); return { base64: 'AAAA', uri: 'file:///compressed.jpg', dataUri: 'data:image/jpeg;base64,AAAA' }; }, shareEstimatePdf: async () => {}, downloadEstimatePdf: async () => {}, callEstimateApproval: async values => { if (values.action === 'get') { env.approvalGets.push(values); return { estimate: env.record || savedEstimate('sent'), photos: [], branding: { name: 'Acme' } }; } env.approvals++; return { approved: true }; } };
      if (name.includes('functions/shared/estimateClient')) return helpers;
      if (name.startsWith('.')) { const next = path.resolve(path.dirname(filename), name); return load(path.extname(next) ? next : fs.existsSync(`${next}.jsx`) ? `${next}.jsx` : `${next}.js`); }
      throw new Error(`Unexpected dependency ${name}`);
    };
    const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] });
    new Function('require', 'module', 'exports', 'window', 'document', 'crypto', 'URL', result.code)(mockRequire, module, module.exports, env.window, env.document, { randomUUID: () => `11111111-1111-4111-8111-${String(++sequence).padStart(12, '0')}` }, env.url); return module.exports;
  }
  env.load = load; return env;
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const savedEstimate = status => ({ id: 'estimate', version: 2, status, title: 'Pest work', serviceType: 'Pest Control', scopeOfWork: 'Treat the property', recipient: { name: 'Prospect', email: 'prospect@example.com', phone: '5550100', address: '1 Work Street' }, lineItems: [{ kind: 'labor', description: 'Labor', quantity: 2, unitPrice: 50 }], taxRate: 0, totalCents: 10023, subtotalCents: 10000, taxCents: 23, photoIds: [] });
const json = tree => JSON.stringify(tree.toJSON());
const nativeButton = (tree, label) => tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
async function press(tree, label) { const value = nativeButton(tree, label); assert.ok(value, label); assert.notEqual(value.props.disabled, true); await act(async () => value.props.onPress()); await act(settle); }
async function renderNative(env) { let tree; await act(async () => { tree = create(React.createElement(env.load('screens/EstimatesScreen.js').default, { onInteractionChange: value => env.changes.push(value) })); }); await act(settle); return tree; }
async function fill(tree, label, value) { const field = tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === label)[0]; assert.ok(field, label); await act(async () => field.props.onChangeText(value)); }
async function fillDraft(tree) { for (const [label, value] of [['Prospect name', 'Prospect'], ['Prospect email', 'prospect@example.com'], ['Estimate title', 'Pest work'], ['Service type', 'Pest Control'], ['Scope of work', 'Treat the property'], ['Description 1', 'Labor'], ['Quantity 1', '2'], ['Unit price ($) 1', '50']]) await fill(tree, label, value); }

test('draft helpers preserve canonical prospect recipients and never submit client totals or tenancy', () => {
  const draft = helpers.draftFromEstimate(savedEstimate('draft')); assert.equal(draft.prospect.email, 'prospect@example.com'); const payload = helpers.estimateInput(draft); assert.equal(payload.prospect.name, 'Prospect'); assert.equal(payload.totalCents, undefined); assert.equal(payload.companyId, undefined); assert.equal(payload.lineItems[0].unitPrice, 50);
  assert.throws(() => helpers.estimateInput({ ...draft, lineItems: [{ kind: 'labor', description: 'Work', quantity: '1', unitPrice: '1.999' }] })); assert.throws(() => helpers.conversionInput({ date: '2026-02-30', time: '09:00' }));
  assert.deepEqual(helpers.conversionInput({ date: '2026-11-20', time: '09:00' }, { createCustomer: true }), { schedule: { date: '2026-11-20', time: '09:00' }, createCustomer: true });
});
test('technicians see no estimate financial controls and make no estimate API calls', async () => {
  const env = fixture('technician'), tree = await renderNative(env); assert.match(json(tree), /not available for your role/); assert.equal(env.calls.length, 0); assert.doesNotMatch(json(tree), /Unit price|Save estimate/); await act(async () => tree.unmount());
});
test('photo-first native draft uploads and attaches photos to a server-priced version without modal layering', async () => {
  const env = fixture(), tree = await renderNative(env); await press(tree, 'New photo estimate'); await press(tree, 'Choose estimate photo'); await fillDraft(tree); await press(tree, 'Save estimate version');
  assert.equal(env.calls.filter(call => call.action === 'save').length, 2); assert.equal(env.calls.filter(call => call.action === 'photo-upload').length, 1); assert.equal(env.record.photoIds.length, 1); assert.match(json(tree), /100\.23/); assert.match(json(tree), /Attached to saved version/); assert.equal(tree.root.findAll(node => node.type === 'Modal').length, 0); assert.equal(env.interactions, 0); assert.equal(env.changes.at(-1).hasDraft, false); await act(async () => tree.unmount());
});
test('native picker cancellation retains the estimate context and a subsequent photo selection works', async () => {
  const env = fixture(), tree = await renderNative(env); await press(tree, 'New photo estimate'); await fill(tree, 'Estimate title', 'Retained title'); env.cancelled = true; await press(tree, 'Choose estimate photo');
  assert.match(json(tree), /selection cancelled/); assert.equal(tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Estimate title')[0].props.value, 'Retained title'); assert.equal(env.interactions, 0);
  env.cancelled = false; await press(tree, 'Choose estimate photo'); assert.match(json(tree), /file:\/\/\/selected.jpg/); assert.equal(env.interactions, 0); await act(async () => tree.unmount());
});
test('upload failure retains the selected URI and retries the same photo operation', async () => {
  const env = fixture(), tree = await renderNative(env); await press(tree, 'New photo estimate'); await press(tree, 'Take estimate photo'); await fillDraft(tree); env.uploadFailure = true; await press(tree, 'Save estimate version');
  assert.match(json(tree), /upload failed/); assert.match(json(tree), /file:\/\/\/selected.jpg/); assert.equal(env.changes.at(-1).hasDraft, true);
  env.uploadFailure = false; await press(tree, 'Save estimate version'); const uploads = env.calls.filter(call => call.action === 'photo-upload'); assert.equal(uploads[0].operationId, uploads[1].operationId); assert.equal(env.record.version, 2); await act(async () => tree.unmount());
});
test('uncertain save retries its original operation instead of creating another estimate version', async () => {
  const env = fixture(), tree = await renderNative(env); await press(tree, 'New photo estimate'); await fillDraft(tree); env.ambiguousSave = true; await press(tree, 'Save estimate version'); assert.match(json(tree), /Retry saved request/);
  await press(tree, 'Retry saved request'); const saves = env.calls.filter(call => call.action === 'save'); assert.equal(saves[0].operationId, saves[1].operationId); assert.equal(env.record.version, 1); await act(async () => tree.unmount());
});
test('approved prospect conversion requires explicit customer creation and preserves approved content', async () => {
  const env = fixture(); env.record = savedEstimate('approved'); const tree = await renderNative(env); await press(tree, 'Open estimate'); assert.equal(tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Estimate title')[0].props.editable, false);
  const createCustomer = tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Create customer from approved prospect')[0]; await act(async () => createCustomer.props.onPress()); await fill(tree, 'Job service date (YYYY-MM-DD)', '2026-11-20'); await press(tree, 'Convert approved estimate to job'); assert.equal(env.converted, 0); await press(tree, 'Confirm job conversion');
  const conversion = env.calls.find(call => call.action === 'convert'); assert.equal(conversion.createCustomer, true); assert.equal(conversion.expectedVersion, 2); assert.equal(env.calls.filter(call => call.action === 'save').length, 0); assert.match(json(tree), /converted-job/); await act(async () => tree.unmount());
});
test('actual email failure is visible separately from the sent estimate status and sending requires confirmation', async () => {
  const env = fixture(); env.record = savedEstimate('sent'); env.delivery = { status: 'failed', attempts: 2, failureCode: 'SMTP_REJECTED', sentAt: null }; const tree = await renderNative(env); await press(tree, 'Open estimate'); assert.match(json(tree), /SMTP_REJECTED/); assert.match(json(tree), /2 attempts/); await press(tree, 'Email estimate for approval'); assert.equal(env.calls.filter(call => call.action === 'deliver').length, 0);
  const confirm = nativeButton(tree, 'Confirm estimate email'); await act(async () => Promise.all([confirm.props.onPress(), confirm.props.onPress()])); await act(settle); assert.equal(env.calls.filter(call => call.action === 'deliver').length, 1); assert.match(json(tree), /Queued/); await act(async () => tree.unmount());
});
test('public approval survives StrictMode effect replay while stripping token fragments and records one explicit approval', async () => {
  const env = fixture(), Component = env.load(path.join(web, 'src/pages/EstimateApprovalPage.jsx')).default; let tree;
  await act(async () => { tree = create(React.createElement(React.StrictMode, null, React.createElement(Component))); }); await act(settle); assert.ok(env.approvalGets.length >= 1); assert.ok(env.approvalGets.every(call => call.token === token)); assert.equal(env.window.location.hash, ''); assert.doesNotMatch(json(tree), /complete estimate approval link|aaaaaa/);
  const input = tree.root.findAllByType('input').find(node => node.props.maxLength === 100); assert.ok(input);
  await act(async () => input.props.onChange({ target: { value: 'Prospect Owner' } })); const checkbox = tree.root.findAllByType('input').find(node => node.props.type === 'checkbox'); await act(async () => checkbox.props.onChange({ target: { checked: true } })); const form = tree.root.findByType('form'); await act(async () => Promise.all([form.props.onSubmit({ preventDefault() {} }), form.props.onSubmit({ preventDefault() {} })])); assert.equal(env.approvals, 1); assert.match(json(tree), /approval is recorded/); await act(async () => tree.unmount());
});
test('a converted public estimate shows recorded approval instead of asking the customer to approve again', async () => {
  const env = fixture(); env.record = { ...savedEstimate('converted'), convertedJobId: 'job' }; let tree; await act(async () => { tree = create(React.createElement(env.load(path.join(web, 'src/pages/EstimateApprovalPage.jsx')).default)); }); await act(settle); assert.equal(tree.root.findAllByType('form').length, 0); assert.match(json(tree), /approval is recorded/); await act(async () => tree.unmount());
});
test('web management retains a selected photo through preparation failure and retries without sending an email', async () => {
  const env = fixture(), Component = env.load(path.join(web, 'src/pages/EstimatesPage.jsx')).default; let tree;
  const button = title => tree.root.findAll(node => node.type === 'button' && node.children.filter(child => typeof child === 'string').join('') === title)[0];
  const click = async title => { const action = button(title); assert.ok(action, title); await act(async () => action.props.onClick()); await act(settle); };
  const field = async (label, value) => { const wrapper = tree.root.findAll(node => node.type === 'label' && node.children.filter(child => typeof child === 'string').join('') === label)[0]; assert.ok(wrapper, label); const input = wrapper.findAll(node => ['input', 'textarea'].includes(node.type))[0]; await act(async () => input.props.onChange({ target: { value } })); };
  await act(async () => { tree = create(React.createElement(Component)); }); await act(settle); await click('New photo estimate');
  const picker = tree.root.findAll(node => node.type === 'input' && node.props.type === 'file' && node.props.multiple)[0]; await act(async () => picker.props.onChange({ target: { files: [{ name: 'work.jpg', type: 'image/jpeg', size: 1000 }], value: 'selected' } })); await act(settle);
  assert.match(json(tree), /blob:photo/);
  for (const [label, value] of [['Prospect name', 'Prospect'], ['Prospect email', 'prospect@example.com'], ['Estimate title', 'Photo estimate'], ['Service type', 'Pest Control'], ['Scope of work', 'Requested work'], ['Description', 'Labor'], ['Quantity', '2'], ['Unit price ($)', '50']]) await field(label, value);
  env.compressionFailure = true; await click('Save estimate version'); assert.match(json(tree), /preparation failed/); assert.match(json(tree), /blob:photo/); assert.equal(env.calls.filter(call => call.action === 'photo-upload').length, 0);
  env.compressionFailure = false; await click('Save estimate version'); assert.equal(env.record.photoIds.length, 1); assert.match(json(tree), /Server total/); assert.match(json(tree), /100\.23/); assert.equal(env.calls.filter(call => call.action === 'deliver').length, 0);
  await act(async () => tree.unmount()); assert.equal(env.revoked.length, 1);
});
test('invalid public approval fragments never call the approval backend', async () => {
  const env = fixture(); env.window.location.hash = '#id=foreign/job&token=bad'; let tree;
  await act(async () => { tree = create(React.createElement(env.load(path.join(web, 'src/pages/EstimateApprovalPage.jsx')).default)); }); await act(settle);
  assert.equal(env.approvalGets.length, 0); assert.match(json(tree), /complete estimate approval link/); await act(async () => tree.unmount());
});
