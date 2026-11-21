import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { listInvoices, submitInvoiceForApproval, approveInvoice, unlockApprovedInvoice, issueInvoice, voidInvoice } from '../services/invoiceService';
import { isOverdue } from '../services/invoiceMath';
import { can } from '../services/tenancy';
import { useConfirm } from '../components/ConfirmProvider';
import { callWorkspace } from '../services/workspaceApi';
import InvoicePayment from '../components/InvoicePayment';
import { paymentsConfigured, paymentMode } from '../services/paymentConfig';
import PaymentHistory from '../components/PaymentHistory';
import InvoiceCreationDialog from '../components/InvoiceCreationDialog';
import InvoiceLedgerDialog from '../components/InvoiceLedgerDialog';
import InvoiceEditorDialog from '../components/InvoiceEditorDialog';
import { useWorkspaceQuery, useInvalidateWorkspace } from '../hooks/useWorkspaceQuery';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const BADGE = {
  draft: 'bg-gray-100 text-gray-700',
  awaiting_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  issued: 'bg-blue-100 text-blue-700',
  partially_paid: 'bg-amber-100 text-amber-800',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  void: 'bg-red-100 text-red-700',
  overdue: 'bg-amber-100 text-amber-800',
};
const EMPTY_INVOICES = [];

const pdfUrl = base64 => URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], { type: 'application/pdf' }));

const InvoicesPage = () => {
  const invoiceQuery = useWorkspaceQuery(['invoices', 200], () => listInvoices());
  const invoices = invoiceQuery.data?.invoices || EMPTY_INVOICES, loading = invoiceQuery.isPending;
  const invalidate = useInvalidateWorkspace();
  const [filter, setFilter] = useState('all');
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [historyInvoice, setHistoryInvoice] = useState(null);
  const [ledgerInvoice, setLedgerInvoice] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [emailReview, setEmailReview] = useState(null);
  const [replacementInvoice, setReplacementInvoice] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(undefined);
  const [unlockingInvoice, setUnlockingInvoice] = useState(null), [unlockReason, setUnlockReason] = useState('');
  const [busyIds, setBusyIds] = useState([]), [actionErrors, setActionErrors] = useState({});
  const locked = useRef(new Set()), attempts = useRef(new Map()), live = useRef(false), scope = useRef(invoiceQuery.scopeId);
  scope.current = invoiceQuery.scopeId;
  const manage = can('invoices.manage');
  const financialAccess = useRef(false); financialAccess.current = manage && invoiceQuery.readable && !workspaceAccessError(invoiceQuery.error);
  const confirm = useConfirm();
  const focusedInvoice = new URLSearchParams(globalThis.window?.location?.search || '').get('invoice');

  const load = () => invalidate(['invoices', 'invoice', 'jobs', 'job', 'payments', 'reports', 'analytics', 'invoice-preview']);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { setPaymentInvoice(null); setHistoryInvoice(null); setLedgerInvoice(null); setReplacementInvoice(null); setEmailReview(null); setUnlockingInvoice(null); setUnlockReason(''); setBusyIds([]); setActionErrors({}); locked.current.clear(); attempts.current.clear(); }, [invoiceQuery.scopeId]);
  useEffect(() => () => { if (pdf?.url) URL.revokeObjectURL(pdf.url); }, [pdf]);
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
        setActionErrors(previous => ({ ...previous, [invoice.id]: message })); toast.error(message); return result;
      }
      if (result.invoice) invoiceQuery.setData(previous => ({ ...previous, invoices: (previous?.invoices || []).map(row => row.id === invoice.id ? result.invoice : row) }));
      toast.success(msg); await load(); return result;
    } catch (error) {
      if (live.current && scope.current === submittedScope) { setActionErrors(previous => ({ ...previous, [invoice.id]: error.message || 'Invoice status could not be confirmed. Refresh before retrying.' })); toast.error(error.message || 'Invoice status could not be confirmed.'); }
      return { success: false, error: error.message };
    } finally {
      if (live.current && scope.current === submittedScope) { locked.current.delete(invoice.id); setBusyIds(ids => ids.filter(id => id !== invoice.id)); }
    }
  };
  const emailStatus = invoiceId => callWorkspace('emailInvoice', { action: 'status', invoiceId });
  const openEmailReview = async invoice => {
    if (!invoice) { setEmailReview(null); return; }
    const submittedScope = scope.current;
    setEmailReview({ invoiceId: invoice.id, scopeId: submittedScope, loading: true });
    try {
      const result = await emailStatus(invoice.id);
      if (scope.current === submittedScope) setEmailReview({ invoiceId: invoice.id, scopeId: submittedScope, resendOperationId: crypto.randomUUID(), ...result });
    } catch (error) {
      if (scope.current === submittedScope) setEmailReview({ invoiceId: invoice.id, scopeId: submittedScope, error: error.message || 'Delivery details are unavailable.' });
    }
  };
  const email = async invoice => {
    if (!invoice) { setEmailReview(null); return; }
    const resend = ['sent', 'failed', 'cancelled'].includes(emailReview.delivery?.status);
    const result = await act(invoice, resend ? 'email-resend' : 'email', async options => ({ success: true, ...(await callWorkspace('emailInvoice', { ...(resend ? { action: 'resend', operationId: emailReview.resendOperationId } : {}), invoiceId: invoice.id, expectedRevision: options.expectedRevision, expectedRecipient: emailReview.recipient })) }), resend ? 'Invoice resend requested' : 'Invoice email request recorded');
    if (result?.success && scope.current === emailReview?.scopeId) await openEmailReview(invoice);
    else if (result?.error && scope.current === emailReview?.scopeId) setEmailReview(previous => ({ ...previous, error: result.error }));
  };
  const showPdf = async (invoice, preview = false) => {
    const submittedScope = invoiceQuery.scopeId;
    try {
      const result = await callWorkspace('rlInvoicePdf', { invoiceId: invoice.id, preview });
      if (scope.current !== submittedScope) return;
      setPdf({ url: pdfUrl(result.base64), name: result.fileName });
    } catch (failure) { toast.error(failure.message || 'Invoice PDF is unavailable.'); }
  };

  const summary = useMemo(() => {
    const s = { outstanding: 0, overdue: 0, paid: 0 };
    invoices.forEach((i) => {
      if (i.financialVersion !== 2) return;
      if (['issued', 'partially_paid'].includes(i.status)) s.outstanding += (i.balanceCents || 0) / 100;
      if (isOverdue(i)) s.overdue += (i.balanceCents || 0) / 100;
      s.paid += (i.paidCents || 0) / 100;
    });
    return s;
  }, [invoices]);

  const shown = invoices.filter((i) => filter === 'all' || (filter === 'overdue' ? isOverdue(i) : i.status === filter));

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <p className="text-sm text-gray-500">Create from completed jobs or prepare a manual invoice draft. Approval is required before issue or delivery.</p></div>
        {manage && <button type="button" className="btn-primary" onClick={() => setEditingInvoice(null)}>New manual invoice</button>}
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
        {['all', 'draft', 'awaiting_approval', 'approved', 'issued', 'partially_paid', 'overdue', 'paid', 'void'].map((f) => (
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
                    <td className="px-4 py-3 font-medium">{inv.invoiceNumber || 'Draft — unnumbered'}{inv.financialVersion !== 2 && <p className="mt-1 text-xs font-normal text-amber-800">Legacy test record</p>}</td>
                    <td className="px-4 py-3">{inv.customerName || '—'}</td>
                    <td className="px-4 py-3">{inv.dueDate}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${BADGE[status]}`}>{status}</span></td>
                    <td className="px-4 py-3 text-right">{money(inv.total)}{inv.financialVersion === 2 && inv.issuedSnapshot && <p className="text-xs">Due {money((inv.balanceCents || 0) / 100)}</p>}</td>
                    <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                      {manage && inv.financialVersion === 2 && ['issued','partially_paid'].includes(inv.status) && paymentsConfigured && <button disabled={busy} className="text-primary-700 underline disabled:opacity-50" onClick={() => setPaymentInvoice(inv.id)}>{paymentMode === 'test' ? 'Test card payment' : 'Card payment'}</button>}
                      {manage && inv.financialVersion === 2 && ['issued','partially_paid','paid'].includes(inv.status) && <button className="text-primary-700 underline" onClick={() => setLedgerInvoice(inv)}>Payments & credits</button>}
                      {manage && inv.financialVersion !== 2 && <button className="text-primary-700 underline" onClick={() => setHistoryInvoice(inv.id)}>Legacy payment history</button>}
                      {manage && inv.paymentLock && <button className="text-amber-700 underline" onClick={async () => { if (!(await confirm({ title: 'Cancel payment attempt?', message: 'This cancels an uncompleted card payment and unlocks invoice changes. It does not issue a refund.', confirmText: 'Cancel attempt' }))) return; try { await callWorkspace('rlCancelInvoicePayment', { invoiceId: inv.id }); await load(); } catch (error) { toast.error(error.message); } }}>Cancel payment attempt</button>}
                      {inv.testPaymentStatus && <span className="text-xs text-gray-500">Test: {inv.testPaymentStatus}</span>}
                      {inv.financialVersion === 2 && inv.issuedSnapshot && <button className="text-primary-600 underline" onClick={() => showPdf(inv)}>View PDF</button>}
                      {manage && inv.financialVersion === 2 && !inv.issuedSnapshot && <button className="text-primary-600 underline" onClick={() => showPdf(inv, true)}>Preview PDF</button>}
                      {manage && inv.financialVersion === 2 && inv.status === 'draft' && <button className="text-primary-600 underline" onClick={() => setEditingInvoice(inv)}>Edit draft</button>}
                      {manage && inv.financialVersion === 2 && ['issued', 'partially_paid', 'paid'].includes(inv.status) && <button disabled={busy} className="text-primary-600 underline disabled:opacity-50" onClick={() => openEmailReview(inv)}>Email PDF</button>}
                      {manage && inv.financialVersion === 2 && inv.status === 'draft' && <button disabled={busy} className="text-primary-600 underline disabled:opacity-50" onClick={() => act(inv, 'submit', options => submitInvoiceForApproval(inv.id, options), 'Sent for management approval')}>Submit for approval</button>}
                      {manage && inv.financialVersion === 2 && inv.status === 'awaiting_approval' && <button disabled={busy} className="text-primary-600 underline disabled:opacity-50" onClick={() => act(inv, 'approve', options => approveInvoice(inv.id, options), 'Invoice approved')}>Approve</button>}
                      {manage && inv.financialVersion === 2 && inv.status === 'approved' && <button disabled={busy} className="text-primary-600 underline disabled:opacity-50" onClick={() => act(inv, 'issue', options => issueInvoice(inv.id, options), 'Invoice issued; customer delivery remains manual')}>Issue</button>}
                      {manage && inv.financialVersion === 2 && inv.status === 'approved' && <button disabled={busy} className="text-amber-700 underline disabled:opacity-50" onClick={() => { setUnlockReason(''); setUnlockingInvoice(inv); }}>Unlock for editing</button>}
                      {manage && inv.financialVersion === 2 && ['draft','awaiting_approval','approved','issued'].includes(inv.status) && (
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
      {ledgerInvoice && <InvoiceLedgerDialog invoice={ledgerInvoice} invoices={invoices} onClose={() => setLedgerInvoice(null)} onChanged={load} />}
      {editingInvoice !== undefined && <InvoiceEditorDialog key={editingInvoice?.id || 'manual'} invoice={editingInvoice} onClose={() => setEditingInvoice(undefined)} onSaved={() => { setEditingInvoice(undefined); toast.success('Invoice draft saved'); load(); }} />}
      {unlockingInvoice && <div role="dialog" aria-modal="true" aria-label="Unlock approved invoice" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-md rounded-xl bg-white p-6 space-y-4 text-gray-900"><h2 className="text-lg font-semibold">Unlock approved invoice?</h2><p>This revokes approval and returns the unissued invoice to a draft. Review and approve any changes before issuing it. Issued invoices remain immutable.</p><label className="block">Reason for correction<textarea autoFocus value={unlockReason} onChange={event => setUnlockReason(event.target.value)} maxLength={500} className="mt-1 w-full rounded border p-2" /></label><div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setUnlockingInvoice(null)}>Keep locked</button><button type="button" className="btn-primary" disabled={unlockReason.trim().length < 5 || busyIds.includes(unlockingInvoice.id)} onClick={async () => { const result = await act(unlockingInvoice, 'unlock', options => unlockApprovedInvoice(unlockingInvoice.id, unlockReason.trim(), options), 'Invoice approval revoked; draft unlocked'); if (result?.success) setUnlockingInvoice(null); }}>Unlock draft</button></div></div></div>}
      {pdf && <div role="dialog" aria-modal="true" aria-label="Invoice PDF" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"><div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white p-4"><div className="mb-2 flex justify-between"><strong>{pdf.name}</strong><span><button type="button" onClick={() => globalThis.document?.querySelector?.('iframe[title="Invoice PDF preview"]')?.contentWindow?.print?.()} className="mr-4 underline">Print</button><a href={pdf.url} download={pdf.name} className="mr-4 underline">Download</a><button onClick={() => setPdf(null)} className="underline">Close</button></span></div><iframe title="Invoice PDF preview" src={pdf.url} className="min-h-0 flex-1" /></div></div>}
      {emailReview && emailReview.scopeId === invoiceQuery.scopeId && <div role="dialog" aria-modal="true" aria-label="Invoice email delivery" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-md rounded-xl bg-white p-6 space-y-4 text-gray-900">
        <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">Email approved invoice PDF</h2><button type="button" onClick={() => setEmailReview(null)} className="underline">Close</button></div>
        {emailReview.loading ? <p role="status">Checking customer email and delivery status…</p> : emailReview.error ? <p role="alert" className="text-red-700">{emailReview.error}</p> : <>
          <p>The issued PDF will be attached and sent to <strong>{emailReview.recipient}</strong>. Change the customer email in Customers first if this address is incorrect.</p>
          <p role="status">{emailReview.delivery?.status === 'sent' ? `Accepted by the email provider${emailReview.delivery.sentAt ? ` ${new Date(emailReview.delivery.sentAt).toLocaleString()}` : ''}. Inbox delivery is not confirmed.` : emailReview.delivery?.status === 'queued' || emailReview.delivery?.status === 'sending' ? 'Delivery is in progress.' : emailReview.delivery?.status === 'failed' || emailReview.delivery?.status === 'cancelled' ? 'The previous delivery failed or was cancelled. Review the recipient and resend only if appropriate.' : 'No recent delivery to this address.'}</p>
          <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => openEmailReview(invoices.find(row => row.id === emailReview.invoiceId))}>Refresh status</button><button type="button" className="btn-primary" disabled={busyIds.includes(emailReview.invoiceId) || ['queued','sending'].includes(emailReview.delivery?.status)} onClick={() => email(invoices.find(row => row.id === emailReview.invoiceId))}>{['sent','failed','cancelled'].includes(emailReview.delivery?.status) ? 'Resend invoice PDF' : 'Send invoice PDF'}</button></div>
        </>}
      </div></div>}
      {replacementInvoice && replacementInvoice.scopeId === invoiceQuery.scopeId && <InvoiceCreationDialog key={`${replacementInvoice.scopeId}:${replacementInvoice.invoiceId}`} jobId={replacementInvoice.jobId} replacementOf={replacementInvoice.invoiceId} expectedRevision={replacementInvoice.revision}
        onClose={() => setReplacementInvoice(null)}
        onOpenInvoice={id => { setReplacementInvoice(null); globalThis.document?.getElementById?.(`invoice-${id}`)?.scrollIntoView?.({ block: 'center' }); }}
        onCreated={result => { setReplacementInvoice(null); setFilter('all'); toast.success(result.existing ? 'Opening existing invoice' : 'Replacement draft created'); load().catch(() => toast.error('Invoice saved. Refresh the invoice list to see the replacement.')); }} />}
    </div>
  );
};

export default InvoicesPage;
