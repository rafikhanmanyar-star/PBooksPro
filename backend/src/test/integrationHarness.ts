/**
 * Opt-in PostgreSQL integration tests.
 * Run: RUN_INTEGRATION_TESTS=1 npm run test:integration --prefix backend
 * Requires DATABASE_URL and migrated schema.
 */
import type pg from 'pg';
import '../loadEnv.js';
import { getPool } from '../db/pool.js';
import { bootstrapTenantChart } from '../services/tenantBootstrap.js';

export const INTEGRATION_TENANT_ID = '__integration_test__';

export function integrationTestsEnabled(): boolean {
  return process.env.RUN_INTEGRATION_TESTS === '1' && Boolean(process.env.DATABASE_URL?.trim());
}

/** Run fn inside BEGIN … ROLLBACK so the database is left unchanged. */
export async function withRollbackTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('ROLLBACK');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function prepareIntegrationTenant(client: pg.PoolClient): Promise<void> {
  await bootstrapTenantChart(client, INTEGRATION_TENANT_ID, { legacyIds: false });
}
