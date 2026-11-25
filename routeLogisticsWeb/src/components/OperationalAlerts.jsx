import { useEffect, useRef, useState } from 'react';
import { callWorkspace } from '../services/workspaceApi';
import SelectControl from './SelectControl';

const blank = () => ({ title: '', description: '', category: 'access', severity: 'important', active: true });
const severityLabel = { informational: 'Information', important: 'Important', critical: 'Critical' };
const categoryLabel = { safety: 'Safety', access: 'Access', 'customer-instructions': 'Customer instructions', other: 'Other' };
const field = 'w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500';

export default function OperationalAlerts({ target, customerId, propertyId, jobId, canManage = false, initialAlerts = [] }) {
  const [alerts, setAlerts] = useState(initialAlerts), [draft, setDraft] = useState(null), [editing, setEditing] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const operation = useRef(null);
  const identifiers = { target, ...(target === 'property' ? { customerId, propertyId } : { jobId }) };
  const key = `${target}:${customerId || ''}:${propertyId || ''}:${jobId || ''}`;
  useEffect(() => {
    if (!(target === 'property' ? customerId && propertyId : jobId)) return undefined;
    let live = true;
    setAlerts(initialAlerts); setDraft(null); setEditing(null); setError(''); setNotice(''); setLoading(true);
    callWorkspace('rlOperationalAlerts', { action: 'list', ...identifiers }).then(result => { if (live) setAlerts(result.alerts || []); }).catch(failure => { if (live) setError(failure.message || 'Alerts could not be loaded.'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // The target identity, rather than a polling snapshot, owns this editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const refresh = async () => {
    setLoading(true); setError('');
    try { const result = await callWorkspace('rlOperationalAlerts', { action: 'list', ...identifiers }); setAlerts(result.alerts || []); }
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
    } catch (failure) { setError(failure.message || 'Alert was not saved.'); }
    finally { setSaving(false); }
  };
  return <section aria-label={target === 'property' ? 'Service property alerts' : 'Job alerts'} className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4 text-gray-900">
    <div className="flex items-center justify-between gap-3"><h4 className="font-semibold">{target === 'property' ? 'Service property alerts' : 'Job alerts'}</h4><button type="button" className="text-sm text-primary-700 underline" onClick={refresh} disabled={loading}>Refresh alerts</button></div>
    <p className="text-xs text-gray-600">Internal staff guidance. Critical updates require a new acknowledgment for each assigned visit.</p>
    {loading && <p role="status" className="text-sm">Loading alerts…</p>}
    {alerts.filter(row => row.active).map(row => <article key={row.id} className="rounded border bg-white p-3 text-sm">
      <p className="font-semibold">{severityLabel[row.severity] || row.severity} · {row.title}</p>
      <p className="text-xs text-gray-600">{categoryLabel[row.category] || row.category} · Version {row.version}</p>
      <p className="mt-1 whitespace-pre-wrap break-words">{row.description}</p>
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
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={event => change('active', event.target.checked)} />Active</label>
      <div className="flex gap-2"><button type="button" className="btn-primary" disabled={saving || !draft.title.trim() || !draft.description.trim()} onClick={save}>{saving ? 'Saving…' : 'Save alert'}</button><button type="button" className="btn-secondary" onClick={() => setDraft(null)}>Cancel</button></div>
    </div>}
    {notice && <p role="status" className="text-sm text-green-800">{notice}</p>}{error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </section>;
}
