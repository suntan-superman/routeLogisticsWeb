const { HttpsError } = require('firebase-functions/v2/https');
const { hash, documentId, requireAuth, requireStaff, rateLimit } = require('./security');
const { hasCapability } = require('./access');
function routeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new HttpsError('invalid-argument', 'Choose a valid service date.');
  return value;
}
function coordinates(data) {
  if (data?.latitude == null || data?.longitude == null || data.latitude === '' || data.longitude === '') return null;
  const lat = Number(data.latitude), lng = Number(data.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
async function routingScope(db, request) {
  const { token } = requireAuth(request, true);
  const staff = await requireStaff(db, request, token.companyId);
  const memberId = documentId(request.data?.memberId, 'technician');
  if (staff.role === 'technician' && memberId !== staff.memberId) throw new HttpsError('permission-denied', 'You can view only your own daily route.');
  if (memberId !== staff.company.get('ownerId')) {
    const member = await db.doc(`teamMembers/${memberId}`).get();
    if (member.get('companyId') !== token.companyId || member.get('status') !== 'active' || !member.get('uid')) throw new HttpsError('failed-precondition', 'Select an active team member.');
  }
  return { ...staff, companyId: token.companyId, memberId, date: routeDate(request.data?.date) };
}
function routeHandlers(db) {
  return {
    team: async (request) => {
      const { token } = requireAuth(request, true), staff = await requireStaff(db, request, token.companyId);
      const members = await db.collection('teamMembers').where('companyId', '==', token.companyId).where('status', '==', 'active').get();
      const team = members.docs.filter((d) => d.get('uid') && (staff.role !== 'technician' || d.id === staff.memberId)).map((d) => ({ id: d.id, name: d.get('name') || d.get('email'), role: d.get('role') }));
      if (staff.role !== 'technician') team.unshift({ id: staff.company.get('ownerId'), name: 'Company owner', role: 'owner' });
      const data = staff.company.data();
      return { team, companyId: token.companyId, startAddress: [data.address, data.city, data.state, data.zipCode].filter((v) => typeof v === 'string' && v.trim()).join(', ') };
    },
    get: async (request) => {
      const scope = await routingScope(db, request);
      await rateLimit(db, 'route-read', request.auth.uid, 30);
      const snap = await db.collection('jobs').where('companyId', '==', scope.companyId).where('assignedTo', '==', scope.memberId).where('date', '==', scope.date).limit(101).get();
      const stops = [];
      for (const job of snap.docs.slice(0, 100)) {
        const data = job.data(); if (['completed', 'cancelled'].includes(data.status)) continue;
        const customer = data.customerId ? await db.doc(`customers/${documentId(data.customerId)}`).get() : null;
        const customerData = customer?.get('companyId') === scope.companyId ? customer.data() : {};
        const address = typeof data.address === 'string' && data.address.trim() ? data.address : [customerData.address, customerData.city, customerData.state, customerData.zipCode].filter((v) => typeof v === 'string' && v.trim()).join(', ');
        const hours = Number(data.estimatedDuration ?? data.duration ?? 0);
        stops.push({ id: job.id, customerName: data.customerName || customerData.name || [customerData.firstName, customerData.lastName].filter(Boolean).join(' ') || 'Customer', serviceType: data.serviceType || 'Service', time: data.time || '', windowStart: data.windowStart || data.time || '', windowEnd: data.windowEnd || '', durationMinutes: Number.isFinite(hours) ? Math.max(0, hours * 60) : 0, location: coordinates(data) || coordinates(customerData), address });
      }
      stops.sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
      const saved = await db.doc(`rlRoutes/${hash(`${scope.companyId}:${scope.memberId}:${scope.date}`)}`).get();
      return { stops, saved: saved.exists ? saved.data() : null, truncated: snap.size > 100 };
    },
    save: async (request) => {
      const scope = await routingScope(db, request);
      if (!hasCapability(scope.role, 'routes.optimize')) throw new HttpsError('permission-denied', 'Dispatch permission is required to change route order.');
      await rateLimit(db, 'route-save', request.auth.uid, 20);
      const ids = request.data?.jobIds;
      if (!Array.isArray(ids) || !ids.length || ids.length > 25 || new Set(ids).size !== ids.length) throw new HttpsError('invalid-argument', 'Select between 1 and 25 distinct jobs.');
      const refs = ids.map((id) => db.doc(`jobs/${documentId(id)}`));
      const ref = db.doc(`rlRoutes/${hash(`${scope.companyId}:${scope.memberId}:${scope.date}`)}`);
      return db.runTransaction(async (tx) => {
        const [previous, ...jobs] = await Promise.all([tx.get(ref), ...refs.map((job) => tx.get(job))]);
        if ((previous.get('revision') || 0) !== (request.data.revision || 0)) throw new HttpsError('aborted', 'The saved route changed. Reload before saving.');
        if (jobs.some((job) => !job.exists || job.get('companyId') !== scope.companyId || job.get('assignedTo') !== scope.memberId || job.get('date') !== scope.date || ['completed', 'cancelled'].includes(job.get('status')))) throw new HttpsError('permission-denied', 'A job is no longer eligible for this technician and date. Reload the route.');
        const revision = (previous.get('revision') || 0) + 1;
        tx.set(ref, { companyId: scope.companyId, memberId: scope.memberId, date: scope.date, jobIds: ids, startAddress: String(request.data.startAddress || '').slice(0, 500), returnToStart: request.data.returnToStart === true, updatedBy: request.auth.uid, updatedAt: new Date().toISOString(), revision });
        return { revision };
      });
    },
  };
}
module.exports = { routeHandlers, routingScope, routeDate, coordinates };
