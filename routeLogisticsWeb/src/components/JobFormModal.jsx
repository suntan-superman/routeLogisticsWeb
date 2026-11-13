import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import JobManagementService from '../services/jobManagementService';

const SERVICE_TYPES = [
  'General Pest Control',
  'Termite Inspection',
  'Termite Treatment',
  'Rodent Control',
  'Ant Treatment',
  'Cockroach Treatment',
  'Bed Bug Treatment',
  'Mosquito Treatment',
  'Wildlife Removal',
  'Lawn Care',
  'Cleaning',
  'Maintenance',
  'Inspection'
];

const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const input =
  'mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm';
const label = 'block text-sm font-medium text-gray-700';

const emptyForm = (defaults) => ({
  customerId: '',
  serviceType: '',
  date: todayStr(),
  time: '09:00',
  estimatedDuration: '1',
  address: '',
  totalCost: '',
  priority: 'medium',
  notes: '',
  ...defaults
});

const JobFormModal = ({ customers, defaults, onClose, onCreated }) => {
  const [form, setForm] = useState(() => emptyForm(defaults));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const customerAddress = (c) =>
    [c.address, c.city, [c.state, c.zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  const pickCustomer = (id) => {
    const c = customers.find((x) => x.id === id);
    setForm((f) => ({ ...f, customerId: id, address: c && !f.address ? customerAddress(c) : f.address }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const customer = customers.find((c) => c.id === form.customerId);
    if (!customer) return toast.error('Select a customer');
    if (!form.serviceType.trim()) return toast.error('Enter a service type');
    if (!form.date || !form.time) return toast.error('Date and time are required');
    const cost = form.totalCost === '' ? 0 : Number(form.totalCost);
    const duration = Number(form.estimatedDuration);
    if (!(cost >= 0) || !(duration > 0)) return toast.error('Cost and duration must be valid numbers');

    setSaving(true);
    const result = await JobManagementService.createJob({
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone || '',
      serviceType: form.serviceType.trim(),
      date: form.date,
      time: form.time,
      estimatedDuration: duration,
      address: form.address.trim() || customerAddress(customer),
      totalCost: cost,
      priority: form.priority,
      notes: form.notes.trim()
    });
    setSaving(false);
    if (!result.success) return toast.error(result.error || 'Could not create job');
    toast.success('Job scheduled');
    onCreated(result.job);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/50 p-4 sm:py-12">
      <form onSubmit={submit} className="w-full max-w-xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Schedule New Job</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className={label}>Customer *</label>
            <select value={form.customerId} onChange={(e) => pickCustomer(e.target.value)} className={input} autoFocus>
              <option value="">{customers.length ? 'Select a customer…' : 'No customers yet – add one first'}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={label}>Service type *</label>
            <input
              list="job-service-types"
              value={form.serviceType}
              onChange={(e) => set('serviceType', e.target.value)}
              className={input}
              placeholder="e.g. General Pest Control"
            />
            <datalist id="job-service-types">
              {SERVICE_TYPES.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={label}>Date *</label>
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Start time *</label>
              <input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Duration (hrs)</label>
              <input
                type="number" min="0.25" step="0.25"
                value={form.estimatedDuration}
                onChange={(e) => set('estimatedDuration', e.target.value)}
                className={input}
              />
            </div>
          </div>

          <div>
            <label className={label}>Service address</label>
            <input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              className={input}
              placeholder="Defaults to the customer's address"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Price ($)</label>
              <input
                type="number" min="0" step="0.01"
                value={form.totalCost}
                onChange={(e) => set('totalCost', e.target.value)}
                className={input}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className={label}>Priority</label>
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className={input}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              className={input}
              placeholder="Gate code, pets, areas of concern…"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 rounded-b-xl">
          <button
            type="button" onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit" disabled={saving}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'Scheduling…' : 'Schedule Job'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default JobFormModal;
