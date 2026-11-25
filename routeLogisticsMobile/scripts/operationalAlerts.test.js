const { test } = require('node:test');
const assert = require('node:assert/strict');
const { blockedByAlertAcknowledgment, createQueue } = require('../services/offlineQueueCore');

test('critical acknowledgment blocks dependent work until server confirmation', async () => {
  const storage = new Map();
  const adapter = { getItem: async key => storage.get(key), setItem: async (key, value) => storage.set(key, value) };
  const queue = createQueue(adapter, 'account:company:queue');
  await queue.add({ id: 'ack', kind: 'alert-ack', jobId: 'job-a', alertKey: 'property:alert:1', occurredAt: '2026-11-24T10:00:00Z' });
  await queue.add({ id: 'arrival', kind: 'visit', jobId: 'job-a', record: { type: 'arrived' } });
  await queue.add({ id: 'completion', kind: 'job', jobId: 'job-a', patch: { status: 'completed' } });
  const restartedQueue = createQueue(adapter, 'account:company:queue');
  const rows = await restartedQueue.read();
  assert.equal(rows[0].occurredAt, '2026-11-24T10:00:00Z');
  assert.equal(rows[0].alertKey, 'property:alert:1');
  assert.equal(blockedByAlertAcknowledgment(rows[1], rows), true);
  assert.equal(blockedByAlertAcknowledgment(rows[2], rows), true);
  assert.equal(blockedByAlertAcknowledgment({ kind: 'visit', jobId: 'job-a', record: { type: 'access-blocked' } }, rows), false);
  assert.equal(blockedByAlertAcknowledgment({ kind: 'job', jobId: 'job-b' }, rows), false);
  await queue.patch('ack', { state: 'failed' });
  assert.equal(blockedByAlertAcknowledgment((await queue.read())[1], await queue.read()), true);
  await queue.patch('ack', { state: 'synced' });
  assert.equal(blockedByAlertAcknowledgment((await queue.read())[1], await queue.read()), false);
  assert.equal((await queue.read())[1].state, 'pending');
});
