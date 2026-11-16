// Read-only operational indicators. No status, assignment or appointment is
// changed merely because a clock passes its scheduled time.
const DEFAULT_TIME_ZONE = 'America/Los_Angeles';
const DEFAULT_GRACE_MINUTES = 30;
const REASSIGNMENT_REASONS = Object.freeze({ unavailable: 'Unavailable / emergency', 'schedule-conflict': 'Schedule conflict', vehicle: 'Vehicle problem', equipment: 'Equipment or materials unavailable', access: 'Customer/property access problem', other: 'Other' });
const TERMINAL = new Set(['completed', 'cancelled', 'canceled', 'deleted', 'archived']);
const formatters = new Map();
const wallInstants = new Map();
function millis(value) {
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Date.parse(value);
  if (Number.isFinite(value?.seconds)) return value.seconds * 1000 + (Number(value.nanoseconds) || 0) / 1e6;
  return NaN;
}
function zoneFor(value) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value || DEFAULT_TIME_ZONE }).format(0); return value || DEFAULT_TIME_ZONE; }
  catch { return DEFAULT_TIME_ZONE; }
}
function partsAt(at, zone) {
  if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  const parts = Object.fromEntries(formatters.get(zone).formatToParts(new Date(at)).map(part => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
}
function dayMillis(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const result = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(result) && new Date(result).toISOString().slice(0, 10) === value ? result : null;
}
function clockMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):([0-5]\d)(?:\s*(AM|PM))?$/i.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  if (match[3] ? hour < 1 || hour > 12 : hour > 23) return null;
  return (match[3] ? hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0) : hour) * 60 + Number(match[2]);
}
function wallInstant(day, minute, zone) {
  const desired = day + minute * 60000, offsets = new Set();
  const key = `${zone}:${desired}`;
  if (wallInstants.has(key)) return wallInstants.get(key);
  // Probe both sides of a DST change. Ambiguous fall-back times use the later
  // occurrence; a nonexistent spring-forward time needs review, not a late flag.
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = desired + hours * 3600000;
    offsets.add(partsAt(probe, zone) - probe);
  }
  const candidates = [...offsets].map(offset => desired - offset).filter(at => partsAt(at, zone) === desired);
  const result = candidates.length ? Math.max(...candidates) : null;
  if (wallInstants.size >= 2048) wallInstants.delete(wallInstants.keys().next().value);
  wallInstants.set(key, result); return result;
}
function deriveJobExceptions(job = {}, { now = Date.now(), timeZone, graceMinutes = DEFAULT_GRACE_MINUTES } = {}) {
  const zone = zoneFor(timeZone), at = millis(now);
  const grace = typeof graceMinutes === 'number' && Number.isFinite(graceMinutes) && graceMinutes >= 0 && graceMinutes <= 1440 ? graceMinutes : DEFAULT_GRACE_MINUTES;
  const day = dayMillis(job.date), startMinute = clockMinutes(job.windowStart || job.time), duration = Number(job.estimatedDuration ?? job.duration ?? 1);
  const start = day !== null && startMinute !== null ? wallInstant(day, startMinute, zone) : null;
  const explicitEnd = clockMinutes(job.windowEnd || job.endTime);
  const end = start === null ? null : explicitEnd !== null
    ? wallInstant(day, explicitEnd + (explicitEnd <= startMinute ? 1440 : 0), zone)
    : Number.isFinite(duration) && duration > 0 && duration <= 168 ? start + Math.ceil(duration * 60) * 60000 : null;
  const validSchedule = Number.isFinite(at) && start !== null && end !== null && end > start;
  const evidenceAt = value => { const stamp = millis(value); return Number.isFinite(stamp) && stamp <= at && day !== null && partsAt(stamp, zone) >= day ? stamp : null; };
  const arrived = evidenceAt(job.visitEvidence?.arrivedAt || job.arrivedAt);
  const workStarted = evidenceAt(job.workStartedAt || job.actualStartedAt || job.startedAt);
  const confirmedArrival = arrived !== null, confirmedWorkStart = job.status === 'in-progress' || workStarted !== null;
  const unresolved = !job.deletedAt && !TERMINAL.has(String(job.status || 'scheduled').toLowerCase());
  const potentiallyLate = !!(unresolved && validSchedule && at >= start + grace * 60000 && !confirmedArrival && !confirmedWorkStart);
  const overdue = !!(unresolved && validSchedule && at > end);
  const reassignmentRequested = job.reassignmentRequest?.status === 'pending';
  const indicators = [];
  if (potentiallyLate) indicators.push({ code: 'potentially-late', label: 'Potentially late', detail: `No arrival confirmed after the ${grace}-minute grace period. The technician may be working offline.` });
  if (overdue) indicators.push({ code: 'overdue', label: 'Overdue', detail: 'The scheduled appointment end has passed and the job is unresolved. Review with the assigned technician.' });
  if (reassignmentRequested) indicators.push({ code: 'reassignment-requested', label: 'Reassignment requested', detail: REASSIGNMENT_REASONS[job.reassignmentRequest.reason] || 'Management review requested.' });
  return { potentiallyLate, overdue, reassignmentRequested, needsAttention: indicators.length > 0 || job.assignmentNeedsAttention === true, indicators, validSchedule,
    startAt: start === null ? null : new Date(start).toISOString(), endAt: end === null ? null : new Date(end).toISOString(), graceMinutes: grace, timeZone: zone, confirmedArrival, confirmedWorkStart };
}
module.exports = { deriveJobExceptions, REASSIGNMENT_REASONS, DEFAULT_TIME_ZONE, DEFAULT_GRACE_MINUTES };
