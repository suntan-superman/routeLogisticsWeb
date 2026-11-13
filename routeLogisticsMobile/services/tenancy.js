import { where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../constants/firebase';
import NetInfo from '@react-native-community/netinfo';
let claims = null;
export const getClaims = () => claims;
export async function syncTenancy(user = auth.currentUser) {
  claims = null;
  if (!user) return null;
  const existing = await user.getIdTokenResult();
  if (auth.currentUser?.uid !== user.uid) return null;
  claims = existing.claims.companyId ? existing.claims : null;
  const network = await NetInfo.fetch();
  if (network.isConnected === false || network.isInternetReachable === false) return claims;
  try {
    await httpsCallable(functions, 'syncClaims')();
    const fresh = await user.getIdTokenResult(true);
    if (auth.currentUser?.uid === user.uid) claims = fresh.claims.companyId ? fresh.claims : null;
  } catch (error) {
    // Cached signed claims retain offline access; server rules still enforce membership on reconnect.
    if (!['functions/unavailable', 'functions/deadline-exceeded', 'auth/network-request-failed'].includes(error.code)) throw error;
  }
  return claims;
}
export const scopeWhere = () => {
  if (!auth.currentUser) throw new Error('Sign in required.');
  return claims ? where('companyId', '==', claims.companyId) : where('userId', '==', auth.currentUser.uid);
};
export const tenantFields = () => {
  if (!auth.currentUser) throw new Error('Sign in required.');
  return { userId: auth.currentUser.uid, ...(claims ? { companyId: claims.companyId } : {}) };
};
export const canManage = () => !claims || ['owner', 'admin', 'manager'].includes(claims.role);
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
