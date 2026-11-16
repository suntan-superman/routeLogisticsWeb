import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { callWorkspace } from '../services/workspaceApi';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import TimeSelect from './TimeSelect';

const datePart = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const timePart = date => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
function initialForm() {
  const start = new Date(); start.setMinutes(Math.floor(start.getMinutes() / 15) * 15, 0, 0);
  const end = new Date(start.getTime() + 8 * 3600000);
  return { reason: 'sick', startDate: datePart(start), startTime: timePart(start), endDate: datePart(end), endTime: timePart(end) };
}
function instant(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(time)) return null;
  const value = new Date(`${date}T${time}:00`);
  return Number.isFinite(value.getTime()) && datePart(value) === date && timePart(value) === time ? value.toISOString() : null;
}
const reasons = { sick: 'Sick leave', vacation: 'Vacation', 'off-duty': 'Off duty', emergency: 'Available for emergency call-out', other: 'Other unavailable period' };
export default function StaffAvailabilityEditor(props) {
  return props.allowed && props.companyId && (props.member?.memberId || props.member?.id) ? <AvailabilityForm {...props} /> : null;
}
function AvailabilityForm({ companyId, member, allowed = false, onChanged }) {
  const [open, setOpen] = useState(false), [form, setForm] = useState(initialForm), [baseline, setBaseline] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const revision = useRef(0), operation = useRef(false), identity = `${companyId || ''}:${member?.memberId || member?.id || ''}`;
  const current = useRef(identity), mounted = useRef(true); current.current = identity;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setOpen(false); setBaseline(null); setError(''); setMessage(''); setBusy(false); }, [identity, allowed]);
  const dirty = open && baseline !== null && JSON.stringify(form) !== baseline;
  useUnsavedChanges(dirty || busy, { scope: `staff-availability:${identity}`, message: 'You have unsaved staff availability changes. Leave without saving them?' });
  const begin = (mode = 'availability') => {
    if (busy || operation.current) return;
    const next = { ...initialForm(), fieldWorkEnabled: member.fieldWorkEnabled !== false && member.availability?.fieldWorkEnabled !== false }; setForm(next); setBaseline(JSON.stringify(next)); revision.current = member.availability?.revision || 0;
    setError(''); setMessage(''); setOpen(mode);
  };
  const save = async action => {
    if (operation.current || busy) return;
    const startsAt = instant(form.startDate, form.startTime), endsAt = instant(form.endDate, form.endTime);
    if (action === 'set' && (!startsAt || !endsAt || endsAt <= startsAt)) { setError('Choose a valid end date and time after the start.'); return; }
    const ticket = identity; operation.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await callWorkspace('rlManageStaffAvailability', { memberId: member.memberId || member.id, action, expectedRevision: revision.current,
        ...(action === 'set-field-work' ? { fieldWorkEnabled: form.fieldWorkEnabled } : action === 'set' ? { status: form.reason === 'emergency' ? 'available' : 'unavailable', reason: form.reason, startsAt, endsAt } : {}) });
      if (!mounted.current || current.current !== ticket) return;
      const success = action === 'set-field-work' ? form.fieldWorkEnabled ? 'Field work assignments enabled.' : 'Staff member marked office-only.' : action === 'clear' ? 'Manual availability periods cleared.' : 'Staff availability saved.';
      setMessage(success); setOpen(false); setBaseline(null); toast.success(success); await onChanged?.();
    } catch (failure) {
      if (mounted.current && current.current === ticket) { setError(failure.message || 'Staff settings could not be saved. Refresh and retry.'); toast.error('Staff settings could not be saved.'); }
    } finally { operation.current = false; if (mounted.current && current.current === ticket) setBusy(false); }
  };
  return <div className="space-y-2">
    {!open && <div className="flex flex-wrap gap-x-4 gap-y-2"><button type="button" disabled={busy} data-availability-revision={member.availability?.revision || 0} className="text-sm font-medium text-primary-800 underline disabled:opacity-50" onClick={() => begin()}>Change availability</button><button type="button" disabled={busy} className="text-sm font-medium text-primary-800 underline disabled:opacity-50" onClick={() => begin('field-work')}>Field work settings</button></div>}
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {open === 'field-work' && <fieldset disabled={busy} className="space-y-3 rounded-lg border border-primary-100 bg-primary-50 p-3">
      <legend className="text-sm font-semibold">Field work for {member.name || 'staff member'}</legend>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" aria-label="Can be assigned field work" className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={form.fieldWorkEnabled} onChange={event => setForm(previous => ({ ...previous, fieldWorkEnabled: event.target.checked }))} />Can be assigned field work</label>
      <p className="text-xs text-gray-700">Turn this off for office-only staff. Their role and existing appointments stay intact. On-duty status, leave and schedule conflicts are checked separately.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={busy || !dirty} onClick={() => { if (dirty) save('set-field-work'); }}>{busy ? 'Saving…' : 'Save field work setting'}</button><button type="button" className="btn-secondary" disabled={busy} onClick={() => { setOpen(false); setBaseline(null); setError(''); }}>Cancel changes</button></div>
    </fieldset>}
    {open === 'availability' && <fieldset disabled={busy} className="space-y-3 rounded-lg border border-primary-100 bg-primary-50 p-3">
      <legend className="text-sm font-semibold">Availability for {member.name || 'staff member'}</legend>
      <label className="block text-sm">Temporary status<select aria-label="Temporary staff status" className="mt-1 block w-full rounded border-gray-300" value={form.reason} onChange={event => setForm(previous => ({ ...previous, reason: event.target.value }))}>{Object.entries(reasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="space-y-2"><label className="block text-sm">From date<input aria-label="Availability from date" type="date" className="mt-1 block w-full rounded border-gray-300" value={form.startDate} onChange={event => setForm(previous => ({ ...previous, startDate: event.target.value }))} /></label><TimeSelect label="From time" value={form.startTime} onChange={startTime => setForm(previous => ({ ...previous, startTime }))} /></div>
      <div className="space-y-2"><label className="block text-sm">Until date<input aria-label="Availability until date" type="date" className="mt-1 block w-full rounded border-gray-300" value={form.endDate} onChange={event => setForm(previous => ({ ...previous, endDate: event.target.value }))} /></label><TimeSelect label="Until time" value={form.endTime} onChange={endTime => setForm(previous => ({ ...previous, endTime }))} /></div>
      <p className="text-xs text-gray-700">Times use this device’s time zone. Marking unavailable ends an active shift and stops location sharing. Available never starts a shift, enables GPS or restores company access. Existing appointments stay scheduled for dispatcher review. An emergency window temporarily overrides an unavailable period.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" onClick={() => save('set')} disabled={busy}>{busy ? 'Saving…' : 'Save availability'}</button><button type="button" className="btn-secondary" disabled={busy} onClick={() => { setOpen(false); setBaseline(null); setError(''); }}>Cancel changes</button></div>
      {Number(member.availability?.scheduled || 0) > 0 && <button type="button" className="text-sm text-red-700 underline" disabled={busy} onClick={() => save('clear')}>Clear all manual availability periods</button>}
    </fieldset>}
  </div>;
}
