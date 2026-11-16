import { readWorkspace } from '../services/workspaceApi';
import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';
export default function OperationsReportsPage() {
  const query = useWorkspaceQuery(['operations-report', 500], () => readWorkspace('jobs', { limit: 500 }));
  const jobs = query.data?.jobs || [], message = query.error?.message || (!query.data ? 'Loading operations…' : query.data.hasMore ? 'Showing the first 500 jobs. Refine your operational review in Dispatch by service date.' : `${jobs.length} jobs in this report.`);
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Operational reports</h1><p>{message}</p><div className="grid gap-3 sm:grid-cols-3">{['scheduled','en-route','in-progress','completed','cancelled'].map(status => <div className="rounded border bg-white p-5" key={status}><h2>{status}</h2><strong className="text-2xl">{query.data ? jobs.filter(job => job.status === status).length : '—'}</strong></div>)}</div><table className="w-full bg-white text-left"><thead><tr><th>Date</th><th>Service</th><th>Customer</th><th>Status</th></tr></thead><tbody>{jobs.map(job => <tr className="border-t" key={job.id}><td>{job.date}</td><td>{job.serviceType}</td><td>{job.customerName}</td><td>{job.status}</td></tr>)}</tbody></table></div>;
}
