import type pg from 'pg';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../utils/dateOnly.js';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import { PmCycleAllocationRepository } from '../modules/project-selling/repositories/PmCycleAllocationRepository.js';

export type PmCycleAllocationRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  cycle_id: string;
  cycle_label: string;
  frequency: string;
  start_date: Date;
  end_date: Date;
  allocation_date: Date;
  amount: string;
  paid_amount: string;
  status: string;
  bill_id: string | null;
  description: string | null;
  expense_total: string;
  fee_rate: string;
  excluded_category_ids: string | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function parseIsoDate(label: string, v: unknown): string {
  if (v == null || v === '') throw new Error(`${label} is required.`);
  try {
    return parseApiDateToYyyyMmDd(v);
  } catch {
    throw new Error(`Invalid ${label}.`);
  }
}

function excludedIdsToDb(body: Record<string, unknown>): string | null {
  const raw = body.excludedCategoryIds ?? body.excluded_category_ids;
  if (raw == null) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  try {
    return JSON.stringify(raw);
  } catch {
    return null;
  }
}

function pickBody(body: Record<string, unknown>, userId?: string | null) {
  return {
    project_id: String(body.projectId ?? body.project_id ?? '').trim(),
    cycle_id: String(body.cycleId ?? body.cycle_id ?? '').trim(),
    cycle_label: String(body.cycleLabel ?? body.cycle_label ?? '').trim(),
    frequency: String(body.frequency ?? 'Monthly'),
    start_date: parseIsoDate('startDate', body.startDate ?? body.start_date),
    end_date: parseIsoDate('endDate', body.endDate ?? body.end_date),
    allocation_date: parseIsoDate('allocationDate', body.allocationDate ?? body.allocation_date),
    amount: Number(body.amount ?? 0),
    paid_amount: Number(body.paidAmount ?? body.paid_amount ?? 0),
    status: String(body.status ?? 'unpaid'),
    bill_id: (() => {
      const v = body.billId ?? body.bill_id;
      if (v == null || v === '') return null;
      const s = String(v).trim();
      return s || null;
    })(),
    description:
      body.description === undefined ? undefined : body.description === null ? null : String(body.description),
    expense_total: Number(body.expenseTotal ?? body.expense_total ?? 0),
    fee_rate: Number(body.feeRate ?? body.fee_rate ?? 0),
    excluded_category_ids: excludedIdsToDb(body),
    user_id:
      userId != null && String(userId).trim()
        ? String(userId).trim()
        : (body.userId ?? body.user_id) != null && String(body.userId ?? body.user_id).trim()
          ? String(body.userId ?? body.user_id).trim()
          : null,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

export function rowToPmCycleAllocationApi(row: PmCycleAllocationRow): Record<string, unknown> {
  let excludedCategoryIds: string[] | undefined;
  if (row.excluded_category_ids) {
    try {
      const p = JSON.parse(row.excluded_category_ids);
      excludedCategoryIds = Array.isArray(p) ? p : undefined;
    } catch {
      excludedCategoryIds = undefined;
    }
  }
  const base: Record<string, unknown> = {
    id: row.id,
    projectId: row.project_id,
    cycleId: row.cycle_id,
    cycleLabel: row.cycle_label,
    frequency: row.frequency,
    startDate: formatPgDateToYyyyMmDd(row.start_date),
    endDate: formatPgDateToYyyyMmDd(row.end_date),
    allocationDate: formatPgDateToYyyyMmDd(row.allocation_date),
    amount: Number(row.amount),
    paidAmount: Number(row.paid_amount),
    status: row.status,
    billId: row.bill_id ?? undefined,
    description: row.description ?? undefined,
    expenseTotal: Number(row.expense_total),
    feeRate: Number(row.fee_rate),
    excludedCategoryIds,
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

export async function listPmCycleAllocationsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<PmCycleAllocationRow[]> {
  return new PmCycleAllocationRepository(tenantId).listChangedSince(client, since);
}

export async function listPmCycleAllocations(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { projectId?: string; cycleId?: string; status?: string }
): Promise<PmCycleAllocationRow[]> {
  return new PmCycleAllocationRepository(tenantId).listActive(client, filters);
}

export async function getPmCycleAllocationById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PmCycleAllocationRow | null> {
  return new PmCycleAllocationRepository(tenantId).getById(client, id);
}

async function auditPmCycleAllocation(
  client: pg.PoolClient,
  tenantId: string,
  action: 'create' | 'update' | 'delete',
  row: PmCycleAllocationRow | null,
  userId: string | null | undefined,
  prior?: PmCycleAllocationRow | null,
  entityId?: string
): Promise<void> {
  const id = entityId ?? row?.id;
  if (!id) return;
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? row?.user_id ?? null,
    module: 'project_selling',
    entityType: 'pm_cycle_allocation',
    entityId: id,
    action,
    summary: `PM cycle allocation ${id} ${action}`,
    newValue: row && action !== 'delete' ? rowToPmCycleAllocationApi(row) : undefined,
    oldValue: prior ? rowToPmCycleAllocationApi(prior) : undefined,
    version: row?.version,
  });
}

function allocationFieldValues(p: ReturnType<typeof pickBody>): unknown[] {
  return [
    p.project_id,
    p.cycle_id,
    p.cycle_label,
    p.frequency,
    p.start_date,
    p.end_date,
    p.allocation_date,
    p.amount,
    p.paid_amount,
    p.status,
    p.bill_id,
    p.description ?? null,
    p.expense_total,
    p.fee_rate,
    p.excluded_category_ids,
    p.user_id,
  ];
}

async function updateRowValues(
  client: pg.PoolClient,
  tenantId: string,
  rowId: string,
  p: ReturnType<typeof pickBody>,
  expectedVersion: number | undefined
): Promise<{ row: PmCycleAllocationRow | null; conflict: boolean }> {
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'pm_cycle_allocations',
      entityId: rowId,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: null, conflict: true };
  }

  const result = await new PmCycleAllocationRepository(tenantId).updateActive(
    client,
    rowId,
    allocationFieldValues(p),
    expectedVersion
  );
  if (expectedVersion !== undefined && result.conflict) {
    const ex = await new PmCycleAllocationRepository(tenantId).getById(client, rowId);
    if (!ex) return { row: null, conflict: false };
  }
  return result;
}

/** Create or update (by id, or by tenant+project+cycle). */
export async function upsertPmCycleAllocation(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  authUserId?: string | null
): Promise<PmCycleAllocationRow> {
  const p = pickBody(body, authUserId);
  if (!p.project_id) throw new Error('projectId is required.');
  if (!p.cycle_id) throw new Error('cycleId is required.');
  if (!p.cycle_label) throw new Error('cycleLabel is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `pmca_${randomUUID().replace(/-/g, '')}`;

  const repo = new PmCycleAllocationRepository(tenantId);
  const byId = await repo.getByIdIncludingDeleted(client, id);
  if (byId && !byId.deleted_at) {
    const { row, conflict } = await updateRowValues(client, tenantId, id, p, p.version);
    if (conflict) throw new Error('Record was modified by another user');
    if (row) {
      await auditPmCycleAllocation(client, tenantId, 'update', row, authUserId, byId);
      return row;
    }
  }
  if (byId?.deleted_at) {
    if (p.version !== undefined && byId.version !== p.version) {
      throw new Error('Record was modified by another user');
    }
    const restored = await repo.updateRestore(client, id, allocationFieldValues(p));
    if (restored) {
      await auditPmCycleAllocation(client, tenantId, 'update', restored, authUserId, byId);
      return restored;
    }
  }

  const triple = await repo.getByProjectAndCycle(client, p.project_id, p.cycle_id);
  if (triple) {
    const existingId = triple.id;
    const { row, conflict } = await updateRowValues(client, tenantId, existingId, p, p.version);
    if (conflict) throw new Error('Record was modified by another user');
    if (row) {
      await auditPmCycleAllocation(client, tenantId, 'update', row, authUserId, triple);
      return row;
    }
  }

  const inserted = await repo.insertAllocation(client, id, allocationFieldValues(p));
  await auditPmCycleAllocation(client, tenantId, 'create', inserted, authUserId);
  return inserted;
}

export async function softDeletePmCycleAllocation(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number,
  userId?: string | null
): Promise<{ ok: boolean; conflict: boolean }> {
  const repo = new PmCycleAllocationRepository(tenantId);
  const prior = await repo.getById(client, id);

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'pm_cycle_allocations',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const ok = await repo.markDeleted(client, id, expectedVersion);
    if (!ok) {
      const meta = await repo.getByIdIncludingDeleted(client, id);
      if (!meta) return { ok: false, conflict: false };
      if (meta.deleted_at) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    await auditPmCycleAllocation(client, tenantId, 'delete', null, userId, prior, id);
    return { ok: true, conflict: false };
  }
  const ok = await repo.markDeleted(client, id);
  if (ok) {
    await auditPmCycleAllocation(client, tenantId, 'delete', null, userId, prior, id);
  }
  return { ok, conflict: false };
}
