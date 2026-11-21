const { HttpsError } = require('firebase-functions/v2/https');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { requireCapability } = require('./access');
const { rateLimit } = require('./security');

const TYPES = ['daily_operations', 'technician_productivity', 'revenue_invoicing', 'payments_received', 'ar_aging', 'customer_activity', 'service_performance', 'unbilled_work'];
const LABELS = { daily_operations: 'Daily Operations', technician_productivity: 'Technician Productivity', revenue_invoicing: 'Revenue and Invoicing', payments_received: 'Payments Received', ar_aging: 'Accounts Receivable Aging', customer_activity: 'Customer Activity', service_performance: 'Service Performance', unbilled_work: 'Unbilled Completed Work' };
const money = cents => `$${(cents / 100).toFixed(2)}`;
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function localDay(value, zone) {
  const date = value?.toDate?.() || (value instanceof Date ? value : new Date(value));
  if (!Number.isFinite(date.valueOf())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const clean = value => String(value || '').replace(/[\r\n\t]+/g, ' ').slice(0, 300);
const inRange = (dayValue, start, end) => dayValue >= start && dayValue <= end;
const jobDay = job => typeof job.date === 'string' ? job.date.slice(0, 10) : '';
const billable = job => job.status === 'completed' && job.billable !== false && job.isBillable !== false && job.nonBillable !== true && !['estimate','estimate-visit','estimate_visit'].includes(String(job.appointmentKind || job.visitType || '').toLowerCase());
const sum = (rows, key) => rows.reduce((value, row) => value + (Number.isSafeInteger(row[key]) ? row[key] : 0), 0);
function reportData(type, { jobs, invoices, ledger, start, end, zone, filters = {} }) {
  if (!TYPES.includes(type)) throw new HttpsError('invalid-argument', 'Choose a supported report.');
  const matches = row => (!filters.customerId || row.customerId === filters.customerId) && (!filters.technicianId || row.assignedTo === filters.technicianId)
    && (!filters.service || String(row.serviceType || '').toLowerCase().includes(filters.service.toLowerCase())) && (!filters.status || row.status === filters.status);
  const jobsById = new Map(jobs.map(row => [row.id, row]));
  const invoiceFilter = row => (!filters.customerId || row.customerId === filters.customerId)
    && (!filters.status || row.status === filters.status)
    && (!filters.technicianId && !filters.service || (row.jobIds || [row.jobId]).some(id => {
      const job = jobsById.get(id);
      return job && (!filters.technicianId || job.assignedTo === filters.technicianId)
        && (!filters.service || String(job.serviceType || '').toLowerCase().includes(filters.service.toLowerCase()));
    }));
  const work = jobs.filter(row => inRange(jobDay(row), start, end) && matches(row));
  const current = invoices.filter(row => row.financialVersion === 2 && row.issuedSnapshot &&
    (row.status !== 'void' || localDay(row.voidedAt, zone) > end) && invoiceFilter(row));
  const issued = current.filter(row => inRange(row.issuedSnapshot.issueDate, start, end));
  const scopedInvoiceIds = new Set(current.map(row => row.id));
  const activity = ledger.filter(row => scopedInvoiceIds.has(row.invoiceId) && inRange(localDay(row.recordedAt, zone), start, end));
  const appliedThrough = (invoiceId, kind) => ledger.filter(entry => entry.invoiceId === invoiceId && localDay(entry.recordedAt, zone) <= end &&
    (entry.kind === kind || entry.kind === 'reverse' && entry.reversesKind === kind)).reduce((total, entry) => total + entry.amountCents, 0);
  let rows = [], totals = {};
  if (type === 'daily_operations') {
    const days = new Map(); for (const job of work) { const key = jobDay(job), row = days.get(key) || { date: key, scheduled: 0, completed: 0, inProgress: 0, cancelled: 0 }; row[job.status === 'completed' ? 'completed' : job.status === 'in-progress' ? 'inProgress' : job.status === 'cancelled' ? 'cancelled' : 'scheduled']++; days.set(key, row); }
    rows = [...days.values()].sort((a,b) => a.date.localeCompare(b.date)); totals = { jobs: work.length, completed: work.filter(row => row.status === 'completed').length };
  } else if (type === 'technician_productivity') {
    const techs = new Map(); for (const job of work) { const key = job.assignedTo || 'unassigned', row = techs.get(key) || { technicianId: key, jobs: 0, completed: 0, durationMinutes: 0 }; row.jobs++; if (job.status === 'completed') { row.completed++; row.durationMinutes += Math.max(0, Math.round(Number(job.duration || 0) * 60)); } techs.set(key, row); }
    rows = [...techs.values()].sort((a,b) => b.completed - a.completed); totals = { jobs: work.length, completed: work.filter(row => row.status === 'completed').length };
  } else if (type === 'revenue_invoicing') {
    rows = issued.map(row => ({ invoiceNumber: row.invoiceNumber, customerName: clean(row.customerName), issueDate: row.issuedSnapshot.issueDate,
      invoicedCents: row.issuedSnapshot.totalCents, collectedThroughEndCents: appliedThrough(row.id, 'record'),
      outstandingAtEndCents: Math.max(0, row.issuedSnapshot.totalCents - appliedThrough(row.id, 'record') - appliedThrough(row.id, 'credit')) }));
    totals = { invoicedCents: sum(rows, 'invoicedCents'), collectedThroughEndCents: sum(rows, 'collectedThroughEndCents'), outstandingAtEndCents: sum(rows, 'outstandingAtEndCents') };
  } else if (type === 'payments_received') {
    rows = activity.filter(row => row.kind === 'record' || row.kind === 'reverse' && row.reversesKind === 'record').map(row => ({ date: localDay(row.recordedAt, zone), invoiceId: row.invoiceId, type: row.kind, amountCents: row.amountCents }));
    totals = { collectedCents: sum(rows, 'amountCents') };
  } else if (type === 'ar_aging') {
    rows = current.filter(row => row.issuedSnapshot.issueDate <= end).map(row => {
      const applied = appliedThrough(row.id, 'record') + appliedThrough(row.id, 'credit');
      const outstandingCents = Math.max(0, row.issuedSnapshot.totalCents - applied);
      const daysLate = Math.max(0, Math.floor((Date.parse(end) - Date.parse(row.dueDate)) / 86400000));
      return { invoiceNumber: row.invoiceNumber, customerName: clean(row.customerName), dueDate: row.dueDate, daysLate, bucket: daysLate === 0 ? 'current' : daysLate <= 30 ? '1-30' : daysLate <= 60 ? '31-60' : daysLate <= 90 ? '61-90' : '90+', outstandingCents };
    }).filter(row => row.outstandingCents > 0); totals = { outstandingCents: sum(rows, 'outstandingCents') };
  } else if (type === 'customer_activity') {
    const customers = new Map(); for (const job of work) { const key = job.customerId || 'unknown', row = customers.get(key) || { customerId: key, customerName: clean(job.customerName), visits: 0, completed: 0 }; row.visits++; if (job.status === 'completed') row.completed++; customers.set(key, row); }
    rows = [...customers.values()].sort((a,b) => b.visits - a.visits); totals = { customers: rows.length, visits: work.length };
  } else if (type === 'service_performance') {
    const services = new Map(); for (const job of work) { const key = clean(job.serviceType || 'Unspecified'), row = services.get(key) || { service: key, visits: 0, completed: 0 }; row.visits++; if (job.status === 'completed') row.completed++; services.set(key, row); }
    rows = [...services.values()].sort((a,b) => b.visits - a.visits); totals = { services: rows.length, visits: work.length };
  } else {
    const invoicedJobs = new Set(invoices.filter(row => row.status !== 'void' && row.jobId).map(row => row.jobId));
    rows = work.filter(job => billable(job) && !invoicedJobs.has(job.id)).map(job => ({ jobId: job.id, date: jobDay(job), customerName: clean(job.customerName), service: clean(job.serviceType), priceCents: Number.isFinite(job.totalCost) ? Math.round(job.totalCost * 100) : null }));
    totals = { jobs: rows.length, knownPriceCents: sum(rows, 'priceCents') };
  }
  return { type, title: LABELS[type], startDate: start, endDate: end, timeZone: zone, rows, totals, generatedAt: new Date().toISOString(), legacyFinancialRecordsExcluded: true };
}
function csvFor(report) {
  const keys = Object.keys(report.rows[0] || {});
  const cell = value => { const safe = String(value ?? ''); const escaped = /^[=+@-]/.test(safe) ? `'${safe}` : safe; return `"${escaped.replaceAll('"', '""')}"`; };
  return [keys.join(','), ...report.rows.map(row => keys.map(key => cell(row[key])).join(','))].join('\r\n');
}
async function pdfFor(report, companyName, logo = null) {
  const pdf = await PDFDocument.create(), regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), green = rgb(0.04, 0.35, 0.26);
  let page = pdf.addPage([612,792]), y = 740;
  if (logo?.bytes) {
    const image = logo.contentType === 'image/png' ? await pdf.embedPng(Uint8Array.from(logo.bytes)) : await pdf.embedJpg(Uint8Array.from(logo.bytes));
    const scaled = image.scale(Math.min(100 / image.width, 55 / image.height, 1));
    page.drawImage(image, { x: 465, y: 730, width: scaled.width, height: scaled.height });
    y = 715;
  }
  const next = () => { page = pdf.addPage([612,792]); y = 740; };
  const draw = (value, strong = false) => {
    const font = strong ? bold : regular, size = strong ? 11 : 9;
    const safe = String(value ?? '').replace(/[\r\n\t]+/g, ' ').normalize('NFKD').replace(/[^\x20-\x7e]/g, '?');
    let line = '';
    const flush = () => { if (y < 55) next(); page.drawText(line, { x: 45, y, size, font, color: strong ? green : rgb(0.12,0.2,0.18) }); y -= size + 6; line = ''; };
    for (const word of safe.split(/\s+/)) {
      if (!word) continue;
      if (font.widthOfTextAtSize((line ? line + ' ' : '') + word, size) <= 520) { line += (line ? ' ' : '') + word; continue; }
      if (line) flush();
      for (const char of word) { if (font.widthOfTextAtSize(line + char, size) > 520 && line) flush(); line += char; }
    }
    if (line) flush();
    if (strong) y -= 8;
  };
  draw(companyName || 'Route Logistics', true); draw(report.title, true); draw(`${report.startDate} to ${report.endDate} · ${report.timeZone}`); y -= 12;
  for (const [key, value] of Object.entries(report.totals)) draw(`${key}: ${key.endsWith('Cents') ? money(value) : value}`, true);
  y -= 15; for (const row of report.rows) draw(Object.entries(row).map(([key, value]) => `${key}: ${key.endsWith('Cents') && value !== null ? money(value) : value}`).join('  |  '));
  pdf.getPages().forEach((sheet, i) => sheet.drawText(`Page ${i+1} of ${pdf.getPageCount()}`, { x: 500, y: 25, size: 9, font: regular }));
  return Buffer.from(await pdf.save());
}
async function allScoped(query, limit = 10000) {
  let cursor = null; const docs = [];
  while (true) {
    let page = query.orderBy('__name__').limit(250);
    if (cursor) page = page.startAfter(cursor);
    const snap = await page.get(); docs.push(...snap.docs);
    if (docs.length > limit) throw new HttpsError('resource-exhausted', 'This report exceeds 10,000 source records. Narrow the period before relying on totals.');
    if (snap.size < 250) return docs;
    cursor = snap.docs[snap.docs.length - 1];
  }
}
function financialReportHandler(db, { trustedSystem = false } = {}) {
  return async request => {
    const scope = await requireCapability(db, request, 'reports.financial'), data = request.data || {};
    if (!trustedSystem) await rateLimit(db, 'financial-report', scope.uid, 30);
    if (!day(data.startDate) || !day(data.endDate) || data.startDate > data.endDate || Date.parse(data.endDate) - Date.parse(data.startDate) > 366 * 86400000) throw new HttpsError('invalid-argument', 'Choose a date range of at most 366 days.');
    if (!TYPES.includes(data.type) || !['data','csv','pdf',undefined].includes(data.format)) throw new HttpsError('invalid-argument', 'Choose a supported report and format.');
    const field = scope.companyId ? 'companyId' : 'userId', value = scope.companyId || scope.uid;
    const [company, jobs, invoices, ledger] = await Promise.all([
      scope.companyId ? db.doc(`companies/${scope.companyId}`).get() : null,
      allScoped(db.collection('jobs').where(field, '==', value)),
      allScoped(db.collection('invoices').where(field, '==', value)),
      allScoped(db.collection('rlFinancialLedger').where('scopeId', '==', value)),
    ]);
    const zone = company?.get('timeZone') || 'America/Los_Angeles';
    const filters = Object.fromEntries(['customerId','technicianId','service','status'].filter(key => typeof data.filters?.[key] === 'string' && data.filters[key].length <= 100).map(key => [key, data.filters[key]]));
    const report = reportData(data.type, { jobs: jobs.map(row => ({ id: row.id, ...row.data() })), invoices: invoices.map(row => ({ id: row.id, ...row.data() })), ledger: ledger.map(row => ({ id: row.id, ...row.data() })), start: data.startDate, end: data.endDate, zone, filters });
    if (data.format === 'csv') return { fileName: `${data.type}-${data.startDate}.csv`, contentType: 'text/csv', content: csvFor(report) };
    if (data.format === 'pdf') {
      const logo = scope.companyId ? await require('./companyLogo').loadLogo(company?.get('logo'), scope.companyId) : null;
      return { fileName: `${data.type}-${data.startDate}.pdf`, contentType: 'application/pdf', base64: (await pdfFor(report, company?.get('name'), logo)).toString('base64') };
    }
    return report;
  };
}
module.exports = { TYPES, LABELS, localDay, reportData, csvFor, pdfFor, allScoped, financialReportHandler };
