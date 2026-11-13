import { collection, getDocs, addDoc, deleteDoc, doc, query, where, limit, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from './firebase';
import { getClaims, scopeWhere, tenantFields } from './tenancy';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

// Downscales and re-encodes in the browser so field photos stay well under the 10MB Storage limit.
async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Only image files can be uploaded');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Image is too large (max 25MB)');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('Could not process image');
  return blob;
}

const basePath = () => {
  const claims = getClaims();
  return claims ? `companies/${claims.companyId}` : `users/${auth.currentUser.uid}`;
};

export async function uploadJobPhoto(job, file, caption = '') {
  const blob = await compressImage(file);
  const storagePath = `${basePath()}/jobs/${job.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(fileRef);
  try {
    const docRef = await addDoc(collection(db, 'photos'), {
      ...tenantFields(),
      jobId: job.id,
      customerId: job.customerId || null,
      storagePath,
      url,
      caption,
      createdAt: serverTimestamp(),
    });
    return { success: true, photo: { id: docRef.id, jobId: job.id, storagePath, url, caption } };
  } catch (error) {
    // Don't leave an orphaned file behind if the metadata write is rejected.
    await deleteObject(fileRef).catch(() => {});
    throw error;
  }
}

export async function listJobPhotos(jobId) {
  const snap = await getDocs(query(collection(db, 'photos'), scopeWhere(), where('jobId', '==', jobId), limit(100)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

export async function deleteJobPhoto(photo) {
  await deleteDoc(doc(db, 'photos', photo.id));
  if (photo.storagePath) await deleteObject(ref(storage, photo.storagePath)).catch(() => {});
}
