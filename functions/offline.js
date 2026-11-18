const { HttpsError } = require('firebase-functions/v2/https');
const { requireAuth, requireStaff, requireManager, documentId, hash, rateLimit } = require('./security');
const { ESTIMATE_OUTCOMES, appointmentPatch, isEstimateVisit } = require('./shared/appointments');
const { prepareAppointmentLinks, commitAppointmentLinks } = require('./appointmentLinks');
const version = (value) => value?.toDate ? value.toDate().toISOString() : value?.seconds != null ? new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1e6).toISOString() : value?._seconds != null ? new Date(value._seconds * 1000 + (value._nanoseconds || 0) / 1e6).toISOString() : value || null;
const fields = ['status', 'notes', 'actualWorkDone', 'actualHours', 'completionNotes', 'completedAt', 'estimateOutcome', 'departureExceptionReason'];
function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || !Object.keys(patch).length || Object.keys(patch).some((key) => !fields.includes(key))) throw new HttpsError('invalid-argument', 'Only work status, notes and completion details can sync offline.');
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'status') { if (!['en-route', 'in-progress', 'completed'].includes(value)) throw new HttpsError('invalid-argument', 'Invalid work status.'); }
    else if (key === 'estimateOutcome') { if (!ESTIMATE_OUTCOMES.includes(value)) throw new HttpsError('invalid-argument', 'Choose a valid estimate visit outcome.'); }
    else if (key === 'actualHours') { if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 744) throw new HttpsError('invalid-argument', 'Invalid work hours.'); }
    else if (key === 'departureExceptionReason') { if (typeof value !== 'string' || value.trim().length < 5 || value.trim().length > 1000) throw new HttpsError('invalid-argument', 'Enter a specific departure exception reason between 5 and 1,000 characters.'); }
    else if (typeof value !== 'string' || value.length > 10000) throw new HttpsError('invalid-argument', 'Invalid work details.');
  }
  if (patch.completedAt && !Number.isFinite(Date.parse(patch.completedAt))) throw new HttpsError('invalid-argument', 'Invalid completion date.');
  return patch;
}
function offlineHandler(db) {
  return async (request) => {
    const { uid, token } = requireAuth(request, true);
    const staff = token.companyId ? await requireStaff(db, request, token.companyId) : null;
    const data = request.data || {}, operationId = documentId(data.operationId, 'operation'), jobId = documentId(data.jobId, 'job');
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(operationId)) throw new HttpsError('invalid-argument', 'Invalid operation ID.');
    const patch = validatePatch(data.patch), expectedVersion = version(data.expectedVersion);
    await rateLimit(db, 'offline-job', uid, 120);
    const ref = db.doc(`jobs/${jobId}`), operation = db.doc(`rlOperations/${hash(`${uid}:${operationId}`)}`);
    const fingerprint = hash(JSON.stringify({ jobId, patch: Object.fromEntries(Object.entries(patch).sort()), expectedVersion }));
    if (!staff) { const snap = await ref.get(); await requireManager(db, request, snap.data() || {}); }
    return db.runTransaction(async (tx) => {
      const [job, previous] = await Promise.all([tx.get(ref), tx.get(operation)]);
      if (!job.exists || (staff ? job.get('companyId') !== token.companyId || (staff.role === 'technician' && job.get('assignedTo') !== staff.memberId) : job.get('companyId') || job.get('userId') !== uid)) throw new HttpsError('permission-denied', 'This job is no longer assigned to your workspace.');
      const deletion = await tx.get(db.doc(`rlAccountDeletions/${uid}`));
      if (deletion.exists) throw new HttpsError('permission-denied', 'This account no longer has access.');
      if (staff) {
        const company = await tx.get(db.doc(`companies/${token.companyId}`));
        const current = staff.role === 'owner' ? company : await tx.get(db.doc(`teamMembers/${staff.memberId}`));
        if (!company.exists || !current.exists || (staff.role === 'owner' ? current.get('ownerId') !== uid : current.get('uid') !== uid || current.get('companyId') !== token.companyId || current.get('status') !== 'active' || current.get('role') !== staff.role)) throw new HttpsError('permission-denied', 'Your work access changed. Refresh before syncing.');
      } else {
        const profile = await tx.get(db.doc(`users/${uid}`));
        if (profile.get('rlCompanyId') || profile.get('companyId')) throw new HttpsError('permission-denied', 'Your workspace changed. Refresh before syncing.');
      }
      if (previous.exists) { if (previous.get('fingerprint') !== fingerprint) throw new HttpsError('already-exists', 'An operation ID cannot be reused for different changes.'); return previous.get('result'); }
      const currentVersion = version(job.get('updatedAt'));
      if (currentVersion !== expectedVersion) return { status: 'conflict', version: currentVersion, server: Object.fromEntries(fields.map((key) => [key, job.get(key === 'notes' ? 'workNotes' : key) ?? null])) };
      if (staff?.role === 'technician' && (job.get('status') === 'cancelled' || (job.get('status') === 'completed' && patch.status && patch.status !== 'completed'))) throw new HttpsError('failed-precondition', 'A manager must reopen this job.');
      if (['completed', 'cancelled'].includes(job.get('status')) && patch.status && !['completed', 'cancelled'].includes(patch.status)) throw new HttpsError('failed-precondition', 'Reopen this appointment from scheduling so technician availability can be checked.');
      const evidence = job.get('visitEvidence') || {}, arrived = Date.parse(evidence.arrivedAt), departed = Date.parse(evidence.departedAt), missingDeparture = Number.isFinite(arrived) && (!Number.isFinite(departed) || departed < arrived);
      if (patch.status === 'completed' && missingDeparture && !String(patch.departureExceptionReason || '').trim()) throw new HttpsError('failed-precondition', 'Record departure, or document a departure exception reason before completing this visit.');
      // A strictly increasing timestamp also distinguishes operations in the same millisecond.
      const updatedAt = new Date(Math.max(Date.now(), (Date.parse(currentVersion) || 0) + 1)).toISOString();
      const kindPatch = isEstimateVisit(job.data()) || patch.estimateOutcome !== undefined ? appointmentPatch(patch, job.data()) : {};
      const safePatch = { ...patch, ...kindPatch };
      if ('notes' in safePatch) { safePatch.workNotes = safePatch.notes; delete safePatch.notes; }
      const scope = { uid, companyId: token.companyId || null, role: staff?.role || 'owner', ...(staff?.memberId ? { memberId: staff.memberId } : {}) };
      const links = isEstimateVisit(job.data()) ? await prepareAppointmentLinks(db, tx, scope, { jobId, before: job.data(), next: { ...job.data(), ...safePatch } }) : null;
      const result = { status: 'synced', version: updatedAt, ...(isEstimateVisit(job.data()) ? { estimateOutcome: safePatch.estimateOutcome } : {}) };
      tx.update(ref, { ...safePatch, updatedAt });
      commitAppointmentLinks(db, tx, links, updatedAt);
      tx.create(operation, { userId: uid, companyId: token.companyId || null, jobId, fingerprint, result, createdAt: new Date() });
      if (safePatch.estimateOutcome !== undefined) tx.create(db.collection('rlAudit').doc(), { action: 'job.estimateOutcome', companyId: token.companyId || null, actorId: uid, jobId, estimateOutcome: safePatch.estimateOutcome, createdAt: updatedAt });
      if (safePatch.departureExceptionReason) tx.create(db.collection('rlAudit').doc(), { action: 'job.departureException', companyId: token.companyId || null, actorId: uid, jobId, reason: safePatch.departureExceptionReason, arrivalAt: evidence.arrivedAt || null, createdAt: updatedAt });
      return result;
    });
  };
}
module.exports = { offlineHandler, validatePatch, version };
