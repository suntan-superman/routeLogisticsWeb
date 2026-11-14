import { QueryClient, QueryCache } from '@tanstack/react-query';
import { accessError, retryWorkRead } from './workQueryPolicy';

const blockedClients = new WeakSet();
export const allowWorkReads = client => blockedClients.delete(client);
export function blockWorkReads(client) {
  blockedClients.add(client);
  client.cancelQueries({ queryKey: ['rl-work'] }, { revert: false });
  for (const query of client.getQueryCache().findAll({ queryKey: ['rl-work'] })) query.setState({ data: undefined, dataUpdatedAt: 0 });
}
export function createWorkQueryClient(onAccessProblem, onReadSuccess) {
  const client = new QueryClient({
    queryCache: new QueryCache({ onSuccess: (_data, query) => {
      // A sibling request may finish during an authorization failure.
      if (blockedClients.has(client)) query.setState({ data: undefined, dataUpdatedAt: 0 });
      else onReadSuccess?.(query);
    }, onError: (error, query) => {
      if (accessError(error)) {
        // A missing/reassigned job is not evidence of company revocation.
        query.setState({ data: undefined, dataUpdatedAt: 0 });
        onAccessProblem?.(error, query);
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
