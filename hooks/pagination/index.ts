export { usePaginatedList } from './usePaginatedList';
export { useInfiniteEntityQuery } from './useInfiniteEntityQuery';
export type {
  PaginatedListFetchPage,
  PaginatedListFetchResult,
  UsePaginatedListOptions,
  UsePaginatedListResult,
} from './usePaginatedList';
export type {
  InfiniteEntityFetchParams,
  InfiniteEntityQueryFilters,
  InfiniteEntitySort,
  UseInfiniteEntityQueryOptions,
  UseInfiniteEntityQueryResult,
} from './useInfiniteEntityQuery';

export {
  buildPaginatedResponse,
  hasMorePages,
  pageToOffset,
  parsePaginationQuery,
  type PaginatedResponse,
  type PaginationParams,
  type OffsetPaginationParams,
  type LegacyOffsetPaginationMeta,
} from '../../shared/types/pagination';

/** Default page size for new paginated list UIs (A3.1). */
export const DEFAULT_LIST_PAGE_SIZE = 50;

/** Max rows per export / admin escape hatch (read-only). */
export const PAGINATION_EXPORT_MAX_ROWS = 5000;
