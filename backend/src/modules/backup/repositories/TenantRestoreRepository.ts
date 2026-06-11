import type pg from 'pg';
import { randomUUID } from 'crypto';
import { TenantRepository } from '../../../core/TenantRepository.js';

export class TenantRestoreRepository {
  async tableHasColumn(client: pg.PoolClient, table: string, column: string): Promise<boolean> {
    const r = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
      [table, column]
    );
    return r.rows.length > 0;
  }

  async getRowTenantId(
    client: pg.PoolClient,
    table: string,
    id: string
  ): Promise<string | null> {
    const r = await client.query<{ tenant_id: string | null }>(
      `SELECT tenant_id FROM ${table} WHERE id = $1 LIMIT 1`,
      [id]
    );
    return r.rows[0]?.tenant_id != null ? String(r.rows[0].tenant_id) : null;
  }

  async hasPayrollTenantConfig(client: pg.PoolClient, tenantId: string): Promise<boolean> {
    const r = await client.query(
      `SELECT 1 FROM payroll_tenant_config WHERE tenant_id = $1`,
      [tenantId]
    );
    return r.rows.length > 0;
  }

  async upsertPayrollTenantConfig(
    client: pg.PoolClient,
    tenantId: string,
    remapped: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `INSERT INTO payroll_tenant_config (tenant_id, earning_types, deduction_types, default_account_id, default_category_id, default_project_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
       ON CONFLICT (tenant_id) DO UPDATE SET
         earning_types = EXCLUDED.earning_types,
         deduction_types = EXCLUDED.deduction_types,
         default_account_id = EXCLUDED.default_account_id,
         default_category_id = EXCLUDED.default_category_id,
         default_project_id = EXCLUDED.default_project_id,
         updated_at = EXCLUDED.updated_at`,
      [
        tenantId,
        JSON.stringify(remapped.earning_types ?? []),
        JSON.stringify(remapped.deduction_types ?? []),
        remapped.default_account_id ?? null,
        remapped.default_category_id ?? null,
        remapped.default_project_id ?? null,
        remapped.updated_at ?? null,
      ]
    );
  }

  async insertRow(
    client: pg.PoolClient,
    table: string,
    columns: string[],
    values: unknown[]
  ): Promise<void> {
    const colList = columns.map((c) => `"${c}"`).join(', ');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    await client.query(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`, values);
  }

  async upsertRow(
    client: pg.PoolClient,
    table: string,
    columns: string[],
    values: unknown[]
  ): Promise<void> {
    const colList = columns.map((c) => `"${c}"`).join(', ');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const insertSql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`;
    const updates = columns
      .filter((c) => c !== 'id')
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .join(', ');
    const updateSql =
      updates.length > 0
        ? `${insertSql} ON CONFLICT (id) DO UPDATE SET ${updates}`
        : `${insertSql} ON CONFLICT (id) DO NOTHING`;
    await client.query(updateSql, values);
  }

  async insertRestoreRun(
    client: pg.PoolClient,
    input: {
      id: string;
      sourceTenantId: string;
      targetTenantId: string;
      mode: string;
      conflictPolicy: string;
      previewReport: unknown;
      requestedBy: string | null;
      startedAt: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO tenant_restore_runs (
         id, source_tenant_id, target_tenant_id, mode, conflict_policy,
         status, preview_report, requested_by, started_at
       ) VALUES ($1, $2, $3, $4, $5, 'preview', $6, $7, $8)`,
      [
        input.id,
        input.sourceTenantId,
        input.targetTenantId,
        input.mode,
        input.conflictPolicy,
        JSON.stringify(input.previewReport),
        input.requestedBy,
        input.startedAt,
      ]
    );
  }

  async completeRestoreRun(
    client: pg.PoolClient,
    runId: string,
    resultSummary: unknown
  ): Promise<void> {
    await client.query(
      `UPDATE tenant_restore_runs SET
         status = 'completed',
         result_summary = $2,
         completed_at = NOW()
       WHERE id = $1`,
      [runId, JSON.stringify(resultSummary)]
    );
  }

  async failRestoreRun(client: pg.PoolClient, runId: string, reason: string): Promise<void> {
    await client.query(
      `UPDATE tenant_restore_runs SET
         status = 'rolled_back',
         failure_reason = $2,
         completed_at = NOW()
       WHERE id = $1`,
      [runId, reason]
    );
  }

  async insertTenant(client: pg.PoolClient, id: string, name: string): Promise<void> {
    await client.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [id, name]);
  }

  async listRestoreRuns(
    client: pg.PoolClient,
    targetTenantId: string,
    limit: number
  ): Promise<unknown[]> {
    const r = await client.query(
      `SELECT id, source_tenant_id, target_tenant_id, mode, conflict_policy, status,
              failure_reason, started_at, completed_at, created_at
       FROM tenant_restore_runs
       WHERE target_tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [targetTenantId, limit]
    );
    return r.rows;
  }
}

export class BackupRestoreAuthRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async createSession(
    client: pg.PoolClient,
    userId: string,
    expiresAt: string
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO backup_restore_sessions (id, tenant_id, user_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [id, this.tenantId, userId, expiresAt]
    );
    return id;
  }

  async consumeSession(client: pg.PoolClient, token: string, userId: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE backup_restore_sessions SET used = true
       WHERE id = $1 AND tenant_id = $2 AND user_id = $3
         AND used = false AND expires_at > NOW()
       RETURNING id`,
      [token, this.tenantId, userId]
    );
    return r.rows.length > 0;
  }

  static async purgeExpired(client: pg.PoolClient): Promise<void> {
    await client.query(`DELETE FROM backup_restore_sessions WHERE expires_at < NOW()`);
  }
}
