const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workspacePermissions, companyProfile, parseInvitationLink } = require('../services/workspacePolicy');
const { loadAppearance, saveAppearance, resolveMode, THEME_KEY } = require('../theme/preferences');

test('missing, pending, and revoked workspace states never grant management or company access', () => {
  for (const status of [undefined, 'pending', 'unavailable', 'verify-email']) {
    for (const claims of [null, { companyId: 'acme', role: 'admin', membershipId: 'old' }]) {
      const permission = workspacePermissions(status ? { status } : null, claims);
      assert.equal(permission.canAccess, false); assert.equal(permission.canManage, false);
    }
  }
});
test('technicians work without administrative permissions; only owner can manage company settings', () => {
  const permission = role => workspacePermissions({ status: 'company' }, { companyId: 'acme', role, membershipId: 'member' });
  const { can, ...tech } = permission('technician');
  assert.deepEqual(tech, { canAccess: true, canManage: false, canEditCompany: false, canViewFinancial: false, isTechnician: true });
  assert.equal(can('jobs.work'), true); assert.equal(can('routes.optimize'), false);
  assert.equal(permission('manager').can('invoices.read'), false); assert.equal(permission('admin').can('invoices.read'), true);
  for (const role of ['manager', 'admin']) { assert.equal(permission(role).canManage, true); assert.equal(permission(role).canEditCompany, false); }
  assert.equal(permission('owner').canEditCompany, true);
  assert.equal(permission('field_tech').canAccess, false);
  assert.equal(workspacePermissions({ status: 'company' }, { companyId: 'acme', role: 'admin' }).canManage, false);
});
test('personal management requires an explicit resolved solo workspace', () => {
  assert.equal(workspacePermissions({ status: 'solo' }, null).canManage, true);
  assert.equal(workspacePermissions({ status: 'solo' }, { companyId: 'acme', role: 'technician' }).canManage, false);
});
test('company object services and business information are displayed without mutating accounting metadata', () => {
  const company = { name: 'Acme', phone: '555-0100', address: '1 Main St', city: 'Town', services: [{ name: 'Termite Inspection', quickbooks_item_id: '30' }, 'Rodent Control', { name: 'Termite Inspection' }], serviceCategories: ['Pest Control'] };
  const before = JSON.stringify(company), profile = companyProfile(company);
  assert.equal(profile.businessName, 'Acme'); assert.equal(profile.businessPhone, '555-0100');
  assert.equal(profile.businessAddress, '1 Main St, Town');
  assert.deepEqual(profile.services, ['Termite Inspection', 'Rodent Control']);
  assert.equal(JSON.stringify(company), before);
});
test('invitation parsing accepts the secret-link format and rejects verification or foreign links', () => {
  const code = 'a'.repeat(64);
  assert.deepEqual(parseInvitationLink(`https://route-logistics.com/accept-invite?id=rl_123#code=${code}`), { inviteId: 'rl_123', code });
  for (const link of ['https://route-logistics.com/__/auth/action?mode=verifyEmail', `https://other.example/accept-invite?id=rl_123#code=${code}`, 'https://route-logistics.com/accept-invite?id=rl_123']) assert.throws(() => parseInvitationLink(link));
});
test('appearance survives a new load and follows system only when selected', async () => {
  const saved = new Map(), storage = { getItem: async key => saved.get(key) || null, setItem: async (key, value) => saved.set(key, value) };
  assert.equal(await loadAppearance(storage), 'system');
  await saveAppearance(storage, 'dark');
  assert.equal(await loadAppearance(storage), 'dark'); assert.equal(saved.get(THEME_KEY), 'dark');
  assert.equal(resolveMode(await loadAppearance(storage), 'light'), 'dark');
  await saveAppearance(storage, 'system'); assert.equal(resolveMode(await loadAppearance(storage), 'light'), 'light');
  assert.equal(resolveMode('system', 'dark'), 'dark');
  await assert.rejects(() => saveAppearance(storage, 'admin'));
  await assert.rejects(() => saveAppearance({ setItem: async () => { throw new Error('disk full'); } }, 'light'));
});
