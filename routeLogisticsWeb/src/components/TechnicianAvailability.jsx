import { useEffect, useMemo, useRef, useState } from 'react';
import ThemedSelect from './ThemedSelect';
import { formatClockTime } from '../utils/quarterHours';
import { checkSchedulingAvailability, getSchedulingRoster, schedulingFingerprint } from '../services/schedulingService';
import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';

const defaultWindow = { start: '08:00', end: '18:00', days: [0, 1, 2, 3, 4, 5, 6], source: 'default' };
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const dateLabel = value => validDate(value) ? new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : 'Date unavailable';
const actionClass = 'rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm font-medium text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50';

export default function TechnicianAvailability({ companyId, memberId = '', memberName = '', date, time, estimatedDuration, jobId, servicePlanId, serviceCategory = '', serviceType = '', disabled = false, allowedWeekdays, isAlternativeAllowed, schedulingError, onMemberChange, onSelectAlternative }) {
  const scope = companyId || 'solo';
  const [ignoredSaveError, setIgnoredSaveError] = useState(null);
  const runtime = useRef({ mounted: false, key: '', scope }), labels = useRef({ scope, values: new Map() });
  const fingerprint = schedulingFingerprint({ companyId, memberId, date, time, estimatedDuration, jobId, servicePlanId, serviceCategory, serviceType });
  const weekdays = Array.isArray(allowedWeekdays) ? [...new Set(allowedWeekdays.map(Number).filter(value => Number.isInteger(value) && value >= 0 && value <= 6))].sort() : undefined;
  const weekdaysKey = JSON.stringify(weekdays || null), requestKey = JSON.stringify([fingerprint, weekdaysKey]);
  runtime.current.key = requestKey;
  runtime.current.scope = scope;
  if (labels.current.scope !== scope) labels.current = { scope, values: new Map() };
  const rosterQuery = useWorkspaceQuery(['schedule-roster', companyId || 'solo'], () => getSchedulingRoster(companyId), { enabled: !disabled });
  const knownMembers = useMemo(() => {
    const rows = (Array.isArray(rosterQuery.data?.technicians) ? rosterQuery.data.technicians : []).filter(member => typeof member.id === 'string' && member.id && ['technician', 'owner', 'manager'].includes(member.role) && (!member.status || member.status === 'active')).map(member => {
      const email = typeof member.email === 'string' ? member.email.trim() : '';
      const name = typeof member.name === 'string' && member.name.trim() ? member.name.trim() : email || (member.role === 'owner' ? 'Company owner' : 'Technician');
      const label = email && email.toLocaleLowerCase() !== name.toLocaleLowerCase() ? `${name} · ${email}` : name;
      return { id: member.id, name, email, label, role: member.role, fieldWorkEnabled: member.fieldWorkEnabled !== false && member.availability?.fieldWorkEnabled !== false };
    });
    return [...new Map(rows.map(member => [member.id, member])).values()];
  }, [rosterQuery.data]);
  knownMembers.forEach(member => labels.current.values.set(member.id, member.label));
  const rosterCurrent = !!rosterQuery.data, rosterLoading = rosterQuery.isPending && !rosterCurrent;
  const roster = { error: rosterQuery.error?.message || '', loading: rosterLoading, metadata: rosterQuery.data };
  const technicians = knownMembers.filter(member => member.fieldWorkEnabled !== false);
  const officeOnly = knownMembers.some(member => member.id === memberId && member.fieldWorkEnabled === false);
  const selected = technicians.find(member => member.id === memberId);
  const legacy = !!memberId && rosterCurrent && !roster.loading && !roster.error && !selected;
  const options = [{ value: '', label: 'Unassigned' }, ...technicians.map(member => ({ value: member.id, label: member.label }))];
  if (memberId && !selected) options.push({ value: memberId, label: `${labels.current.values.get(memberId) || memberName || 'Previously assigned staff member'} (${rosterLoading ? 'loading…' : roster.error ? 'not confirmed' : officeOnly ? 'office only' : 'unavailable'})`, disabled: true });
  const slotValid = validDate(date) && validTime(time) && Number.isFinite(Number(estimatedDuration)) && Number(estimatedDuration) > 0;
  const mayCheck = !!memberId && !!selected && slotValid && !rosterLoading && !roster.error && !disabled;
  const availabilityQuery = useWorkspaceQuery(['availability', requestKey], async () => {
    const requestedWeekdays = JSON.parse(weekdaysKey);
    const result = await checkSchedulingAvailability({ companyId, memberId, date, time, estimatedDuration, jobId, servicePlanId, serviceCategory, serviceType, ...(requestedWeekdays ? { allowedWeekdays: requestedWeekdays } : {}) });
    if (typeof result?.available !== 'boolean') throw Error('Availability could not be confirmed. Try again.');
    return result;
  }, { enabled: mayCheck });

  useEffect(() => { runtime.current.mounted = true; const state = runtime.current; return () => { state.mounted = false; }; }, []);

  const matchingSaveError = schedulingError && schedulingError !== ignoredSaveError && schedulingError.fingerprint === fingerprint ? schedulingError.result || schedulingError.scheduling || schedulingError.details?.scheduling : null;
  const currentCheck = mayCheck ? { loading: availabilityQuery.isPending, result: availabilityQuery.data, error: availabilityQuery.error?.message || '' } : null;
  const outcome = matchingSaveError || currentCheck?.result;
  const metadata = { ...(rosterCurrent ? roster.metadata : {}), ...outcome };
  const window = metadata?.workWindow || defaultWindow;
  const windowStart = validTime(window.start) ? window.start : defaultWindow.start, windowEnd = validTime(window.end) ? window.end : defaultWindow.end;
  const windowDays = Array.isArray(window.days) ? [...new Set(window.days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))] : defaultWindow.days;
  const conflicts = Array.isArray(outcome?.conflicts) ? outcome.conflicts : [];
  const alternativeAllowed = slot => {
    if (!validDate(slot.date) || !validTime(slot.time) || weekdays && !weekdays.includes(new Date(`${slot.date}T12:00:00Z`).getUTCDay())) return false;
    try { return typeof isAlternativeAllowed !== 'function' || isAlternativeAllowed({ date: slot.date, time: slot.time }) === true; } catch { return false; }
  };
  const alternatives = [...new Map((Array.isArray(outcome?.alternatives) ? outcome.alternatives : []).filter(alternativeAllowed).map(slot => [`${slot.date}:${slot.time}`, { date: slot.date, time: slot.time }])).values()];
  const retry = () => { if (!disabled && mayCheck) { setIgnoredSaveError(schedulingError); availabilityQuery.refetch(); } };
  return <section aria-label="Technician availability" className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
    <div><h3 className="font-semibold text-gray-900">Technician and schedule</h3><p className="mt-1 text-sm text-gray-600">Checks scheduled work; travel time is not included.</p></div>
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1"><ThemedSelect label="Assigned technician" value={memberId || ''} options={options} disabled={disabled || rosterLoading} onChange={id => { if (!disabled && (id === '' || technicians.some(member => member.id === id))) onMemberChange?.(id); }} /></div>
      <button type="button" aria-label="Refresh technicians" title="Refresh technicians" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary-300 text-primary-700 hover:bg-primary-50 disabled:opacity-50" disabled={disabled || rosterLoading} onClick={() => { if (!disabled && !rosterLoading) rosterQuery.refetch(); }}><svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11a8 8 0 1 0-2.2 5.5"/><path d="M20 4v7h-7"/></svg></button>
    </div>
    {rosterLoading && <p role="status" className="text-sm text-gray-600">Loading technicians…</p>}
    {roster.error && <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"><p>{roster.error}</p><button type="button" className={actionClass} disabled={disabled} onClick={() => { if (!disabled) rosterQuery.refetch(); }}>Retry technicians</button></div>}
    {!rosterLoading && !roster.error && !technicians.length && <p role="status" className="text-sm text-gray-600">No active technicians are available for assignment. Leave this appointment unassigned or refresh the team.</p>}
    {legacy && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{officeOnly ? 'This staff member is now office-only. Existing appointments remain assigned; choose field-enabled staff for a new or rescheduled appointment.' : 'This saved assignment is no longer available. Choose an active technician or Unassigned.'}</p>}
    {!memberId && !rosterLoading && <p role="status" className="text-sm text-gray-600">Unassigned appointments can be assigned later from dispatch.</p>}
    {memberId && !slotValid && <p role="status" className="text-sm text-gray-600">Choose a valid date, start time and duration to check this technician’s schedule.</p>}
    {currentCheck?.loading && <p role="status" className="text-sm text-gray-600">Checking scheduled work…</p>}
    {currentCheck?.error && <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"><p>{currentCheck.error}</p><button type="button" className={actionClass} disabled={disabled} onClick={retry}>Retry availability</button></div>}
    {outcome && <div role={outcome.available ? 'status' : 'alert'} className={`space-y-2 rounded-lg p-3 text-sm ${outcome.available ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
      <p className="font-semibold">{outcome.available ? 'Available for this appointment' : 'This appointment needs another time or technician'}</p>
      {outcome.reason && <p>{outcome.reason}</p>}
      {!!conflicts.length && <ul className="list-inside list-disc">{conflicts.map((conflict, index) => <li key={`${conflict.jobId || ''}:${index}`}>{conflict.kind === 'availability' ? 'Staff unavailable' : conflict.kind === 'recurring' ? 'Recurring appointment' : 'Scheduled appointment'} · {dateLabel(conflict.date)} · {validTime(conflict.time) ? formatClockTime(conflict.time) : 'Time needs review'}{conflict.endDate && conflict.endDate !== conflict.date ? ` to ${dateLabel(conflict.endDate)} ` : '–'}{validTime(conflict.endTime) ? formatClockTime(conflict.endTime) : ''}{conflict.unknown ? ' (duration needs review)' : ''}</li>)}</ul>}
      {!!alternatives.length && typeof onSelectAlternative === 'function' && <div role="group" aria-label="Available alternative times" className="space-y-2"><p className="font-medium">Choose an available alternative</p><div className="flex flex-wrap gap-2">{alternatives.map(slot => <button key={`${slot.date}:${slot.time}`} type="button" className={actionClass} disabled={disabled} onClick={() => { if (!disabled && runtime.current.mounted && runtime.current.key === requestKey) onSelectAlternative(slot); }}>Use {dateLabel(slot.date)} at {formatClockTime(slot.time)}</button>)}</div><p>Choosing an alternative fills the appointment. Review it before saving.</p></div>}
      {!outcome.available && <button type="button" className={actionClass} disabled={disabled || !mayCheck} onClick={retry}>Recheck availability</button>}
    </div>}
    {outcome && !outcome.available && <details className="text-xs text-gray-600"><summary className="cursor-pointer text-primary-700">Alternative search window</summary><p className="mt-1">{formatClockTime(windowStart)}–{formatClockTime(windowEnd)} · {windowDays.length === 7 ? 'Every day' : windowDays.map(day => days[day]).join(', ') || 'Days not configured'}{window.source === 'default' ? ' (default)' : ''}{metadata?.timeZone ? ` · ${metadata.timeZone}` : ''}. The schedule is checked again when you save.</p></details>}
  </section>;
}
