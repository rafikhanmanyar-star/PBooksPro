import pg from 'pg';
import { normalizeDatabaseUrl } from '../utils/databaseUrl.js';

const { Pool, types } = pg;

// node-pg parses DATE (OID 1082) into JS Date using the server's local
// timezone, which shifts the calendar day when the server isn't UTC.
// Override to return the raw 'YYYY-MM-DD' string — no timezone ambiguity.
const PG_DATE_OID = 1082;
types.setTypeParser(PG_DATE_OID, (val: string) => val);

let pool: pg.Pool | null = null;

/** Render and other cloud Postgres hosts require TLS on external connections. */
function resolvePoolSsl(url: string): pg.PoolConfig['ssl'] | undefined {
  if (process.env.PGSSLMODE === 'require' || /sslmode=require/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  if (/\.render\.com/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export function getPool(): pg.Pool {
  if (!pool) {
    const raw = process.env.DATABASE_URL;
    if (!raw?.trim()) {
      throw new Error('DATABASE_URL is required for the API server');
    }
    const url = normalizeDatabaseUrl(raw);
    if (url !== raw.trim()) {
      process.env.DATABASE_URL = url;
      console.warn(
        '[db] DATABASE_URL had no PostgreSQL user — using postgres@ (node-pg would otherwise use the OS username).'
      );
    }
    const max = Math.min(Math.max(parseInt(process.env.PG_POOL_MAX || '20', 10) || 20, 2), 100);
    const idleTimeoutMillis = Math.min(
      Math.max(parseInt(process.env.PG_POOL_IDLE_MS || '30000', 10) || 30_000, 5_000),
      300_000
    );
    const ssl = resolvePoolSsl(url);
    const base: pg.PoolConfig = { connectionString: url, max, idleTimeoutMillis };
    pool = new Pool(ssl ? { ...base, ssl } : base);
  }
  return pool;
}

/** Close all pool connections (e.g. before pg_restore). Next getPool() creates a new pool. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

function savepointLabel(label: string): string {
  const safe = label.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48);
  return `sp_${safe || 'block'}`;
}

/**
 * Run `fn` inside a SAVEPOINT so a failure rolls back only this block.
 * Required when catching errors inside an open transaction (PostgreSQL 25P02 otherwise).
 */
export async function withSavepoint<T>(
  client: pg.PoolClient,
  label: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const sp = savepointLabel(label);
  await client.query(`SAVEPOINT ${sp}`);
  try {
    const result = await fn(client);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (e) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    throw e;
  }
}
