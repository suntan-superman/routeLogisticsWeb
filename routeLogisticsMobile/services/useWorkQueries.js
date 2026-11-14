import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkQueryScope } from '../contexts/WorkQueryProvider';
import { JobService } from './firebase';
import { cachedRead, readCache, overlayJobs } from './offline';
import { callWorkspace, readWorkspace } from './workspaceApi';
import { WORK_POLL_MS, periodRange, accessError, workScopeKey } from './workQueryPolicy';
import { normalizeJobLocation } from './workPresentation';

function options(context, enabled) {
  return { enabled: !!enabled && context.canReadWork && context.active,
    refetchInterval: query => enabled && context.canReadWork && context.active && context.online && !accessError(query.state.error) ? WORK_POLL_MS : false,
    refetchOnWindowFocus: query => !accessError(query.state.error), refetchOnReconnect: query => !accessError(query.state.error),
  };
}
function useVisibleWorkQuery(context, queryKey, enabled) {
  const key = JSON.stringify(queryKey), register = context.registerVisibleQuery;
  // Query metadata belongs to the shared cache entry. Register each observer's
  // screen separately so a retained hidden page cannot hide a visible sibling.
  // Keep registration through an access check, when reads temporarily pause.
  useEffect(() => enabled ? register(JSON.parse(key)) : undefined, [register, key, enabled]);
}
const aborted = signal => { if (signal.aborted) throw Object.assign(new Error('Work read cancelled.'), { name: 'AbortError' }); };
function accessInfo(context, query) {
  return { canAccess: context.canAccess, canReadWork: context.canReadWork, accessStatus: context.accessStatus, accessError: context.accessError,
    resourceDenied: accessError(query.error), dataChecked: context.canReadWork && context.online && query.isSuccess && !query.isFetching };
}
function useWorkRefresh(context, query) {
  const client = useQueryClient(), scope = JSON.stringify(context.scope);
  const validate = useCallback(async () => {
    if (context.canReadWork) return true;
    const result = await context.refreshAccess();
    return !!result?.success && result.authoritative && JSON.stringify(workScopeKey(result.user)) === scope && result.accessStatus === 'ready';
  }, [context.canReadWork, context.refreshAccess, scope]);
  const refreshWork = useCallback(async () => {
    if (await validate()) return client.invalidateQueries({ queryKey: JSON.parse(scope) }, { cancelRefetch: false });
  }, [client, scope, validate]);
  const refetch = useCallback(async () => { if (await validate()) return query.refetch(); }, [validate, query.refetch]);
  return { refreshWork, refetch };
}
export function useWorkJobs(period, { enabled = true } = {}) {
  const context = useWorkQueryScope();
  const { startDate, endDate } = periodRange(period, context.day);
  const queryKey = [...context.scope, 'jobs', startDate, endDate];
  useVisibleWorkQuery(context, queryKey, enabled);
  const query = useQuery({ ...options(context, enabled), queryKey, meta: { resource: 'jobs' },
    queryFn: async ({ signal }) => {
      const result = await JobService.getJobsByDateRange(startDate, endDate); aborted(signal);
      if (!result.success) throw Object.assign(new Error(result.error?.message || result.error || 'Could not load your schedule.'), { code: result.error?.code || result.code });
      return result.jobs;
    },
  });
  const refresh = useWorkRefresh(context, query);
  const jobs = !context.canReadWork || accessError(query.error) ? [] : [...(query.data || [])].sort((a,b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));
  return { ...query, ...accessInfo(context, query), ...refresh, jobs, startDate, endDate };
}
export function useMyDailyRoute({ enabled = true } = {}) {
  const context = useWorkQueryScope(), memberId = context.user?.membershipId || context.user?.id;
  const queryKey = [...context.scope, 'route', context.day, memberId], visible = enabled && !!context.user?.companyId;
  useVisibleWorkQuery(context, queryKey, visible);
  const query = useQuery({ ...options(context, visible), queryKey, meta: { resource: 'route' },
    queryFn: async ({ signal }) => {
      const data = await cachedRead(`route:${context.day}:${memberId}`, () => callWorkspace('rlGetDailyRoute', { memberId, date: context.day })); aborted(signal);
      const order = data.saved?.jobIds || [];
      return { ...data, stops: [...data.stops].sort((a,b) => (order.includes(a.id) ? order.indexOf(a.id) : 1000) - (order.includes(b.id) ? order.indexOf(b.id) : 1000)) };
    },
  });
  const refresh = useWorkRefresh(context, query);
  return { ...query, ...accessInfo(context, query), ...refresh, stops: !context.canReadWork || accessError(query.error) ? [] : query.data?.stops || [] };
}
export function useWorkJob(jobId, { enabled = true } = {}) {
  const context = useWorkQueryScope();
  const queryKey = [...context.scope, 'job', jobId], visible = enabled && !!jobId;
  useVisibleWorkQuery(context, queryKey, visible);
  const query = useQuery({ ...options(context, visible), queryKey, meta: { resource: 'job', jobId },
    queryFn: async ({ signal }) => {
      let serverRead = false, data;
      try {
        data = await cachedRead(`job-detail:${jobId}`, async () => { serverRead = true; return readWorkspace('jobs', { id: jobId }); });
      } catch (error) {
        // Only use scoped saved bases for an actual offline-cache miss. Never
        // let a cached document conceal an online authorization response.
        if (serverRead || !/Open this view online once/.test(error.message || '')) throw error;
        const bases = await readCache('job-bases') || {};
        if (!bases[jobId]) throw error;
        data = { job: bases[jobId], customer: null };
      }
      aborted(signal);
      if (!data?.job?.id) throw Object.assign(new Error('This job is unavailable. Return to your schedule or ask your manager to check its assignment.'), { code: 'not-found' });
      const [job] = await overlayJobs([normalizeJobLocation(data.job, data.customer)]); aborted(signal);
      return { ...data, job, serverRead };
    },
  });
  const refresh = useWorkRefresh(context, query), readable = context.canReadWork && !accessError(query.error);
  return { ...query, ...accessInfo(context, query), ...refresh, job: readable ? query.data?.job || null : null, customer: readable ? query.data?.customer || null : null,
    dataChecked: readable && query.isSuccess && !query.isFetching && query.data?.serverRead === true };
}
