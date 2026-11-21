import { useEffect, useState } from 'react';
import { createManualInvoice, updateInvoice } from '../services/invoiceService';
import CustomerService from '../services/customerService';
import { listJobPhotos } from '../services/photoService';

const blankLine = () => ({ description: '', quantity: 1, unitPrice: 0, discount: 0, kind: 'service' });
export default function InvoiceEditorDialog({ invoice, onClose, onSaved }) {
  const editing = !!invoice, lockedPricing = invoice?.billingSource?.kind === 'approved-estimate';
  const [search, setSearch] = useState(''), [matches, setMatches] = useState([]), [customer, setCustomer] = useState(null);
  const [lines, setLines] = useState(invoice?.lineItems?.map(row => ({ description: row.description, quantity: row.quantity, unitPrice: row.unitPrice, discount: row.discount || 0, kind: row.kind })) || [blankLine()]);
  const [taxRate, setTaxRate] = useState(invoice?.taxRate || 0), [reason, setReason] = useState(''), [summary, setSummary] = useState(invoice?.customerFacingSummary || ''), [terms, setTerms] = useState(invoice?.paymentTerms || '');
  const [property, setProperty] = useState(''), [days, setDays] = useState(14), [photos, setPhotos] = useState([]), [photoIds, setPhotoIds] = useState(invoice?.approvedPhotos?.map(row => row.photoId) || []);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { if (!invoice?.jobId) return; let active = true; listJobPhotos(invoice.jobId).then(rows => { if (active) setPhotos(rows); }).catch(() => { if (active) setPhotos([]); }); return () => { active = false; }; }, [invoice?.jobId]);
  const searchCustomers = async () => { const result = await CustomerService.searchCustomers(search); setMatches(result.success ? result.customers : []); if (!result.success) setError(result.error); };
  const setLine = (index, key, value) => setLines(previous => previous.map((row, i) => i === index ? { ...row, [key]: value } : row));
  const pricingChanged = editing && JSON.stringify(lines) !== JSON.stringify(invoice.lineItems.map(row => ({ description: row.description, quantity: row.quantity, unitPrice: row.unitPrice, discount: row.discount || 0, kind: row.kind }))) || editing && Number(taxRate) !== invoice.taxRate;
  const save = async () => {
    if (busy) return; setBusy(true); setError('');
    try {
      const result = editing
        ? await updateInvoice(invoice.id, { customerFacingSummary: summary, paymentTerms: terms, approvedPhotoIds: photoIds,
          ...(pricingChanged ? { lineItems: lines.map(row => ({ ...row, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), discount: Number(row.discount) })), taxRate: Number(taxRate), pricingOverrideReason: reason } : {}) }, { expectedRevision: invoice.revision ?? 0 })
        : await createManualInvoice({ customerId: customer?.id, lineItems: lines.map(row => ({ ...row, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), discount: Number(row.discount) })), taxRate: Number(taxRate),
          servicePropertyAddress: property, customerFacingSummary: summary, paymentTerms: terms, dueInDays: Number(days) });
      if (!result.success) throw new Error(result.error);
      onSaved(result.invoice);
    } catch (failure) { setError(failure.message || 'Invoice could not be saved.'); }
    finally { setBusy(false); }
  };
  return <div role="dialog" aria-modal="true" aria-label={editing ? 'Edit invoice draft' : 'Create manual invoice'} className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4">
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 space-y-4">
      <div className="flex justify-between"><h2 className="text-xl font-semibold">{editing ? 'Review invoice draft' : 'Create manual invoice draft'}</h2><button type="button" onClick={onClose} className="underline">Close</button></div>
      {!editing && <section><label className="block font-medium">Customer</label><div className="flex gap-2"><input className="input-field flex-1" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or email"/><button type="button" className="btn-secondary" onClick={searchCustomers}>Search</button></div>
        {customer && <p className="mt-2 text-sm">Selected: {customer.name} · {customer.email}</p>}
        <div className="max-h-32 overflow-y-auto">{matches.map(row => <button key={row.id} type="button" className="block w-full border-b p-2 text-left text-primary-700" onClick={() => { setCustomer(row); setMatches([]); }}>{row.name} · {row.email}</button>)}</div>
        <label className="mt-3 block">Service property address (optional)<input className="input-field mt-1 w-full" value={property} onChange={event => setProperty(event.target.value)}/></label>
      </section>}
      <section><h3 className="font-semibold">Itemized services</h3>{lockedPricing && <p className="text-sm text-amber-800">Approved estimate prices are fixed. To correct pricing, use the estimate version workflow.</p>}
        <div className="mt-2 hidden gap-2 text-xs text-gray-600 sm:grid sm:grid-cols-[minmax(0,1fr)_5rem_7rem_7rem_auto]"><span>Description</span><span>Quantity</span><span>Unit price ($)</span><span>Discount ($)</span><span></span></div>
        {lines.map((row, index) => <div key={index} className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_7rem_auto]">
          <input aria-label={`Line ${index+1} description`} className="input-field" disabled={lockedPricing} value={row.description} onChange={event => setLine(index, 'description', event.target.value)} placeholder="Service description"/>
          <input aria-label={`Line ${index+1} quantity`} className="input-field" disabled={lockedPricing} type="number" step="0.001" min="0.001" value={row.quantity} onChange={event => setLine(index, 'quantity', event.target.value)}/>
          <input aria-label={`Line ${index+1} unit price`} className="input-field" disabled={lockedPricing} type="number" step="0.01" min="0" value={row.unitPrice} onChange={event => setLine(index, 'unitPrice', event.target.value)}/>
          <input aria-label={`Line ${index+1} discount`} className="input-field" disabled={lockedPricing} type="number" step="0.01" min="0" value={row.discount} onChange={event => setLine(index, 'discount', event.target.value)}/>
          <button type="button" disabled={lockedPricing || lines.length === 1} onClick={() => setLines(previous => previous.filter((_, i) => i !== index))} className="underline disabled:opacity-40">Remove</button>
        </div>)}
        {!lockedPricing && lines.length < 50 && <button type="button" className="mt-2 text-primary-700 underline" onClick={() => setLines(previous => [...previous, blankLine()])}>Add line</button>}
        <label className="mt-3 block">Tax rate (%)<input className="input-field mt-1 w-32" type="number" min="0" max="100" step="0.01" disabled={lockedPricing} value={taxRate} onChange={event => setTaxRate(event.target.value)}/></label>
        {pricingChanged && <label className="mt-3 block">Reason for management pricing change<input className="input-field mt-1 w-full" value={reason} onChange={event => setReason(event.target.value)}/></label>}
      </section>
      <label className="block">Customer-facing service summary<textarea className="input-field mt-1 w-full" value={summary} onChange={event => setSummary(event.target.value)} rows={3}/></label>
      <label className="block">Payment terms<textarea className="input-field mt-1 w-full" value={terms} onChange={event => setTerms(event.target.value)} rows={2}/></label>
      {!editing && <label className="block">Payment due in days<input className="input-field mt-1 w-32" type="number" min="0" max="365" value={days} onChange={event => setDays(event.target.value)}/></label>}
      {!!photos.length && <fieldset><legend className="font-medium">Optional approved service photos</legend>{photos.map(photo => <label key={photo.id} className="mt-1 flex gap-2"><input type="checkbox" checked={photoIds.includes(photo.id)} onChange={event => setPhotoIds(old => event.target.checked ? [...old, photo.id] : old.filter(id => id !== photo.id))}/>{photo.caption || `Photo recorded ${new Date(photo.createdAt?.seconds * 1000 || Date.now()).toLocaleDateString()}`}</label>)}</fieldset>}
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
      <button type="button" disabled={busy || !editing && !customer} className="btn-primary disabled:opacity-50" onClick={save}>{busy ? 'Saving…' : 'Save draft'}</button>
    </div>
  </div>;
}
