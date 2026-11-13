const test = require('node:test');
const assert = require('node:assert/strict');
const { checkInvitation, memberIdFor } = require('./invitations');
const { hash } = require('./security');
const { nextVisit } = require('./recurring');
const { cleanCustomer } = require('./customers');
const { migrationPatch } = require('../scripts/migrate-mf-companies');
const code = 'a'.repeat(64);
const caller = { uid: 'u1', email: 'TECH@EXAMPLE.COM', emailVerified: true };
const invite = { companyId: 'c1', role: 'technician', email: 'tech@example.com', status: 'pending', codeHash: hash(code), expiresAt: 2000 };
test('invite requires correct secret, verified matching email, active expiry and supported role', () => {
  assert.doesNotThrow(() => checkInvitation(invite, caller, code, 1000));
  for (const [data, user, secret, now] of [
    [invite, caller, 'b'.repeat(64), 1000], [invite, { ...caller, emailVerified: false }, code, 1000],
    [invite, { ...caller, email: 'other@example.com' }, code, 1000], [invite, caller, code, 2000],
    [{ ...invite, status: 'inactive' }, caller, code, 1000], [{ ...invite, role: 'field_tech' }, caller, code, 1000],
    [{ ...invite, uid: 'other' }, caller, code, 1000],
  ]) assert.throws(() => checkInvitation(data, user, secret, now));
});
test('accepted invite is idempotent only for the original user and secret', () => {
  assert.doesNotThrow(() => checkInvitation({ ...invite, status: 'active', uid: 'u1' }, caller, code, 3000));
  assert.throws(() => checkInvitation({ ...invite, status: 'active', uid: 'u2' }, caller, code, 1000));
  assert.equal(memberIdFor('c1', ' TECH@example.com '), memberIdFor('c1', 'tech@example.com'));
  assert.notEqual(memberIdFor('c1', caller.email), memberIdFor('c2', caller.email));
});
test('recurrence handles leap days, DST-independent date arithmetic, and rejects invalid plans', () => {
  const plan = { active: true, userId: 'u', customerId: 'c', nextServiceDate: '2028-02-28', frequencyDays: 1 };
  assert.equal(nextVisit(plan).nextServiceDate, '2028-02-29');
  assert.equal(nextVisit({ ...plan, nextServiceDate: '2026-12-31' }).nextServiceDate, '2027-01-01');
  for (const patch of [{ active: false }, { frequencyDays: 0 }, { frequencyDays: 1.5 }, { nextServiceDate: '2026-02-30' }, { price: -1 }]) assert.throws(() => nextVisit({ ...plan, ...patch }));
});
test('import permits only customer fields and normalizes email', () => {
  const row = cleanCustomer({ name: ' Alice ', email: 'ALICE@EXAMPLE.COM', companyId: 'attacker', role: 'owner' });
  assert.equal(row.email, 'alice@example.com');
  assert.equal(row.name, 'Alice');
  assert.equal(row.companyId, undefined);
  assert.equal(row.role, undefined);
  assert.throws(() => cleanCustomer({ name: '' }));
  assert.throws(() => cleanCustomer({ name: 'Alice', email: 'invalid' }));
});
test('migration is additive, idempotent and cannot cross tenants', () => {
  assert.deepEqual(migrationPatch('customers', { email: 'A@EXAMPLE.COM' }, 'c1', 'o'), { companyId: 'c1', userId: 'o', emailNormalized: 'a@example.com' });
  assert.deepEqual(migrationPatch('jobs', { companyId: 'c1', userId: 'old', status: 'legacy' }, 'c1', 'o'), {});
  assert.throws(() => migrationPatch('jobs', { companyId: 'c2' }, 'c1', 'o'));
});
