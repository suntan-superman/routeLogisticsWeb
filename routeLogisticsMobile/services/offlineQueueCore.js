// Storage-independent queue mechanics are exercised with restart and race tests.
function createQueue(storage, key, notify = () => {}) {
  let tail = Promise.resolve();
  const edit = (change) => {
    const work = tail.then(async () => { const rows = JSON.parse(await storage.getItem(key) || '[]'); const result = await change(rows); await storage.setItem(key, JSON.stringify(rows)); notify(); return result; });
    tail = work.catch(() => {}); return work;
  };
  return {
    read: async () => { await tail; return JSON.parse(await storage.getItem(key) || '[]'); },
    add: (row) => edit((rows) => { if (!rows.some((entry) => entry.id === row.id)) rows.push({ ...row, state: 'pending', attempts: 0, nextAttempt: 0 }); }),
    edit,
    patch: (id, values) => edit((rows) => { const row = rows.find((entry) => entry.id === id); if (row) Object.assign(row, values); }),
  };
}
const retryDelay = (attempt) => Math.min(300000, 2000 * 2 ** Math.max(0, attempt - 1));
module.exports = { createQueue, retryDelay };
