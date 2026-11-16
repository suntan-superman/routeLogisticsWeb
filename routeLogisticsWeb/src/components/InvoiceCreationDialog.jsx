import { useEffect, useRef, useState } from 'react';
import { previewInvoiceFromJob, createInvoiceFromJob } from '../services/invoiceService';
import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';
import toast from 'react-hot-toast';

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const amount = (row, cents, dollars) => Number.isSafeInteger(row?.[cents]) ? row[cents] / 100 : Number.isFinite(row?.[dollars]) ? row[dollars] : null;
const displayMoney = value => value === null ? 'Unavailable' : money(value);

export default function InvoiceCreationDialog({ jobId, replacementOf, expectedRevision, onClose, onCreated, onOpenInvoice }) {
  const [replacement, setReplacement] = useState(() => replacementOf ? { replacementOf, expectedRevision } : null);
  const previewQuery = useWorkspaceQuery(['invoice-preview', jobId, replacement?.replacementOf || null, replacement?.expectedRevision ?? null],
    () => previewInvoiceFromJob(jobId, replacement || {}), { intervalMs: false, staleTime: 0 });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), attempts = useRef(new Map()), lifetime = useRef(0), live = useRef(false), scope = useRef(previewQuery.scopeId), panel = useRef(null), close = useRef(null), closeAction = useRef(onClose);
  scope.current = previewQuery.scopeId;
  closeAction.current = onClose;
  const readable = previewQuery.readable && !workspaceAccessError(previewQuery.error);
  const authority = useRef(readable); authority.current = readable;
  const preview = readable ? previewQuery.data : null;
  const existing = preview?.existingInvoice && !(replacement && preview.sourceFingerprint) ? preview.existingInvoice : null;
  const replacementRequired = preview?.replacementRequired && !replacement;
  const shown = existing || preview;
  const waiting = previewQuery.isPending ?? previewQuery.isLoading;
  useEffect(() => {
    live.current = true; const counter = lifetime, ticket = ++counter.current;
    setBusy(false); setError(''); lock.current = false;
    return () => { live.current = false; if (ticket === counter.current) counter.current++; };
  }, [jobId, previewQuery.scopeId]);
  useEffect(() => {
    const before = document.body.style.overflow, returnFocus = document.activeElement;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); if (!lock.current) closeAction.current(); }
      if (event.key === 'Tab') {
        const controls = [...(panel.current?.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex]:not([tabindex="-1"])') || [])];
        const first = controls[0], last = controls.at(-1);
        if (!controls.length) { event.preventDefault(); panel.current?.focus(); }
        else if (!panel.current?.contains(document.activeElement) || event.shiftKey && document.activeElement === first) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); document.body.style.overflow = before; if (returnFocus?.isConnected) returnFocus.focus?.({ preventScroll: true }); };
  }, []);
  const create = async () => {
    if (lock.current || previewQuery.error || !preview?.sourceFingerprint || existing || preview.reviewRequired || replacementRequired) return;
    lock.current = true; setBusy(true); setError('');
    const ticket = lifetime.current, submittedScope = previewQuery.scopeId;
    const key = JSON.stringify([submittedScope, jobId, preview.sourceFingerprint, replacement]);
    if (!attempts.current.has(key)) attempts.current.set(key, crypto.randomUUID());
    try {
      const result = await createInvoiceFromJob(jobId, { sourceFingerprint: preview.sourceFingerprint, operationId: attempts.current.get(key), ...(replacement || {}) });
      if (!live.current || ticket !== lifetime.current || scope.current !== submittedScope || !authority.current) return;
      if (!result.success) { const message = result.error || 'The invoice was not created. Review the preview and retry.'; setError(message); toast.error(message); return; }
      await onCreated(result);
    } catch (failure) {
      if (live.current && ticket === lifetime.current && scope.current === submittedScope) { const message = failure.message || 'The invoice could not be confirmed. Retry to check the same request.'; setError(message); toast.error(message); }
    } finally { if (live.current && ticket === lifetime.current && scope.current === submittedScope) { lock.current = false; setBusy(false); } }
  };
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onMouseDown={event => { if (event.currentTarget === event.target && !lock.current) onClose(); }}>
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="invoice-preview-title" tabIndex={-1} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-4"><h2 id="invoice-preview-title" className="text-xl font-bold">{replacement ? 'Review replacement invoice' : 'Review invoice'}</h2><button ref={close} type="button" disabled={busy} onClick={onClose} className="rounded border px-3 py-2 disabled:opacity-50">Close preview</button></div>
      <p className="mb-4 text-sm text-gray-600">Review the saved billing terms before creating a draft. Creating a draft does not send an invoice or collect payment.</p>
      {waiting && <p role="status">Loading invoice preview…</p>}
      {(previewQuery.error || error) && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3"><p role="alert" className="text-red-800">{error || previewQuery.error.message}</p><button type="button" disabled={busy} className="mt-2 underline" onClick={async () => { setError(''); await previewQuery.refetch(); }}>Refresh invoice preview</button></div>}
      {!readable && !previewQuery.error && <p role="alert">Invoice access is no longer available. Refresh your company access before continuing.</p>}
      {preview && <>
        {existing ? <div className="mb-4 rounded border bg-gray-50 p-3"><p className="font-semibold">Existing invoice: {existing.invoiceNumber || existing.id}</p><p>Status: {existing.status || 'Not set'}</p><p className="mt-1 text-sm">The existing invoice is preserved. Viewing it does not create another invoice.</p></div>
          : <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3"><p className="font-semibold">{preview.sourceLabel || (preview.sourceKind === 'approved-estimate' ? 'Approved estimate pricing' : 'Saved job pricing')}</p>{preview.billingSource?.estimateVersion && <p className="text-sm">Approved estimate version {preview.billingSource.estimateVersion}</p>}{replacement && <p className="mt-2 text-sm">This creates a new draft linked to the voided invoice. Its history is retained.</p>}</div>}
        {preview.reviewRequired && <p role="alert" className="mb-4 rounded bg-amber-50 p-3 text-amber-900">{preview.message || 'Existing billing records need authorized review before another invoice can be created.'}</p>}
        {(shown.lineItems || []).length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">Description</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Unit price</th><th className="py-2 text-right">Amount</th></tr></thead><tbody>{shown.lineItems.map((line, index) => <tr key={line.id || index} className="border-b"><td className="py-2">{line.description}</td><td className="p-2 text-right">{line.quantity}</td><td className="p-2 text-right">{displayMoney(amount(line, 'unitPriceCents', 'unitPrice'))}</td><td className="py-2 text-right">{displayMoney(amount(line, 'amountCents', 'amount'))}</td></tr>)}</tbody></table></div>}
        {amount(shown, 'totalCents', 'total') !== null && <dl className="ml-auto mt-4 max-w-xs space-y-2"><div className="flex justify-between"><dt>Subtotal</dt><dd>{displayMoney(amount(shown, 'subtotalCents', 'subtotal'))}</dd></div><div className="flex justify-between"><dt>Tax{shown.taxRate !== undefined ? ` (${shown.taxRate}%)` : ''}</dt><dd>{displayMoney(amount(shown, 'taxCents', 'tax'))}</dd></div><div className="flex justify-between border-t pt-2 font-bold"><dt>Total</dt><dd>{displayMoney(amount(shown, 'totalCents', 'total'))} {shown.currency || 'USD'}</dd></div></dl>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {existing && <button type="button" disabled={busy} className="btn-secondary" onClick={() => onOpenInvoice(existing.id)}>Open existing invoice</button>}
          {existing?.status === 'void' && replacementRequired && !preview.reviewRequired && <button type="button" className="btn-primary" onClick={() => { setError(''); setReplacement({ replacementOf: existing.id, expectedRevision: existing.revision ?? 0 }); }}>Review replacement</button>}
          {!existing && !preview.reviewRequired && !replacementRequired && <button type="button" disabled={busy || !!previewQuery.error || !preview.sourceFingerprint || amount(shown, 'totalCents', 'total') === null} className="btn-primary disabled:opacity-50" onClick={create}>{busy ? 'Confirming invoice…' : replacement ? 'Create replacement draft' : 'Create draft invoice'}</button>}
        </div>
      </>}
    </section>
  </div>;
}
