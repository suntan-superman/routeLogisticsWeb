import SelectControl from './SelectControl';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import JobManagementService from '../services/jobManagementService';
import { buildJobEdit } from '../services/jobChanges';
import { auth } from '../services/firebase';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useAuth } from '../contexts/AuthContext';
import ServicePropertyEligibility from './ServicePropertyEligibility';
import ThemedSelect from './ThemedSelect';
import TimeSelect from './TimeSelect';
import AddressValidationNotice from './AddressValidationNotice';
import TechnicianAvailability from './TechnicianAvailability';
import AppointmentRepeatOptions from './AppointmentRepeatOptions';
import { schedulingFingerprint } from '../services/schedulingService';
import { appointmentRecurrence, isDateOnAppointmentRecurrence } from '../utils/appointmentRecurrence';
import { customerAddress, customerView, legacyDate } from '../utils/legacyCustomer';

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
  estimatedDuration: String(job.estimatedDuration ?? job.duration ?? '1'),
  assignedTo: job.assignedTo || '',
  address: typeof job.address === 'string' ? job.address : customerAddress({ address: job.address }),
  totalCost: job.totalCost === undefined || job.totalCost === null ? '' : String(job.totalCost),
  priority: job.priority || 'medium',
  notes: job.notes || ''
} : {
  customerId: '',
  serviceType: '',
  date: todayStr(),
  time: '09:00',
  estimatedDuration: '1',
  assignedTo: '',
  address: '',
  totalCost: '',
  priority: 'medium',
  notes: '',
  ...defaults
});
const formSnapshot = form => JSON.stringify(Object.fromEntries(Object.entries(form).map(([field,value])=>[field,['estimatedDuration','totalCost'].includes(field)?Number(value || 0):String(value ?? '').trim()])));
const propertyFor = (source, customer) => ({ address: (typeof source?.serviceProperty === 'string' ? source.serviceProperty : source?.serviceProperty?.address || source?.serviceProperty?.formattedAddress) || (typeof source?.address === 'string' ? source.address : customerAddress({ address: source?.address })) || customerAddress(customer), serviceCategory: source?.serviceCategory || '', exceptionId: source?.serviceAreaExceptionId || source?.serviceAreaEligibility?.exceptionId || null, confirmed: false });
const propertySnapshot = property => JSON.stringify([property.address.trim(), property.serviceCategory.trim(), property.exceptionId || null]);
const customerVersion = customer => typeof customer?.updatedAt === 'string' ? customer.updatedAt : legacyDate(customer?.updatedAt)?.toISOString() || null;
const savedAddressWarning = response => response?.addressWarning || (response?.job?.serviceAreaEligibility?.status === 'address-unverified' ? response.job.serviceAreaEligibility.warning || 'The job was saved with the entered address. Google could not verify it; map placement and coverage remain unconfirmed.' : '');

const JobFormModal = ({ customers, defaults, job, onClose, onCreated }) => {
  const { company, can } = useAuth();
  const isEdit = !!job;
  const initialCustomer = !job && customers.find(customer => customer.id === defaults?.customerId);
  const [form, setForm] = useState(() => emptyForm(defaults, job));
  const [property, setProperty] = useState(() => propertyFor(job || defaults, initialCustomer)), [savedProperty, setSavedProperty] = useState(() => propertySnapshot(propertyFor(job || defaults, initialCustomer)));
  const initialCustomerPending = useRef(!job && !!defaults?.customerId && !initialCustomer && !propertyFor(defaults).address);
  const [serviceAreaPolicy, setServiceAreaPolicy] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [addressEditing, setAddressEditing] = useState(false), [saveCustomerAddress, setSaveCustomerAddress] = useState(false);
  const [addressValidation, setAddressValidation] = useState(null);
  const [pastAck, setPastAck] = useState(false);
  const [repeatSelection, setRepeatSelection] = useState(null), [assignmentFallback, setAssignmentFallback] = useState('unassigned');
  const [savedRepeat, setSavedRepeat] = useState('null'), [schedulingError, setSchedulingError] = useState(null);
  const bookingOperation = useRef(null);
  const recurrence = useMemo(() => appointmentRecurrence(repeatSelection, form.date), [repeatSelection, form.date]);
  const allowedWeekdays = useMemo(() => recurrence && (recurrence.frequency === 'weekly' || recurrence.monthlyMode === 'weekday') ? [recurrence.weekday] : undefined, [recurrence]);
  const allowAlternative = useCallback(slot => isDateOnAppointmentRecurrence(recurrence, slot.date), [recurrence]);
  const repeatSnapshot = JSON.stringify(repeatSelection ? { ...repeatSelection, assignmentFallback } : null);
  const [savedForm,setSavedForm] = useState(()=>formSnapshot(emptyForm(defaults,job)));
  const selectedCustomer = customers.find(customer => customer.id === form.customerId);
  const selectedCustomerAddress = customerAddress(selectedCustomer);
  const currentAddress = company?.id ? property.address : form.address;
  const canSaveCustomerAddress = !!can?.('customers.manage') && !!selectedCustomer && !!currentAddress.trim() && currentAddress.trim() !== selectedCustomerAddress.trim();
  const alive = useRef(false), savingRef = useRef(false), closing = useRef(false);
  const addressEditCustomer = useRef(null);
  const propertyChanged = propertySnapshot(property) !== savedProperty;
  const locationChanged = propertyChanged || isEdit && form.customerId !== job.customerId;
  const formDirty = formSnapshot(form) !== savedForm || propertyChanged || saveCustomerAddress || repeatSnapshot !== savedRepeat;
  const warnDirty = formDirty || !!reason.trim();
  const {confirmDiscard} = useUnsavedChanges(warnDirty,{message:'You have unsaved job details. Leave without saving them?'});
  const requestClose = useCallback(async()=>{if(savingRef.current||closing.current)return;closing.current=true;try{if(!warnDirty||await confirmDiscard())onClose();}finally{closing.current=false;}},[warnDirty,confirmDiscard,onClose]);

  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);

  useEffect(() => {
    if (!initialCustomerPending.current || savingRef.current) return;
    const customer = customers.find(row => row.id === form.customerId);
    if (!customer) return;
    initialCustomerPending.current = false;
    const address = customerAddress(customer);
    if (!address) return;
    setProperty(previous => ({ ...previous, address, exceptionId: null, confirmed: false }));
    setSavedProperty(previous => { const saved = JSON.parse(previous); saved[0] = address; saved[2] = null; return JSON.stringify(saved); });
    setForm(previous => ({ ...previous, address }));
    setSavedForm(previous => formSnapshot({ ...JSON.parse(previous), address }));
  }, [customers, form.customerId]);

  useEffect(() => {
    const onKey = (e) => {if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();requestClose();}};
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const set = (field, value) => {
    if(savingRef.current)return;
    if (field === 'address' && !addressEditing) return;
    if (field === 'address') initialCustomerPending.current = false;
    if (field === 'address') setAddressValidation(null);
    if (['assignedTo', 'date', 'time', 'estimatedDuration'].includes(field)) setSchedulingError(null);
    if (field === 'address' && value.trim() === selectedCustomerAddress.trim()) setSaveCustomerAddress(false);
    setPastAck(false);
    setForm((f) => ({ ...f, [field]: value }));
  };

  const enableAddressEditing = () => {
    if (savingRef.current || addressEditing || !form.customerId) return;
    initialCustomerPending.current = false;
    addressEditCustomer.current = { id: form.customerId, version: customerVersion(selectedCustomer) };
    setAddressEditing(true);
  };

  const timeChanged = !isEdit || form.date !== job.date || form.time !== job.time;
  const isPast = timeChanged && !!form.date && !!form.time && new Date(`${form.date}T${form.time}`) < new Date();

  const pickCustomer = (id) => {
    if(savingRef.current)return;
    initialCustomerPending.current = false;
    setAddressEditing(false); setSaveCustomerAddress(false); addressEditCustomer.current = null;
    setAddressValidation(null);
    const c = customers.find((x) => x.id === id);
    const address = customerAddress(c);
    setForm((f) => ({ ...f, customerId: id, address: company?.id ? address : c && !f.address ? address : f.address }));
    if (company?.id) setProperty(previous => ({ ...previous, address, exceptionId: null, confirmed: false }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if(savingRef.current || !formDirty)return;
    const customer = customers.find((c) => c.id === form.customerId);
    if (!customer) return toast.error('Select a customer');
    if (!form.serviceType.trim()) return toast.error('Enter a service type');
    if (!form.date || !form.time) return toast.error('Date and time are required');
    if (repeatSelection && !recurrence) return toast.error('Choose a valid first service date for this recurring appointment.');
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
      assignedTo: form.assignedTo || null,
      address: isEdit && !locationChanged ? form.address.trim() || job.address || '' : (company?.id ? property.address.trim() : '') || form.address.trim() || customerAddress(customer),
      ...(company?.id && (locationChanged || !isEdit && property.address.trim()) ? { serviceProperty: { address: property.address.trim() }, serviceCategory: property.serviceCategory.trim(), serviceAreaExceptionId: property.exceptionId || null } : {}),
      totalCost: cost,
      priority: form.priority,
      notes: form.notes.trim()
    };

    if (repeatSelection && !bookingOperation.current) bookingOperation.current = globalThis.crypto.randomUUID();
    const options = saveCustomerAddress || repeatSelection ? { ...(saveCustomerAddress ? { saveCustomerAddress: true, expectedCustomerVersion: addressEditCustomer.current?.version ?? null } : {}), ...(repeatSelection ? { operationId: bookingOperation.current, recurring: { recurrence, preferredTechnicianId: form.assignedTo || null, assignmentFallback } } : {}) } : undefined;
    const requestedSchedule = schedulingFingerprint({ companyId: company?.id, memberId: form.assignedTo, date: form.date, time: form.time, estimatedDuration: duration, jobId: job?.id });
    setSchedulingError(null);
    if (saveCustomerAddress && (!addressEditing || addressEditCustomer.current?.id !== customer.id || !canSaveCustomerAddress)) { savingRef.current = false; setSaving(false); return toast.error('Review the customer address before saving it permanently.'); }
    if (saveCustomerAddress) { details.serviceProperty = { address: currentAddress.trim() }; if (company?.id) { details.serviceCategory = property.serviceCategory.trim(); details.serviceAreaExceptionId = property.exceptionId || null; } }
    let saved, savedCustomer, customerAddressUpdated = false, addressWarning = '';
    try { if (isEdit) {
      const by = auth.currentUser?.displayName || auth.currentUser?.email || 'Unknown';
      const edit = buildJobEdit(job, details, { by, reason });
      if (!edit && !saveCustomerAddress) {
        toast('No changes to save');
        return onClose();
      }
      const res = await JobManagementService.updateJob(job.id, edit || details, job.updatedAt ?? null, options);
      if (!alive.current)return;
      if (!res.success) throw Object.assign(Error(res.error || 'Could not update job'), { addressValidation: res.addressValidation, scheduling: res.scheduling });
      setSavedForm(formSnapshot(form));setSavedProperty(propertySnapshot(property));setReason('');setSaveCustomerAddress(false);
      customerAddressUpdated = res.customerAddressUpdated === true;
      savedCustomer = res.customer;
      addressWarning = res.addressWarning || (locationChanged || saveCustomerAddress ? savedAddressWarning(res) : '');
      toast.success(customerAddressUpdated ? 'Job and customer address updated.' : 'Job updated – flagged as modified from original');
      saved=res.job || {...job,...(edit || details)};
    } else {
      const result = await JobManagementService.createJob(details, options);
      if (!alive.current)return;
      if (!result.success) throw Object.assign(Error(result.error || 'Could not create job'), { addressValidation: result.addressValidation, scheduling: result.scheduling });
      addressWarning = savedAddressWarning(result);
      setSavedForm(formSnapshot(form));setSavedProperty(propertySnapshot(property));setSavedRepeat(repeatSnapshot);setReason('');setSaveCustomerAddress(false);customerAddressUpdated = result.customerAddressUpdated === true;savedCustomer=result.customer;toast.success(repeatSelection ? customerAddressUpdated ? 'Recurring appointment and customer address saved.' : 'Recurring appointment scheduled.' : customerAddressUpdated ? 'Job scheduled and customer address updated.' : 'Job scheduled');saved=result.job;
    } } catch(error) { if(alive.current) { setAddressValidation(error.addressValidation || null); if (error.scheduling) setSchedulingError({ fingerprint: requestedSchedule, result: error.scheduling }); toast.error(error.message || 'Unable to save this job. Your changes are available to retry.'); }return; }
    finally { savingRef.current=false;if(alive.current)setSaving(false); }
    if (addressWarning) toast(addressWarning, { icon: '⚠️', duration: 7000 });
    try { await onCreated(saved, { customerAddressUpdated, ...(savedCustomer ? { customer: customerView(savedCustomer.id, savedCustomer) } : {}) }); } catch { if(alive.current)toast.error('The job was saved, but the job list could not refresh. Refresh the page to see it.'); }
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
          <ThemedSelect label="Customer" required value={form.customerId} options={[{ value: '', label: 'Select a customer…' }, ...customers.map(customer => ({ value: customer.id, label: customer.name }))]} onChange={pickCustomer} disabled={saving} placeholder={customers.length ? 'Select a customer…' : 'No customers yet – add one first'} autoFocus />

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
            <TimeSelect label="Start time" required value={form.time} onChange={value => set('time', value)} disabled={saving} />
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

          <TechnicianAvailability companyId={company?.id} memberId={form.assignedTo} memberName={job?.assignedToName} date={form.date} time={form.time} estimatedDuration={form.estimatedDuration} jobId={job?.id} disabled={saving} allowedWeekdays={allowedWeekdays} isAlternativeAllowed={allowAlternative} schedulingError={schedulingError} onMemberChange={id => set('assignedTo', id)} onSelectAlternative={slot => { if (savingRef.current) return; setSchedulingError(null); setPastAck(false); setForm(previous => ({ ...previous, date: slot.date, time: slot.time })); }} />
          {!isEdit && <AppointmentRepeatOptions value={repeatSelection} onChange={value => { if (!savingRef.current) { setRepeatSelection(value); setSchedulingError(null); } }} date={form.date} assignmentFallback={assignmentFallback} onFallbackChange={setAssignmentFallback} disabled={saving} company={!!company?.id} />}
          {isEdit && job.servicePlanId && <p className="text-sm text-gray-600">This is a recurring visit. Changes here apply to this visit only; the service plan controls later visits.</p>}

          {!company?.id && <div>
            <label className={label}>Service address</label>
            <input
              value={form.address}
              disabled={!addressEditing || saving}
              onChange={(e) => set('address', e.target.value)}
              className={input}
              placeholder="Defaults to the customer's address"
            />
          </div>}
          <div className="rounded-lg border border-gray-200 p-3">
            {!addressEditing ? <button type="button" disabled={saving || !form.customerId} className="text-sm font-medium text-primary-700 underline disabled:opacity-50" onClick={enableAddressEditing}>Enable Editing</button> : <p className="text-sm font-medium text-gray-700">Address editing enabled for this job.</p>}
            {addressEditing && canSaveCustomerAddress && <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" aria-label="Update customer's saved address" checked={saveCustomerAddress} disabled={saving} onChange={event => setSaveCustomerAddress(event.target.checked)} /><span>Update customer's saved address<span className="mt-1 block text-xs text-gray-600">New jobs will default to this address. Recorded job and service-plan addresses will not be rewritten.</span></span></label>}
          </div>
          {company?.id && <>
            {isEdit && job.address && !job.serviceProperty && <p className="text-sm text-gray-600">Recorded service address: {typeof job.address === 'string' ? job.address : customerAddress({ address: job.address })}. Normal edits preserve this appointment; enter a service property only when changing its location.</p>}
            {!!selectedCustomerAddress && property.address === selectedCustomerAddress && <p className="text-sm text-gray-600">Using the customer's saved address. Change the service property below if this visit is at a different location.</p>}
            <ServicePropertyEligibility key={form.customerId} companyId={company.id} serviceCategories={company.serviceCategories || []} value={property} validation={addressValidation} purpose="scheduling" existing={isEdit} disabled={saving} addressReadOnly={!addressEditing} onEnableAddressEditing={enableAddressEditing} billingAddress={selectedCustomerAddress} onPolicyLoaded={setServiceAreaPolicy} onChange={next => { if (savingRef.current || !addressEditing && next.address !== property.address) return; initialCustomerPending.current = false; if (next.address.trim() === selectedCustomerAddress.trim()) setSaveCustomerAddress(false); if (next.address !== property.address) setAddressValidation(null); setProperty(next); if (next.address !== property.address) setForm(previous => ({ ...previous, address: next.address })); }} />
          </>}
          {!company?.id && <AddressValidationNotice validation={addressValidation} disabled={saving} onAccept={!addressEditing ? undefined : address => { if (savingRef.current) return; initialCustomerPending.current = false; setAddressValidation(null); if (address.trim() === selectedCustomerAddress.trim()) setSaveCustomerAddress(false); setForm(previous => ({ ...previous, address })); }}>
            {!addressEditing && <div className="space-y-2"><p>The saved address is locked. Enable Editing, then use the suggested address.</p><button type="button" aria-label="Enable Editing for suggested address" disabled={saving || !form.customerId} className="rounded-lg bg-primary-700 px-4 py-2 font-medium text-white hover:bg-primary-800 disabled:opacity-50" onClick={enableAddressEditing}>Enable Editing</button></div>}
          </AddressValidationNotice>}

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
              <SelectControl aria-label="Priority" value={form.priority} onChange={(e) => set('priority', e.target.value)} className={input}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </SelectControl>
            </div>
          </div>

          <div>
            <label htmlFor="job-notes" className={label}>Notes</label>
            <textarea
              id="job-notes"
              aria-describedby="job-notes-help"
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              className={input}
              placeholder="Gate code, pets, areas of concern…"
            />
            <p id="job-notes-help" className="mt-1 text-xs text-gray-500">Shared with assigned staff. Use for gate codes and service instructions.</p>
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
