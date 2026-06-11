import type pg from 'pg';
import { randomUUID } from 'crypto';
import { TenantRepository } from '../../../core/TenantRepository.js';

export class AnalyticsSnapshotRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async listForDate(client: pg.PoolClient, snapshotDate: string) {
    const r = await client.query<{
      kpi_key: string;
      value_numeric: string | null;
      value_json: unknown;
      computed_at: Date;
    }>(
      `SELECT kpi_key, value_numeric, value_json, computed_at
       FROM analytics_snapshots
       WHERE tenant_id = $1 AND snapshot_date = $2::date
       ORDER BY kpi_key`,
      [this.tenantId, snapshotDate]
    );
    return r.rows;
  }

  async upsert(
    client: pg.PoolClient,
    input: {
      snapshotDate: string;
      kpiKey: string;
      valueNumeric?: number | null;
      valueJson?: unknown;
      periodStart?: string | null;
      periodEnd?: string | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO analytics_snapshots (
         id, tenant_id, snapshot_date, kpi_key, value_numeric, value_json,
         computed_at, period_start, period_end
       ) VALUES ($1, $2, $3::date, $4, $5, $6::jsonb, NOW(), $7::date, $8::date)
       ON CONFLICT (tenant_id, snapshot_date, kpi_key) DO UPDATE SET
         value_numeric = EXCLUDED.value_numeric,
         value_json = EXCLUDED.value_json,
         computed_at = NOW(),
         period_start = EXCLUDED.period_start,
         period_end = EXCLUDED.period_end`,
      [
        randomUUID(),
        this.tenantId,
        input.snapshotDate,
        input.kpiKey,
        input.valueNumeric ?? null,
        input.valueJson != null ? JSON.stringify(input.valueJson) : null,
        input.periodStart ?? null,
        input.periodEnd ?? null,
      ]
    );
  }
}
