import { useCallback, useEffect, useRef } from 'react';
import { focusManager, onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { retryWorkspaceRead, workspaceAccessError } from '../services/workspaceQueryPolicy';

// Customer OTP and platform administration have independent authorities. They
// must never inherit a staff/company query scope or share its cached records.
export function usePrincipalQuery(namespace, principal, resource, loader, { enabled = true, intervalMs = 30_000, current = () => true } = {}) {
  const client = useQueryClient(), load = useRef(loader), valid = useRef(current);
  load.current = loader; valid.current = current;
  const key = [namespace, principal || '', ...resource], keyId = JSON.stringify(key), readable = !!principal && enabled;
  const query = useQuery({ queryKey: key, enabled: readable, staleTime: 10_000, gcTime: 60_000, retry: retryWorkspaceRead,
    refetchInterval: state => readable && intervalMs && focusManager.isFocused() && onlineManager.isOnline() && !workspaceAccessError(state.state.error) ? intervalMs : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: state => !workspaceAccessError(state.state.error) && 'always',
    refetchOnReconnect: state => !workspaceAccessError(state.state.error) && 'always',
    queryFn: async ({ signal }) => {
      const check = valid.current;
      const assertCurrent = () => { if (signal.aborted || !check(principal)) throw Object.assign(new Error('Your sign-in changed. Reopen this page.'), { code: 'auth/user-changed' }); };
      assertCurrent(); const result = await load.current({ signal }); assertCurrent();
      if (result?.success === false) throw Object.assign(new Error(result.error?.message || result.error || 'This information could not be refreshed.'), { code: result.code || result.error?.code });
      if (result === undefined) throw new Error('The data service returned no result.');
      return result;
    },
  });
  const queryRefetch = query.refetch;
  const refetch = useCallback(() => readable && valid.current(principal) ? queryRefetch({ cancelRefetch: false }) : Promise.resolve({ data: undefined }), [readable, principal, queryRefetch]);
  useEffect(() => {
    const focus = () => { if (document.visibilityState !== 'hidden' && onlineManager.isOnline() && !workspaceAccessError(query.error)) void refetch(); };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [refetch, query.error]);
  useEffect(() => () => { client.removeQueries({ queryKey: JSON.parse(keyId), exact: true }); }, [client, keyId]);
  const setData = useCallback(update => { if (readable && valid.current(principal)) { void client.cancelQueries({ queryKey: JSON.parse(keyId), exact: true }, { silent: true }); client.setQueryData(JSON.parse(keyId), update); } }, [client, keyId, principal, readable]);
  return { ...query, refetch, setData, data: readable && valid.current(principal) && !workspaceAccessError(query.error) ? query.data : undefined };
}
