import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../../constants/globalSystemChart.js';
import type { CategoryRow } from '../services/categoriesService.js';

const CATEGORY_COLUMNS = `id, tenant_id, name, type, description, is_permanent, is_rental, is_hidden, parent_category_id, version, deleted_at, created_at, updated_at`;

export type CategoryWriteFields = {
  name: string;
  type: string;
  description: string | null;
  is_permanent: boolean;
  is_rental: boolean;
  is_hidden: boolean;
  parent_category_id: string | null;
};

function categoryFieldParams(fields: CategoryWriteFields): unknown[] {
  return [
    fields.name,
    fields.type,
    fields.description,
    fields.is_permanent,
    fields.is_rental,
    fields.is_hidden,
    fields.parent_category_id,
  ];
}

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

  async deletePlMapping(client: pg.PoolClient, categoryId: string): Promise<void> {
    await client.query(
      `DELETE FROM pl_category_mapping WHERE tenant_id = $1 AND category_id = $2`,
      [this.tenantId, categoryId]
    );
  }

  async upsertPlMapping(client: pg.PoolClient, categoryId: string, plType: string): Promise<void> {
    await client.query(
      `INSERT INTO pl_category_mapping (tenant_id, category_id, pl_type, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tenant_id, category_id) DO UPDATE SET pl_type = EXCLUDED.pl_type, updated_at = NOW()`,
      [this.tenantId, categoryId, plType]
    );
  }

  async getPlSubTypeForCategory(
    client: pg.PoolClient,
    categoryId: string,
    globalTenantId: string
  ): Promise<string | undefined> {
    const r = await client.query<{ pl_type: string }>(
      `SELECT pl_type FROM pl_category_mapping
       WHERE category_id = $1 AND (tenant_id = $2 OR tenant_id = $3)
       ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END
       LIMIT 1`,
      [categoryId, this.tenantId, globalTenantId]
    );
    return r.rows[0]?.pl_type;
  }

  async findTenantCategoryIdByLowerName(client: pg.PoolClient, name: string): Promise<string | undefined> {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM categories
       WHERE tenant_id = $1 AND deleted_at IS NULL AND LOWER(TRIM(name)) = $2
       LIMIT 1`,
      [this.tenantId, name.trim().toLowerCase()]
    );
    return r.rows[0]?.id;
  }

  async listPlMappings(
    client: pg.PoolClient,
    globalTenantId: string
  ): Promise<Array<{ category_id: string; pl_type: string; tenant_id: string }>> {
    const r = await client.query<{ category_id: string; pl_type: string; tenant_id: string }>(
      `SELECT category_id, pl_type, tenant_id FROM pl_category_mapping WHERE tenant_id = $1 OR tenant_id = $2`,
      [this.tenantId, globalTenantId]
    );
    return r.rows;
  }

  async touchUpdatedAt(client: pg.PoolClient, categoryId: string): Promise<void> {
    await client.query(
      `UPDATE categories SET updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [categoryId, this.tenantId]
    );
  }

  async insertCategory(client: pg.PoolClient, id: string, fields: CategoryWriteFields): Promise<CategoryRow> {
    const r = await client.query<CategoryRow>(
      `INSERT INTO categories (
         id, tenant_id, name, type, description, is_permanent, is_rental, is_hidden, parent_category_id, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NULL, NOW(), NOW()
       )
       RETURNING ${CATEGORY_COLUMNS}`,
      [id, this.tenantId, ...categoryFieldParams(fields)]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    fields: CategoryWriteFields,
    expectedVersion?: number
  ): Promise<CategoryRow | null> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $10' : '';
    const params =
      expectedVersion !== undefined
        ? [id, this.tenantId, ...categoryFieldParams(fields), expectedVersion]
        : [id, this.tenantId, ...categoryFieldParams(fields)];
    const r = await client.query<CategoryRow>(
      `UPDATE categories SET
         name = $3, type = $4, description = $5, is_permanent = $6, is_rental = $7, is_hidden = $8, parent_category_id = $9,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}
       RETURNING ${CATEGORY_COLUMNS}`,
      params
    );
    return r.rows[0] ?? null;
  }

  async updateUpsertRestore(client: pg.PoolClient, id: string, fields: CategoryWriteFields): Promise<CategoryRow | null> {
    const r = await client.query<CategoryRow>(
      `UPDATE categories SET
         name = $3, type = $4, description = $5, is_permanent = $6, is_rental = $7, is_hidden = $8, parent_category_id = $9,
         deleted_at = NULL, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING ${CATEGORY_COLUMNS}`,
      [id, this.tenantId, ...categoryFieldParams(fields)]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string, expectedVersion?: number): Promise<boolean> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $3' : '';
    const params =
      expectedVersion !== undefined ? [id, this.tenantId, expectedVersion] : [id, this.tenantId];
    const r = await client.query(
      `UPDATE categories SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}`,
      params
    );
    return (r.rowCount ?? 0) > 0;
  }
}
