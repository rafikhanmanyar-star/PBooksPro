import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { VendorRow } from '../../../services/vendorsService.js';

const VENDOR_COLUMNS = `id, tenant_id, name, contact_no, company_name, address, description, is_active, user_id, version, deleted_at, created_at, updated_at`;

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
}
