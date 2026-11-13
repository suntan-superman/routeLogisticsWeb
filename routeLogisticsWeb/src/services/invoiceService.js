import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { scopeWhere, tenantFields } from './tenancy';
import { computeTotals, generateInvoiceNumber, addDays } from './invoiceMath';

const today = () => new Date().toISOString().slice(0, 10);
const ok = (data = {}) => ({ success: true, ...data });
const fail = (error) => {
  console.error(error);
  return { success: false, error: error.message || String(error) };
};

export async function listInvoices(max = 200) {
  try {
    const snap = await getDocs(query(collection(db, 'invoices'), scopeWhere(), orderBy('createdAt', 'desc'), limit(max)));
    return ok({ invoices: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (error) {
    return fail(error);
  }
}

export async function createInvoice({ customerId = null, customerName = '', customerEmail = '', customerAddress = '', jobId = null, lineItems = [], taxRate = 0, notes = '', dueInDays = 14 }) {
  try {
    const totals = computeTotals(lineItems, taxRate);
    if (!totals.lineItems.length) throw new Error('Add at least one line item');
    const issueDate = today();
    const ref = await addDoc(collection(db, 'invoices'), {
      ...tenantFields(),
      invoiceNumber: generateInvoiceNumber(),
      status: 'draft',
      customerId,
      customerName,
      customerEmail,
      customerAddress,
      jobId,
      ...totals,
      notes,
      issueDate,
      dueDate: addDays(issueDate, dueInDays),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ok({ id: ref.id });
  } catch (error) {
    return fail(error);
  }
}

// One invoice per job: returns the existing one instead of creating a duplicate.
export async function createInvoiceFromJob(job, { taxRate = 0, customerEmail = '' } = {}) {
  try {
    const existing = await getDocs(query(collection(db, 'invoices'), scopeWhere(), where('jobId', '==', job.id), limit(5)));
    const live = existing.docs.find((d) => d.data().status !== 'void');
    if (live) return ok({ id: live.id, existing: true });
    return await createInvoice({
      customerId: job.customerId || null,
      customerName: job.customerName || '',
      customerEmail,
      customerAddress: job.address || '',
      jobId: job.id,
      lineItems: [{ description: job.serviceType || 'Service', quantity: 1, unitPrice: Number(job.totalCost) || 0 }],
      taxRate,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function updateInvoice(id, { lineItems, taxRate, ...rest }) {
  try {
    const patch = { ...rest, updatedAt: serverTimestamp() };
    if (lineItems) Object.assign(patch, computeTotals(lineItems, taxRate));
    await updateDoc(doc(db, 'invoices', id), patch);
    return ok();
  } catch (error) {
    return fail(error);
  }
}

const setStatus = (id, status, extra = {}) => updateInvoice(id, { status, ...extra });
export const markInvoiceSent = (id) => setStatus(id, 'sent', { sentAt: serverTimestamp() });
export const markInvoicePaid = (id, paymentMethod = 'other') => setStatus(id, 'paid', { paidAt: serverTimestamp(), paymentMethod });
export const voidInvoice = (id) => setStatus(id, 'void', { voidedAt: serverTimestamp() });

export async function deleteDraftInvoice(id) {
  try {
    await deleteDoc(doc(db, 'invoices', id));
    return ok();
  } catch (error) {
    return fail(error);
  }
}
