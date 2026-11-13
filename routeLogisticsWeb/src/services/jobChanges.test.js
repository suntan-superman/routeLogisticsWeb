import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffJob, buildJobEdit } from './jobChanges.js';

const job = { customerName: 'Mike', serviceType: 'Ants', date: '2026-11-12', time: '09:00', estimatedDuration: 1, address: 'A', totalCost: 75, priority: 'medium', notes: '' };

test('no changes returns null', () => {
  assert.equal(buildJobEdit(job, { ...job, totalCost: '75', notes: ' ' }, { by: 'x' }), null);
});

test('detects changed fields', () => {
  const d = diffJob(job, { ...job, totalCost: 120, date: '2026-11-13' });
  assert.deepEqual(d.map((c) => c.field), ['date', 'totalCost']);
});

test('keeps first original snapshot and appends revisions', () => {
  const first = buildJobEdit(job, { ...job, totalCost: 120 }, { by: 'a', reason: 'more rooms', now: 't1' });
  assert.equal(first.isModified, true);
  assert.equal(first.originalDetails.totalCost, 75);
  const second = buildJobEdit({ ...job, ...first }, { ...job, totalCost: 150 }, { by: 'b', now: 't2' });
  assert.equal(second.originalDetails.totalCost, 75);
  assert.equal(second.revisions.length, 2);
  assert.equal(second.revisions[0].reason, 'more rooms');
});
