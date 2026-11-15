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

test('legacy duration is preserved without inventing a duration change during a notes edit', () => {
  const legacy = { ...job, estimatedDuration: undefined, duration: 2 };
  const edit = buildJobEdit(legacy, { ...legacy, estimatedDuration: 2, notes: 'Updated access instructions' }, { by: 'dispatcher' });
  assert.deepEqual(edit.revisions[0].changes.map(change => change.field), ['notes']);
  assert.equal(edit.originalDetails.estimatedDuration, 2);
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

test('ordinary job edits preserve omitted geography and do not create a false location change',()=>{
  const stored={...job,serviceProperty:{address:'Recorded service property',latitude:35,longitude:-119,validated:true},serviceCategory:'Pest Control',serviceAreaExceptionId:'historic-approval'};
  const edit=buildJobEdit(stored,{...job,notes:'A normal work note'},{by:'owner'});
  assert.deepEqual(edit.revisions.at(-1).changes.map(row=>row.field),['notes']);
  assert.deepEqual(edit.originalDetails.serviceProperty,stored.serviceProperty);
  assert.equal(Object.hasOwn(edit,'serviceProperty'),false);
});

test('property, category and explicit exception changes are recorded independently',()=>{
  const stored={...job,serviceProperty:{address:'First property',latitude:35,validated:true},serviceCategory:'Pest Control',serviceAreaExceptionId:'first-approval'};
  const next={...job,serviceProperty:{address:'Second property'},serviceCategory:'Pool Cleaning',serviceAreaExceptionId:null};
  assert.deepEqual(diffJob(stored,next).map(row=>row.field),['serviceProperty','serviceCategory','serviceAreaExceptionId']);
  assert.equal(diffJob(stored,{...job,serviceProperty:{address:'First property'}}).length,0);
});
