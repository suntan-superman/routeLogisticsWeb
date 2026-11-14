const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json'));
const web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, authorized = true, user = { uid: 'platform-user', email: 'admin@example.invalid', emailVerified: true }, calls = [], dirty = false, discard = true, toasts = [], saveFailure = null, pendingSave = null, verificationEmails = 0, publicError = null, params = {}, publicItems = [], records = new Map();
const modules = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '../routeLogisticsWeb/src', relative);
  if (modules.has(file)) return modules.get(file);
  const module = { exports: {} };
  const mock = name => {
    if (name === 'react') return React;
    if (name === 'react-router-dom') return { Link: ({ children, to, ...props }) => React.createElement('a', { ...props, href: to }, children), useParams: () => params };
    if (name === 'react-helmet-async') return { Helmet: props => React.createElement(React.Fragment, null, props.children) };
    if (name === 'react-hot-toast') return { __esModule: true, default: { success: message => toasts.push({ type: 'success', message }), error: message => toasts.push({ type: 'error', message }) } };
    if (name === 'firebase/auth') return { sendEmailVerification: async current => { assert.equal(current.uid, user.uid); verificationEmails++; } };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ currentUser: user, loading: false, role: 'owner', company: { ownerId: user?.uid }, refreshSession: async () => {} }) };
    if (name.endsWith('/services/firebase')) return { auth: { get currentUser() { return user; } } };
    if (name.endsWith('/useUnsavedChanges')) return { useUnsavedChanges: value => { dirty = value; return { confirmDiscard: async () => discard }; } };
    if (name.endsWith('/workspaceApi')) return { callWorkspace: async (name, data) => {
      calls.push({ name, data });
      if (name === 'rlReadPublicContent') { if (publicError) throw publicError; return data.action === 'get' ? { item: publicItems.find(item => item.slug === data.slug) || null } : { items: publicItems }; }
      if (name === 'rlPlatformContentImage') return { image: { id: data.imageId || 'private-image', contentType: 'image/png', data: 'cHJpdmF0ZQ==', alt: 'An approved image' } };
      if (data.action === 'status') { if (!authorized) throw Object.assign(Error('Platform access denied.'), { code: 'functions/permission-denied' }); return { authorized: true, role: 'admin' }; }
      if (data.action === 'dashboard') return { counts: { faq: { draft: records.size, published: 0, archived: 0 } }, recentAudit: [] };
      if (data.action === 'list') return { items: [...records.values()].filter(item => item.type === data.type && (!data.status || item.status === data.status)) };
      if (data.action === 'get') return { item: records.get(data.id) };
      if (data.action === 'history') return { items: [{ id: 'audit', action: 'saved', revision: 1, createdAt: '2026-11-14T18:00:00Z' }] };
      if (data.action === 'save') {
        if (pendingSave) await pendingSave;
        if (saveFailure) throw saveFailure;
        const item = { ...data.content, id: data.content.id || 'saved-item', revision: data.expectedRevision + 1, updatedAt: '2026-11-14T18:00:00Z' };
        records.set(item.id, item); return { item };
      }
      throw Error('Unexpected CMS action.');
    } };
    if (name.startsWith('.')) {
      const resolved = path.resolve(path.dirname(file), name);
      return load(path.relative(path.resolve(__dirname, '../routeLogisticsWeb/src'), path.extname(resolved) ? resolved : fs.existsSync(resolved + '.jsx') ? resolved + '.jsx' : resolved + '.js'));
    }
    throw Error('Unexpected dependency: ' + name);
  };
  const { code } = transformSync(fs.readFileSync(file, 'utf8'), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs' });
  new Function('React', 'require', 'module', 'exports', code)(React, mock, module, module.exports);
  modules.set(file, module.exports); return module.exports;
}
const Admin = load('pages/PlatformAdminPage.jsx').default, Public = load('pages/PublicContentPage.jsx').default, { PlatformContentArticle } = load('components/PlatformContentView.jsx');
const text = () => JSON.stringify(tree.toJSON());
const button = label => tree.root.findAll(node => node.type === 'button' && node.children.join('') === label)[0];
const input = label => tree.root.findAllByType('label').find(node => node.children[0] === label).findAll(node => ['input', 'textarea', 'select'].includes(node.type))[0];
const mountAdmin = async () => { await act(async () => { tree = create(React.createElement(Admin)); }); };
const faq = overrides => ({ id: 'faq-one', type: 'faq', status: 'draft', title: 'A synthetic acceptance question', slug: 'acceptance-question', body: 'Synthetic draft content used only by this local test.', revision: 2, ...overrides });
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null; authorized = true; user = { uid: 'platform-user', email: 'admin@example.invalid', emailVerified: true }; calls = []; dirty = false; discard = true; toasts = []; saveFailure = null; pendingSave = null; verificationEmails = 0; publicError = null; params = {}; publicItems = []; records = new Map();
});

test('company ownership never bypasses denied platform authorization', async () => {
  authorized = false; await mountAdmin();
  assert.match(text(), /Platform access required/); assert.match(text(), /Company ownership and team roles do not grant/);
  assert.equal(calls.some(call => ['list', 'dashboard', 'save'].includes(call.data.action)), false);
  assert.equal(tree.root.findAllByType('form').length, 0);
});

test('unverified accounts cannot request platform content and verification email is sent only on an explicit click', async () => {
  user.emailVerified = false; await mountAdmin();
  assert.match(text(), /Verify your email first/); assert.equal(calls.length, 0); assert.equal(verificationEmails, 0);
  await act(async () => button('Send verification email').props.onClick());
  assert.equal(verificationEmails, 1); assert.match(text(), /Verification email sent/); assert.equal(calls.length, 0);
});

test('saving requires a changed draft, sends its expected revision and shows success without leaving dirty state', async () => {
  records.set('faq-one', faq()); await mountAdmin();
  await act(async () => tree.root.findAll(node => node.type === 'button' && node.children.some(child => typeof child === 'object' && child?.props?.children === 'A synthetic acceptance question'))[0].props.onClick());
  assert.equal(button('Save content').props.disabled, true);
  await act(async () => tree.root.findByProps({ 'aria-label': 'Content title' }).props.onChange({ target: { value: 'Updated synthetic question' } }));
  assert.equal(dirty, true); assert.equal(button('Save content').props.disabled, false);
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  const save = calls.find(call => call.data.action === 'save');
  assert.equal(save.data.expectedRevision, 2); assert.equal(save.data.content.title, 'Updated synthetic question');
  assert.equal(dirty, false); assert.equal(button('Save content').props.disabled, true); assert.equal(toasts.at(-1).type, 'success');
});

test('a save failure preserves edits and permits retry instead of reporting a silent success', async () => {
  await mountAdmin();
  await act(async () => input('Question').props.onChange({ target: { value: 'A draft question' } }));
  await act(async () => button('Use title for slug').props.onClick());
  await act(async () => input('Answer').props.onChange({ target: { value: 'A local draft answer.' } }));
  saveFailure = Error('The draft changed on the server. Reload its current revision.');
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.equal(dirty, true); assert.equal(input('Question').props.value, 'A draft question'); assert.equal(toasts.at(-1).type, 'error');
  assert.match(text(), /Reload its current revision/); assert.equal(button('Save content').props.disabled, false);
});

test('switching content types asks to discard dirty content and cannot publish testimonials without authenticity evidence', async () => {
  await mountAdmin(); await act(async () => input('Question').props.onChange({ target: { value: 'Unsaved question' } }));
  discard = false; await act(async () => button('Testimonials').props.onClick());
  assert.equal(input('Question').props.value, 'Unsaved question');
  discard = true; await act(async () => button('Testimonials').props.onClick());
  await act(async () => input('Title').props.onChange({ target: { value: 'A local testimonial draft' } }));
  await act(async () => button('Use title for slug').props.onClick());
  await act(async () => input('Customer quotation').props.onChange({ target: { value: 'Synthetic test quotation that is never published.' } }));
  await act(async () => input('Publication status').props.onChange({ target: { value: 'published' } }));
  assert.equal(button('Save content').props.disabled, true); assert.match(text(), /Publishing requires authenticity confirmation/);
  assert.equal(calls.some(call => call.data.action === 'save'), false);
});

test('private preview is noindex, escapes content and does not publish or call the save endpoint', async () => {
  await mountAdmin(); await act(async () => input('Question').props.onChange({ target: { value: '<script>untrusted</script>' } }));
  await act(async () => button('Preview content').props.onClick());
  assert.equal(tree.root.findByProps({ name: 'robots' }).props.content, 'noindex,nofollow');
  assert.equal(tree.root.findAllByType('script').length, 0); assert.match(text(), /Private preview/);
  assert.equal(calls.some(call => call.data.action === 'save'), false);
});

test('a late save response cannot expose private editor data after the signed-in identity changes', async () => {
  await mountAdmin(); await act(async () => input('Question').props.onChange({ target: { value: 'Pending draft' } }));
  await act(async () => button('Use title for slug').props.onClick()); await act(async () => input('Answer').props.onChange({ target: { value: 'Pending draft answer.' } }));
  let release; pendingSave = new Promise(resolve => { release = resolve; }); let work;
  await act(async () => { work = tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  user = { uid: 'ordinary-owner', email: 'owner@example.invalid', emailVerified: true }; authorized = false;
  await act(async () => tree.update(React.createElement(Admin)));
  await act(async () => { release(); await work; });
  assert.equal(tree.root.findAllByType('form').length, 0); assert.match(text(), /Platform access required/); assert.equal(toasts.length, 0);
});

test('public empty states are honest and do not invent testimonials or success metrics', async () => {
  await act(async () => { tree = create(React.createElement(Public, { type: 'testimonial' })); });
  assert.match(text(), /No customer testimonials have been published yet/);
  assert.equal(tree.root.findAllByType('blockquote').length, 0);
  assert.equal(calls[0].name, 'rlReadPublicContent'); assert.equal(calls[0].data.type, 'testimonial');
});

test('published detail metadata uses editable fields and a missing page is noindex', async () => {
  params = { slug: 'published-question' }; publicItems = [faq({ slug: params.slug, status: 'published', seo: { title: 'Published search title', description: 'An approved description.', canonicalUrl: 'https://route-logistics.com/faqs/published-question', ogTitle: 'Shared title', ogDescription: 'Shared description.' } })];
  await act(async () => { tree = create(React.createElement(Public, { type: 'faq' })); });
  assert.equal(tree.root.findByType('title').children.join(''), 'Published search title');
  assert.equal(tree.root.findByProps({ name: 'description' }).props.content, 'An approved description.');
  assert.equal(tree.root.findByProps({ property: 'og:title' }).props.content, 'Shared title');
  assert.equal(tree.root.findByProps({ rel: 'canonical' }).props.href, 'https://route-logistics.com/faqs/published-question');
  await act(async () => tree.unmount()); tree = null; publicError = Object.assign(Error('Not found'), { code: 'functions/not-found' });
  await act(async () => { tree = create(React.createElement(Public, { type: 'faq' })); });
  assert.equal(tree.root.findByProps({ name: 'robots' }).props.content, 'noindex,follow'); assert.match(text(), /This page is not available/);
});

test('public article text cannot inject executable HTML or attributes', async () => {
  await act(async () => { tree = create(React.createElement(PlatformContentArticle, { item: faq({ body: '<img src=x onerror=alert(1)>\n\n<script>unsafe</script>' }) })); });
  assert.equal(tree.root.findAllByType('script').length, 0); assert.equal(tree.root.findAllByType('img').length, 0);
  assert.match(text(), /onerror=alert/); assert.equal(tree.root.findAll(node => node.props.dangerouslySetInnerHTML).length, 0);
});
