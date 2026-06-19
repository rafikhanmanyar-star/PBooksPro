import { useMemo } from 'react';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { hasMorePages, type PaginatedResponse } from '../../shared/types/pagination';
import { DEFAULT_LIST_PAGE_SIZE } from './index';

export interface InfiniteEntitySort {
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
}

export interface InfiniteEntityQueryFilters extends InfiniteEntitySort {
  search?: string;
  [key: string]: unknown;
}

export interface InfiniteEntityFetchParams<TFilters extends InfiniteEntityQueryFilters> {
  pageParam: number;
  pageSize: number;
  filters: TFilters;
}

export interface UseInfiniteEntityQueryOptions<
  T,
  TFilters extends InfiniteEntityQueryFilters = InfiniteEntityQueryFilters,
> {
  queryKey: QueryKey;
  fetchPage: (params: InfiniteEntityFetchParams<TFilters>) => Promise<PaginatedResponse<T>>;
  filters?: TFilters;
  pageSize?: number;
  enabled?: boolean;
  /**
   * Bumps the query key when local store / sync state changes so lists refetch
   * without altering global React Query invalidation maps.
   */
  syncFingerprint?: string | number;
}

export interface UseInfiniteEntityQueryResult<T> {
  items: T[];
  totalCount: number;
  pageSize: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
  isRefetching: boolean;
}

export function useInfiniteEntityQuery<
  T,
  TFilters extends InfiniteEntityQueryFilters = InfiniteEntityQueryFilters,
>(options: UseInfiniteEntityQueryOptions<T, TFilters>): UseInfiniteEntityQueryResult<T> {
  const pageSize = options.pageSize ?? DEFAULT_LIST_PAGE_SIZE;
  const filters = (options.filters ?? {}) as TFilters;
  const enabled = options.enabled ?? true;

  const query = useInfiniteQuery({
    queryKey: [...options.queryKey, pageSize, filters, options.syncFingerprint],
    queryFn: ({ pageParam }) =>
      options.fetchPage({
        pageParam: pageParam as number,
        pageSize,
        filters,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      hasMorePages(lastPage.page, lastPage.pageSize, lastPage.totalCount)
        ? lastPage.page + 1
        : undefined,
    enabled,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data]
  );

  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  const errorMessage =
    query.error == null
      ? null
      : query.error instanceof Error
        ? query.error.message
        : 'Failed to load data';

  return {
    items,
    totalCount,
    pageSize,
    loading: query.isLoading,
    loadingMore: query.isFetchingNextPage,
    error: errorMessage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    },
    refetch: () => {
      void query.refetch();
    },
    isRefetching: query.isRefetching,
  };
}
