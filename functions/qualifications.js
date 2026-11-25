const { HttpsError } = require('firebase-functions/v2/https');
const { createHash } = require('node:crypto');
const { requireCapability } = require('./access');
const { documentId, rateLimit } = require('./security');

const TYPES = new Set(['internal_skill', 'training', 'external_credential']);
const STATUSES = new Set(['management_recorded', 'management_verified']);
const key = value => String(value || '').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
const digest = value => createHash('sha256').update(value).digest('hex');
const requirementRef = (db, companyId, service) => db.doc(`rlServiceQualificationRequirements/${digest(`${companyId}:${key(service)}`)}`);
const staffRef = (db, companyId, uid, qualificationId) => db.doc(`rlStaffQualifications/${digest(`${companyId}:${uid}:${qualificationId}`)}`);
const read = (tx, ref) => tx ? tx.get(ref) : ref.get();
function date(value, label, optional = false) {
  if (optional && !value) return null;
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new HttpsError('invalid-argument', `Choose a valid ${label}.`);
  return value;
}
function text(value, label, max, required = false) {
  if (value !== undefined && typeof value !== 'string') throw new HttpsError('invalid-argument', `Enter a valid ${label}.`);
  const result = (value || '').trim();
  if (result.length > max || required && !result) throw new HttpsError('invalid-argument', `Enter a ${label} under ${max} characters.`);
  return result;
}
function evaluate(required, qualifications, records, serviceDate) {
  const missing = [];
  for (const id of required) {
    const item = qualifications.find(row => row.id === id);
    const row = records.find(entry => entry.qualificationId === id);
    const name = item?.name || 'Required qualification';
    if (!item?.active) { missing.push(`${name} is inactive`); continue; }
    if (!row?.active || !STATUSES.has(row.verificationStatus)) { missing.push(`${name} is not recorded for this technician`); continue; }
    if (item.type === 'external_credential' && row.verificationStatus !== 'management_verified') { missing.push(`${name} needs management verification`); continue; }
    if (row.effectiveDate > serviceDate) { missing.push(`${name} takes effect after this visit`); continue; }
    if (row.expiresAt && row.expiresAt < serviceDate) { missing.push(`${name} expires before this visit`); continue; }
    if (item.tracksExpiration && !row.expiresAt) missing.push(`${name} needs an expiration date`);
  }
  return { eligible: missing.length === 0, missing };
}
async function checkAssignment(db, tx, scope, person, job, company) {
  if (!scope.companyId || !person || !job) return { eligible: true, missing: [] };
  const configured = company?.get?.('qualificationRequirementsConfigured') === true;
  const known = [...(company?.get?.('serviceCategories') || []), ...(company?.get?.('services') || [])].filter(value => typeof value === 'string').map(key);
  const services = [...new Set([job.serviceCategory, job.serviceType].filter(value => known.includes(key(value))).map(key))];
  if (!job.serviceType && !job.serviceCategory) return configured ? { eligible: false, missing: ['Select a company service category before assigning field work.'] } : { eligible: true, missing: [] };
  if (configured && !services.length) return { eligible: false, missing: ['Select a company service category with a known qualification policy.'] };
  const requirements = await Promise.all(services.map(service => read(tx, requirementRef(db, scope.companyId, service))));
  const required = [...new Set(requirements.flatMap(row => row.exists && row.get('companyId') === scope.companyId ? row.get('qualificationIds') || [] : []))];
  if (!required.length) return { eligible: true, missing: [] };
  const ids = [...new Set(required)].slice(0, 20);
  const [catalog, staff] = await Promise.all([
    Promise.all(ids.map(id => read(tx, db.doc(`rlQualifications/${documentId(id, 'qualification')}`)))),
    Promise.all(ids.map(id => read(tx, staffRef(db, scope.companyId, person.uid, id)))),
  ]);
  return evaluate(ids, catalog.map(row => ({ id: row.id, ...row.data(), active: row.exists && row.get('companyId') === scope.companyId && row.get('active') !== false })), staff.map(row => row.exists && row.get('companyId') === scope.companyId && row.get('memberUid') === person.uid ? row.data() : null).filter(Boolean), date(job.date, 'appointment date'));
}
function qualificationHandlers(db) {
  const audit = (tx, scope, action, targetId, before, after) => tx.create(db.collection('rlQualificationAudit').doc(), { companyId: scope.companyId, actorId: scope.uid, action, targetId, before, after, createdAt: new Date().toISOString() });
  const membership = async (tx, scope, memberId) => {
    const company = await read(tx, db.doc(`companies/${scope.companyId}`));
    if (company.exists && memberId === company.get('ownerId')) return { uid: memberId, name: 'Company owner' };
    const row = await read(tx, db.doc(`teamMembers/${documentId(memberId, 'team member')}`));
    if (!row.exists || row.get('companyId') !== scope.companyId || row.get('status') !== 'active' || !row.get('uid')) throw new HttpsError('failed-precondition', 'Select an active member of this company.');
    return { uid: row.get('uid'), name: row.get('name') || row.get('email') || '' };
  };
  return async request => {
    const scope = await requireCapability(db, request, 'jobs.assign'), data = request.data || {}, action = data.action;
    await rateLimit(db, 'qualification-management', scope.uid, 90);
    if (data.companyId !== undefined && data.companyId !== scope.companyId) throw new HttpsError('permission-denied', 'Choose your own company.');
    if (action === 'list') {
      const [catalog, staff, requirements] = await Promise.all(['rlQualifications', 'rlStaffQualifications', 'rlServiceQualificationRequirements'].map(name => db.collection(name).where('companyId', '==', scope.companyId).limit(501).get()));
      if ([catalog, staff, requirements].some(rows => rows.size > 500)) throw new HttpsError('resource-exhausted', 'Qualification records exceed the management view limit.');
      return { catalog: catalog.docs.map(row => ({ id: row.id, ...row.data() })), staff: staff.docs.map(row => ({ id: row.id, ...row.data() })), requirements: requirements.docs.map(row => ({ id: row.id, ...row.data() })) };
    }
    if (action === 'attention') {
      const company = await db.doc(`companies/${scope.companyId}`).get();
      const zone = company.get('timeZone') || 'America/Los_Angeles';
      let today;
      try { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value])); today = `${parts.year}-${parts.month}-${parts.day}`; } catch { today = new Date().toISOString().slice(0, 10); }
      let query = db.collection('jobs').where('companyId', '==', scope.companyId).where('date', '>=', today).orderBy('date').limit(101);
      if (data.afterJobId) {
        const cursor = await db.doc(`jobs/${documentId(data.afterJobId, 'job')}`).get();
        if (!cursor.exists || cursor.get('companyId') !== scope.companyId || cursor.get('date') < today) throw new HttpsError('failed-precondition', 'Refresh the future-assignment review.');
        query = query.startAfter(cursor);
      }
      const jobs = await query.get();
      const attention = [];
      for (const row of jobs.docs.slice(0, 100)) {
        const job = row.data();
        if (!job.assignedTo || ['completed', 'cancelled', 'deleted'].includes(job.status)) continue;
        let uid = job.assignedToUid;
        if (!uid && job.assignedTo === company.get('ownerId')) uid = job.assignedTo;
        if (!uid) { const member = await db.doc(`teamMembers/${documentId(job.assignedTo, 'team member')}`).get(); if (member.get('companyId') === scope.companyId) uid = member.get('uid'); }
        if (!uid) { attention.push({ jobId: row.id, date: job.date, reason: 'Assignment identity needs review.' }); continue; }
        const result = await checkAssignment(db, null, scope, { uid }, job, company);
        if (!result.eligible) attention.push({ jobId: row.id, date: job.date, reason: result.missing.join('; ') });
      }
      return { attention, nextAfterJobId: jobs.size > 100 ? jobs.docs[99].id : null };
    }
    if (action === 'catalog-save') {
      const name = text(data.name, 'qualification name', 120, true), description = text(data.description, 'description', 500), type = data.type;
      if (!TYPES.has(type) || typeof data.active !== 'boolean' || typeof data.tracksExpiration !== 'boolean') throw new HttpsError('invalid-argument', 'Choose a valid qualification type and status.');
      const ref = data.id ? db.doc(`rlQualifications/${documentId(data.id, 'qualification')}`) : db.collection('rlQualifications').doc();
      await db.runTransaction(async tx => { const old = await tx.get(ref); if (old.exists && old.get('companyId') !== scope.companyId) throw new HttpsError('permission-denied', 'Qualification belongs to another company.'); const now = new Date().toISOString(); const next = { companyId: scope.companyId, name, description, type, active: data.active, tracksExpiration: data.tracksExpiration, createdAt: old.get('createdAt') || now, createdBy: old.get('createdBy') || scope.uid, updatedAt: now, updatedBy: scope.uid }; tx.set(ref, next); audit(tx, scope, 'catalog.save', ref.id, old.data() || null, next); });
      return { id: ref.id };
    }
    if (action === 'staff-save') {
      const qualificationId = documentId(data.qualificationId, 'qualification'), memberId = documentId(data.memberId, 'team member'), effectiveDate = date(data.effectiveDate, 'effective date'), expiresAt = date(data.expiresAt, 'expiration date', true);
      if (expiresAt && expiresAt < effectiveDate) throw new HttpsError('invalid-argument', 'Expiration must follow the effective date.');
      if (!STATUSES.has(data.verificationStatus) || typeof data.active !== 'boolean') throw new HttpsError('invalid-argument', 'Choose a valid management verification status.');
      const credentialReference = text(data.credentialReference, 'credential reference', 200), internalNotes = text(data.internalNotes, 'internal notes', 1000);
      await db.runTransaction(async tx => { const [person, qual] = await Promise.all([membership(tx, scope, memberId), tx.get(db.doc(`rlQualifications/${qualificationId}`))]); if (!qual.exists || qual.get('companyId') !== scope.companyId) throw new HttpsError('permission-denied', 'Qualification belongs to another company.'); const ref = staffRef(db, scope.companyId, person.uid, qualificationId), old = await tx.get(ref), now = new Date().toISOString(); const next = { companyId: scope.companyId, memberUid: person.uid, memberId, qualificationId, effectiveDate, expiresAt, credentialReference, internalNotes, verificationStatus: data.verificationStatus, active: data.active, createdAt: old.get('createdAt') || now, createdBy: old.get('createdBy') || scope.uid, updatedAt: now, updatedBy: scope.uid }; tx.set(ref, next); audit(tx, scope, 'staff.save', ref.id, old.data() || null, next); });
      return { saved: true };
    }
    if (action === 'requirements-save') {
      const serviceName = text(data.serviceName, 'service name', 120, true), qualificationIds = data.qualificationIds;
      if (!Array.isArray(qualificationIds) || qualificationIds.length > 20 || qualificationIds.some(id => typeof id !== 'string') || new Set(qualificationIds).size !== qualificationIds.length) throw new HttpsError('invalid-argument', 'Choose up to twenty distinct qualifications.');
      await db.runTransaction(async tx => { const company = await tx.get(db.doc(`companies/${scope.companyId}`)); if (!company.exists || ![...(company.get('serviceCategories') || []), ...(company.get('services') || [])].some(name => key(name) === key(serviceName))) throw new HttpsError('failed-precondition', 'Choose a service defined by your company.'); const rows = await Promise.all(qualificationIds.map(id => tx.get(db.doc(`rlQualifications/${documentId(id, 'qualification')}`)))); if (rows.some(row => !row.exists || row.get('companyId') !== scope.companyId || row.get('active') === false)) throw new HttpsError('failed-precondition', 'Choose active qualifications from your own company.'); const ref = requirementRef(db, scope.companyId, serviceName), old = await tx.get(ref), now = new Date().toISOString(), next = { companyId: scope.companyId, serviceKey: key(serviceName), serviceName, qualificationIds, createdAt: old.get('createdAt') || now, createdBy: old.get('createdBy') || scope.uid, updatedAt: now, updatedBy: scope.uid }; tx.set(ref, next); if (qualificationIds.length) tx.update(company.ref, { qualificationRequirementsConfigured: true }); audit(tx, scope, 'requirements.save', ref.id, old.data() || null, next); });
      return { saved: true };
    }
    throw new HttpsError('invalid-argument', 'Choose a qualification action.');
  };
}
module.exports = { qualificationHandlers, checkAssignment, evaluate, requirementRef, staffRef, key };
