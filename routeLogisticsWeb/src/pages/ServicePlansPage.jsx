import SelectControl from '../components/SelectControl';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import CustomerService from '../services/customerService';
import { listServicePlans, createServicePlan, updateServicePlan, pauseServicePlan, resumeServicePlan, deleteServicePlan, generateNextJob, FREQUENCIES } from '../services/servicePlanService';
import { listServiceLogs, logsToCsv } from '../services/serviceLogService';
import { canManage } from '../services/tenancy';
import { useConfirm } from '../components/ConfirmProvider';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useAuth } from '../contexts/AuthContext';
import ServicePropertyEligibility from '../components/ServicePropertyEligibility';
import TimeSelect from '../components/TimeSelect';
import AddressValidationNotice from '../components/AddressValidationNotice';
import TechnicianAvailability from '../components/TechnicianAvailability';
import { schedulingFingerprint } from '../services/schedulingService';
import { appointmentRecurrence, describeAppointmentRecurrence, isDateOnAppointmentRecurrence } from '../utils/appointmentRecurrence';
import { useWorkspaceQuery, useInvalidateWorkspace } from '../hooks/useWorkspaceQuery';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';

const input = 'mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm';
const todayIso = (timeZone = 'America/Los_Angeles') => {
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }); }
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const blank = { customerId: '', serviceType: 'General Pest Control', frequencyDays: 90, nextServiceDate: '', time: '09:00', estimatedDuration: '1', preferredTechnicianId: '', assignmentFallback: 'unassigned', monthlyMode: 'dayOfMonth', price: '', notes: '' };
const frequencyRule = days => ({ 7: { frequency: 'weekly', interval: 1 }, 14: { frequency: 'weekly', interval: 2 }, 30: { frequency: 'monthly', interval: 1 }, 60: { frequency: 'monthly', interval: 2 }, 90: { frequency: 'quarterly', interval: 1 }, 180: { frequency: 'monthly', interval: 6 }, 365: { frequency: 'monthly', interval: 12 } })[Number(days)];
const planVersion = value => value?.toDate ? value.toDate().toISOString() : typeof value === 'string' ? value : value?.seconds !== undefined ? new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1e6).toISOString() : null;
const emptyProperty = () => ({ address: '', serviceCategory: '', exceptionId: null, confirmed: false });
const customerAddress = customer => [typeof customer?.address === 'string' ? customer.address : customer?.address?.street || customer?.address?.line1, customer?.city || customer?.address?.city, customer?.state || customer?.address?.state, customer?.zipCode || customer?.address?.zipCode].filter(Boolean).join(', ');

const ServicePlansPage = () => {
  const { company } = useAuth();
  const initialForm = useRef({ ...blank, nextServiceDate: todayIso(company?.timeZone) });
  const invalidate = useInvalidateWorkspace();
  const plansQuery = useWorkspaceQuery(['service-plans'], () => listServicePlans());
  const customersQuery = useWorkspaceQuery(['customers', 500], () => CustomerService.getCustomers(500), { intervalMs: 300000 });
  const plans = plansQuery.data?.plans || [];
  const customers = customersQuery.data?.customers || [];
  const [form, setForm] = useState(initialForm.current);
  const [serviceProperty, setServiceProperty] = useState(emptyProperty), [serviceAreaPolicy, setServiceAreaPolicy] = useState(null);
  const [addressValidation, setAddressValidation] = useState(null);
  const [schedulingError, setSchedulingError] = useState(null), [preference, setPreference] = useState(null), [preferenceSaving, setPreferenceSaving] = useState(false);
  const [pauseTarget, setPauseTarget] = useState(null), [pauseForm, setPauseForm] = useState({ mode: 'once', throughDate: '', reason: '' }), [pauseSaving, setPauseSaving] = useState(false);
  const preferenceSavingRef = useRef(false), preferenceClosingRef = useRef(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false), savingRef = useRef(false);
  const loading = plansQuery.isPending || customersQuery.isPending;
  const [range, setRange] = useState({ start: '', end: '' });
  const manage = canManage();
  const confirm = useConfirm();
  const recurrence = appointmentRecurrence({ ...frequencyRule(form.frequencyDays), monthlyMode: form.monthlyMode }, form.nextServiceDate);
  const formChanged = Object.keys(blank).some(key => key === 'frequencyDays' ? Number(form[key]) !== Number(initialForm.current[key]) : form[key] !== initialForm.current[key]) || !!serviceProperty.address.trim() || !!serviceProperty.serviceCategory || !!serviceProperty.exceptionId;
  const preferenceChanged = !!preference && (preference.memberId !== (preference.plan.preferredTechnicianId || '') || preference.fallback !== (preference.plan.assignmentFallback || 'unassigned'));
  const { confirmDiscard } = useUnsavedChanges(manage && (showForm && formChanged || preferenceChanged), { message: 'You have unsaved service plan changes. Leave without saving them?' });
  const resetForm = () => { initialForm.current = { ...blank, nextServiceDate: todayIso(company?.timeZone) }; setForm(initialForm.current); setServiceProperty(emptyProperty()); setServiceAreaPolicy(null); setAddressValidation(null); setSchedulingError(null); };
  const toggleForm = async () => {
    if (savingRef.current || (showForm && formChanged && !(await confirmDiscard()))) return;
    resetForm(); setShowForm(value => !value);
  };

  const load = () => invalidate(['service-plans', 'jobs', 'job', 'route']);
  useEffect(() => {
    if ([plansQuery.error, customersQuery.error].some(workspaceAccessError)) { setPreference(null); setShowForm(false); }
  }, [plansQuery.error, customersQuery.error]);
  useEffect(() => { setAddressValidation(null); }, [company?.id]);

  const set = (k) => (e) => { setAddressValidation(null); setSchedulingError(null); setForm((f) => ({ ...f, [k]: e.target.value })); };
  const changeProperty = value => { if (savingRef.current) return; setAddressValidation(null); setServiceProperty(value); };

  const submit = async (e) => {
    e.preventDefault();
    if (!manage || !canManage() || savingRef.current || !formChanged) return;
    if (!recurrence) return toast.error('Choose a valid recurrence and first service date.');
    if (form.nextServiceDate < todayIso(company?.timeZone)) return toast.error('Choose today or a future date for a new recurring appointment.');
    if (company?.id && !serviceAreaPolicy) return toast.error('Wait for service-area settings to load, or retry the property check.');
    if (company?.id && serviceAreaPolicy.settings?.configured && !serviceProperty.address.trim()) return toast.error('Enter the service property address explicitly before creating this plan.');
    savingRef.current = true; setSaving(true); setAddressValidation(null); setSchedulingError(null);
    try {
      const customer = customers.find((c) => c.id === form.customerId);
      const res = await createServicePlan({
        ...form,
        recurrence, estimatedDuration: Number(form.estimatedDuration), preferredTechnicianId: form.preferredTechnicianId || null,
        customerName: customer?.name || '',
        customerPhone: customer?.phone || '',
        address: serviceProperty.address.trim() || customerAddress(customer),
        ...(serviceProperty.address.trim() ? { serviceProperty: { address: serviceProperty.address.trim() }, serviceCategory: serviceProperty.serviceCategory.trim(), serviceAreaExceptionId: serviceProperty.exceptionId || null } : {}),
      });
      if (!res.success) { setAddressValidation(res.details?.addressValidation || null); if (res.details?.scheduling) setSchedulingError({ fingerprint: schedulingFingerprint({ companyId: company?.id, memberId: form.preferredTechnicianId, date: form.nextServiceDate, time: form.time, estimatedDuration: form.estimatedDuration }), result: res.details.scheduling }); return toast.error(res.error); }
      toast.success('Service plan created');
      resetForm();
      setShowForm(false);
      load();
    } catch (failure) { setAddressValidation(failure.details?.addressValidation || null); if (failure.details?.scheduling) setSchedulingError({ fingerprint: schedulingFingerprint({ companyId: company?.id, memberId: form.preferredTechnicianId, date: form.nextServiceDate, time: form.time, estimatedDuration: form.estimatedDuration }), result: failure.details.scheduling }); toast.error(failure.message || 'The service plan could not be saved. Please try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const generate = async (plan) => {
    const res = await generateNextJob(plan);
    if (!res.success) return toast.error(res.error);
    toast.success(`Job scheduled for ${plan.nextServiceDate}; next visit ${res.nextServiceDate}`);
    load();
  };

  const remove = async (plan) => {
    const ok = await confirm({ title: 'Delete service plan?', message: `The recurring plan for ${plan.customerName} will be removed. Already scheduled jobs are not affected.`, confirmText: 'Delete plan' });
    if (!ok) return;
    const res = await deleteServicePlan(plan.id);
    if (!res.success) return toast.error(res.error);
    load();
  };

  const resume = async plan => {
    const res = await resumeServicePlan(plan.id, planVersion(plan.updatedAt));
    if (!res.success) return toast.error(res.error);
    toast.success(`Service plan resumed; next visit ${res.nextServiceDate}`);
    load();
  };
  const openPause = plan => {
    setPauseTarget({ ...plan });
    setPauseForm({ mode: 'once', throughDate: plan.nextServiceDate || '', reason: '' });
  };
  const submitPause = async event => {
    event.preventDefault();
    if (!pauseTarget || pauseSaving) return;
    setPauseSaving(true);
    try {
      const result = await pauseServicePlan(pauseTarget.id, { ...pauseForm, ...(pauseForm.mode === 'through' ? { throughDate: pauseForm.throughDate } : {}) }, planVersion(pauseTarget.updatedAt));
      if (!result.success) return toast.error(result.error || 'The service plan could not be paused.');
      setPauseTarget(null);
      toast.success(pauseForm.mode === 'indefinite' ? 'Service plan paused indefinitely' : pauseForm.mode === 'once' ? `Next occurrence skipped; future visits resume ${result.nextServiceDate}` : `Recurring visits paused through ${pauseForm.throughDate}; next visit ${result.nextServiceDate}`);
      load();
    } finally { setPauseSaving(false); }
  };

  const openPreference = async plan => {
    if (!manage || savingRef.current || preferenceSavingRef.current) return;
    if (showForm && formChanged && !(await confirmDiscard())) return;
    resetForm(); setShowForm(false);
    setPreference({ plan: { ...plan }, memberId: plan.preferredTechnicianId || '', fallback: plan.assignmentFallback || 'unassigned', version: planVersion(plan.updatedAt), error: '', schedulingError: null });
  };
  const closePreference = useCallback(async () => {
    if (preferenceSavingRef.current || preferenceClosingRef.current) return;
    preferenceClosingRef.current = true;
    try { if (preferenceChanged && !(await confirmDiscard())) return; setPreference(null); }
    finally { preferenceClosingRef.current = false; }
  }, [preferenceChanged, confirmDiscard]);
  useEffect(() => {
    if (!preference) return;
    const keydown = event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); closePreference(); } };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [preference, closePreference]);
  const preferenceSlot = preference ? { companyId: company?.id, memberId: preference.memberId, date: preference.plan.nextServiceDate, time: preference.plan.time || '09:00', estimatedDuration: preference.plan.estimatedDuration ?? preference.plan.duration ?? 1, servicePlanId: preference.plan.id } : null;
  const savePreference = async event => {
    event.preventDefault();
    if (!manage || !canManage() || !preference || !preferenceChanged || preferenceSavingRef.current) return;
    preferenceSavingRef.current = true; setPreferenceSaving(true);
    try {
      const result = await updateServicePlan(preference.plan.id, { preferredTechnicianId: preference.memberId || null, assignmentFallback: preference.fallback }, preference.version);
      if (!result.success) {
        setPreference(previous => previous ? { ...previous, error: result.error || 'The technician preference could not be saved.', schedulingError: result.details?.scheduling ? { fingerprint: schedulingFingerprint(preferenceSlot), result: result.details.scheduling } : null } : previous);
        return toast.error(result.error || 'The technician preference could not be saved.');
      }
      setPreference(null); toast.success('Technician preference saved'); load();
    } catch (error) {
      setPreference(previous => previous ? { ...previous, error: error.message || 'The technician preference could not be saved. Please try again.' } : previous);
      toast.error(error.message || 'The technician preference could not be saved.');
    } finally { preferenceSavingRef.current = false; setPreferenceSaving(false); }
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

  const due = (p) => p.active && p.nextServiceDate <= todayIso(company?.timeZone);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service Plans</h1>
          <p className="text-sm text-gray-500">Calendar plans generate upcoming visits automatically. You can also schedule the next visit here.</p>
        </div>
        {manage && <button disabled={saving} onClick={toggleForm} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">{showForm ? 'Cancel' : 'New plan'}</button>}
      </div>
      {(plansQuery.error || customersQuery.error) && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{(plansQuery.error || customersQuery.error).message} <button className="underline" onClick={() => { plansQuery.refetch(); customersQuery.refetch(); }}>Retry service plan refresh</button></p>}

      {showForm && (
        <form onSubmit={submit} className="bg-white border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <fieldset disabled={saving} className="contents">
          <label className="text-sm text-gray-700 sm:col-span-2">Customer *
            <SelectControl required aria-label="Service plan customer" className={input} value={form.customerId} onChange={event => { setAddressValidation(null); setForm(previous => ({ ...previous, customerId: event.target.value })); setServiceProperty(previous => ({ ...previous, address: '', exceptionId: null, confirmed: false })); }}>
              <option value="">Select…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectControl>
          </label>
          <label className="text-sm text-gray-700">Service<input className={input} value={form.serviceType} onChange={set('serviceType')} /></label>
          <label className="text-sm text-gray-700">Frequency
            <SelectControl aria-label="Service plan frequency" className={input} value={form.frequencyDays} onChange={set('frequencyDays')}>{FREQUENCIES.map((f) => <option key={f.days} value={f.days}>{f.label}</option>)}</SelectControl>
          </label>
          <label className="text-sm text-gray-700">First service date<input required type="date" min={todayIso(company?.timeZone)} className={input} value={form.nextServiceDate} onChange={set('nextServiceDate')} /></label>
          <TimeSelect label="Time" className={input} value={form.time} disabled={saving} onChange={time => { setSchedulingError(null); setForm(previous => ({ ...previous, time })); }} />
          {Number(form.frequencyDays) > 14 && <label className="text-sm text-gray-700">Repeat by<SelectControl aria-label="Service plan monthly pattern" className={input} value={form.monthlyMode} onChange={set('monthlyMode')}><option value="dayOfMonth">Same day of the month</option><option value="weekday">Same weekday of the month</option></SelectControl></label>}
          {recurrence && <p role="status" className="sm:col-span-2 text-sm text-gray-600">{describeAppointmentRecurrence(recurrence)}. The first service date sets the recurring pattern.</p>}
          <label className="text-sm text-gray-700">Duration (hours)<input aria-label="Service plan duration" type="number" min="0.25" max="24" step="0.25" className={input} value={form.estimatedDuration} onChange={set('estimatedDuration')} /></label>
          <label className="text-sm text-gray-700">Price per visit ($)<input type="number" min="0" step="0.01" className={input} value={form.price} onChange={set('price')} /></label>
          <label className="text-sm text-gray-700">Notes<input className={input} value={form.notes} onChange={set('notes')} /></label>
          <div className="sm:col-span-2"><TechnicianAvailability companyId={company?.id} memberId={form.preferredTechnicianId} date={form.nextServiceDate} time={form.time} estimatedDuration={form.estimatedDuration} disabled={saving} allowedWeekdays={recurrence?.frequency === 'weekly' ? [recurrence.weekday] : undefined} isAlternativeAllowed={slot => isDateOnAppointmentRecurrence(recurrence, slot.date)} schedulingError={schedulingError} onMemberChange={memberId => { setSchedulingError(null); setForm(previous => ({ ...previous, preferredTechnicianId: memberId })); }} onSelectAlternative={slot => { setSchedulingError(null); setForm(previous => ({ ...previous, nextServiceDate: slot.date, time: slot.time })); }} /></div>
          <label className="text-sm text-gray-700 sm:col-span-2">When the preferred technician is unavailable<SelectControl aria-label="Service plan technician fallback" className={input} value={form.assignmentFallback} onChange={set('assignmentFallback')}><option value="unassigned">Leave unassigned for dispatcher review</option><option value="auto">Automatically assign another available technician</option></SelectControl><span className="mt-1 block text-xs text-gray-500">The same technician is preferred for each visit. Replacements are automatic only when you choose that option.</span></label>
          {company?.id ? <div className="sm:col-span-2"><ServicePropertyEligibility companyId={company.id} serviceCategories={company.serviceCategories || []} value={serviceProperty} validation={addressValidation} onChange={changeProperty} onPolicyLoaded={setServiceAreaPolicy} purpose="scheduling" disabled={saving} billingAddress={customerAddress(customers.find(customer => customer.id === form.customerId))} /></div> : <div className="sm:col-span-2 space-y-3"><label className="text-sm text-gray-700">Service property address<input aria-label="Service property address" className={input} value={serviceProperty.address} maxLength={278} onChange={event => changeProperty({ ...serviceProperty, address: event.target.value, exceptionId: null, confirmed: false })} /></label><AddressValidationNotice validation={addressValidation} disabled={saving} onAccept={address => changeProperty({ ...serviceProperty, address, exceptionId: null, confirmed: false })} /></div>}
          <div className="sm:col-span-2 flex justify-end"><button disabled={!formChanged || !form.customerId || !form.serviceType.trim() || !!company?.id && !serviceAreaPolicy} className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">{saving ? 'Saving…' : 'Create plan'}</button></div>
          </fieldset>
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
                  <td className="px-4 py-3">{p.serviceType}{(p.assignmentNeedsAttention || p.preferredTechnicianNeedsReview) && <p role="status" className="mt-1 max-w-xs text-xs text-amber-800">{p.preferredTechnicianReview || p.assignmentReview || 'Technician assignment needs review.'}</p>}</td>
                  <td className="px-4 py-3">{p.recurrence?.version === 1 ? describeAppointmentRecurrence(p.recurrence) : `Every ${p.frequencyDays} days (fixed interval)`}</td>
                  <td className="px-4 py-3">{p.nextServiceDate}{due(p) && <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">Due</span>}</td>
                  <td className="px-4 py-3 text-right">${Number(p.price || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                    {manage && p.active && <button className="text-primary-600 hover:underline" onClick={() => generate(p)}>Schedule visit</button>}
                    {manage && (p.active ? <button className="text-gray-600 hover:underline" onClick={() => openPause(p)}>Pause</button> : <button className="text-primary-700 hover:underline" onClick={() => resume(p)}>Resume</button>)}
                    {manage && <button className="text-primary-700 hover:underline" onClick={() => openPreference(p)}>Technician preference</button>}
                    {manage && <button className="text-red-600 hover:underline" onClick={() => remove(p)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {pauseTarget && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/50 p-4 sm:py-12"><form role="dialog" aria-modal="true" aria-label="Pause recurring service" onSubmit={submitPause} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Pause recurring service</h2><p className="text-sm text-gray-600">{pauseTarget.customerName} · {pauseTarget.serviceType}</p></div><button type="button" disabled={pauseSaving} onClick={() => setPauseTarget(null)} className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100">Close</button></div>
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Pausing preserves the service plan and its history. It affects future occurrences that have not yet been created. Any appointment already shown in Jobs remains individually manageable.</p>
        <label className="block text-sm font-medium text-gray-700">Pause option<SelectControl aria-label="Recurring pause option" disabled={pauseSaving} className={input} value={pauseForm.mode} onChange={event => setPauseForm(previous => ({ ...previous, mode: event.target.value }))}><option value="once">Skip the next occurrence only</option><option value="through">Pause through a date</option><option value="indefinite">Pause indefinitely</option></SelectControl></label>
        {pauseForm.mode === 'through' && <label className="block text-sm font-medium text-gray-700">Pause through<input aria-label="Pause through date" required type="date" min={pauseTarget.nextServiceDate} className={input} disabled={pauseSaving} value={pauseForm.throughDate} onChange={event => setPauseForm(previous => ({ ...previous, throughDate: event.target.value }))} /></label>}
        <label className="block text-sm font-medium text-gray-700">Reason (optional)<textarea aria-label="Recurring pause reason" maxLength={500} rows={3} className={input} disabled={pauseSaving} value={pauseForm.reason} onChange={event => setPauseForm(previous => ({ ...previous, reason: event.target.value }))} placeholder="Vacation, seasonal hold, customer request…" /></label>
        <div className="flex justify-end gap-3"><button type="button" disabled={pauseSaving} onClick={() => setPauseTarget(null)} className="rounded border px-4 py-2">Keep active</button><button type="submit" disabled={pauseSaving || pauseForm.mode === 'through' && !pauseForm.throughDate} className="rounded bg-primary-700 px-4 py-2 font-medium text-white disabled:opacity-50">{pauseSaving ? 'Saving pause…' : 'Save pause'}</button></div>
      </form></div>}

      {preference && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/50 p-4 sm:py-12"><form role="dialog" aria-modal="true" aria-label="Technician preference" tabIndex={-1} onSubmit={savePreference} onKeyDown={event => { if (event.key !== 'Tab') return; const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(node => node.offsetParent !== null); if (!controls.length) { event.preventDefault(); return; } if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); } else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); } }} className="w-full max-w-xl space-y-4 rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Technician preference</h2><button type="button" aria-label="Close technician preference" autoFocus disabled={preferenceSaving} onClick={closePreference} className="rounded px-2 py-1 text-gray-600 hover:bg-gray-100">Close</button></div>
        <p className="text-sm text-gray-600">{preference.plan.customerName} · {preference.plan.serviceType}. This preference applies to future generated visits. Already assigned visits are managed from dispatch. If a technician leaves, the saved replacement policy applies to their upcoming scheduled work.</p>
        <TechnicianAvailability {...preferenceSlot} memberName={preference.plan.preferredTechnicianName || ''} disabled={preferenceSaving} schedulingError={preference.schedulingError} onMemberChange={memberId => setPreference(previous => ({ ...previous, memberId, error: '', schedulingError: null }))} />
        <label className="block text-sm text-gray-700">When the preferred technician is unavailable<SelectControl aria-label="Technician preference fallback" className={input} disabled={preferenceSaving} value={preference.fallback} onChange={event => setPreference(previous => ({ ...previous, fallback: event.target.value, error: '', schedulingError: null }))}><option value="unassigned">Leave unassigned for dispatcher review</option><option value="auto">Automatically assign another available technician</option></SelectControl></label>
        {preference.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{preference.error}</p>}
        <div className="flex justify-end gap-3"><button type="button" disabled={preferenceSaving} onClick={closePreference} className="rounded border px-4 py-2">Cancel</button><button type="submit" disabled={!preferenceChanged || preferenceSaving} className="rounded bg-primary-700 px-4 py-2 font-medium text-white disabled:opacity-50">{preferenceSaving ? 'Saving preference…' : 'Save technician preference'}</button></div>
      </form></div>}

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

export default function ServicePlansWorkspace() {
  const { company, currentUser } = useAuth();
  return <ServicePlansPage key={`${currentUser?.uid || ''}:${company?.id || ''}`} />;
}
