const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
const { createWorkspaceQueryMock, selectControlMock } = require('./support/workspaceQueryMock.cjs');
const hooks = createWorkspaceQueryMock(React), shared = require('../functions/shared/jobExceptions');
global.IS_REACT_ACT_ENVIRONMENT = true;
const RealDate = Date, fixedNow = Date.parse('2026-11-16T17:45:00Z');
let tree, env;
const base = (id, extra = {}) => ({ id, companyId: 'synthetic-company', customerName: id, serviceType: 'Synthetic service', date: '2026-11-16', time: '09:00', estimatedDuration: 2, status: 'scheduled', assignedTo: 'tech-one', updatedAt: `${id}-v1`, ...extra });
const request = (extra = {}) => ({ id: 'request-one', status: 'pending', revision: 1, reason: 'vehicle', notes: 'The service vehicle needs assistance.', requestedAt: '2026-11-16T17:20:00Z', ...extra });
const team = [{ id: 'tech-one', name: 'First technician' }, { id: 'tech-two', name: 'Second technician' }].map(row => ({ ...row, role: 'technician' }));
const importer = name => {
  if (name === 'react') return React;
  if (name.endsWith('/useWorkspaceQuery')) return hooks;
  if (name.endsWith('/SelectControl')) return { __esModule: true, default: selectControlMock(React) };
  if (name.endsWith('/AuthContext')) return { useAuth: () => ({ company: { id: 'synthetic-company', name: 'Synthetic provider', timeZone: 'America/Los_Angeles' }, role: 'manager', can: () => true }) };
  if (name.endsWith('/useUnsavedChanges')) return { useConfirmUnsavedChanges: () => async () => env.discard, useUnsavedChanges: dirty => ({ confirmDiscard: async () => !dirty || env.discard }) };
  if (name.endsWith('/ConfirmProvider')) return { useConfirm: () => async options => { env.confirmations.push(options); return env.review; } };
  if (name === 'react-hot-toast') return { __esModule: true, default: { success: value => env.toasts.push(value), error: value => env.toasts.push(value) } };
  if (name.endsWith('/workspaceQueryPolicy')) return { workspaceAccessError: error => error?.code === 'permission-denied' };
  if (name.endsWith('/utils/jobExceptions')) return shared;
  if (name.endsWith('/utils/dispatch')) return { STATUS_COLORS: { scheduled: 'blue', 'in-progress': 'orange', completed: 'green' }, scheduleWarning: () => '', jobPosition: () => null, jobAddress: () => '' };
  if (name.endsWith('/utils/workLocations')) return { LOCATION_LABELS: {}, locationState: () => '', nearestOnDuty: () => [] };
  if (name.endsWith('/utils/routePlanning')) return { googleNavigation: () => '' };
  if (name.endsWith('/utils/dispatchMap')) return { addressKey: String, mapPoint: () => null, createDispatchAddressResolver: () => ({ snapshot: () => ({ pending: 0, failed: 0 }) }) };
  if (name.endsWith('/services/maps')) return { loadMaps: async () => { throw Error('No provider calls are allowed.'); } };
  if (['/JobPhotos', '/ServiceChecklist', '/TeamLocationStatus', '/StaffAvailabilityEditor'].some(suffix => name.endsWith(suffix)) || name === './RoutesPage') return { __esModule: true, default: () => null };
  if (name.endsWith('/workspaceApi')) return {
    readWorkspace: async () => ({ jobs: env.jobs, hasMore: false }),
    callWorkspace: async (name, data) => {
      if (name === 'rlGetRoutingTeam') return { team };
      if (name === 'rlGetTeamLocations') return { roster: [], locations: [], policy: { intervalMinutes: 3, freshAfterSeconds: 300 } };
      if (name === 'rlJobVisit') return { events: [] };
      env.calls.push({ name, data }); if (env.failure) throw env.failure; if (env.pending) await env.pending;
      if (name === 'rlJobException') { const result = { jobId: data.jobId, version: env.jobs.find(row => row.id === data.jobId).updatedAt, request: { ...env.jobs.find(row => row.id === data.jobId).reassignmentRequest, status: data.action === 'resolve' ? 'resolved' : 'dismissed', revision: data.expectedRevision + 1 } }; env.jobs = env.jobs.map(row => row.id === data.jobId ? { ...row, reassignmentRequest: null } : row); return result; }
      if (name === 'rlManageJob') { env.jobs = env.jobs.map(row => row.id === data.id ? { ...row, assignedTo: data.memberId, reassignmentRequest: null, updatedAt: row.updatedAt + '-assigned' } : row); return { id: data.id }; }
      throw Error('Unexpected dispatch operation ' + name);
    },
  };
  throw Error('Unexpected dispatch dependency ' + name);
};
const moduleValue = { exports: {} };
new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src/pages/DispatchPage.jsx'), 'utf8'), { loader: 'jsx', format: 'cjs', define: { 'import.meta.env': '{}' } }).code)(React, importer, moduleValue, moduleValue.exports);
const Page = moduleValue.exports.default;
const textOf = node => typeof node === 'string' ? node : (Array.isArray(node) ? node : node?.children || []).map(textOf).join('');
const content = () => textOf(tree.toJSON());
const button = label => tree.root.findAll(node => node.type === 'button' && textOf(node).trim() === label)[0];
const click = async label => { assert.ok(button(label), label); await act(async () => button(label).props.onClick({ currentTarget: { focus() {}, isConnected: true } })); };
const notes = () => tree.root.findByProps({ 'aria-label': 'Reassignment resolution explanation' });
const cards = () => tree.root.findAll(node => node.type === 'article').map(node => textOf(node));
const mount = async () => act(async () => { tree = create(React.createElement(Page), { createNodeMock: () => ({ focus() {}, contains: () => false, querySelectorAll: () => [], isConnected: true }) }); });
beforeEach(() => {
  global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [fixedNow])); } static now() { return fixedNow; } };
  global.window = new EventTarget(); global.document = { body: { style: { overflow: '' } }, activeElement: null, querySelectorAll: () => [] };
  env = { jobs: [base('Late'), base('Overdue', { time: '08:00', estimatedDuration: 1, visitEvidence: { arrivedAt: '2026-11-16T16:05:00Z' } }), base('Requested', { time: '11:00', reassignmentRequest: request() }), base('Completed', { time: '08:00', status: 'completed' })], calls: [], toasts: [], confirmations: [], review: true, discard: true, failure: null, pending: null };
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; global.Date = RealDate; delete global.window; delete global.document; });

test('dispatch exception counts and filters are derived without changing any canonical job', async () => {
  const before = structuredClone(env.jobs); await mount();
  for (const label of ['Potentially late (1)', 'Overdue (1)', 'Reassignment requested (1)']) assert.ok(button(label));
  await click('Potentially late (1)'); assert.equal(cards().length, 1); assert.match(cards()[0], /Late/); assert.doesNotMatch(cards()[0], /Overdue/);
  await click('Overdue (1)'); assert.equal(cards().length, 1); assert.match(cards()[0], /Overdue/);
  await click('Reassignment requested (1)'); assert.equal(cards().length, 1); assert.match(cards()[0], /Requested/);
  assert.match(content(), /No arrival confirmed does not prove absence/); assert.deepEqual(env.jobs, before); assert.equal(env.calls.length, 0);
});
test('manager resolution sends the current request/job revisions and explanation without changing assignment or status', async () => {
  await mount(); await click('Requested · Synthetic service'); assert.match(content(), /Vehicle problem/); assert.match(content(), /service vehicle needs assistance/);
  await act(async () => notes().props.onChange({ target: { value: 'Confirmed the technician can retain this visit.' } }));
  await click('Resolve request'); const call = env.calls[0];
  assert.equal(call.name, 'rlJobException'); assert.equal(call.data.action, 'resolve'); assert.equal(call.data.jobId, 'Requested'); assert.equal(call.data.requestId, 'request-one'); assert.equal(call.data.expectedRevision, 1); assert.equal(call.data.expectedVersion, 'Requested-v1'); assert.equal(call.data.explanation, 'Confirmed the technician can retain this visit.'); assert.match(call.data.operationId, /^[a-f0-9-]{36}$/);
  assert.equal(env.jobs[2].assignedTo, 'tech-one'); assert.equal(env.jobs[2].status, 'scheduled'); assert.match(content(), /request resolved. The assignment is unchanged/);
});
test('failed management review preserves the draft and retries the same operation while duplicate taps are suppressed', async () => {
  await mount(); await click('Requested · Synthetic service'); await act(async () => notes().props.onChange({ target: { value: 'A retained management explanation.' } }));
  env.failure = Error('The request changed. Refresh and review it.'); await click('Dismiss request'); const first = env.calls[0].data;
  assert.equal(notes().props.value, 'A retained management explanation.'); assert.match(content(), /request changed/);
  env.failure = null; let release; env.pending = new Promise(resolve => { release = resolve; }); const handler = button('Dismiss request').props.onClick; let work;
  await act(async () => { work = handler(); handler(); }); assert.equal(env.calls.length, 2); assert.equal(env.calls[1].data.operationId, first.operationId);
  await act(async () => { release(); await work; }); assert.equal(env.jobs[2].assignedTo, 'tech-one'); assert.match(content(), /request dismissed/);
});
test('in-progress reassignment requires an explicit review and still uses the existing checked assignment endpoint', async () => {
  env.jobs[2] = { ...env.jobs[2], status: 'in-progress' }; await mount(); await click('Requested · Synthetic service');
  const assignment = () => tree.root.findAll(node => node.type === 'select' && node.props['aria-label'] === 'Reassign selected job')[0];
  env.review = false; await act(async () => assignment().props.onChange({ target: { value: 'tech-two' } })); assert.equal(env.calls.length, 0); assert.equal(env.jobs[2].assignedTo, 'tech-one');
  env.review = true; await act(async () => assignment().props.onChange({ target: { value: 'tech-two' } }));
  assert.equal(env.calls.length, 1); assert.deepEqual(env.calls[0].data, { action: 'assign', id: 'Requested', memberId: 'tech-two', expectedVersion: 'Requested-v1', reviewStartedWork: true }); assert.equal(env.jobs[2].status, 'in-progress'); assert.equal(env.jobs[2].reassignmentRequest, null);
});
test('a new pending request cannot inherit the explanation drafted for a superseded request', async () => {
  await mount(); await click('Requested · Synthetic service'); await act(async () => notes().props.onChange({ target: { value: 'Explanation for the original request only.' } }));
  env.jobs = env.jobs.map(row => row.id === 'Requested' ? { ...row, reassignmentRequest: request({ id: 'request-two', revision: 1, reason: 'equipment' }) } : row);
  await act(async () => hooks.useInvalidateWorkspace()(['jobs'])); assert.equal(notes().props.value, 'Explanation for the original request only.'); assert.equal(button('Resolve request').props.disabled, true); assert.match(content(), /newer reassignment request/);
  env.discard = false; await click('Review latest request'); assert.equal(notes().props.value, 'Explanation for the original request only.');
  env.discard = true; await click('Review latest request'); assert.equal(notes().props.value, ''); assert.equal(button('Resolve request').props.disabled, false); assert.match(content(), /Equipment or materials unavailable/); assert.equal(env.calls.length, 0);
});
test('checked assignment failures stay visible inside the request drawer and retain the original assignee', async () => {
  await mount(); await click('Requested · Synthetic service'); env.failure = Error('This technician already has another appointment.');
  const assignment = tree.root.findAll(node => node.type === 'select' && node.props['aria-label'] === 'Reassign selected job')[0];
  await act(async () => assignment.props.onChange({ target: { value: 'tech-two' } }));
  const drawer = tree.root.findByProps({ 'aria-label': 'Operational exception review' }); assert.match(textOf(drawer), /already has another appointment/); assert.equal(env.jobs[2].assignedTo, 'tech-one'); assert.equal(env.jobs[2].reassignmentRequest.status, 'pending');
});
test('dispatch details keep canonical work observations separate from read-only dispatcher instructions', async () => {
  env.jobs[2] = { ...env.jobs[2], workNotes: 'Observed exterior equipment damage.\nReported it to dispatch.', dispatchNotes: 'Use gate code 2468.\nEnter from the south.', notes: 'Legacy instruction alias must not replace the canonical instructions.' };
  await mount(); await click('Requested · Synthetic service');
  const work = tree.root.findByProps({ 'aria-label': 'Work notes' }), instructions = tree.root.findByProps({ 'aria-label': 'Job instructions' });
  assert.equal(textOf(work.findByType('p')), env.jobs[2].workNotes);
  assert.equal(textOf(instructions.findByType('p')), env.jobs[2].dispatchNotes);
  assert.doesNotMatch(textOf(work), /gate code|south|Legacy instruction/);
  assert.doesNotMatch(textOf(instructions), /equipment damage/);
  assert.equal(env.calls.length, 0);
});
test('intentionally empty canonical work notes never fall back to legacy dispatcher instructions', async () => {
  env.jobs[2] = { ...env.jobs[2], workNotes: '', notes: 'Legacy site instructions: gate code 1357.' };
  await mount(); await click('Requested · Synthetic service');
  assert.equal(tree.root.findAll(node => node.type === 'section' && node.props['aria-label'] === 'Work notes').length, 0);
  assert.equal(textOf(tree.root.findByProps({ 'aria-label': 'Job instructions' }).findByType('p')), env.jobs[2].notes);
  assert.equal(env.calls.length, 0);
});
