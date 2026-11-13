import { where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import policy from '../../../functions/shared/capabilities.json';
let claims = null, workspace = null, sessionUid = null;
export const getClaims = () => auth.currentUser?.uid === sessionUid ? claims : null;
export const getWorkspace = () => auth.currentUser?.uid === sessionUid ? workspace : null;
export const can = capability => auth.currentUser?.emailVerified === true && ['company', 'solo'].includes(getWorkspace()?.status)
  && (policy.roles[getClaims()?.role || (getWorkspace()?.status === 'solo' ? 'owner' : '')] || []).includes(capability);
export const canManage = () => can('jobs.schedule');
export const isTechnician = () => getClaims()?.role === 'technician';
export async function loadClaims(user) {
  if (!user) { claims = null; workspace = null; sessionUid = null; return null; }
  if (sessionUid !== user.uid) { claims = null; workspace = null; sessionUid = null; }
  const token = await user.getIdTokenResult();
  if (auth.currentUser?.uid !== user.uid) return null;
  sessionUid = user.uid;
  claims = token.claims.companyId ? { companyId: token.claims.companyId, role: token.claims.role, membershipId: token.claims.membershipId || null } : null;
  return claims;
}
export async function syncTenancy() {
  const user = auth.currentUser;
  if (!user) return loadClaims(null);
  try {
    const result = await httpsCallable(functions, 'syncClaims')();
    await user.getIdToken(true);
    await loadClaims(user);
    if (auth.currentUser?.uid === user.uid) workspace = result.data.workspace || { status: 'unavailable' };
    return claims;
  } catch (error) {
    if (auth.currentUser?.uid === user.uid) workspace = { status: 'unavailable' };
    throw error;
  }
}
export function getScope() {
  const uid = auth.currentUser?.uid;
  if (!uid || !['company', 'solo'].includes(getWorkspace()?.status) || !auth.currentUser.emailVerified) throw new Error('Refresh your workspace or accept your invitation before continuing.');
  return claims ? { field: 'companyId', value: claims.companyId } : { field: 'userId', value: uid };
}
export const scopeWhere = () => { const { field, value } = getScope(); return where(field, '==', value); };
export const tenantFields = () => { getScope(); return { userId: auth.currentUser.uid, ...(claims ? { companyId: claims.companyId } : {}) }; };
export const isInScope = data => { const { field, value } = getScope(); return data?.[field] === value; };
export const requireCapability = capability => { if (!can(capability)) throw new Error('Your role does not allow this operation.'); };
