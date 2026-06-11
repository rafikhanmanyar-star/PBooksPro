import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ContactRow } from '../../../services/contactsService.js';

const CONTACT_COLUMNS = `id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at`;

export class ContactRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<ContactRow | null> {
    const r = await client.query<ContactRow>(
      `SELECT ${CONTACT_COLUMNS}
       FROM contacts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<ContactRow[]> {
    const r = await client.query<ContactRow>(
      `SELECT ${CONTACT_COLUMNS}
       FROM contacts WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<ContactRow[]> {
    const r = await client.query<ContactRow>(
      `SELECT ${CONTACT_COLUMNS}
       FROM contacts WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}
