const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workspaceStatus } = require('./workspace');
function database(profile = {}, rows = []) {
  const snap = data => ({ get: key => data[key] });
  return { collection(name) {
    const filters = [];
    return { doc: () => ({ get: async () => snap(name === 'companies' ? { name: 'Acme' } : profile) }),
      where(field, operator, value) { filters.push(row => row[field] === value); return this; }, limit() { return this; },
      get: async () => ({ docs: rows.filter(row => filters.every(filter => filter(row))).map(row => ({ id: row.id, ...snap(row) })) }),
    };
  } };
}
const caller = { uid: 'luis', email: 'luis@example.com', emailVerified: true };
test('verified pending staff are not solo and no invitation secret is disclosed or consumed', async () => {
  const rows = [{ id: 'invite', email: caller.email, status: 'pending', role: 'technician', companyId: 'acme', expiresAt: 2000, codeHash: 'private' }];
  const result = await workspaceStatus(database({}, rows), caller, null, 1000);
  assert.deepEqual(result, { status: 'pending', invitations: [{ id: 'invite', companyName: 'Acme', role: 'technician', expired: false }] });
  assert.equal(rows[0].status, 'pending'); assert.equal(rows[0].uid, undefined);
});
test('unverified callers receive no pending company information', async () => {
  assert.deepEqual(await workspaceStatus(null, { ...caller, emailVerified: false }, null), { status: 'verify-email' });
});
test('expired invitations remain blocked and are clearly identified', async () => {
  const result = await workspaceStatus(database({}, [{ email: caller.email, status: 'pending', role: 'technician', companyId: 'acme', expiresAt: 1 }]), caller, null, 1000);
  assert.equal(result.status, 'pending'); assert.equal(result.invitations[0].expired, true);
});
test('removed, legacy, and previously associated members cannot become solo by losing claims', async () => {
  for (const profile of [{ rlCompanyId: 'acme' }, { companyId: 'acme' }, { role: 'field_tech' }, { role: 'supervisor' }]) assert.equal((await workspaceStatus(database(profile), caller, null)).status, 'unavailable');
  assert.equal((await workspaceStatus(database({}, [{ uid: caller.uid, status: 'removed' }]), caller, null)).status, 'unavailable');
});
test('resolved active members and genuinely independent users keep their appropriate workspace', async () => {
  assert.equal((await workspaceStatus(null, caller, { companyId: 'acme', role: 'technician' })).status, 'company');
  assert.equal((await workspaceStatus(database(), caller, null)).status, 'solo');
});
