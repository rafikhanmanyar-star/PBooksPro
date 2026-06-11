import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { BudgetRow } from '../../../services/budgetsService.js';

const BUDGET_COLUMNS = `id, tenant_id, category_id, project_id, amount::text, user_id, version, deleted_at, created_at, updated_at`;

export type BudgetWriteFields = {
  category_id: string;
  project_id: string;
  amount: number;
};

export type BudgetListFilters = {
  projectId?: string;
};

export class BudgetRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<BudgetRow | null> {
    const r = await client.query<BudgetRow>(
      `SELECT ${BUDGET_COLUMNS}
       FROM budgets WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<BudgetRow | null> {
    const r = await client.query<BudgetRow>(
      `SELECT ${BUDGET_COLUMNS}
       FROM budgets WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient, filters?: BudgetListFilters): Promise<BudgetRow[]> {
    const projectId = filters?.projectId?.trim();
    if (projectId) {
      const r = await client.query<BudgetRow>(
        `SELECT ${BUDGET_COLUMNS}
         FROM budgets WHERE tenant_id = $1 AND deleted_at IS NULL AND project_id = $2
         ORDER BY category_id ASC`,
        [this.tenantId, projectId]
      );
      return r.rows;
    }
    const r = await client.query<BudgetRow>(
      `SELECT ${BUDGET_COLUMNS}
       FROM budgets WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY project_id ASC, category_id ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<BudgetRow[]> {
    const r = await client.query<BudgetRow>(
      `SELECT ${BUDGET_COLUMNS}
       FROM budgets WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertBudget(
    client: pg.PoolClient,
    id: string,
    fields: BudgetWriteFields,
    userId: string | null
  ): Promise<BudgetRow> {
    const r = await client.query<BudgetRow>(
      `INSERT INTO budgets (
         id, tenant_id, category_id, project_id, amount, user_id, version, deleted_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 1, NULL, NOW(), NOW())
       RETURNING ${BUDGET_COLUMNS}`,
      [id, this.tenantId, fields.category_id, fields.project_id, fields.amount, userId]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    fields: BudgetWriteFields,
    options?: { userId?: string | null; restoreDeleted?: boolean }
  ): Promise<BudgetRow | null> {
    const restore = options?.restoreDeleted === true;
    const r = await client.query<BudgetRow>(
      `UPDATE budgets SET
         category_id = $3, project_id = $4, amount = $5, user_id = COALESCE($6, user_id),
         version = version + 1, updated_at = NOW()${restore ? ', deleted_at = NULL' : ''}
       WHERE id = $1 AND tenant_id = $2${restore ? '' : ' AND deleted_at IS NULL'}
       RETURNING ${BUDGET_COLUMNS}`,
      [id, this.tenantId, fields.category_id, fields.project_id, fields.amount, options?.userId ?? null]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(
    client: pg.PoolClient,
    id: string,
    expectedVersion?: number
  ): Promise<{ ok: boolean }> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $3' : '';
    const params =
      expectedVersion !== undefined ? [id, this.tenantId, expectedVersion] : [id, this.tenantId];
    const r = await client.query(
      `UPDATE budgets SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}`,
      params
    );
    return { ok: (r.rowCount ?? 0) > 0 };
  }
}
