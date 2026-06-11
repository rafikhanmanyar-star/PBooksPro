/** Pure grace-period helpers (no service imports — safe for repositories). */

export function getPastDueGraceDays(): number {
  const raw = process.env.PAST_DUE_GRACE_DAYS;
  const n = raw ? Number(raw) : 7;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 7;
}

export function gracePeriodEndsAt(pastDueAt: string | null | undefined): string | null {
  if (!pastDueAt) return null;
  const end = new Date(pastDueAt);
  end.setDate(end.getDate() + getPastDueGraceDays());
  return end.toISOString();
}

export function isWithinPastDueGrace(pastDueAt: string | null | undefined): boolean {
  const endsAt = gracePeriodEndsAt(pastDueAt);
  if (!endsAt) return false;
  return Date.now() < new Date(endsAt).getTime();
}
