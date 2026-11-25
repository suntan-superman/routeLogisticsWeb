const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { create, act } = require('react-test-renderer');
const babel = require('@babel/core');
const { workspacePermissions } = require('../services/workspacePolicy');
global.IS_REACT_ACT_ENVIRONMENT = true;
let account, tree, photoProps, workProps, checklistProps, requestProps, photoMounts, photoUnmounts, calls, loader, savedRead, reads, changes, closes, interactions, discarded, navigationCalls, scrollCommands;
let workDrafts, checklistDrafts, savedDraftCalls, discardedDraftCalls, saveWorkDrafts, saveChecklistDrafts, discardWorkDrafts, visitStatus, departureOpened;
const saved = new Map();
const native = Object.fromEntries(['View', 'Text', 'ScrollView', 'ActivityIndicator'].map(name => [name, name]));
native.Linking = { openURL: async url => navigationCalls.push(url) };
native.Keyboard = { dismiss() {} };
const appStateHandlers = new Set();
native.AppState = { addEventListener: (_event, handler) => { appStateHandlers.add(handler); return { remove: () => appStateHandlers.delete(handler) }; } };
const palette = { text: '#FFF', secondary: '#CCC', danger: '#F00', accent: '#0F0', background: '#000' };
function Photos(props) {
  photoProps = props;
  React.useEffect(() => { photoMounts++; return () => { photoUnmounts++; }; }, []);
  return React.createElement('PhotoPanel', { jobId: props.job.id });
}
function button({ title, accessibilityLabel, onPress, disabled, busy }) {
  return React.createElement('Pressable', { accessibilityLabel: accessibilityLabel || title, onPress, disabled: disabled || busy, busy }, React.createElement('Text', null, title));
}
function load() {
  const filename = path.resolve(__dirname, '../components/JobWorkflow.js'), module = { exports: {} };
  const requireMock = specifier => {
    if (specifier.startsWith('@babel/runtime/')) return require(specifier);
    if (specifier === 'react') return React;
    if (specifier === 'react-native') return native;
    if (specifier.endsWith('/contexts/AuthContext')) return { useAuth: () => account };
    if (specifier.endsWith('/theme/ThemeProvider')) return { useTheme: () => ({ palette }) };
    if (specifier === './Glass') return { GlassButton: button, GlassInput: ({ label, ...props }) => React.createElement('TextInput', { accessibilityLabel: label, ...props }) };
    if (specifier === './MobileUI') {
      const panel = ({ title, message, children, ...props }) => React.createElement('View', props, title && React.createElement('Text', null, title), message && React.createElement('Text', null, message), children);
      const KeyboardAwareScrollView = ({ children, scrollRef, ...props }) => {
        const api = React.useRef({ scrollTo: options => scrollCommands.push(options) });
        React.useEffect(() => { if (scrollRef) scrollRef.current = api.current; return () => { if (scrollRef?.current === api.current) scrollRef.current = null; }; }, [scrollRef]);
        return React.createElement('ScrollView', props, children);
      };
      return { Card: panel, ScreenHeader: panel, SectionHeader: panel, InlineNotice: panel, ConfirmationPanel: panel, ActionDialog: panel, KeyboardAwareScrollView, StatusBadge: ({ status, syncState }) => React.createElement('Text', null, status || syncState) };
    }
    if (specifier === './JobPhotos') return Photos;
    if (specifier === './PropertyProfileMobile') return props => React.createElement('PropertyProfilePanel', { jobId: props.job.id });
    if (specifier === './NoteAudience') return () => React.createElement('Text', null, 'Internal — management and assigned technicians');
    if (specifier === './JobReassignmentRequest') return props => {requestProps=props;return null;};
    if (specifier.endsWith('/services/estimateVisitPolicy')) return require('../services/estimateVisitPolicy');
    if (specifier.endsWith('/services/workPresentation')) return require('../services/workPresentation');
    if (specifier === './FieldWorkTools') return props => {
      workProps = props;
      if (props.draftActionsRef) props.draftActionsRef.current = { getDrafts: () => workDrafts, getVisitStatus: () => visitStatus, beginDeparture: () => { departureOpened++; return true; }, saveDrafts: () => saveWorkDrafts(), discardDrafts: () => discardWorkDrafts() };
      return React.createElement('WorkTools');
    };
    if (specifier === './ServiceChecklist') return props => {
      checklistProps = props;
      if (props.draftActionsRef) props.draftActionsRef.current = { getDrafts: () => checklistDrafts, saveDrafts: () => saveChecklistDrafts(), discardDrafts: () => { discardedDraftCalls.push('checklist'); checklistDrafts = { checklist: false, hasDraft: false }; props.onDraftChange(false); return { success: true }; } };
      return React.createElement('ServiceChecklist');
    };
    if (specifier.endsWith('/services/jobCompletion')) return { completeJob: async (job, draft, options) => { calls.push({ job, draft, options }); return loader(job, draft, options); } };
    if (specifier.endsWith('/services/offline')) return { getQueuedOperation: async id => { reads.push(id); return savedRead(id); }, resolveOffline: async (id, action) => { discarded.push({ id, action }); saved.delete(id); }, alertKey: alert => `${alert.source}:${alert.id}:${alert.version}`, readJobAlerts: async (_id, alerts) => ({ alerts, acknowledgments: [], local: [] }), saveAlertAcknowledgmentOffline: async () => ({ state: 'pending' }), subscribeOffline: () => () => {} };
    throw new Error(`Unexpected dependency ${specifier}`);
  };
  const transformed = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  new Function('require', 'module', 'exports', transformed)(requireMock, module, module.exports);
  return module.exports.default;
}
const Workflow = load();
const job = overrides => ({ id: 'assigned', companyId: 'acme', assignedTo: 'member', status: 'in-progress', customerName: 'Assigned Customer', serviceType: 'Inspection', date: '2026-11-13', time: '15:00', ...overrides });
const props = selected => ({ job: selected, onClose: () => { closes++; }, onChanged: async () => { changes++; }, onInteractionChange: state => interactions.push(state) });
async function render(selected = job(), overrides = {}) { await act(async () => { tree = create(React.createElement(Workflow, { ...props(selected), ...overrides })); }); }
const text = () => JSON.stringify(tree.toJSON());
const visible = node => { for (let parent = node; parent; parent = parent.parent) { if (parent.props.accessibilityElementsHidden) return false; const styles = Array.isArray(parent.props.style) ? parent.props.style.flat(Infinity) : [parent.props.style]; if (styles.some(style => style?.display === 'none')) return false; } return true; };
const aliases = { 'Return to work order': 'Return to My Work' };
const control = label => { label=aliases[label]||label;const matches=tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label);return matches.find(visible)||(['Complete Visit','Prepare Estimate','View Estimate'].includes(label)?matches[0]:undefined); };
async function press(label) {
  const node = control(label); assert.ok(node, `Expected ${label}`); assert.equal(!!node.props.disabled, false, `${label} should be enabled`); await act(async () => node.props.onPress());
}
async function input(label, value) { const field = tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === label && visible(node))[0]; assert.ok(field, `Expected visible ${label}`); await act(async () => field.props.onChangeText(value)); }
async function draft() { if (control('Review and completion')) await press('Review and completion'); await input('Work completed', 'Inspected and treated the site'); await input('Actual hours worked', '1.5'); await input('Completion notes', 'Gate secured'); }
beforeEach(() => {
  const user = { id: 'technician', companyId: 'acme', membershipId: 'member', role: 'technician', emailVerified: true, workspace: { status: 'company' } };
  account = { user, permissions: workspacePermissions(user.workspace, user) };
  tree = null; photoProps = workProps = requestProps = null; navigationCalls = []; scrollCommands = []; photoMounts = photoUnmounts = changes = closes = 0; calls = []; interactions = []; discarded = []; reads = []; saved.clear(); savedRead = async id => saved.get(id);
  loader = async selected => ({ status: 'synced', operationId: 'operation', jobId: selected.id, message: 'Job completed and synchronized.' });
  workDrafts = checklistDrafts = undefined; savedDraftCalls = []; discardedDraftCalls = []; checklistProps = null;
  saveWorkDrafts = async () => { savedDraftCalls.push('work'); workDrafts = { notes: false, application: false, visit: false, hasDraft: false }; workProps.onDraftChange(false); return { success: true }; };
  saveChecklistDrafts = async () => { savedDraftCalls.push('checklist'); checklistDrafts = { checklist: false, hasDraft: false }; checklistProps.onDraftChange(false); return { success: true }; };
  discardWorkDrafts = () => { discardedDraftCalls.push('work'); workDrafts = { notes: false, application: false, visit: false, hasDraft: false }; workProps.onDraftChange(false); return { success: true }; };
  visitStatus = { arrival: null, departure: null }; departureOpened = 0;
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); assert.equal(appStateHandlers.size, 0); });

test('estimate details retain property access and dispatcher notes and completion offers quote-needed outcome',async()=>{
 let prepared=null;await render(job({appointmentKind:'estimate_visit',billable:false,estimateOutcome:'estimate_pending',inquiryId:'inquiry-one',serviceProperty:{address:'22 Rental Road',label:'Rental',unit:'B'},address:'Old billing street',propertyAccessInstructions:'Gate 2468',dispatchNotes:'Inspect exterior only'}),{onPrepareEstimate:selected=>{prepared=selected;}});
 assert.match(text(),/Estimate Visit/);assert.match(text(),/22 Rental Road/);assert.match(text(),/Gate 2468/);assert.match(text(),/Inspect exterior only/);assert.doesNotMatch(text(),/Old billing street/);
 await press('Prepare Estimate');assert.equal(prepared.id,'assigned');
 await press('Review and completion');assert.match(text(),/Review & Complete/);assert.ok(control('Completion outcome: Visit completed — quote needed'));await input('Work completed','Inspected for a quote');await press('Completion outcome: Customer declined');await press('Complete Visit');assert.equal(calls[0].draft.estimateOutcome,'customer_declined');assert.equal(calls[0].job.billable,false);assert.equal(photoMounts,1);
});

test('guided workflow shows one focused stage, returns after durable saves and reopens completed steps',async()=>{
 await render();
 assert.equal(workProps.section,'hidden');assert.ok(control('Arrival'));assert.match(text(),/Visit Workflow/);
 await press('Arrival');assert.equal(workProps.section,'arrival');assert.ok(control('Back to Visit Workflow'));assert.doesNotMatch(text(),/Service location/);
 await act(async()=>workProps.onLocalSave('arrived',{state:'pending'}));assert.equal(workProps.section,'hidden');assert.ok(control('Arrival, completed, Arrival saved'));assert.equal(control('Work details, current step'),undefined);
 await press('Work details');assert.equal(workProps.section,'work');assert.ok(checklistProps);
 await act(async()=>workProps.onLocalSave('work',{state:'pending'}));assert.ok(control('Work details, completed, Work details saved'));
 await press('Photos and evidence');await act(async()=>photoProps.onLocalSave({state:'pending'}));assert.ok(control('Photos and evidence, completed, Evidence reviewed'));
 await press('Departure');await act(async()=>workProps.onLocalSave('departed',{state:'pending'}));assert.ok(control('Departure, completed, Departure saved'));
 await press('Review and completion');assert.ok(control('Complete Visit'));await press('Back to Visit Workflow');
 await press('Arrival, completed, Arrival saved');assert.equal(workProps.section,'arrival');assert.equal(photoMounts,1);assert.equal(photoUnmounts,0);
});

test('current critical alert blocks normal stages until a durable local acknowledgment is saved', async () => {
  const critical = { id: 'gate', source: 'property', version: 2, active: true, severity: 'critical', title: 'Hazard at entry', description: 'Review the full access warning before work.' };
  await render(job({ operationalAlerts: [critical] }));
  assert.match(text(), /Hazard at entry/);
  assert.equal(control('Work details').props.disabled, true);
  await press('I have read this critical alert');
  assert.equal(!!control('Work details').props.disabled, false);
  assert.match(text(), /Acknowledged on device/);
});

test('workflow view changes use measured stage positions and resume at the active stage',async()=>{
 await render(undefined,{visible:true});
 const layout=async(testID,y)=>act(async()=>tree.root.findByProps({testID}).props.onLayout({nativeEvent:{layout:{y,height:320}}}));
 await layout('workflow-stage-selector',36);scrollCommands.length=0;
 await press('Work details');await layout('workflow-stage-work',240);assert.deepEqual(scrollCommands.at(-1),{y:240,animated:false});
 const beforeResume=scrollCommands.length;await act(async()=>[...appStateHandlers][0]('active'));await new Promise(resolve=>setTimeout(resolve,5));
 assert.ok(scrollCommands.length>beforeResume);assert.deepEqual(scrollCommands.at(-1),{y:240,animated:false});
 await act(async()=>workProps.onLocalSave('work',{state:'pending'}));await layout('workflow-stage-selector',36);assert.deepEqual(scrollCommands.at(-1),{y:36,animated:false});
 await press('Work details, completed, Work details saved');await layout('workflow-stage-work',240);assert.deepEqual(scrollCommands.at(-1),{y:240,animated:false});
});

test('short overview clamps stale long-stage scroll position after content shrinks', async () => {
  await render();
  const scroll = tree.root.findByType('ScrollView');
  await act(async () => scroll.props.onLayout({ nativeEvent: { layout: { height: 620 } } }));
  await act(async () => scroll.props.onContentSizeChange(390, 1900));
  await act(async () => tree.root.findByProps({ testID: 'workflow-stage-selector' }).props.onLayout({ nativeEvent: { layout: { y: 380, height: 400 } } }));
  await press('Work details');
  await act(async () => scroll.props.onContentSizeChange(390, 3100));
  await press('Back to Visit Workflow');
  await act(async () => scroll.props.onContentSizeChange(390, 900));
  assert.deepEqual(scrollCommands.at(-1), { y: 280, animated: false });
  assert.equal(scroll.props.bounces, false);
  assert.equal(scroll.props.alwaysBounceVertical, false);
});

test('shrinking workflow content recovers a scroll position beyond the new bottom', async () => {
  await render();
  const scroll = tree.root.findByType('ScrollView');
  await act(async () => scroll.props.onLayout({ nativeEvent: { layout: { height: 620 } } }));
  await act(async () => scroll.props.onContentSizeChange(390, 2300));
  await act(async () => scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 1450 } } }));
  scrollCommands.length = 0;
  await act(async () => scroll.props.onContentSizeChange(390, 900));
  assert.deepEqual(scrollCommands.at(-1), { y: 280, animated: false });
});

test('each workflow stage opens at its measured beginning and Back restores the selector position',async()=>{
 await render(undefined,{visible:true});
 const layout=async(testID,y)=>act(async()=>tree.root.findByProps({testID}).props.onLayout({nativeEvent:{layout:{y,height:300}}}));
 await layout('workflow-stage-selector',28);scrollCommands.length=0;
 const stages=[['Arrival','arrival',140],['Work details','work',180],['Photos and evidence','photos',220],['Departure','departure',260],['Review and completion','review',300]];
 for(const[label,id,y]of stages){
   await press(label);await layout(`workflow-stage-${id}`,y);assert.deepEqual(scrollCommands.at(-1),{y,animated:false});
   await press('Back to Visit Workflow');assert.deepEqual(scrollCommands.at(-1),{y:28,animated:false});
 }
});

test('estimate outcome is part of the single completion draft and survives stage navigation',async()=>{
 await render(job({appointmentKind:'estimate_visit',billable:false,estimateOutcome:'estimate_pending'}));await press('Review and completion');
 assert.ok(control('Completion outcome: Visit completed — quote needed'));await press('Completion outcome: Customer declined');await input('Work completed','Customer declined the proposed work');
 await press('Back to Visit Workflow');assert.equal(interactions.at(-1).hasDraft,true);await press('Review and completion');
 assert.equal(tree.root.findByProps({accessibilityLabel:'Work completed'}).props.value,'Customer declined the proposed work');assert.ok(control('Completion outcome: Customer declined'));
});

test('an open reassignment request cannot be silently discarded by job close or completion',async()=>{
 await render();assert.equal(requestProps.active,false);await press('Review and completion');assert.equal(requestProps.active,true);await act(async()=>requestProps.onDraftChange(true));assert.equal(interactions.at(-1).hasDraft,true);
 await press('Complete Visit');assert.match(text(),/Finish submitting or explicitly cancel the reassignment request/);assert.equal(control('Save drafts and continue').props.disabled,true);assert.equal(control('Discard unsaved drafts and continue').props.disabled,true);assert.equal(calls.length,0);
 await press('Keep editing');await press('Back to Visit Workflow');await press('Close job details');assert.equal(closes,0);assert.match(text(),/before closing this work order/);
 await press('Keep editing');await act(async()=>requestProps.onDraftChange(false));assert.equal(requestProps.active,false);assert.equal(photoMounts,1);
});

test('reassignment request submission participates in the existing work-order busy guard',async()=>{
 await render();await press('Review and completion');await act(async()=>requestProps.onBusyChange(true));assert.equal(interactions.at(-1).busy,true);assert.equal(control('Complete Visit').props.disabled,true);
 assert.equal(control('Close job details'),undefined);await act(async()=>requestProps.onBusyChange(false));await press('Back to Visit Workflow');await press('Close job details');assert.equal(closes,1);assert.equal(calls.length,0);
});

test('job workflow uses exclusive inline pages and preserves one photo owner through child navigation', async () => {
  await render(); assert.equal(photoMounts, 1); assert.equal(tree.root.findAllByType('Modal').length, 0);
  await draft(); assert.match(text(), /Review & Complete/); assert.ok(control('Complete Visit'));
  await press('Back to Visit Workflow'); assert.match(text(), /Visit Workflow/); assert.equal(photoMounts, 1); assert.equal(photoUnmounts, 0);
  await press('Review and completion');
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work completed' }).props.value, 'Inspected and treated the site');
});

test('native picker and unsaved photo state block transitions until cancellation or save completes', async () => {
  await render();
  await act(async () => photoProps.onBusyChange(true));
  assert.equal(control('Review and completion').props.disabled, true); assert.equal(control('Close job details').props.disabled, true);
  assert.deepEqual(interactions.at(-1), { busy: true, hasDraft: false });
  await act(async () => { photoProps.onBusyChange(false); photoProps.onDraftChange(true); });
  await press('Review and completion'); await press('Complete Visit'); assert.match(text(), /A selected photo has not been saved/);
  await press('Keep editing');
  await press('Back to Visit Workflow'); await press('Close job details'); assert.equal(closes, 0);
  await act(async () => photoProps.onDraftChange(false));
  await press('Close job details'); assert.equal(closes, 1);
});

test('completion validates fields, shows saving, suppresses duplicate taps and returns to updated details', async () => {
  await render(); await press('Review and completion'); await press('Complete Visit');
  assert.match(text(), /Describe the work completed/); assert.equal(calls.length, 0);
  await press('Keep editing');
  await input('Work completed', 'Inspection'); await input('Actual hours worked', '-1'); await press('Complete Visit');
  assert.match(text(), /between 0 and 744/); await press('Keep editing'); await input('Actual hours worked', '1');
  let resolve;
  loader = () => new Promise(done => { resolve = done; });
  const confirm = control('Complete Visit').props.onPress;
  let first, second;
  await act(async () => { first = confirm(); second = confirm(); });
  assert.equal(calls.length, 1); assert.match(text(), /Saving completion/); assert.equal(control('Close job details'), undefined);
  await act(async () => { resolve({ status: 'synced', operationId: 'once', jobId: 'assigned' }); await Promise.all([first, second]); });
  assert.equal(changes, 1); assert.match(text(), /Visit Workflow/); assert.match(text(), /Status:.*completed/); assert.match(text(), /Visit Completed/);
  assert.equal(control('Complete Visit'), undefined); assert.ok(control('Return to work order'));
  await press('Return to work order'); assert.equal(closes, 1);
});

test('an arrival without departure offers direct departure recording or a documented exception', async () => {
  visitStatus = { arrival: { id: 'arrival', type: 'arrived', recordedAt: '2026-11-18T17:00:00.000Z' }, departure: null };
  await render(); await draft(); await press('Complete Visit');
  assert.match(text(), /Departure has not been recorded/); assert.ok(control('Record departure')); assert.ok(control('Continue with documented exception'));
  await press('Record departure'); assert.equal(departureOpened, 1); assert.match(text(), /Departure entry is open/);
  await press('Back to Visit Workflow'); await press('Review and completion'); await press('Complete Visit'); await input('Reason for completing without departure', 'Customer asked the technician to leave immediately.');
  await press('Continue with documented exception'); assert.equal(calls[0].draft.departureExceptionReason, 'Customer asked the technician to leave immediately.');
});

test('completion failure keeps context and draft and retries the same durable operation after review', async () => {
  await render(); await draft();
  loader = async () => { throw Object.assign(new Error('Assignment changed. Ask your manager.'), { code: 'permission-denied', operationId: 'saved-failure' }); };
  await press('Complete Visit');
  assert.match(text(), /Assignment changed/); assert.match(text(), /Assigned Customer/);
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work completed' }).props.value, 'Inspected and treated the site');
  saved.set('saved-failure', { state: 'conflict', server: { status: 'in-progress', actualWorkDone: 'Existing work', notes: 'Manager note' } });
  await press('Keep editing');
  await press('Complete Visit'); assert.match(text(), /Review the latest online work/);await press('Keep editing');assert.match(text(), /Manager note/);
  loader = async () => ({ status: 'synced', operationId: 'reviewed' });
  await press('Complete Visit'); assert.equal(calls[1].options.retryOperationId, 'saved-failure'); assert.equal(changes, 1);
});

test('queued completion is explicit and later synchronization failure restores its draft for retry', async () => {
  await render(); await draft();
  loader = async () => ({ status: 'queued', operationId: 'offline-completion', message: 'Completion saved on this device and awaiting authorized synchronization.' });
  await press('Complete Visit'); assert.match(text(), /Awaiting Synchronization/); assert.match(text(), /awaiting synchronization/);
  await act(async () => tree.update(React.createElement(Workflow, props(job({ status: 'in-progress', syncState: 'failed', syncOperationId: 'offline-completion', syncError: 'Your assignment was removed.' })))));
  assert.match(text(), /Your assignment was removed/);
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work completed' }).props.value, 'Inspected and treated the site');
  await press('Keep editing');
  loader = async () => ({ status: 'synced', operationId: 'offline-completion' });await press('Complete Visit');
  assert.equal(calls.at(-1).options.retryOperationId, 'offline-completion');
});

test('unauthorized, unverified and cross-company jobs cannot submit completion or show management actions', async () => {
  for (const selected of [job({ assignedTo: 'another-member' }), job({ companyId: 'another-company' })]) {
    if (tree) await act(async () => tree.unmount());
    await render(selected, { onEdit() {}, onFollowUp() {} });
    assert.equal(control('Complete'), undefined); assert.equal(control('Edit job'), undefined);
  }
  account.user.emailVerified = false;
  await act(async () => tree.update(React.createElement(Workflow, props(job()))));
  assert.equal(control('Complete'), undefined); assert.equal(calls.length, 0); assert.match(text(), /Verify your email/);
});

test('closing and reopening the same job or selecting another job produces clean details without a modal backdrop', async () => {
  let close;
  function Host() {
    const [selected, select] = React.useState(job());
    close = () => select(null);
    return selected ? React.createElement(Workflow, { ...props(selected), onClose: close }) : React.createElement('Pressable', { accessibilityLabel: 'Open job', onPress: () => select(job()) });
  }
  await act(async () => { tree = create(React.createElement(Host)); });
  for (let count = 0; count < 3; count++) { await press('Close job details'); assert.equal(tree.root.findAllByType(Workflow).length, 0); await press('Open job'); assert.match(text(), /Visit Workflow/); }
  assert.equal(tree.root.findAllByType('Modal').length, 0);
  await act(async () => tree.update(React.createElement(Workflow, props(job({ id: 'another', customerName: 'Another Customer' })))));
  assert.match(text(), /Another Customer/); assert.doesNotMatch(text(), /Assigned Customer/);
});

test('discarding a failed saved completion is explicit and a late completion callback cannot navigate an unmounted job', async () => {
  await render(); await draft();
  loader = async () => { throw Object.assign(new Error('Sync failed'), { operationId: 'saved-draft' }); };
  await press('Complete Visit'); await press('Keep editing'); await press('Back to Visit Workflow'); await press('Close job details');
  assert.equal(closes, 0); await press('Keep editing'); assert.equal(discarded.length, 0);
  await press('Close job details'); await press('Discard draft and close');
  assert.deepEqual(discarded, [{ id: 'saved-draft', action: 'discard' }]); assert.equal(closes, 1);
  await act(async () => tree.unmount()); tree = null;
  await render(); await draft();
  let resolve, pending;
  loader = () => new Promise(done => { resolve = done; });
  await act(async () => { pending = control('Complete Visit').props.onPress(); });
  await act(async () => tree.unmount()); tree = null;
  await act(async () => { resolve({ status: 'synced', operationId: 'late' }); await pending; });
  assert.equal(changes, 0);
});

test('a confirmed server refresh supersedes local completion when management reopens or cancels the job', async () => {
  await render(job({ updatedAt: '2026-11-13T20:00:00.000Z' })); await draft(); await press('Complete Visit');
  assert.match(text(), /Status:.*completed/);
  await press('Review Visit');
  await act(async () => tree.update(React.createElement(Workflow, props(job({ status: 'completed', updatedAt: '2026-11-13T20:01:00.000Z' })))));
  await act(async () => tree.update(React.createElement(Workflow, props(job({ status: 'scheduled', updatedAt: '2026-11-13T20:02:00.000Z' })))));
  assert.ok(control('Complete Visit')); await press('Back to Visit Workflow'); assert.match(text(), /Status:.*scheduled/);
  await act(async () => tree.update(React.createElement(Workflow, props(job({ status: 'cancelled', updatedAt: '2026-11-13T20:03:00.000Z' })))));
  assert.match(text(), /Status:.*cancelled/); assert.equal(control('Complete'), undefined);
});

test('saved-work review ignores duplicate taps and asynchronous results after unmount', async () => {
  await render(); await draft();
  loader = async () => { throw Object.assign(new Error('Job changed online'), { operationId: 'conflict' }); };
  await press('Complete Visit');
  await press('Keep editing');
  let resolve, first, second;
  savedRead = () => new Promise(done => { resolve = done; });
  const review = control('Complete Visit').props.onPress;
  await act(async () => { first = review(); second = review(); });
  assert.deepEqual(reads, ['conflict']); assert.match(text(), /Loading saved work/);
  await act(async () => tree.unmount()); tree = null;
  await act(async () => { resolve({ state: 'conflict', server: { status: 'in-progress' } }); await Promise.all([first, second]); });
  assert.equal(changes, 0); assert.deepEqual(interactions.at(-1), { busy: false, hasDraft: false });
});

test('work details retain durations and completion facts while quote prices require the pricing capability', async () => {
  const selected = job({ status:'completed',estimatedDuration: 2.5, estimatedCost: 123.45, actualHours: 1.5, completedAt: '2026-11-13T20:01:00.000Z' });
  await render(selected);assert.match(text(), /Estimated duration:.*2.5/);await press('Review and completion, completed, Completion saved'); assert.match(text(), /Actual hours:.*1.5/); assert.match(text(), /Completed:/); assert.doesNotMatch(text(), /123.45/);
  account.user = { ...account.user, role: 'manager' }; account.permissions = workspacePermissions(account.user.workspace, account.user);
  await act(async () => tree.update(React.createElement(Workflow, props(selected))));
  await press('Back to Visit Workflow');
  assert.match(text(), /Estimated cost:.*123.45/);
});

test('work-note, application and visit drafts protect back navigation and completion without remounting photo owner', async () => {
  await render();
  await act(async () => workProps.onDraftChange(true));
  assert.deepEqual(interactions.at(-1), { busy: false, hasDraft: true });
  await press('Review and completion'); await press('Complete Visit'); assert.match(text(), /Work notes, a product application or a visit record has unsaved changes/); assert.equal(calls.length, 0);
  await press('Keep editing'); await press('Back to Visit Workflow');
  await press('Close job details'); assert.equal(closes, 0); await press('Keep editing');
  await act(async () => workProps.onBusyChange(true));
  assert.equal(control('Close job details').props.disabled, true);
  await act(async () => { workProps.onBusyChange(false); workProps.onDraftChange(false); });
  assert.equal(photoMounts, 1); assert.equal(photoUnmounts, 0);
});

test('structured job details expose accessible navigation and safe customer contact actions', async () => {
  await render(job({ address: '1 Service Street', city: 'Bakersfield', state: 'CA', customerPhone: '(555) 010-2000' }));
  assert.match(text(), /Service location/); assert.match(text(), /Visit photos/);
  await press('Navigate to job'); await press('Call customer');
  assert.match(navigationCalls[0], /google.com\/maps\/dir/); assert.equal(navigationCalls[1], 'tel:5550102000');
});

test('technician and management roles see selectable multiline dispatch instructions separately from work and completion notes', async () => {
  const instructions = 'Gate code: synthetic 2468\nUse the side entrance.\nKeep the gate closed.';
  for (const role of ['technician', 'owner', 'manager']) {
    if (tree) { await act(async () => tree.unmount()); tree = null; }
    account.user = { ...account.user, role }; account.permissions = workspacePermissions(account.user.workspace, account.user);
    await render(job({ status: 'completed', dispatchNotes: instructions, serviceInstructions: 'Customer prefers the rear path.', workNotes: 'Technician observed activity.', notes: 'Legacy work-note alias.', completionNotes: 'Previous completion summary.' }));
    const note = tree.root.findAll(node => node.type === 'Text' && node.props.testID === 'job-dispatch-notes');
    assert.equal(note.length, 1); assert.equal(note[0].props.selectable, true);
    assert.equal(note[0].children.join(''), instructions);
    assert.match(text(), /Job instructions/); assert.match(text(), /Customer prefers the rear path/);await press('Review and completion, completed, Completion saved'); assert.match(text(), /Previous completion summary/);await press('Back to Visit Workflow');
    assert.equal(workProps.job.workNotes, 'Technician observed activity.');
    assert.equal(tree.root.findAll(node => node.type === 'TextInput' && node.props.value === instructions).length, 0);
    assert.doesNotMatch(text(), /Legacy work-note alias/);
  }
  assert.equal(calls.length, 0); assert.equal(reads.length, 0); assert.equal(changes, 0);
});

test('blank or malformed dispatch instructions do not render an empty card or fall back to the offline notes alias', async () => {
  for (const dispatchNotes of [undefined, '', ' \n\t ', 42, { text: 'Not an instruction string' }, ['Not an instruction string']]) {
    const selected = job({ dispatchNotes, notes: 'Legacy alias must not become dispatch instructions' });
    if (!tree) await render(selected);
    else await act(async () => tree.update(React.createElement(Workflow, props(selected))));
    assert.equal(tree.root.findAll(node => node.props.testID === 'job-dispatch-notes').length, 0);
    assert.doesNotMatch(text(), /Job instructions|Legacy alias must not become dispatch instructions/);
  }
  assert.equal(calls.length, 0);
});

test('same-job instruction refresh preserves photo, work-tool and completion drafts without submitting changes', async () => {
  let selected = job({ dispatchNotes: 'Original gate instructions', workNotes: 'Saved observations' });
  await render(selected);
  await act(async () => { photoProps.onDraftChange(true); workProps.onDraftChange(true); });
  selected = { ...selected, dispatchNotes: 'Updated gate instructions\nUse the side path.', updatedAt: '2026-11-13T20:01:00.000Z' };
  await act(async () => { await Promise.resolve(); tree.update(React.createElement(Workflow, props(selected))); });
  assert.equal(tree.root.findByProps({ testID: 'job-dispatch-notes' }).children.join(''), selected.dispatchNotes);
  assert.equal(photoMounts, 1); assert.equal(photoUnmounts, 0);
  assert.deepEqual(interactions.at(-1), { busy: false, hasDraft: true });
  await press('Close job details'); assert.equal(closes, 0); assert.match(text(), /Save or discard the selected photo/);
  await act(async () => photoProps.onDraftChange(false));
  await press('Close job details'); assert.equal(closes, 0); assert.match(text(), /Keep your work/);
  await press('Keep editing'); await act(async () => workProps.onDraftChange(false));
  await draft();
  selected = { ...selected, dispatchNotes: 'Newest gate instructions', updatedAt: '2026-11-13T20:02:00.000Z' };
  await act(async () => { await Promise.resolve(); tree.update(React.createElement(Workflow, props(selected))); });
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work completed' }).props.value, 'Inspected and treated the site');
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Completion notes' }).props.value, 'Gate secured');
  await press('Back to Visit Workflow');
  assert.equal(tree.root.findByProps({ testID: 'job-dispatch-notes' }).children.join(''), 'Newest gate instructions');
  assert.equal(photoMounts, 1); assert.equal(photoUnmounts, 0);
  assert.equal(calls.length, 0); assert.equal(reads.length, 0); assert.equal(changes, 0);
});

test('closing a note draft explicitly saves supported drafts before leaving without completing the job', async () => {
  await render();workDrafts={notes:true,application:false,visit:false,hasDraft:true};
  await act(async()=>workProps.onDraftChange(true));await press('Close job details');
  assert.equal(closes,0);assert.ok(control('Save drafts and close'));
  await press('Save drafts and close');assert.deepEqual(savedDraftCalls,['work']);assert.equal(closes,1);assert.equal(calls.length,0);
});

test('a failed note save while closing keeps the work order and its draft open for retry', async () => {
  await render();workDrafts={notes:true,application:false,visit:false,hasDraft:true};
  saveWorkDrafts=async()=>({success:false,message:'Device storage unavailable. Work notes retained.'});
  await act(async()=>workProps.onDraftChange(true));await press('Close job details');await press('Save drafts and close');
  assert.equal(closes,0);assert.match(text(),/Device storage unavailable/);assert.equal(workDrafts.hasDraft,true);assert.equal(calls.length,0);
});

test('switching jobs replaces dispatch instructions and never carries another visit’s instructions or completion draft', async () => {
  await render(job({ dispatchNotes: 'First property gate instructions' }));
  await draft();
  await act(async () => tree.update(React.createElement(Workflow, props(job({ id: 'another', customerName: 'Another property', dispatchNotes: 'Second property access instructions' })))));
  assert.match(text(), /Second property access instructions/); assert.doesNotMatch(text(), /First property gate instructions|Gate secured/);
  assert.equal(tree.root.findByProps({ testID: 'job-dispatch-notes' }).children.join(''), 'Second property access instructions');
  await press('Review and completion');assert.ok(control('Complete Visit'));
  assert.equal(calls.length, 0); assert.equal(photoMounts, 2); assert.equal(photoUnmounts, 1);
});

test('an untouched optional product form does not require a product application to begin completion', async () => {
  await render();
  workDrafts = { notes: false, application: false, visit: false, hasDraft: false };
  await press('Review and completion');
  assert.ok(tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Work completed' && visible(node)).length);
  assert.equal(tree.root.findAll(node => node.props.testID === 'completion-action-dialog').length, 0);
  assert.deepEqual(savedDraftCalls, []); assert.deepEqual(discardedDraftCalls, []); assert.equal(calls.length, 0);
});

test('completion explains an optional product draft in an overlay and requires explicit discard before continuing', async () => {
  await render(job({ dispatchNotes: 'Read-only gate access instructions' }));
  workDrafts = { notes: false, application: true, visit: false, hasDraft: true };
  await act(async () => workProps.onDraftChange(true));
  await press('Review and completion');await press('Complete Visit');
  const dialog = tree.root.findByProps({ testID: 'completion-action-dialog' });
  const ancestors = []; for (let parent = dialog.parent; parent; parent = parent.parent) ancestors.push(parent);
  assert.equal(ancestors.some(node => node.type === 'ScrollView'), false);
  assert.equal(tree.root.findAllByType('Modal').length, 0);
  assert.match(text(), /An optional product application is open and has not been saved/);
  assert.match(text(), /A new product application is optional/);
  assert.deepEqual(discardedDraftCalls, []); assert.equal(tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Complete' && visible(node)).length, 0);
  assert.deepEqual(interactions.at(-1), { busy: false, hasDraft: true });
  await press('Keep editing'); assert.equal(workDrafts.application, true);
  await press('Complete Visit'); await press('Discard unsaved drafts and continue');
  assert.deepEqual(discardedDraftCalls, ['work']); assert.deepEqual(savedDraftCalls, []);
  assert.equal(calls.length, 0); assert.equal(photoMounts, 1); assert.equal(photoUnmounts, 0);
  assert.match(text(), /Describe the work completed/); await press('Keep editing');
  assert.ok(tree.root.findAll(node => node.type === 'TextInput' && node.props.accessibilityLabel === 'Work completed' && visible(node)).length);
  assert.equal(workProps.job.dispatchNotes, 'Read-only gate access instructions');
});

test('save-and-continue names and saves pending work and checklist drafts before requesting completion details', async () => {
  await render();
  workDrafts = { notes: true, application: true, visit: true, visitType: 'arrived', visitAttempted: false, hasDraft: true };
  checklistDrafts = { checklist: true, hasDraft: true };
  await act(async () => { workProps.onDraftChange(true); checklistProps.onDraftChange(true); });
  await press('Review and completion');await press('Complete Visit');
  assert.match(text(), /Work notes have unsaved changes/); assert.match(text(), /An arrival record has not been saved on this device/); assert.match(text(), /service checklist has unsaved answers/);
  await press('Save drafts and continue');
  assert.deepEqual(savedDraftCalls, ['work', 'checklist']); assert.deepEqual(discardedDraftCalls, []);
  assert.equal(calls.length, 0); assert.equal(photoMounts, 1);
  assert.match(text(), /Describe the work completed/); await press('Keep editing');
  await input('Work completed', 'Completed the assigned visit'); await press('Complete Visit');
  assert.equal(calls.length, 1); assert.ok(control('Return to work order'));
  await press('Return to work order'); assert.equal(closes, 1);
});

test('an invalid optional draft shows its actual save error in the overlay and retains the draft for correction', async () => {
  await render(); workDrafts = { application: true, hasDraft: true };
  await act(async () => workProps.onDraftChange(true));
  saveWorkDrafts = async () => { savedDraftCalls.push('work'); return { success: false, message: 'Enter a product, target pest and positive quantity before saving.' }; };
  await press('Review and completion');await press('Complete Visit'); await press('Save drafts and continue');
  const dialog = tree.root.findByProps({ testID: 'completion-action-dialog' });
  assert.equal(dialog.props.tone, 'error'); assert.match(text(), /Enter a product, target pest and positive quantity/);
  assert.equal(workDrafts.application, true); assert.deepEqual(discardedDraftCalls, []); assert.equal(calls.length, 0);
  await press('Keep editing');
  saveWorkDrafts = async () => { savedDraftCalls.push('work'); workDrafts = { hasDraft: false }; workProps.onDraftChange(false); return { success: true }; };
  await press('Complete Visit'); await press('Save drafts and continue');
  assert.match(text(), /Describe the work completed/);
  assert.deepEqual(savedDraftCalls, ['work', 'work']); assert.equal(calls.length, 0);
});

test('an unconfirmed attempted visit cannot be discarded and retains its retry identity', async () => {
  await render(); workDrafts = { visit: true, visitType: 'arrived', visitAttempted: true, operationId: 'same-visit-attempt', hasDraft: true };
  await act(async () => workProps.onDraftChange(true));
  saveWorkDrafts = async () => { savedDraftCalls.push('work'); return { success: false, unconfirmed: true, message: 'The visit could not be confirmed. Retry the same arrival record.' }; };
  await press('Review and completion'); await press('Complete Visit');
  const discard = control('Discard unsaved drafts and continue');
  assert.equal(discard.props.disabled, true);
  await act(async () => discard.props.onPress());
  assert.deepEqual(discardedDraftCalls, []); assert.equal(workDrafts.operationId, 'same-visit-attempt');
  assert.match(text(), /cannot be discarded here/);
  await press('Save drafts and continue');
  assert.match(text(), /Retry the same arrival record/);
  assert.equal(workDrafts.operationId, 'same-visit-attempt'); assert.equal(calls.length, 0);
});

test('draft saving suppresses duplicate taps and ignores continuation after its work order unmounts', async () => {
  await render(); workDrafts = { notes: true, hasDraft: true };
  await act(async () => workProps.onDraftChange(true)); await press('Review and completion'); await press('Complete Visit');
  let resolve, first, second;
  saveWorkDrafts = () => { savedDraftCalls.push('work'); return new Promise(done => { resolve = done; }); };
  const save = control('Save drafts and continue').props.onPress;
  await act(async () => { first = save(); second = save(); });
  assert.deepEqual(savedDraftCalls, ['work']); assert.equal(control('Keep editing').props.disabled, true);
  await act(async () => tree.unmount()); tree = null;
  await act(async () => { resolve({ success: true }); await Promise.all([first, second]); });
  assert.equal(calls.length, 0); assert.equal(changes, 0); assert.equal(closes, 0);
  assert.deepEqual(interactions.at(-1), { busy: false, hasDraft: false });
});

test('required completion validation stays visible outside the scroll view and preserves invalid input', async () => {
  await render(); await press('Review and completion');
  await input('Work completed', 'x'.repeat(10001)); await press('Complete Visit');
  const dialog = tree.root.findByProps({ testID: 'completion-action-dialog' });
  assert.match(dialog.props.message, /at most 10,000 characters/);
  assert.equal(control('Complete Visit').props.disabled, false);
  assert.equal(interactions.at(-1).hasDraft, true);
  await press('Keep editing');
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work completed' }).props.value.length, 10001);
  assert.equal(calls.length, 0);
});

test('assigned property profile returns to the same guided workflow without losing the job', async () => {
  await render(job({ customerId: 'customer-one', servicePropertyId: 'home' }));
  await press('Open Property Profile');
  assert.equal(tree.root.findByProps({ testID: 'job-property-profile' }).type, 'View');
  assert.equal(tree.root.findByType('PropertyProfilePanel').props.jobId, 'assigned');
  assert.equal(control('Back to Visit Workflow'), undefined, 'the header is the single back control');
  await act(async () => tree.root.findAll(node => node.props.title === 'Property Profile' && typeof node.props.onBack === 'function')[0].props.onBack());
  assert.ok(control('Open Property Profile'));
  assert.equal(tree.root.findAllByType('PropertyProfilePanel').length, 0);
});
