import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkQueryScope } from '../contexts/WorkQueryProvider';
import { JobService } from './firebase';
import { cachedRead } from './offline';
import { callWorkspace } from './workspaceApi';
import { WORK_POLL_MS, periodRange } from './workQueryPolicy';

function options(context) {
  return { enabled: context.canAccess && context.active, refetchInterval: context.active && context.online ? WORK_POLL_MS : false };
}
export function useWorkJobs(period) {
  const context = useWorkQueryScope(), client = useQueryClient();
  const { startDate, endDate } = periodRange(period, context.day);
  const query = useQuery({ ...options(context), queryKey: [...context.scope, 'jobs', startDate, endDate],
    queryFn: async ({ signal }) => {
      const result = await JobService.getJobsByDateRange(startDate, endDate);
      if (signal.aborted) throw Object.assign(new Error('Work read cancelled.'), { name: 'AbortError' });
      if (!result.success) throw Object.assign(new Error(result.error?.message || result.error || 'Could not load your schedule.'), { code: result.error?.code || result.code });
      return result.jobs;
    },
  });
  const scope = JSON.stringify(context.scope);
  // Shared prefix includes the own-route query, so work/sync callbacks refresh both.
  const refreshWork = useCallback(() => client.invalidateQueries({ queryKey: JSON.parse(scope) }, { cancelRefetch: false }), [client, scope]);
  return { ...query, canAccess: context.canAccess, jobs: !context.canAccess || query.isError ? [] : query.data || [], refreshWork };
}
export function useMyDailyRoute() {
  const context = useWorkQueryScope(), memberId = context.user?.membershipId || context.user?.id;
  const query = useQuery({ ...options(context), enabled: context.canAccess && context.active && !!context.user?.companyId,
    queryKey: [...context.scope, 'route', context.day, memberId],
    queryFn: async ({ signal }) => {
      const data = await cachedRead(`route:${context.day}:${memberId}`, () => callWorkspace('rlGetDailyRoute', { memberId, date: context.day }));
      if (signal.aborted) throw Object.assign(new Error('Route read cancelled.'), { name: 'AbortError' });
      const order = data.saved?.jobIds || [];
      return { ...data, stops: [...data.stops].sort((a,b) => (order.includes(a.id) ? order.indexOf(a.id) : 1000) - (order.includes(b.id) ? order.indexOf(b.id) : 1000)) };
    },
  });
  return { ...query, stops: !context.canAccess || query.isError ? [] : query.data?.stops || [] };
}
