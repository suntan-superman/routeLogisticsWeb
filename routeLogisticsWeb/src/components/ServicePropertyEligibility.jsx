import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { callWorkspace } from '../services/workspaceApi';
import AddressValidationNotice from './AddressValidationNotice';

const fieldClass = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500';
const actionClass = 'rounded-lg bg-primary-700 px-4 py-2 font-medium text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50';

export default function ServicePropertyEligibility(props) {
  const { currentUser, role } = useAuth();
  return <ServicePropertyForm key={`${currentUser?.uid || ''}:${props.companyId || ''}:${role || ''}`} {...props} />;
}

function ServicePropertyForm({ companyId, serviceCategories = [], value = {}, onChange, onPolicyLoaded, onEnableAddressEditing, purpose = 'scheduling', billingAddress = '', existing = false, disabled = false, addressReadOnly = false, fixedProperty = false, fixedCategory = false, validation: externalValidation = null, policy: suppliedPolicy }) {
  const [policy, setPolicy] = useState(suppliedPolicy || null), [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [policyAttempt, setPolicyAttempt] = useState(0), [loadingPolicy, setLoadingPolicy] = useState(!suppliedPolicy);
  const [checked, setChecked] = useState(null), [reason, setReason] = useState('');
  const [addressValidation, setAddressValidation] = useState(null);
  const runtime = useRef({ mounted: false, sequence: 0, busy: false, fingerprint: '' });
  const address = value.address || '', serviceCategory = value.serviceCategory || '';
  const settings = (suppliedPolicy || policy)?.settings;
  const fingerprint = JSON.stringify([companyId, address, serviceCategory, purpose, settings?.revision || 0]);
  runtime.current.fingerprint = fingerprint;
  const result = checked?.fingerprint === fingerprint ? checked.result : null;
  const validation = externalValidation || addressValidation;
  const addressLocked = fixedProperty || addressReadOnly;
  const canUnlock = addressReadOnly && !fixedProperty && typeof onEnableAddressEditing === 'function';
  const canApprove = (suppliedPolicy || policy)?.canApproveExceptions === true;
  const categories = [...new Map([...serviceCategories, ...((suppliedPolicy || policy)?.availableCategories || []), ...(settings?.categoryOverrides || []).map(row => row.serviceCategory)].filter(value => typeof value === 'string' && value.trim()).map(value => [value.trim().toLowerCase(), value.trim()])).values()];
  useEffect(() => {
    const state = runtime.current;
    state.mounted = true; state.busy = false; setBusy('');
    if (!companyId || suppliedPolicy) { setLoadingPolicy(false); return () => { state.mounted = false; state.sequence++; state.busy = false; }; }
    setLoadingPolicy(true); setError('');
    const sequence = ++state.sequence;
    callWorkspace('rlServiceAreas', { action: 'status', companyId }).then(data => {
      if (state.mounted && sequence === state.sequence) { setPolicy(data); onPolicyLoaded?.(data); }
    }).catch(failure => { if (state.mounted && sequence === state.sequence) setError(failure.message || 'Service-area settings could not be loaded.'); })
      .finally(() => { if (state.mounted && sequence === state.sequence) setLoadingPolicy(false); });
    return () => { state.mounted = false; state.sequence++; state.busy = false; };
  }, [companyId, suppliedPolicy, policyAttempt, onPolicyLoaded]);
  const patch = changes => {
    if (disabled || (fixedProperty || addressReadOnly) && Object.hasOwn(changes, 'address') || fixedCategory && Object.hasOwn(changes, 'serviceCategory')) return;
    setChecked(null); setError(''); setReason(''); setAddressValidation(null);
    onChange?.({ ...value, ...changes, exceptionId: null, confirmed: false });
  };
  const invoke = async approve => {
    const state = runtime.current;
    if (state.busy || !state.mounted || disabled || !companyId || !address.trim()) return;
    if (approve && (!result || result.status !== 'outside' || !canApprove || !reason.trim())) return;
    state.busy = true; const sequence = ++state.sequence, requested = fingerprint;
    setBusy(approve ? 'approve' : 'check'); setError(''); setAddressValidation(null);
    try {
      const data = await callWorkspace('rlServiceAreas', { action: approve ? 'approveException' : 'check', companyId, propertyAddress: address, serviceCategory, purpose, ...(approve ? { reason: reason.trim() } : {}), ...(!approve && value.exceptionId ? { exceptionId: value.exceptionId } : {}) });
      if (!state.mounted || sequence !== state.sequence || requested !== state.fingerprint) return;
      const outcome = data.result || data;
      setAddressValidation(outcome.addressValidation || null);
      setChecked({ fingerprint: requested, result: outcome });
      onChange?.({ ...value, confirmed: outcome.eligible === true, ...(approve ? { exceptionId: data.exceptionId } : {}) });
      if (approve) { setReason(''); toast.success('The owner-approved property exception was recorded.'); }
    } catch (failure) {
      if (state.mounted && sequence === state.sequence && requested === state.fingerprint) {
        setChecked(null); setError(failure.message || 'The service property could not be checked. Review the address and try again.'); setAddressValidation(failure.details?.addressValidation || null);
      }
    } finally { state.busy = false; if (state.mounted && sequence === state.sequence) setBusy(''); }
  };
  return <section aria-label="Service property eligibility" className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
    <div><h3 className="text-lg font-semibold">Service property</h3><p className="mt-1 text-sm text-gray-600">Review where the service will take place. Use a saved address or enter a different property. Coverage is checked against the provider’s saved service areas.</p></div>
    {existing && <p className="text-sm text-gray-600">Existing appointments stay valid when coverage changes. A changed service property will need a new eligibility check.</p>}
    {fixedProperty && <p className="text-sm text-gray-600">This workflow uses the recorded service property. You can check coverage or obtain an owner exception without changing its address.</p>}
    {settings && settings.configured === false && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Service areas have not been configured. Google still verifies new or changed addresses. Public requests remain unavailable until coverage is configured.</p>}
    <fieldset disabled={!!busy || disabled} className="space-y-4">
      <label className="block text-sm font-medium">Service property address<input aria-label="Service property address" disabled={fixedProperty || addressReadOnly} autoComplete="off" className={`${fieldClass} disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-600`} value={address} maxLength={278} onChange={event => patch({ address: event.target.value })} placeholder="Street, city, state and ZIP code" /></label>
      {billingAddress && billingAddress.trim() !== address.trim() && <div><p className="text-sm text-gray-600">Customer address: {billingAddress}</p><button type="button" disabled={fixedProperty || addressReadOnly} className="text-sm font-medium text-primary-700 underline" onClick={() => patch({ address: billingAddress })}>Use this as the service property</button></div>}
      {!!categories.length && <label className="block text-sm font-medium">Service category<select aria-label="Service property category" disabled={fixedCategory} className={fieldClass} value={serviceCategory} onChange={event => patch({ serviceCategory: event.target.value })}><option value="">Choose a service category</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>}
      <button type="button" className={actionClass} disabled={disabled || !companyId || !address.trim() || !!busy || loadingPolicy || !settings} onClick={() => invoke(false)}>{busy === 'check' ? 'Checking property…' : loadingPolicy ? 'Loading service-area policy…' : 'Check service property'}</button>
    </fieldset>
    {error && !addressValidation && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <AddressValidationNotice validation={validation} onAccept={addressLocked ? undefined : suggestedAddress => patch({ address: suggestedAddress })} disabled={disabled || !!busy}>
      {addressLocked && <div className="space-y-2">
        <p>{canUnlock ? 'The saved address is locked. Enable Editing, then use the suggested address.' : fixedProperty ? 'This recorded address cannot be changed in this workflow. Revise the source record before applying a corrected address. Approved estimates need a revised version and approval before scheduling.' : 'Address editing is locked in this workflow. Open the editable record to apply this correction.'}</p>
        {canUnlock && <button type="button" aria-label="Enable Editing for suggested address" className={actionClass} disabled={disabled || !!busy} onClick={() => { if (!disabled && !busy) onEnableAddressEditing(); }}>Enable Editing</button>}
      </div>}
    </AddressValidationNotice>
    {error && !settings && <button type="button" disabled={disabled} className="text-sm text-primary-700 underline" onClick={() => setPolicyAttempt(value => value + 1)}>Retry service-area settings</button>}
    {result && !validation && <div role={result.eligible ? 'status' : 'alert'} className={`rounded-lg p-3 text-sm ${result.eligible ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
      <p className="font-semibold">{result.status === 'unconfigured' ? 'Service areas are not configured' : result.eligible ? result.status === 'exception-approved' ? 'Approved property exception' : 'Property is inside coverage' : result.status === 'outside' ? 'Property is outside coverage' : 'Property is not eligible yet'}</p>
      <p>{result.message || result.reason || 'Review this property before continuing.'}</p>
      {result.property?.formattedAddress && <p className="mt-2">Validated property: {result.property.formattedAddress}</p>}
      {Number.isFinite(result.distanceMiles) && <p>Distance from operating location: {result.distanceMiles.toFixed(1)} miles.</p>}
      {result.status === 'outside' && !canApprove && <p className="mt-2 font-medium">A company owner must approve an explicit out-of-area exception.</p>}
    </div>}
    {result?.status === 'outside' && canApprove && settings?.allowOutOfAreaRequests === true && <fieldset disabled={!!busy || disabled} className="space-y-3 rounded-lg border border-amber-200 p-4">
      <legend className="px-1 text-sm font-semibold">Owner approval for this property</legend>
      <p className="text-sm text-gray-600">This approval applies to the validated property, service category and workflow only. It expires after 24 hours and does not expand the service territory.</p>
      <label className="block text-sm font-medium">Approval reason<textarea aria-label="Out-of-area approval reason" className={fieldClass} value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></label>
      <button type="button" className={actionClass} disabled={disabled || !reason.trim() || !!busy} onClick={() => invoke(true)}>{busy === 'approve' ? 'Recording approval…' : 'Approve this out-of-area property'}</button>
    </fieldset>}
  </section>;
}
