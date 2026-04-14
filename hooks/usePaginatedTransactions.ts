/**
 * Enhanced Paginated Transactions Hook
 *
 * - Native / local DB: TanStack Query infinite cache (stale 5m, gc 10m via default client)
 * - Fallback: AppState transactions when native pagination is off (API / sql.js-only paths)
 */

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Transaction } from '../types';
import { TransactionsRepository } from '../services/database/repositories';
import { useStateSelector } from './useSelectiveState';
import { isMobileDevice } from '../utils/platformDetection';
import { isLocalOnlyMode } from '../config/apiUrl';
import { queryKeys } from './queries/queryKeys';

interface UsePaginatedTransactionsOptions {
  projectId?: string | null;
  pageSize?: number;
  enabled?: boolean;
}

interface UsePaginatedTransactionsResult {
  transactions: Transaction[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  totalCount: number | null;
  isNativeEnabled: boolean;
  isUsingNative: boolean;
}

export function usePaginatedTransactions(
  options: UsePaginatedTransactionsOptions = {}
): UsePaginatedTransactionsResult {
  const stateTransactions = useStateSelector(s => s.transactions);
  const queryClient = useQueryClient();
  const { projectId, pageSize = 200, enabled = true } = options;

  const repo = useMemo(() => new TransactionsRepository(), []);
  const isNativeEnabled = useMemo(() => repo.isNativeEnabled(), [repo]);

  const shouldUseNative = useMemo(() => {
    if (!isLocalOnlyMode()) return false;
    if (!enabled) return false;
    if (!isNativeEnabled) return false;

    if (typeof window !== 'undefined') {
      const flag = localStorage.getItem('useNativeDatabase');
      if (flag === 'false') return false;
    }
    return true;
  }, [enabled, isNativeEnabled]);

  const countEnabled =
    enabled &&
    shouldUseNative &&
    isLocalOnlyMode() &&
    !isMobileDevice();

  const countQuery = useQuery({
    queryKey: queryKeys.ledger.count(projectId),
    queryFn: () => repo.getCount({ projectId }),
    enabled: countEnabled,
  });

  const infiniteQuery = useInfiniteQuery({
    queryKey: queryKeys.ledger.paginated(projectId, pageSize),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      return repo.findAllPaginated({
        projectId,
        limit: pageSize,
        offset,
      }) as Promise<Transaction[]>;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < pageSize) return undefined;
      return allPages.reduce((sum, p) => sum + p.length, 0);
    },
    enabled: enabled && shouldUseNative,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all });
  }, [queryClient]);

  const loadMore = useCallback(async () => {
    if (!shouldUseNative) return;
    if (!infiniteQuery.hasNextPage || infiniteQuery.isFetchingNextPage) return;
    await infiniteQuery.fetchNextPage();
  }, [shouldUseNative, infiniteQuery]);

  const transactions = useMemo((): Transaction[] => {
    if (!shouldUseNative) return stateTransactions;
    if (infiniteQuery.isError) return stateTransactions;
    const pages = infiniteQuery.data?.pages;
    const flat = (pages ?? []).flat() as Transaction[];
    if (infiniteQuery.isPending && flat.length === 0) {
      return stateTransactions;
    }
    return flat;
  }, [shouldUseNative, stateTransactions, infiniteQuery.data, infiniteQuery.isPending, infiniteQuery.isError]);

  const isUsingNative = shouldUseNative && infiniteQuery.isSuccess;
  const isLoading = shouldUseNative
    ? infiniteQuery.isPending || infiniteQuery.isFetchingNextPage
    : false;

  const error =
    (infiniteQuery.error as Error | null) ||
    (countQuery.error as Error | null) ||
    null;

  const totalCount = useMemo((): number | null => {
    if (!isLocalOnlyMode()) return stateTransactions.length;
    if (isMobileDevice()) return null;
    if (shouldUseNative) {
      if (countEnabled) return countQuery.data ?? null;
      return null;
    }
    return stateTransactions.length;
  }, [shouldUseNative, countEnabled, countQuery.data, stateTransactions.length]);

  const hasMore = shouldUseNative ? !!infiniteQuery.hasNextPage : false;

  return {
    transactions,
    isLoading,
    error,
    hasMore,
    loadMore,
    refresh,
    totalCount,
    isNativeEnabled,
    isUsingNative,
  };
}
