import type pg from 'pg';
import type { DashboardSnapshotApi } from '../types/index.js';
import { AnalyticsSnapshotRepository } from '../repositories/AnalyticsSnapshotRepository.js';

export async function listSnapshotsForDate(
  client: pg.PoolClient,
  tenantId: string,
  snapshotDate: string
): Promise<DashboardSnapshotApi> {
  const repo = new AnalyticsSnapshotRepository(tenantId);
  const rows = await repo.listForDate(client, snapshotDate);

  const kpis: DashboardSnapshotApi['kpis'] = {};
  let computedAt = new Date().toISOString();
  for (const row of rows) {
    kpis[row.kpi_key] = {
      numeric: row.value_numeric != null ? Number(row.value_numeric) : undefined,
      json: row.value_json ?? undefined,
    };
    computedAt = new Date(row.computed_at).toISOString();
  }

  return { snapshotDate, kpis, computedAt };
}

export async function upsertSnapshot(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    snapshotDate: string;
    kpiKey: string;
    valueNumeric?: number | null;
    valueJson?: unknown;
    periodStart?: string | null;
    periodEnd?: string | null;
  }
): Promise<void> {
  const repo = new AnalyticsSnapshotRepository(tenantId);
  await repo.upsert(client, input);
}
