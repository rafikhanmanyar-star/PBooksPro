/** Match UI / propertyOwnershipService (100% ± this tolerance). */
export const OWNERSHIP_TOTAL_EPS = 0.01;

export type OwnerShareInput = { ownerId: string; sharePercent: number };

export function primaryOwnerIdFromShares(shares: { ownerId: string; percentage: number }[]): string | undefined {
  if (shares.length === 0) return undefined;
  const sorted = [...shares].sort((a, b) =>
    b.percentage !== a.percentage ? b.percentage - a.percentage : a.ownerId.localeCompare(b.ownerId)
  );
  return sorted[0].ownerId;
}

/**
 * Validates owners for a transfer. Accepts `sharePercent` (API) or maps from `percentage`.
 */
export function validateOwnershipTransferOwners(
  owners: Array<{ ownerId: string; sharePercent?: number; percentage?: number }>
): { error: string } | { owners: { ownerId: string; percentage: number }[] } {
  if (!Array.isArray(owners) || owners.length === 0) {
    return { error: 'owners array is required with at least one entry.' };
  }
  const normalized: { ownerId: string; percentage: number }[] = [];
  const seen = new Set<string>();
  let sum = 0;
  for (const o of owners) {
    const ownerId = String(o.ownerId ?? '').trim();
    if (!ownerId) return { error: 'Each owner is required.' };
    if (seen.has(ownerId)) return { error: 'Duplicate owners are not allowed.' };
    seen.add(ownerId);
    const raw = o.sharePercent ?? o.percentage ?? 0;
    const pct = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(pct) || pct <= 0) return { error: 'Each ownership percentage must be positive.' };
    sum += pct;
    normalized.push({ ownerId, percentage: pct });
  }
  if (Math.abs(sum - 100) > OWNERSHIP_TOTAL_EPS) {
    return { error: `Ownership percentages must total 100% (currently ${sum.toFixed(4)}).` };
  }
  return { owners: normalized };
}

export function parseIsoDateOnly(transferDate: unknown): { error: string } | { ymd: string } {
  if (transferDate == null || transferDate === '') return { error: 'transferDate is required.' };
  const s = String(transferDate).trim();
  const ymd = s.length >= 10 ? s.slice(0, 10) : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return { error: 'transferDate must be an ISO date (YYYY-MM-DD).' };
  return { ymd };
}
