import type pg from 'pg';
import { getPool } from '../../db/pool.js';
import { MonitoringEventRepository } from '../../modules/monitoring/repositories/MonitoringRepository.js';

export type DatabaseObservabilitySnapshot = {
  generatedAt: string;
  pool: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    maxConnections: number;
  };
  slowQueriesFromMonitoring: Array<{
    route: string | null;
    method: string | null;
    durationMs: number | null;
    message: string;
    createdAt: string;
  }>;
  pgStatStatementsAvailable: boolean;
  topSlowStatements: Array<{
    query: string;
    calls: number;
    meanMs: number;
    totalMs: number;
  }>;
  lockContention: {
    waitingLocks: number;
  };
};

const eventRepo = new MonitoringEventRepository();

export async function getDatabaseObservability(client: pg.PoolClient): Promise<DatabaseObservabilitySnapshot> {
  const pool = getPool();
  const poolStats = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    maxConnections: (pool as unknown as { options?: { max?: number } }).options?.max ?? 20,
  };

  const slowRows = await eventRepo.listFiltered(client, {
    category: 'database',
    limit: 20,
    offset: 0,
    search: null,
    since: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
  });

  const perfRows = await eventRepo.listFiltered(client, {
    category: 'performance',
    limit: 50,
    offset: 0,
    search: null,
    since: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
  });

  const slowQueriesFromMonitoring = [
    ...slowRows.map((r) => ({
      route: r.route,
      method: r.method,
      durationMs: r.duration_ms,
      message: r.message,
      createdAt: r.created_at,
    })),
    ...perfRows
      .filter((r) => (r.duration_ms ?? 0) >= 500)
      .map((r) => ({
        route: r.route,
        method: r.method,
        durationMs: r.duration_ms,
        message: r.message,
        createdAt: r.created_at,
      })),
  ]
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, 20);

  let pgStatStatementsAvailable = false;
  let topSlowStatements: DatabaseObservabilitySnapshot['topSlowStatements'] = [];

  try {
    const ext = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS exists`
    );
    pgStatStatementsAvailable = ext.rows[0]?.exists === true;
    if (pgStatStatementsAvailable) {
      const stats = await client.query<{
        query: string;
        calls: string;
        mean_ms: string;
        total_ms: string;
      }>(
        `SELECT
           LEFT(query, 200) AS query,
           calls::text,
           ROUND(mean_exec_time::numeric, 2)::text AS mean_ms,
           ROUND(total_exec_time::numeric, 2)::text AS total_ms
         FROM pg_stat_statements
         WHERE query NOT ILIKE '%pg_stat_statements%'
         ORDER BY mean_exec_time DESC
         LIMIT 20`
      );
      topSlowStatements = stats.rows.map((r) => ({
        query: r.query,
        calls: Number(r.calls),
        meanMs: Number(r.mean_ms),
        totalMs: Number(r.total_ms),
      }));
    }
  } catch {
    pgStatStatementsAvailable = false;
  }

  let waitingLocks = 0;
  try {
    const locks = await client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM pg_locks WHERE NOT granted`
    );
    waitingLocks = Number(locks.rows[0]?.c ?? 0);
  } catch {
    waitingLocks = 0;
  }

  return {
    generatedAt: new Date().toISOString(),
    pool: poolStats,
    slowQueriesFromMonitoring,
    pgStatStatementsAvailable,
    topSlowStatements,
    lockContention: { waitingLocks },
  };
}
