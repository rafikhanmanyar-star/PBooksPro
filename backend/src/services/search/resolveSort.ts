import type { SortDirection } from './types.js';

export function resolveSortExpression(
  sortBy: string | undefined,
  sortDir: SortDirection,
  whitelist: Record<string, string>,
  defaultKey: string
): { sortKey: string; orderClause: string } {
  const sortKey = sortBy && whitelist[sortBy] ? sortBy : defaultKey;
  const expr = whitelist[sortKey]!;
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  return {
    sortKey,
    orderClause: `ORDER BY ${expr} ${dir} NULLS LAST`,
  };
}
