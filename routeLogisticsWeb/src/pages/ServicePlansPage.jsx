import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import CustomerService from '../services/customerService';
import { listServicePlans, createServicePlan, updateServicePlan, deleteServicePlan, generateNextJob, FREQUENCIES } from '../services/servicePlanService';
import { listServiceLogs, logsToCsv } from '../services/serviceLogService';
import { canManage } from '../services/tenancy';

const input = 'mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm';
const todayIso = () => new Date().toISOString().slice(0, 10);
const blank = { customerId: '', serviceType: 'General Pest Control', frequencyDays: 90, nextServiceDate: todayIso(), time: '09:00', price: '', notes: '' };
const freqLabel = (d) => FREQUENCIES.find((f) => f.days === d)?.label || `Every ${d} days`;

const ServicePlansPage = () => {
  const [plans, setPlans] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState({ start: '', end: '' });
  const manage = canManage();

  const load = useCallback(async () => {
    setLoading(true);
    const [p, c] = await Promise.all([listServicePlans(), CustomerService.getCustomers(500)]);
    setLoading(false);
    if (p.success) setPlans(p.plans);
    else toast.error(p.error || 'Could not load service plans');
    if (c.success) setCustomers(c.customers);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const customer = customers.find((c) => c.id === form.customerId);
    const res = await createServicePlan({
      ...form,
      customerName: customer?.name || '',
      customerPhone: customer?.phone || '',
      address: customer?.address || '',
    });
    if (!res.success) return toast.error(res.error);
    toast.success('Service plan created');
    setForm(blank);
    setShowForm(false);
    load();
  };

  const generate = async (plan) => {
    const res = await generateNextJob(plan);
    if (!res.success) return toast.error(res.error);
    toast.success(`Job scheduled for ${plan.nextServiceDate}; next visit ${res.nextServiceDate}`);
    load();
  };

  const remove = async (plan) => {
    if (!window.confirm(`Delete the plan for ${plan.customerName}?`)) return;
    const res = await deleteServicePlan(plan.id);
    if (!res.success) return toast.error(res.error);
    load();
  };

  const toggle = async (plan) => {
    const res = await updateServicePlan(plan.id, { active: !plan.active });
    if (!res.success) return toast.error(res.error);
    load();
  };

  const exportLogs = async () => {
    const res = await listServiceLogs(range.start || null, range.end || null);
    if (!res.success) return toast.error(res.error);
    if (!res.logs.length) return toast('No application records in that range');
    const url = URL.createObjectURL(new Blob([logsToCsv(res.logs)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `application-records-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const due = (p) => p.active && p.nextServiceDate <= todayIso();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service Plans</h1>
          <p className="text-sm text-gray-500">Recurring pest-control routes. Generate each visit as a scheduled job.</p>
        </div>
        {manage && <button onClick={() => setShowForm((s) => !s)} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">{showForm ? 'Cancel' : 'New plan'}</button>}
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-gray-700 sm:col-span-2">Customer *
            <select required className={input} value={form.customerId} onChange={set('customerId')}>
              <option value="">Select…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm text-gray-700">Service<input className={input} value={form.serviceType} onChange={set('serviceType')} /></label>
          <label className="text-sm text-gray-700">Frequency
            <select className={input} value={form.frequencyDays} onChange={set('frequencyDays')}>{FREQUENCIES.map((f) => <option key={f.days} value={f.days}>{f.label}</option>)}</select>
          </label>
          <label className="text-sm text-gray-700">First service date<input required type="date" className={input} value={form.nextServiceDate} onChange={set('nextServiceDate')} /></label>
          <label className="text-sm text-gray-700">Time<input type="time" className={input} value={form.time} onChange={set('time')} /></label>
          <label className="text-sm text-gray-700">Price per visit ($)<input type="number" min="0" step="0.01" className={input} value={form.price} onChange={set('price')} /></label>
          <label className="text-sm text-gray-700">Notes<input className={input} value={form.notes} onChange={set('notes')} /></label>
          <div className="sm:col-span-2 flex justify-end"><button className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">Create plan</button></div>
        </form>
      )}

      <div className="bg-white rounded-lg border overflow-x-auto">
        {loading ? <p className="p-6 text-gray-500">Loading…</p> : plans.length === 0 ? <p className="p-6 text-gray-500">No service plans yet.</p> : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Service</th><th className="px-4 py-3">Frequency</th><th className="px-4 py-3">Next visit</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody className="divide-y">
              {plans.map((p) => (
                <tr key={p.id} className={p.active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3 font-medium">{p.customerName}</td>
                  <td className="px-4 py-3">{p.serviceType}</td>
                  <td className="px-4 py-3">{freqLabel(p.frequencyDays)}</td>
                  <td className="px-4 py-3">{p.nextServiceDate}{due(p) && <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">Due</span>}</td>
                  <td className="px-4 py-3 text-right">${Number(p.price || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                    {manage && p.active && <button className="text-primary-600 hover:underline" onClick={() => generate(p)}>Schedule visit</button>}
                    {manage && <button className="text-gray-600 hover:underline" onClick={() => toggle(p)}>{p.active ? 'Pause' : 'Resume'}</button>}
                    {manage && <button className="text-red-600 hover:underline" onClick={() => remove(p)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white border rounded-lg p-4">
        <h2 className="font-semibold text-gray-900">Chemical application records</h2>
        <p className="text-sm text-gray-500 mb-3">Export pesticide application records for regulatory inspection. Records are recorded on each job and cannot be deleted.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-700">From<input type="date" className={input} value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} /></label>
          <label className="text-sm text-gray-700">To<input type="date" className={input} value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} /></label>
          <button onClick={exportLogs} className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">Export CSV</button>
        </div>
      </div>
    </div>
  );
};

export default ServicePlansPage;
