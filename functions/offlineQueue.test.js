const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createQueue, retryDelay } = require('../routeLogisticsMobile/services/offlineQueueCore');
test('persistent queue survives restart and concurrent writes without losing or duplicating work', async () => {
  const data = new Map(), storage = { getItem: async (key) => data.get(key), setItem: async (key, value) => data.set(key, value) };
  const queue = createQueue(storage, 'user-company');
  await Promise.all(Array.from({ length: 30 }, (_, id) => queue.add({ id: String(id), patch: { notes: 'saved' } })));
  await queue.add({ id: '0' }); await queue.patch('0', { state: 'syncing' });
  const restored = createQueue(storage, 'user-company'); assert.equal((await restored.read()).length, 30); assert.equal((await restored.read())[0].state, 'syncing');
  assert.equal((await createQueue(storage, 'other-user-company').read()).length, 0);
  assert.equal(retryDelay(1), 2000); assert.equal(retryDelay(20), 300000);
});
