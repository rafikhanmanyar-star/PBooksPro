import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../../constants/globalSystemChart.js';
import type { CategoryRow } from '../../../services/categoriesService.js';

const CATEGORY_COLUMNS = `id, tenant_id, name, type, description, is_permanent, is_rental, is_hidden, parent_category_id, version, deleted_at, created_at, updated_at`;

/** Category reads (tenant + global system rows). */
export class CategoryRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<CategoryRow | null> {
    const r = await client.query<CategoryRow>(
      `SELECT ${CATEGORY_COLUMNS}
       FROM categories WHERE id = $1 AND (tenant_id = $2 OR tenant_id = $3) AND deleted_at IS NULL`,
      [id, this.tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<CategoryRow | null> {
    const r = await client.query<CategoryRow>(
      `SELECT ${CATEGORY_COLUMNS}
       FROM categories WHERE id = $1 AND (tenant_id = $2 OR tenant_id = $3)`,
      [id, this.tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<CategoryRow[]> {
    const r = await client.query<CategoryRow>(
      `SELECT ${CATEGORY_COLUMNS}
       FROM categories WHERE (tenant_id = $1 OR tenant_id = $2) AND deleted_at IS NULL ORDER BY name ASC`,
      [this.tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<CategoryRow[]> {
    const r = await client.query<CategoryRow>(
      `SELECT ${CATEGORY_COLUMNS}
       FROM categories WHERE (tenant_id = $1 OR tenant_id = $2) AND updated_at > $3
       ORDER BY updated_at ASC`,
      [this.tenantId, GLOBAL_SYSTEM_TENANT_ID, since]
    );
    return r.rows;
  }
}
