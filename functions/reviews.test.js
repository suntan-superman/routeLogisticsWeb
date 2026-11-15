const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reviewInput, reviewView, reviewIdFor, completionKeyFor } = require('./reviews');

test('feedback validates ratings, optional comments, arrival answers and explicit publication permission', () => {
  assert.deepEqual(reviewInput({ rating: 1 }), { rating: 1, comment: '', onTime: null, publicConsent: false });
  assert.deepEqual(reviewInput({ rating: 5, comment: ' Good service ', onTime: false, publicConsent: true }), { rating: 5, comment: 'Good service', onTime: false, publicConsent: true });
  for (const input of [{ rating: 0 }, { rating: 6 }, { rating: '5' }, { rating: 2.5 }, { rating: 5, comment: 'a'.repeat(4001) }, { rating: 5, onTime: 'yes' }, { rating: 5, publicConsent: 'true' }]) assert.throws(() => reviewInput(input), error => error.code === 'invalid-argument');
});

test('one deterministic review identity follows a service visit and completion links bind their completion cycle', () => {
  assert.equal(reviewIdFor('visit'), reviewIdFor('visit'));
  assert.notEqual(reviewIdFor('visit'), reviewIdFor('other'));
  const row = at => ({ id: 'visit', get: key => key === 'completedAt' ? at : null });
  assert.equal(completionKeyFor(row('2026-11-14T12:00:00Z')), completionKeyFor(row(new Date('2026-11-14T12:00:00Z'))));
  assert.notEqual(completionKeyFor(row('2026-11-14T12:00:00Z')), completionKeyFor(row('2026-11-14T13:00:00Z')));
});

test('publication eligibility treats genuine negative and positive feedback equally and never publishes automatically', () => {
  for (const rating of [1, 5]) {
    const row = { id: 'review', rating, comment: rating === 1 ? 'Poor service' : 'Good service', publicConsent: true, moderationStatus: 'approved', verifiedService: true, publicStatus: 'published' };
    const view = reviewView(row, { eligible: true });
    assert.equal(view.publicEligible, true);
    assert.equal(view.publicStatus, 'eligible');
    assert.equal(reviewView({ ...row, publicConsent: false }, { eligible: true }).publicEligible, false);
    assert.equal(reviewView(row, { eligible: false }).publicEligible, false);
    assert.equal(reviewView({ ...row, verifiedService: false }, { eligible: true }).publicEligible, false);
    assert.equal(reviewView({ ...row, synthetic: true }, { eligible: true }).publicEligible, false);
  }
});

test('customer review projections omit identities, internal notes and moderation reasons', () => {
  const view = reviewView({ id: 'review', rating: 2, customerName: 'PRIVATE', customerEmail: 'PRIVATE', customerIdentityHash: 'PRIVATE', internalNotes: [{ text: 'PRIVATE' }], moderationHistory: [{ reason: 'PRIVATE' }], providerResponse: { text: 'Public provider response' } });
  assert.equal(view.customerName, undefined); assert.equal(view.customerEmail, undefined); assert.equal(view.customerIdentityHash, undefined); assert.equal(view.internalNotes, undefined); assert.equal(view.moderationHistory, undefined);
  assert.deepEqual(view.providerResponse, { text: 'Public provider response' });
});
