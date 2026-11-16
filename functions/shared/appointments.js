const { HttpsError } = require('firebase-functions/v2/https');

const ESTIMATE_OUTCOMES = ['estimate_pending', 'quote_needed', 'quote_prepared', 'customer_declined', 'cancelled_no_access'];
const isEstimateVisit = job => job?.appointmentKind === 'estimate_visit';
function appointmentKind(job = {}) {
  return job.appointmentKind || 'service';
}
function appointmentPatch(input = {}, before = {}, { create = false } = {}) {
  const kind = input.appointmentKind ?? appointmentKind(before);
  if (!['service', 'estimate_visit'].includes(kind)) throw new HttpsError('invalid-argument', 'Choose Service job or Estimate visit.');
  if (!create && input.appointmentKind !== undefined && kind !== appointmentKind(before)) throw new HttpsError('failed-precondition', 'Appointment type cannot change after creation. Cancel this appointment and schedule the correct type.');
  if (kind !== 'estimate_visit') {
    if (input.estimateOutcome !== undefined) throw new HttpsError('invalid-argument', 'Visit outcomes apply only to estimate visits.');
    return create || input.appointmentKind !== undefined ? { appointmentKind: kind } : {};
  }
  if (input.billable === true || ['totalCost', 'estimatedCost'].some(key => input[key] !== undefined && Number(input[key]) !== 0)) throw new HttpsError('failed-precondition', 'Estimate visits are free and nonbillable. Schedule a separately priced service for an assessment fee.');
  const outcome = input.estimateOutcome ?? before.estimateOutcome ?? 'estimate_pending';
  if (!ESTIMATE_OUTCOMES.includes(outcome)) throw new HttpsError('invalid-argument', 'Choose a valid estimate visit outcome.');
  const status = input.status || before.status || 'scheduled';
  return { appointmentKind: kind, billable: false, totalCost: 0, estimatedCost: 0,
    estimateOutcome: status === 'cancelled' ? 'cancelled_no_access' : status === 'completed' && outcome === 'estimate_pending' ? 'quote_needed' : outcome };
}

module.exports = { ESTIMATE_OUTCOMES, isEstimateVisit, appointmentKind, appointmentPatch };
