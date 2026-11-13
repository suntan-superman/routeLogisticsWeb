const test = require('node:test');
const assert = require('node:assert');
const { resolveClaims } = require('./claims');

const empty = { companies: [], memberships: [], invites: [] };

test('company owner gets owner claims', () => {
  const r = resolveClaims({ uid: 'u1' }, { ...empty, companies: [{ id: 'c1' }] });
  assert.deepStrictEqual(r.claims, { companyId: 'c1', role: 'owner' });
});

test('active membership yields its role', () => {
  const r = resolveClaims({ uid: 'u2' }, { ...empty, memberships: [{ id: 'm', companyId: 'c1', role: 'technician', status: 'active' }] });
  assert.deepStrictEqual(r.claims, { companyId: 'c1', role: 'technician' });
});

test('inactive membership yields no claims', () => {
  const r = resolveClaims({ uid: 'u2' }, { ...empty, memberships: [{ id: 'm', companyId: 'c1', role: 'technician', status: 'inactive' }] });
  assert.strictEqual(r.claims, null);
});

test('invite is not activated for unverified email', () => {
  const r = resolveClaims({ uid: 'u3', email: 'a@b.com', emailVerified: false }, { ...empty, invites: [{ id: 'i', companyId: 'c1', role: 'manager' }] });
  assert.strictEqual(r.claims, null);
  assert.strictEqual(r.activateInviteId, null);
});

test('invite activates for verified email', () => {
  const r = resolveClaims({ uid: 'u3', email: 'a@b.com', emailVerified: true }, { ...empty, invites: [{ id: 'i', companyId: 'c1', role: 'manager' }] });
  assert.deepStrictEqual(r.claims, { companyId: 'c1', role: 'manager' });
  assert.strictEqual(r.activateInviteId, 'i');
});

test('invite with privileged/unknown role is ignored', () => {
  const r = resolveClaims({ uid: 'u3', email: 'a@b.com', emailVerified: true }, { ...empty, invites: [{ id: 'i', companyId: 'c1', role: 'owner' }] });
  assert.strictEqual(r.claims, null);
});
