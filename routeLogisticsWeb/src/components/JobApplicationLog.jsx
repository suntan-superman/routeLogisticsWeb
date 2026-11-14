import React, { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { addServiceLog, listServiceLogsForJob, UNITS } from '../services/serviceLogService';
import { useAuth } from '../contexts/AuthContext';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

const blank = { product: '', epaRegNo: '', activeIngredient: '', amount: '', unit: 'fl oz', targetPest: '', areaTreated: '', method: '', applicatorLicense: '', notes: '' };

const field = 'mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm';

const JobApplicationLog = ({ job }) => {
  const { currentUser: user, company, role } = useAuth();
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const live = useRef(false), generation = useRef(0), lock = useRef(false);
  const scope = [user?.uid, company?.id || job.companyId, role, job.id].join(':');
  const changed = open && JSON.stringify(form) !== JSON.stringify(blank);
  const { confirmDiscard } = useUnsavedChanges(changed, { scope: `job:${job.id}`, message: 'Your chemical application record has not been saved. Leave without saving it?' });

  const load = useCallback(async (afterSave = false) => {
    const ticket = generation.current;
    try {
      const res = await listServiceLogsForJob(job.id);
      if (!live.current || ticket !== generation.current) return;
      if (!res.success) throw new Error(res.error || 'Application records could not be loaded.');
      setLogs(res.logs); setError('');
    } catch (failure) { if (live.current && ticket === generation.current) setError(afterSave ? 'Application recorded, but the list could not refresh. Reload the job to view the saved record.' : failure.message || 'Application records could not be loaded. Reload the job to retry.'); }
  }, [job.id]);

  useEffect(() => {
    const lifecycle = generation;
    live.current = true; generation.current++; lock.current = false; setForm(blank); setOpen(false); setSaving(false); setLogs([]); setError(''); load();
    return () => { live.current = false; lifecycle.current++; };
  }, [load, scope]);

  const set = (k) => (e) => { if (!lock.current) setForm((f) => ({ ...f, [k]: e.target.value })); };
  const toggle = async () => {
    if (lock.current) return;
    const ticket = generation.current;
    if (open && changed && !(await confirmDiscard())) return;
    if (!live.current || ticket !== generation.current) return;
    setForm(blank); setError(''); setOpen(value => !value);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (lock.current || !changed) return;
    if (!form.product.trim() || !form.targetPest.trim() || !Number.isFinite(Number(form.amount)) || !(Number(form.amount) > 0)) { toast.error('Enter a product, positive amount used, and target pest before saving.'); return; }
    const ticket = generation.current; lock.current = true; setSaving(true); setError('');
    try {
      const res = await addServiceLog({
      ...form,
      jobId: job.id,
      customerId: job.customerId,
      customerName: job.customerName,
      siteAddress: job.address,
      applicationDate: job.date,
      applicatorName: user?.displayName || user?.email || '',
      });
      if (!live.current || ticket !== generation.current) return;
      if (!res.success) throw new Error(res.error || 'The application record was not saved. Your input is retained.');
      toast.success('Application recorded'); setForm(blank); setOpen(false); await load(true);
    } catch (failure) { if (live.current && ticket === generation.current) { const detail = failure.message || 'The application record was not saved. Your input is retained.'; setError(detail); toast.error(detail); } }
    finally { if (live.current && ticket === generation.current) { lock.current = false; setSaving(false); } }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-sm font-medium text-gray-700">Chemical application log ({logs.length})</h5>
        <button type="button" onClick={toggle} disabled={saving} className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">
          {open ? 'Cancel' : 'Record application'}
        </button>
      </div>
      {error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}

      {open && (
        <form onSubmit={submit} className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-md mb-3">
          <label className="col-span-2 text-xs text-gray-600">Product *<input required className={field} value={form.product} onChange={set('product')} /></label>
          <label className="text-xs text-gray-600">EPA Reg. No.<input className={field} value={form.epaRegNo} onChange={set('epaRegNo')} /></label>
          <label className="text-xs text-gray-600">Active ingredient<input className={field} value={form.activeIngredient} onChange={set('activeIngredient')} /></label>
          <label className="text-xs text-gray-600">Amount used *<input required type="number" min="0" step="any" className={field} value={form.amount} onChange={set('amount')} /></label>
          <label className="text-xs text-gray-600">Unit *
            <select className={field} value={form.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
          </label>
          <label className="text-xs text-gray-600">Target pest *<input required className={field} value={form.targetPest} onChange={set('targetPest')} /></label>
          <label className="text-xs text-gray-600">Area treated<input className={field} value={form.areaTreated} onChange={set('areaTreated')} /></label>
          <label className="text-xs text-gray-600">Method<input className={field} placeholder="spray, bait, dust…" value={form.method} onChange={set('method')} /></label>
          <label className="text-xs text-gray-600">Applicator license no.<input className={field} value={form.applicatorLicense} onChange={set('applicatorLicense')} /></label>
          <label className="col-span-2 text-xs text-gray-600">Notes<textarea rows={2} className={field} value={form.notes} onChange={set('notes')} /></label>
          <div className="col-span-2 flex justify-end">
            <button disabled={saving || !changed} className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save record'}
            </button>
          </div>
        </form>
      )}

      {logs.length === 0 ? (
        <p className="text-sm text-gray-500">No applications recorded.</p>
      ) : (
        <ul className="divide-y text-sm">
          {logs.map((l) => (
            <li key={l.id} className="py-2">
              <span className="font-medium">{l.product}</span>
              {l.epaRegNo && <span className="text-gray-500"> · EPA {l.epaRegNo}</span>}
              <div className="text-gray-600">{l.amount} {l.unit} → {l.targetPest}{l.areaTreated ? ` (${l.areaTreated})` : ''} · {l.applicatorName}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default JobApplicationLog;
