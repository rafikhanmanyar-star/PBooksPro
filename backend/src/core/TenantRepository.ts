import type pg from 'pg';
import { getPool } from '../db/pool.js';

/** v2 `version_number` — PostgreSQL column is `version`. */
export type EntityVersion = number;

export type SoftDeleteInput = {
  table: string;
  id: string;
  deletedBy?: string | null;
  idColumn?: string;
};

/**
 * Base repository enforcing tenant_id on every query.
 * All new domain repositories must extend this class.
 */
export abstract class TenantRepository {
  protected readonly tenantId: string;
  protected readonly client: pg.PoolClient | null;

  constructor(tenantId: string, client?: pg.PoolClient) {
    const tid = tenantId?.trim();
    if (!tid) throw new Error('TenantRepository requires tenantId');
    this.tenantId = tid;
    this.client = client ?? null;
  }

  getTenantId(): string {
    return this.tenantId;
  }

  protected async getExecutor(): Promise<pg.PoolClient> {
    if (this.client) return this.client;
    return getPool().connect();
  }

  /** SQL fragment: active rows only (soft-delete). */
  protected activeOnly(alias = ''): string {
    const p = alias ? `${alias}.` : '';
    return `${p}deleted_at IS NULL`;
  }

  protected tenantWhere(alias = '', extra?: string): string {
    const p = alias ? `${alias}.` : '';
    const base = `${p}tenant_id = $1`;
    return extra ? `${base} AND ${extra}` : base;
  }

  protected async query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<pg.QueryResult<T>> {
    const executor = await this.getExecutor();
    const ownsConnection = !this.client;
    try {
      this.assertTenantParam(params);
      return await executor.query<T>(sql, params);
    } finally {
      if (ownsConnection) executor.release();
    }
  }

  protected async queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | null> {
    const r = await this.query<T>(sql, params);
    return r.rows[0] ?? null;
  }

  protected async insert(
    table: string,
    columns: Record<string, unknown>
  ): Promise<void> {
    const cols: Record<string, unknown> = { tenant_id: this.tenantId, ...columns };
    const keys = Object.keys(cols);
    const placeholders = keys.map((_, i) => `$${i + 1}`);
    const values = keys.map((k) => cols[k]);
    await this.query(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
      values
    );
  }

  protected async update(
    table: string,
    id: string,
    columns: Record<string, unknown>,
    options?: { idColumn?: string; extraWhere?: string }
  ): Promise<number> {
    const idColumn = options?.idColumn ?? 'id';
    const keys = Object.keys(columns);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const extra = options?.extraWhere ? ` AND ${options.extraWhere}` : '';
    const values = [this.tenantId, ...keys.map((k) => columns[k]), id];
    const r = await this.query(
      `UPDATE ${table} SET ${setClause}, updated_at = NOW()
       WHERE tenant_id = $1 AND ${idColumn} = $${keys.length + 2}${extra}`,
      values
    );
    return r.rowCount ?? 0;
  }

  /** Soft delete: sets deleted_at, deleted_by, bumps version. */
  async softDelete(input: SoftDeleteInput): Promise<number> {
    const idColumn = input.idColumn ?? 'id';
    const r = await this.query(
      `UPDATE ${input.table}
       SET deleted_at = NOW(),
           deleted_by = $3,
           version = COALESCE(version, 1) + 1,
           updated_at = NOW()
       WHERE tenant_id = $1 AND ${idColumn} = $2 AND deleted_at IS NULL`,
      [this.tenantId, input.id, input.deletedBy ?? null]
    );
    return r.rowCount ?? 0;
  }

  private assertTenantParam(params: unknown[]): void {
    if (params.length === 0) return;
    if (params[0] !== this.tenantId) {
      throw new Error(
        `TenantRepository query tenant mismatch: expected ${this.tenantId}, got ${String(params[0])}`
      );
    }
  }
}
