import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd, parseApiDateToYyyyMmDdOptional } from '../utils/dateOnly.js';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import {
  SalesReturnRepository,
  type SalesReturnWriteFields,
} from '../modules/project-selling/repositories/SalesReturnRepository.js';

export type SalesReturnRow = {
  id: string;
  tenant_id: string;
  return_number: string;
  agreement_id: string;
  return_date: Date;
  reason: string;
  reason_notes: string | null;
  penalty_percentage: string;
  penalty_amount: string;
  refund_amount: string;
  status: string;
  processed_date: Date | null;
  refunded_date: Date | null;
  refund_bill_id: string | null;
  created_by: string | null;
  notes: string | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function toDateStr(d: Date | string | null | undefined): string | undefined {
  if (d == null) return undefined;
  const s = formatPgDateToYyyyMmDd(d);
  return s || undefined;
}

export function rowToSalesReturnApi(row: SalesReturnRow): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    returnNumber: row.return_number,
    agreementId: row.agreement_id,
    returnDate: toDateStr(row.return_date) ?? '',
    reason: row.reason,
    reasonNotes: row.reason_notes ?? undefined,
    penaltyPercentage: parseFloat(row.penalty_percentage || '0'),
    penaltyAmount: parseFloat(row.penalty_amount || '0'),
    refundAmount: parseFloat(row.refund_amount || '0'),
    status: row.status,
    processedDate: toDateStr(row.processed_date),
    refundedDate: toDateStr(row.refunded_date),
    refundBillId: row.refund_bill_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    notes: row.notes ?? undefined,
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

function pickBody(body: Record<string, unknown>) {
  const returnDateRaw = body.returnDate ?? body.return_date;
  if (returnDateRaw == null || returnDateRaw === '') throw new Error('returnDate is required.');
  let returnDateStr: string;
  try {
    returnDateStr = parseApiDateToYyyyMmDd(returnDateRaw);
  } catch {
    throw new Error('Invalid returnDate.');
  }

  const procRaw = body.processedDate ?? body.processed_date;
  const refRaw = body.refundedDate ?? body.refunded_date;

  return {
    return_number: String(body.returnNumber ?? body.return_number ?? '').trim(),
    agreement_id: String(body.agreementId ?? body.agreement_id ?? '').trim(),
    return_date: returnDateStr,
    reason: String(body.reason ?? '').trim(),
    reason_notes:
      body.reasonNotes === undefined && body.reason_notes === undefined
        ? undefined
        : body.reasonNotes === null || body.reason_notes === null
          ? null
          : String(body.reasonNotes ?? body.reason_notes),
    penalty_percentage: Number(body.penaltyPercentage ?? body.penalty_percentage ?? 0),
    penalty_amount: Number(body.penaltyAmount ?? body.penalty_amount ?? 0),
    refund_amount: Number(body.refundAmount ?? body.refund_amount ?? 0),
    status: String(body.status ?? 'Pending').trim(),
    processed_date:
      procRaw === undefined && body.processed_date === undefined
        ? undefined
        : procRaw === null || body.processed_date === null
          ? null
          : parseApiDateToYyyyMmDdOptional(procRaw ?? body.processed_date),
    refunded_date:
      refRaw === undefined && body.refunded_date === undefined
        ? undefined
        : refRaw === null || body.refunded_date === null
          ? null
          : parseApiDateToYyyyMmDdOptional(refRaw ?? body.refunded_date),
    refund_bill_id:
      body.refundBillId === undefined && body.refund_bill_id === undefined
        ? undefined
        : body.refundBillId === null || body.refund_bill_id === null
          ? null
          : String(body.refundBillId ?? body.refund_bill_id).trim() || null,
    created_by:
      body.createdBy === undefined && body.created_by === undefined
        ? undefined
        : body.createdBy === null || body.created_by === null
          ? null
          : String(body.createdBy ?? body.created_by).trim() || null,
    notes:
      body.notes === undefined ? undefined : body.notes === null ? null : String(body.notes),
    user_id: (body.userId ?? body.user_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

function salesReturnWriteFields(p: ReturnType<typeof pickBody>): SalesReturnWriteFields {
  return {
    return_number: p.return_number,
    agreement_id: p.agreement_id,
    return_date: p.return_date,
    reason: p.reason,
    reason_notes: p.reason_notes ?? null,
    penalty_percentage: p.penalty_percentage,
    penalty_amount: p.penalty_amount,
    refund_amount: p.refund_amount,
    status: p.status,
    processed_date: p.processed_date ?? null,
    refunded_date: p.refunded_date ?? null,
    refund_bill_id: p.refund_bill_id ?? null,
    created_by: p.created_by ?? null,
    notes: p.notes ?? null,
  };
}

export async function listSalesReturns(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { status?: string; agreementId?: string }
): Promise<SalesReturnRow[]> {
  return new SalesReturnRepository(tenantId).listActive(client, filters);
}

export async function listSalesReturnsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<SalesReturnRow[]> {
  return new SalesReturnRepository(tenantId).listChangedSince(client, since);
}

export async function getSalesReturnById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<SalesReturnRow | null> {
  return new SalesReturnRepository(tenantId).getById(client, id);
}

async function getSalesReturnByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<SalesReturnRow | null> {
  return new SalesReturnRepository(tenantId).getByIdIncludingDeleted(client, id);
}

export async function upsertSalesReturn(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: SalesReturnRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.return_number) throw new Error('returnNumber is required.');
  if (!p.agreement_id) throw new Error('agreementId is required.');
  if (!p.reason) throw new Error('reason is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `sr_${randomUUID().replace(/-/g, '')}`;

  const existing = await getSalesReturnByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const row = await insertSalesReturn(client, tenantId, { ...body, id }, actorUserId, p);
    return { row, conflict: false, wasInsert: true };
  }

  const expectedVersion = p.version;
  if (expectedVersion !== undefined) {
    if (existing.deleted_at) {
      if (existing.version !== expectedVersion) {
        return { row: existing, conflict: true, wasInsert: false };
      }
    } else {
      const lww = await checkEntityLwwConflict(client, {
        tenantId,
        table: 'sales_returns',
        entityId: id,
        clientVersion: expectedVersion,
      });
      if (lww.conflict) return { row: existing, conflict: true, wasInsert: false };
    }
  }

  const oldApi = rowToSalesReturnApi(existing);

  const row = await new SalesReturnRepository(tenantId).updateUpsert(
    client,
    id,
    salesReturnWriteFields(p)
  );
  if (!row) throw new Error('Upsert failed.');
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'sales_returns',
    entityType: 'sales_return',
    entityId: row.id,
    action: 'update',
    summary: `Sales return ${row.return_number} updated`,
    newValue: rowToSalesReturnApi(row),
    oldValue: oldApi,
    version: row.version,
  });
  return { row, conflict: false, wasInsert: false };
}

async function insertSalesReturn(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null,
  p: ReturnType<typeof pickBody>
): Promise<SalesReturnRow> {
  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `sr_${randomUUID().replace(/-/g, '')}`;

  const row = await new SalesReturnRepository(tenantId).insertSalesReturn(
    client,
    id,
    salesReturnWriteFields(p),
    p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId
  );
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'sales_returns',
    entityType: 'sales_return',
    entityId: row.id,
    action: 'create',
    summary: `Sales return ${row.return_number} created`,
    newValue: rowToSalesReturnApi(row),
    version: row.version,
  });
  return row;
}

export async function softDeleteSalesReturn(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  const ex = await getSalesReturnByIdIncludingDeleted(client, tenantId, id);
  const oldApi = ex ? rowToSalesReturnApi(ex) : undefined;

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'sales_returns',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const ok = await new SalesReturnRepository(tenantId).markDeleted(client, id, expectedVersion);
    if (!ok) {
      const exists = await getSalesReturnById(client, tenantId, id);
      if (!exists) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    await recordDomainMutation(client, {
      tenantId,
      userId: ex?.user_id ?? null,
      module: 'sales_returns',
      entityType: 'sales_return',
      entityId: id,
      action: 'delete',
      summary: `Sales return ${ex?.return_number ?? id} deleted`,
      oldValue: oldApi,
    });
    return { ok: true, conflict: false };
  }
  const ok = await new SalesReturnRepository(tenantId).markDeleted(client, id);
  if (ok) {
    await recordDomainMutation(client, {
      tenantId,
      userId: ex?.user_id ?? null,
      module: 'sales_returns',
      entityType: 'sales_return',
      entityId: id,
      action: 'delete',
      summary: `Sales return ${ex?.return_number ?? id} deleted`,
      oldValue: oldApi,
    });
  }
  return { ok, conflict: false };
}
