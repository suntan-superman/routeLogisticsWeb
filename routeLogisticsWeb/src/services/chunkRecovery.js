const RELOAD_KEY = 'rl:last-failed-chunk-reload';

export function isChunkLoadError(error) {
  const message = String(error?.message || error || '');
  return /failed to fetch dynamically imported module|importing a module script failed|loading (?:css )?chunk .+ failed/i.test(message);
}

export function recoverFailedChunk(event, { storage, reload } = {}) {
  if (!isChunkLoadError(event?.payload)) return false;
  if (!storage || typeof reload !== 'function') return false;
  const failedChunk = String(event.payload?.message || '');
  try {
    if (storage?.getItem(RELOAD_KEY) === failedChunk) return false;
    storage?.setItem(RELOAD_KEY, failedChunk);
  } catch {
    return false;
  }
  event.preventDefault();
  reload();
  return true;
}
