import { collection, doc, getDocs, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import { scopeWhere } from './tenancy';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

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
    const result = await httpsCallable(functions, 'rlManageServicePlan')({ action: 'create', plan: { ...plan, frequencyDays, price: Number(plan.price) || 0 } });
    return ok(result.data);
  } catch (error) {
    return fail(error);
  }
}

export async function updateServicePlan(id, patch) {
  try {
    const result = await httpsCallable(functions, 'rlManageServicePlan')({ action: 'update', id, plan: patch });
    return ok(result.data);
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

// The server commits the visit and plan advancement atomically, with a deterministic job ID.
export async function generateNextJob(plan) {
  try {
    const result = await httpsCallable(functions, 'generateServicePlanJob')({ planId: plan.id, expectedDate: plan.nextServiceDate });
    return ok(result.data);
  } catch (error) { return fail(error); }
}
