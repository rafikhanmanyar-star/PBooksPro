import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { VendorRow } from '../../../services/vendorsService.js';

const VENDOR_COLUMNS = `id, tenant_id, name, contact_no, company_name, address, description, is_active, user_id, version, deleted_at, created_at, updated_at`;

export type VendorWriteFields = {
  name: string;
  contact_no: string | null;
  company_name: string | null;
  address: string | null;
  description: string | null;
  is_active: boolean;
  user_id: string | null;
};

function vendorFieldParams(fields: VendorWriteFields): unknown[] {
  return [
    fields.name,
    fields.contact_no,
    fields.company_name,
    fields.address,
    fields.description,
    fields.is_active,
    fields.user_id,
  ];
}

export class VendorRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<VendorRow | null> {
    const r = await client.query<VendorRow>(
      `SELECT ${VENDOR_COLUMNS}
       FROM vendors WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<VendorRow[]> {
    const r = await client.query<VendorRow>(
      `SELECT ${VENDOR_COLUMNS}
       FROM vendors WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<VendorRow[]> {
    const r = await client.query<VendorRow>(
      `SELECT ${VENDOR_COLUMNS}
       FROM vendors WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertVendor(client: pg.PoolClient, id: string, fields: VendorWriteFields): Promise<VendorRow> {
    const r = await client.query<VendorRow>(
      `INSERT INTO vendors (id, tenant_id, name, contact_no, company_name, address, description, is_active, user_id, version, deleted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NULL, NOW(), NOW())
       RETURNING ${VENDOR_COLUMNS}`,
      [id, this.tenantId, ...vendorFieldParams(fields)]
    );
    return r.rows[0]!;
  }

  async updateActive(client: pg.PoolClient, id: string, fields: VendorWriteFields): Promise<VendorRow | null> {
    const r = await client.query<VendorRow>(
      `UPDATE vendors SET
         name = $3, contact_no = $4, company_name = $5, address = $6, description = $7,
         is_active = $8, user_id = $9,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${VENDOR_COLUMNS}`,
      [id, this.tenantId, ...vendorFieldParams(fields)]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<{ ok: boolean; row: VendorRow | null }> {
    const r = await client.query<VendorRow>(
      `UPDATE vendors SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${VENDOR_COLUMNS}`,
      [id, this.tenantId]
    );
    return { ok: (r.rowCount ?? 0) > 0, row: r.rows[0] ?? null };
  }
}
