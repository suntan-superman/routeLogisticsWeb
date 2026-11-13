import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../constants/firebase';
import { AuthService } from '../services/firebase';
import { syncTenancy } from '../services/tenancy';

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null), [isLoading, setIsLoading] = useState(true), [sessionError, setSessionError] = useState('');
  const generation = useRef(0);
  const hydrate = useCallback(async (account, reload = false) => {
    const ticket = ++generation.current;
    if (!account) { await syncTenancy(null); setUser(null); setSessionError(''); setIsLoading(false); return { success: true }; }
    try {
      if (reload) { await account.reload(); await account.getIdToken(true); }
      const claims = await syncTenancy(account);
      const profile = await getDoc(doc(db, 'users', account.uid));
      const data = profile.exists() ? profile.data() : {};
      const current = { ...data, id: account.uid, email: account.email, name: account.displayName || data.name || 'User', emailVerified: account.emailVerified, companyId: claims?.companyId || null, role: claims?.role || null };
      if (ticket === generation.current && auth.currentUser?.uid === account.uid) { setUser(current); setSessionError(''); }
      return { success: true, user: current };
    } catch (error) {
      if (ticket === generation.current) { setUser(null); setSessionError(error.message || 'Could not load your account.'); }
      return { success: false, error: { message: error.message } };
    } finally { if (ticket === generation.current) setIsLoading(false); }
  }, []);
  const refreshUser = useCallback(() => hydrate(auth.currentUser, true), [hydrate]);
  useEffect(() => {
    // Remove passwords saved by the legacy app; Firebase persists its own refresh session.
    Promise.all(['savedCredentials', 'tempCredentials', 'userToken', 'userData'].map((key) => SecureStore.deleteItemAsync(key))).catch(() => {});
    return onAuthStateChanged(auth, (account) => { setIsLoading(true); hydrate(account); });
  }, [hydrate]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active' && auth.currentUser) refreshUser(); });
    return () => subscription.remove();
  }, [refreshUser]);
  const authenticate = async (method, email, password, data) => {
    const result = await method(email.trim(), password, data);
    if (!result.success) return result;
    const loaded = await hydrate(auth.currentUser);
    return { ...loaded, needsEmailVerification: !auth.currentUser?.emailVerified };
  };
  const signOut = async () => {
    const result = await AuthService.signOut();
    if (result.success) { generation.current++; setUser(null); setSessionError(''); await syncTenancy(null); }
    return result;
  };
  const updateUserProfile = async (data) => {
    const allowed = Object.fromEntries(Object.entries(data).filter(([key]) => ['name', 'phoneNumber', 'businessName', 'address', 'services', 'serviceCategories', 'notificationsEnabled', 'emailNotifications', 'smsNotifications'].includes(key)));
    const result = await AuthService.updateUserProfile(allowed);
    if (result.success) await hydrate(auth.currentUser);
    return result;
  };
  const value = { user, isAuthenticated: !!user, isLoading, sessionError, refreshUser,
    signIn: (email, password) => authenticate(AuthService.signIn.bind(AuthService), email, password),
    signUp: async (email, password, data) => {
      const result = await authenticate(AuthService.signUp.bind(AuthService), email, password, data);
      if (result.success) await AuthService.sendEmailVerification();
      return result;
    },
    signOut, resetPassword: (email) => AuthService.resetPassword(email), updateUserProfile,
    sendEmailVerification: () => AuthService.sendEmailVerification(),
    isEmailVerified: async () => { const result = await refreshUser(); return result.user?.emailVerified === true; },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
