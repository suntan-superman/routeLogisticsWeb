import { QueryClient, QueryCache } from '@tanstack/react-query';
import { accessError, retryWorkRead } from './workQueryPolicy';

const blockedClients = new WeakSet();
export const allowWorkReads = client => blockedClients.delete(client);
export function createWorkQueryClient(onAccessDenied) {
  const client = new QueryClient({
    queryCache: new QueryCache({ onSuccess: (_data, query) => {
      // A sibling request may finish during an authorization failure.
      if (blockedClients.has(client)) query.setState({ data: undefined, dataUpdatedAt: 0 });
    }, onError: error => {
      if (accessError(error)) {
        blockedClients.add(client);
        client.cancelQueries({ queryKey: ['rl-work'] }, { revert: false });
        // Active observers keep their Query until they unsubscribe. Clear its
        // private payload in place, including sibling reads, before blocking UI.
        for (const query of client.getQueryCache().findAll({ queryKey: ['rl-work'] })) {
          query.setState({ data: undefined, dataUpdatedAt: 0 });
        }
        onAccessDenied?.();
      }
    } }),
    defaultOptions: { queries: {
      staleTime: 0, gcTime: 5 * 60_000, networkMode: 'offlineFirst', retry: retryWorkRead,
      retryDelay: 2000, refetchOnWindowFocus: 'always', refetchOnReconnect: 'always',
      refetchIntervalInBackground: false,
    } },
  });
  return client;
}
