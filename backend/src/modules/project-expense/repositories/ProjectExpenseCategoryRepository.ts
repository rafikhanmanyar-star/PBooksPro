import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export interface ProjectExpenseCategoryRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  version: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

const SELECT_COLS = `id, tenant_id, name, description, is_active, version, created_at, updated_at, deleted_at`;

export class ProjectExpenseCategoryRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async list(client: pg.PoolClient, options?: { activeOnly?: boolean }): Promise<ProjectExpenseCategoryRow[]> {
    const activeOnly = options?.activeOnly === true;
    const r = await client.query<ProjectExpenseCategoryRow>(
      `SELECT ${SELECT_COLS}
       FROM project_expense_categories
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ${activeOnly ? 'AND is_active = TRUE' : ''}
       ORDER BY name ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async getById(client: pg.PoolClient, id: string): Promise<ProjectExpenseCategoryRow | null> {
    const r = await client.query<ProjectExpenseCategoryRow>(
      `SELECT ${SELECT_COLS}
       FROM project_expense_categories
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async getByIdForUpdate(client: pg.PoolClient, id: string): Promise<ProjectExpenseCategoryRow | null> {
    const r = await client.query<ProjectExpenseCategoryRow>(
      `SELECT ${SELECT_COLS}
       FROM project_expense_categories
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<ProjectExpenseCategoryRow[]> {
    const r = await client.query<ProjectExpenseCategoryRow>(
      `SELECT ${SELECT_COLS}
       FROM project_expense_categories
       WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertCategory(
    client: pg.PoolClient,
    id: string,
    name: string,
    description: string | null,
    isActive: boolean
  ): Promise<ProjectExpenseCategoryRow> {
    const r = await client.query<ProjectExpenseCategoryRow>(
      `INSERT INTO project_expense_categories (id, tenant_id, name, description, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${SELECT_COLS}`,
      [id, this.tenantId, name, description, isActive]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    name: string,
    description: string | null,
    isActive: boolean
  ): Promise<ProjectExpenseCategoryRow | null> {
    const r = await client.query<ProjectExpenseCategoryRow>(
      `UPDATE project_expense_categories SET
         name = $1, description = $2, is_active = $3, version = version + 1, updated_at = NOW()
       WHERE tenant_id = $4 AND id = $5 AND deleted_at IS NULL
       RETURNING ${SELECT_COLS}`,
      [name, description, isActive, this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE project_expense_categories SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
    return (r.rowCount ?? 0) > 0;
  }
}
