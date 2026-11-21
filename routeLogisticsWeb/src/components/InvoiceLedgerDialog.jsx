import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { callWorkspace } from '../services/workspaceApi';
import SelectControl from './SelectControl';

const toCents = value => /^\d+(?:\.\d{1,2})?$/.test(value.trim()) ? Number(value.trim().replace('.', '')) * (value.includes('.') ? 10 ** (2 - value.split('.')[1].length) : 100) : NaN;
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export default function InvoiceLedgerDialog({ invoice, invoices = [], onClose, onChanged }) {
  const [mode, setMode] = useState('record'), [amount, setAmount] = useState(() => ((invoice.balanceCents || 0) / 100).toFixed(2));
  const [method, setMethod] = useState('cash'), [reason, setReason] = useState('');
  const [otherAllocations, setOtherAllocations] = useState({});
  const [history, setHistory] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), operation = useRef(null), reversalOperations = useRef(new Map());
  const eligible = invoices.filter(row => row.financialVersion === 2 && row.id !== invoice.id && row.customerId === invoice.customerId && ['issued','partially_paid'].includes(row.status) && row.balanceCents > 0);
  const reversed = new Set(history.filter(row => row.kind === 'reverse').map(row => row.reversesReceiptId));
  useEffect(() => {
    let active = true;
    callWorkspace('rlInvoiceLedger', { action: 'history', invoiceId: invoice.id }).then(result => { if (active) setHistory(result.entries || []); }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [invoice.id]);
  const submit = async event => {
    event.preventDefault(); if (lock.current) return;
    const amountCents = toCents(amount);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > invoice.balanceCents) { setError('Enter a positive amount no greater than the outstanding balance.'); return; }
    if (mode === 'credit' && reason.trim().length < 5) { setError('Explain the credit in at least five characters.'); return; }
    const allocations = [{ invoiceId: invoice.id, amountCents }];
    for (const [id, value] of Object.entries(otherAllocations)) {
      if (!String(value).trim()) continue;
      const other = eligible.find(row => row.id === id), extra = toCents(value);
      if (!other || !Number.isSafeInteger(extra) || extra <= 0 || extra > other.balanceCents) { setError('Each additional allocation must be positive and no greater than that invoice’s balance.'); return; }
      allocations.push({ invoiceId: id, amountCents: extra });
    }
    lock.current = true; setBusy(true); setError('');
    operation.current ||= crypto.randomUUID();
    try {
      await callWorkspace('rlInvoiceLedger', { action: mode, operationId: operation.current, allocations, ...(mode === 'record' ? { method } : { reason: reason.trim() }) });
      toast.success(mode === 'record' ? 'Payment recorded' : 'Credit recorded'); await onChanged(); onClose();
    } catch (failure) { setError(failure.message || 'The ledger entry could not be confirmed. Retry with the same operation.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const reverse = async entry => {
    if (lock.current || !entry.receiptId || !window.confirm('Reverse this entire payment or credit? The original entry will remain in the audit trail.')) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (!reversalOperations.current.has(entry.receiptId)) reversalOperations.current.set(entry.receiptId, crypto.randomUUID());
      await callWorkspace('rlInvoiceLedger', { action: 'reverse', operationId: reversalOperations.current.get(entry.receiptId), receiptId: entry.receiptId, reason: 'Management reversal of recorded entry' });
      toast.success('Entry reversed'); await onChanged(); onClose();
    } catch (failure) { setError(failure.message || 'The reversal could not be confirmed.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div role="dialog" aria-modal="true" aria-label="Invoice ledger" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 text-gray-900">
      <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">Payments and credits · {invoice.invoiceNumber}</h2><button type="button" onClick={onClose} disabled={busy} className="underline">Close</button></div>
      <p className="mt-2">Outstanding: <strong>{money(invoice.balanceCents || 0)}</strong></p>
      {invoice.balanceCents > 0 && <form onSubmit={submit} className="mt-5 space-y-3">
        <label className="block">Action<SelectControl className="mt-1 w-full rounded border p-2" value={mode} onChange={event => { setMode(event.target.value); operation.current = null; }}><option value="record">Record payment</option><option value="credit">Apply credit</option></SelectControl></label>
        <label className="block">Amount (USD)<input className="mt-1 w-full rounded border p-2" inputMode="decimal" value={amount} onChange={event => { setAmount(event.target.value); operation.current = null; }} required /></label>
        {!!eligible.length && <details className="rounded border p-3"><summary className="cursor-pointer font-medium">Allocate the same payment across this customer’s other invoices</summary><p className="my-2 text-sm text-gray-600">Leave an amount blank to exclude an invoice. The payment is recorded once with separate audited allocations.</p>{eligible.map(row => <label key={row.id} className="mt-2 block text-sm">{row.invoiceNumber} · {money(row.balanceCents)} outstanding<input aria-label={`Allocation for ${row.invoiceNumber}`} className="mt-1 w-full rounded border p-2" inputMode="decimal" placeholder="0.00" value={otherAllocations[row.id] || ''} onChange={event => { setOtherAllocations(previous => ({ ...previous, [row.id]: event.target.value })); operation.current = null; }}/></label>)}</details>}
        {mode === 'record' ? <label className="block">Method<SelectControl className="mt-1 w-full rounded border p-2" value={method} onChange={event => { setMethod(event.target.value); operation.current = null; }}><option value="cash">Cash</option><option value="check">Check</option><option value="external_card">External card</option><option value="bank_transfer">Bank transfer</option></SelectControl></label>
          : <label className="block">Reason<input className="mt-1 w-full rounded border p-2" value={reason} onChange={event => { setReason(event.target.value); operation.current = null; }} required /></label>}
        <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Recording…' : mode === 'record' ? 'Record payment' : 'Apply credit'}</button>
      </form>}
      {error && <p role="alert" className="mt-3 rounded bg-red-50 p-3 text-red-800">{error}</p>}
      <h3 className="mt-6 font-semibold">Audited activity</h3>
      {history.length ? <ul className="mt-2 space-y-2">{history.map(entry => <li key={entry.id} className="flex items-center justify-between rounded border p-2"><span>{entry.kind} · {money(entry.amountCents)} · {new Date(entry.recordedAt?.seconds ? entry.recordedAt.seconds * 1000 : entry.recordedAt).toLocaleString()}</span>{entry.kind !== 'reverse' && !reversed.has(entry.receiptId) && <button type="button" disabled={busy} onClick={() => reverse(entry)} className="text-red-700 underline">Reverse</button>}</li>)}</ul> : <p className="mt-2 text-sm text-gray-600">No payments or credits recorded.</p>}
    </div>
  </div>;
}
