import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClientProvider, focusManager, onlineManager, hashKey } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { createWorkQueryClient, allowWorkReads, blockWorkReads } from '../services/workQueryClient';
import { localDay, workScopeKey, needsWorkspaceValidation } from '../services/workQueryPolicy';
import { isNativeInteractionActive, subscribeNativeInteraction } from '../services/nativeInteraction';

const WorkQueryContext = createContext(null);
export const useWorkQueryScope = () => useContext(WorkQueryContext);
const available = status => ['ready', 'offline'].includes(status);
function WorkspaceQueries({ user, canAccess, refreshUser, authStatus, authError, children }) {
  const scope = workScopeKey(user), scopeId = JSON.stringify(scope);
  const refresh = useRef(refreshUser), live = useRef(true), validation = useRef(null), attempted = useRef(new Set());
  const visibleQueries = useRef(new Map());
  const registerVisibleQuery = useCallback(queryKey => {
    const hash = hashKey(queryKey), owner = {};
    if (!visibleQueries.current.has(hash)) visibleQueries.current.set(hash, new Set());
    visibleQueries.current.get(hash).add(owner);
    return () => {
      const owners = visibleQueries.current.get(hash); owners?.delete(owner);
      if (!owners?.size) visibleQueries.current.delete(hash);
    };
  }, []);
  const identity = useRef(scopeId);
  identity.current = scopeId; refresh.current = refreshUser;
  const [validationStatus, setValidationStatus] = useState(null), [validationError, setValidationError] = useState('');
  const accessHandler = useRef(null);
  const [client] = useState(() => createWorkQueryClient((error, query) => accessHandler.current?.(error, query), query => attempted.current.delete(query.queryHash)));
  const refetchVisible = useCallback(() => {
    if (AppState.currentState !== 'active' || isNativeInteractionActive()) return;
    for (const query of client.getQueryCache().findAll({ queryKey: ['rl-work'] })) {
      if (query.getObserversCount() && visibleQueries.current.has(query.queryHash)) query.fetch().catch(() => {});
    }
  }, [client]);
  const refreshAccess = useCallback(() => {
    if (validation.current) return validation.current;
    setValidationStatus('checking'); setValidationError('');
    const expected = identity.current;
    const task = Promise.resolve().then(() => refresh.current()).then(result => {
      if (!live.current || expected !== identity.current) return result;
      if (result?.success && result.authoritative && result.user) {
        const next = result.accessStatus || (result.user.workspace?.status === 'company' || result.user.workspace?.status === 'solo' ? 'ready' : result.user.workspace?.status || 'unavailable');
        if (JSON.stringify(workScopeKey(result.user)) !== expected) {
          if (!available(next)) setValidationStatus(next);
          return result;
        }
        if (available(next)) {
          allowWorkReads(client); setValidationStatus(null); setValidationError('');
          // React may batch checking -> ready into one render. Explicitly retry
          // the visible cohort once with the now-authoritative token, even when
          // its observers never saw an enabled=false transition.
          refetchVisible();
        }
        else { setValidationStatus(next); setValidationError(result.error?.message || ''); }
      } else {
        setValidationStatus('unavailable'); setValidationError(result?.error?.message || 'Your workspace could not be verified. Check your connection and retry.');
      }
      return result;
    }).catch(error => {
      if (live.current && expected === identity.current) { setValidationStatus('unavailable'); setValidationError(error.message || 'Your workspace could not be verified.'); }
      return { success: false, authoritative: false, accessStatus: 'unavailable', error: { message: error.message, code: error.code } };
    }).finally(() => { if (validation.current === task) validation.current = null; });
    validation.current = task;
    return task;
  }, [client, refetchVisible]);
  accessHandler.current = (error, query) => {
    if (!needsWorkspaceValidation(error)) return;
    // One authoritative validation covers concurrent failures. A resource that
    // still fails afterward keeps its real error and stops automatic polling.
    if (validation.current) { attempted.current.add(query.queryHash); return; }
    if (attempted.current.has(query.queryHash)) return;
    for (const current of client.getQueryCache().findAll({ queryKey: ['rl-work'] })) {
      if (current.getObserversCount() && visibleQueries.current.has(current.queryHash)) attempted.current.add(current.queryHash);
    }
    attempted.current.add(query.queryHash); blockWorkReads(client); refreshAccess();
  };
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [nativeInteraction, setNativeInteraction] = useState(isNativeInteractionActive);
  const [online, setOnline] = useState(onlineManager.isOnline()), [day, setDay] = useState(localDay);
  useEffect(() => {
    // A completed manual/foreground check can recover without replacing mounted drafts.
    if (authStatus === 'ready' && !validation.current) {
      allowWorkReads(client); setValidationStatus(null); setValidationError(''); refetchVisible();
    }
  }, [user, authStatus, client, refetchVisible]);
  useEffect(() => {
    live.current = true;
    focusManager.setFocused(AppState.currentState === 'active' && !isNativeInteractionActive());
    const unsubscribeInteraction = subscribeNativeInteraction(blocked => {
      if (!live.current) return;
      setNativeInteraction(blocked); focusManager.setFocused(!blocked && AppState.currentState === 'active');
    });
    const app = AppState.addEventListener('change', state => {
      if (!live.current) return;
      const foreground = state === 'active'; setActive(foreground); if (foreground) setDay(localDay());
      focusManager.setFocused(foreground && !isNativeInteractionActive());
    });
    const network = NetInfo.addEventListener(state => {
      if (!live.current) return;
      const connected = state.isConnected !== false && state.isInternetReachable !== false;
      setOnline(connected); onlineManager.setOnline(connected);
    });
    const timer = setInterval(() => { if (AppState.currentState === 'active') setDay(localDay()); }, 60_000);
    return () => {
      live.current = false; app.remove(); network(); unsubscribeInteraction(); clearInterval(timer); client.cancelQueries();
      Promise.resolve().then(() => client.clear());
    };
  }, [client]);
  const accessStatus = validationStatus || authStatus;
  const authoritativeAccess = canAccess && accessStatus !== 'revoked';
  return <QueryClientProvider client={client}><WorkQueryContext.Provider value={{ scope, user,
    canAccess: authoritativeAccess, canReadWork: authoritativeAccess && available(accessStatus), accessStatus,
    accessError: validationError || authError || '', refreshAccess, registerVisibleQuery,
    active: active && !nativeInteraction, online, day }}>{children}</WorkQueryContext.Provider></QueryClientProvider>;
}
export default function WorkQueryProvider({ children }) {
  const { user, permissions, refreshUser, isLoading, accessStatus, accessError } = useAuth();
  const status = accessStatus || (isLoading ? 'loading' : permissions.canAccess ? 'ready' : user?.workspace?.status || 'unavailable');
  // Checking access must not remount AppContent/JobWorkflow and discard drafts.
  const key = JSON.stringify(workScopeKey(user));
  return <WorkspaceQueries key={key} user={user} canAccess={permissions.canAccess} refreshUser={refreshUser} authStatus={status} authError={accessError} children={children} />;
}
