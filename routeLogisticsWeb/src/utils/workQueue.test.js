import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWorkQueue, updateWorkQueue, settleWorkOperation } from './workQueue.js';
const storage = () => { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }; };
test('browser queue preserves work added while an earlier operation is synchronizing', async () => {
  const store = storage(), first = { id: 'first', jobId: 'job', state: 'pending', expectedVersion: 'old' }, added = { id: 'added', jobId: 'job', state: 'pending', expectedVersion: 'old' };
  await updateWorkQueue(store, 'queue', () => [first]);
  const inFlight = readWorkQueue(store, 'queue')[0];
  await updateWorkQueue(store, 'queue', rows => [...rows, added]);
  const result = await updateWorkQueue(store, 'queue', rows => settleWorkOperation(rows, inFlight.id, { status: 'synced', version: 'new' }));
  assert.equal(result.length, 2); assert.equal(result[0].state, 'synced'); assert.equal(result[1].expectedVersion, 'new'); assert.equal(result[1].state, 'pending');
});
test('concurrent browser enqueues do not overwrite each other', async () => {
  const store = storage();
  await Promise.all(Array.from({ length: 30 }, (_, id) => updateWorkQueue(store, 'queue', rows => [...rows, { id, state: 'pending' }], null)));
  assert.equal(readWorkQueue(store, 'queue').length, 30);
});
