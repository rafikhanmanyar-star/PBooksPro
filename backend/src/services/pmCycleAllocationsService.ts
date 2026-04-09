import type pg from 'pg';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../utils/dateOnly.js';
import { randomUUID } from 'crypto';

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
  const r = await client.query<PmCycleAllocationRow>(
    `SELECT id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date,
            amount, paid_amount, status, bill_id, description, expense_total, fee_rate, excluded_category_ids,
            user_id, version, deleted_at, created_at, updated_at
     FROM pm_cycle_allocations WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}

export async function listPmCycleAllocations(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { projectId?: string; cycleId?: string; status?: string }
): Promise<PmCycleAllocationRow[]> {
  const params: unknown[] = [tenantId];
  let q = `SELECT id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date,
           amount, paid_amount, status, bill_id, description, expense_total, fee_rate, excluded_category_ids,
           user_id, version, deleted_at, created_at, updated_at
           FROM pm_cycle_allocations WHERE tenant_id = $1 AND deleted_at IS NULL`;
  if (filters?.projectId) {
    params.push(filters.projectId);
    q += ` AND project_id = $${params.length}`;
  }
  if (filters?.cycleId) {
    params.push(filters.cycleId);
    q += ` AND cycle_id = $${params.length}`;
  }
  if (filters?.status) {
    params.push(filters.status);
    q += ` AND status = $${params.length}`;
  }
  q += ' ORDER BY allocation_date DESC, cycle_id ASC';
  const r = await client.query<PmCycleAllocationRow>(q, params);
  return r.rows;
}

export async function getPmCycleAllocationById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<PmCycleAllocationRow | null> {
  const r = await client.query<PmCycleAllocationRow>(
    `SELECT id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date,
            amount, paid_amount, status, bill_id, description, expense_total, fee_rate, excluded_category_ids,
            user_id, version, deleted_at, created_at, updated_at
     FROM pm_cycle_allocations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

async function updateRowValues(
  client: pg.PoolClient,
  tenantId: string,
  rowId: string,
  p: ReturnType<typeof pickBody>,
  expectedVersion: number | undefined
): Promise<{ row: PmCycleAllocationRow | null; conflict: boolean }> {
  if (expectedVersion !== undefined) {
    const u = await client.query<PmCycleAllocationRow>(
      `UPDATE pm_cycle_allocations SET
         project_id = $3, cycle_id = $4, cycle_label = $5, frequency = $6,
         start_date = $7::date, end_date = $8::date, allocation_date = $9::date,
         amount = $10, paid_amount = $11, status = $12, bill_id = $13, description = $14,
         expense_total = $15, fee_rate = $16, excluded_category_ids = $17, user_id = $18,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $19
       RETURNING id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date,
                 amount, paid_amount, status, bill_id, description, expense_total, fee_rate, excluded_category_ids,
                 user_id, version, deleted_at, created_at, updated_at`,
      [
        rowId,
        tenantId,
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
        expectedVersion,
      ]
    );
    if (u.rows.length === 0) {
      const ex = await client.query(`SELECT 1 FROM pm_cycle_allocations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`, [
        rowId,
        tenantId,
      ]);
      if (ex.rows.length === 0) return { row: null, conflict: false };
      return { row: null, conflict: true };
    }
    return { row: u.rows[0], conflict: false };
  }

  const u = await client.query<PmCycleAllocationRow>(
    `UPDATE pm_cycle_allocations SET
       project_id = $3, cycle_id = $4, cycle_label = $5, frequency = $6,
       start_date = $7::date, end_date = $8::date, allocation_date = $9::date,
       amount = $10, paid_amount = $11, status = $12, bill_id = $13, description = $14,
       expense_total = $15, fee_rate = $16, excluded_category_ids = $17, user_id = $18,
       version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date,
               amount, paid_amount, status, bill_id, description, expense_total, fee_rate, excluded_category_ids,
               user_id, version, deleted_at, created_at, updated_at`,
    [
      rowId,
      tenantId,
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
    ]
  );
  return { row: u.rows[0] ?? null, conflict: false };
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

  const byId = await client.query<PmCycleAllocationRow>(
    `SELECT id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date,
            amount, paid_amount, status, bill_id, description, expense_total, fee_rate, excluded_category_ids,
            user_id, version, deleted_at, created_at, updated_at
     FROM pm_cycle_allocations WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (byId.rows[0] && !byId.rows[0].deleted_at) {
    const { row, conflict } = await updateRowValues(client, tenantId, id, p, p.version);
    if (conflict) throw new Error('Record was modified by another user');
    if (row) return row;
  }
  if (byId.rows[0]?.deleted_at) {
    const u = await client.query<PmCycleAllocationRow>(
      `UPDATE pm_cycle_allocations SET
         project_id = $3, cycle_id = $4, cycle_label = $5, frequency = $6,
         start_date = $7::date, end_date = $8::date, allocation_date = $9::date,
         amount = $10, paid_amount = $11, status = $12, bill_id = $13, description = $14,
         expense_total = $15, fee_rate = $16, excluded_category_ids = $17, user_id = $18,
         deleted_at = NULL, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date,
                 amount, paid_amount, status, bill_id, description, expense_total, fee_rate, excluded_category_ids,
                 user_id, version, deleted_at, created_at, updated_at`,
      [
        id,
        tenantId,
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
      ]
    );
    if (u.rows[0]) return u.rows[0];
  }

  const triple = await client.query<PmCycleAllocationRow>(
    `SELECT id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date,
            amount, paid_amount, status, bill_id, description, expense_total, fee_rate, excluded_category_ids,
            user_id, version, deleted_at, created_at, updated_at
     FROM pm_cycle_allocations
     WHERE tenant_id = $1 AND project_id = $2 AND cycle_id = $3 AND deleted_at IS NULL`,
    [tenantId, p.project_id, p.cycle_id]
  );
  if (triple.rows[0]) {
    const existingId = triple.rows[0].id;
    const { row, conflict } = await updateRowValues(client, tenantId, existingId, p, p.version);
    if (conflict) throw new Error('Record was modified by another user');
    if (row) return row;
  }

  const ins = await client.query<PmCycleAllocationRow>(
    `INSERT INTO pm_cycle_allocations (
       id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date,
       amount, paid_amount, status, bill_id, description, expense_total, fee_rate, excluded_category_ids,
       user_id, version, deleted_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7::date, $8::date, $9::date, $10, $11, $12, $13, $14, $15, $16, $17, $18,
       1, NULL, NOW(), NOW()
     )
     RETURNING id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date,
               amount, paid_amount, status, bill_id, description, expense_total, fee_rate, excluded_category_ids,
               user_id, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
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
    ]
  );
  return ins.rows[0];
}

export async function softDeletePmCycleAllocation(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  if (expectedVersion !== undefined) {
    const r = await client.query(
      `UPDATE pm_cycle_allocations SET deleted_at = NOW(), updated_at = NOW(), version = version + 1
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      const meta = await client.query<{ deleted_at: Date | null }>(
        `SELECT deleted_at FROM pm_cycle_allocations WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      const row = meta.rows[0];
      if (!row) return { ok: false, conflict: false };
      if (row.deleted_at) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    return { ok: true, conflict: false };
  }
  const r = await client.query(
    `UPDATE pm_cycle_allocations SET deleted_at = NOW(), updated_at = NOW(), version = version + 1
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: (r.rowCount ?? 0) > 0, conflict: false };
}
