import { QueryClient } from '@tanstack/react-query';

/** Default cache policy for list/report API and DB-backed queries (Phase 2). */
export const QUERY_STALE_MS = 5 * 60 * 1000;
export const QUERY_GC_MS = 10 * 60 * 1000;

let client: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (!client) {
    client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: QUERY_STALE_MS,
          gcTime: QUERY_GC_MS,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });
  }
  return client;
}
