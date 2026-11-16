const { HttpsError } = require('firebase-functions/v2/https');
const { documentId } = require('./security');
const { appointmentKind, isEstimateVisit } = require('./shared/appointments');
const { propertyFor, lifecycleFor, customerArchived } = require('./shared/customerLifecycle');

const inScope = (row, scope) => row?.exists && (scope.companyId ? row.get('companyId') === scope.companyId : !row.get('companyId') && row.get('userId') === scope.uid);
async function prepareAppointmentLinks(db, tx, scope, { jobId, before = {}, next, create = false, directoryVersion } = {}) {
  if (!next) return null;
  const estimate = isEstimateVisit(next), customerId = next.customerId;
  if ((estimate || next.servicePropertyId || next.inquiryId) && !customerId) throw new HttpsError('invalid-argument', 'Choose a customer and service property for this appointment.');
  if (create && estimate && !next.servicePropertyId) throw new HttpsError('invalid-argument', 'Select or add this customer’s service property before scheduling an estimate.');
  if (!customerId) return null;
  if (!create && !estimate && !next.servicePropertyId && !next.inquiryId && customerId === before.customerId) return null;
  const customer = await tx.get(db.doc(`customers/${documentId(customerId, 'customer')}`));
  if (!inScope(customer, scope)) throw new HttpsError('permission-denied', 'Choose a customer in this workspace.');
  if ((create || customerId !== before.customerId) && (customerArchived(customer.data()) || lifecycleFor(customer.data()) === 'inactive')) throw new HttpsError('failed-precondition', 'Reactivate this customer before scheduling new work. Archived records are preserved.');
  if (directoryVersion && !customer.updateTime.isEqual(directoryVersion)) throw new HttpsError('aborted', 'The selected customer property changed. Refresh the property before saving.');
  let property;
  if (next.servicePropertyId && (create || directoryVersion || next.servicePropertyId !== before.servicePropertyId || customerId !== before.customerId)) {
    property = propertyFor(customer.data(), documentId(next.servicePropertyId, 'service property'));
    if (!property) throw new HttpsError('failed-precondition', 'The selected service property is no longer available. Refresh the customer properties.');
  }
  const inquiry = next.inquiryId ? await tx.get(db.doc(`rlInquiries/${documentId(next.inquiryId, 'inquiry')}`)) : null;
  if (inquiry) {
    if (!inScope(inquiry, scope) || inquiry.get('customerId') !== customerId || inquiry.get('servicePropertyId') !== next.servicePropertyId) throw new HttpsError('permission-denied', 'Choose this customer’s inquiry and its selected service property.');
    if (!estimate) throw new HttpsError('invalid-argument', 'Inquiry appointments must be Estimate visits. Schedule accepted service separately.');
    if (create && ['closed', 'converted'].includes(inquiry.get('status'))) throw new HttpsError('failed-precondition', 'This inquiry is closed or converted. Record a new inquiry for additional work.');
    const previousId = inquiry.get('appointmentId');
    if (create && previousId && previousId !== jobId) {
      const previous = await tx.get(db.doc(`jobs/${documentId(previousId, 'appointment')}`));
      if (previous.exists && !['cancelled', 'canceled'].includes(previous.get('status'))) throw new HttpsError('already-exists', 'This inquiry already has an estimate appointment. Open or reschedule that appointment.', { appointmentId: previous.id });
    }
  }
  // A provider's explicit booking of paid service is an accepted engagement;
  // an estimate appointment (including its completion) never activates a prospect.
  const activate = create && appointmentKind(next) === 'service' && next.billable !== false && lifecycleFor(customer.data()) === 'prospect';
  return { customer, property, inquiry, activate, jobId, next, before, scope, create };
}
function commitAppointmentLinks(db, tx, prepared, updatedAt) {
  if (!prepared) return;
  const { customer, inquiry, activate, jobId, next, before, scope, create } = prepared;
  if (activate) {
    tx.update(customer.ref, { lifecycle: 'active', updatedAt });
    tx.create(db.collection('rlAudit').doc(), { action: 'customer.lifecycle', companyId: scope.companyId || null, actorId: scope.uid, customerId: customer.id, from: 'prospect', to: 'active', reason: 'accepted-service-engagement', jobId, createdAt: updatedAt });
  }
  if (!inquiry || !inquiry.exists || ['closed', 'converted'].includes(inquiry.get('status'))) return;
  if (!create && next.status === before.status && next.estimateOutcome === before.estimateOutcome) return;
  const status = next.status === 'completed' ? 'estimate_completed' : ['cancelled', 'canceled'].includes(next.status) ? 'contacted' : 'estimate_scheduled';
  if (!create && inquiry.get('appointmentId') !== jobId) return;
  if (inquiry.get('status') === status && inquiry.get('estimateOutcome') === next.estimateOutcome && inquiry.get('appointmentId') === jobId) return;
  tx.update(inquiry.ref, { status, appointmentId: jobId, estimateOutcome: next.estimateOutcome || 'estimate_pending', revision: (inquiry.get('revision') || 0) + 1, updatedAt: new Date(updatedAt) });
  tx.create(db.collection('rlAudit').doc(), { action: 'inquiry.appointment', companyId: scope.companyId || null, actorId: scope.uid, customerId: customer.id, inquiryId: inquiry.id, jobId, status, estimateOutcome: next.estimateOutcome || 'estimate_pending', createdAt: updatedAt });
}

module.exports = { prepareAppointmentLinks, commitAppointmentLinks };
