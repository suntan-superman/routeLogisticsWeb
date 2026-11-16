import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import SelectControl from './SelectControl';
import ServicePropertyDirectory from './ServicePropertyDirectory';
import { useWorkspaceQuery, useInvalidateWorkspace } from '../hooks/useWorkspaceQuery';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { manageInquiry, customerLifecycle } from '../services/inquiryService';

export default function CustomerLifecycleControl({ customer, onSaved }) {
  const query = useWorkspaceQuery(['customer-properties', customer.id], () => manageInquiry('properties', { customerId: customer.id }));
  const invalidate = useInvalidateWorkspace(), [editor, setEditor] = useState(null), [lifecycle, setLifecycle] = useState(customerLifecycle(customer)), [reason, setReason] = useState(''), [propertyId, setPropertyId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), live = useRef(false), identity = useRef(''); identity.current = `${query.scopeId}:${customer.id}`;
  const dirty = !!editor && (lifecycle !== editor.lifecycle || !!reason.trim());
  const { confirmDiscard } = useUnsavedChanges(dirty, { scope: `customer:${customer.id}`, message: 'Your customer-lifecycle changes have not been saved.' });
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const current = query.data?.customerLifecycle || customerLifecycle(customer);
  const start = () => { if (!query.data || lock.current) return; setLifecycle(current); setReason(''); setError(''); setEditor({ lifecycle: current, expectedVersion: query.data.customerVersion, operationId: crypto.randomUUID() }); };
  const save = async () => {
    if (lock.current || !dirty) return; const requested = identity.current; lock.current = true; setBusy(true); setError('');
    try {
      const result = await manageInquiry('lifecycle', { customerId: customer.id, operationId: editor.operationId, expectedVersion: editor.expectedVersion ?? null, lifecycle, reason: reason.trim() });
      if (!live.current || identity.current !== requested) return;
      setEditor(null); query.setData(previous => ({ ...previous, customerLifecycle: result.customer.lifecycle, customerVersion: result.customerVersion })); onSaved?.(result.customer); toast.success('Customer lifecycle saved.'); void invalidate(['customers', 'customer', 'customer-stats', 'customer-properties']);
    } catch (failure) { if (live.current && identity.current === requested) { setError(failure.message || 'The lifecycle was not saved. Refresh and retry.'); toast.error(failure.message || 'Customer lifecycle could not be saved.'); } }
    finally { if (live.current && identity.current === requested) { lock.current = false; setBusy(false); } }
  };
  return <section aria-label="Customer lifecycle and properties" className="mt-4 space-y-4 border-t pt-4">
    <div className="space-y-2"><p className="font-semibold">Customer lifecycle: <span className="capitalize">{current}</span></p><p className="text-xs text-gray-600">Lifecycle is separate from archiving. Existing appointments and customer identity remain unchanged.</p>{!editor && <button type="button" disabled={!query.data || busy} className="text-sm text-primary-700 underline disabled:opacity-50" onClick={start}>Change lifecycle</button>}
      {editor && <div className="space-y-3 rounded border p-3"><label className="block text-sm font-medium">Customer lifecycle<SelectControl aria-label="Customer lifecycle" className="input-field mt-1 w-full" value={lifecycle} disabled={busy} onChange={event => setLifecycle(event.target.value)}><option value="prospect">Prospect</option><option value="active">Active customer</option><option value="inactive">Inactive customer</option></SelectControl></label><label className="block text-sm">Reason (optional)<input aria-label="Lifecycle change reason" className="input-field mt-1 w-full" value={reason} disabled={busy} maxLength={500} onChange={event => setReason(event.target.value)} /></label><div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} className="btn-secondary" onClick={async () => { if (await confirmDiscard()) setEditor(null); }}>Cancel lifecycle changes</button><button type="button" disabled={busy || !dirty} className="btn-primary" onClick={save}>{busy ? 'Saving lifecycle…' : 'Save lifecycle'}</button></div></div>}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
    <ServicePropertyDirectory customerId={customer.id} value={propertyId} onSelect={property => setPropertyId(property?.id || '')} disabled={busy} />
  </section>;
}
