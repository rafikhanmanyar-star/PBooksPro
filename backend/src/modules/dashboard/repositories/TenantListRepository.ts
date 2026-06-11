import type pg from 'pg';
import { getPool } from '../../../db/pool.js';

/** Platform read — lists all tenant ids for schedulers. */
export async function listAllTenantIds(client?: pg.PoolClient): Promise<string[]> {
  const executor = client ?? (await getPool().connect());
  const owns = !client;
  try {
    const r = await executor.query<{ id: string }>(`SELECT id FROM tenants`);
    return r.rows.map((row) => row.id);
  } finally {
    if (owns) executor.release();
  }
}
