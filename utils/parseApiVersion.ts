/** Optimistic-lock `version` from API may be number or string (Postgres / JSON). */
export function parseApiEntityVersion(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const n = parseInt(v.trim(), 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
