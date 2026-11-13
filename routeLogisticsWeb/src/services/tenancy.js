import { where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';

// Tenancy claims minted server-side by the `syncClaims` function: { companyId, role } or null for solo users.
let claims = null;

export const getClaims = () => claims;

export async function loadClaims(user) {
  if (!user) {
    claims = null;
    return null;
  }
  const token = await user.getIdTokenResult();
  if (auth.currentUser?.uid !== user.uid) return null;
  claims = token.claims.companyId ? { companyId: token.claims.companyId, role: token.claims.role } : null;
  return claims;
}

// Asks the server to recompute claims (company creation, invite acceptance, removal) and refreshes the ID token.
// Failures are non-fatal: the user falls back to solo (userId) scope.
export async function syncTenancy() {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    await httpsCallable(functions, 'syncClaims')();
    await user.getIdToken(true);
  } catch (error) {
    console.error('syncClaims failed; using existing claims', error);
  }
  return loadClaims(user);
}

export const getScope = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('No user is currently signed in');
  return claims ? { field: 'companyId', value: claims.companyId } : { field: 'userId', value: uid };
};

export const scopeWhere = () => {
  const { field, value } = getScope();
  return where(field, '==', value);
};

// Attribution fields to stamp on every new tenant-owned document.
export const tenantFields = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('No user is currently signed in');
  return claims ? { userId: uid, companyId: claims.companyId } : { userId: uid };
};

export const isInScope = (docData) => {
  const { field, value } = getScope();
  return docData?.[field] === value;
};

export const canManage = () => !claims || ['owner', 'admin', 'manager'].includes(claims.role);
