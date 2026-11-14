import { where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../constants/firebase';
import NetInfo from '@react-native-community/netinfo';
import { workspacePermissions } from './workspacePolicy';

let claims = null, workspace = null, sessionUid = null, revision = 0, pending = null;
export const getClaims = () => auth.currentUser?.uid === sessionUid ? claims : null;
export const getWorkspace = () => auth.currentUser?.uid === sessionUid ? workspace : null;
export const getPermissions = () => workspacePermissions(getWorkspace(), getClaims());

export function syncTenancy(user = auth.currentUser) {
  if (!user) {
    revision++; pending = null; claims = null; workspace = null; sessionUid = null;
    return Promise.resolve(null);
  }
  if (pending?.uid === user.uid) return pending.promise;
  // Keep a verified same-account snapshot until its replacement is complete.
  // Clearing it during an ID-token refresh made active work appear revoked.
  if (sessionUid !== user.uid) { claims = null; workspace = null; sessionUid = null; }
  const ticket = ++revision, current = () => ticket === revision && auth.currentUser?.uid === user.uid;
  const task = (async () => {
    const [existing, network] = await Promise.all([user.getIdTokenResult(), NetInfo.fetch()]);
    if (!current()) return null;
    if (network.isConnected === false || network.isInternetReachable === false) {
      const nextClaims = existing.claims.companyId ? existing.claims : null;
      const same = sessionUid === user.uid && ['companyId', 'role', 'membershipId'].every(key => claims?.[key] === nextClaims?.[key]);
      const nextWorkspace = same ? workspace : nextClaims ? { status: 'company' } : null;
      claims = nextClaims; workspace = nextWorkspace; sessionUid = user.uid;
      return claims;
    }
    const result = await httpsCallable(functions, 'syncClaims')();
    let fresh = await user.getIdTokenResult(true);
    const expected = result.data.claims || null;
    const matches = token => ['companyId', 'role', 'membershipId'].every(key => (token?.[key] || null) === (expected?.[key] || null));
    if (!matches(fresh.claims)) fresh = await user.getIdTokenResult(true);
    if (!current()) return null;
    if (!matches(fresh.claims)) throw Object.assign(new Error('Your sign-in token has not received the current workspace yet. Try refreshing access again.'), { code: 'claims-stale' });
    const nextClaims = fresh.claims.companyId ? fresh.claims : null;
    const nextWorkspace = result.data.workspace || (nextClaims ? { status: 'company' } : { status: 'unavailable' });
    // Publish claims and workspace as one synchronous snapshot.
    claims = nextClaims; workspace = nextWorkspace; sessionUid = user.uid;
    return claims;
  })();
  const promise = task.finally(() => { if (pending?.promise === promise) pending = null; });
  pending = { uid: user.uid, promise };
  return promise;
}

export function restoreOfflineWorkspace(saved, user) {
  if (saved.id !== user.uid || user.uid !== sessionUid || saved.companyId !== (claims?.companyId || null) || saved.role !== (claims?.role || null)
    || saved.membershipId !== (claims?.membershipId || null)) throw new Error('Connect to refresh your current workspace.');
  workspace = saved.workspace;
}

export function requireWorkspace(manage = false) {
  const permissions = getPermissions();
  if (!auth.currentUser || !permissions.canAccess || (manage && !permissions.canManage)) {
    throw Object.assign(new Error(manage ? 'Your role does not allow this change. Ask your manager.' : 'Accept your company invitation or refresh your workspace before continuing.'), { code: 'workspace-unavailable' });
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
