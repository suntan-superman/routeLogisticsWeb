const { HttpsError } = require('firebase-functions/v2/https');
const { requireAuth, requireStaff, requireManager, documentId, hash, rateLimit } = require('./security');
const version = (value) => value?.toDate ? value.toDate().toISOString() : value?.seconds != null ? new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1e6).toISOString() : value?._seconds != null ? new Date(value._seconds * 1000 + (value._nanoseconds || 0) / 1e6).toISOString() : value || null;
const fields = ['status', 'notes', 'actualWorkDone', 'actualHours', 'completionNotes', 'completedAt'];
function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || !Object.keys(patch).length || Object.keys(patch).some((key) => !fields.includes(key))) throw new HttpsError('invalid-argument', 'Only work status, notes and completion details can sync offline.');
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'status') { if (!['en-route', 'in-progress', 'completed'].includes(value)) throw new HttpsError('invalid-argument', 'Invalid work status.'); }
    else if (key === 'actualHours') { if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 744) throw new HttpsError('invalid-argument', 'Invalid work hours.'); }
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
      if (previous.exists) { if (previous.get('fingerprint') !== fingerprint) throw new HttpsError('already-exists', 'An operation ID cannot be reused for different changes.'); return previous.get('result'); }
      const currentVersion = version(job.get('updatedAt'));
      if (currentVersion !== expectedVersion) return { status: 'conflict', version: currentVersion, server: Object.fromEntries(fields.map((key) => [key, job.get(key === 'notes' ? 'workNotes' : key) ?? null])) };
      if (staff?.role === 'technician' && (job.get('status') === 'cancelled' || (job.get('status') === 'completed' && patch.status && patch.status !== 'completed'))) throw new HttpsError('failed-precondition', 'A manager must reopen this job.');
      // A strictly increasing timestamp also distinguishes operations in the same millisecond.
      const updatedAt = new Date(Math.max(Date.now(), (Date.parse(currentVersion) || 0) + 1)).toISOString();
      const result = { status: 'synced', version: updatedAt };
      const safePatch = { ...patch };
      if ('notes' in safePatch) { safePatch.workNotes = safePatch.notes; delete safePatch.notes; }
      tx.update(ref, { ...safePatch, updatedAt });
      tx.create(operation, { userId: uid, companyId: token.companyId || null, jobId, fingerprint, result, createdAt: new Date() });
      return result;
    });
  };
}
module.exports = { offlineHandler, validatePatch, version };
