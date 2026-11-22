import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../services/firebase';
import { getClaims, getWorkspace } from '../services/tenancy';
import { WORKSPACE_POLL_MS, WORKSPACE_QUERY_ROOT, workspaceScope, workspaceAccessError, retryWorkspaceRead } from '../services/workspaceQueryPolicy';
import { subscribeWorkspaceChanges } from '../services/workspaceQueryEvents';

const runtimeScope = () => workspaceScope(auth.currentUser, getClaims(), getWorkspace(), auth.app?.options?.projectId);
const changed = () => Object.assign(new Error('Your workspace changed. Refresh access before continuing.'), { code: 'workspace-changed' });
export function workspaceResult(result) {
  if (result?.success === false) throw Object.assign(new Error(typeof result.error === 'string' ? result.error : result.error?.message || 'This data could not be refreshed.'), { code: result.code || result.error?.code });
  if (result === undefined) throw new Error('The data service returned no result.');
  return result;
}
function useScope() {
  const context = useAuth();
  const scope = workspaceScope(context.currentUser, getClaims(), context.workspace || getWorkspace(), auth.app?.options?.projectId);
  return { ...scope, readable: !context.loading && scope.readable };
}
export function useWorkspaceQuery(resourceKey, loader, { enabled = true, intervalMs = WORKSPACE_POLL_MS, staleTime = 10_000, refetchOnFocus = true } = {}) {
  const scope = useScope(), client = useQueryClient(), load = useRef(loader); load.current = loader;
  const key = [...scope.key, ...resourceKey], keyId = JSON.stringify(key), readable = scope.readable;
  const query = useQuery({ queryKey: key, enabled: enabled && readable, staleTime,
    meta: { workspace: true, scopeId: scope.id, resource: resourceKey[0], refetchOnFocus }, retry: retryWorkspaceRead,
    refetchInterval: state => enabled && readable && intervalMs && focusManager.isFocused() && onlineManager.isOnline() && !workspaceAccessError(state.state.error) ? intervalMs : false,
    refetchIntervalInBackground: false, refetchOnWindowFocus: state => refetchOnFocus && !workspaceAccessError(state.state.error) && 'always',
    refetchOnReconnect: state => refetchOnFocus && !workspaceAccessError(state.state.error) && 'always',
    queryFn: async ({ signal }) => {
      if (signal.aborted || runtimeScope().id !== scope.id || !runtimeScope().readable) throw changed();
      const result = workspaceResult(await load.current({ signal }));
      if (signal.aborted || runtimeScope().id !== scope.id || !runtimeScope().readable) throw changed();
      return result;
    },
  });
  const queryRefetch = query.refetch;
  const refetch = useCallback(options => readable && runtimeScope().id === scope.id ? queryRefetch({ cancelRefetch: false, ...options }) : Promise.resolve({ data: undefined, error: changed() }), [readable, scope.id, queryRefetch]);
  const setData = useCallback(update => {
    if (readable && runtimeScope().id === scope.id) {
      // A read started before a successful local save must not restore the old row.
      void client.cancelQueries({ queryKey: JSON.parse(keyId), exact: true }, { silent: true });
      client.setQueryData(JSON.parse(keyId), update);
    }
  }, [client, keyId, readable, scope.id]);
  const invalidate = useCallback(() => readable && runtimeScope().id === scope.id ? client.invalidateQueries({ queryKey: JSON.parse(keyId), exact: true, refetchType: 'active' }, { cancelRefetch: true }) : Promise.resolve(), [client, keyId, readable, scope.id]);
  return { ...query, data: readable && !workspaceAccessError(query.error) ? query.data : undefined, refetch, setData, invalidate,
    readable, canRead: readable, scopeId: scope.id, scopeKey: scope.key };
}
export function useInvalidateWorkspace() {
  const scope = useScope(), client = useQueryClient(), id = scope.id;
  return useCallback(resources => {
    if (!runtimeScope().readable || runtimeScope().id !== id) return Promise.resolve();
    return client.invalidateQueries({ queryKey: JSON.parse(id), refetchType: 'active',
      predicate: query => !resources?.length || resources.includes(query.meta?.resource || query.queryKey[JSON.parse(id).length]),
    }, { cancelRefetch: true });
  }, [client, id]);
}

export function WorkspaceQueryBoundary({ children }) {
  const scope = useScope(), client = useQueryClient(), current = useRef(scope); current.current = scope;
  useEffect(() => {
    const unsubscribe = subscribeWorkspaceChanges(event => {
      const active = current.current;
      if (active.readable && event.scopeId === active.id) void client.invalidateQueries({ queryKey: active.key,
        predicate: query => event.resources.includes(query.meta?.resource), refetchType: 'active',
      }, { cancelRefetch: true });
    });
    const focus = () => {
      const active = current.current;
      if (active.readable && document.visibilityState !== 'hidden' && onlineManager.isOnline()) void client.refetchQueries({ queryKey: active.key, type: 'active', predicate: query => query.meta?.refetchOnFocus !== false && !workspaceAccessError(query.state.error) }, { cancelRefetch: false });
    };
    window.addEventListener('focus', focus);
    return () => { unsubscribe(); window.removeEventListener('focus', focus); };
  }, [client]);
  useEffect(() => {
    for (const query of client.getQueryCache().findAll({ queryKey: [WORKSPACE_QUERY_ROOT] })) {
      if (query.meta?.scopeId !== scope.id || !scope.readable) client.removeQueries({ queryKey: query.queryKey, exact: true });
    }
  }, [client, scope.id, scope.readable]);
  return children;
}
