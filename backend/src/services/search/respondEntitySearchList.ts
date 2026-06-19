import type { Response } from 'express';
import { buildPaginatedResponse } from '../../utils/pagination/index.js';
import { hasPaginationQuery, parseEntitySearchQuery } from './index.js';

export type PaginatedListRouteOptions<TRow, TApi> = {
  query: Record<string, unknown>;
  listAll: () => Promise<TRow[]>;
  listPage: (params: {
    page: number;
    pageSize: number;
    limit: number;
    offset: number;
    search?: string;
    sortBy?: string;
    sortDir: 'asc' | 'desc';
  }) => Promise<{ rows: TRow[]; total: number }>;
  mapRow: (row: TRow) => TApi;
  sendSuccess: (res: Response, body: unknown) => void;
  res: Response;
  defaultPageSize?: number;
  maxPageSize?: number;
};

/**
 * Shared GET list handler: full array for bulk sync, paginated search when query params present.
 */
export async function respondEntitySearchList<TRow, TApi>(
  options: PaginatedListRouteOptions<TRow, TApi>
): Promise<void> {
  const { query, res, sendSuccess, listAll, listPage, mapRow } = options;

  if (!hasPaginationQuery(query)) {
    const rows = await listAll();
    sendSuccess(res, rows.map((r) => mapRow(r)));
    return;
  }

  const { page, pageSize, limit, offset, search, sortBy, sortDir } = parseEntitySearchQuery(query, {
    defaultPageSize: options.defaultPageSize,
    maxPageSize: options.maxPageSize,
  });

  const { rows, total } = await listPage({
    page,
    pageSize,
    limit,
    offset,
    search,
    sortBy,
    sortDir,
  });

  sendSuccess(
    res,
    buildPaginatedResponse(rows.map((r) => mapRow(r)), total, page, pageSize)
  );
}
