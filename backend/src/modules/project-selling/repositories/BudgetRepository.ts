import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { BudgetRow } from '../../../services/budgetsService.js';

const BUDGET_COLUMNS = `id, tenant_id, category_id, project_id, amount::text, user_id, version, deleted_at, created_at, updated_at`;

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
}
