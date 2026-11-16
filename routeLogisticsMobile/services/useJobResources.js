import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWorkQueryScope } from '../contexts/WorkQueryProvider';
import { WORK_POLL_MS, accessError } from './workQueryPolicy';

// Resource reads retain their existing offline merge and draft-protection logic;
// this observer owns request deduplication, visibility, focus and refresh policy.
export function useJobResourceRefresh(resource, jobId, read, { enabled = true, interval = WORK_POLL_MS } = {}) {
  const context = useWorkQueryScope(), reader = useRef(read);
  reader.current = read;
  const visible = !!jobId && !!enabled, queryKey = [...context.scope, 'job-resource', jobId, resource], key = JSON.stringify(queryKey);
  useEffect(() => visible ? context.registerVisibleQuery(JSON.parse(key)) : undefined, [visible, key, context.registerVisibleQuery]);
  const query = useQuery({ queryKey, meta: { resource, jobId }, enabled: visible && context.canReadWork && context.active,
    staleTime: interval,
    refetchInterval: current => visible && context.canReadWork && context.active && context.online && !accessError(current.state.error) ? interval : false,
    refetchOnWindowFocus: current => accessError(current.state.error) ? false : 'always', refetchOnReconnect: current => accessError(current.state.error) ? false : 'always',
    queryFn: async ({ signal }) => {
      const value = await reader.current({ query: true });
      if (signal.aborted) throw Object.assign(new Error('Work resource read cancelled.'), { name: 'AbortError' });
      return value ?? null;
    },
  });
  const wasVisible = useRef(visible);
  useEffect(() => {
    const resumed = visible && !wasVisible.current; wasVisible.current = visible;
    if (resumed && query.dataUpdatedAt && context.canReadWork && context.active && !accessError(query.error)) void query.refetch({ cancelRefetch: false });
  }, [visible, context.canReadWork, context.active, query.dataUpdatedAt, query.error, query.refetch]);
  const refetch = useCallback(() => {
    // Offline queue notifications can reach retained child screens. They must
    // not start reads while another mode, dialog or native picker owns the UI.
    if (!visible || !context.canReadWork || !context.active) return Promise.resolve();
    return query.refetch({ cancelRefetch: false });
  }, [visible, context.canReadWork, context.active, query.refetch]);
  return { ...query, refetch };
}
