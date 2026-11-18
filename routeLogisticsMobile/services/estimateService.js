import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { callWorkspace } from './workspaceApi';
import { getPermissions } from './tenancy';
const canEstimate = () => getPermissions().can('estimates.manage') || getPermissions().can('estimates.prepareAssigned');
export function callEstimate(action, fields = {}) {
  if (!canEstimate()) return Promise.reject(new Error('Estimate preparation permission is required.'));
  return callWorkspace('rlEstimate', { action, ...fields }, { timeout: 60000 });
}
export async function prepareEstimatePhoto(asset) {
  const dimension = Number(asset.width) >= Number(asset.height) ? 'width' : 'height';
  const photo = await manipulateAsync(asset.uri, [{ resize: { [dimension]: 1280 } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!photo.base64 || photo.base64.length > 2 * 1024 * 1024) throw new Error('The photo is too large. Choose a smaller photo or take another picture. Your selection remains here.');
  return photo;
}
