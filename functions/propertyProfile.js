const { HttpsError } = require('firebase-functions/v2/https');
const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { requireCapability, checkJob, hasCapability } = require('./access');
const { documentId, rateLimit } = require('./security');
const { propertyFor } = require('./shared/customerLifecycle');
// Read-only projection helpers. Keep this additive API independent of the
// unreleased critical-alert creation and enforcement module.
const propertyIdForJob = job => job?.servicePropertyId || job?.serviceProperty?.propertyId || null;
const activeAlerts = rows => (Array.isArray(rows) ? rows : []).filter(row => row && row.active === true && typeof row.id === 'string' && Number.isInteger(row.version) && row.version > 0);

const CATEGORIES = new Set(['exterior', 'entrance', 'access', 'equipment', 'treatment', 'safety', 'other']);
const MAX_BYTES = 2 * 1024 * 1024;
const text = (value, length) => typeof value === 'string' && value.length <= length && !/[\u0000-\u001f]/.test(value) ? value.trim() : null;
const own = (scope, row) => row?.companyId === scope.companyId;
const management = scope => hasCapability(scope.role, 'customers.manage');
const refs = (db, customerId) => db.collection(`customers/${customerId}/rlPropertyReferences`);
const referenceView = row => ({ id: row.id, category: row.get('category'), caption: row.get('caption') || '', status: row.get('status'), createdAt: row.get('createdAt'), sourceJobId: row.get('sourceJobId') || null });
const validPhotoPath = (path, companyId, customerId, propertyId, sourceJobId) => typeof path === 'string' && (sourceJobId
  ? path.startsWith(`rlJobPhotos/${companyId}/${sourceJobId}/`) || path.startsWith(`companies/${companyId}/jobs/${sourceJobId}/`)
  : path.startsWith(`rlPropertyReferences/${companyId}/${customerId}/${propertyId}/`));

function propertyProfileHandler(db, bucketProvider = () => getStorage().bucket()) {
  return async request => {
    const input = request.data || {}, action = input.action || 'overview';
    const scope = await requireCapability(db, request, action === 'upload' || action === 'approve' || action === 'archive' ? 'customers.manage' : 'jobs.read');
    await rateLimit(db, 'property-profile', scope.uid, 120);
    const customerId = documentId(input.customerId, 'customer'), propertyId = documentId(input.propertyId, 'property');
    const customer = await db.doc(`customers/${customerId}`).get();
    if (!customer.exists || !own(scope, customer.data())) throw new HttpsError('permission-denied', 'Property unavailable.');
    const property = propertyFor(customer.data(), propertyId);
    if (!property) throw new HttpsError('not-found', 'Property unavailable.');
    let assignedJob = null;
    if (!management(scope)) {
      if (!input.jobId) throw new HttpsError('permission-denied', 'Open this property from an assigned job.');
      assignedJob = await db.doc(`jobs/${documentId(input.jobId, 'job')}`).get();
      checkJob(scope, assignedJob.data());
      if (assignedJob.get('customerId') !== customerId || propertyIdForJob(assignedJob.data()) !== propertyId) throw new HttpsError('permission-denied', 'Property is not attached to this job.');
    }
    const collection = refs(db, customerId);
    if (action === 'overview') {
      const [jobs, plans, photos] = await Promise.all([
        db.collection('jobs').where('companyId', '==', scope.companyId).where('customerId', '==', customerId).orderBy('date', 'desc').limit(80).get(),
        db.collection('servicePlans').where('customerId', '==', customerId).limit(50).get(),
        collection.where('propertyId', '==', propertyId).limit(30).get(),
      ]);
      const related = jobs.docs.filter(row => own(scope, row.data()) && propertyIdForJob(row.data()) === propertyId && !row.get('deletedAt'));
      const completed = related.filter(row => row.get('status') === 'completed').sort((a, b) => String(b.get('completedAt') || b.get('date') || '').localeCompare(String(a.get('completedAt') || a.get('date') || '')));
      const upcoming = related.filter(row => ['scheduled', 'en-route', 'in-progress'].includes(row.get('status'))).sort((a, b) => String(a.get('date') || '').localeCompare(String(b.get('date') || ''))).slice(0, 5);
      const visible = photos.docs.filter(row => own(scope, row.data()) && row.get('status') === 'approved');
      return { property: { id: property.id, label: property.label || '', address: property.address, unit: property.unit || '', type: property.type || '', accessInstructions: property.accessInstructions || '', legacy: property.legacy === true }, customer: { id: customer.id, name: customer.get('name') || '' }, alerts: activeAlerts(property.alerts), plans: plans.docs.filter(row => own(scope, row.data()) && row.get('servicePropertyId') === propertyId && !['cancelled', 'canceled'].includes(row.get('status'))).slice(0, 5).map(row => ({ id: row.id, serviceType: row.get('serviceType') || '', status: row.get('status') || '' })), lastCompleted: completed[0] ? { id: completed[0].id, date: completed[0].get('date') || '', serviceType: completed[0].get('serviceType') || '' } : null, upcoming: upcoming.map(row => ({ id: row.id, date: row.get('date') || '', time: row.get('time') || '', serviceType: row.get('serviceType') || '', rescheduleRequired: row.get('rescheduleRequired') === true })), photos: visible.slice(0, 8).map(referenceView), historyLimited: jobs.size === 80 };
    }
    if (action === 'history' || action === 'materials') {
      const limit = Math.max(1, Math.min(Number(input.limit) || 15, 25));
      const source = action === 'history' ? 'jobs' : 'serviceLogs';
      let query = db.collection(source).where('customerId', '==', customerId).orderBy(FieldPath.documentId());
      if (input.after) query = query.startAfter(documentId(input.after, 'cursor'));
      const page = await query.limit(76).get(), scanned = page.docs.slice(0, 75), rows = [];
      let lastScanned = null;
      for (const row of scanned) {
        lastScanned = row.id;
        if (!own(scope, row.data())) continue;
        if (action === 'history') {
          if (propertyIdForJob(row.data()) !== propertyId || row.get('status') !== 'completed' || row.get('deletedAt')) continue;
          const evidence = await db.collection('photos').where('jobId', '==', row.id).limit(1).get();
          rows.push({ id: row.id, date: row.get('date') || '', serviceType: row.get('serviceType') || '', technician: row.get('assignedToName') || '', outcome: row.get('estimateOutcome') || row.get('status'), notes: String(row.get('actualWorkDone') || '').slice(0, 1200), hasEvidence: evidence.docs.some(photo => own(scope, photo.data())) });
        } else {
          const job = row.get('jobId') ? await db.doc(`jobs/${documentId(row.get('jobId'), 'job')}`).get() : null;
          if (!job?.exists || !own(scope, job.data()) || job.get('customerId') !== customerId || propertyIdForJob(job.data()) !== propertyId) continue;
          rows.push({ id: row.id, date: row.get('applicationDate') || job.get('date') || '', product: row.get('product') || '', quantity: row.get('amount') ?? null, unit: row.get('unit') || '', location: row.get('areaTreated') || '', method: row.get('method') || '' });
        }
        if (rows.length >= limit) break;
      }
      return { rows, next: page.size > scanned.length || rows.length >= limit ? lastScanned : null, association: 'Only records with an explicit property ID are included; older ambiguous addresses are omitted.' };
    }
    if (action === 'listPhotos') {
      let query = collection.where('propertyId', '==', propertyId).orderBy(FieldPath.documentId());
      if (input.after) query = query.startAfter(documentId(input.after, 'cursor'));
      const page = await query.limit(21).get();
      return { photos: page.docs.slice(0, 20).filter(row => own(scope, row.data()) && (management(scope) || row.get('status') === 'approved')).map(referenceView), next: page.size > 20 ? page.docs[19].id : null };
    }
    if (action === 'upload' || action === 'propose') {
      const category = input.category, caption = text(input.caption || '', 500);
      if (!CATEGORIES.has(category) || caption === null) throw new HttpsError('invalid-argument', 'Choose a photo category and a short caption.');
      const operationId = documentId(input.operationId, 'photo operation');
      if (!/^[A-Za-z0-9-]{16,80}$/.test(operationId)) throw new HttpsError('invalid-argument', 'Choose a valid photo operation.');
      const reference = collection.doc(`${scope.uid}_${operationId}`), previous = await reference.get();
      if (previous.exists) {
        if (previous.get('propertyId') !== propertyId || previous.get('companyId') !== scope.companyId) throw new HttpsError('already-exists', 'Photo operation belongs to another property.');
        if ((previous.get('sourcePhotoId') || null) !== (action === 'propose' ? documentId(input.photoId, 'job photo') : null)) throw new HttpsError('already-exists', 'Photo operation already references another image.');
        return { photo: referenceView(previous) };
      }
      let storagePath, sourceJobId = null, sourcePhoto = null, sourceJob = null;
      if (action === 'propose') {
        const source = await db.doc(`photos/${documentId(input.photoId, 'job photo')}`).get();
        if (!source.exists || !own(scope, source.data())) throw new HttpsError('permission-denied', 'Job photo unavailable.');
        const job = await db.doc(`jobs/${documentId(source.get('jobId'), 'job')}`).get();
        checkJob(scope, job.data());
        if (job.get('customerId') !== customerId || propertyIdForJob(job.data()) !== propertyId) throw new HttpsError('permission-denied', 'The job photo belongs to another property.');
        storagePath = source.get('storagePath'); sourceJobId = job.id; sourcePhoto = source.ref; sourceJob = job.ref;
      } else {
        if (typeof input.base64 !== 'string' || input.base64.length > Math.ceil(MAX_BYTES * 4 / 3) + 4) throw new HttpsError('invalid-argument', 'Choose a JPEG photo under 2 MB.');
        const bytes = Buffer.from(input.base64, 'base64');
        if (bytes.length > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new HttpsError('invalid-argument', 'A JPEG photo is required.');
        storagePath = `rlPropertyReferences/${scope.companyId}/${customerId}/${propertyId}/${reference.id}.jpg`;
        await bucketProvider().file(storagePath).save(bytes, { resumable: false, contentType: 'image/jpeg', metadata: { cacheControl: 'private, no-store' } });
      }
      if (!validPhotoPath(storagePath, scope.companyId, customerId, propertyId, sourceJobId)) throw new HttpsError('permission-denied', 'Photo path unavailable.');
      const createdAt = new Date().toISOString(), record = { companyId: scope.companyId, customerId, propertyId, category, caption, status: action === 'upload' || management(scope) ? 'approved' : 'proposed', sourceJobId, sourcePhotoId: action === 'propose' ? input.photoId : null, storagePath, createdAt, actorId: scope.uid };
      await db.runTransaction(async tx => {
        const [currentCustomer, currentReference, currentPhoto, currentJob] = await Promise.all([tx.get(customer.ref), tx.get(reference), sourcePhoto ? tx.get(sourcePhoto) : Promise.resolve(null), sourceJob ? tx.get(sourceJob) : Promise.resolve(null)]);
        if (!own(scope, currentCustomer.data()) || !propertyFor(currentCustomer.data(), propertyId)) throw new HttpsError('permission-denied', 'Property changed.');
        if (currentJob) {
          checkJob(scope, currentJob.data());
          if (currentJob.get('customerId') !== customerId || propertyIdForJob(currentJob.data()) !== propertyId) throw new HttpsError('permission-denied', 'The job is no longer linked to this property.');
        }
        if (sourcePhoto && (!currentPhoto.exists || !own(scope, currentPhoto.data()) || currentPhoto.get('jobId') !== sourceJobId || currentPhoto.get('storagePath') !== storagePath)) throw new HttpsError('failed-precondition', 'The job photo changed. Choose another photo.');
        if (!currentReference.exists) { tx.create(reference, record); if (sourcePhoto) tx.update(sourcePhoto, { propertyReferenceIds: FieldValue.arrayUnion(reference.path) }); tx.create(db.collection('rlAudit').doc(), { action: action === 'upload' ? 'property.photo.upload' : 'property.photo.propose', companyId: scope.companyId, customerId, propertyId, referenceId: reference.id, actorId: scope.uid, createdAt }); }
      });
      return { photo: { id: reference.id, category, caption, status: record.status, createdAt, sourceJobId } };
    }
    if (['readPhoto', 'approve', 'archive'].includes(action)) {
      const reference = await collection.doc(documentId(input.photoId, 'reference photo')).get();
      if (!reference.exists || !own(scope, reference.data()) || reference.get('propertyId') !== propertyId) throw new HttpsError('not-found', 'Reference photo unavailable.');
      if (action === 'readPhoto') {
        if (reference.get('status') !== 'approved' && !(management(scope) && reference.get('status') === 'proposed')) throw new HttpsError('permission-denied', 'Reference photo is awaiting approval.');
        const path = reference.get('storagePath'), sourceJobId = reference.get('sourceJobId') || null;
        if (!validPhotoPath(path, scope.companyId, customerId, propertyId, sourceJobId)) throw new HttpsError('permission-denied', 'Photo path unavailable.');
        const file = bucketProvider().file(path), [metadata] = await file.getMetadata();
        if (Number(metadata.size) > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(metadata.contentType)) throw new HttpsError('failed-precondition', 'Unsupported photo.');
        const [bytes] = await file.download();
        return { dataUri: `data:${metadata.contentType};base64,${bytes.toString('base64')}` };
      }
      if (!management(scope)) throw new HttpsError('permission-denied', 'Management approval is required.');
      const target = action === 'approve' ? 'approved' : 'archived';
      await db.runTransaction(async tx => {
        const current = await tx.get(reference.ref);
        if (!current.exists || !own(scope, current.data()) || current.get('propertyId') !== propertyId) throw new HttpsError('permission-denied', 'Photo unavailable.');
        if (current.get('status') === target) return;
        if (action === 'approve' && current.get('status') !== 'proposed') throw new HttpsError('failed-precondition', 'Only proposed photos can be approved.');
        tx.update(reference.ref, { status: target, updatedAt: new Date().toISOString() });
        tx.create(db.collection('rlAudit').doc(), { action: `property.photo.${action}`, companyId: scope.companyId, customerId, propertyId, referenceId: reference.id, actorId: scope.uid, createdAt: new Date().toISOString() });
      });
      return { status: target };
    }
    throw new HttpsError('invalid-argument', 'Choose a property profile action.');
  };
}
module.exports = { propertyProfileHandler, validPhotoPath };
