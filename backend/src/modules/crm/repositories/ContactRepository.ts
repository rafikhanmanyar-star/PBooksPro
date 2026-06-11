import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ContactRow } from '../../../services/contactsService.js';

const CONTACT_COLUMNS = `id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at`;

export type ContactWriteFields = {
  name: string;
  type: string;
  description: string | null;
  contact_no: string | null;
  company_name: string | null;
  address: string | null;
};

function contactFieldParams(fields: ContactWriteFields): unknown[] {
  return [
    fields.name,
    fields.type,
    fields.description,
    fields.contact_no,
    fields.company_name,
    fields.address,
  ];
}

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

  async insertContact(
    client: pg.PoolClient,
    id: string,
    fields: ContactWriteFields,
    userId: string | null
  ): Promise<ContactRow> {
    const r = await client.query<ContactRow>(
      `INSERT INTO contacts (id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NULL, NOW(), NOW())
       RETURNING ${CONTACT_COLUMNS}`,
      [id, this.tenantId, ...contactFieldParams(fields), userId]
    );
    return r.rows[0]!;
  }

  /** Vendor-directory bridge: same id as vendors row, ON CONFLICT DO NOTHING. */
  async upsertVendorBridgeContact(
    client: pg.PoolClient,
    id: string,
    fields: ContactWriteFields,
    userId: string | null
  ): Promise<void> {
    await client.query(
      `INSERT INTO contacts (id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NULL, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, this.tenantId, ...contactFieldParams(fields), userId]
    );
  }

  async reviveVendorBridgeContact(
    client: pg.PoolClient,
    id: string,
    fields: ContactWriteFields,
    userId: string | null
  ): Promise<string | null> {
    const r = await client.query<{ id: string }>(
      `UPDATE contacts SET
         deleted_at = NULL,
         name = $3,
         type = $4,
         description = COALESCE($5, description),
         contact_no = COALESCE($6, contact_no),
         company_name = COALESCE($7, company_name),
         address = COALESCE($8, address),
         user_id = COALESCE($9, user_id),
         version = version + 1,
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, this.tenantId, ...contactFieldParams(fields), userId]
    );
    return r.rows[0]?.id ?? null;
  }

  async updateActive(client: pg.PoolClient, id: string, fields: ContactWriteFields): Promise<ContactRow | null> {
    const r = await client.query<ContactRow>(
      `UPDATE contacts SET
         name = $3, type = $4, description = $5, contact_no = $6, company_name = $7, address = $8,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${CONTACT_COLUMNS}`,
      [id, this.tenantId, ...contactFieldParams(fields)]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(
    client: pg.PoolClient,
    id: string,
    expectedVersion?: number
  ): Promise<{ ok: boolean; row: ContactRow | null }> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $3' : '';
    const params =
      expectedVersion !== undefined ? [id, this.tenantId, expectedVersion] : [id, this.tenantId];
    const r = await client.query<ContactRow>(
      `UPDATE contacts SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}
       RETURNING ${CONTACT_COLUMNS}`,
      params
    );
    return { ok: (r.rowCount ?? 0) > 0, row: r.rows[0] ?? null };
  }
}
