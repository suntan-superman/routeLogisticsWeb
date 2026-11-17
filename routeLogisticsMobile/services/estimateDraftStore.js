import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { auth } from '../constants/firebase';
import { getClaims } from './tenancy';

const PREFIX = 'rl-estimate-draft-v1';
const safe = value => String(value || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180);
const scope = () => {
  const claims = getClaims(), uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before editing an estimate.');
  return { uid, companyId: claims?.companyId || null, membershipId: claims?.membershipId || null, role: claims?.role || 'owner' };
};
const scopedKey = identity => {
  const current = scope();
  if (!identity || !/^[A-Za-z0-9:_-]{1,240}$/.test(identity)) throw new Error('Reopen the estimate visit before saving this draft.');
  return `${PREFIX}:${auth.app.options.projectId}:${safe(current.uid)}:${safe(current.companyId || 'solo')}:${safe(current.membershipId || 'owner')}:${safe(current.role)}:${safe(identity)}`;
};
const photoDirectory = () => `${FileSystem.documentDirectory}rl-estimate-drafts/`;

export async function loadEstimateDraft(identity) {
  const current = scope(), value = JSON.parse(await AsyncStorage.getItem(scopedKey(identity)) || 'null');
  if (!value) return null;
  if (value.scope?.uid !== current.uid || value.scope?.companyId !== current.companyId || value.scope?.membershipId !== current.membershipId || value.scope?.role !== current.role) throw new Error('This saved estimate belongs to a different work account.');
  return value;
}

export async function saveEstimateDraft(identity, payload) {
  const key = scopedKey(identity), current = scope(), previous = JSON.parse(await AsyncStorage.getItem(key) || 'null');
  const value = { ...payload, identity, scope: current, draftRevision: (previous?.draftRevision || 0) + 1, localEditedAt: new Date().toISOString() };
  await AsyncStorage.setItem(key, JSON.stringify(value));
  return value;
}

export async function retainEstimatePhoto(identity, id, asset) {
  scopedKey(identity);
  if (!asset?.uri || !id) throw new Error('Choose the estimate photo again.');
  const directory = photoDirectory(), localUri = `${directory}${safe(scope().uid)}-${safe(identity)}-${safe(id)}.jpg`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  if (asset.uri !== localUri) await FileSystem.copyAsync({ from: asset.uri, to: localUri });
  return { ...asset, uri: localUri };
}

export async function discardEstimateDraft(identity, photos = []) {
  const key = scopedKey(identity), directory = photoDirectory();
  await AsyncStorage.removeItem(key);
  await Promise.all((photos || []).map(photo => photo?.uri).filter(uri => typeof uri === 'string' && uri.startsWith(directory)).map(uri => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})));
}

export const estimateDraftStateLabel = state => ({ device: 'Saved on device', waiting: 'Waiting to sync', syncing: 'Synchronizing', server: 'Saved to server', conflict: 'Needs review', failed: 'Failed — retry' }[state] || 'Saved on device');
