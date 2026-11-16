const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
const { createWorkspaceQueryMock, selectControlMock } = require('./support/workspaceQueryMock.cjs');
const queryMock = createWorkspaceQueryMock(React, { scopeId: () => `${env.companyId}:${env.role}` });
const principalMock = require('./support/principalQueryMock.cjs').createPrincipalQueryMock(React);
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, env;
const clone = value => JSON.parse(JSON.stringify(value));
const review = () => ({ id: 'review-one', jobId: 'completed-job', serviceType: 'Inspection', serviceDate: '2026-11-14', rating: 2, comment: 'An honest concern', onTime: false, publicConsent: false, publicEligible: false, moderationStatus: 'unreviewed', verifiedService: true, createdAt: '2026-11-14T18:00:00Z', internalNotes: [], moderationHistory: [] });
const settings = () => ({ settings: { revision: 1, enabled: false, emailEnabled: true, smsEnabled: false, delayMinutes: 60, reminderEnabled: false, reminderDelayMinutes: 2880, expiresDays: 14 }, delivery: { enabled: false }, history: [] });
function reset() {
  env = { calls: [], toasts: [], role: 'owner', companyId: 'company-one', allowDiscard: true, confirms: 0, dirty: new Map(), review: review(), eligible: [{ jobId: 'completed-job', serviceType: 'Inspection', date: '2026-11-14' }], customerRows: [], settings: settings(), fail: null, pending: null, fragmentsRemoved: 0 };
  global.window = { location: { hash: '#id=invitation-one&token=' + 'a'.repeat(64), pathname: '/review' }, history: { state: null, replaceState: () => { env.fragmentsRemoved++; } } };
}
async function customer(action, data) {
  env.calls.push({ name: 'customer', action, data: clone(data) });
  if (env.pending && action === 'list') return env.pending;
  if (env.fail === action) throw Error('Controlled ' + action + ' failure. Please retry.');
  if (action === 'list') return env.customerPages ? clone(env.customerPages[data.reviewCursor || 'first']) : { eligibleVisits: clone(env.eligible), reviews: clone(env.customerRows), hasMore: false };
  if (action === 'submit') { env.review = { ...env.review, ...data }; env.customerRows = [env.review]; env.eligible = []; return { review: clone(env.review), existing: false }; }
  if (action === 'consent') { env.review.publicConsent = data.publicConsent; env.customerRows = env.customerRows.map(row => row.id === env.review.id ? clone(env.review) : row); if (env.customerPages) for (const page of Object.values(env.customerPages)) page.reviews = page.reviews.map(row => row.id === env.review.id ? clone(env.review) : row); return { review: clone(env.review) }; }
  throw Error('Unexpected customer action');
}
async function provider(action, data) {
  env.calls.push({ name: 'provider', action, data: clone(data || {}) });
  if (env.providerPending && action === 'list') return env.providerPending;
  if (env.fail === action) throw Object.assign(Error('Controlled ' + action + ' failure. Please retry.'),{code:env.failureCode});
  if (action === 'list' && env.providerPages) return clone(env.providerPages[data.cursor || 'first']);
  if (action === 'list') return { reviews: [clone(env.review)], stats: { count: 1, averageRating: 2 }, serviceTypes: ['Inspection'], hasMore: false };
  if (action === 'history') return { history: [{ id: 'audit-one', action: 'provider.moderate', status: 'approved', reason: 'Authentic negative feedback preserved.', createdAt: '2026-11-14T19:00:00Z' }], hasMore: false };
  if (action === 'respond') env.review.providerResponse = { text: data.response };
  if (action === 'note') env.review.internalNotes.push({ text: data.note, createdAt: '2026-11-14T19:00:00Z' });
  if (action === 'moderate') { env.review.moderationStatus = data.status; env.review.moderationHistory.push({ status: data.status, reason: data.reason, createdAt: '2026-11-14T19:00:00Z' }); }
  return { review: clone(env.review) };
}
const cache = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '../routeLogisticsWeb/src', relative); if (cache.has(file)) return cache.get(file);
  const module = { exports: {} }, mocked = name => {
    if (name === 'react') return React;
    if (name.endsWith('/hooks/useWorkspaceQuery')) return queryMock;
    if (name.endsWith('/hooks/usePrincipalQuery')) return principalMock;
    if (name.endsWith('/services/portal')) return { portalAuth: { currentUser: { uid: 'portal-user' } } };
    if (name.endsWith('/components/SelectControl')) return {__esModule:true,default:selectControlMock(React)};
    if (name === 'react-hot-toast') return { __esModule: true, default: { success: message => env.toasts.push({ kind: 'success', message }), error: message => env.toasts.push({ kind: 'error', message }) } };
    if (name === 'react-router-dom') return { Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children) };
    if (name === 'react-helmet-async') return { Helmet: ({ children }) => React.createElement(React.Fragment, null, children) };
    if (name.endsWith('/contexts/AuthContext')) return { useAuth: () => ({ currentUser: { uid: 'owner' }, role: env.role, company: { id: env.companyId, ownerId: 'owner' }, can: capability => capability === 'reviews.manage' && ['owner', 'manager'].includes(env.role) }) };
    if (name.endsWith('/hooks/useUnsavedChanges')) return { useUnsavedChanges: (dirty, options = {}) => { env.dirty.set(options.scope || 'default', dirty); return { confirmDiscard: async () => { env.confirms++; return env.allowDiscard; } }; }, useConfirmUnsavedChanges: () => async () => { env.confirms++; return env.allowDiscard; } };
    if (name.endsWith('/services/reviews')) return {
      customerReviews: customer, providerReviews: provider,
      reviewInvitationSettings: async (action, data) => { env.calls.push({ name: 'settings', action, data: clone(data) }); if (env.fail === 'settings') throw Error('Controlled settings failure.'); if (action === 'save') env.settings = { ...env.settings, settings: { ...data.settings, revision: 2 } }; return clone(env.settings); },
      reviewCredentials: fragment => { const params = new URLSearchParams(fragment.slice(1)); if (!params.get('id') || !/^[a-f0-9]{64}$/.test(params.get('token') || '')) throw Error('Open the complete review invitation link.'); return { id: params.get('id'), token: params.get('token') }; },
      reviewInvitation: async (action, data) => { env.calls.push({ name: 'invitation', action, data }); if (env.fail === action) throw Error('Invitation expired. Use the customer portal.'); if (action === 'submit') return { review: { ...env.review, ...data } }; return { invitation: { id: 'invitation-one', companyName: 'Synthetic Provider', serviceType: 'Inspection', serviceDate: '2026-11-14', status: 'pending' } }; },
    };
    if (name.startsWith('.')) { const target = path.resolve(path.dirname(file), name), resolved = path.extname(target) ? target : fs.existsSync(target + '.jsx') ? target + '.jsx' : target + '.js'; return load(path.relative(path.resolve(__dirname, '../routeLogisticsWeb/src'), resolved)); }
    throw Error('Unexpected dependency ' + name);
  };
  new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', format: 'cjs' }).code)(React, mocked, module, module.exports); cache.set(file, module.exports); return module.exports;
}
const render = async (relative, props = {}) => { const Page = load(relative).default; await act(async () => { tree = create(React.createElement(Page, props)); }); };
const text = () => JSON.stringify(tree.toJSON());
const button = label => tree.root.findAll(node => node.type === 'button' && node.children.join('') === label)[0];
const field = label => tree.root.findByProps({ 'aria-label': label });
const click = async label => act(async () => button(label).props.onClick());
const star = async number => act(async () => tree.root.findAll(node => node.type === 'input' && node.props.type === 'radio' && node.props.value === number)[0].props.onChange());
const sendForm = async () => act(async () => tree.root.findByProps({ 'aria-label': 'Service feedback form' }).props.onSubmit({ preventDefault() {} }));
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });

test('review form requires a rating and public-display permission starts unchecked', async () => {
  reset(); let received; await render('components/ReviewForm.jsx', { visit: env.eligible[0], onSubmit: async value => { received = value; } });
  assert.equal(button('Submit review').props.disabled, true); assert.equal(tree.root.findByProps({ type: 'checkbox' }).props.checked, false);
  await star(1); await sendForm(); assert.deepEqual(received, { rating: 1, comment: '', onTime: null, publicConsent: false });
});
test('failed review submission retains all answers and reports a retryable error', async () => {
  reset(); let fail = true; await render('components/ReviewForm.jsx', { visit: env.eligible[0], onSubmit: async () => { if (fail) throw Error('Connection failed. Retry.'); } });
  await star(3); await act(async () => field('Review comments').props.onChange({ target: { value: 'Retain this concern' } })); await sendForm();
  assert.match(text(), /Connection failed/); assert.equal(field('Review comments').props.value, 'Retain this concern'); assert.equal(button('Submit review').props.disabled, false); fail = false; await sendForm();
});
test('duplicate submit taps invoke a single pending review request', async () => {
  reset(); let release, calls = 0; const pending = new Promise(resolve => { release = resolve; }); await render('components/ReviewForm.jsx', { visit: env.eligible[0], onSubmit: async () => { calls++; await pending; } }); await star(5);
  const handler = tree.root.findByProps({ 'aria-label': 'Service feedback form' }).props.onSubmit; await act(async () => { handler({ preventDefault() {} }); handler({ preventDefault() {} }); }); assert.equal(calls, 1); await act(async () => release());
});
test('a successfully recorded form cannot submit again and clears its unsaved guard', async () => {
  reset(); let requests = 0; await render('components/ReviewForm.jsx', { visit: env.eligible[0], onSubmit: async () => { requests++; } }); await star(2); const handler = tree.root.findByProps({ 'aria-label': 'Service feedback form' }).props.onSubmit; await sendForm(); await act(async () => handler({ preventDefault() {} })); assert.equal(requests, 1); assert.equal(button('Review submitted').props.disabled, true); assert.equal(env.dirty.get('service-review'), false);
});
test('cancel honors unsaved feedback protection', async () => {
  reset(); let closed = 0; await render('components/ReviewForm.jsx', { visit: env.eligible[0], onSubmit: async () => {}, onCancel: () => closed++ }); await star(2); env.allowDiscard = false; await click('Cancel review'); assert.equal(closed, 0); env.allowDiscard = true; await click('Cancel review'); assert.equal(closed, 1);
});
test('portal review submit removes completed visit from eligibility and confirms success', async () => {
  reset(); await render('components/CustomerReviews.jsx', { accountId: 'company:company-one', userId: 'portal-user' }); await click('Review this visit'); await star(2); await act(async () => field('Review comments').props.onChange({ target: { value: 'An honest negative review' } })); await sendForm();
  const request = env.calls.find(row => row.action === 'submit'); assert.equal(request.data.accountId, 'company:company-one'); assert.equal(request.data.jobId, 'completed-job'); assert.equal(request.data.publicConsent, false); assert.match(text(), /submitted successfully/); assert.match(text(), /honest negative review/); assert.equal(button('Review this visit'), undefined);
});
test('customer can withdraw display permission while keeping original review content', async () => {
  reset(); env.review.publicConsent = true; env.customerRows = [env.review]; env.eligible = []; await render('components/CustomerReviews.jsx', { accountId: 'company:company-one', userId: 'portal-user' }); await click('Withdraw public-display permission');
  assert.equal(env.calls.find(row => row.action === 'consent').data.publicConsent, false); assert.match(text(), /permission withdrawn/); assert.match(text(), /An honest concern/); assert.equal(env.toasts.at(-1).kind, 'success');
});
test('older customer reviews paginate without duplicates and still allow display-permission withdrawal', async () => {
  reset(); const first={...review(),publicConsent:true},older={...review(),id:'older-review',jobId:'older-job',comment:'Older feedback remains accessible',publicConsent:true};
  env.customerPages={first:{eligibleVisits:[],reviews:[first],hasMoreReviews:true,reviewCursor:first.id},[first.id]:{eligibleVisits:[],reviews:[first,older],hasMoreReviews:false,reviewCursor:null}};
  await render('components/CustomerReviews.jsx',{accountId:'company:company-one',userId:'portal-user'});await click('Load more reviews');assert.equal(env.calls.filter(row=>row.action==='list').at(-1).data.reviewCursor,first.id);assert.match(text(),/Older feedback remains accessible/);
  const controls=tree.root.findAll(node=>node.type==='button'&&node.children.join('')==='Withdraw public-display permission');assert.equal(controls.length,2);env.review=older;await act(async()=>controls[1].props.onClick());assert.equal(env.calls.find(row=>row.action==='consent').data.reviewId,older.id);assert.equal(env.calls.find(row=>row.action==='consent').data.accountId,'company:company-one');assert.equal(tree.root.findAll(node=>node.type==='button'&&node.children.join('')==='Withdraw public-display permission').length,1);
});
test('switching provider scope ignores late feedback from the previous provider', async () => {
  reset(); let release; env.pending = new Promise(resolve => { release = resolve; }); await render('components/CustomerReviews.jsx', { accountId: 'company:first', userId: 'portal-user' }); env.pending = null; env.customerRows = [{ ...review(), id: 'second-review', comment: 'SECOND PROVIDER' }];
  const Page = load('components/CustomerReviews.jsx').default; await act(async () => tree.update(React.createElement(Page, { accountId: 'company:second', userId: 'portal-user' }))); await act(async () => release({ eligibleVisits: [], reviews: [{ ...review(), comment: 'STALE FIRST PROVIDER' }] })); assert.match(text(), /SECOND PROVIDER/); assert.doesNotMatch(text(), /STALE FIRST PROVIDER/);
});
test('provider reviews deny technicians and ordinary admins before any read', async () => {
  for (const role of ['technician', 'admin']) { reset(); env.role = role; await render('pages/ReviewsPage.jsx'); assert.equal(env.calls.length, 0); assert.match(text(), /owner and authorized managers/); await act(async () => tree.unmount()); tree = null; }
});
test('provider filters send only explicit server filters and preserve all-rating statistics', async () => {
  reset(); await render('pages/ReviewsPage.jsx'); assert.equal(button('Apply filters').props.disabled, true); await act(async () => field('Review rating filter').props.onChange({ target: { value: '1' } }));
  await act(async () => tree.root.findByProps({ 'aria-label': 'Review filters' }).findByType('form').props.onSubmit({ preventDefault() {} })); const request = env.calls.filter(row => row.name === 'provider' && row.action === 'list').at(-1); assert.deepEqual(request.data, { rating: 1 }); assert.match(text(), /Average of all submitted ratings/);
});
test('provider responses save only changed input and display success', async () => {
  reset(); await render('pages/ReviewsPage.jsx'); await click('Manage review'); assert.equal(button('Save response').props.disabled, true); await act(async () => field('Provider review response').props.onChange({ target: { value: 'We will follow up on your concern.' } })); await click('Save response');
  assert.match(text(), /Provider response saved/); assert.equal(button('Save response').props.disabled, true); assert.equal(env.review.rating, 2); assert.equal(env.review.comment, 'An honest concern'); assert.equal(env.toasts.at(-1).kind, 'success');
});
test('provider moderation requires a changed status and documented reason and preserves negative ratings', async () => {
  reset(); await render('pages/ReviewsPage.jsx'); await click('Manage review'); await act(async () => field('Review moderation status').props.onChange({ target: { value: 'approved' } })); assert.equal(button('Record moderation decision').props.disabled, true);
  await act(async () => field('Review moderation reason').props.onChange({ target: { value: 'Authentic service feedback with no private details.' } })); await click('Record moderation decision'); assert.equal(env.review.rating, 2); assert.equal(env.review.comment, 'An honest concern'); assert.match(text(), /No review was automatically published/); assert.match(text(), /Authentic service feedback/);
});
test('provider audit history loads retained moderation decisions without exposing customer-edit controls',async()=>{
  reset();await render('pages/ReviewsPage.jsx');await click('Manage review');await click('Load review audit history');assert.match(text(),/Authentic negative feedback preserved/);assert.equal(env.calls.find(row=>row.action==='history').data.reviewId,'review-one');assert.equal(env.review.rating,2);
});
test('unsaved provider response prevents closing review management when kept', async () => {
  reset(); await render('pages/ReviewsPage.jsx'); await click('Manage review'); await act(async () => field('Provider review response').props.onChange({ target: { value: 'Unsaved response' } })); env.allowDiscard = false; await click('Close review management'); assert.equal(field('Provider review response').props.value, 'Unsaved response'); env.allowDiscard = true; await click('Close review management'); assert.equal(button('Save response'), undefined);
});
test('invitation preferences require changes and cannot lift the operator disabled gate', async () => {
  reset(); await render('components/ReviewInvitationSettings.jsx', { companyId: 'company-one' }); assert.equal(button('Save invitation preferences').props.disabled, true); assert.match(text(), /disabled by the operator/); await act(async () => field('Review invitation delay').props.onChange({ target: { value: '180' } })); await click('Save invitation preferences');
  const request = env.calls.find(row => row.name === 'settings' && row.action === 'save'); assert.equal(request.data.expectedRevision, 1); assert.equal(request.data.settings.delayMinutes, 180); assert.equal(request.data.delivery, undefined); assert.match(text(), /preferences saved/); assert.match(text(), /disabled by the operator/); assert.equal(button('Save invitation preferences').props.disabled, true);
});
test('invitation token leaves browser history before submitting and success prevents another form', async () => {
  reset(); await render('pages/ReviewInvitationPage.jsx'); assert.equal(env.fragmentsRemoved, 1); await star(4); await sendForm(); assert.equal(env.calls.filter(row => row.name === 'invitation' && row.action === 'submit').length, 1); assert.match(text(), /invitation cannot submit another review/); assert.equal(button('Submit review'), undefined);
});
test('expired invitations display an actionable portal path with no review form', async () => {
  reset(); env.fail = 'get'; await render('pages/ReviewInvitationPage.jsx'); assert.match(text(), /Invitation expired/); assert.equal(button('Submit review'), undefined); assert.ok(tree.root.findAll(node => node.type === 'a' && node.props.href === '/portal').length);
});
test('synthetic acceptance feedback is clearly excluded from real verified-service and public display claims',async()=>{
  reset();await render('components/ReviewSummary.jsx',{review:{...review(),synthetic:true,publicConsent:true,publicEligible:false}});assert.match(text(),/Synthetic test feedback/);assert.match(text(),/excluded from public display/);assert.doesNotMatch(text(),/Verified completed service/);
});


test('provider review background refresh preserves filters, selected review and all entered management drafts',async()=>{
  reset();await render('pages/ReviewsPage.jsx');await click('Manage review');
  await act(async()=>field('Provider review response').props.onChange({target:{value:'Retain this response draft'}}));
  await act(async()=>field('Internal review note').props.onChange({target:{value:'Retain internal note'}}));
  await act(async()=>field('Review moderation status').props.onChange({target:{value:'flagged'}}));
  await act(async()=>field('Review moderation reason').props.onChange({target:{value:'Retain reason'}}));
  await act(async()=>field('Review rating filter').props.onChange({target:{value:'4'}}));
  env.review={...env.review,providerResponse:{text:'Another manager response'},moderationStatus:'approved',internalNotes:[{text:'New saved note'}]};
  await act(async()=>queryMock.useInvalidateWorkspace()(['reviews']));
  assert.equal(field('Provider review response').props.value,'Retain this response draft');assert.equal(field('Internal review note').props.value,'Retain internal note');
  assert.equal(field('Review moderation status').props.value,'flagged');assert.equal(field('Review moderation reason').props.value,'Retain reason');assert.equal(field('Review rating filter').props.value,'4');
  assert.match(text(),/New saved note/);assert.ok(button('Close review management'));assert.equal(env.calls.filter(row=>row.name==='provider'&&row.action!=='list').length,0);
});

test('loaded provider review pages refresh without losing pagination or duplicating rows',async()=>{
  reset();const first=review(),older={...review(),id:'older-review',comment:'Older provider review'};
  env.providerPages={first:{reviews:[first],stats:{count:2,averageRating:2},serviceTypes:['Inspection'],hasMore:true,cursor:first.id},[first.id]:{reviews:[first,older],hasMore:false,cursor:null}};
  await render('pages/ReviewsPage.jsx');await click('Load more reviews');assert.match(text(),/Older provider review/);
  env.providerPages[first.id].reviews[1].comment='Older feedback refreshed';await act(async()=>queryMock.useInvalidateWorkspace()(['reviews']));
  assert.match(text(),/Older feedback refreshed/);assert.equal(tree.root.findAll(node=>node.type==='button'&&node.children.join('')==='Manage review').length,2);
  assert.deepEqual(env.calls.filter(row=>row.name==='provider'&&row.action==='list').slice(-2).map(row=>row.data.cursor||null),[null,'review-one']);
});

test('transient review polling errors retain drafts while revoked access hides them',async()=>{
  reset();await render('pages/ReviewsPage.jsx');await click('Manage review');await act(async()=>field('Provider review response').props.onChange({target:{value:'Private response draft'}}));
  env.fail='list';await act(async()=>queryMock.useInvalidateWorkspace()(['reviews']));assert.equal(field('Provider review response').props.value,'Private response draft');assert.match(text(),/Controlled list failure/);
  env.failureCode='functions/permission-denied';await act(async()=>queryMock.useInvalidateWorkspace()(['reviews']));assert.equal(tree.root.findAllByProps({'aria-label':'Provider review response'}).length,0);assert.doesNotMatch(text(),/Private response draft|An honest concern/);assert.equal(tree.root.findAllByProps({'aria-label':'Review invitation preferences'}).length,0);
});

test('provider scope changes cannot surface a late previous company read',async()=>{
  reset();let release;env.providerPending=new Promise(resolve=>{release=resolve;});await render('pages/ReviewsPage.jsx');
  env.providerPending=null;env.companyId='company-two';env.review={...env.review,id:'second-review',comment:'SECOND PROVIDER'};
  const Page=load('pages/ReviewsPage.jsx').default;await act(async()=>tree.update(React.createElement(Page)));
  await act(async()=>release({reviews:[{...review(),comment:'STALE FIRST PROVIDER'}],stats:{count:1},serviceTypes:[]}));
  assert.match(text(),/SECOND PROVIDER/);assert.doesNotMatch(text(),/STALE FIRST PROVIDER/);
});


test('a review moving out of the current result page cannot discard its unsaved management draft',async()=>{
  reset();const first=review();env.providerPages={first:{reviews:[first],stats:{count:1,averageRating:2},serviceTypes:['Inspection'],hasMore:false}};
  await render('pages/ReviewsPage.jsx');await click('Manage review');await act(async()=>field('Provider review response').props.onChange({target:{value:'Keep this response even after remote filtering'}}));
  env.providerPages.first.reviews=[];await act(async()=>queryMock.useInvalidateWorkspace()(['reviews']));
  assert.equal(field('Provider review response').props.value,'Keep this response even after remote filtering');assert.match(text(),/no longer in the current results/);assert.match(text(),/eligibility is unconfirmed/);assert.ok(button('Close review management'));
  env.fail='list';env.failureCode='functions/permission-denied';await act(async()=>queryMock.useInvalidateWorkspace()(['reviews']));assert.equal(tree.root.findAllByProps({'aria-label':'Provider review response'}).length,0);
});
