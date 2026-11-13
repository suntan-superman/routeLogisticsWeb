const serial = new Map();
export const readWorkQueue = (storage, key) => {
  const rows = JSON.parse(storage.getItem(key) || '[]');
  if (!Array.isArray(rows)) throw new Error('Saved work could not be read. Keep this browser data and contact your administrator.');
  return rows;
};
// Update only against the latest persisted queue. Web Locks also serialize tabs;
// the in-process chain supports browsers without Web Locks.
export function updateWorkQueue(storage, key, change, locks = globalThis.navigator?.locks) {
  const edit = () => { const rows = change(readWorkQueue(storage, key)); storage.setItem(key, JSON.stringify(rows)); return rows; };
  if (locks?.request) return locks.request(key, edit);
  const next = (serial.get(key) || Promise.resolve()).catch(() => {}).then(edit);
  serial.set(key, next);
  return next.finally(() => { if (serial.get(key) === next) serial.delete(key); });
}
export function settleWorkOperation(rows, id, result) {
  const index = rows.findIndex(row => row.id === id);
  if (index < 0) return rows;
  const next = rows.map(row => ({ ...row }));
  next[index] = { ...next[index], state: result.status, message: result.message || '' };
  if (result.status === 'synced') {
    const following = next.slice(index + 1).find(row => row.jobId === next[index].jobId && row.state === 'pending');
    if (following) following.expectedVersion = result.version;
  }
  return next;
}
