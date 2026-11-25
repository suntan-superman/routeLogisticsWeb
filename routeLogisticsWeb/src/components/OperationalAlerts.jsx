import { useEffect, useRef, useState } from 'react';
import { callWorkspace } from '../services/workspaceApi';
import SelectControl from './SelectControl';

const blank = () => ({ title: '', description: '', category: 'access', severity: 'important', active: true });
const severityLabel = { informational: 'Information', important: 'Important', critical: 'Critical' };
const categoryLabel = { safety: 'Safety', access: 'Access', 'customer-instructions': 'Customer instructions', other: 'Other' };
const field = 'w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500';
const receivedLabel = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'time unavailable';
};

export default function OperationalAlerts({ target, customerId, propertyId, jobId, assigneeName, canManage = false, initialAlerts = [] }) {
  const [alerts, setAlerts] = useState(initialAlerts), [draft, setDraft] = useState(null), [editing, setEditing] = useState(null);
  const [acknowledgmentStatus, setAcknowledgmentStatus] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const operation = useRef(null);
  const identifiers = { target, ...(target === 'property' ? { customerId, propertyId } : { jobId }) };
  const key = `${target}:${customerId || ''}:${propertyId || ''}:${jobId || ''}`;
  const hasCritical = target === 'job' && alerts.some(row => row.active && row.severity === 'critical');
  const applyList = result => { setAlerts(result.alerts || []); setAcknowledgmentStatus(target === 'job' ? result.acknowledgmentStatus || null : null); };
  useEffect(() => {
    if (!(target === 'property' ? customerId && propertyId : jobId)) return undefined;
    let live = true;
    setAlerts(initialAlerts); setAcknowledgmentStatus(null); setDraft(null); setEditing(null); setError(''); setNotice(''); setLoading(true);
    callWorkspace('rlOperationalAlerts', { action: 'list', ...identifiers }).then(result => { if (live) applyList(result); }).catch(failure => { if (live) setError(failure.message || 'Alerts could not be loaded.'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // The target identity, rather than a polling snapshot, owns this editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!hasCritical || !jobId) return undefined;
    let live = true;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const result = await callWorkspace('rlOperationalAlerts', { action: 'list', target: 'job', jobId });
        if (live) { setAlerts(result.alerts || []); setAcknowledgmentStatus(result.acknowledgmentStatus || null); }
      } catch { /* Keep the last confirmed state; the explicit refresh reports errors. */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(check, 30_000);
    return () => { live = false; window.clearInterval(timer); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible); };
  }, [key, hasCritical, jobId]);
  const refresh = async () => {
    setLoading(true); setError('');
    try { const result = await callWorkspace('rlOperationalAlerts', { action: 'list', ...identifiers }); applyList(result); }
    catch (failure) { setError(failure.message || 'Alerts could not be refreshed.'); }
    finally { setLoading(false); }
  };
  const start = row => { setEditing(row || null); setDraft(row ? { title: row.title, description: row.description, category: row.category, severity: row.severity, active: row.active } : blank()); operation.current = crypto.randomUUID(); setError(''); setNotice(''); };
  const change = (name, value) => { operation.current = crypto.randomUUID(); setDraft(previous => ({ ...previous, [name]: value })); };
  const save = async () => {
    if (!draft || saving || !draft.title.trim() || !draft.description.trim()) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await callWorkspace('rlOperationalAlerts', { action: 'save', ...identifiers, operationId: operation.current, ...(editing ? { alertId: editing.id, expectedVersion: editing.version } : {}), alert: draft });
      setAlerts(previous => [...previous.filter(row => row.id !== result.alert.id), result.alert]);
      setDraft(null); setEditing(null); setNotice('Alert saved. Assigned staff will see the current version.');
      if (target === 'job') await refresh();
    } catch (failure) { setError(failure.message || 'Alert was not saved.'); }
    finally { setSaving(false); }
  };
  return <section aria-label={target === 'property' ? 'Service property alerts' : 'Job alerts'} className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4 text-gray-900">
    <div className="flex items-center justify-between gap-3"><h4 className="font-semibold">{target === 'property' ? 'Service property alerts' : 'Job alerts'}</h4><button type="button" className="text-sm text-primary-700 underline" onClick={refresh} disabled={loading}>Refresh alerts</button></div>
    <p className="text-xs text-gray-600">Internal staff guidance. Only Critical alerts require technician acknowledgment for each assigned visit; Important and Information alerts do not.</p>
    {loading && <p role="status" className="text-sm">Loading alerts…</p>}
    {alerts.filter(row => row.active).map(row => <article key={row.id} className="rounded border bg-white p-3 text-sm">
      <p className="font-semibold">{severityLabel[row.severity] || row.severity} · {row.title}</p>
      <p className="text-xs text-gray-600">{categoryLabel[row.category] || row.category} · Version {row.version}</p>
      <p className="mt-1 whitespace-pre-wrap break-words">{row.description}</p>
      {target === 'job' && row.severity === 'critical' && <p role="status" className={`mt-2 rounded px-2 py-1 text-xs font-semibold ${acknowledgmentStatus?.records?.some(receipt => receipt.alertKey === `${row.source || 'job'}:${row.id}:${row.version}`) ? 'bg-green-100 text-green-900' : 'bg-amber-100 text-amber-900'}`}>
        {(() => {
          const receipt = acknowledgmentStatus?.records?.find(entry => entry.alertKey === `${row.source || 'job'}:${row.id}:${row.version}`);
          return receipt ? `✓ Acknowledged by ${assigneeName || 'assigned technician'} · ${receivedLabel(receipt.receivedAt)}`
            : !acknowledgmentStatus ? loading ? 'Checking acknowledgment…' : 'Acknowledgment status unavailable. Refresh alerts.'
              : acknowledgmentStatus.assigned ? `Awaiting acknowledgment from ${assigneeName || 'assigned technician'}` : 'No verified assigned technician to acknowledge this alert.';
        })()}
      </p>}
      {row.source === 'property' && <p className="mt-1 text-xs text-gray-600">Saved on the service property. Edit it from the customer’s property record.</p>}
      {canManage && row.source !== 'property' && <button type="button" className="mt-2 text-primary-700 underline" onClick={() => start(row)}>Edit or deactivate</button>}
    </article>)}
    {canManage && alerts.filter(row => row.active === false && row.source !== 'property').map(row => <article key={row.id} className="rounded border bg-white p-3 text-sm opacity-75"><p className="font-semibold">Inactive · {row.title}</p><p className="text-xs text-gray-600">Version {row.version} · Staff do not see this alert</p><button type="button" className="mt-2 text-primary-700 underline" onClick={() => start(row)}>Edit or reactivate</button></article>)}
    {!loading && !alerts.some(row => row.active) && <p className="text-sm text-gray-600">No active alerts for this {target === 'property' ? 'property' : 'job'}.</p>}
    {canManage && !draft && <button type="button" className="btn-secondary" onClick={() => start(null)}>Add {target === 'property' ? 'property' : 'job'} alert</button>}
    {draft && canManage && <div className="space-y-3 rounded border bg-white p-3">
      <label className="block text-sm">Title<input className={field} maxLength={120} value={draft.title} onChange={event => change('title', event.target.value)} /></label>
      <label className="block text-sm">Description<textarea className={field} rows={3} maxLength={2000} value={draft.description} onChange={event => change('description', event.target.value)} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Category<SelectControl className={field} value={draft.category} onChange={event => change('category', event.target.value)}>{Object.entries(categoryLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectControl></label>
      <label className="block text-sm">Severity<SelectControl className={field} value={draft.severity} onChange={event => change('severity', event.target.value)}>{Object.entries(severityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectControl></label></div>
      <p className="text-xs text-gray-600">Choose Critical when the assigned technician must confirm reading this alert. Important and Information display without a confirmation step.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={event => change('active', event.target.checked)} />Active</label>
      <div className="flex gap-2"><button type="button" className="btn-primary" disabled={saving || !draft.title.trim() || !draft.description.trim()} onClick={save}>{saving ? 'Saving…' : 'Save alert'}</button><button type="button" className="btn-secondary" onClick={() => setDraft(null)}>Cancel</button></div>
    </div>}
    {notice && <p role="status" className="text-sm text-green-800">{notice}</p>}{error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </section>;
}
