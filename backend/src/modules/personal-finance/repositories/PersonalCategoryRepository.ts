import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PersonalCategoryRow } from '../../../services/personalCategoriesService.js';

const CATEGORY_COLUMNS = `id, tenant_id, name, type, sort_order, version, deleted_at, created_at, updated_at`;

export class PersonalCategoryRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<PersonalCategoryRow | null> {
    const r = await client.query<PersonalCategoryRow>(
      `SELECT ${CATEGORY_COLUMNS}
       FROM personal_categories WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<PersonalCategoryRow | null> {
    const r = await client.query<PersonalCategoryRow>(
      `SELECT ${CATEGORY_COLUMNS}
       FROM personal_categories WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<PersonalCategoryRow[]> {
    const r = await client.query<PersonalCategoryRow>(
      `SELECT ${CATEGORY_COLUMNS}
       FROM personal_categories WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY type ASC, sort_order ASC, name ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<PersonalCategoryRow[]> {
    const r = await client.query<PersonalCategoryRow>(
      `SELECT ${CATEGORY_COLUMNS}
       FROM personal_categories WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
