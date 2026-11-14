import React, { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import JobManagementService from '../services/jobManagementService';
import { buildJobEdit } from '../services/jobChanges';
import { auth } from '../services/firebase';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useAuth } from '../contexts/AuthContext';
import ServicePropertyEligibility from './ServicePropertyEligibility';

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

const emptyForm = (defaults, job) => (job ? {
  customerId: job.customerId || '',
  serviceType: job.serviceType || '',
  date: job.date || todayStr(),
  time: job.time || '09:00',
  estimatedDuration: String(job.estimatedDuration ?? '1'),
  address: job.address || '',
  totalCost: job.totalCost === undefined || job.totalCost === null ? '' : String(job.totalCost),
  priority: job.priority || 'medium',
  notes: job.notes || ''
} : {
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
const formSnapshot = form => JSON.stringify(Object.fromEntries(Object.entries(form).map(([field,value])=>[field,['estimatedDuration','totalCost'].includes(field)?Number(value || 0):String(value ?? '').trim()])));
const propertyFor = source => ({ address: source?.serviceProperty?.address || source?.serviceProperty?.formattedAddress || '', serviceCategory: source?.serviceCategory || '', exceptionId: source?.serviceAreaExceptionId || source?.serviceAreaEligibility?.exceptionId || null, confirmed: false });
const propertySnapshot = property => JSON.stringify([property.address.trim(), property.serviceCategory.trim(), property.exceptionId || null]);

const JobFormModal = ({ customers, defaults, job, onClose, onCreated }) => {
  const { company } = useAuth();
  const isEdit = !!job;
  const [form, setForm] = useState(() => emptyForm(defaults, job));
  const [property, setProperty] = useState(() => propertyFor(job || defaults)), [savedProperty, setSavedProperty] = useState(() => propertySnapshot(propertyFor(job || defaults)));
  const [serviceAreaPolicy, setServiceAreaPolicy] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [pastAck, setPastAck] = useState(false);
  const [savedForm,setSavedForm] = useState(()=>formSnapshot(emptyForm(defaults,job)));
  const alive = useRef(false), savingRef = useRef(false), closing = useRef(false);
  const propertyChanged = propertySnapshot(property) !== savedProperty;
  const locationChanged = propertyChanged || isEdit && form.customerId !== job.customerId;
  const formDirty = formSnapshot(form) !== savedForm || propertyChanged;
  const warnDirty = formDirty || !!reason.trim();
  const {confirmDiscard} = useUnsavedChanges(warnDirty,{message:'You have unsaved job details. Leave without saving them?'});
  const requestClose = useCallback(async()=>{if(savingRef.current||closing.current)return;closing.current=true;try{if(!warnDirty||await confirmDiscard())onClose();}finally{closing.current=false;}},[warnDirty,confirmDiscard,onClose]);

  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);

  useEffect(() => {
    const onKey = (e) => {if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();requestClose();}};
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const set = (field, value) => {
    if(savingRef.current)return;
    setPastAck(false);
    setForm((f) => ({ ...f, [field]: value }));
  };

  const timeChanged = !isEdit || form.date !== job.date || form.time !== job.time;
  const isPast = timeChanged && !!form.date && !!form.time && new Date(`${form.date}T${form.time}`) < new Date();

  const customerAddress = (c) => {
    const address = typeof c?.address === 'string' ? c.address : c?.address?.street || c?.address?.line1 || '';
    return [address, c?.city || c?.address?.city, [c?.state || c?.address?.state, c?.zipCode || c?.address?.zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  };

  const pickCustomer = (id) => {
    if(savingRef.current)return;
    const c = customers.find((x) => x.id === id);
    setForm((f) => ({ ...f, customerId: id, address: company?.id ? '' : c && !f.address ? customerAddress(c) : f.address }));
    if (company?.id) setProperty(previous => ({ ...previous, address: '', exceptionId: null, confirmed: false }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if(savingRef.current || !formDirty)return;
    const customer = customers.find((c) => c.id === form.customerId);
    if (!customer) return toast.error('Select a customer');
    if (!form.serviceType.trim()) return toast.error('Enter a service type');
    if (!form.date || !form.time) return toast.error('Date and time are required');
    if (company?.id && (!isEdit || locationChanged) && !serviceAreaPolicy) return toast.error('Wait for the service-area settings to load, or retry the property check.');
    if (company?.id && (serviceAreaPolicy?.settings?.configured || locationChanged) && (!isEdit || locationChanged) && !property.address.trim()) return toast.error('Enter the service property address explicitly before saving this job.');
    const cost = form.totalCost === '' ? 0 : Number(form.totalCost);
    const duration = Number(form.estimatedDuration);
    if (!(cost >= 0) || !(duration > 0)) return toast.error('Cost and duration must be valid numbers');
    if (isPast && !pastAck) {
      setPastAck(true);
      return;
    }

    savingRef.current=true;setSaving(true);
    const details = {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone || '',
      serviceType: form.serviceType.trim(),
      date: form.date,
      time: form.time,
      estimatedDuration: duration,
      address: isEdit && !locationChanged ? form.address.trim() || job.address || '' : property.address.trim() || form.address.trim() || customerAddress(customer),
      ...(company?.id && (locationChanged || !isEdit && property.address.trim()) ? { serviceProperty: { address: property.address.trim() }, serviceCategory: property.serviceCategory.trim(), serviceAreaExceptionId: property.exceptionId || null } : {}),
      totalCost: cost,
      priority: form.priority,
      notes: form.notes.trim()
    };

    let saved;
    try { if (isEdit) {
      const by = auth.currentUser?.displayName || auth.currentUser?.email || 'Unknown';
      const edit = buildJobEdit(job, details, { by, reason });
      if (!edit) {
        toast('No changes to save');
        return onClose();
      }
      const res = await JobManagementService.updateJob(job.id, edit, job.updatedAt ?? null);
      if (!alive.current)return;
      if (!res.success) throw Error(res.error || 'Could not update job');
      setSavedForm(formSnapshot(form));setSavedProperty(propertySnapshot(property));setReason('');
      toast.success('Job updated – flagged as modified from original');
      saved={...job,...edit};
    } else {
      const result = await JobManagementService.createJob(details);
      if (!alive.current)return;
      if (!result.success) throw Error(result.error || 'Could not create job');
      setSavedForm(formSnapshot(form));setSavedProperty(propertySnapshot(property));setReason('');toast.success('Job scheduled');saved=result.job;
    } } catch(error) { if(alive.current)toast.error(error.message || 'Unable to save this job. Your changes are available to retry.');return; }
    finally { savingRef.current=false;if(alive.current)setSaving(false); }
    try { await onCreated(saved); } catch { if(alive.current)toast.error('The job was saved, but the job list could not refresh. Refresh the page to see it.'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/50 p-4 sm:py-12">
      <form onSubmit={submit} className="w-full max-w-xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Job' : 'Schedule New Job'}</h3>
          <button type="button" disabled={saving} onClick={requestClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
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

          {!company?.id && <div>
            <label className={label}>Service address</label>
            <input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              className={input}
              placeholder="Defaults to the customer's address"
            />
          </div>}
          {company?.id && <>
            {isEdit && job.address && !job.serviceProperty && <p className="text-sm text-gray-600">Recorded service address: {job.address}. Normal edits preserve this appointment; enter a service property only when changing its location.</p>}
            <ServicePropertyEligibility companyId={company.id} serviceCategories={company.serviceCategories || []} value={property} purpose="scheduling" existing={isEdit} billingAddress={customerAddress(customers.find(customer => customer.id === form.customerId))} onPolicyLoaded={setServiceAreaPolicy} onChange={next => { if (savingRef.current) return; setProperty(next); if (next.address !== property.address) setForm(previous => ({ ...previous, address: next.address })); }} />
          </>}

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

        {isEdit && (
          <div className="mx-6 mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className={label}>Reason for change <span className="font-normal text-gray-400">(optional)</span></label>
            <input
              value={reason}
              onChange={(e) => {if(!savingRef.current)setReason(e.target.value);}}
              className={input}
              placeholder="e.g. Customer added a second treatment area"
            />
            <p className="mt-2 text-xs text-gray-500">
              Changes are recorded and the job is flagged as modified from the original.
            </p>
          </div>
        )}

        {isPast && (
          <div className={`mx-6 mb-4 rounded-lg border p-3 text-sm ${pastAck ? 'border-amber-400 bg-amber-100 text-amber-900' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <strong>This date and time is in the past.</strong>{' '}
            {pastAck
              ? 'Click "Schedule anyway" to confirm (e.g. an emergency call-out or after-the-fact entry).'
              : 'You can still save it for an emergency call-out or after-the-fact entry, but you will be asked to confirm.'}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 rounded-b-xl">
          <button
            type="button" disabled={saving} onClick={requestClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit" disabled={saving || !formDirty || !!company?.id && (!isEdit || locationChanged) && !serviceAreaPolicy}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : pastAck ? 'Schedule anyway' : isEdit ? 'Save Changes' : 'Schedule Job'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default JobFormModal;
