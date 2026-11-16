// One ordered writer per exact-scope/job key. The first native write starts in
// the input handler's call stack; no read, debounce or component effect precedes
// it. Later writes keep their ordering, including CAS acknowledgements.
function createWorkNoteDraftStore(storage, key) {
  let tail = null, latest = null;
  const run = change => {
    let task;
    try { task = tail ? tail.catch(() => {}).then(change) : Promise.resolve(change()); }
    catch (error) { task = Promise.reject(error); }
    tail = task;
    task.then(() => { if (tail === task) tail = null; }, () => { if (tail === task) tail = null; });
    return task;
  };
  return {
    peek: () => latest,
    persist(record) {
      latest = record;
      return run(() => storage.setItem(key, JSON.stringify(record)).then(() => record));
    },
    async read() {
      if (tail) await tail;
      const record = JSON.parse(await storage.getItem(key) || 'null');
      // A storage read can finish after a new input started its write. It must
      // never replace that newer in-memory baseline.
      if (!latest) latest = record;
      return record;
    },
    compareAndSet(revision, transform) {
      return run(async () => {
        const current = JSON.parse(await storage.getItem(key) || 'null');
        if (!current || current.revision !== revision) return { changed: false, current };
        const next = transform(current);
        if (!next) return { changed: false, current };
        await storage.setItem(key, JSON.stringify(next));
        if (latest?.revision === revision) latest = next;
        return { changed: true, current: next };
      });
    },
    archive(record) { return run(() => storage.setItem(`${key}:discarded:${record.revision}`, JSON.stringify(record))); },
  };
}
module.exports = { createWorkNoteDraftStore };
