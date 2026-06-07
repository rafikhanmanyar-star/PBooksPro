/**
 * Database adapter for the legacy admin portal routes (pre-v1.2.180 server/api/admin).
 * Uses the shared backend pool without tenant RLS context.
 */
import { getPool } from '../db/pool.js';

export class DatabaseService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query<T = any>(text: string, params?: unknown[]): Promise<T[]> {
    const pool = getPool();
    const result = await pool.query(text, params);
    return result.rows as T[];
  }

  getPool() {
    return getPool();
  }

  async healthCheck(): Promise<{ ok: boolean }> {
    await getPool().query('SELECT 1');
    return { ok: true };
  }
}

let instance: DatabaseService | null = null;

export function getDatabaseService(): DatabaseService {
  if (!instance) instance = new DatabaseService();
  return instance;
}
