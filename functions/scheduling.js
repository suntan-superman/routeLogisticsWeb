const { HttpsError } = require('firebase-functions/v2/https');
const { documentId, hash, rateLimit } = require('./security');
const { requireCapability, checkJob, hasCapability } = require('./access');

const DAY = 1440, MAX_ROWS = 5000, MAX_PLANS = 5000;
const TERMINAL = new Set(['completed', 'cancelled', 'canceled', 'deleted', 'archived']);
const DEFAULT_WINDOW = { start: '08:00', end: '18:00', days: [0, 1, 2, 3, 4, 5, 6], source: 'default' };
const read = (tx, ref) => tx ? tx.get(ref) : ref.get();
const scopeKey = scope => scope.companyId ? `company:${scope.companyId}` : `user:${scope.uid}`;
const busy = job => !job.deletedAt && !TERMINAL.has(String(job.status || 'scheduled').toLowerCase());
const failure = (message, result = {}) => new HttpsError('failed-precondition', message, { scheduling: { available: false, reason: message, conflicts: [], alternatives: [], ...result } });

function dateDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpsError('invalid-argument', 'Choose a valid appointment date.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new HttpsError('invalid-argument', 'Choose a valid appointment date.');
  return Math.floor(date.getTime() / 86400000);
}
const dayDate = day => new Date(day * 86400000).toISOString().slice(0, 10);
function clockMinutes(value) {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'Choose a valid appointment time.');
  const raw = value.trim(), canonical = /^(\d{1,2}):([0-5]\d)$/.exec(raw), legacy = /^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i.exec(raw);
  if (canonical && Number(canonical[1]) < 24) return Number(canonical[1]) * 60 + Number(canonical[2]);
  if (legacy && Number(legacy[1]) >= 1 && Number(legacy[1]) <= 12) return (Number(legacy[1]) % 12 + (legacy[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(legacy[2]);
  throw new HttpsError('invalid-argument', 'Choose a valid appointment time.');
}
const clock = value => `${String(Math.floor(((value % DAY) + DAY) % DAY / 60)).padStart(2, '0')}:${String(((value % 60) + 60) % 60).padStart(2, '0')}`;
function interval(job, { stored = false } = {}) {
  const start = dateDay(job.date) * DAY + clockMinutes(job.time);
  const hours = Number(job.estimatedDuration ?? job.duration ?? 1);
  if (!Number.isFinite(hours) || hours <= 0 || hours > (stored ? 168 : 24)) throw new HttpsError('invalid-argument', 'Choose an appointment duration greater than zero and no more than 24 hours.');
  return { start, end: start + Math.ceil(hours * 60), durationMinutes: Math.ceil(hours * 60) };
}
const overlaps = (first, second) => first.start < second.end && second.start < first.end;
function changedSchedule(before, next) {
  if (!before || !Object.keys(before).length) return !!next?.assignedTo;
  if (next && String(before.assignedTo ?? '') !== String(next.assignedTo ?? '')) return true;
  if (!next || !busy(next)) return !!before.assignedTo && busy(before);
  if (!next.assignedTo) return !!before.assignedTo;
  const durationKey = value => { const raw = value.estimatedDuration ?? value.duration ?? 1; return Number.isFinite(Number(raw)) ? Number(raw) : String(raw); };
  return !busy(before) || ['date', 'time', 'assignedTo'].some(key => String(before[key] ?? '') !== String(next[key] ?? '')) || durationKey(before) !== durationKey(next);
}
function conflictRows(rows, assignee, candidate, excludeJobId) {
  if (!assignee) return [];
  const aliases = new Set(assignee.aliases || [assignee.id, assignee.uid]);
  return rows.filter(row => row.id !== excludeJobId && (row.assignedToUid ? row.assignedToUid === assignee.uid : aliases.has(row.assignedTo)) && busy(row)).flatMap(row => {
    let occupied, unknown = false;
    try { occupied = interval(row, { stored: true }); }
    catch { try { occupied = { start: dateDay(row.date) * DAY, end: (dateDay(row.date) + 1) * DAY }; unknown = true; } catch { return []; } }
    if (!overlaps(candidate, occupied)) return [];
    return [{ jobId: row.id, date: row.date, time: typeof row.time === 'string' ? row.time : '', endTime: clock(occupied.end), endDate: dayDate(Math.floor(occupied.end / DAY)), ...(row.kind ? { kind: row.kind } : {}), ...(unknown ? { unknown: true } : {}) }];
  }).slice(0, 20);
}
function alternatives(rows, assignee, candidate, { searchDays = 14, window = DEFAULT_WINDOW, allowedWeekdays, excludeJobId, limit = 6 } = {}) {
  const startDay = Math.floor(candidate.start / DAY), startMinute = clockMinutes(window.start), endMinute = clockMinutes(window.end), permitted = new Set(allowedWeekdays || window.days);
  const result = [];
  for (let day = startDay; day < startDay + searchDays && result.length < limit; day++) {
    if (!permitted.has(new Date(day * 86400000).getUTCDay())) continue;
    const first = Math.ceil(Math.max(startMinute, day === startDay ? candidate.start - day * DAY : 0) / 15) * 15;
    for (let minute = first; minute + candidate.durationMinutes <= endMinute && result.length < limit; minute += 15) {
      const possible = { start: day * DAY + minute, end: day * DAY + minute + candidate.durationMinutes };
      if (possible.start === candidate.start || conflictRows(rows, assignee, possible, excludeJobId).length) continue;
      result.push({ date: dayDate(day), time: clock(minute) });
    }
  }
  return result;
}
function searchOptions(data = {}) {
  const searchDays = data.searchDays === undefined ? 14 : Number(data.searchDays);
  if (!Number.isInteger(searchDays) || searchDays < 1 || searchDays > 14) throw new HttpsError('invalid-argument', 'Search between one and fourteen days.');
  let allowedWeekdays;
  if (data.allowedWeekdays !== undefined) {
    if (!Array.isArray(data.allowedWeekdays) || !data.allowedWeekdays.length || data.allowedWeekdays.length > 7 || data.allowedWeekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new HttpsError('invalid-argument', 'Choose valid weekdays for alternate appointments.');
    allowedWeekdays = [...new Set(data.allowedWeekdays)];
  }
  return { searchDays, allowedWeekdays };
}

function schedulingHandlers(db) {
  const scoped = (collection, scope) => db.collection(collection).where(scope.companyId ? 'companyId' : 'userId', '==', scope.companyId || scope.uid);
  async function actor(tx, scope) {
    if (!scope?.uid || !hasCapability(scope.role, 'jobs.assign')) throw new HttpsError('permission-denied', 'Scheduling access is required.');
    const deleted = await read(tx, db.doc(`rlAccountDeletions/${documentId(scope.uid)}`));
    if (deleted.exists) throw new HttpsError('permission-denied', 'This account no longer has access.');
    if (!scope.companyId) {
      const profile = await read(tx, db.doc(`users/${scope.uid}`));
      if (profile.get('rlCompanyId') || profile.get('companyId')) throw new HttpsError('permission-denied', 'Your workspace changed. Refresh before scheduling.');
      return { company: null, profile };
    }
    const company = await read(tx, db.doc(`companies/${documentId(scope.companyId)}`));
    if (!company.exists || company.get('isActive') === false || company.get('deletedAt')) throw new HttpsError('permission-denied', 'This company is not available for scheduling.');
    if (scope.role === 'owner') {
      if (company.get('ownerId') !== scope.uid) throw new HttpsError('permission-denied', 'Company ownership changed. Refresh before scheduling.');
    } else {
      const member = await read(tx, db.doc(`teamMembers/${documentId(scope.memberId, 'membership')}`));
      if (!member.exists || member.get('companyId') !== scope.companyId || member.get('uid') !== scope.uid || member.get('status') !== 'active' || member.get('role') !== scope.role) throw new HttpsError('permission-denied', 'Your scheduling access changed. Refresh before saving.');
    }
    return { company, profile: null };
  }
  const label = (data, fallback) => String(data.name || data.displayName || [data.firstName, data.lastName].filter(Boolean).join(' ') || fallback).slice(0, 200);
  async function resolve(tx, scope, id, { company, allowLegacy = false, relaxed = false } = {}) {
    if (!id) return null;
    documentId(id, 'technician');
    const ownerId = company?.get('ownerId') || (!scope.companyId ? scope.uid : null);
    if (id === ownerId) {
      const [deleted, profile] = await Promise.all([read(tx, db.doc(`rlAccountDeletions/${ownerId}`)), read(tx, db.doc(`users/${ownerId}`))]);
      if (!relaxed && deleted.exists) throw failure('This technician is no longer active or available in this company. Choose another technician.');
      const memberships = scope.companyId ? await read(tx, scoped('teamMembers', scope).where('uid', '==', ownerId).limit(21)) : null;
      if (!relaxed && memberships?.size > 20) throw failure('This owner has memberships that need review before scheduling.');
      return { id: ownerId, uid: ownerId, role: 'owner', name: label(profile.data() || {}, scope.companyId ? 'Company owner' : 'You'), aliases: [ownerId, ...(memberships?.docs || []).map(row => row.id)] };
    }
    if (!scope.companyId) throw failure('Choose the owner of this independent workspace.');
    const member = await read(tx, db.doc(`teamMembers/${id}`));
    let chosen = member.exists && member.get('companyId') === scope.companyId ? member : null;
    if (!member.exists) {
      const rows = await read(tx, scoped('teamMembers', scope).where('uid', '==', id).limit(21));
      const active = rows.docs.filter(row => row.get('status') === 'active' && (row.get('role') === 'technician' || allowLegacy && ['admin', 'manager'].includes(row.get('role'))));
      if (active.length === 1) chosen = active[0];
      else if (relaxed && rows.docs.length) chosen = rows.docs[0];
    }
    const uid = chosen?.get('uid');
    if (chosen && uid === ownerId) return resolve(tx, scope, ownerId, { company, allowLegacy, relaxed });
    if (!chosen || typeof uid !== 'string' || !uid || !relaxed && (chosen.get('status') !== 'active' || chosen.get('role') !== 'technician' && !(allowLegacy && ['admin', 'manager'].includes(chosen.get('role'))))) throw failure('This technician is no longer active or available in this company. Choose another technician.');
    documentId(uid, 'technician account');
    const [deleted, aliases] = await Promise.all([read(tx, db.doc(`rlAccountDeletions/${uid}`)), read(tx, scoped('teamMembers', scope).where('uid', '==', uid).limit(21))]);
    if (!relaxed && (deleted.exists || aliases.size > 20 || aliases.docs.filter(row => row.get('status') === 'active').length > 1)) throw failure('This technician is no longer active or has memberships that need review. Choose another technician.');
    return { id: chosen.id, uid, role: chosen.get('role'), name: label(chosen.data(), 'Technician'), aliases: [...new Set([chosen.id, uid, ...aliases.docs.map(row => row.id)])] };
  }
  async function roster(tx, scope, context) {
    if (!scope.companyId) return [await resolve(tx, scope, scope.uid, context)];
    const rows = await read(tx, scoped('teamMembers', scope).limit(501));
    if (rows.size > 500) throw new HttpsError('resource-exhausted', 'This team is too large for one scheduling request.');
    const counts = new Map();
    rows.docs.filter(row => row.get('status') === 'active' && row.get('uid')).forEach(row => counts.set(row.get('uid'), (counts.get(row.get('uid')) || 0) + 1));
    const result = [];
    try { result.push(await resolve(tx, scope, context.company.get('ownerId'), context)); } catch (error) { if (error.code !== 'failed-precondition') throw error; }
    for (const row of rows.docs) {
      if (row.get('status') !== 'active' || row.get('role') !== 'technician' || !row.get('uid') || row.get('uid') === context.company.get('ownerId') || counts.get(row.get('uid')) !== 1) continue;
      try { result.push(await resolve(tx, scope, row.id, context)); } catch (error) { if (error.code !== 'failed-precondition') throw error; }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }
  function environment(context) {
    let timeZone = context.company?.get('timeZone') || context.profile?.get('timeZone') || 'America/Los_Angeles';
    try { new Intl.DateTimeFormat('en-US', { timeZone }).format(); } catch { timeZone = 'America/Los_Angeles'; }
    const configured = context.company?.get('schedulingHours');
    let workWindow = { ...DEFAULT_WINDOW, days: [...DEFAULT_WINDOW.days] };
    if (configured && typeof configured === 'object') try {
      if (clockMinutes(configured.start) < clockMinutes(configured.end) && Array.isArray(configured.days) && configured.days.length && configured.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6)) workWindow = { start: clock(clockMinutes(configured.start)), end: clock(clockMinutes(configured.end)), days: [...new Set(configured.days)], source: 'company' };
    } catch { /* An invalid optional preference cannot silently remove all choices. */ }
    return { timeZone, workWindow, message: 'Availability is based on scheduled work. Suggested times use the displayed work window; travel time and duty status are not included.' };
  }
  async function loadRows(tx, scope, candidate, options = {}) {
    const days = options.searchDays || 7, startDay = Math.floor(candidate.start / DAY) - 7, endDay = Math.floor(candidate.start / DAY) + days + 1;
    const [jobs, plans] = await Promise.all([
      read(tx, scoped('jobs', scope).where('date', '>=', dayDate(startDay)).where('date', '<=', dayDate(endDay)).orderBy('date', 'desc').limit(MAX_ROWS + 1)),
      read(tx, scoped('servicePlans', scope).where('active', '==', true).limit(MAX_PLANS + 1)),
    ]);
    if (jobs.size > MAX_ROWS || plans.size > MAX_PLANS) throw new HttpsError('resource-exhausted', 'The schedule is too large to check safely in one request. Narrow the dates or review service plans.');
    return { jobs: jobs.docs.filter(row => scope.companyId ? row.get('companyId') === scope.companyId : !row.get('companyId') && row.get('userId') === scope.uid).map(row => ({ ...row.data(), id: row.id })), plans: plans.docs.filter(row => row.get('active') === true && (scope.companyId ? row.get('companyId') === scope.companyId : !row.get('companyId') && row.get('userId') === scope.uid)).map(row => ({ ...row.data(), id: row.id })), startDate: dayDate(startDay), endDate: dayDate(endDay) };
  }
  function withReservations(loaded, assignee, options = {}) {
    if (!assignee) return loaded.jobs;
    const rows = [...loaded.jobs], selected = new Set([assignee.id, assignee.uid]);
    const materialized = new Set(loaded.jobs.filter(row => row.servicePlanId).map(row => `${row.servicePlanId}:${row.servicePlanDate || row.date}`));
    const { occurrenceDates } = require('./recurrenceRules');
    for (const plan of loaded.plans) {
      if (plan.id === options.excludeServicePlanId || !selected.has(plan.preferredTechnicianId || plan.assignedTo) || plan.preferredTechnicianUid && plan.preferredTechnicianUid !== assignee.uid) continue;
      let dates;
      try { dates = occurrenceDates(plan, loaded.startDate, loaded.endDate, { limit: 100 }); }
      catch { throw failure('A recurring service plan has incomplete scheduling details. Review it before assigning this technician.'); }
      for (const date of dates) {
        if (materialized.has(`${plan.id}:${date}`) || plan.id === options.servicePlanId && date === options.occurrenceDate) continue;
        rows.push({ id: `plan:${plan.id}:${date}`, assignedTo: assignee.id, date, time: plan.time || '09:00', estimatedDuration: plan.estimatedDuration ?? plan.duration ?? 1, status: 'scheduled', kind: 'recurring' });
        if (rows.length > MAX_ROWS * 2) throw new HttpsError('resource-exhausted', 'There are too many recurring appointments to check safely.');
      }
    }
    return rows;
  }
  async function locks(tx, scope, people) {
    const unique = [...new Set(people.filter(Boolean).map(person => person.uid))];
    const refs = unique.map(uid => db.doc(`rlScheduleLocks/${hash(`${scopeKey(scope)}:${uid}`)}`));
    const snaps = await Promise.all(refs.map(ref => read(tx, ref)));
    return refs.map((ref, index) => ({ ref, revision: Number(snaps[index].get('revision') || 0), uid: unique[index] }));
  }
  const reservationOptions = (job, before, options) => ({ ...options, servicePlanId: options.servicePlanId || job?.servicePlanId || before?.servicePlanId, occurrenceDate: options.occurrenceDate || job?.servicePlanDate || before?.servicePlanDate || before?.date || job?.date });
  function resultFor(loaded, person, candidate, context, options = {}) {
    const rows = withReservations(loaded, person, options), conflicts = conflictRows(rows, person, candidate, options.jobId);
    return { memberId: person?.id || null, available: !conflicts.length, reason: conflicts.some(row => row.unknown) ? 'An existing appointment has incomplete time or duration. Review it before assigning this technician.' : conflicts.length ? 'The technician already has scheduled work at that time.' : 'The technician has no overlapping scheduled work.', conflicts, alternatives: conflicts.length ? alternatives(rows, person, candidate, { ...options, window: environment(context).workWindow, excludeJobId: options.jobId }) : [], ...environment(context) };
  }
  async function prepare(tx, scope, next, options = {}) {
    const before = options.before || {}, context = await actor(tx, scope), changed = options.force === true || changedSchedule(before, next);
    if (!changed) return { assignedTo: next?.assignedTo || null, assignedToUid: next?.assignedTo ? before.assignedToUid || null : null, assignedToName: next?.assignedTo ? before.assignedToName || '' : '', available: true, locks: [], skipped: true, scope };
    let old;
    if (before.assignedTo) try { old = await resolve(tx, scope, before.assignedTo, { ...context, allowLegacy: true, relaxed: true }); } catch { old = { uid: before.assignedTo }; }
    if (!next?.assignedTo || !busy(next)) {
      const target = next?.assignedTo && next.assignedTo !== before.assignedTo ? await resolve(tx, scope, next.assignedTo, context) : null;
      return { assignedTo: target?.id || next?.assignedTo || null, assignedToUid: next?.assignedTo ? target?.uid || before.assignedToUid || old?.uid || null : null, assignedToName: target?.name || (next?.assignedTo ? before.assignedToName || old?.name || '' : ''), available: true, locks: await locks(tx, scope, [old]), scope };
    }
    const person = await resolve(tx, scope, next.assignedTo, { ...context, allowLegacy: before.assignedTo === next.assignedTo });
    const candidate = interval(next), lockRows = await locks(tx, scope, [old, person]);
    const settings = reservationOptions(next, before, { ...searchOptions(options), ...options });
    const loaded = await loadRows(tx, scope, candidate, settings), result = resultFor(loaded, person, candidate, context, settings);
    if (!result.available && options.strict !== false) throw failure(result.reason, result);
    return { ...result, assignedTo: person.id, assignedToUid: person.uid, assignedToName: person.name, locks: lockRows, scope };
  }
  async function choose(tx, scope, job, options = {}) {
    const context = await actor(tx, scope), fallback = options.assignmentFallback || 'unassigned';
    if (!['unassigned', 'auto'].includes(fallback)) throw new HttpsError('invalid-argument', 'Choose a valid technician fallback.');
    let preferred, old, unavailable = false;
    if (options.preferredTechnicianId) try { preferred = await resolve(tx, scope, options.preferredTechnicianId, context); } catch (error) { if (error.code !== 'failed-precondition') throw error; unavailable = true; }
    if (preferred && options.preferredTechnicianUid && options.preferredTechnicianUid !== preferred.uid) { preferred = null; unavailable = true; }
    if (options.before?.assignedTo) try { old = await resolve(tx, scope, options.before.assignedTo, { ...context, relaxed: true, allowLegacy: true }); } catch { old = { uid: options.before.assignedTo }; }
    const candidates = preferred ? [preferred] : [];
    if (fallback === 'auto') for (const person of await roster(tx, scope, context)) if ((!scope.companyId || person.role === 'technician') && !candidates.some(existing => existing.uid === person.uid)) candidates.push(person);
    const allLocks = await locks(tx, scope, [old, ...candidates]);
    if (!candidates.length) return { assignedTo: null, assignedToUid: null, assignedToName: '', available: false, memberUnavailable: unavailable, assignmentReview: unavailable ? 'The preferred technician is no longer active. Assign another technician.' : 'This recurring visit needs a technician assignment.', assignmentNeedsAttention: true, locks: allLocks.filter(row => row.uid === old?.uid), scope };
    const candidate = interval(job), settings = reservationOptions(job, options.before, { ...searchOptions(options), ...options }), loaded = await loadRows(tx, scope, candidate, settings);
    let last;
    for (const person of candidates) {
      const result = resultFor(loaded, person, candidate, context, settings); last = result;
      if (result.available) return { ...result, assignedTo: person.id, assignedToUid: person.uid, assignedToName: person.name, memberUnavailable: unavailable, assignmentReview: null, assignmentNeedsAttention: false, assignmentFallbackUsed: !preferred || person.uid !== preferred.uid, locks: allLocks.filter(row => [old?.uid, person.uid].includes(row.uid)), scope };
    }
    return { ...(last || {}), assignedTo: null, assignedToUid: null, assignedToName: '', available: false, memberUnavailable: unavailable, assignmentReview: 'No eligible technician is available at this time. Dispatcher assignment is needed.', assignmentNeedsAttention: true, locks: allLocks.filter(row => row.uid === old?.uid), scope };
  }
  function commit(tx, prepared) {
    for (const lock of prepared?.locks || []) tx.set(lock.ref, { ...(prepared.scope.companyId ? { companyId: prepared.scope.companyId } : { userId: prepared.scope.uid }), technicianUid: lock.uid, revision: lock.revision + 1, updatedAt: new Date().toISOString() });
  }
  return {
    prepare, choose, commit,
    validateTechnician: async (tx, scope, id, options = {}) => resolve(tx, scope, id, { ...await actor(tx, scope), ...options }),
    handle: async request => {
      const scope = await requireCapability(db, request, 'jobs.assign'), data = request.data || {};
      await rateLimit(db, 'schedule-check', scope.uid, 90);
      if (data.companyId !== undefined && (data.companyId || null) !== (scope.companyId || null)) throw new HttpsError('permission-denied', 'Choose this workspace’s schedule.');
      const context = await actor(null, scope), action = data.action || 'check';
      if (action === 'roster') return { technicians: (await roster(null, scope, context)).map(({ id, name, role }) => ({ id, name, role })), ...environment(context) };
      if (action !== 'check') throw new HttpsError('invalid-argument', 'Choose an availability check or technician roster.');
      const options = searchOptions(data), job = { date: data.date, time: data.time, estimatedDuration: data.estimatedDuration, assignedTo: data.memberId || null };
      const candidate = interval(job); let before;
      if (data.jobId) { const snap = await db.doc(`jobs/${documentId(data.jobId, 'job')}`).get(); checkJob(scope, snap.data()); before = snap.data(); options.jobId = snap.id; }
      if (data.servicePlanId) {
        const plan = await db.doc(`servicePlans/${documentId(data.servicePlanId, 'service plan')}`).get();
        if (!plan.exists || (scope.companyId ? plan.get('companyId') !== scope.companyId : plan.get('companyId') || plan.get('userId') !== scope.uid) || before && before.servicePlanId !== plan.id) throw new HttpsError('permission-denied', 'Choose a service plan from this appointment’s workspace.');
        options.excludeServicePlanId = plan.id;
      }
      if (!job.assignedTo) return { memberId: null, available: true, reason: 'No technician selected. The appointment will remain unassigned.', conflicts: [], alternatives: [], ...environment(context) };
      let person;
      try { person = await resolve(null, scope, job.assignedTo, { ...context, allowLegacy: before?.assignedTo === job.assignedTo }); }
      catch (error) { if (error.code !== 'failed-precondition') throw error; return { memberId: job.assignedTo, ...error.details.scheduling, ...environment(context) }; }
      const loaded = await loadRows(null, scope, candidate, options);
      return resultFor(loaded, person, candidate, context, reservationOptions(job, before, options));
    },
  };
}
module.exports = { schedulingHandlers, dateDay, dayDate, clockMinutes, clock, interval, overlaps, changedSchedule, conflictRows, alternatives, searchOptions };
