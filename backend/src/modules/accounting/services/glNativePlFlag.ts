/**
 * P0 rollout flag (per-tenant). FALSE = legacy posting to Income/Expense Summary.
 * TRUE  = GL-native posting to Revenue/Expense/COGS accounts.
 * Source: tenants.gl_native_pl (migration 145).
 */
import type pg from 'pg';

const cache = new Map<string, { value: boolean; at: number }>();
const TTL_MS = 30_000;

export function clearGlNativePlCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

export async function isGlNativePlEnabled(client: pg.PoolClient, tenantId: string): Promise<boolean> {
  const hit = cache.get(tenantId);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.value;

  const r = await client.query<{ gl_native_pl: boolean }>(
    `SELECT gl_native_pl FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const value = r.rows[0]?.gl_native_pl === true;
  cache.set(tenantId, { value, at: now });
  return value;
}
