import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { reviewInvitationSettings } from '../services/reviews';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { reviewButton, reviewField, reviewSecondary } from '../utils/reviewUi';

const editable = value => ({ enabled: value?.enabled === true, emailEnabled: value?.emailEnabled !== false, smsEnabled: value?.smsEnabled === true, delayMinutes: String(value?.delayMinutes ?? 60), reminderEnabled: value?.reminderEnabled === true, reminderDelayMinutes: String(value?.reminderDelayMinutes ?? 2880), expiresDays: String(value?.expiresDays ?? 14) });
export default function ReviewInvitationSettings({ companyId }) {
  const [data, setData] = useState(null), [form, setForm] = useState(null), [saved, setSaved] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const runtime = useRef({ mounted: false, sequence: 0, busy: false });
  const dirty = !!form && JSON.stringify(form) !== saved;
  const { confirmDiscard } = useUnsavedChanges(dirty, { scope: `review-settings:${companyId}`, message: 'Review invitation preferences have not been saved. Leave without saving them?' });
  const accept = result => { const next = editable(result.settings); setData(result); setForm(next); setSaved(JSON.stringify(next)); };
  const load = async () => {
    const state = runtime.current; if (state.busy) return; state.busy = true; const sequence = ++state.sequence; setBusy(true); setError('');
    try { const result = await reviewInvitationSettings('status', { companyId }); if (state.mounted && sequence === state.sequence) accept(result); }
    catch (failure) { if (state.mounted && sequence === state.sequence) setError(failure.message || 'Invitation preferences could not be loaded. Please retry.'); }
    finally { state.busy = false; if (state.mounted && sequence === state.sequence) setBusy(false); }
  };
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => { const state = runtime.current; state.mounted = true; loadRef.current(); return () => { state.mounted = false; state.sequence++; state.busy = false; }; }, []);
  const patch = changes => { if (!runtime.current.busy) { setForm(previous => ({ ...previous, ...changes })); setMessage(''); } };
  const save = async () => {
    const state = runtime.current; if (state.busy || !dirty) return;
    const delayMinutes = Number(form.delayMinutes), reminderDelayMinutes = Number(form.reminderDelayMinutes), expiresDays = Number(form.expiresDays);
    if (!Number.isInteger(delayMinutes) || delayMinutes < 0 || delayMinutes > 10080 || !Number.isInteger(reminderDelayMinutes) || reminderDelayMinutes < 60 || reminderDelayMinutes > 20160 || !Number.isInteger(expiresDays) || expiresDays < 1 || expiresDays > 30 || form.enabled && !form.emailEnabled && !form.smsEnabled) { setError('Choose a delay of 0–10,080 minutes, reminder delay of 60–20,160 minutes, and link life of 1–30 days. Enabled invitations need an authorized delivery channel.'); return; }
    state.busy = true; const sequence = ++state.sequence; setBusy(true); setError(''); setMessage('');
    try { const result = await reviewInvitationSettings('save', { companyId, expectedRevision: data.settings.revision || 0, settings: { ...form, delayMinutes, reminderDelayMinutes, expiresDays } }); if (!state.mounted || sequence !== state.sequence) return; accept(result); setMessage('Invitation preferences saved. Operator delivery restrictions still apply.'); toast.success('Review invitation preferences saved.'); }
    catch (failure) { if (state.mounted && sequence === state.sequence) { setError(failure.message || 'Invitation preferences were not saved. Your changes are retained.'); toast.error('Invitation preferences were not saved.'); } }
    finally { state.busy = false; if (state.mounted && sequence === state.sequence) setBusy(false); }
  };
  return <section aria-label="Review invitation preferences" className="space-y-4 rounded-xl border bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Post-service invitations</h2><p className="mt-1 text-sm text-gray-600">Invite customers after completed service using the same timing for all ratings and outcomes. One optional reminder is supported.</p></div><button type="button" className={reviewSecondary} disabled={busy} onClick={async () => { if (!dirty || await confirmDiscard()) load(); }}>Refresh invitation status</button></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{message}</p>}
    {!form && busy && <p role="status">Loading invitation preferences…</p>}
    {form && <><p role="status" className={`rounded-lg p-3 text-sm ${data.delivery?.enabled ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>{data.delivery?.enabled ? 'Operator delivery gate is enabled. Company preferences and customer authorization still apply.' : 'Automated outbound review invitations are disabled by the operator. Saving preferences does not enable sending.'}</p>
      <fieldset disabled={busy} className="space-y-4"><label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={form.enabled} onChange={event => patch({ enabled: event.target.checked })} /><span>Request post-service review invitations for this provider</span></label>
        <div className="flex flex-wrap gap-6"><label className="flex items-center gap-2"><input type="checkbox" checked={form.emailEnabled} onChange={event => patch({ emailEnabled: event.target.checked })} />Email invitations</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.smsEnabled} onChange={event => patch({ smsEnabled: event.target.checked })} />SMS when separately authorized</label></div><p className="text-sm text-gray-600">Email is the default. SMS requires review-specific customer consent, provider opt-out checks, and operator approval. This setting cannot enable a company-wide SMS campaign.</p>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Delay after completion (minutes)<input aria-label="Review invitation delay" className={reviewField} type="number" min="0" max="10080" step="1" value={form.delayMinutes} onChange={event => patch({ delayMinutes: event.target.value })} /></label><label className="block text-sm font-medium">Invitation link life (days)<input aria-label="Review invitation expiration days" className={reviewField} type="number" min="1" max="30" step="1" value={form.expiresDays} onChange={event => patch({ expiresDays: event.target.value })} /></label></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.reminderEnabled} onChange={event => patch({ reminderEnabled: event.target.checked })} />One reminder if feedback is still missing</label>{form.reminderEnabled && <label className="block text-sm font-medium">Reminder delay after first invitation (minutes)<input aria-label="Review invitation reminder delay" className={reviewField} type="number" min="60" max="20160" step="1" value={form.reminderDelayMinutes} onChange={event => patch({ reminderDelayMinutes: event.target.value })} /></label>}
        <button type="button" className={reviewButton} disabled={busy || !dirty} onClick={save}>{busy ? 'Saving preferences…' : 'Save invitation preferences'}</button>
      </fieldset>
      <div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Recent invitation delivery</h3>{!data.history?.length && <p className="text-sm text-gray-600">No review invitations have been scheduled for this provider.</p>}{(data.history || []).map(row => <div className="rounded-lg border p-3 text-sm" key={row.id}><p className="font-medium">{row.serviceType || 'Completed service'} · {row.serviceDate || row.completedAt?.slice?.(0, 10) || ''}</p><p>Status: {row.status || 'Scheduled'}{row.failureCode ? ` · ${row.failureCode}` : ''}</p>{[['email', 'Email'], ['sms', 'SMS'], ['reminderEmail', 'Email reminder'], ['reminderSms', 'SMS reminder']].map(([channel,label]) => row[channel] && <p key={channel}>{label}: {row[channel].status || 'Not queued'}{row[channel].failureCode ? ` · ${row[channel].failureCode}` : ''}</p>)}</div>)}</div>
    </>}
  </section>;
}
