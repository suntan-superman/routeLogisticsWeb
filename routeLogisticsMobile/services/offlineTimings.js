// Privacy-safe operational timings. Events contain only a bounded operation
// category, phase, duration and result; no job/customer identifiers or payloads.
const events = [];
const allowedKinds = new Set(['arrival', 'departure', 'visit', 'notes', 'photo', 'application', 'checklist', 'completion', 'job', 'estimate']);
export function recordOfflineTiming(kind, phase, startedAt, result = 'ok') {
  const safeKind = allowedKinds.has(kind) ? kind : 'job';
  const durationMs = Math.max(0, Date.now() - Number(startedAt || Date.now()));
  events.push({ kind: safeKind, phase: phase === 'sync' ? 'sync' : 'local-save', durationMs, result: ['ok','failed','conflict'].includes(result) ? result : 'failed', at: Date.now() });
  if (events.length > 100) events.splice(0, events.length - 100);
  return durationMs;
}
export const readOfflineTimings = () => events.map(event => ({ ...event }));
export const resetOfflineTimings = () => { events.length = 0; };
