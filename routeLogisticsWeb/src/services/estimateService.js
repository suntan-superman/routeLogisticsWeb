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
export async function downloadEstimatePdf(estimateId, version) {
  const scope = JSON.stringify([auth.currentUser?.uid, getClaims()]);
  const result = await callEstimate('pdf', { estimateId, expectedVersion: version });
  requireCapability('estimates.manage');
  if (JSON.stringify([auth.currentUser?.uid, getClaims()]) !== scope) throw new Error('Your work account changed. Reopen the estimate before downloading its PDF.');
  if (!/^data:application\/pdf;base64,[A-Za-z0-9+/=\r\n]+$/.test(result.dataUri || '')) throw new Error('The server returned no valid estimate PDF.');
  const link = document.createElement('a'); link.href = result.dataUri; link.download = `estimate-${estimateId}-v${version}.pdf`; link.click();
}
