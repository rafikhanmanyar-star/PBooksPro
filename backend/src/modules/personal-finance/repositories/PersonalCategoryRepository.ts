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

  async insertCategory(
    client: pg.PoolClient,
    id: string,
    name: string,
    type: string,
    sortOrder: number
  ): Promise<PersonalCategoryRow> {
    const r = await client.query<PersonalCategoryRow>(
      `INSERT INTO personal_categories (
         id, tenant_id, name, type, sort_order, version, deleted_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 1, NULL, NOW(), NOW())
       RETURNING ${CATEGORY_COLUMNS}`,
      [id, this.tenantId, name, type, sortOrder]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    name: string,
    type: string,
    sortOrder: number
  ): Promise<PersonalCategoryRow | null> {
    const r = await client.query<PersonalCategoryRow>(
      `UPDATE personal_categories SET
         name = $2, type = $3, sort_order = $4, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $5 AND deleted_at IS NULL
       RETURNING ${CATEGORY_COLUMNS}`,
      [id, name, type, sortOrder, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<PersonalCategoryRow | null> {
    const r = await client.query<PersonalCategoryRow>(
      `UPDATE personal_categories SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${CATEGORY_COLUMNS}`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }
}
