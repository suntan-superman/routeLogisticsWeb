const ESTIMATE_OUTCOMES = Object.freeze({
  estimate_pending: 'Estimate pending',
  quote_needed: 'Visit completed — quote needed',
  quote_prepared: 'Quote prepared',
  customer_declined: 'Customer declined',
  cancelled_no_access: 'Canceled / no access',
});
const isEstimateVisit = job => job?.appointmentKind === 'estimate_visit';
const estimateOutcome = job => Object.hasOwn(ESTIMATE_OUTCOMES, job?.estimateOutcome) ? job.estimateOutcome : 'estimate_pending';
const estimateOutcomeLabel = job => ESTIMATE_OUTCOMES[estimateOutcome(job)];
function completionEstimateOutcome(job, selected) {
  if (!isEstimateVisit(job)) return undefined;
  if (selected && selected !== 'estimate_pending' && Object.hasOwn(ESTIMATE_OUTCOMES, selected)) return selected;
  const current = estimateOutcome(job);
  return current === 'estimate_pending' ? 'quote_needed' : current;
}
module.exports = { ESTIMATE_OUTCOMES, isEstimateVisit, estimateOutcome, estimateOutcomeLabel, completionEstimateOutcome };
