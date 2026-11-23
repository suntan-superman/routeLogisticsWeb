import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspaceScope, workspaceAccessError, retryWorkspaceRead, mutationResources, WORKSPACE_POLL_MS } from './workspaceQueryPolicy.js';
const user = { uid: 'synthetic-owner', emailVerified: true };
test('query authority includes project, account, tenant, role, membership, verification and workspace state', () => {
  const first = workspaceScope(user, { companyId: 'one', role: 'owner' }, { status: 'company' });
  assert.equal(first.readable, true); assert.equal(WORKSPACE_POLL_MS, 30000);
  assert.equal(first.key[1], null);
  const configured = workspaceScope(user, { companyId: 'one', role: 'owner' }, { status: 'company' }, 'demo-routelogistics');
  assert.equal(configured.key[1], 'demo-routelogistics'); assert.notEqual(configured.id, first.id);
  for (const next of [workspaceScope({ ...user, uid: 'another' }, { companyId: 'one', role: 'owner' }, { status: 'company' }), workspaceScope(user, { companyId: 'two', role: 'owner' }, { status: 'company' }), workspaceScope(user, { companyId: 'one', role: 'manager', membershipId: 'member' }, { status: 'company' })]) assert.notEqual(first.id, next.id);
  for (const next of [workspaceScope(null, null, null), workspaceScope({ ...user, emailVerified: false }, { companyId: 'one', role: 'owner' }, { status: 'company' }), workspaceScope(user, { companyId: 'one', role: 'manager' }, { status: 'company' }), workspaceScope(user, null, { status: 'pending' })]) assert.equal(next.readable, false);
  assert.equal(workspaceScope(user, null, { status: 'unassociated' }).readable, false);
});
test('authorization errors stop retrying while transient reads get at most one retry', () => {
  for (const code of ['functions/permission-denied', 'unauthenticated', 'not-found', 'workspace-changed']) { assert.equal(workspaceAccessError({ code }), true); assert.equal(retryWorkspaceRead(0, { code }), false); }
  assert.equal(workspaceAccessError({ message: 'Missing or insufficient permissions.' }), true);
  assert.equal(retryWorkspaceRead(0, { code: 'functions/unavailable' }), true); assert.equal(retryWorkspaceRead(1, { code: 'functions/unavailable' }), false);
});
test('only successful writes invalidate affected controls; reads, provider work and GPS never loop', () => {
  assert.deepEqual(mutationResources('rlManageCustomer'), ['customers', 'customer', 'customer-stats', 'jobs', 'job']);
  assert.ok(mutationResources('rlManageJob').includes('jobs'));
  for (const name of ['rlReadWorkspace', 'rlCheckAvailability', 'rlGetTeamLocations', 'rlGetLocationHistoryMembers', 'rlGetLocationHistory', 'rlUpdateWorkLocation', 'rlQuickBooksOptions', 'rlQuickBooksSync', 'rlCreateInvoicePayment', 'rlRequestCustomerOTP']) assert.deepEqual(mutationResources(name), []);
  assert.deepEqual(mutationResources('rlJobVisit', { action: 'list' }), []);
  assert.deepEqual(mutationResources('rlJobException', { action: 'list' }), []);
  assert.deepEqual(mutationResources('rlJobException', { action: 'resolve' }), ['jobs', 'job', 'job-exceptions']);
  assert.deepEqual(mutationResources('rlJobVisit', { action: 'record' }), ['job-visits', 'job', 'jobs']);
  assert.deepEqual(mutationResources('rlSmsCustomerConsent', { action: 'status' }), []);
  assert.deepEqual(mutationResources('rlApplyJobOperation', {}, { status: 'conflict' }), []);
  assert.deepEqual(mutationResources('rlManageJob', {}, { success: false }), []);
  assert.deepEqual(mutationResources('rlManageInvoice', { action: 'preview' }), []);
  for (const action of ['create', 'replace', 'update', 'status']) {
    assert.deepEqual(mutationResources('rlManageInvoice', { action }, { success: false }), []);
    for (const resource of ['invoices','invoice','jobs','job','payments','analytics','reports','invoice-preview']) assert.ok(mutationResources('rlManageInvoice', { action }, { success: true }).includes(resource));
  }
  assert.ok(mutationResources('rlApplyJobOperation', {}, { status: 'synced' }).includes('jobs'));
});
