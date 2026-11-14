import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { callWorkspace } from './workspaceApi';
import { getPermissions, getClaims } from './tenancy';
import { auth } from '../constants/firebase';
const scopeKey = () => JSON.stringify([auth.currentUser?.uid, getClaims()?.companyId, getClaims()?.role, getClaims()?.membershipId]);
export function callEstimate(action, fields = {}) {
  if (!getPermissions().can('estimates.manage')) return Promise.reject(new Error('Estimate management permission is required.'));
  return callWorkspace('rlEstimate', { action, ...fields }, { timeout: 60000 });
}
export async function prepareEstimatePhoto(asset) {
  const dimension = Number(asset.width) >= Number(asset.height) ? 'width' : 'height';
  const photo = await manipulateAsync(asset.uri, [{ resize: { [dimension]: 1280 } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!photo.base64 || photo.base64.length > 2 * 1024 * 1024) throw new Error('The photo is too large. Choose a smaller photo or take another picture. Your selection remains here.');
  return photo;
}
export async function shareEstimatePdf(estimateId, version) {
  const scope = scopeKey();
  const result = await callEstimate('pdf', { estimateId, expectedVersion: version });
  if (scopeKey() !== scope || !getPermissions().can('estimates.manage')) throw new Error('Your work account changed. Reopen the estimate before sharing its PDF.');
  if (!/^data:application\/pdf;base64,[A-Za-z0-9+/=\r\n]+$/.test(result.dataUri || '')) throw new Error('The server returned no valid estimate PDF.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('PDF sharing is not available on this device. Use the web app to download the estimate.');
  const file = `${FileSystem.cacheDirectory}estimate-${String(estimateId).replace(/[^a-z0-9_-]/gi, '')}-v${Number(version)}.pdf`;
  try { await FileSystem.writeAsStringAsync(file, result.dataUri.split(',')[1], { encoding: FileSystem.EncodingType.Base64 }); if (scopeKey() !== scope || !getPermissions().can('estimates.manage')) throw new Error('Your work account changed. The temporary PDF was removed.'); await Sharing.shareAsync(file, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share estimate PDF' }); }
  finally { await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {}); }
}
