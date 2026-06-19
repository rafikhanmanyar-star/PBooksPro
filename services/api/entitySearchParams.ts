/**
 * Shared query-string builder for PERF-A3.4 entity search list endpoints.
 */
export function appendEntitySearchParams(
  q: URLSearchParams,
  params: {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
    sortKey?: string;
    sortDir?: 'asc' | 'desc';
  }
): void {
  q.set('page', String(params.page));
  q.set('pageSize', String(params.pageSize));
  if (params.search?.trim()) q.set('search', params.search.trim());
  if (params.sortBy) q.set('sortBy', params.sortBy);
  if (params.sortDirection) q.set('sortDirection', params.sortDirection);
  if (params.sortKey) q.set('sortKey', params.sortKey);
  if (params.sortDir) q.set('sortDir', params.sortDir);
}
