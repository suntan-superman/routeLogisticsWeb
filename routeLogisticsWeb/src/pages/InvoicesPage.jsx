import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { listInvoices, markInvoiceSent, markInvoicePaid, voidInvoice } from '../services/invoiceService';
import { isOverdue } from '../services/invoiceMath';
import { can } from '../services/tenancy';
import { useConfirm } from '../components/ConfirmProvider';
import { useAuth } from '../contexts/AuthContext';
import { callWorkspace } from '../services/workspaceApi';
import InvoicePayment from '../components/InvoicePayment';
import { paymentsConfigured, paymentMode } from '../services/paymentConfig';
import PaymentHistory from '../components/PaymentHistory';
import InvoiceCreationDialog from '../components/InvoiceCreationDialog';
import { useWorkspaceQuery, useInvalidateWorkspace } from '../hooks/useWorkspaceQuery';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const BADGE = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  void: 'bg-red-100 text-red-700',
  overdue: 'bg-amber-100 text-amber-800',
};
const EMPTY_INVOICES = [];

function printInvoice(inv, businessName) {
  const w = window.open('', '_blank', 'width=800,height=900');
  if (!w) return toast.error('Allow pop-ups to print invoices');
  const rows = (inv.lineItems || [])
    .map((i) => `<tr><td>${esc(i.description)}</td><td class="r">${esc(i.quantity)}</td><td class="r">${money(i.unitPrice)}</td><td class="r">${money(i.amount)}</td></tr>`)
    .join('');
  w.document.write(`<!doctype html><html><head><title>${esc(inv.invoiceNumber)}</title><style>
    body{font-family:system-ui,Arial,sans-serif;margin:40px;color:#111}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}
    th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}.tot{margin-top:16px;float:right;min-width:220px}
    .tot div{display:flex;justify-content:space-between;padding:4px 0}.big{font-weight:700;font-size:1.2em;border-top:2px solid #111}
  </style></head><body>
    <h1>${esc(businessName || 'Invoice')}</h1><p>Invoice <b>${esc(inv.invoiceNumber)}</b><br>Issued ${esc(inv.issueDate)} · Due ${esc(inv.dueDate)}</p>
    <p><b>Bill to</b><br>${esc(inv.customerName)}<br>${esc(inv.customerAddress)}</p>
    <table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot"><div><span>Subtotal</span><span>${money(inv.subtotal)}</span></div><div><span>Tax (${esc(inv.taxRate)}%)</span><span>${money(inv.tax)}</span></div>
    <div class="big"><span>Total</span><span>${money(inv.total)}</span></div></div>
    ${inv.notes ? `<p style="clear:both;padding-top:24px">${esc(inv.notes)}</p>` : ''}
    <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

const InvoicesPage = () => {
  const { userProfile } = useAuth();
  const invoiceQuery = useWorkspaceQuery(['invoices', 200], () => listInvoices());
  const invoices = invoiceQuery.data?.invoices || EMPTY_INVOICES, loading = invoiceQuery.isPending;
  const invalidate = useInvalidateWorkspace();
  const [filter, setFilter] = useState('all');
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [historyInvoice, setHistoryInvoice] = useState(null);
  const [replacementInvoice, setReplacementInvoice] = useState(null);
  const [busyIds, setBusyIds] = useState([]), [actionErrors, setActionErrors] = useState({});
  const locked = useRef(new Set()), attempts = useRef(new Map()), live = useRef(false), scope = useRef(invoiceQuery.scopeId);
  scope.current = invoiceQuery.scopeId;
  const manage = can('invoices.manage');
  const financialAccess = useRef(false); financialAccess.current = manage && invoiceQuery.readable && !workspaceAccessError(invoiceQuery.error);
  const confirm = useConfirm();
  const focusedInvoice = new URLSearchParams(globalThis.window?.location?.search || '').get('invoice');

  const load = () => invalidate(['invoices', 'invoice', 'jobs', 'job', 'payments', 'reports', 'analytics', 'invoice-preview']);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { setPaymentInvoice(null); setHistoryInvoice(null); setReplacementInvoice(null); setBusyIds([]); setActionErrors({}); locked.current.clear(); attempts.current.clear(); }, [invoiceQuery.scopeId]);
  useEffect(() => { if (workspaceAccessError(invoiceQuery.error)) { setPaymentInvoice(null); setHistoryInvoice(null); setReplacementInvoice(null); } }, [invoiceQuery.error]);
  useEffect(() => {
    if (!focusedInvoice || !invoices.some(invoice => invoice.id === focusedInvoice)) return;
    const row = globalThis.document?.getElementById?.(`invoice-${focusedInvoice}`);
    row?.scrollIntoView?.({ block: 'center' }); row?.focus?.({ preventScroll: true });
  }, [focusedInvoice, invoices]);

  const act = async (invoice, action, fn, msg) => {
    if (!financialAccess.current || locked.current.has(invoice.id)) return;
    const submittedScope = invoiceQuery.scopeId, key = JSON.stringify([submittedScope, invoice.id, invoice.revision ?? 0, action]);
    if (!attempts.current.has(key)) attempts.current.set(key, crypto.randomUUID());
    locked.current.add(invoice.id); setBusyIds(ids => [...ids, invoice.id]); setActionErrors(previous => ({ ...previous, [invoice.id]: '' }));
    try {
      const result = await fn({ expectedRevision: invoice.revision ?? 0, operationId: attempts.current.get(key) });
      if (!live.current || scope.current !== submittedScope || !financialAccess.current) return;
      if (!result.success) {
        const message = result.error || 'The invoice was not changed. Refresh and retry.';
        setActionErrors(previous => ({ ...previous, [invoice.id]: message })); toast.error(message); return;
      }
      if (result.invoice) invoiceQuery.setData(previous => ({ ...previous, invoices: (previous?.invoices || []).map(row => row.id === invoice.id ? result.invoice : row) }));
      toast.success(msg); await load();
    } catch (error) {
      if (live.current && scope.current === submittedScope) { setActionErrors(previous => ({ ...previous, [invoice.id]: error.message || 'Invoice status could not be confirmed. Refresh before retrying.' })); toast.error(error.message || 'Invoice status could not be confirmed.'); }
    } finally {
      if (live.current && scope.current === submittedScope) { locked.current.delete(invoice.id); setBusyIds(ids => ids.filter(id => id !== invoice.id)); }
    }
  };
  const email = invoice => act(invoice, 'email', async options => ({ success: true, ...(await callWorkspace('emailInvoice', { invoiceId: invoice.id, expectedRevision: options.expectedRevision })) }), 'Invoice email queued');

  const summary = useMemo(() => {
    const s = { outstanding: 0, overdue: 0, paid: 0 };
    invoices.forEach((i) => {
      if (i.status === 'sent') s.outstanding += i.total || 0;
      if (isOverdue(i)) s.overdue += i.total || 0;
      if (i.status === 'paid') s.paid += i.total || 0;
    });
    return s;
  }, [invoices]);

  const shown = invoices.filter((i) => filter === 'all' || (filter === 'overdue' ? isOverdue(i) : i.status === filter));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <p className="text-sm text-gray-500">Create invoices from completed jobs (Jobs → View → Create Invoice).</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[['Outstanding', summary.outstanding], ['Overdue', summary.overdue], ['Paid', summary.paid]].map(([label, value]) => (
          <div key={label} className="bg-white rounded-lg border p-4">
            <div className="text-sm text-gray-500">{label}</div>
            <div className="text-2xl font-semibold">{money(value)}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'draft', 'sent', 'overdue', 'paid', 'void'].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-full text-sm capitalize ${filter === f ? 'bg-primary-600 text-white' : 'bg-white border text-gray-700'}`}>
            {f}
          </button>
        ))}
      </div>
      {invoiceQuery.error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{invoiceQuery.error.message} <button className="underline" onClick={() => invoiceQuery.refetch()}>Retry invoice refresh</button></p>}

      <div className="bg-white rounded-lg border overflow-x-auto">
        {loading ? (
          <p className="p-6 text-gray-500">Loading…</p>
        ) : !invoices.length && invoiceQuery.error ? (
          <p className="p-6 text-gray-600">Invoices could not be loaded. Reconnect and retry the refresh.</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-gray-500">No invoices.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Actions</th></tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((inv) => {
                const status = isOverdue(inv) ? 'overdue' : inv.status;
                const busy = busyIds.includes(inv.id);
                return (
                  <tr key={inv.id} id={`invoice-${inv.id}`} tabIndex={-1} className={focusedInvoice === inv.id ? 'bg-emerald-50 outline-primary-500' : undefined}>
                    <td className="px-4 py-3 font-medium">{inv.invoiceNumber}{!inv.billingSource && <p className="mt-1 text-xs font-normal text-amber-800">Historical invoice — source needs review</p>}</td>
                    <td className="px-4 py-3">{inv.customerName || '—'}</td>
                    <td className="px-4 py-3">{inv.dueDate}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${BADGE[status]}`}>{status}</span></td>
                    <td className="px-4 py-3 text-right">{money(inv.total)}</td>
                    <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                      {manage && inv.status === 'sent' && paymentsConfigured && <button disabled={busy} className="text-primary-700 underline disabled:opacity-50" onClick={() => setPaymentInvoice(inv.id)}>{paymentMode === 'test' ? 'Test card payment' : 'Card payment'}</button>}
                      {manage && <button className="text-primary-700 underline" onClick={() => setHistoryInvoice(inv.id)}>Payment history</button>}
                      {manage && inv.paymentLock && <button className="text-amber-700 underline" onClick={async () => { if (!(await confirm({ title: 'Cancel payment attempt?', message: 'This cancels an uncompleted card payment and unlocks invoice changes. It does not issue a refund.', confirmText: 'Cancel attempt' }))) return; try { await callWorkspace('rlCancelInvoicePayment', { invoiceId: inv.id }); await load(); } catch (error) { toast.error(error.message); } }}>Cancel payment attempt</button>}
                      {inv.testPaymentStatus && <span className="text-xs text-gray-500">Test: {inv.testPaymentStatus}</span>}
                      <button className="text-primary-600 hover:underline" onClick={() => printInvoice(inv, userProfile?.businessName)}>Print</button>
                      {manage && ['draft', 'sent'].includes(inv.status) && <button disabled={busy} className="text-primary-600 hover:underline disabled:opacity-50" onClick={() => email(inv)}>Email invoice</button>}
                      {manage && inv.status === 'draft' && <button disabled={busy} className="text-primary-600 hover:underline disabled:opacity-50" onClick={() => act(inv, 'sent', options => markInvoiceSent(inv.id, options), 'Marked as sent')}>Mark sent</button>}
                      {manage && inv.status === 'sent' && !inv.paymentLock && <button disabled={busy} className="text-green-600 hover:underline disabled:opacity-50" onClick={() => act(inv, 'paid', options => markInvoicePaid(inv.id, 'other', options), 'Marked as paid')}>Mark paid</button>}
                      {manage && (inv.status === 'draft' || inv.status === 'sent') && (
                        <button disabled={busy || !!inv.paymentLock} title={inv.paymentLock ? 'Cancel the payment attempt first' : undefined} className="text-red-600 hover:underline disabled:opacity-50" onClick={async () => { const submittedScope = scope.current; if (await confirm({ title: 'Void this invoice?', message: 'The invoice will be retained as void with its audit history. It can no longer be paid or edited.', confirmText: 'Void invoice' }) && submittedScope === scope.current) await act(inv, 'void', options => voidInvoice(inv.id, options), 'Invoice voided'); }}>Void</button>
                      )}
                      {manage && inv.status === 'void' && inv.jobId && <button disabled={busy} className="text-primary-700 underline disabled:opacity-50" onClick={() => setReplacementInvoice({ invoiceId: inv.id, jobId: inv.jobId, revision: inv.revision ?? 0, scopeId: invoiceQuery.scopeId })}>Review replacement</button>}
                      {busy && <span role="status" className="text-xs text-gray-600">Confirming invoice…</span>}
                      {actionErrors[inv.id] && <div className="max-w-sm whitespace-normal text-red-800"><p role="alert">{actionErrors[inv.id]}</p><button type="button" disabled={busy} className="underline" onClick={() => invoiceQuery.refetch()}>Refresh invoice before retrying</button></div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {paymentInvoice && <InvoicePayment invoiceId={paymentInvoice} onClose={() => setPaymentInvoice(null)} onRefresh={load} />}
      {historyInvoice && <div role="dialog" aria-modal="true" aria-label="Invoice payment history" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6"><button className="float-right underline" onClick={() => setHistoryInvoice(null)}>Close history</button><PaymentHistory invoiceId={historyInvoice} /></div></div>}
      {replacementInvoice && replacementInvoice.scopeId === invoiceQuery.scopeId && <InvoiceCreationDialog key={`${replacementInvoice.scopeId}:${replacementInvoice.invoiceId}`} jobId={replacementInvoice.jobId} replacementOf={replacementInvoice.invoiceId} expectedRevision={replacementInvoice.revision}
        onClose={() => setReplacementInvoice(null)}
        onOpenInvoice={id => { setReplacementInvoice(null); globalThis.document?.getElementById?.(`invoice-${id}`)?.scrollIntoView?.({ block: 'center' }); }}
        onCreated={result => { setReplacementInvoice(null); setFilter('all'); toast.success(result.existing ? 'Opening existing invoice' : 'Replacement draft created'); load().catch(() => toast.error('Invoice saved. Refresh the invoice list to see the replacement.')); }} />}
    </div>
  );
};

export default InvoicesPage;
