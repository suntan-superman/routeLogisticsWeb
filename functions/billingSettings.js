const { HttpsError } = require('firebase-functions/v2/https');
const { requireCapability } = require('./access');
const { validEmail, normalizeEmail, rateLimit } = require('./security');
const { TYPES } = require('./financialReports');

const CADENCES = ['manual', 'daily', 'weekly', 'biweekly', 'monthly'];
const DEFAULTS = Object.freeze({ invoiceCadence: 'manual', reportCadence: 'manual', grouping: 'per_visit', paymentTermsDays: 14,
  managementApprovalRequired: true, includeApprovedPhotos: false, reportRecipients: [], reportTypes: ['daily_operations','revenue_invoicing'], holidays: [] });
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
function cleanBillingSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpsError('invalid-argument', 'Choose billing and reporting settings.');
  if (!CADENCES.includes(input.invoiceCadence) || !CADENCES.includes(input.reportCadence)) throw new HttpsError('invalid-argument', 'Choose a supported schedule.');
  if (!['per_visit','customer'].includes(input.grouping)) throw new HttpsError('invalid-argument', 'Choose a supported invoice grouping.');
  if (!Number.isInteger(input.paymentTermsDays) || input.paymentTermsDays < 0 || input.paymentTermsDays > 365) throw new HttpsError('invalid-argument', 'Payment terms must be 0–365 days.');
  if (input.managementApprovalRequired !== true || typeof input.includeApprovedPhotos !== 'boolean') throw new HttpsError('invalid-argument', 'Management approval must remain enabled.');
  if (!Array.isArray(input.reportRecipients) || input.reportRecipients.length > 10) throw new HttpsError('invalid-argument', 'Choose at most ten report recipients.');
  if (!Array.isArray(input.reportTypes) || !input.reportTypes.length || input.reportTypes.length > TYPES.length || input.reportTypes.some(type => !TYPES.includes(type))) throw new HttpsError('invalid-argument', 'Choose one or more supported management reports.');
  const reportRecipients = [...new Set(input.reportRecipients.map(normalizeEmail))];
  if (reportRecipients.some(email => !validEmail(email))) throw new HttpsError('invalid-argument', 'Enter valid report recipient email addresses.');
  if (!Array.isArray(input.holidays) || input.holidays.length > 50 || input.holidays.some(value => !date(value))) throw new HttpsError('invalid-argument', 'Choose up to 50 valid closed dates.');
  const invoiceAnchorDate = input.invoiceAnchorDate || '', reportAnchorDate = input.reportAnchorDate || '';
  if ((input.invoiceCadence !== 'manual' && !date(invoiceAnchorDate)) || (input.reportCadence !== 'manual' && !date(reportAnchorDate))) throw new HttpsError('invalid-argument', 'Choose an anchor date for each active schedule.');
  return { invoiceCadence: input.invoiceCadence, reportCadence: input.reportCadence, grouping: input.grouping, paymentTermsDays: input.paymentTermsDays,
    managementApprovalRequired: true, includeApprovedPhotos: input.includeApprovedPhotos, reportRecipients, reportTypes: [...new Set(input.reportTypes)], holidays: [...new Set(input.holidays)].sort(),
    invoiceAnchorDate: input.invoiceCadence === 'manual' ? '' : invoiceAnchorDate, reportAnchorDate: input.reportCadence === 'manual' ? '' : reportAnchorDate };
}
function billingSettingsHandler(db, { now = () => Date.now() } = {}) {
  return async request => {
    const action = request.data?.action;
    if (!['read','update','history'].includes(action)) throw new HttpsError('invalid-argument', 'Choose a supported settings action.');
    const scope = await requireCapability(db, request, action === 'update' ? 'company.edit' : 'reports.financial');
    if (!scope.companyId) throw new HttpsError('failed-precondition', 'Create a company before configuring scheduled billing.');
    await rateLimit(db, 'billing-settings', scope.uid, 30);
    const ref = db.doc(`companies/${scope.companyId}`);
    if (action === 'history') {
      const rows = await db.collection('rlBillingRuns').where('companyId', '==', scope.companyId).orderBy('startedAt', 'desc').limit(50).get();
      return { runs: rows.docs.map(row => ({ id: row.id, kind: row.get('kind'), date: row.get('date'), status: row.get('status'),
        attempts: row.get('attempts') || 0, startedAt: row.get('startedAt'), completedAt: row.get('completedAt') || null,
        failureCode: row.get('failureCode') || null, result: row.get('result') || null })), hasMore: rows.size === 50 };
    }
    if (action === 'read') {
      const company = await ref.get();
      return { settings: { ...DEFAULTS, ...(company.get('billingSettings') || {}) }, timeZone: company.get('timeZone') || 'America/Los_Angeles' };
    }
    const settings = cleanBillingSettings(request.data.settings);
    return db.runTransaction(async tx => {
      const company = await tx.get(ref);
      if (!company.exists || company.get('ownerId') !== scope.uid || company.get('isActive') === false) throw new HttpsError('permission-denied', 'Only the active company owner can change billing settings.');
      const [owner, team] = await Promise.all([tx.get(db.doc(`users/${scope.uid}`)), tx.get(db.collection('teamMembers').where('companyId', '==', scope.companyId))]);
      const recipients = new Set([normalizeEmail(request.auth.token.email), normalizeEmail(owner.get('email'))]);
      for (const row of team.docs) if (row.get('status') === 'active' && ['owner','admin','manager'].includes(row.get('role'))) recipients.add(normalizeEmail(row.get('email')));
      if (settings.reportRecipients.some(email => !recipients.has(email))) throw new HttpsError('permission-denied', 'Management reports can only be sent to the current owner or active management members.');
      const previous = company.get('billingSettings') || {}, timestamp = new Date(now());
      const invoiceChanged = previous.invoiceCadence !== settings.invoiceCadence || previous.invoiceAnchorDate !== settings.invoiceAnchorDate;
      const reportChanged = previous.reportCadence !== settings.reportCadence || previous.reportAnchorDate !== settings.reportAnchorDate;
      const next = { ...settings, reportRecipientOwnerEmail: normalizeEmail(request.auth.token.email || owner.get('email')),
        reportRecipientOwnerUid: scope.uid, invoiceActivatedAt: invoiceChanged && settings.invoiceCadence !== 'manual' ? timestamp : previous.invoiceActivatedAt || null,
        reportActivatedAt: reportChanged && settings.reportCadence !== 'manual' ? timestamp : previous.reportActivatedAt || null,
        lastInvoiceRunDate: invoiceChanged ? null : previous.lastInvoiceRunDate || null,
        lastReportRunDate: reportChanged ? null : previous.lastReportRunDate || null };
      tx.update(ref, { billingSettings: next, billingSettingsUpdatedAt: timestamp });
      tx.create(db.collection('rlAudit').doc(), { action: 'billing.settings.update', companyId: scope.companyId, actorId: scope.uid,
        before: { invoiceCadence: previous.invoiceCadence || 'manual', reportCadence: previous.reportCadence || 'manual' },
        after: { invoiceCadence: settings.invoiceCadence, reportCadence: settings.reportCadence, grouping: settings.grouping }, createdAt: timestamp });
      return { settings: next, timeZone: company.get('timeZone') || 'America/Los_Angeles' };
    });
  };
}
module.exports = { DEFAULTS, CADENCES, cleanBillingSettings, billingSettingsHandler };
