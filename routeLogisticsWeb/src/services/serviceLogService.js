import { collection, getDocs, addDoc, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { scopeWhere, tenantFields } from './tenancy';

const ok = (data = {}) => ({ success: true, ...data });
const fail = (error) => {
  console.error(error);
  return { success: false, error: error.message || String(error) };
};

export const UNITS = ['oz', 'fl oz', 'gal', 'lb', 'g', 'mL', 'L', 'stations', 'sq ft'];

// Pesticide application record. Fields follow common state record-keeping requirements
// (product, EPA reg. no., amount, target pest, site, applicator and license, date).
export async function addServiceLog(log) {
  try {
    const required = ['product', 'amount', 'unit', 'targetPest', 'applicatorName'];
    const missing = required.filter((k) => !String(log[k] ?? '').trim());
    if (missing.length) throw new Error(`Missing required fields: ${missing.join(', ')}`);
    const amount = Number(log.amount);
    if (!(amount > 0)) throw new Error('Amount must be greater than zero');
    const ref = await addDoc(collection(db, 'serviceLogs'), {
      ...tenantFields(),
      jobId: log.jobId || null,
      customerId: log.customerId || null,
      customerName: log.customerName || '',
      siteAddress: log.siteAddress || '',
      applicationDate: log.applicationDate || new Date().toISOString().slice(0, 10),
      product: log.product.trim(),
      epaRegNo: (log.epaRegNo || '').trim(),
      activeIngredient: (log.activeIngredient || '').trim(),
      amount,
      unit: log.unit,
      targetPest: log.targetPest.trim(),
      areaTreated: (log.areaTreated || '').trim(),
      method: log.method || '',
      applicatorName: log.applicatorName.trim(),
      applicatorLicense: (log.applicatorLicense || '').trim(),
      notes: log.notes || '',
      createdAt: serverTimestamp(),
    });
    return ok({ id: ref.id });
  } catch (error) {
    return fail(error);
  }
}

export async function listServiceLogsForJob(jobId) {
  try {
    const snap = await getDocs(query(collection(db, 'serviceLogs'), scopeWhere(), where('jobId', '==', jobId), limit(100)));
    const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return ok({ logs: logs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)) });
  } catch (error) {
    return fail(error);
  }
}

export async function listServiceLogs(startDate, endDate, max = 1000) {
  try {
    const constraints = [scopeWhere()];
    if (startDate) constraints.push(where('applicationDate', '>=', startDate));
    if (endDate) constraints.push(where('applicationDate', '<=', endDate));
    const snap = await getDocs(query(collection(db, 'serviceLogs'), ...constraints, orderBy('applicationDate', 'desc'), limit(max)));
    return ok({ logs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (error) {
    return fail(error);
  }
}

const csvCell = (v) => {
  let s = String(v ?? '');
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export function logsToCsv(logs) {
  const cols = [
    ['Date', 'applicationDate'], ['Customer', 'customerName'], ['Site', 'siteAddress'], ['Product', 'product'],
    ['EPA Reg No', 'epaRegNo'], ['Active Ingredient', 'activeIngredient'], ['Amount', 'amount'], ['Unit', 'unit'],
    ['Target Pest', 'targetPest'], ['Area Treated', 'areaTreated'], ['Method', 'method'],
    ['Applicator', 'applicatorName'], ['License', 'applicatorLicense'], ['Notes', 'notes'],
  ];
  return [cols.map(([h]) => csvCell(h)).join(','), ...logs.map((l) => cols.map(([, k]) => csvCell(l[k])).join(','))].join('\r\n');
}
