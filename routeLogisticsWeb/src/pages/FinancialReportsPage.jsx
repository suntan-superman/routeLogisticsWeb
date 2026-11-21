import { useState } from 'react';
import toast from 'react-hot-toast';
import { callWorkspace } from '../services/workspaceApi';
import SelectControl from '../components/SelectControl';

const reports = [
  ['daily_operations', 'Daily Operations'], ['technician_productivity', 'Technician Productivity'],
  ['revenue_invoicing', 'Revenue and Invoicing'], ['payments_received', 'Payments Received'],
  ['ar_aging', 'Accounts Receivable Aging'], ['customer_activity', 'Customer Activity'],
  ['service_performance', 'Service Performance'], ['unbilled_work', 'Unbilled Completed Work'],
];
const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const save = (name, type, value) => { const url = URL.createObjectURL(new Blob([value], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };

export default function FinancialReportsPage() {
  const [type, setType] = useState('daily_operations'), [startDate, setStartDate] = useState(() => iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1))), [endDate, setEndDate] = useState(() => iso(new Date()));
  const [filters, setFilters] = useState({ customerId: '', technicianId: '', service: '', status: '' });
  const [report, setReport] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const query = format => ({ type, startDate, endDate, filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => value.trim())), format });
  const run = async format => {
    setBusy(true); setError('');
    try {
      const result = await callWorkspace('rlFinancialReport', query(format));
      if (format === 'csv') save(result.fileName, 'text/csv;charset=utf-8', result.content);
      else if (format === 'pdf') save(result.fileName, 'application/pdf', Uint8Array.from(atob(result.base64), char => char.charCodeAt(0)));
      else setReport(result);
      if (format !== 'data') toast.success('Report ready');
    } catch (failure) { setError(failure.message || 'Report could not be generated.'); }
    finally { setBusy(false); }
  };
  return <main className="space-y-5 p-6">
    <div><h1 className="text-2xl font-bold">Management reports</h1><p className="text-sm text-gray-600">Issued invoice revenue and money actually collected are shown separately. Legacy test invoices are excluded.</p></div>
    <section className="rounded-xl border bg-white p-5">
      <div className="grid gap-3 md:grid-cols-3">
        <label>Report<SelectControl value={type} onChange={event => { setType(event.target.value); setReport(null); }} className="mt-1 w-full rounded border p-2">{reports.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</SelectControl></label>
        <label>Start date<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        <label>End date<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        <label>Customer ID<input value={filters.customerId} onChange={event => setFilters(previous => ({ ...previous, customerId: event.target.value }))} className="mt-1 w-full rounded border p-2" /></label>
        <label>Technician ID<input value={filters.technicianId} onChange={event => setFilters(previous => ({ ...previous, technicianId: event.target.value }))} className="mt-1 w-full rounded border p-2" /></label>
        <label>Service<input value={filters.service} onChange={event => setFilters(previous => ({ ...previous, service: event.target.value }))} className="mt-1 w-full rounded border p-2" /></label>
        <label>Status<SelectControl value={filters.status} onChange={event => setFilters(previous => ({ ...previous, status: event.target.value }))} className="mt-1 w-full rounded border p-2"><option value="">All statuses</option>{(type === 'revenue_invoicing' || type === 'payments_received' || type === 'ar_aging' ? ['issued','partially_paid','paid'] : ['scheduled','in-progress','completed','cancelled']).map(status => <option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</SelectControl></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => run('data')} className="btn-primary">{busy ? 'Preparing…' : 'Generate report'}</button><button type="button" disabled={busy} onClick={() => run('csv')} className="btn-secondary">Download CSV</button><button type="button" disabled={busy} onClick={() => run('pdf')} className="btn-secondary">Download PDF</button></div>
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    </section>
    {report && <section className="overflow-x-auto rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">{report.title}</h2><p className="text-sm text-gray-600">{report.startDate} to {report.endDate} · {report.timeZone}</p><div className="mt-3 flex flex-wrap gap-4">{Object.entries(report.totals).map(([key, value]) => <span key={key}><strong>{key.replaceAll(/([A-Z])/g, ' $1')}:</strong> {key.endsWith('Cents') ? `$${(value / 100).toFixed(2)}` : value}</span>)}</div>{report.rows.length ? <table className="mt-4 w-full text-left text-sm"><thead><tr>{Object.keys(report.rows[0]).map(key => <th className="border-b p-2" key={key}>{key}</th>)}</tr></thead><tbody>{report.rows.map((row, index) => <tr key={index}>{Object.values(row).map((value, cell) => <td className="border-b p-2" key={cell}>{String(value ?? '—')}</td>)}</tr>)}</tbody></table> : <p className="mt-4 text-gray-600">No authorized records match this report period.</p>}</section>}
  </main>;
}
