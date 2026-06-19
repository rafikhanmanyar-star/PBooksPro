/**
 * Shared pagination contracts for API list endpoints and frontend hooks.
 * Backend helpers in `backend/src/utils/pagination/` mirror these shapes.
 */

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface OffsetPaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Legacy offset shape still returned by some endpoints during migration. */
export interface LegacyOffsetPaginationMeta {
  limit: number;
  offset: number;
  total: number;
}

export interface PaginationQueryDefaults {
  page?: number;
  pageSize?: number;
  maxPageSize?: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_PAGE_SIZE = 500;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

/**
 * Normalize page/pageSize or limit/offset query params into a single shape.
 * Prefer `page` + `pageSize` for new endpoints; `limit` + `offset` remain supported.
 */
export function parsePaginationQuery(
  query: Record<string, unknown>,
  defaults: PaginationQueryDefaults = {}
): PaginationParams & OffsetPaginationParams {
  const maxPageSize = defaults.maxPageSize ?? DEFAULT_MAX_PAGE_SIZE;
  const defaultPageSize = defaults.pageSize ?? DEFAULT_PAGE_SIZE;
  const defaultPage = defaults.page ?? DEFAULT_PAGE;

  const hasExplicitOffset = query.limit !== undefined || query.offset !== undefined;
  const hasExplicitPage = query.page !== undefined || query.pageSize !== undefined;

  if (hasExplicitOffset && !hasExplicitPage) {
    const limit = clampInt(query.limit, defaultPageSize, 1, maxPageSize);
    const offset = clampInt(query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const page = Math.floor(offset / limit) + 1;
    return { page, pageSize: limit, limit, offset };
  }

  const pageSize = clampInt(query.pageSize, defaultPageSize, 1, maxPageSize);
  const page = clampInt(query.page, defaultPage, 1, Number.MAX_SAFE_INTEGER);
  const limit = pageSize;
  const offset = (page - 1) * pageSize;
  return { page, pageSize, limit, offset };
}

export function buildPaginatedResponse<T>(
  data: T[],
  totalCount: number,
  page: number,
  pageSize: number
): PaginatedResponse<T> {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = totalCount === 0 ? 0 : Math.max(1, Math.ceil(totalCount / safePageSize));
  return {
    data,
    totalCount,
    page,
    pageSize: safePageSize,
    totalPages,
  };
}

export function pageToOffset(page: number, pageSize: number): number {
  return (Math.max(1, page) - 1) * Math.max(1, pageSize);
}

export function hasMorePages(page: number, pageSize: number, totalCount: number): boolean {
  return page * pageSize < totalCount;
}
