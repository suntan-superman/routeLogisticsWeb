import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';
import { callWorkspace } from '../services/workspaceApi';
import AppointmentKindBadge from './AppointmentKindBadge';
import { isEstimateVisit } from '../utils/appointmentKind';

// Jobs and Dispatch read the same authorized work log and visit history.
export default function JobWorkDetails({ job, allowInquiryLink = false }) {
  const workNotes = typeof job.workNotes === 'string' ? job.workNotes : '';
  const instructions = typeof job.dispatchNotes === 'string' ? job.dispatchNotes : typeof job.notes === 'string' ? job.notes : '';
  const visitsQuery = useWorkspaceQuery(['job-visits', job.id], () => callWorkspace('rlJobVisit', { action: 'list', jobId: job.id }));
  const visits = visitsQuery.data?.events || [], error = visitsQuery.error?.message || '';
  return <>
    {isEstimateVisit(job) && <section aria-label="Estimate visit" className="space-y-2"><AppointmentKindBadge job={job} outcome /><p className="text-sm text-gray-600">Nonbillable estimate appointment. Attendance does not approve paid service work.</p><p className="font-medium">{job.estimateId ? 'A quotation is linked to this visit.' : job.status === 'completed' ? 'Visit completed — quote needed.' : 'Prepare the quotation during or after this visit.'}</p><div className="flex flex-wrap gap-4">{allowInquiryLink && <a className="text-sm text-primary-700 underline" href={job.estimateId ? `/estimates?estimate=${encodeURIComponent(job.estimateId)}` : `/estimates?visit=${encodeURIComponent(job.id)}`}>{job.estimateId ? 'View or review estimate' : 'Prepare Estimate'}</a>}{job.inquiryId && (allowInquiryLink ? <a className="text-sm text-primary-700 underline" href={`/customers?inquiry=${encodeURIComponent(job.inquiryId)}`}>Open linked inquiry</a> : <p className="text-xs text-gray-600">Linked to a customer inquiry.</p>)}</div></section>}
    {job.propertyAccessInstructions && <section aria-label="Property access instructions"><h3 className="mb-2 font-semibold">Property access instructions</h3><p className="whitespace-pre-wrap break-words">{job.propertyAccessInstructions}</p></section>}
    {!!instructions && <section aria-label="Job instructions"><h3 className="mb-2 font-semibold">Job instructions</h3><p className="whitespace-pre-wrap break-words">{instructions}</p></section>}
    {!!workNotes && <section aria-label="Work notes"><h3 className="mb-2 font-semibold">Work notes</h3><p className="whitespace-pre-wrap break-words">{workNotes}</p></section>}
    {!!(job.actualWorkDone || job.completionNotes) && <section aria-label="Completed work"><h3 className="mb-2 font-semibold">Completed work</h3>{!!job.actualWorkDone && <p className="whitespace-pre-wrap break-words">{job.actualWorkDone}</p>}{!!job.completionNotes && <p className="whitespace-pre-wrap break-words">{job.completionNotes}</p>}</section>}
    <section aria-label="Visit record">
      <h3 className="mb-2 font-semibold">Visit record</h3>
      <p className="mb-2 text-xs text-gray-600">Manual reports and GPS evidence do not independently verify access to the property.</p>
      {(visitsQuery.isPending ?? visitsQuery.isLoading) && <p role="status">Loading visit records…</p>}
      {error && <div><p role="alert" className="text-red-700">{error}</p><button type="button" className="mt-2 underline" onClick={() => visitsQuery.refetch()}>Retry visit records</button></div>}
      {!(visitsQuery.isPending ?? visitsQuery.isLoading) && !error && !visits.length && <p>No visit events recorded.</p>}
      {visits.map(visit => <article key={visit.id} className="mb-3 rounded border p-3">
        <strong>{{ arrived: 'Arrived', departed: 'Departed', 'access-blocked': 'Couldn’t access property' }[visit.type] || 'Visit event'}</strong>
        <p className="text-sm">{new Date(visit.capturedAt || visit.recordedAt).toLocaleString()} · {{ manual: 'Reported manually', 'manual-gps': 'Reported manually with GPS', 'gps-evidence': 'Estimated from GPS evidence' }[visit.source] || 'Visit report'}</p>
        {Number.isFinite(visit.accuracy) && <p className="text-sm">GPS accuracy: ±{Math.round(visit.accuracy)} m</p>}
        {visit.note && <p className="whitespace-pre-wrap break-words">{visit.note}</p>}
      </article>)}
    </section>
  </>;
}
