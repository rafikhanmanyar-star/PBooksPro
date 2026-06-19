/**
 * Build parameterized ILIKE clause for server-side entity search.
 * Pair with trigram GIN indexes (migration 131) for large-tenant performance.
 */

export function buildIlikeSearchClause(
  columnExprs: readonly string[],
  search: string | undefined,
  params: unknown[],
  startParamIndex: number
): { clause: string; nextParamIndex: number } {
  const term = search?.trim();
  if (!term || columnExprs.length === 0) {
    return { clause: '', nextParamIndex: startParamIndex };
  }

  const pattern = `%${term}%`;
  params.push(pattern);
  const p = `$${startParamIndex}`;
  const ors = columnExprs.map((col) => `${col} ILIKE ${p}`);
  return {
    clause: `(${ors.join(' OR ')})`,
    nextParamIndex: startParamIndex + 1,
  };
}
