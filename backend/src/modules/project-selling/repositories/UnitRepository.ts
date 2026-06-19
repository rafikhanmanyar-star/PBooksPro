import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import { buildIlikeSearchClause, resolveSortExpression } from '../../../services/search/index.js';
import type { SortDirection } from '../../../services/search/index.js';
import type { UnitRow } from '../../properties/services/unitsService.js';

const UNIT_COLUMNS = `id, tenant_id, project_id, unit_number, floor, unit_type, size, status, owner_contact_id, sale_price, description, area, user_id, version, deleted_at, created_at, updated_at`;

export type UnitWriteFields = {
  project_id: string;
  unit_number: string;
  floor: string | null;
  unit_type: string | null;
  size: string | null;
  status: string;
  owner_contact_id: string | null;
  sale_price: number | null;
  description: string | null;
  area: number | null;
};

export type UnitListFilters = {
  projectId?: string;
};

export class UnitRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<UnitRow | null> {
    const r = await client.query<UnitRow>(
      `SELECT ${UNIT_COLUMNS}
       FROM units WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async list(client: pg.PoolClient, filters?: UnitListFilters): Promise<UnitRow[]> {
    const params: unknown[] = [this.tenantId];
    let where = 'tenant_id = $1 AND deleted_at IS NULL';
    if (filters?.projectId) {
      params.push(filters.projectId);
      where += ` AND project_id = $${params.length}`;
    }
    const r = await client.query<UnitRow>(
      `SELECT ${UNIT_COLUMNS} FROM units WHERE ${where} ORDER BY unit_number ASC`,
      params
    );
    return r.rows;
  }

  async listPage(
    client: pg.PoolClient,
    opts: {
      limit: number;
      offset: number;
      projectId?: string;
      search?: string;
      sortBy?: string;
      sortDir?: SortDirection;
    }
  ): Promise<{ rows: UnitRow[]; total: number }> {
    const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL'];
    const params: unknown[] = [this.tenantId];
    let paramIndex = 2;

    if (opts.projectId) {
      conditions.push(`project_id = $${paramIndex++}`);
      params.push(opts.projectId);
    }

    const searchClause = buildIlikeSearchClause(
      ['unit_number', 'unit_type', 'floor', 'size', 'description'],
      opts.search,
      params,
      paramIndex
    );
    if (searchClause.clause) {
      conditions.push(searchClause.clause);
      paramIndex = searchClause.nextParamIndex;
    }

    const whereClause = conditions.join(' AND ');
    const sortWhitelist: Record<string, string> = {
      unitNumber: 'unit_number',
      name: 'unit_number',
      status: 'status',
      floor: 'floor',
      unitType: 'unit_type',
    };
    const { orderClause } = resolveSortExpression(
      opts.sortBy,
      opts.sortDir ?? 'asc',
      sortWhitelist,
      'unitNumber'
    );

    const countR = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM units WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countR.rows[0]?.count ?? '0', 10);

    params.push(opts.limit, opts.offset);
    const limitIdx = paramIndex;
    const offsetIdx = paramIndex + 1;
    const r = await client.query<UnitRow>(
      `SELECT ${UNIT_COLUMNS} FROM units WHERE ${whereClause} ${orderClause} LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );
    return { rows: r.rows, total };
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<UnitRow[]> {
    const r = await client.query<UnitRow>(
      `SELECT ${UNIT_COLUMNS}
       FROM units WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertUnit(
    client: pg.PoolClient,
    id: string,
    fields: UnitWriteFields,
    userId: string | null
  ): Promise<UnitRow> {
    const r = await client.query<UnitRow>(
      `INSERT INTO units (
         id, tenant_id, project_id, unit_number, floor, unit_type, size, status, owner_contact_id, sale_price, description, area, user_id, version, deleted_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, NULL, NOW(), NOW())
       RETURNING ${UNIT_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.project_id,
        fields.unit_number,
        fields.floor,
        fields.unit_type,
        fields.size,
        fields.status,
        fields.owner_contact_id,
        fields.sale_price,
        fields.description,
        fields.area,
        userId,
      ]
    );
    return r.rows[0]!;
  }

  async updateActive(client: pg.PoolClient, id: string, fields: UnitWriteFields): Promise<UnitRow | null> {
    const r = await client.query<UnitRow>(
      `UPDATE units SET
         project_id = $3, unit_number = $4, floor = $5, unit_type = $6, size = $7, status = $8,
         owner_contact_id = $9, sale_price = $10, description = $11, area = $12,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${UNIT_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.project_id,
        fields.unit_number,
        fields.floor,
        fields.unit_type,
        fields.size,
        fields.status,
        fields.owner_contact_id,
        fields.sale_price,
        fields.description,
        fields.area,
      ]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<{ ok: boolean; row: UnitRow | null }> {
    const r = await client.query<UnitRow>(
      `UPDATE units SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${UNIT_COLUMNS}`,
      [id, this.tenantId]
    );
    return { ok: (r.rowCount ?? 0) > 0, row: r.rows[0] ?? null };
  }
}
