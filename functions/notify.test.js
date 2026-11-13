const { test } = require('node:test');
const assert = require('node:assert');
const { assignmentTarget, buildAssignmentMessage } = require('./notify');

const member = { uid: 'u1', companyId: 'c1', status: 'active' };

test('notifies the newly assigned member', () => {
  assert.strictEqual(assignmentTarget({ assignedTo: null }, { assignedTo: 'm1', companyId: 'c1' }, member), 'u1');
});

test('no notification when assignment is unchanged or cleared', () => {
  assert.strictEqual(assignmentTarget({ assignedTo: 'm1' }, { assignedTo: 'm1', companyId: 'c1' }, member), null);
  assert.strictEqual(assignmentTarget({ assignedTo: 'm1' }, { assignedTo: null, companyId: 'c1' }, member), null);
});

test('no notification for pending invites (no uid) or cross-tenant members', () => {
  assert.strictEqual(assignmentTarget({}, { assignedTo: 'm1', companyId: 'c1' }, { companyId: 'c1' }), null);
  assert.strictEqual(assignmentTarget({}, { assignedTo: 'm1', companyId: 'c1' }, { uid: 'u1', companyId: 'c2' }), null);
  assert.strictEqual(assignmentTarget({}, { assignedTo: 'm1', companyId: 'c1' }, null), null);
});

test('message includes service, customer and time', () => {
  const m = buildAssignmentMessage({ serviceType: 'Termite', customerName: 'Bob', date: '2026-11-20', time: '09:00' }, 'j1');
  assert.strictEqual(m.body, 'Termite · Bob · 2026-11-20 09:00');
  assert.strictEqual(m.data.jobId, 'j1');
});
