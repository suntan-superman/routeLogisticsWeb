const { randomUUID } = require('node:crypto');
const { getStorage } = require('firebase-admin/storage');
const { hash } = require('./security');
const { invoiceHandlers } = require('./invoices');
const { financialReportHandler, localDay, allScoped } = require('./financialReports');
const { DEFAULTS } = require('./billingSettings');

const iso = date => date.toISOString().slice(0, 10);
const addDays = (day, amount) => iso(new Date(Date.parse(day + 'T12:00:00Z') + amount * 86400000));
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const weekend = day => [0, 6].includes(new Date(day + 'T12:00:00Z').getUTCDay());
function nextWorkday(day, holidays = []) { let date = day; while (weekend(date) || holidays.includes(date)) date = addDays(date, 1); return date; }
function dueOn(day, cadence, anchor, holidays = []) {
  if (cadence === 'manual' || !anchor || day < anchor) return false;
  const delta = daysBetween(anchor, day);
  if (cadence === 'daily') return !weekend(day) && !holidays.includes(day);
  if (cadence === 'weekly' || cadence === 'biweekly') {
    const period = cadence === 'weekly' ? 7 : 14;
    const cycle = Math.floor(delta / period);
    return [cycle, cycle - 1].some(index => index >= 0 && nextWorkday(addDays(anchor, index * period), holidays) === day);
  }
  if (cadence === 'monthly') {
    const month = new Date(day + 'T12:00:00Z');
    return [0, -1].some(offset => {
      const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1));
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      const scheduled = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2,'0')}-${String(Math.min(Number(anchor.slice(8,10)), last)).padStart(2,'0')}`;
      return scheduled >= anchor && nextWorkday(scheduled, holidays) === day;
    });
  }
  return false;
}
function previousWorkday(day, holidays = []) {
  let previous = addDays(day, -1);
  while (weekend(previous) || holidays.includes(previous)) previous = addDays(previous, -1);
  return previous;
}
function scheduledDates({ today, activatedAt, lastRunDate, cadence, anchor, holidays, zone = 'UTC' }) {
  const start = lastRunDate ? addDays(lastRunDate, 1) : localDay(activatedAt, zone);
  if (!start || !anchor || cadence === 'manual') return [];
  const dates = [];
  for (let current = start, count = 0; current <= today && count < 366; current = addDays(current, 1), count++) {
    if (dueOn(current, cadence, anchor, holidays)) dates.push(current);
  }
  return dates;
}
const authFor = company => ({ auth: { uid: company.ownerId, token: { companyId: company.id, role: 'owner', email_verified: true } } });
const begunAfter = (value, activation) => {
  const time = value?.toDate?.() || new Date(value);
  const started = activation?.toDate?.() || new Date(activation);
  return Number.isFinite(time.valueOf()) && Number.isFinite(started.valueOf()) && time >= started;
};
async function startRun(db, companyId, kind, date) {
  const ref = db.doc(`rlBillingRuns/${hash(`${companyId}:${kind}:${date}`)}`), lease = randomUUID();
  const acquired = await db.runTransaction(async tx => {
    const row = await tx.get(ref), old = row.data() || {};
    if (old.status === 'complete') return 'complete';
    if (old.status === 'processing' && old.leaseUntil > Date.now()) return 'processing';
    tx.set(ref, { companyId, kind, date, status: 'processing', lease, leaseUntil: Date.now() + 15 * 60_000, attempts: (old.attempts || 0) + 1, startedAt: new Date() }, { merge: true });
    return 'acquired';
  });
  return acquired === 'acquired' ? { ref, lease } : { status: acquired };
}
async function finishRun(run, result, error) {
  if (!run) return;
  await run.ref.update({ status: error ? 'failed' : 'complete', leaseUntil: 0, completedAt: new Date(), result: result || null, failureCode: error ? String(error.code || 'processing-error').slice(0, 60) : null });
}
async function notifyInvoiceDraft(db, company, invoiceId) {
  const recipients = new Set([company.ownerId]);
  const members = await db.collection('teamMembers').where('companyId', '==', company.id).get();
  for (const row of members.docs) if (row.get('status') === 'active' && ['admin','manager'].includes(row.get('role')) && row.get('uid')) recipients.add(row.get('uid'));
  for (const uid of recipients) {
    const ref = db.doc(`rlNotifications/${hash(`invoice-draft:${invoiceId}:${uid}`)}`);
    try { await ref.create({ userId: uid, companyId: company.id, title: 'Invoice draft awaits review', body: 'A completed visit has a draft invoice ready for management review.', invoiceId, read: false, createdAt: new Date() }); }
    catch (error) { if (error.code !== 6 && error.code !== 'already-exists') throw error; }
  }
}
async function generateInvoices(db, company, settings, date, run) {
  const cutoff = previousWorkday(date, settings.holidays || []), activation = settings.invoiceActivatedAt;
  const jobs = await allScoped(db.collection('jobs').where('companyId', '==', company.id));
  const eligible = jobs.filter(row => row.get('status') === 'completed' && begunAfter(row.get('completedAt'), activation)
    && localDay(row.get('completedAt'), company.timeZone || 'America/Los_Angeles') <= cutoff
    && row.get('billable') !== false && row.get('isBillable') !== false && row.get('nonBillable') !== true
    && !['estimate','estimate-visit','estimate_visit'].includes(String(row.get('appointmentKind') || row.get('visitType') || '').toLowerCase()));
  if (eligible.length > 200) throw Object.assign(new Error('Too many completed visits for one billing run.'), { code: 'resource-exhausted' });
  const handler = invoiceHandlers(db, { trustedSystem: true }).handle, auth = authFor(company), created = [], skipped = [];
  const groups = settings.grouping === 'customer'
    ? [...Map.groupBy(eligible, row => row.get('customerId')).values()].flatMap(rows => Array.from({ length: Math.ceil(rows.length / 20) }, (_, index) => rows.slice(index * 20, index * 20 + 20)))
    : eligible.map(row => [row]);
  for (const group of groups) {
    const ids = group.map(row => row.id).sort();
    try {
      const grouped = ids.length > 1;
      const preview = await handler({ ...auth, data: grouped ? { action: 'previewGroup', jobIds: ids } : { action: 'preview', jobId: ids[0] } });
      if (preview.existing || preview.existingInvoice) { skipped.push(ids); continue; }
      const operationId = hash(`${run.ref.id}:${ids.join(':')}`).slice(0, 48);
      const result = await handler({ ...auth, data: grouped ? { action: 'createGroup', jobIds: ids, sourceFingerprint: preview.sourceFingerprint, dueInDays: settings.paymentTermsDays, operationId }
        : { action: 'create', jobId: ids[0], sourceFingerprint: preview.sourceFingerprint, dueInDays: settings.paymentTermsDays, operationId } });
      if (result.existing) skipped.push(ids);
      else { created.push(result.invoiceId); await notifyInvoiceDraft(db, company, result.invoiceId); }
    } catch (error) {
      if (['failed-precondition','aborted'].includes(error.code)) { skipped.push({ jobIds: ids, reason: error.code }); continue; }
      throw error;
    }
  }
  return { created, skipped, cutoff };
}
async function generateReports(db, company, settings, date, run) {
  const endDate = previousWorkday(date, settings.holidays || []), cadence = settings.reportCadence;
  const period = cadence === 'daily' ? 1 : cadence === 'weekly' ? 7 : cadence === 'biweekly' ? 14 : 31;
  const startDate = addDays(endDate, -(period - 1)), types = settings.reportTypes || ['daily_operations','revenue_invoicing'];
  const reports = [];
  for (const type of types) {
    const report = await financialReportHandler(db, { trustedSystem: true })({ ...authFor(company), data: { type, startDate, endDate, format: 'pdf' } });
    const bytes = Buffer.from(report.base64, 'base64'), path = `rlManagementReports/${company.id}/${run.ref.id}/${type}.pdf`;
    if (bytes.length > 8 * 1024 * 1024) throw Object.assign(new Error('Management report PDF is too large.'), { code: 'resource-exhausted' });
    const file = getStorage().bucket().file(path), [exists] = await file.exists();
    if (!exists) await file.save(bytes, { contentType: 'application/pdf', resumable: false, metadata: { metadata: { companyId: company.id, runId: run.ref.id } } });
    reports.push({ type, path });
  }
  for (const recipient of settings.reportRecipients || []) for (const report of reports) {
    const id = `management_report_${hash(`${run.ref.id}:${report.type}:${recipient}`)}`;
    try { await db.doc(`rlMail/${id}`).create({ companyId: company.id, reportRunId: run.ref.id, reportPdfPath: report.path, to: recipient,
      subject: `${company.name || 'Route Logistics'} — ${report.type.replaceAll('_',' ')} report`,
      text: `Management report for ${startDate} through ${endDate}. The PDF is attached.`,
      status: 'queued', attempts: 0, availableAt: Date.now(), createdAt: new Date() }); }
    catch (error) { if (error.code !== 6 && error.code !== 'already-exists') throw error; }
  }
  return { reports: reports.map(row => row.type), recipientCount: (settings.reportRecipients || []).length, startDate, endDate };
}
function createBillingScheduler(db, now = () => new Date()) {
  return async kind => {
    const companies = await allScoped(db.collection('companies').where('isActive', '==', true));
    let failures = 0;
    for (const row of companies) {
      const company = { id: row.id, ...row.data() }, settings = { ...DEFAULTS, ...(row.get('billingSettings') || {}) };
      const cadence = kind === 'invoice' ? settings.invoiceCadence : settings.reportCadence;
      const activation = kind === 'invoice' ? settings.invoiceActivatedAt : settings.reportActivatedAt;
      if (cadence === 'manual' || !activation) continue;
      const zone = company.timeZone || 'America/Los_Angeles', today = localDay(now(), zone);
      const dates = scheduledDates({ today, activatedAt: activation, lastRunDate: kind === 'invoice' ? settings.lastInvoiceRunDate : settings.lastReportRunDate,
        cadence, anchor: kind === 'invoice' ? settings.invoiceAnchorDate : settings.reportAnchorDate, holidays: settings.holidays || [], zone });
      for (const date of dates) {
        const run = await startRun(db, company.id, kind, date);
        if (run.status === 'complete') continue;
        if (run.status === 'processing') break;
        try {
          const result = kind === 'invoice' ? await generateInvoices(db, company, settings, date, run) : await generateReports(db, company, settings, date, run);
          await finishRun(run, result);
          await db.runTransaction(async tx => {
            const latest = await tx.get(row.ref), current = latest.get('billingSettings') || {};
            const prefix = kind === 'invoice' ? 'invoice' : 'report';
            if (current[`${prefix}Cadence`] !== cadence || current[`${prefix}AnchorDate`] !== (kind === 'invoice' ? settings.invoiceAnchorDate : settings.reportAnchorDate)
              || String(current[`${prefix}ActivatedAt`]?.toMillis?.() || current[`${prefix}ActivatedAt`]) !== String(activation?.toMillis?.() || activation)) return;
            tx.update(row.ref, { [`billingSettings.last${prefix[0].toUpperCase() + prefix.slice(1)}RunDate`]: date });
          });
        } catch (error) { await finishRun(run, null, error); failures++; break; }
      }
    }
    if (failures) throw new Error(`${failures} ${kind} billing run(s) failed. Inspect tenant-scoped run history for the failure code.`);
  };
}
module.exports = { dueOn, previousWorkday, scheduledDates, createBillingScheduler, begunAfter };
