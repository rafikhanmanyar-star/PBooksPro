/**
 * Shared system chart uses canonical ids (`sys-acc-cash`, `sys-cat-*`) with tenant_id `__system__`.
 * Legacy rows may still use `tenantId__sys-acc-cash`; resolve by logical id within loaded rows.
 */

export function resolveSystemAccountId(
  accounts: { id: string }[] | undefined,
  logicalId: string
): string | undefined {
  const list = accounts ?? [];
  const direct = list.find((a) => a.id === logicalId);
  if (direct) return direct.id;
  return list.find((a) => a.id.endsWith(`__${logicalId}`))?.id;
}

export function resolveSystemCategoryId(
  categories: { id: string }[] | undefined,
  logicalId: string
): string | undefined {
  const list = categories ?? [];
  const direct = list.find((c) => c.id === logicalId);
  if (direct) return direct.id;
  return list.find((c) => c.id.endsWith(`__${logicalId}`))?.id;
}

/** True if `accountId` is the given logical system account (legacy or tenant-prefixed). */
export function accountIdMatchesLogical(accountId: string | undefined, logicalId: string): boolean {
  if (!accountId) return false;
  return accountId === logicalId || accountId.endsWith(`__${logicalId}`);
}
