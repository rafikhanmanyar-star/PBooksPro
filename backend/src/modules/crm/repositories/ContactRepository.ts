import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type ContactRow = {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  version: number;
  deleted_at: Date | null;
};

export class ContactRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<ContactRow | null> {
    const r = await client.query<ContactRow>(
      `SELECT id, tenant_id, name, type, version, deleted_at
       FROM contacts WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [this.tenantId, id]
    );
    return r.rows[0] ?? null;
  }
}
