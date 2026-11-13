import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { addServiceLog, listServiceLogsForJob, UNITS } from '../services/serviceLogService';
import { useAuth } from '../contexts/AuthContext';

const blank = { product: '', epaRegNo: '', activeIngredient: '', amount: '', unit: 'fl oz', targetPest: '', areaTreated: '', method: '', applicatorLicense: '', notes: '' };

const field = 'mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm';

const JobApplicationLog = ({ job }) => {
  const { currentUser: user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await listServiceLogsForJob(job.id);
    if (res.success) setLogs(res.logs);
  }, [job.id]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const res = await addServiceLog({
      ...form,
      jobId: job.id,
      customerId: job.customerId,
      customerName: job.customerName,
      siteAddress: job.address,
      applicationDate: job.date,
      applicatorName: user?.displayName || user?.email || '',
    });
    setSaving(false);
    if (!res.success) return toast.error(res.error);
    toast.success('Application recorded');
    setForm(blank);
    setOpen(false);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-sm font-medium text-gray-700">Chemical application log ({logs.length})</h5>
        <button type="button" onClick={() => setOpen((o) => !o)} className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
          {open ? 'Cancel' : 'Record application'}
        </button>
      </div>

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
            <button disabled={saving} className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50">
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
