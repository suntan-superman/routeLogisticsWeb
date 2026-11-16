const { HttpsError } = require('firebase-functions/v2/https');
const { accessScope, hasCapability } = require('./access');
const { documentId, hash, rateLimit } = require('./security');
const { version } = require('./offline');
const REASONS = ['unavailable','schedule-conflict','vehicle','equipment','access','other'];
const terminal = job => ['completed','cancelled','canceled','deleted','archived'].includes(job.status) || job.deletedAt;
const summary = row => row ? Object.fromEntries(['id','status','revision','reason','notes','requestedAt','requestedBy','resolvedAt','resolvedBy','resolution','explanation'].filter(key => row[key] !== undefined).map(key => [key,row[key]])) : null;
const cleanText = (value, label) => { if (value === undefined) return ''; if (typeof value !== 'string' || value.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new HttpsError('invalid-argument', `Use at most 2,000 characters for ${label}.`); return value.trim(); };
const assigned = (scope, job) => (scope.role === 'owner' ? job.assignedTo === scope.uid : job.assignedTo === scope.memberId) && (!job.assignedToUid || job.assignedToUid === scope.uid);
async function assertActor(tx, db, scope) {
  const [company, deletion, member] = await Promise.all([tx.get(db.doc(`companies/${scope.companyId}`)),tx.get(db.doc(`rlAccountDeletions/${scope.uid}`)),scope.role === 'owner' ? null : tx.get(db.doc(`teamMembers/${documentId(scope.memberId)}`))]);
  if (deletion.exists || !company.exists || company.get('isActive') === false || company.get('deletedAt') || (scope.role === 'owner' ? company.get('ownerId') !== scope.uid : !member?.exists || member.get('uid') !== scope.uid || member.get('companyId') !== scope.companyId || member.get('role') !== scope.role || member.get('status') !== 'active')) throw new HttpsError('permission-denied','Your company access changed. Refresh before continuing.');
}
function jobExceptionHandlers(db) {
  return async request => {
    const scope = await accessScope(db,request), data = request.data || {}, action = data.action;
    if (!scope.companyId || !['request','resolve','dismiss','list'].includes(action)) throw new HttpsError('permission-denied','A current company workspace is required.');
    const management = hasCapability(scope.role,'jobs.assign');
    if (!management && (action !== 'request' && action !== 'list' || !hasCapability(scope.role,'jobs.work'))) throw new HttpsError('permission-denied','Your role cannot manage reassignment requests.');
    if (data.companyId !== undefined && data.companyId !== scope.companyId) throw new HttpsError('permission-denied','Choose this company’s requests.');
    await rateLimit(db,'job-exception',scope.uid,60);
    if (action === 'list') {
      if (!data.jobId && !management) throw new HttpsError('permission-denied','Choose your currently assigned job.');
      return db.runTransaction(async tx => {
        await assertActor(tx,db,scope);
        if (data.jobId) { const job = await tx.get(db.doc(`jobs/${documentId(data.jobId)}`)); if (!job.exists || job.get('companyId') !== scope.companyId || !management && !assigned(scope,job.data())) throw new HttpsError('permission-denied','This job is not available in your workspace.'); }
        let query = db.collection('rlJobExceptions').where('companyId','==',scope.companyId);
        if (data.jobId) query = query.where('jobId','==',data.jobId);
        const rows = await tx.get(query.limit(201));
        return {requests:rows.docs.filter(row => management || row.get('requestedBy') === scope.uid && row.get('status') === 'pending').map(row => ({...summary({...row.data(),id:row.id}),jobId:row.get('jobId')})).sort((a,b)=>String(b.requestedAt).localeCompare(String(a.requestedAt))).slice(0,200),hasMore:rows.size>200};
      });
    }
    const jobId = documentId(data.jobId,'job'), operationId = documentId(data.operationId,'operation');
    if (!/^[A-Za-z0-9-]{16,80}$/.test(operationId) || !Object.hasOwn(data,'expectedVersion')) throw new HttpsError('invalid-argument','Use a stable operation ID and the current job revision.');
    const notes = cleanText(action === 'request' ? data.notes : data.explanation,action === 'request' ? 'request notes' : 'the explanation');
    if (action === 'request' && !REASONS.includes(data.reason)) throw new HttpsError('invalid-argument','Choose a supported reassignment reason.');
    if (action !== 'request' && (!management || !Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 1)) throw new HttpsError('permission-denied','Management access and the current request revision are required.');
    const ref = db.doc(`jobs/${jobId}`), operation = db.doc(`rlJobExceptionOperations/${hash(`${scope.uid}:${operationId}`)}`), fingerprint = hash(JSON.stringify({action,jobId,requestId:data.requestId || null,expectedVersion:version(data.expectedVersion),expectedRevision:data.expectedRevision || null,reason:data.reason || null,notes}));
    return db.runTransaction(async tx => {
      await assertActor(tx,db,scope);
      const [job, previous] = await Promise.all([tx.get(ref),tx.get(operation)]);
      if (!job.exists || job.get('companyId') !== scope.companyId || action === 'request' && !assigned(scope,job.data())) throw new HttpsError('permission-denied','This job is no longer assigned to you or your workspace.');
      if (previous.exists) { if (previous.get('fingerprint') !== fingerprint) throw new HttpsError('already-exists','This operation ID already belongs to another request.'); return {...previous.get('result'),replayed:true}; }
      if (version(job.get('updatedAt')) !== version(data.expectedVersion)) throw new HttpsError('aborted','This job changed. Refresh before submitting the request.');
      const pending = job.get('reassignmentRequest'), at = new Date().toISOString();
      let row, target, existing = false;
      if (action === 'request') {
        if (terminal(job.data())) throw new HttpsError('failed-precondition','Completed or cancelled jobs cannot request reassignment.');
        if (pending?.status === 'pending') {
          target = db.doc(`rlJobExceptions/${documentId(pending.id)}`); const current = await tx.get(target);
          if (!current.exists || current.get('companyId') !== scope.companyId || current.get('jobId') !== jobId || current.get('requestedBy') !== scope.uid || current.get('status') !== 'pending') throw new HttpsError('failed-precondition','The existing request needs management review.');
          row = {...current.data(),id:current.id}; existing = true;
        } else {
          target = db.doc(`rlJobExceptions/${hash(`${scope.companyId}:${jobId}:${scope.uid}:${operationId}`)}`);
          row = {id:target.id,companyId:scope.companyId,jobId,status:'pending',revision:1,reason:data.reason,notes,requestedAt:at,requestedBy:scope.uid,assignmentId:job.get('assignedTo'),assignmentUid:scope.uid};
        }
      } else {
        target = db.doc(`rlJobExceptions/${documentId(data.requestId,'request')}`); const current = await tx.get(target);
        if (!current.exists || current.get('companyId') !== scope.companyId || current.get('jobId') !== jobId) throw new HttpsError('permission-denied','This request belongs to another workspace.');
        if (current.get('status') !== 'pending' || current.get('revision') !== data.expectedRevision || pending?.id !== current.id || pending?.status !== 'pending') throw new HttpsError('aborted','This reassignment request changed. Refresh it before resolving.');
        row = {...current.data(),id:current.id,status:action === 'dismiss' ? 'dismissed' : 'resolved',revision:current.get('revision')+1,resolvedAt:at,resolvedBy:scope.uid,resolution:action,explanation:notes};
      }
      const result = {request:summary(row),jobId,version:version(job.get('updatedAt')),...(existing?{existing:true}:{})};
      if (!existing) {
        if (action === 'request') tx.create(target,row); else tx.update(target,row);
        tx.update(ref,{reassignmentRequest:action === 'request' ? summary(row) : null});
        tx.create(db.doc(`rlJobExceptionAudit/${hash(`${target.id}:${row.revision}`)}`),{companyId:scope.companyId,jobId,requestId:target.id,action,actorId:scope.uid,revision:row.revision,createdAt:at});
      }
      tx.create(operation,{uid:scope.uid,companyId:scope.companyId,jobId,fingerprint,result,createdAt:at});
      return result;
    });
  };
}
async function prepareAssignmentException(tx,db,scope,jobId,before,next) {
  const pending = before.reassignmentRequest;
  if (before.assignedTo === next.assignedTo && (!before.assignedToUid || !next.assignedToUid || before.assignedToUid === next.assignedToUid) || pending?.status !== 'pending') return null;
  const ref = db.doc(`rlJobExceptions/${documentId(pending.id)}`), row = await tx.get(ref);
  if (!row.exists || row.get('companyId') !== scope.companyId || row.get('jobId') !== jobId || row.get('status') !== 'pending' || row.get('assignmentId') !== before.assignedTo || before.assignedToUid && row.get('assignmentUid') !== before.assignedToUid) throw new HttpsError('failed-precondition','The pending reassignment request needs management review.');
  return {ref,row:{...row.data(),id:row.id},audit:db.doc(`rlJobExceptionAudit/${hash(`${row.id}:${row.get('revision')+1}`)}`),scope,jobId};
}
function commitAssignmentException(tx,prepared,at) {
  if (!prepared) return;
  const {ref,row,audit,scope,jobId}=prepared;
  tx.update(ref,{status:'resolved',revision:row.revision+1,resolvedAt:at,resolvedBy:scope.uid,resolution:'reassigned',explanation:'Resolved by an authorized assignment change.'});
  tx.create(audit,{companyId:scope.companyId,jobId,requestId:row.id,action:'reassigned',actorId:scope.uid,revision:row.revision+1,createdAt:at});
}
module.exports={jobExceptionHandlers,prepareAssignmentException,commitAssignmentException,summary,REASONS};
