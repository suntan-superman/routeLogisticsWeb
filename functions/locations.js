const { randomBytes } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { hash, documentId, requireAuth, requireStaff, requireCompanyOwner, rateLimit } = require('./security');
const { coordinates } = require('./routes');
const retentionHours = (value) => Number.isInteger(value) && value >= 1 && value <= 168 ? value : 24;
async function activeWork(db, staff, jobId) {
  const job = await db.doc(`jobs/${documentId(jobId, 'job')}`).get();
  if (!job.exists || job.get('companyId') !== staff.company.id || job.get('status') !== 'in-progress' || (staff.role === 'technician' && job.get('assignedTo') !== staff.memberId)) throw new HttpsError('failed-precondition', 'Location sharing requires an assigned job in progress.');
}
function legacyLocationHandlers(db) {
  return {
    update: async (request) => {
      const { uid, token } = requireAuth(request, true), staff = await requireStaff(db, request, token.companyId);
      await rateLimit(db, 'location', uid, 10);
      const ref = db.doc(`rlLocations/${hash(`${token.companyId}:${uid}`)}`), action = request.data?.action;
      if (action === 'stop') {
        await db.runTransaction(async (tx) => {
          const current = await tx.get(ref);
          if (current.exists && current.get('sessionId') === request.data.sessionId) tx.update(ref, { sharing: false, stoppedAt: new Date() });
        });
        return { sharing: false };
      }
      if (!['start', 'position'].includes(action)) throw new HttpsError('invalid-argument', 'Invalid location action.');
      const hours = retentionHours(staff.company.get('rlLocationRetentionHours'));
      if (action === 'start') {
        await activeWork(db, staff, request.data.jobId);
        const sessionId = randomBytes(24).toString('hex');
        await ref.set({ companyId: token.companyId, userId: uid, memberId: staff.memberId || uid, jobId: request.data.jobId, sessionId, sharing: true, startedAt: new Date(), updatedAt: new Date(), sessionExpiresAt: new Date(Date.now() + 300000), expiresAt: new Date(Date.now() + hours * 3600_000) });
        return { sessionId, retentionHours: hours };
      }
      const position = coordinates(request.data);
      const accuracy = request.data.accuracy;
      if (!position || typeof request.data.latitude !== 'number' || typeof request.data.longitude !== 'number' || typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 5000) throw new HttpsError('invalid-argument', 'A numeric location fix and known numeric accuracy are required.');
      const existing = await ref.get();
      if (!existing.exists || !existing.get('sharing') || existing.get('sessionId') !== request.data.sessionId || existing.get('sessionExpiresAt').toMillis() < Date.now()) throw new HttpsError('failed-precondition', 'Location sharing has stopped. Start it again while working.');
      await activeWork(db, staff, existing.get('jobId'));
      await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (!current.get('sharing') || current.get('sessionId') !== request.data.sessionId) throw new HttpsError('failed-precondition', 'Location sharing has stopped.');
        tx.update(ref, { ...position, accuracy, updatedAt: new Date(), sessionExpiresAt: new Date(Date.now() + 300000), expiresAt: new Date(Date.now() + hours * 3600_000) });
      });
      return { sharing: true };
    },
    list: async (request) => {
      const { token } = requireAuth(request, true), staff = await requireStaff(db, request, token.companyId);
      if (staff.role === 'technician') throw new HttpsError('permission-denied', 'Manager access is required to view team locations.');
      await rateLimit(db, 'location-read', request.auth.uid, 20);
      const snap = await db.collection('rlLocations').where('companyId', '==', token.companyId).limit(501).get();
      const hours = retentionHours(staff.company.get('rlLocationRetentionHours')), now = Date.now(), locations = [];
      for (const row of snap.docs.slice(0, 500)) {
        const data = row.data(), updatedAt = data.updatedAt.toMillis();
        if (data.expiresAt.toMillis() <= now || updatedAt + hours * 3600_000 <= now || !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) continue;
        const owner = data.userId === staff.company.get('ownerId');
        const member = owner ? null : await db.doc(`teamMembers/${documentId(data.memberId)}`).get();
        if (!owner && (member.get('status') !== 'active' || member.get('companyId') !== token.companyId || member.get('uid') !== data.userId)) continue;
        const stale = now - updatedAt > 180000 || data.sessionExpiresAt.toMillis() <= now;
        locations.push({ id: row.id, memberId: data.memberId, name: owner ? 'Company owner' : member.get('name') || member.get('email'), lat: data.lat, lng: data.lng, accuracy: data.accuracy, updatedAt: new Date(updatedAt).toISOString(), sharing: data.sharing && !stale, stale, state: !data.sharing ? 'sharing-disabled' : stale ? 'stale' : 'live' });
      }
      return { locations, retentionHours: hours, truncated: snap.size > 500 };
    },
    retention: async (request) => {
      const company = await requireCompanyOwner(db, request, request.data?.companyId);
      const hours = request.data?.hours;
      if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new HttpsError('invalid-argument', 'Retention must be between 1 and 168 hours.');
      await company.ref.update({ rlLocationRetentionHours: hours });
      const rows = await db.collection('rlLocations').where('companyId', '==', company.id).get();
      for (let offset = 0; offset < rows.size; offset += 400) { const batch = db.batch(); rows.docs.slice(offset, offset + 400).forEach((row) => batch.update(row.ref, { expiresAt: new Date(Math.min(row.get('expiresAt').toMillis(), row.get('updatedAt').toMillis() + hours * 3600_000)) })); await batch.commit(); }
      return { hours };
    },
    cleanup: async () => {
      let removed = 0;
      for (let page = 0; page < 10; page++) {
        const rows = await db.collection('rlLocations').where('expiresAt', '<=', new Date()).limit(400).get();
        if (rows.empty) break;
        const batch = db.batch(); rows.docs.forEach((row) => batch.delete(row.ref)); await batch.commit(); removed += rows.size;
      }
      return { removed };
    },
  };
}
function locationHandlers(db, options) {
  return require('./workTracking').workTrackingHandlers(db, legacyLocationHandlers(db), options);
}
module.exports = { locationHandlers, retentionHours, activeWork };
