import { callWorkspace } from './workspaceApi';
import { requireCapability, getClaims } from './tenancy';
import { auth } from './firebase';
export const callEstimate = (action, fields = {}) => { requireCapability('estimates.manage'); return callWorkspace('rlEstimate', { action, ...fields }); };
export const callEstimateApproval = fields => callWorkspace('rlEstimateApproval', fields);
export async function prepareEstimatePhoto(file) {
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => { const value = new Image(); value.onload = () => resolve(value); value.onerror = () => reject(new Error('The selected photo could not be decoded.')); value.src = url; });
    const ratio = Math.min(1, 1280 / Math.max(image.width, image.height)), canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]; if (base64.length > 2 * 1024 * 1024) throw new Error('Choose a smaller photo. The compressed image exceeds the upload limit.');
    return { base64, dataUri: `data:image/jpeg;base64,${base64}` };
  } finally { URL.revokeObjectURL(url); }
}
async function requestEstimatePdf(estimateId, version) {
  const scope = JSON.stringify([auth.currentUser?.uid, getClaims()]);
  const result = await callEstimate('pdf', { estimateId, expectedVersion: version });
  requireCapability('estimates.manage');
  if (JSON.stringify([auth.currentUser?.uid, getClaims()]) !== scope) throw new Error('Your work account changed. Reopen the estimate before downloading its PDF.');
  if (!/^data:application\/pdf;base64,[A-Za-z0-9+/=\r\n]+$/.test(result.dataUri || '')) throw new Error('The server returned no valid estimate PDF.');
  return { dataUri: result.dataUri, filename: /^[A-Za-z0-9_-]+-v\d+\.pdf$/.test(result.filename || '') ? result.filename : `estimate-v${version}.pdf` };
}
export async function previewEstimatePdf(estimateId, version) {
  const popup = window.open('about:blank', '_blank');
  if (!popup) throw new Error('Allow pop-ups for Route Logistics to preview this estimate PDF.');
  popup.opener = null;
  try {
    const { dataUri } = await requestEstimatePdf(estimateId, version), base64 = dataUri.split(',')[1];
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    popup.location.replace(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    popup.close();
    throw error;
  }
}
export async function downloadEstimatePdf(estimateId, version) {
  const { dataUri, filename } = await requestEstimatePdf(estimateId, version);
  const link = document.createElement('a'); link.href = dataUri; link.download = filename; link.click();
}
