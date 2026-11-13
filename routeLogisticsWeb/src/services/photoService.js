import { readWorkspace, callWorkspace } from './workspaceApi';
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

export async function uploadJobPhoto(job, file, caption = '') {
  const blob = await compressImage(file);
  if (blob.size > 2 * 1024 * 1024) throw new Error('Choose a smaller photo (maximum 2 MB after compression).');
  const encoded = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
  return callWorkspace('rlJobPhoto', { action: 'upload', jobId: job.id, operationId: crypto.randomUUID(), base64: encoded, caption });
}
export async function listJobPhotos(jobId) {
  const { photos } = await readWorkspace('photos', { jobId });
  return photos;
}
export const readJobPhoto = photoId => callWorkspace('rlJobPhoto', { action: 'read', photoId });
export const deleteJobPhoto = photo => callWorkspace('rlJobPhoto', { action: 'delete', photoId: photo.id });
