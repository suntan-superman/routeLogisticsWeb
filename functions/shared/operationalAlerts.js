const { propertyFor } = require('./customerLifecycle');
const { createHash } = require('node:crypto');

const CATEGORIES = ['safety', 'access', 'customer-instructions', 'other'];
const SEVERITIES = ['informational', 'important', 'critical'];
const text = (value, maximum, label) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`Enter a valid ${label} (${maximum} characters maximum).`);
  return value.trim();
};
function validateAlert(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter alert details.');
  const title = text(input.title, 120, 'alert title');
  const description = text(input.description, 2000, 'alert description');
  if (!CATEGORIES.includes(input.category)) throw new Error('Choose an alert category.');
  if (!SEVERITIES.includes(input.severity)) throw new Error('Choose an alert severity.');
  if (typeof input.active !== 'boolean') throw new Error('Choose whether the alert is active.');
  return { title, description, category: input.category, severity: input.severity, active: input.active };
}
const propertyIdForJob = job => job?.servicePropertyId || job?.serviceProperty?.propertyId || null;
const activeAlerts = rows => (Array.isArray(rows) ? rows : []).filter(row => row && row.active === true && typeof row.id === 'string' && Number.isInteger(row.version) && row.version > 0);
function alertsForJob(job, customer) {
  if (!job) return [];
  if (['completed', 'cancelled', 'canceled'].includes(job.status)) return Array.isArray(job.operationalAlertSnapshot) ? job.operationalAlertSnapshot : [];
  const propertyId = propertyIdForJob(job);
  const property = propertyId && customer ? propertyFor(customer, propertyId) : null;
  return [
    ...activeAlerts(property?.alerts).map(row => ({ ...row, source: 'property', propertyId, customerId: job.customerId })),
    ...activeAlerts(job.operationalAlerts).map(row => ({ ...row, source: 'job', jobId: job.id })),
  ].sort((a, b) => SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity) || a.title.localeCompare(b.title));
}
const alertIdentity = alert => `${alert.source}:${alert.id}:${alert.version}`;
const acknowledgmentId = (companyId, jobId, uid, alert) => createHash('sha256').update(`${companyId}:${jobId}:${uid}:${alertIdentity(alert)}`).digest('hex');
async function missingCriticalAcknowledgments(db, tx, jobId, job, companyId, uid) {
  const propertyId = propertyIdForJob(job);
  const customer = propertyId && job.customerId ? await tx.get(db.doc(`customers/${job.customerId}`)) : null;
  if (customer?.exists && customer.get('companyId') !== companyId) throw new Error('The service property is not in this company.');
  const alerts = alertsForJob({ id: jobId, ...job }, customer?.data()).filter(row => row.severity === 'critical');
  const missing = [];
  for (const alert of alerts) {
    const acknowledgment = await tx.get(db.doc(`rlJobAlertAcknowledgments/${acknowledgmentId(companyId, jobId, uid, alert)}`));
    if (!acknowledgment.exists) missing.push(alert);
  }
  return missing;
}
module.exports = { CATEGORIES, SEVERITIES, validateAlert, propertyIdForJob, alertsForJob, alertIdentity, acknowledgmentId, missingCriticalAcknowledgments, activeAlerts };
