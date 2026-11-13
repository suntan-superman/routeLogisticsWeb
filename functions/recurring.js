const { HttpsError } = require('firebase-functions/v2/https');
const { documentId, requireAuth, requireManager, rateLimit } = require('./security');
function nextVisit(plan) {
  const date = String(plan.nextServiceDate || '');
  const start = new Date(`${date}T12:00:00Z`);
  const days = Number(plan.frequencyDays);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== date || !Number.isInteger(days) || days < 1 || days > 3660) throw new HttpsError('failed-precondition', 'Service plan has an invalid date or frequency.');
  if (!plan.active || !plan.customerId || !plan.userId || !Number.isFinite(Number(plan.price || 0)) || Number(plan.price || 0) < 0) throw new HttpsError('failed-precondition', 'Service plan is inactive or incomplete.');
  start.setUTCDate(start.getUTCDate() + days);
  return { date, nextServiceDate: start.toISOString().slice(0, 10) };
}
async function generateVisit(db, id, expectedDate, authorize = async () => {}) {
  const ref = db.collection('servicePlans').doc(documentId(id, 'plan'));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Service plan not found.');
    const plan = snap.data();
    await authorize(plan);
    if (expectedDate && plan.nextServiceDate !== expectedDate) return { skipped: true, nextServiceDate: plan.nextServiceDate };
    const { date, nextServiceDate } = nextVisit(plan);
    const jobRef = db.collection('jobs').doc(`rl_plan_${id}_${date}`);
    const [existing, customer] = await Promise.all([tx.get(jobRef), tx.get(db.collection('customers').doc(documentId(plan.customerId)))]);
    if (!customer.exists || (plan.companyId ? customer.get('companyId') !== plan.companyId : customer.get('userId') !== plan.userId || customer.get('companyId'))) throw new HttpsError('failed-precondition', 'Customer does not belong to this service plan.');
    if (!existing.exists) tx.create(jobRef, {
      userId: plan.userId, ...(plan.companyId ? { companyId: plan.companyId } : {}),
      customerId: plan.customerId, customerName: plan.customerName || customer.get('name') || '',
      customerPhone: plan.customerPhone || '', address: plan.address || '', serviceType: plan.serviceType || 'Service',
      status: 'scheduled', date, time: plan.time || '09:00', totalCost: Number(plan.price || 0), notes: plan.notes || '',
      servicePlanId: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    tx.update(ref, { nextServiceDate, lastJobId: jobRef.id, lastGeneratedFor: date, updatedAt: new Date().toISOString() });
    return { jobId: jobRef.id, nextServiceDate };
  });
}
function recurringHandlers(db) {
  return {
    generateServicePlanJob: async (request) => {
      requireAuth(request);
      await rateLimit(db, 'generate-job', request.auth.uid);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(request.data?.expectedDate || '')) throw new HttpsError('invalid-argument', 'Expected visit date is required.');
      return generateVisit(db, request.data?.planId, request.data.expectedDate, (plan) => requireManager(db, request, plan));
    },
    generateRecurringJobs: async () => {
      const today = new Date().toISOString().slice(0, 10);
      let cursor;
      do {
        let query = db.collection('servicePlans').where('active', '==', true).where('nextServiceDate', '<=', today).orderBy('nextServiceDate').limit(200);
        if (cursor) query = query.startAfter(cursor);
        const snap = await query.get();
        for (const plan of snap.docs) {
          try { await generateVisit(db, plan.id, plan.get('nextServiceDate')); }
          catch (error) { console.error('Recurring visit failed', { planId: plan.id, code: error.code || 'unknown' }); }
        }
        cursor = snap.size === 200 ? snap.docs.at(-1) : null;
      } while (cursor);
    },
  };
}
module.exports = { nextVisit, generateVisit, recurringHandlers };
