import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { createWorkQueryClient, allowWorkReads } from '../services/workQueryClient';
import { localDay, workScopeKey } from '../services/workQueryPolicy';
import { isNativeInteractionActive, subscribeNativeInteraction } from '../services/nativeInteraction';

const WorkQueryContext = createContext(null);
export const useWorkQueryScope = () => useContext(WorkQueryContext);
function WorkspaceQueries({ user, canAccess, refreshUser, children }) {
  const refresh = useRef(refreshUser), accessRefreshAttempted = useRef(false);
  const [denied, setDenied] = useState(false);
  refresh.current = refreshUser;
  const [client] = useState(() => createWorkQueryClient(() => {
    setDenied(true);
    if (!accessRefreshAttempted.current) {
      accessRefreshAttempted.current = true;
      Promise.resolve(refresh.current()).catch(() => {});
    }
  }));
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [nativeInteraction, setNativeInteraction] = useState(isNativeInteractionActive);
  const [online, setOnline] = useState(onlineManager.isOnline());
  const [day, setDay] = useState(localDay);
  // Hydration has checked current membership before publishing a new user object.
  useEffect(() => { allowWorkReads(client); setDenied(false); }, [user, client]);
  useEffect(() => {
    let mounted = true;
    focusManager.setFocused(AppState.currentState === 'active' && !isNativeInteractionActive());
    const unsubscribeInteraction = subscribeNativeInteraction(blocked => {
      if (!mounted) return;
      setNativeInteraction(blocked);
      focusManager.setFocused(!blocked && AppState.currentState === 'active');
    });
    const app = AppState.addEventListener('change', state => {
      if (!mounted) return;
      const foreground = state === 'active';
      setActive(foreground); if (foreground) setDay(localDay());
      focusManager.setFocused(foreground && !isNativeInteractionActive());
    });
    const network = NetInfo.addEventListener(state => {
      if (!mounted) return;
      const connected = state.isConnected !== false && state.isInternetReachable !== false;
      setOnline(connected); onlineManager.setOnline(connected);
    });
    const timer = setInterval(() => { if (AppState.currentState === 'active') setDay(localDay()); }, 60_000);
    return () => {
      mounted = false; app.remove(); network(); unsubscribeInteraction(); clearInterval(timer);
      client.cancelQueries();
      // Child observers unsubscribe later in this cleanup pass. Clear afterward
      // so their GC timers cannot outlive the workspace that owned the data.
      Promise.resolve().then(() => client.clear());
    };
  }, [client]);
  return <QueryClientProvider client={client}><WorkQueryContext.Provider value={{ scope: workScopeKey(user), user, canAccess: canAccess && !denied, active: active && !nativeInteraction, online, day }}>{children}</WorkQueryContext.Provider></QueryClientProvider>;
}
export default function WorkQueryProvider({ children }) {
  const { user, permissions, refreshUser, isLoading, sessionError } = useAuth();
  const key = JSON.stringify([workScopeKey(user), !!permissions.canAccess, !!isLoading, !!sessionError]);
  return <WorkspaceQueries key={key} user={user} canAccess={permissions.canAccess && !isLoading && !sessionError} refreshUser={refreshUser}>{children}</WorkspaceQueries>;
}
