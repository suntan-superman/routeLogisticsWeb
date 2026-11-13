import React, { useEffect, useMemo, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { listInvoices, markInvoiceSent, markInvoicePaid, voidInvoice, deleteDraftInvoice } from '../services/invoiceService';
import { isOverdue } from '../services/invoiceMath';
import { canManage } from '../services/tenancy';
import { useAuth } from '../contexts/AuthContext';

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const BADGE = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  void: 'bg-red-100 text-red-700',
  overdue: 'bg-amber-100 text-amber-800',
};

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
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const manage = canManage();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listInvoices();
    setLoading(false);
    if (res.success) setInvoices(res.invoices);
    else toast.error(res.error || 'Could not load invoices');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn, msg) => {
    const res = await fn();
    if (!res.success) return toast.error(res.error || 'Action failed');
    toast.success(msg);
    load();
  };

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

      <div className="bg-white rounded-lg border overflow-x-auto">
        {loading ? (
          <p className="p-6 text-gray-500">Loading…</p>
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
                return (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 font-medium">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3">{inv.customerName || '—'}</td>
                    <td className="px-4 py-3">{inv.dueDate}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${BADGE[status]}`}>{status}</span></td>
                    <td className="px-4 py-3 text-right">{money(inv.total)}</td>
                    <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                      <button className="text-primary-600 hover:underline" onClick={() => printInvoice(inv, userProfile?.businessName)}>Print</button>
                      {manage && inv.status === 'draft' && <button className="text-blue-600 hover:underline" onClick={() => act(() => markInvoiceSent(inv.id), 'Marked as sent')}>Mark sent</button>}
                      {manage && inv.status === 'sent' && <button className="text-green-600 hover:underline" onClick={() => act(() => markInvoicePaid(inv.id), 'Marked as paid')}>Mark paid</button>}
                      {manage && (inv.status === 'draft' || inv.status === 'sent') && (
                        <button className="text-red-600 hover:underline" onClick={() => window.confirm('Void this invoice?') && act(() => voidInvoice(inv.id), 'Invoice voided')}>Void</button>
                      )}
                      {manage && inv.status === 'draft' && (
                        <button className="text-gray-500 hover:underline" onClick={() => window.confirm('Delete this draft?') && act(() => deleteDraftInvoice(inv.id), 'Draft deleted')}>Delete</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default InvoicesPage;
