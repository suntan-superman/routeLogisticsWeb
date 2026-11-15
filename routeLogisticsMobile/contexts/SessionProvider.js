import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isOffline, purgeLegacyReadCaches, purgeOtherRoleCaches, offlineScope } from '../services/offline';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../constants/firebase';
import { AuthService } from '../services/firebase';
import { syncTenancy, getWorkspace, restoreOfflineWorkspace } from '../services/tenancy';
import { companyProfile, serviceNames, workspacePermissions, parseInvitationLink } from '../services/workspacePolicy';
import { requestStaffCode, signInWithStaffCode } from '../services/staffLogin';
import { readWorkspace } from '../services/workspaceApi';
import { isNativeInteractionActive, subscribeNativeInteraction, beginNativeInteraction } from '../services/nativeInteraction';
import { stopShiftTracking } from '../services/workTracking';
import { signOutNativePush } from '../services/nativePush';
import { createMobileAccountDeletion, resumeDeletedAccountCleanup } from '../services/accountDeletion';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
const sessionKey = uid => `rl-session-v3:${uid}`;
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null), [isLoading, setIsLoading] = useState(true), [sessionError, setSessionError] = useState('');
  const [accessStatus, setAccessStatus] = useState('loading'), [accessError, setAccessError] = useState('');
  const [workspaceValidatedAt, setWorkspaceValidatedAt] = useState(null);
  const generation = useRef(0), hydration = useRef(null), currentUser = useRef(user);
  const deletedAccounts = useRef(new Set()), cleanupFailed = useRef(false), cleanupTask = useRef(null);
  const deletion = useRef(null);
  const finishDeletedSession = async uid => {
    if (auth.currentUser?.uid && auth.currentUser.uid !== uid) return;
    generation.current++; hydration.current = null;
    const result = await AuthService.signOut();
    if (!result.success) throw new Error('Your account was deleted, but this device could not sign out. Retry to finish clearing the session.');
    currentUser.current = null; setUser(null); setSessionError(''); setAccessError(''); setAccessStatus('signed-out'); setWorkspaceValidatedAt(null);
    await syncTenancy(null);
  };
  if (!deletion.current) deletion.current = createMobileAccountDeletion(finishDeletedSession);
  const retryDeviceCleanup = () => {
    if (cleanupTask.current) return cleanupTask.current;
    const task = Promise.resolve().then(() => deletion.current.resume?.()).then(() => resumeDeletedAccountCleanup(finishDeletedSession, uid => deletedAccounts.current.add(uid))).then(() => { cleanupFailed.current = false; }).catch(error => { cleanupFailed.current = true; throw error; });
    cleanupTask.current = task;
    task.finally(() => { if (cleanupTask.current === task) cleanupTask.current = null; }).catch(() => {});
    return task;
  };
  currentUser.current = user;
  const hydrate = useCallback((account, reload = false) => {
    const uid = account?.uid || null;
    if (uid && hydration.current?.uid === uid) return hydration.current.promise;
    const ticket = ++generation.current;
    const previous = currentUser.current?.id === uid ? currentUser.current : null;
    const isCurrent = () => ticket === generation.current && (auth.currentUser?.uid || null) === uid;
    const task = (async () => {
      if (!account) {
        await syncTenancy(null);
        if (isCurrent()) { currentUser.current = null; setUser(null); setSessionError(cleanupFailed.current ? 'Your account deletion is recorded. This device still needs to remove saved data. Select Retry to finish device cleanup.' : ''); setAccessError(''); setAccessStatus('signed-out'); setWorkspaceValidatedAt(null); setIsLoading(false); }
        return { success: true, user: null, accessStatus: 'signed-out', authoritative: true };
      }
      if (deletedAccounts.current.has(uid)) {
        await syncTenancy(null);
        if (isCurrent()) { currentUser.current = null; setUser(null); setSessionError('Your account deletion is recorded and access is revoked. Select Retry to finish removing saved data from this device.'); setAccessError(''); setAccessStatus('signed-out'); setWorkspaceValidatedAt(null); setIsLoading(false); }
        return { success: false, user: null, accessStatus: 'signed-out', authoritative: true, deletionRecorded: true };
      }
      setAccessStatus(previous ? 'checking' : 'loading'); setAccessError('');
      try {
        const offline = await isOffline();
        if (reload && !offline) { await account.reload(); await account.getIdToken(true); }
        if (!isCurrent()) return { success: false, superseded: true };
        const claims = await syncTenancy(account);
        if (!isCurrent()) return { success: false, superseded: true };
        const saved = previous || JSON.parse(await AsyncStorage.getItem(sessionKey(account.uid)) || 'null');
        if (offline) {
          if (!saved) throw new Error('Connect once to load your current workspace.');
          restoreOfflineWorkspace(saved, account);
          const current = { ...saved, id: account.uid, email: account.email, emailVerified: account.emailVerified, offline: true };
          if (isCurrent()) { currentUser.current = current; setUser(current); setSessionError(''); setAccessStatus('offline'); }
          return { success: true, user: current, accessStatus: 'offline', authoritative: false };
        }
        const workspace = getWorkspace();
        const allowed = workspacePermissions(workspace, claims).canAccess;
        const status = allowed ? 'ready' : workspace?.status === 'unavailable' && saved?.companyId ? 'revoked' : workspace?.status || 'unavailable';
        const minimal = { id: account.uid, email: account.email, name: account.displayName || 'User', emailVerified: account.emailVerified,
          companyId: claims?.companyId || null, role: claims?.role || null, membershipId: claims?.membershipId || null,
          workspace, offline: false, services: [] };
        const scopeChanged = !previous || ['companyId','role','membershipId'].some(key => previous[key] !== minimal[key]);
        if (scopeChanged && isCurrent()) { currentUser.current = minimal; setUser(minimal); }
        await purgeOtherRoleCaches(account.uid, allowed ? offlineScope() : null);
        if (!isCurrent()) return { success: false, superseded: true };
        if (!allowed) {
          await AsyncStorage.setItem(sessionKey(account.uid), JSON.stringify(minimal));
          currentUser.current = minimal; setUser(minimal); setSessionError(''); setAccessStatus(status); setWorkspaceValidatedAt(Date.now());
          return { success: true, user: minimal, accessStatus: status, authoritative: true };
        }
        const profile = await getDoc(doc(db, 'users', account.uid));
        const data = profile.exists() ? profile.data() : {};
        const company = claims?.companyId && account.emailVerified ? (await readWorkspace('company')).company : null;
        if (claims?.companyId && account.emailVerified && !company) throw new Error('Your company could not be loaded. Try checking your connection and refreshing access.');
        const current = { ...data, services: serviceNames(data.services),
          ...(company ? companyProfile(company) : { businessPhone: data.phoneNumber || '', businessAddress: data.address || '' }),
          ...minimal, services: company ? companyProfile(company).services : serviceNames(data.services), name: account.displayName || data.name || 'User' };
        if (!isCurrent()) return { success: false, superseded: true };
        await AsyncStorage.setItem(sessionKey(account.uid), JSON.stringify(current));
        if (isCurrent()) { currentUser.current = current; setUser(current); setSessionError(''); setAccessStatus(status); setAccessError(''); setWorkspaceValidatedAt(Date.now()); }
        return { success: true, user: current, accessStatus: status, authoritative: true };
      } catch (error) {
        if (isCurrent()) {
          // A failed network/token refresh is not membership revocation. Retain
          // mounted drafts; work queries remain blocked until validation succeeds.
          setAccessStatus('unavailable'); setAccessError(error.message || 'Could not verify your workspace.');
          if (!currentUser.current || currentUser.current.id !== account.uid) { setUser(null); setSessionError(error.message || 'Could not load your account.'); }
        }
        return { success: false, accessStatus: 'unavailable', authoritative: false, error: { message: error.message, code: error.code } };
      } finally { if (ticket === generation.current) setIsLoading(false); }
    })();
    const promise = task.finally(() => { if (hydration.current?.promise === promise) hydration.current = null; });
    hydration.current = { uid, promise };
    return promise;
  }, []);
  const refreshUser = useCallback(() => {
    if (cleanupFailed.current && (!auth.currentUser || deletedAccounts.current.has(auth.currentUser.uid))) {
      return retryDeviceCleanup().then(() => hydrate(auth.currentUser, true)).catch(() => { setSessionError('Your account deletion is recorded. Device cleanup could not finish. Select Retry to try again.'); return { success: false, user: null, deletionRecorded: true, error: { message: 'Device cleanup could not finish. Please retry.' } }; });
    }
    return hydrate(auth.currentUser, true);
  }, [hydrate]);
  useEffect(() => {
    purgeLegacyReadCaches().catch(() => {});
    Promise.all(['savedCredentials', 'tempCredentials', 'userToken', 'userData'].map(key => SecureStore.deleteItemAsync(key))).catch(() => {});
    let disposed = false, unsubscribe = () => {};
    // Complete a previously acknowledged deletion before any session hydration
    // can recreate that UID's cache after a restart.
    retryDeviceCleanup().catch(() => { if (!disposed) setSessionError('A deleted account still has saved data on this device. Select Retry to finish device cleanup.'); }).finally(() => {
      if (!disposed) unsubscribe = onAuthStateChanged(auth, account => { if (currentUser.current?.id !== account?.uid) setIsLoading(true); hydrate(account); });
    });
    return () => { disposed = true; unsubscribe(); };
  }, [hydrate]);
  useEffect(() => {
    const refresh = () => { if (AppState.currentState === 'active' && auth.currentUser && !isNativeInteractionActive()) refreshUser(); };
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const unsubscribe = subscribeNativeInteraction(active => { if (!active) refresh(); });
    return () => { subscription.remove(); unsubscribe(); };
  }, [refreshUser]);
  const finishAuthentication = async result => {
    if (!result.success) return result;
    const loaded = await hydrate(auth.currentUser);
    return { ...loaded, needsEmailVerification: !auth.currentUser?.emailVerified };
  };
  const signOut = async () => {
    const uid = auth.currentUser?.uid;
    await signOutNativePush().catch(() => {});
    // Stop native collection and clear durable tracking consent before auth ends.
    // Work/photo queues are separate and remain on the device.
    await stopShiftTracking({ endShift: true, reason: 'Signed out. Location sharing is off.' }).catch(() => {});
    const result = await AuthService.signOut();
    if (result.success) {
      generation.current++; hydration.current = null; currentUser.current = null; setUser(null); setSessionError(''); setAccessError(''); setAccessStatus('signed-out'); setWorkspaceValidatedAt(null); await syncTenancy(null);
      if (uid) await AsyncStorage.multiRemove([sessionKey(uid), `rl-session-v2:${uid}`, `rl-session-v1:${uid}`]);
    }
    return result;
  };
  const permissions = workspacePermissions(user?.workspace, user);
  const updateUserProfile = async data => {
    const personal = ['name', 'phoneNumber', 'notificationsEnabled', 'emailNotifications', 'smsNotifications'];
    const business = ['businessName', 'address', 'services', 'serviceCategories'];
    if (!permissions.canAccess || (user.companyId && business.some(key => key in data))) return { success: false, error: { message: 'Company information is managed by your company owner.' } };
    const allowed = Object.fromEntries(Object.entries(data).filter(([key]) => personal.includes(key) || (!user.companyId && business.includes(key))));
    const result = await AuthService.updateUserProfile(allowed);
    if (result.success) await hydrate(auth.currentUser);
    return result;
  };
  const value = { user, permissions, isAuthenticated: !!user, isLoading, sessionError, accessStatus, accessError, workspaceValidatedAt, refreshUser,
    getAccountDeletionSummary: () => deletion.current.summary(),
    deleteAccount: async options => {
      const release = beginNativeInteraction();
      // A hydration started before deletion must not recreate the deleted cache.
      const pendingHydration = hydration.current?.promise;
      generation.current++; hydration.current = null;
      try {
        await pendingHydration?.catch(() => {});
        const uid = auth.currentUser?.uid;
        const result = await deletion.current.remove(options);
        if ((result.deletionRecorded || result.success) && uid) deletedAccounts.current.add(uid);
        if (result.localCleanupPending) cleanupFailed.current = true;
        return result;
      }
      finally { release(); }
    },
    signIn: async (email, password) => finishAuthentication(await AuthService.signIn(email.trim(), password)),
    requestStaffCode,
    signInWithCode: async (challengeId, code) => { await signInWithStaffCode(challengeId, code); return finishAuthentication({ success: true }); },
    acceptInvitation: async link => {
      await httpsCallable(functions, 'acceptTeamInvite')(parseInvitationLink(link));
      return refreshUser();
    },
    signUp: async (email, password, data) => {
      const result = await finishAuthentication(await AuthService.signUp(email.trim(), password, data));
      if (result.success) await AuthService.sendEmailVerification();
      return result;
    },
    signOut, resetPassword: email => AuthService.resetPassword(email), updateUserProfile,
    sendEmailVerification: () => AuthService.sendEmailVerification(),
    isEmailVerified: async () => { const result = await refreshUser(); return result.user?.emailVerified === true; },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
