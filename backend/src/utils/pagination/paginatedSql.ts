/**
 * Standard SQL pagination pattern for PostgreSQL list endpoints.
 *
 * ```sql
 * SELECT COUNT(*)::int AS c FROM <table> WHERE <tenant + filters>;
 * SELECT <cols> FROM <table> WHERE <tenant + filters>
 *   ORDER BY <sort>
 *   LIMIT $n OFFSET $m;
 * ```
 *
 * Repositories should:
 * 1. Build filter SQL + params once (tenant_id always first).
 * 2. Run COUNT with the same WHERE clause.
 * 3. Run SELECT with ORDER BY + LIMIT/OFFSET appended.
 *
 * Sorting and search belong in the WHERE/ORDER BY built by the repository —
 * pagination helpers only normalize limit/offset from the request.
 */

export type PaginatedSqlSlice = {
  limit: number;
  offset: number;
};

/** Append LIMIT/OFFSET placeholders — `limitParamIndex` / `offsetParamIndex` are 1-based. */
export function sqlLimitOffset(limitParamIndex: number, offsetParamIndex: number): string {
  return ` LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`;
}
