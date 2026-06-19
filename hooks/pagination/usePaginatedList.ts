import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildPaginatedResponse,
  hasMorePages,
  type PaginatedResponse,
} from '../../shared/types/pagination';

export type PaginatedListFetchResult<T, M = unknown> = PaginatedResponse<T> & { meta?: M };

export type PaginatedListFetchPage<T, M = unknown> = (
  page: number,
  pageSize: number
) => Promise<PaginatedListFetchResult<T, M>>;

export interface UsePaginatedListOptions<T, M = unknown> {
  fetchPage: PaginatedListFetchPage<T, M>;
  pageSize?: number;
  enabled?: boolean;
  /** Changes reset accumulated rows and reload page 1. */
  resetKey?: string | number | boolean | null;
}

export interface UsePaginatedListResult<T, M = unknown> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  meta: M | null;
  loadMore: () => void;
  refresh: () => void;
}

const DEFAULT_PAGE_SIZE = 50;

export function usePaginatedList<T, M = unknown>(
  options: UsePaginatedListOptions<T, M>
): UsePaginatedListResult<T, M> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const enabled = options.enabled ?? true;

  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<M | null>(null);

  const fetchPageRef = useRef(options.fetchPage);
  fetchPageRef.current = options.fetchPage;

  const runFetch = useCallback(
    async (targetPage: number, mode: 'replace' | 'append') => {
      if (!enabled) return;
      const isAppend = mode === 'append';
      if (isAppend) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await fetchPageRef.current(targetPage, pageSize);
        const normalized = buildPaginatedResponse(
          result.data,
          result.totalCount,
          result.page ?? targetPage,
          result.pageSize ?? pageSize
        );
        setPage(normalized.page);
        setTotalCount(normalized.totalCount);
        setTotalPages(normalized.totalPages);
        setItems((prev) => (isAppend ? [...prev, ...normalized.data] : normalized.data));
        if (result.meta !== undefined) {
          setMeta(result.meta);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
        if (!isAppend) {
          setItems([]);
          setTotalCount(0);
          setTotalPages(0);
        }
      } finally {
        if (isAppend) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [enabled, pageSize]
  );

  const refresh = useCallback(() => {
    void runFetch(1, 'replace');
  }, [runFetch]);

  const loadMore = useCallback(() => {
    if (!enabled || loading || loadingMore) return;
    if (!hasMorePages(page, pageSize, totalCount)) return;
    void runFetch(page + 1, 'append');
  }, [enabled, loading, loadingMore, page, pageSize, totalCount, runFetch]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setPage(1);
      setTotalCount(0);
      setTotalPages(0);
      setMeta(null);
      setError(null);
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    void runFetch(1, 'replace');
  }, [enabled, options.resetKey, runFetch]);

  return {
    items,
    page,
    pageSize,
    totalCount,
    totalPages,
    hasMore: hasMorePages(page, pageSize, totalCount),
    loading,
    loadingMore,
    error,
    meta,
    loadMore,
    refresh,
  };
}
