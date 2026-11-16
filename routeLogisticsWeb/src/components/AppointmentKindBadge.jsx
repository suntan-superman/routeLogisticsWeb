import { isEstimateVisit, estimateOutcomeLabel } from '../utils/appointmentKind';

export default function AppointmentKindBadge({ job, outcome = false }) {
  if (!isEstimateVisit(job)) return null;
  return <span className="inline-flex flex-wrap items-center gap-2 text-xs"><span className="rounded bg-emerald-100 px-2 py-1 font-semibold text-emerald-900">Estimate Visit</span>{outcome && <span className="text-gray-700">{estimateOutcomeLabel(job)}</span>}</span>;
}
