const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workspacePermissions } = require('../services/workspacePolicy');
const { canUseManagementMode, workspaceModeKey, permittedMode, loadWorkspaceMode, saveWorkspaceMode,
  personalJobs, personalRouteMember } = require('../services/mobileMode');
const person = (role, companyId = 'acme', id = 'staff') => ({ id, companyId, role, membershipId: 'membership', workspace: { status: 'company' } });
const permissions = user => workspacePermissions(user.workspace, user);
const memoryStorage = () => { const rows = new Map(); return { rows, getItem: async key => rows.get(key) || null, setItem: async (key, value) => { rows.set(key, value); } }; };

test('mobile mode follows existing role capabilities without elevating admin or technician access', () => {
  for (const role of ['owner', 'manager', 'admin']) {
    const user = person(role), p = permissions(user);
    assert.equal(canUseManagementMode(user, p), true);
    assert.equal(permittedMode('management', user, p), 'management');
    assert.equal(p.can('ownership.transfer'), role === 'owner');
    assert.equal(p.can('integrations.manage'), role === 'owner');
  }
  const tech = person('technician');
  assert.equal(canUseManagementMode(tech, permissions(tech)), false);
  assert.equal(permittedMode('management', tech, permissions(tech)), 'field');
  assert.equal(canUseManagementMode(person('owner'), { canAccess: false, can: () => true }), false);
  assert.equal(canUseManagementMode({ ...person('owner'), companyId: null }, { canAccess: true, can: () => true }), false);
});

test('new eligible users default to field and remembered mode is scoped to both user and company', async () => {
  const storage = memoryStorage(), user = person('owner');
  assert.equal(await loadWorkspaceMode(storage, user, permissions(user)), 'field');
  await saveWorkspaceMode(storage, user, permissions(user), 'management');
  assert.equal(await loadWorkspaceMode(storage, user, permissions(user)), 'management');
  for (const other of [person('owner', 'other'), person('owner', 'acme', 'other-user')]) {
    assert.notEqual(workspaceModeKey(other), workspaceModeKey(user));
    assert.equal(await loadWorkspaceMode(storage, other, permissions(other)), 'field');
  }
  const values = [...storage.rows.values()];
  assert.deepEqual(values, ['management']);
});

test('a forged or remembered management preference grants no access after revocation', async () => {
  const storage = memoryStorage(), user = person('manager'), technician = person('technician');
  storage.rows.set(workspaceModeKey(user), 'management');
  assert.equal(await loadWorkspaceMode(storage, technician, permissions(technician)), 'field');
  assert.equal(await loadWorkspaceMode(storage, user, { canAccess: false, can: () => false }), 'field');
  await assert.rejects(saveWorkspaceMode(storage, technician, permissions(technician), 'management'));
  await assert.rejects(saveWorkspaceMode(storage, user, permissions(user), 'owner'));
});

test('rapid switches serialize preference writes and storage failure remains retryable', async () => {
  const user = person('manager'), rows = new Map(), releases = [];
  const storage = { getItem: async key => rows.get(key), setItem: (key, value) => new Promise(resolve => { releases.push(() => { rows.set(key, value); resolve(); }); }) };
  const first = saveWorkspaceMode(storage, user, permissions(user), 'management');
  const second = saveWorkspaceMode(storage, user, permissions(user), 'field');
  await Promise.resolve(); await Promise.resolve(); assert.equal(releases.length, 1);
  releases.shift()(); await first; await Promise.resolve(); await Promise.resolve();
  assert.equal(releases.length, 1); releases.shift()(); await second;
  assert.equal(await loadWorkspaceMode(storage, user, permissions(user)), 'field');
  await assert.rejects(saveWorkspaceMode({ setItem: async () => { throw Error('Storage unavailable'); } }, user, permissions(user), 'field'));
  const normal = memoryStorage(); await saveWorkspaceMode(normal, user, permissions(user), 'management');
  assert.equal(await loadWorkspaceMode(normal, user, permissions(user)), 'management');
});

test('personal work includes only matching current assignments and tenant, with authoritative UID precedence', () => {
  const user = person('manager');
  const rows = [
    { id: 'member', companyId: 'acme', assignedTo: 'membership' },
    { id: 'uid', companyId: 'acme', assignedTo: 'staff' },
    { id: 'resolved', companyId: 'acme', assignedTo: 'old-alias', assignedToUid: 'staff' },
    { id: 'reused', companyId: 'acme', assignedTo: 'membership', assignedToUid: 'other' },
    { id: 'other', companyId: 'acme', assignedTo: 'other' },
    { id: 'foreign', companyId: 'other', assignedTo: 'membership', assignedToUid: 'staff' },
    { id: 'unassigned', companyId: 'acme' },
  ];
  assert.deepEqual(personalJobs(rows, user).map(job => job.id), ['member', 'uid', 'resolved']);
  assert.deepEqual(personalJobs([{ id: 'solo', userId: 'staff' }, { id: 'other', userId: 'other' }, rows[0]], { id: 'staff' }).map(job => job.id), ['solo']);
});

test('owner route uses the owner UID while manager and technician use their membership identity', () => {
  assert.equal(personalRouteMember(person('owner')), 'staff');
  for (const role of ['manager', 'technician', 'admin']) assert.equal(personalRouteMember(person(role)), 'membership');
});

test('calendar day labels and date ranges remain stable in Pacific, Eastern and UTC near daylight-saving changes', () => {
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const cwd = path.resolve(__dirname, '..');
  const script = `const {dayLabel}=require('./services/workPresentation');const {periodRange,localDay}=require('./services/workQueryPolicy');console.log(JSON.stringify({spring:dayLabel('2026-03-08'),fall:dayLabel('2026-11-01'),week:periodRange('week','2026-03-08'),month:periodRange('month','2026-11-01'),instant:localDay(new Date('2026-11-15T01:30:00Z'))}));`;
  const rows = ['America/Los_Angeles', 'America/New_York', 'UTC'].map(TZ => JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd, env: { ...process.env, TZ }, encoding: 'utf8', windowsHide: true })));
  for (const row of rows) {
    assert.match(row.spring, /Mar 8/); assert.match(row.fall, /Nov 1/);
    assert.deepEqual(row.week, { startDate: '2026-03-08', endDate: '2026-03-14' });
    assert.deepEqual(row.month, { startDate: '2026-11-01', endDate: '2026-11-30' });
  }
  assert.deepEqual(rows.map(row => row.instant), ['2026-11-14', '2026-11-14', '2026-11-15']);
});
