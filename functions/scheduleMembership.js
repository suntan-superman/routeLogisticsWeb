const { HttpsError } = require('firebase-functions/v2/https');
const { FieldPath } = require('firebase-admin/firestore');
const { documentId, hash } = require('./security');
const { todayInZone } = require('./recurring');

const PAGE = 200, MAX_SCAN = 5000;
const identifier = value => typeof value === 'string' && !!value && value.length <= 200 && !value.includes('/');
const millis = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : Date.parse(value || '');
const sameAssignee = (job, departed) => [departed.memberId, departed.uid].includes(job.assignedTo);
function departure(event, deleted) {
  const before = deleted ? event.data : event.data?.before;
  const old = before?.data?.(), after = deleted ? null : event.data?.after?.data?.();
  if (!old || old.status !== 'active' || !identifier(old.companyId) || !identifier(old.uid)) return null;
  if (after?.status === 'active' && after.uid === old.uid && after.companyId === old.companyId) return null;
  const memberId = documentId(event.params?.memberId || before.id, 'membership');
  if (typeof event.id !== 'string' || !event.id || event.id.length > 1000) throw new HttpsError('invalid-argument', 'A stable membership event ID is required.');
  return { memberId, uid: old.uid, companyId: old.companyId, eventId: event.id, eventTime: millis(event.time) };
}
function scheduleMembershipHandlers(db, config = {}) {
  const scheduling = config.scheduling || require('./scheduling').schedulingHandlers(db);
  const scanLimit = config.maxScan === undefined ? MAX_SCAN : config.maxScan;
  if (!Number.isInteger(scanLimit) || scanLimit < 1 || scanLimit > MAX_SCAN) throw new HttpsError('invalid-argument', 'Choose a valid internal reconciliation batch limit.');
  async function currentContext(tx, departed) {
    const [company, member, deleted] = await Promise.all([
      tx.get(db.doc(`companies/${departed.companyId}`)), tx.get(db.doc(`teamMembers/${departed.memberId}`)), tx.get(db.doc(`rlAccountDeletions/${departed.uid}`)),
    ]);
    if (!company.exists || company.get('isActive') === false || company.get('deletedAt') || !identifier(company.get('ownerId'))) return null;
    const ownerDeleted = await tx.get(db.doc(`rlAccountDeletions/${company.get('ownerId')}`));
    if (ownerDeleted.exists) return null;
    if (!deleted.exists) {
      if (company.get('ownerId') === departed.uid || member.get('status') === 'active' && member.get('uid') === departed.uid && member.get('companyId') === departed.companyId) return null;
      const aliases = await tx.get(db.collection('teamMembers').where('companyId', '==', departed.companyId).where('uid', '==', departed.uid).where('status', '==', 'active').limit(1));
      if (!aliases.empty) return null;
    }
    return { scope: { companyId: departed.companyId, uid: company.get('ownerId'), role: 'owner', company }, member, today: todayInZone(company.get('timeZone')) };
  }
  const auditRef = (departed, kind, id) => db.doc(`rlAudit/schedule_departure_${hash(`${departed.eventId}:${kind}:${id}`)}`);
  const prefersDeparted = (plan, departed) => plan && [departed.memberId, departed.uid].includes(plan.preferredTechnicianId);
  const preferenceReview = departed => ({ preferredTechnicianNeedsReview: true, preferredTechnicianReview: 'The preferred technician is no longer active. Select a new preference; existing replacement policy still applies.', preferredTechnicianReviewEvent: hash(departed.eventId) });
  async function reviewPlan(ref, departed) {
    return db.runTransaction(async tx => {
      const [plan, audit] = await Promise.all([tx.get(ref), tx.get(auditRef(departed, 'plan', ref.id))]);
      if (audit.exists || !plan.exists || plan.get('companyId') !== departed.companyId || plan.get('active') !== true || !prefersDeparted(plan.data(), departed)) return false;
      if (plan.get('preferredTechnicianUid') && plan.get('preferredTechnicianUid') !== departed.uid) return false;
      if (!await currentContext(tx, departed)) return false;
      const at = new Date().toISOString();
      tx.update(ref, { ...preferenceReview(departed), updatedAt: at });
      tx.create(audit.ref, { action: 'servicePlan.preferredTechnician.departed', companyId: departed.companyId, servicePlanId: ref.id, departedMemberId: departed.memberId, departedUid: departed.uid, sourceEvent: hash(departed.eventId), createdAt: at });
      return true;
    });
  }
  async function reconcileJob(ref, departed) {
    return db.runTransaction(async tx => {
      const [snapshot, audit] = await Promise.all([tx.get(ref), tx.get(auditRef(departed, 'job', ref.id))]);
      const job = snapshot.data();
      if (audit.exists || !job || job.companyId !== departed.companyId || job.status !== 'scheduled' || job.deletedAt || !sameAssignee(job, departed)) return false;
      if (job.assignedToUid && job.assignedToUid !== departed.uid) return false;
      const context = await currentContext(tx, departed);
      if (!context || !/^\d{4}-\d{2}-\d{2}$/.test(job.date || '') || job.date < context.today) return false;
      const reused = context.member.exists && (context.member.get('uid') !== departed.uid || context.member.get('companyId') !== departed.companyId);
      if (!job.assignedToUid && reused && (!Number.isFinite(departed.eventTime) || millis(job.updatedAt) > departed.eventTime)) return false;
      const plan = identifier(job.servicePlanId) ? await tx.get(db.doc(`servicePlans/${job.servicePlanId}`)) : null;
      const localPlan = plan?.exists && plan.get('companyId') === departed.companyId ? plan : null;
      const auto = localPlan?.get('active') === true && localPlan.get('assignmentFallback') === 'auto';
      let prepared, schedulingReview;
      if (auto) try {
        prepared = await scheduling.choose(tx, context.scope, job, { preferredTechnicianId: localPlan.get('preferredTechnicianId') || null, assignmentFallback: 'auto', system: true, before: job, jobId: ref.id, servicePlanId: localPlan.id, occurrenceDate: job.servicePlanDate || job.date });
      } catch (error) {
        if (!['invalid-argument', 'failed-precondition', 'resource-exhausted'].includes(error.code)) throw error;
        schedulingReview = 'The appointment schedule needs review before an available replacement can be selected.';
      }
      if (!prepared) prepared = await scheduling.prepare(tx, context.scope, { ...job, assignedTo: null }, { before: job, jobId: ref.id });
      const at = new Date(Math.max(Date.now(), millis(job.updatedAt) + 1 || 0)).toISOString();
      const assignedTo = prepared.assignedTo || null;
      const needsReview = !assignedTo;
      const message = needsReview ? schedulingReview || prepared.assignmentReview || 'The assigned technician is no longer active. Assign an available technician.' : null;
      scheduling.commit(tx, prepared);
      tx.update(ref, { assignedTo, assignedToUid: prepared.assignedToUid || null, assignedToName: prepared.assignedToName || '', assignmentNeedsAttention: needsReview, assignmentReview: message, updatedAt: at, lastModifiedAt: at, isModified: true });
      if (localPlan && prefersDeparted(localPlan.data(), departed) && localPlan.get('preferredTechnicianReviewEvent') !== hash(departed.eventId)) tx.update(localPlan.ref, { ...preferenceReview(departed), updatedAt: at });
      tx.create(audit.ref, { action: 'job.assignment.technicianDeparted', companyId: departed.companyId, jobId: ref.id, departedMemberId: departed.memberId, departedUid: departed.uid, fromMemberId: job.assignedTo, toMemberId: assignedTo, assignmentNeedsAttention: needsReview, sourceEvent: hash(departed.eventId), createdAt: at });
      return true;
    });
  }
  async function reconcile(event, deleted) {
    const departed = departure(event, deleted);
    if (!departed) return { ignored: true };
    const checkpoint = db.doc(`rlScheduleReconciliations/${hash(departed.eventId)}`), initial = await checkpoint.get();
    if (initial.get('status') === 'complete') return { duplicate: true };
    const company = await db.doc(`companies/${departed.companyId}`).get();
    const ownerDeleted = company.exists && identifier(company.get('ownerId')) ? await db.doc(`rlAccountDeletions/${company.get('ownerId')}`).get() : null;
    if (!company.exists || company.get('isActive') === false || company.get('deletedAt') || !identifier(company.get('ownerId')) || ownerDeleted?.exists) {
      console.warn('Technician departure needs provider review', { companyId: departed.companyId, memberId: departed.memberId, code: 'provider-inactive' });
      await checkpoint.set({ companyId: departed.companyId, memberId: departed.memberId, status: 'complete', phase: 'jobs', cursor: null, reason: 'provider-inactive', updatedAt: new Date().toISOString() }, { merge: true });
      return { skipped: 'provider-inactive' };
    }
    const today = todayInZone(company.get('timeZone'));
    let phase = initial.get('phase') || 'plans', cursor = initial.get('cursor') || null, scanned = 0, jobsChanged = 0, plansFlagged = 0;
    async function progress(nextPhase, nextCursor, complete = false) {
      await db.runTransaction(async tx => {
        const current = await tx.get(checkpoint);
        if (current.get('status') === 'complete') return;
        const previousPhase = current.get('phase') || 'plans', previous = current.get('cursor');
        if (previousPhase === 'jobs' && nextPhase === 'plans') return;
        if (previousPhase === nextPhase && previous && !nextCursor && !complete) return;
        if (previousPhase === nextPhase && previous && nextCursor) {
          const earlier = nextPhase === 'plans' ? nextCursor.id < previous.id : nextCursor.date > previous.date || nextCursor.date === previous.date && nextCursor.id > previous.id;
          if (earlier) return;
        }
        tx.set(checkpoint, { companyId: departed.companyId, memberId: departed.memberId, departedUid: departed.uid, phase: nextPhase, cursor: nextCursor, status: complete ? 'complete' : 'running', updatedAt: new Date().toISOString() }, { merge: true });
      });
    }
    for (;;) {
      const batchSize = Math.min(PAGE, scanLimit - scanned);
      if (batchSize <= 0) throw new HttpsError('resource-exhausted', 'Technician departure reconciliation reached its batch limit. The saved checkpoint will continue on retry.');
      let query = phase === 'plans'
        ? db.collection('servicePlans').where('companyId', '==', departed.companyId).where('active', '==', true).orderBy(FieldPath.documentId()).limit(batchSize)
        : db.collection('jobs').where('companyId', '==', departed.companyId).where('date', '>=', today).orderBy('date', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(batchSize);
      if (cursor) query = phase === 'plans' ? query.startAfter(cursor.id) : query.startAfter(cursor.date, cursor.id);
      const page = await query.get();
      for (const row of page.docs) {
        if (phase === 'plans') { if (prefersDeparted(row.data(), departed) && await reviewPlan(row.ref, departed)) plansFlagged++; }
        else if (sameAssignee(row.data(), departed) && await reconcileJob(row.ref, departed)) jobsChanged++;
      }
      scanned += page.size;
      if (page.size) {
        const last = page.docs.at(-1); cursor = phase === 'plans' ? { id: last.id } : { date: last.get('date'), id: last.id };
        await progress(phase, cursor);
      }
      if (page.size < batchSize) {
        if (phase === 'jobs') { await progress('jobs', cursor, true); return { jobsChanged, plansFlagged, scanned }; }
        phase = 'jobs'; cursor = null; await progress(phase, cursor);
      }
      if (scanned >= scanLimit) throw new HttpsError('resource-exhausted', 'Technician departure reconciliation reached its batch limit. The saved checkpoint will continue on retry.');
    }
  }
  return { updated: event => reconcile(event, false), deleted: event => reconcile(event, true) };
}
module.exports = { scheduleMembershipHandlers, departure };
