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

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
const sessionKey = uid => `rl-session-v3:${uid}`;
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null), [isLoading, setIsLoading] = useState(true), [sessionError, setSessionError] = useState('');
  const generation = useRef(0);
  const hydrate = useCallback(async (account, reload = false) => {
    const ticket = ++generation.current;
    if (!account) { await syncTenancy(null); setUser(null); setSessionError(''); setIsLoading(false); return { success: true }; }
    const isCurrent = () => ticket === generation.current && auth.currentUser?.uid === account.uid;
    try {
      const offline = await isOffline();
      if (reload && !offline) { await account.reload(); await account.getIdToken(true); }
      if (!isCurrent()) return { success: true };
      const claims = await syncTenancy(account);
      if (!isCurrent()) return { success: true };
      if (offline) {
        const saved = JSON.parse(await AsyncStorage.getItem(sessionKey(account.uid)) || 'null');
        if (!saved) throw new Error('Connect once to load your current workspace.');
        restoreOfflineWorkspace(saved, account);
        const current = { ...saved, emailVerified: account.emailVerified, offline: true };
        if (isCurrent()) { setUser(current); setSessionError(''); }
        return { success: true, user: current };
      }
      await purgeOtherRoleCaches(account.uid, workspacePermissions(getWorkspace(), claims).canAccess ? offlineScope() : null);
      const profile = await getDoc(doc(db, 'users', account.uid));
      const data = profile.exists() ? profile.data() : {};
      const company = claims?.companyId && account.emailVerified ? (await readWorkspace('company')).company : null;
      if (claims?.companyId && account.emailVerified && !company) throw new Error('Your company could not be loaded. Ask the owner to check your membership.');
      const current = {
        ...data, services: serviceNames(data.services),
        ...(company ? companyProfile(company) : { businessPhone: data.phoneNumber || '', businessAddress: data.address || '' }),
        id: account.uid, email: account.email, name: account.displayName || data.name || 'User', emailVerified: account.emailVerified,
        companyId: claims?.companyId || null, role: claims?.role || null, membershipId: claims?.membershipId || null, workspace: getWorkspace(), offline: false,
      };
      if (!isCurrent()) return { success: true };
      await AsyncStorage.setItem(sessionKey(account.uid), JSON.stringify(current));
      if (isCurrent()) { setUser(current); setSessionError(''); }
      return { success: true, user: current };
    } catch (error) {
      if (isCurrent()) { setUser(null); setSessionError(error.message || 'Could not load your account.'); }
      return { success: false, error: { message: error.message } };
    } finally { if (ticket === generation.current) setIsLoading(false); }
  }, []);
  const refreshUser = useCallback(() => hydrate(auth.currentUser, true), [hydrate]);
  useEffect(() => {
    purgeLegacyReadCaches().catch(() => {});
    Promise.all(['savedCredentials', 'tempCredentials', 'userToken', 'userData'].map(key => SecureStore.deleteItemAsync(key))).catch(() => {});
    return onAuthStateChanged(auth, account => { setIsLoading(true); hydrate(account); });
  }, [hydrate]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active' && auth.currentUser) refreshUser(); });
    return () => subscription.remove();
  }, [refreshUser]);
  const finishAuthentication = async result => {
    if (!result.success) return result;
    const loaded = await hydrate(auth.currentUser);
    return { ...loaded, needsEmailVerification: !auth.currentUser?.emailVerified };
  };
  const signOut = async () => {
    const uid = auth.currentUser?.uid;
    const result = await AuthService.signOut();
    if (result.success) {
      generation.current++; setUser(null); setSessionError(''); await syncTenancy(null);
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
  const value = { user, permissions, isAuthenticated: !!user, isLoading, sessionError, refreshUser,
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
