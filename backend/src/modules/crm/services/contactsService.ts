import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import { ContactRepository } from '../repositories/ContactRepository.js';

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
  return new ContactRepository(tenantId).listChangedSince(client, since);
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
  return new ContactRepository(tenantId).listActive(client);
}

export async function getContactById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ContactRow | null> {
  return new ContactRepository(tenantId).getById(client, id);
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
  const row = await new ContactRepository(tenantId).insertContact(
    client,
    id,
    {
      name: p.name,
      type: p.type,
      description: p.description ?? null,
      contact_no: p.contact_no ?? null,
      company_name: p.company_name ?? null,
      address: p.address ?? null,
    },
    p.user_id ?? actorUserId
  );
  await recordDomainMutation(client, {
    tenantId,
    userId: actorUserId,
    module: 'contacts',
    entityType: 'contact',
    entityId: row.id,
    action: 'create',
    summary: `Contact ${row.name} created`,
    newValue: rowToContactApi(row),
    version: row.version,
  });
  return row;
}

export async function updateContact(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: ContactRow | null; conflict: boolean }> {
  const p = pickBody(body);
  const expectedVersion = p.version;
  if (!p.name.trim()) throw new Error('Contact name is required.');
  if (!p.type.trim()) throw new Error('Contact type is required.');

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'contacts',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: null, conflict: true };

    const row = await new ContactRepository(tenantId).updateActive(client, id, {
      name: p.name,
      type: p.type,
      description: p.description ?? null,
      contact_no: p.contact_no ?? null,
      company_name: p.company_name ?? null,
      address: p.address ?? null,
    });
    if (!row) {
      return { row: null, conflict: false };
    }
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId,
      module: 'contacts',
      entityType: 'contact',
      entityId: row.id,
      action: 'update',
      summary: `Contact ${row.name} updated`,
      newValue: rowToContactApi(row),
      version: row.version,
    });
    return { row, conflict: false };
  }

  const row = await new ContactRepository(tenantId).updateActive(client, id, {
    name: p.name,
    type: p.type,
    description: p.description ?? null,
    contact_no: p.contact_no ?? null,
    company_name: p.company_name ?? null,
    address: p.address ?? null,
  });
  if (row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId,
      module: 'contacts',
      entityType: 'contact',
      entityId: row.id,
      action: 'update',
      summary: `Contact ${row.name} updated`,
      newValue: rowToContactApi(row),
      version: row.version,
    });
  }
  return { row, conflict: false };
}

export async function softDeleteContact(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  actorUserId: string | null,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const before = await getContactById(client, tenantId, id);
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'contacts',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const { ok, row } = await new ContactRepository(tenantId).markDeleted(client, id, expectedVersion);
    if (!ok) {
      if (!before) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    if (!row) return { ok: false, conflict: false };
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId,
      module: 'contacts',
      entityType: 'contact',
      entityId: row.id,
      action: 'delete',
      summary: `Contact ${row.name} deleted`,
      oldValue: before ? rowToContactApi(before) : null,
      version: row.version,
    });
    return { ok: true, conflict: false };
  }
  const { ok, row } = await new ContactRepository(tenantId).markDeleted(client, id);
  if (ok && row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId,
      module: 'contacts',
      entityType: 'contact',
      entityId: row.id,
      action: 'delete',
      summary: `Contact ${row.name} deleted`,
      oldValue: before ? rowToContactApi(before) : null,
      version: row.version,
    });
  }
  return { ok, conflict: false };
}
