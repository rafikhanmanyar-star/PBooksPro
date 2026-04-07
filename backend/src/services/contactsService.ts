import type pg from 'pg';
import { randomUUID } from 'crypto';

export type ContactRow = {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  description: string | null;
  contact_no: string | null;
  company_name: string | null;
  address: string | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export function rowToContactApi(row: ContactRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description ?? undefined,
    contactNo: row.contact_no ?? undefined,
    companyName: row.company_name ?? undefined,
    address: row.address ?? undefined,
    userId: row.user_id ?? undefined,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    isActive: row.deleted_at == null,
  };
  if (row.deleted_at) {
    base.deletedAt = row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  return base;
}

/** Contacts created/updated/deleted since `since` (for incremental sync). */
export async function listContactsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<ContactRow[]> {
  const r = await client.query<ContactRow>(
    `SELECT id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at
     FROM contacts WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}

function pickBody(body: Record<string, unknown>) {
  let description: string | null | undefined;
  if (body.description === undefined) description = undefined;
  else if (body.description === null) description = null;
  else description = String(body.description);

  return {
    name: String(body.name ?? ''),
    type: String(body.type ?? ''),
    description,
    contact_no: (body.contactNo ?? body.contact_no) as string | null | undefined,
    company_name: (body.companyName ?? body.company_name) as string | null | undefined,
    address: (body.address === undefined ? undefined : body.address === null ? null : String(body.address)) as
      | string
      | null
      | undefined,
    user_id: (body.userId ?? body.user_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

export async function listContacts(client: pg.PoolClient, tenantId: string): Promise<ContactRow[]> {
  const r = await client.query<ContactRow>(
    `SELECT id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at
     FROM contacts WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC`,
    [tenantId]
  );
  return r.rows;
}

export async function getContactById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ContactRow | null> {
  const r = await client.query<ContactRow>(
    `SELECT id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at
     FROM contacts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function createContact(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<ContactRow> {
  const p = pickBody(body);
  if (!p.name.trim()) throw new Error('Contact name is required.');
  if (!p.type.trim()) throw new Error('Contact type is required.');
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID();
  const r = await client.query<ContactRow>(
    `INSERT INTO contacts (id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NULL, NOW(), NOW())
     RETURNING id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.name,
      p.type,
      p.description ?? null,
      p.contact_no ?? null,
      p.company_name ?? null,
      p.address ?? null,
      p.user_id ?? actorUserId,
    ]
  );
  return r.rows[0];
}

export async function updateContact(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>
): Promise<{ row: ContactRow | null; conflict: boolean }> {
  const p = pickBody(body);
  const expectedVersion = p.version;
  if (!p.name.trim()) throw new Error('Contact name is required.');
  if (!p.type.trim()) throw new Error('Contact type is required.');

  if (expectedVersion !== undefined) {
    const r = await client.query<ContactRow>(
      `UPDATE contacts SET
        name = $3, type = $4, description = $5, contact_no = $6, company_name = $7, address = $8,
        version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $9
       RETURNING id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at`,
      [
        id,
        tenantId,
        p.name,
        p.type,
        p.description ?? null,
        p.contact_no ?? null,
        p.company_name ?? null,
        p.address ?? null,
        expectedVersion,
      ]
    );
    if (r.rows.length === 0) {
      const exists = await getContactById(client, tenantId, id);
      if (!exists) return { row: null, conflict: false };
      return { row: null, conflict: true };
    }
    return { row: r.rows[0], conflict: false };
  }

  const r = await client.query<ContactRow>(
    `UPDATE contacts SET
      name = $3, type = $4, description = $5, contact_no = $6, company_name = $7, address = $8,
      version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, name, type, description, contact_no, company_name, address, user_id, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.name,
      p.type,
      p.description ?? null,
      p.contact_no ?? null,
      p.company_name ?? null,
      p.address ?? null,
    ]
  );
  return { row: r.rows[0] ?? null, conflict: false };
}

export async function softDeleteContact(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  if (expectedVersion !== undefined) {
    const r = await client.query(
      `UPDATE contacts SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      const cur = await getContactById(client, tenantId, id);
      if (!cur) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    return { ok: true, conflict: false };
  }
  const r = await client.query(
    `UPDATE contacts SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: (r.rowCount ?? 0) > 0, conflict: false };
}
