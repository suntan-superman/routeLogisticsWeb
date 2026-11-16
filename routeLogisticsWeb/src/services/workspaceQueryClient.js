import { QueryCache, QueryClient } from '@tanstack/react-query';
import { retryWorkspaceRead, workspaceAccessError } from './workspaceQueryPolicy';

export function createWorkspaceQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => {
      if (query.meta?.workspace && workspaceAccessError(error)) query.setState({ data: undefined, dataUpdatedAt: 0 });
    } }),
    defaultOptions: { queries: {
      staleTime: 10_000, gcTime: 5 * 60_000, retry: retryWorkspaceRead,
      retryDelay: 2000, networkMode: 'online', refetchOnWindowFocus: 'always',
      refetchOnReconnect: 'always', refetchIntervalInBackground: false,
    } },
  });
}
