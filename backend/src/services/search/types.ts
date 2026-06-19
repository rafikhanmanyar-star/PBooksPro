import {
  parsePaginationQuery,
  type PaginationParams,
  type OffsetPaginationParams,
} from '../../utils/pagination/index.js';

export type SortDirection = 'asc' | 'desc';

export interface EntitySearchQuery extends PaginationParams, OffsetPaginationParams {
  search?: string;
  sortBy?: string;
  sortDir: SortDirection;
}

export interface ParseEntitySearchOptions {
  defaultPageSize?: number;
  maxPageSize?: number;
}

/** True when client requests A3.1 paginated / searchable list (not bulk sync). */
export function hasPaginationQuery(query: Record<string, unknown>): boolean {
  return (
    query.page !== undefined ||
    query.pageSize !== undefined ||
    query.limit !== undefined ||
    query.offset !== undefined ||
    query.search !== undefined
  );
}

export function parseEntitySearchQuery(
  query: Record<string, unknown>,
  options: ParseEntitySearchOptions = {}
): EntitySearchQuery {
  const pagination = parsePaginationQuery(query, {
    pageSize: options.defaultPageSize ?? 50,
    maxPageSize: options.maxPageSize ?? 500,
  });

  const searchRaw = query.search;
  const search =
    typeof searchRaw === 'string' && searchRaw.trim() ? searchRaw.trim() : undefined;

  const sortByRaw =
    (typeof query.sortBy === 'string' && query.sortBy) ||
    (typeof query.sortKey === 'string' && query.sortKey) ||
    undefined;

  const sortDirRaw =
    (typeof query.sortDirection === 'string' && query.sortDirection) ||
    (typeof query.sortDir === 'string' && query.sortDir) ||
    'asc';

  const sortDir: SortDirection = sortDirRaw.toLowerCase() === 'desc' ? 'desc' : 'asc';

  return {
    ...pagination,
    search,
    sortBy: sortByRaw?.trim() || undefined,
    sortDir,
  };
}
