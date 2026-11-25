import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import SelectControl from './SelectControl';
import AddressValidationNotice from './AddressValidationNotice';
import ServicePropertyEligibility from './ServicePropertyEligibility';
import OperationalAlerts from './OperationalAlerts';
import NoteVisibilityBadge from './NoteVisibilityBadge';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspaceQuery, useInvalidateWorkspace } from '../hooks/useWorkspaceQuery';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { manageInquiry } from '../services/inquiryService';

const empty = () => ({ label: 'home', address: '', unit: '', accessInstructions: '', isPrimary: false, serviceCategory: '', exceptionId: null });
const labels = { home: 'Home', rental: 'Rental', office: 'Office', other: 'Other' };
const field = 'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-primary-500';

export default function ServicePropertyDirectory({ customerId, value = '', onSelect, disabled = false, locked = false, allowEditing = true }) {
  const { company } = useAuth();
  const query = useWorkspaceQuery(['customer-properties', customerId || null], () => manageInquiry('properties', { customerId }), { enabled: !!customerId });
  const rows = query.data?.properties || [], invalidate = useInvalidateWorkspace();
  const [editor, setEditor] = useState(null), [draft, setDraft] = useState(empty), [error, setError] = useState(''), [validation, setValidation] = useState(null), [busy, setBusy] = useState(false), [addressEditing, setAddressEditing] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const saving = useRef(false), operation = useRef(null), live = useRef(false), scope = useRef(query.scopeId), identity = useRef(''); scope.current = query.scopeId; identity.current = `${query.scopeId}:${customerId}`;
  const { confirmDiscard } = useUnsavedChanges(!!editor && JSON.stringify(draft) !== editor.baseline, { scope: `customer:${customerId}`, message: 'Your service-property changes have not been saved. Leave without saving them?' });
  useEffect(() => { live.current = true; saving.current = false; setBusy(false); setEditor(null); setError(''); setValidation(null); return () => { live.current = false; }; }, [customerId, query.scopeId]);
  const selected = rows.find(row => row.id === value);
  const start = row => { if (disabled || locked || saving.current) return; const values = row ? { label: row.label || 'other', address: row.address || '', unit: row.unit || '', accessInstructions: row.accessInstructions || '', isPrimary: row.isPrimary === true, serviceCategory: '', exceptionId: null } : empty(); setDraft(values); setEditor({ id: row?.id || null, baseline: JSON.stringify(values), expectedVersion: query.data.customerVersion }); setAddressEditing(!row); setCoverageOpen(false); operation.current = crypto.randomUUID(); setError(''); setValidation(null); };
  const cancel = async () => { if (!saving.current && await confirmDiscard()) { setEditor(null); setError(''); setValidation(null); } };
  const change = (key, next) => { if (saving.current || key === 'address' && !addressEditing) return; setDraft(previous => ({ ...previous, [key]: next, ...(key === 'address' && next !== previous.address ? { exceptionId: null } : {}) })); setValidation(null); };
  const save = async () => {
    if (saving.current || !editor || !draft.address.trim()) return;
    const submittedScope = query.scopeId, submittedIdentity = identity.current; saving.current = true; setBusy(true); setError('');
    try {
      const { serviceCategory, exceptionId, ...propertyDraft } = draft;
      const result = await manageInquiry('saveProperty', { customerId, operationId: operation.current, expectedVersion: editor.expectedVersion ?? null, ...(editor.id ? { propertyId: editor.id } : {}), property: propertyDraft, serviceCategory, serviceAreaExceptionId: exceptionId || null });
      if (!live.current || scope.current !== submittedScope || identity.current !== submittedIdentity) return;
      query.setData({ properties: result.properties || [], customerVersion: result.customerVersion, customerLifecycle: query.data?.customerLifecycle });
      setEditor(null); setValidation(null); onSelect?.(result.property); toast.success('Service property saved.');
      void invalidate(['customers', 'customer', 'customer-properties', 'inquiries']);
      const warning = result.property?.validationWarning || result.addressWarning;
      if (warning) toast(warning, { icon: '⚠️' });
    } catch (failure) { if (live.current && scope.current === submittedScope && identity.current === submittedIdentity) { setError(failure.message || 'The property was not saved. Your changes are retained.'); setValidation(failure.details?.addressValidation || null); toast.error(failure.message || 'Service property could not be saved.'); } }
    finally { if (live.current && scope.current === submittedScope && identity.current === submittedIdentity) { saving.current = false; setBusy(false); } }
  };
  if (!customerId) return <p className="text-sm text-gray-600">Select or save a customer to choose their service property.</p>;
  return <section aria-label="Customer service properties" className="space-y-3 rounded-lg border p-4">
    <label className="block text-sm font-medium">Saved service property<SelectControl aria-label="Saved service property" className={field} value={value} disabled={disabled || locked || busy} onChange={event => onSelect?.(rows.find(row => row.id === event.target.value) || null)}><option value="">Choose a service property</option>{value && !selected && <option value={value} disabled>Recorded property (refresh to view)</option>}{rows.map(row => <option key={row.id} value={row.id}>{labels[row.label] || 'Property'}{row.isPrimary ? ' · Primary' : ''} — {row.address}{row.unit ? ` · ${row.unit}` : ''}</option>)}</SelectControl></label>
    {(query.isPending || query.isLoading) && <p role="status" className="text-sm">Loading service properties…</p>}
    {query.error && <p role="alert" className="text-sm text-red-800">{query.error.message} <button type="button" className="underline" onClick={() => query.refetch()}>Retry properties</button></p>}
    {selected?.accessInstructions && <p className="whitespace-pre-wrap text-sm text-gray-700"><strong>Property access:</strong> {selected.accessInstructions}</p>}
    {selected?.validationWarning && <p role="status" className="rounded bg-amber-50 p-3 text-sm text-amber-900">{selected.validationWarning}</p>}
    {selected && <OperationalAlerts key={`${customerId}:${selected.id}`} target="property" customerId={customerId} propertyId={selected.id} initialAlerts={selected.alerts || []} canManage={allowEditing && !locked && !disabled} />}
    {query.data && !rows.length && <p className="text-sm text-gray-600">No service property is saved yet. Add the location where work will take place.</p>}
    {locked && <p className="text-xs text-gray-600">This appointment uses the inquiry’s saved customer and property. Update the inquiry first to choose a different property.</p>}
    {allowEditing && !locked && query.data && !editor && <div className="flex flex-wrap gap-3"><button type="button" disabled={disabled} className="text-sm text-primary-700 underline" onClick={() => start(null)}>Add service property</button>{selected && <button type="button" disabled={disabled} className="text-sm text-primary-700 underline" onClick={() => start(selected)}>Edit selected property</button>}</div>}
    {editor && <div className="space-y-3 rounded-lg bg-gray-50 p-3" aria-label="Service property editor">
      <label className="block text-sm font-medium">Property label<SelectControl aria-label="Property label" className={field} value={draft.label} disabled={busy} onChange={event => change('label', event.target.value)}>{Object.entries(labels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</SelectControl></label>
      {!addressEditing && <button type="button" disabled={busy} className="text-sm text-primary-700 underline" onClick={() => setAddressEditing(true)}>Enable Editing</button>}
      <label className="block text-sm font-medium">Property address<input aria-label="Property address" className={field} value={draft.address} disabled={busy || !addressEditing} maxLength={278} onChange={event => change('address', event.target.value)} /></label>
      <label className="block text-sm font-medium">Unit / suite<input aria-label="Property unit" className={field} value={draft.unit} disabled={busy} maxLength={100} onChange={event => change('unit', event.target.value)} /></label>
      <label className="block text-sm font-medium">Access instructions <NoteVisibilityBadge audience="internal" /><textarea aria-label="Property access instructions" className={field} value={draft.accessInstructions} disabled={busy} maxLength={2000} rows={2} onChange={event => change('accessInstructions', event.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isPrimary} disabled={busy} onChange={event => change('isPrimary', event.target.checked)} />Primary service property</label>
      <p className="text-xs text-gray-600">Google checks new or changed addresses when saving. Existing appointments retain their recorded property.</p>
      {company?.id && <div className="space-y-3"><button type="button" className="text-sm text-primary-700 underline" disabled={busy} aria-expanded={coverageOpen} onClick={() => setCoverageOpen(value => !value)}>Check coverage / owner exception</button>{coverageOpen && <ServicePropertyEligibility companyId={company.id} serviceCategories={company.serviceCategories || []} fixedProperty purpose="scheduling" disabled={busy} value={{ address: draft.address, serviceCategory: draft.serviceCategory, exceptionId: draft.exceptionId }} onChange={next => { if (!saving.current) setDraft(previous => ({ ...previous, serviceCategory: next.serviceCategory, exceptionId: next.exceptionId || null })); }} />}</div>}
      <AddressValidationNotice validation={validation} disabled={busy} onAccept={addressEditing ? address => change('address', address) : undefined} />
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex justify-end gap-3"><button type="button" disabled={busy} className="btn-secondary" onClick={cancel}>Cancel property changes</button><button type="button" className="btn-primary" disabled={busy || !draft.address.trim() || JSON.stringify(draft) === editor.baseline} onClick={save}>{busy ? 'Saving property…' : 'Save service property'}</button></div>
    </div>}
  </section>;
}
