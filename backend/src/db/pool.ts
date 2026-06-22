import pg from 'pg';
import {
  clearEntityEventQueue,
  flushEntityEventQueue,
  restoreEntityEventQueue,
  runWithEntityEventQueue,
  snapshotEntityEventQueue,
  type QueuedEntityEvent,
} from '../core/entityEventEmissions.js';
import {
  clearFinancialPostedQueue,
  flushFinancialPostedQueue,
  restoreFinancialPostedQueue,
  runWithFinancialPostedQueue,
  snapshotFinancialPostedQueue,
} from '../core/financialPostedEmissions.js';
import { normalizeDatabaseUrl } from '../utils/databaseUrl.js';
import { installPoolOwnershipTracker } from './poolOwnership.js';



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

    // PERF-A6.5: bound the time callers wait for an available connection.
    // Without this, pool exhaustion causes infinite hangs (node-postgres default = 0).
    const connectionTimeoutMillis = Math.min(
      Math.max(parseInt(process.env.PG_POOL_CONNECT_TIMEOUT_MS || '10000', 10) || 10_000, 1_000),
      60_000
    );

    const base: pg.PoolConfig = { connectionString: url, max, idleTimeoutMillis, connectionTimeoutMillis };

    pool = new Pool(ssl ? { ...base, ssl } : base);
    installPoolOwnershipTracker(pool);

    console.log(
      `[POOL_INIT] max=${max} idleTimeoutMillis=${idleTimeoutMillis} connectionTimeoutMillis=${connectionTimeoutMillis}`
    );

  }

  return pool;

}

// ---------------------------------------------------------------------------
// PERF-A6.6: pool load-shedding helpers
// ---------------------------------------------------------------------------

export interface PoolPressureSnapshot {
  total: number;
  idle: number;
  waiting: number;
  saturated: boolean;
}

/**
 * Waiting-queue depth at/above which heavy read endpoints shed load.
 * Configurable via PG_POOL_SHED_WAITING (default 12). Set very high to disable.
 */
function poolShedWaitingThreshold(): number {
  return Math.min(Math.max(parseInt(process.env.PG_POOL_SHED_WAITING || '12', 10) || 12, 1), 100_000);
}

/**
 * True when the pool has no spare capacity AND a queue is already forming.
 * Heavy read endpoints (e.g. GET /state/bulk*) call this to fast-fail with HTTP
 * 503 instead of deepening the queue until the gateway times out (Cloudflare 524).
 * A fast 503 carries CORS headers and lets the client back off, which prevents the
 * retry storm that otherwise keeps the pool permanently saturated.
 */
export function isPoolSaturated(): boolean {
  if (!pool) return false;
  return pool.idleCount === 0 && pool.waitingCount >= poolShedWaitingThreshold();
}

export function getPoolPressure(): PoolPressureSnapshot {
  if (!pool) return { total: 0, idle: 0, waiting: 0, saturated: false };
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    saturated: isPoolSaturated(),
  };
}

// ---------------------------------------------------------------------------
// PERF-A6.4: pool connect instrumentation
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for pool.connect() that logs pool stats before and after
 * acquiring a connection. Use in hot paths to observe starvation in production logs.
 *
 *   [POOL_CONNECT]  caller=X total=N idle=N waiting=N [OK|WARN|HIGH|CRITICAL]
 *   [POOL_ACQUIRED] caller=X waitMs=N total=N idle=N waiting=N
 *   [POOL_WARN]     when waitMs > 1 000 ms or waiting >= 5
 *   [POOL_STALL]    when waitMs > 5 000 ms (pool was exhausted)
 */
export async function poolConnect(caller: string): Promise<pg.PoolClient> {
  const p = getPool();
  const pre = { total: p.totalCount, idle: p.idleCount, waiting: p.waitingCount };

  const pressureLevel =
    pre.waiting >= 10 ? 'CRITICAL' :
    pre.waiting >= 5  ? 'HIGH' :
    pre.waiting >= 1  ? 'WARN' : 'OK';

  console.log(
    `[POOL_CONNECT] caller=${caller} total=${pre.total} idle=${pre.idle} waiting=${pre.waiting} [${pressureLevel}]`
  );

  if (pre.waiting >= 5) {
    console.warn(
      `[POOL_PRESSURE] caller=${caller} waitingCount=${pre.waiting} idleCount=${pre.idle} totalCount=${pre.total}`
    );
  }

  const t0 = Date.now();
  const client = await p.connect();
  const waitMs = Date.now() - t0;

  const post = { total: p.totalCount, idle: p.idleCount, waiting: p.waitingCount };
  console.log(
    `[POOL_ACQUIRED] caller=${caller} waitMs=${waitMs} total=${post.total} idle=${post.idle} waiting=${post.waiting}`
  );

  if (waitMs >= 5_000) {
    console.error(
      `[POOL_STALL] 🔴 caller=${caller} waitMs=${waitMs} — pool was exhausted (max connections in use)`
    );
  } else if (waitMs >= 1_000) {
    console.warn(
      `[POOL_WARN] 🟡 caller=${caller} waitMs=${waitMs} — slow connection acquire`
    );
  }

  return client;
}


/** Close all pool connections (e.g. before pg_restore). Next getPool() creates a new pool. */

export async function closePool(): Promise<void> {

  if (pool) {

    await pool.end();

    pool = null;

  }

}



export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {

  const pendingFinancialPosted: { tenantId: string; payload: import('../core/realtime.js').FinancialPostedPayload }[] =

    [];

  const pendingEntityEvents: QueuedEntityEvent[] = [];

  return runWithFinancialPostedQueue(pendingFinancialPosted, () =>

    runWithEntityEventQueue(pendingEntityEvents, async () => {

      const p = getPool();

      const client = await p.connect();

      try {

        await client.query('BEGIN');

        const result = await fn(client);

        await client.query('COMMIT');

        flushFinancialPostedQueue();

        flushEntityEventQueue();

        return result;

      } catch (e) {

        await client.query('ROLLBACK');

        clearFinancialPostedQueue();

        clearEntityEventQueue();

        throw e;

      } finally {

        client.release();

      }

    })

  );

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



  const entitySnapshot = snapshotEntityEventQueue();

  const financialSnapshot = snapshotFinancialPostedQueue();



  try {

    const result = await fn(client);

    await client.query(`RELEASE SAVEPOINT ${sp}`);

    return result;

  } catch (e) {

    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);

    restoreEntityEventQueue(entitySnapshot);

    restoreFinancialPostedQueue(financialSnapshot);

    throw e;

  }

}


