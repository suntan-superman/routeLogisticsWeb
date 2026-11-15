import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transformSync } from 'esbuild';

function service() {
  const calls = [], staff = { name: 'staff' }, portal = { name: 'portal' }, module = { exports: {} };
  const mocked = name => {
    if (name === 'firebase/functions') return { httpsCallable: (client, endpoint) => async data => { calls.push({ client, endpoint, data }); return { data: { success: true } }; } };
    if (name === './firebase') return { functions: staff };
    if (name === './portal') return { portalFunctions: portal, portalReady: Promise.resolve() };
    throw Error('Unexpected dependency');
  };
  new Function('require', 'module', 'exports', transformSync(fs.readFileSync(new URL('./reviews.js', import.meta.url), 'utf8'), { format: 'cjs' }).code)(mocked, module, module.exports);
  return { ...module.exports, calls, staff, portal };
}

test('secure review invitation credentials accept only bounded IDs and full hex tokens from a fragment', () => {
  const { reviewCredentials } = service(), token = 'a'.repeat(64);
  assert.deepEqual(reviewCredentials('#id=review-invitation&token=' + token), { id: 'review-invitation', token });
  for (const fragment of ['', '#id=../foreign&token=' + token, '#id=' + 'a'.repeat(201) + '&token=' + token, '#id=review&token=short', '#id=review&token=' + 'A'.repeat(64)]) assert.throws(() => reviewCredentials(fragment), /complete review invitation/);
});

test('customer feedback uses the isolated portal client while provider management uses staff functions', async () => {
  const api = service();
  await api.customerReviews('list', { accountId: 'company:synthetic' }); await api.providerReviews('list'); await api.reviewInvitationSettings('status', { companyId: 'synthetic' }); await api.reviewInvitation('get', { id: 'synthetic', token: 'a'.repeat(64) });
  assert.deepEqual(api.calls.map(row => [row.client.name, row.endpoint]), [['portal', 'rlCustomerReviews'], ['staff', 'rlProviderReviews'], ['staff', 'rlReviewInvitationSettings'], ['portal', 'rlReviewInvitation']]);
  assert.equal(api.calls[0].data.accountId, 'company:synthetic');
});
