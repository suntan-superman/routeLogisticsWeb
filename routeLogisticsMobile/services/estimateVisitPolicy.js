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
const estimateVisitSnapshot = job => {
  if (!isEstimateVisit(job) || !job?.id) return null;
  const address = typeof job.serviceProperty?.address === 'string' && job.serviceProperty.address.trim()
    ? job.serviceProperty.address.trim()
    : [job.address, job.city, job.state, job.zipCode].filter(value => typeof value === 'string' && value.trim()).join(', ');
  return {
    id: job.id,
    snapshot: {
      id: job.id,
      userId: job.userId || null,
      companyId: job.companyId || null,
      customerId: job.customerId || null,
      customerName: job.customerName || 'Customer',
      serviceType: job.serviceType || '',
      serviceCategory: job.serviceCategory || '',
      servicePropertyId: job.servicePropertyId || null,
      serviceProperty: { address },
      inquiryId: job.inquiryId || null,
      appointmentKind: job.appointmentKind,
      billable: job.billable,
      assignedTo: job.assignedTo || null,
      assignedToUid: job.assignedToUid || null,
      status: job.status,
      updatedAt: job.updatedAt || null,
    },
  };
};
const estimateContextFromVisit = visit => {
  const job = visit?.snapshot;
  if (!visit?.id || !job || job.id !== visit.id || !job.customerId || !isEstimateVisit(job) || job.billable !== false) return null;
  return {
    sourceVisitId: visit.id,
    inquiryId: job.inquiryId || null,
    customerId: job.customerId,
    customerName: job.customerName || 'Customer',
    servicePropertyId: job.servicePropertyId || null,
    serviceProperty: { address: job.serviceProperty?.address || '' },
    serviceCategory: job.serviceCategory || '',
    serviceType: job.serviceType || '',
    title: `${job.serviceType || 'Service'} estimate`,
  };
};
function completionEstimateOutcome(job, selected) {
  if (!isEstimateVisit(job)) return undefined;
  if (selected && selected !== 'estimate_pending' && Object.hasOwn(ESTIMATE_OUTCOMES, selected)) return selected;
  const current = estimateOutcome(job);
  return current === 'estimate_pending' ? 'quote_needed' : current;
}
module.exports = { ESTIMATE_OUTCOMES, isEstimateVisit, estimateOutcome, estimateOutcomeLabel, estimateVisitSnapshot, estimateContextFromVisit, completionEstimateOutcome };
