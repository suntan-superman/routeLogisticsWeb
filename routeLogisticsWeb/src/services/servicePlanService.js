import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { scopeWhere, tenantFields } from './tenancy';
import { addDays } from './invoiceMath';

const ok = (data = {}) => ({ success: true, ...data });
const fail = (error) => {
  console.error(error);
  return { success: false, error: error.message || String(error) };
};

export const FREQUENCIES = [
  { label: 'Weekly', days: 7 },
  { label: 'Every 2 weeks', days: 14 },
  { label: 'Monthly', days: 30 },
  { label: 'Every 2 months', days: 60 },
  { label: 'Quarterly', days: 90 },
  { label: 'Every 6 months', days: 180 },
  { label: 'Annually', days: 365 },
];

export async function listServicePlans() {
  try {
    const snap = await getDocs(query(collection(db, 'servicePlans'), scopeWhere(), orderBy('nextServiceDate', 'asc'), limit(300)));
    return ok({ plans: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (error) {
    return fail(error);
  }
}

export async function createServicePlan(plan) {
  try {
    if (!plan.customerId) throw new Error('Select a customer');
    if (!plan.nextServiceDate) throw new Error('Choose the first service date');
    const frequencyDays = Number(plan.frequencyDays);
    if (!(frequencyDays > 0)) throw new Error('Choose a service frequency');
    const ref = await addDoc(collection(db, 'servicePlans'), {
      ...tenantFields(),
      customerId: plan.customerId,
      customerName: plan.customerName || '',
      customerPhone: plan.customerPhone || '',
      address: plan.address || '',
      serviceType: plan.serviceType || 'General Pest Control',
      frequencyDays,
      nextServiceDate: plan.nextServiceDate,
      time: plan.time || '09:00',
      price: Number(plan.price) || 0,
      notes: plan.notes || '',
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ok({ id: ref.id });
  } catch (error) {
    return fail(error);
  }
}

export async function updateServicePlan(id, patch) {
  try {
    await updateDoc(doc(db, 'servicePlans', id), { ...patch, updatedAt: serverTimestamp() });
    return ok();
  } catch (error) {
    return fail(error);
  }
}

export async function deleteServicePlan(id) {
  try {
    await deleteDoc(doc(db, 'servicePlans', id));
    return ok();
  } catch (error) {
    return fail(error);
  }
}

// Creates the next visit as a scheduled job and advances the plan. Job is written first so a failure
// never skips a visit; a failure after that only risks a duplicate the manager can delete.
export async function generateNextJob(plan) {
  try {
    const jobRef = await addDoc(collection(db, 'jobs'), {
      ...tenantFields(),
      status: 'scheduled',
      serviceType: plan.serviceType,
      customerId: plan.customerId,
      customerName: plan.customerName,
      customerPhone: plan.customerPhone || '',
      address: plan.address || '',
      date: plan.nextServiceDate,
      time: plan.time || '09:00',
      totalCost: plan.price || 0,
      notes: plan.notes || '',
      servicePlanId: plan.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const nextServiceDate = addDays(plan.nextServiceDate, plan.frequencyDays);
    await updateServicePlan(plan.id, { nextServiceDate, lastJobId: jobRef.id, lastGeneratedFor: plan.nextServiceDate });
    return ok({ jobId: jobRef.id, nextServiceDate });
  } catch (error) {
    return fail(error);
  }
}
