import { where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../constants/firebase';
import NetInfo from '@react-native-community/netinfo';
import { workspacePermissions } from './workspacePolicy';

let claims = null, workspace = null, sessionUid = null, revision = 0;
export const getClaims = () => auth.currentUser?.uid === sessionUid ? claims : null;
export const getWorkspace = () => auth.currentUser?.uid === sessionUid ? workspace : null;
export const getPermissions = () => workspacePermissions(getWorkspace(), getClaims());

export async function syncTenancy(user = auth.currentUser) {
  const ticket = ++revision;
  claims = null; workspace = null; sessionUid = null;
  if (!user) return null;
  const existing = await user.getIdTokenResult();
  const network = await NetInfo.fetch();
  if (ticket !== revision || auth.currentUser?.uid !== user.uid) return null;
  if (network.isConnected === false || network.isInternetReachable === false) {
    sessionUid = user.uid;
    claims = existing.claims.companyId ? existing.claims : null;
    workspace = claims ? { status: 'company' } : null;
    return claims;
  }
  const result = await httpsCallable(functions, 'syncClaims')();
  const fresh = await user.getIdTokenResult(true);
  if (ticket !== revision || auth.currentUser?.uid !== user.uid) return null;
  sessionUid = user.uid;
  claims = fresh.claims.companyId ? fresh.claims : null;
  workspace = result.data.workspace || (claims ? { status: 'company' } : { status: 'unavailable' });
  return claims;
}

export function restoreOfflineWorkspace(saved, user) {
  if (user.uid !== sessionUid || saved.companyId !== (claims?.companyId || null) || saved.role !== (claims?.role || null)
    || saved.membershipId !== (claims?.membershipId || null)) throw new Error('Connect to refresh your current workspace.');
  workspace = saved.workspace;
}

export function requireWorkspace(manage = false) {
  const permissions = getPermissions();
  if (!auth.currentUser || !permissions.canAccess || (manage && !permissions.canManage)) {
    throw new Error(manage ? 'Your role does not allow this change. Ask your manager.' : 'Accept your company invitation or refresh your workspace before continuing.');
  }
}
export const scopeWhere = () => {
  requireWorkspace();
  return claims ? where('companyId', '==', claims.companyId) : where('userId', '==', auth.currentUser.uid);
};
export const tenantFields = () => {
  requireWorkspace();
  return { userId: auth.currentUser.uid, ...(claims ? { companyId: claims.companyId } : {}) };
};
export const canManage = () => getPermissions().canManage;
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
