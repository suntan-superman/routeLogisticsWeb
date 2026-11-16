const { test } = require('node:test');
const assert = require('node:assert/strict');
const { appointmentKind, appointmentPatch } = require('./appointments');

test('historical jobs remain ordinary services without a rewrite', () => {
  assert.equal(appointmentKind({ status: 'completed', totalCost: 75 }), 'service');
  assert.deepEqual(appointmentPatch({ notes: 'instructions' }, { totalCost: 75 }), {});
});
test('estimate visits remain free and completion requires a quote rather than paid-work approval', () => {
  assert.deepEqual(appointmentPatch({ appointmentKind: 'estimate_visit' }, {}, { create: true }), { appointmentKind: 'estimate_visit', billable: false, totalCost: 0, estimatedCost: 0, estimateOutcome: 'estimate_pending' });
  assert.equal(appointmentPatch({ status: 'completed' }, { appointmentKind: 'estimate_visit' }).estimateOutcome, 'quote_needed');
  assert.equal(appointmentPatch({ status: 'completed', estimateOutcome: 'customer_declined' }, { appointmentKind: 'estimate_visit' }).estimateOutcome, 'customer_declined');
  assert.equal(appointmentPatch({ status: 'cancelled' }, { appointmentKind: 'estimate_visit' }).estimateOutcome, 'cancelled_no_access');
});
test('type changes, invalid outcomes and implied fees are rejected', () => {
  for (const input of [{ appointmentKind: 'estimate_visit', billable: true }, { appointmentKind: 'estimate_visit', totalCost: 25 }, { appointmentKind: 'estimate_visit', estimateOutcome: 'approved' }]) assert.throws(() => appointmentPatch(input, {}, { create: true }));
  assert.throws(() => appointmentPatch({ appointmentKind: 'estimate_visit' }, { status: 'scheduled' }), /cannot change/);
  assert.throws(() => appointmentPatch({ estimateOutcome: 'quote_needed' }, {}));
});
