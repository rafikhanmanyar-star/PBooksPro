import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import { VendorRepository } from '../modules/vendors/repositories/VendorRepository.js';

export type VendorRow = {
  id: string;
  tenant_id: string;
  name: string;
  contact_no: string | null;
  company_name: string | null;
  address: string | null;
  description: string | null;
  is_active: boolean;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export function rowToVendorApi(row: VendorRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    contactNo: row.contact_no ?? undefined,
    companyName: row.company_name ?? undefined,
    address: row.address ?? undefined,
    isActive: row.is_active,
    userId: row.user_id ?? undefined,
    version: row.version,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
  if (row.deleted_at) {
    base.deletedAt = row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  return base;
}

/** Vendors created/updated/deleted since `since` (for incremental sync). */
export async function listVendorsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<VendorRow[]> {
  return new VendorRepository(tenantId).listChangedSince(client, since);
}

function pickBody(body: Record<string, unknown>) {
  let description: string | null | undefined;
  if (body.description === undefined) description = undefined;
  else if (body.description === null) description = null;
  else description = String(body.description);

  const contactNo = body.contactNo ?? body.contact_no;
  const companyName = body.companyName ?? body.company_name;
  const address = body.address;
  const userId = body.userId ?? body.user_id;
  const isActive = body.is_active ?? body.isActive;
  const version = typeof body.version === 'number' ? body.version : undefined;

  return {
    name: String(body.name ?? '').trim(),
    description,
    contactNo: contactNo === undefined ? undefined : contactNo === null ? null : String(contactNo),
    companyName: companyName === undefined ? undefined : companyName === null ? null : String(companyName),
    address: address === undefined ? undefined : address === null ? null : String(address),
    userId: userId === undefined ? undefined : userId === null ? null : String(userId),
    isActive: typeof isActive === 'boolean' ? isActive : isActive === undefined ? undefined : Boolean(isActive),
    version,
  };
}

export async function listVendors(client: pg.PoolClient, tenantId: string): Promise<VendorRow[]> {
  return new VendorRepository(tenantId).listActive(client);
}

export async function getVendorById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<VendorRow | null> {
  return new VendorRepository(tenantId).getById(client, id);
}

export async function createVendor(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<VendorRow> {
  const p = pickBody(body);
  if (!p.name) throw new Error('Vendor name is required.');
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID();
  const isActive = p.isActive !== false;

  const row = await new VendorRepository(tenantId).insertVendor(client, id, {
    name: p.name,
    contact_no: p.contactNo ?? null,
    company_name: p.companyName ?? null,
    address: p.address ?? null,
    description: p.description ?? null,
    is_active: isActive,
    user_id: p.userId ?? null,
  });
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'vendors',
    entityType: 'vendor',
    entityId: row.id,
    action: 'create',
    summary: `Vendor ${row.name} created`,
    newValue: rowToVendorApi(row),
    version: row.version,
  });
  return row;
}

export async function updateVendor(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>
): Promise<{ row: VendorRow | null; conflict: boolean }> {
  const p = pickBody(body);
  if (!p.name) throw new Error('Vendor name is required.');
  const expectedVersion = p.version;
  const isActive = p.isActive !== false;

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'vendors',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: null, conflict: true };

    const row = await new VendorRepository(tenantId).updateActive(client, id, {
      name: p.name,
      contact_no: p.contactNo ?? null,
      company_name: p.companyName ?? null,
      address: p.address ?? null,
      description: p.description ?? null,
      is_active: isActive,
      user_id: p.userId ?? null,
    });
    if (!row) return { row: null, conflict: false };
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'vendors',
      entityType: 'vendor',
      entityId: row.id,
      action: 'update',
      summary: `Vendor ${row.name} updated`,
      newValue: rowToVendorApi(row),
      version: row.version,
    });
    return { row, conflict: false };
  }

  const row = await new VendorRepository(tenantId).updateActive(client, id, {
    name: p.name,
    contact_no: p.contactNo ?? null,
    company_name: p.companyName ?? null,
    address: p.address ?? null,
    description: p.description ?? null,
    is_active: isActive,
    user_id: p.userId ?? null,
  });
  if (row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'vendors',
      entityType: 'vendor',
      entityId: row.id,
      action: 'update',
      summary: `Vendor ${row.name} updated`,
      newValue: rowToVendorApi(row),
      version: row.version,
    });
  }
  return { row, conflict: false };
}

export async function softDeleteVendor(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const before = await getVendorById(client, tenantId, id);
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'vendors',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const { ok, row } = await new VendorRepository(tenantId).markDeleted(client, id);
    if (!ok || !row) return { ok: false, conflict: false };
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'vendors',
      entityType: 'vendor',
      entityId: row.id,
      action: 'delete',
      summary: `Vendor ${row.name} deleted`,
      oldValue: before ? rowToVendorApi(before) : null,
      version: row.version,
    });
    return { ok: true, conflict: false };
  }
  const { ok, row } = await new VendorRepository(tenantId).markDeleted(client, id);
  if (ok && row) {
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'vendors',
      entityType: 'vendor',
      entityId: row.id,
      action: 'delete',
      summary: `Vendor ${row.name} deleted`,
      oldValue: before ? rowToVendorApi(before) : null,
      version: row.version,
    });
  }
  return { ok, conflict: false };
}
