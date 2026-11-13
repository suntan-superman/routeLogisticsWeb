const { HttpsError } = require('firebase-functions/v2/https');
const { getStorage } = require('firebase-admin/storage');
const { requireCapability, checkJob } = require('./access');
const { documentId, rateLimit } = require('./security');
const MAX_BYTES = 2 * 1024 * 1024;
function jobPhotoHandler(db, bucketProvider = () => getStorage().bucket()) {
  return async request => {
    const scope = await requireCapability(db, request, 'jobs.work'), data = request.data || {};
    await rateLimit(db, 'job-photo', scope.uid, 60);
    if (data.action === 'read' || data.action === 'delete') {
      if (data.action === 'delete') await requireCapability(db, request, 'jobs.schedule');
      const photo = await db.doc(`photos/${documentId(data.photoId)}`).get();
      if (!photo.exists) throw new HttpsError('not-found', 'Photo unavailable.');
      const job = await db.doc(`jobs/${documentId(photo.get('jobId'))}`).get();
      checkJob(scope, job.data());
      if (scope.companyId ? photo.get('companyId') !== scope.companyId : photo.get('companyId') || photo.get('userId') !== scope.uid) throw new HttpsError('permission-denied', 'Photo unavailable.');
      const path = photo.get('storagePath');
      const legacyPrefix = `${scope.companyId ? `companies/${scope.companyId}` : `users/${scope.uid}`}/jobs/${job.id}/`;
      const privatePrefix = `rlJobPhotos/${scope.companyId || scope.uid}/${job.id}/`;
      if (typeof path !== 'string' || (!path.startsWith(legacyPrefix) && !path.startsWith(privatePrefix))) throw new HttpsError('permission-denied', 'Photo path unavailable.');
      const file = bucketProvider().file(path);
      if (data.action === 'delete') {
        await db.collection('rlAudit').add({ action: 'photo.delete', photoId: photo.id, jobId: job.id, companyId: scope.companyId, actorId: scope.uid, createdAt: new Date().toISOString() });
        await file.delete({ ignoreNotFound: true }); await photo.ref.delete(); return { deleted: true };
      }
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) > 10 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(metadata.contentType)) throw new HttpsError('failed-precondition', 'Unsupported photo.');
      const [bytes] = await file.download();
      return { dataUri: `data:${metadata.contentType};base64,${bytes.toString('base64')}` };
    }
    if (data.action !== 'upload') throw new HttpsError('invalid-argument', 'Choose a photo action.');
    const jobId = documentId(data.jobId), operationId = documentId(data.operationId);
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(operationId) || typeof data.base64 !== 'string' || data.base64.length > Math.ceil(MAX_BYTES * 4 / 3) + 4) throw new HttpsError('invalid-argument', 'Photo must be a JPEG smaller than 2 MB.');
    const bytes = Buffer.from(data.base64, 'base64');
    if (bytes.length > MAX_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new HttpsError('invalid-argument', 'A JPEG photo is required.');
    const jobRef = db.doc(`jobs/${jobId}`), job = await jobRef.get();
    checkJob(scope, job.data());
    const photoRef = db.doc(`photos/${scope.uid}_${operationId}`), previous = await photoRef.get();
    if (previous.exists) {
      if (previous.get('jobId') !== jobId) throw new HttpsError('already-exists', 'Photo operation belongs to a different job.');
      return { id: photoRef.id };
    }
    const storagePath = `rlJobPhotos/${scope.companyId || scope.uid}/${jobId}/${scope.uid}_${operationId}.jpg`;
    const file = bucketProvider().file(storagePath);
    // GCS upload deliberately omits firebaseStorageDownloadTokens. All future reads reauthorize.
    await file.save(bytes, { resumable: false, contentType: 'image/jpeg', metadata: { cacheControl: 'private, no-store' } });
    await db.runTransaction(async tx => {
      const current = await tx.get(jobRef);
      checkJob(scope, current.data());
      tx.set(photoRef, { userId: scope.uid, ...(scope.companyId ? { companyId: scope.companyId } : {}), jobId, customerId: current.get('customerId') || null, storagePath, caption: String(data.caption || '').slice(0, 500), createdAt: new Date().toISOString() });
    });
    return { id: photoRef.id };
  };
}
module.exports = { jobPhotoHandler };
