const { randomBytes } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { documentId, hash, rateLimit } = require('./security');
const { requireCapability } = require('./access');

const MAX_PERIODS = 32;
const REASONS = new Set(['sick', 'vacation', 'off-duty', 'emergency', 'other']);
const millis = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
const availabilityId = (companyId, uid) => hash(`${companyId}:${uid}`);
const availabilityRef = (db, companyId, uid) => db.doc(`rlStaffAvailability/${availabilityId(companyId, uid)}`);
const validPeriod = period => period && ['available', 'unavailable'].includes(period.status) && REASONS.has(period.reason) && Number.isFinite(millis(period.startsAt)) && millis(period.endsAt) > millis(period.startsAt);
function periodsFor(data) { return (Array.isArray(data?.periods) ? data.periods : []).filter(validPeriod); }
function selectedPeriod(data, now) { return periodsFor(data).findLast(period => millis(period.startsAt) <= now && millis(period.endsAt) > now); }
function availabilityView(data, now = Date.now()) {
  const periods = periodsFor(data), selected = selectedPeriod(data, now);
  const pending = periods.filter(period => millis(period.startsAt) > now).sort((a, b) => millis(a.startsAt) - millis(b.startsAt));
  const displayed = selected || (pending[0] ? selectedPeriod(data, millis(pending[0].startsAt)) : null);
  return { state: selected?.status || 'normal', active: !!selected, revision: Number(data?.revision) || 0, fieldWorkEnabled: data?.fieldWorkEnabled !== false,
    reason: displayed?.reason || '', startsAt: displayed?.startsAt || null, endsAt: displayed?.endsAt || null,
    scheduled: periods.filter(period => millis(period.endsAt) > now).length, status: displayed?.status || null,
    nextChangeAt: periods.flatMap(period => [millis(period.startsAt), millis(period.endsAt)]).filter(time => time > now).sort((a, b) => a - b).map(time => new Date(time).toISOString())[0] || null,
  };
}
function assertAvailable(data, now = Date.now()) {
  const period = selectedPeriod(data, now);
  if (period?.status === 'unavailable') throw new HttpsError('failed-precondition', `You are marked unavailable (${period.reason}) until ${period.endsAt}. Ask an owner or manager to update availability before starting a shift.`, { reason: 'staff-unavailable' });
}
const formatters = new Map();
function localMinute(at, timeZone) {
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  const parts = Object.fromEntries(formatters.get(timeZone).formatToParts(new Date(at)).map(part => [part.type, part.value]));
  return Math.floor(Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`) / 86400000) * 1440 + Number(parts.hour) * 60 + Number(parts.minute);
}
function wallSpan(start, end, timeZone) {
  const first = Math.floor(start / 60000), last = Math.ceil(end / 60000);
  const offset = minute => localMinute(minute * 60000, timeZone) - minute;
  let previous = first, previousOffset = offset(first), low = first + previousOffset, high = last + offset(last);
  // A wall-clock scheduler cannot distinguish the two occurrences of a repeated
  // hour. Include their union instead of dropping or shortening a real absence.
  while (previous < last) {
    const next = Math.min(previous + 1440, last), nextOffset = offset(next);
    if (nextOffset !== previousOffset) {
      let left = previous, right = next;
      while (left + 1 < right) { const middle = Math.floor((left + right) / 2); if (offset(middle) === previousOffset) left = middle; else right = middle; }
      low = Math.min(low, right + nextOffset); high = Math.max(high, right + previousOffset);
    }
    previous = next; previousOffset = nextOffset;
  }
  return { start: low, end: high };
}
// Newer periods take precedence, so a short emergency call-out can temporarily
// override a vacation without erasing the remainder of that vacation.
function unavailableIntervals(data, timeZone = 'America/Los_Angeles') {
  const periods = periodsFor(data), points = [...new Set(periods.flatMap(period => [millis(period.startsAt), millis(period.endsAt)]))].sort((a, b) => a - b), blocked = [];
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index], end = points[index + 1], selected = selectedPeriod(data, start);
    if (selected?.status !== 'unavailable') continue;
    const span = { ...wallSpan(start, end, timeZone), reason: selected.reason };
    if (span.end <= span.start) continue;
    const previous = blocked.at(-1);
    if (previous?.end === span.start && previous.reason === span.reason) previous.end = span.end;
    else blocked.push(span);
  }
  return blocked;
}
async function assertActor(tx, db, scope) {
  const [company, deletion] = await Promise.all([tx.get(db.doc(`companies/${documentId(scope.companyId)}`)), tx.get(db.doc(`rlAccountDeletions/${documentId(scope.uid)}`))]);
  if (!company.exists || company.get('isActive') === false || company.get('deletedAt') || deletion.exists) throw new HttpsError('permission-denied', 'This workspace is no longer available.');
  if (scope.role === 'owner') {
    if (company.get('ownerId') !== scope.uid) throw new HttpsError('permission-denied', 'Company ownership changed. Refresh before continuing.');
  } else {
    const member = await tx.get(db.doc(`teamMembers/${documentId(scope.memberId)}`));
    if (scope.role !== 'manager' || member.get('status') !== 'active' || member.get('companyId') !== scope.companyId || member.get('uid') !== scope.uid || member.get('role') !== scope.role) throw new HttpsError('permission-denied', 'Your management access changed. Refresh before continuing.');
  }
  return company;
}
async function resolveTarget(tx, db, company, memberId) {
  let id = documentId(memberId, 'team member'), uid, role;
  if (id === company.get('ownerId')) { uid = id; role = 'owner'; }
  else {
    const member = await tx.get(db.doc(`teamMembers/${id}`));
    if (member.get('companyId') !== company.id || member.get('status') !== 'active' || !member.get('uid') || !['admin', 'manager', 'technician'].includes(member.get('role'))) throw new HttpsError('failed-precondition', 'Select an active member of this company. Availability cannot restore revoked company access.');
    uid = documentId(member.get('uid'), 'team account'); role = member.get('role');
    if (uid === company.get('ownerId')) { id = uid; role = 'owner'; }
  }
  if ((await tx.get(db.doc(`rlAccountDeletions/${uid}`))).exists) throw new HttpsError('failed-precondition', 'This account no longer has company access.');
  return { id, uid, role };
}
function parsePeriod(data, now) {
  if (!['available', 'unavailable'].includes(data.status) || !REASONS.has(data.reason)) throw new HttpsError('invalid-argument', 'Choose an availability status and reason.');
  const timestamp = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return NaN;
    const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(calendar.getTime()) && calendar.toISOString().slice(0, 10) === value.slice(0, 10) ? Date.parse(value) : NaN;
  };
  const start = timestamp(data.startsAt), end = timestamp(data.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= now || start < now - 86400000 || start > now + 366 * 86400000 || end - start > 180 * 86400000) throw new HttpsError('invalid-argument', 'Choose a valid future end time, with an availability period of no more than 180 days.');
  return { id: randomBytes(16).toString('hex'), status: data.status, reason: data.reason, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() };
}
function staffAvailabilityHandlers(db, { now = () => Date.now() } = {}) {
  return async request => {
    const scope = await requireCapability(db, request, 'dispatch.manage'), data = request.data || {}, time = now();
    if (!scope.companyId || !['owner', 'manager'].includes(scope.role)) throw new HttpsError('permission-denied', 'Only a company owner or manager can change staff availability.');
    if (data.companyId !== undefined && data.companyId !== scope.companyId) throw new HttpsError('permission-denied', 'Choose a member of your company.');
    if (!['set', 'clear', 'set-field-work'].includes(data.action)) throw new HttpsError('invalid-argument', 'Choose an availability action.');
    const fieldWorkAction = data.action === 'set-field-work';
    if (fieldWorkAction && typeof data.fieldWorkEnabled !== 'boolean') throw new HttpsError('invalid-argument', 'Choose whether this staff member can receive field assignments.');
    if (!Number.isInteger(data.expectedRevision) || data.expectedRevision < 0) throw new HttpsError('invalid-argument', 'Refresh staff availability before saving.');
    const period = data.action === 'set' ? parsePeriod(data, time) : null;
    await rateLimit(db, 'staff-availability', scope.uid, 30);
    return db.runTransaction(async tx => {
      const company = await assertActor(tx, db, scope), person = await resolveTarget(tx, db, company, data.memberId);
      const ref = availabilityRef(db, scope.companyId, person.uid), lock = db.doc(`rlScheduleLocks/${hash(`company:${scope.companyId}:${person.uid}`)}`), shiftRef = db.doc(`rlWorkShifts/${availabilityId(scope.companyId, person.uid)}`), locationRef = db.doc(`rlLocations/${availabilityId(scope.companyId, person.uid)}`);
      const [saved, lockRow, shift, location] = await Promise.all([tx.get(ref), tx.get(lock), tx.get(shiftRef), tx.get(locationRef)]);
      const previous = saved.data(), revision = Number(previous?.revision) || 0;
      if (revision !== data.expectedRevision) throw new HttpsError('aborted', 'Staff availability changed. Refresh the team before saving again.');
      const periods = fieldWorkAction ? periodsFor(previous) : data.action === 'clear' ? [] : [...periodsFor(previous).filter(item => millis(item.endsAt) > time), period];
      if (periods.length > MAX_PERIODS) throw new HttpsError('resource-exhausted', 'There are too many pending availability periods. Restore normal availability before replacing the schedule.');
      const fieldWorkEnabled = fieldWorkAction ? data.fieldWorkEnabled : previous?.fieldWorkEnabled !== false;
      const next = { companyId: scope.companyId, userId: person.uid, memberId: person.id, periods, fieldWorkEnabled, revision: revision + 1, updatedBy: scope.uid, updatedAt: new Date(time).toISOString() };
      const availability = availabilityView(next, time), stopping = !fieldWorkAction && availability.state === 'unavailable';
      tx.set(ref, next);
      tx.set(lock, { companyId: scope.companyId, technicianUid: person.uid, revision: (Number(lockRow.get('revision')) || 0) + 1, updatedAt: next.updatedAt });
      if (stopping && shift.get('status') === 'on-duty') {
        const ended = { ...shift.data(), status: 'off-duty', endedAt: new Date(time), endReason: 'supervisor-unavailable' };
        tx.set(shiftRef, ended);
        tx.set(db.doc(`rlWorkShiftEvents/${shift.get('id')}-availability-${next.revision}`), { ...ended, event: 'end', actorId: scope.uid, recordedAt: new Date(time) });
      }
      if (stopping && location.get('sharing') === true) tx.update(locationRef, { sharing: false, stoppedAt: new Date(time) });
      tx.create(db.collection('rlAudit').doc(), { action: fieldWorkAction ? 'staff.fieldWork.update' : `staff.availability.${data.action}`, companyId: scope.companyId, actorId: scope.uid, memberId: person.id, userId: person.uid, before: fieldWorkAction ? { fieldWorkEnabled: previous?.fieldWorkEnabled !== false } : previous?.periods || [], after: fieldWorkAction ? { fieldWorkEnabled } : periods, revision: next.revision, createdAt: next.updatedAt });
      return { memberId: person.id, fieldWorkEnabled, availability, shiftStopped: stopping && shift.get('status') === 'on-duty', message: fieldWorkAction ? fieldWorkEnabled ? 'Field assignments enabled. Existing role and availability restrictions still apply.' : 'Marked office-only. Existing jobs, work history and shift consent are unchanged.' : stopping ? 'Staff marked unavailable. Existing jobs remain scheduled for dispatcher review.' : 'Availability updated. Duty and location sharing still require the employee to start a shift.' };
    });
  };
}
module.exports = { staffAvailabilityHandlers, availabilityId, availabilityRef, availabilityView, assertAvailable, unavailableIntervals, periodsFor, selectedPeriod, parsePeriod, wallSpan };
