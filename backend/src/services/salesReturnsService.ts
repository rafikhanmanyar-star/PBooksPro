import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd, parseApiDateToYyyyMmDdOptional } from '../utils/dateOnly.js';

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
  if (d instanceof Date) return isNaN(d.getTime()) ? undefined : formatPgDateToYyyyMmDd(d);
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const x = new Date(s);
  if (isNaN(x.getTime())) return undefined;
  return formatPgDateToYyyyMmDd(x);
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

export async function listSalesReturns(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { status?: string; agreementId?: string }
): Promise<SalesReturnRow[]> {
  const params: unknown[] = [tenantId];
  let q = `SELECT id, tenant_id, return_number, agreement_id, return_date, reason, reason_notes,
                  penalty_percentage::text, penalty_amount::text, refund_amount::text, status,
                  processed_date, refunded_date, refund_bill_id, created_by, notes, user_id, version,
                  deleted_at, created_at, updated_at
           FROM sales_returns WHERE tenant_id = $1 AND deleted_at IS NULL`;
  if (filters?.status) {
    params.push(filters.status);
    q += ` AND status = $${params.length}`;
  }
  if (filters?.agreementId) {
    params.push(filters.agreementId);
    q += ` AND agreement_id = $${params.length}`;
  }
  q += ' ORDER BY return_date DESC, id ASC';
  const r = await client.query<SalesReturnRow>(q, params);
  return r.rows;
}

export async function listSalesReturnsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<SalesReturnRow[]> {
  const r = await client.query<SalesReturnRow>(
    `SELECT id, tenant_id, return_number, agreement_id, return_date, reason, reason_notes,
            penalty_percentage::text, penalty_amount::text, refund_amount::text, status,
            processed_date, refunded_date, refund_bill_id, created_by, notes, user_id, version,
            deleted_at, created_at, updated_at
     FROM sales_returns WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}

export async function getSalesReturnById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<SalesReturnRow | null> {
  const r = await client.query<SalesReturnRow>(
    `SELECT id, tenant_id, return_number, agreement_id, return_date, reason, reason_notes,
            penalty_percentage::text, penalty_amount::text, refund_amount::text, status,
            processed_date, refunded_date, refund_bill_id, created_by, notes, user_id, version,
            deleted_at, created_at, updated_at
     FROM sales_returns WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

async function getSalesReturnByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<SalesReturnRow | null> {
  const r = await client.query<SalesReturnRow>(
    `SELECT id, tenant_id, return_number, agreement_id, return_date, reason, reason_notes,
            penalty_percentage::text, penalty_amount::text, refund_amount::text, status,
            processed_date, refunded_date, refund_bill_id, created_by, notes, user_id, version,
            deleted_at, created_at, updated_at
     FROM sales_returns WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
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
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    return { row: existing, conflict: true, wasInsert: false };
  }

  const u = await client.query<SalesReturnRow>(
    `UPDATE sales_returns SET
       return_number = $3, agreement_id = $4, return_date = $5::date, reason = $6, reason_notes = $7,
       penalty_percentage = $8, penalty_amount = $9, refund_amount = $10, status = $11,
       processed_date = $12::date, refunded_date = $13::date, refund_bill_id = $14,
       created_by = COALESCE($15, created_by), notes = $16,
       deleted_at = NULL, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, tenant_id, return_number, agreement_id, return_date, reason, reason_notes,
               penalty_percentage::text, penalty_amount::text, refund_amount::text, status,
               processed_date, refunded_date, refund_bill_id, created_by, notes, user_id, version,
               deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.return_number,
      p.agreement_id,
      p.return_date,
      p.reason,
      p.reason_notes ?? null,
      p.penalty_percentage,
      p.penalty_amount,
      p.refund_amount,
      p.status,
      p.processed_date ?? null,
      p.refunded_date ?? null,
      p.refund_bill_id ?? null,
      p.created_by ?? null,
      p.notes ?? null,
    ]
  );
  const row = u.rows[0];
  if (!row) throw new Error('Upsert failed.');
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

  const r = await client.query<SalesReturnRow>(
    `INSERT INTO sales_returns (
       id, tenant_id, return_number, agreement_id, return_date, reason, reason_notes,
       penalty_percentage, penalty_amount, refund_amount, status,
       processed_date, refunded_date, refund_bill_id, created_by, notes, user_id, version, deleted_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12::date, $13::date, $14, $15, $16, $17, 1, NULL, NOW(), NOW()
     )
     RETURNING id, tenant_id, return_number, agreement_id, return_date, reason, reason_notes,
               penalty_percentage::text, penalty_amount::text, refund_amount::text, status,
               processed_date, refunded_date, refund_bill_id, created_by, notes, user_id, version,
               deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.return_number,
      p.agreement_id,
      p.return_date,
      p.reason,
      p.reason_notes ?? null,
      p.penalty_percentage,
      p.penalty_amount,
      p.refund_amount,
      p.status,
      p.processed_date ?? null,
      p.refunded_date ?? null,
      p.refund_bill_id ?? null,
      p.created_by ?? null,
      p.notes ?? null,
      p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId,
    ]
  );
  return r.rows[0];
}

export async function softDeleteSalesReturn(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  if (expectedVersion !== undefined) {
    const r = await client.query(
      `UPDATE sales_returns SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      const exists = await getSalesReturnById(client, tenantId, id);
      if (!exists) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    return { ok: true, conflict: false };
  }
  const r = await client.query(
    `UPDATE sales_returns SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: (r.rowCount ?? 0) > 0, conflict: false };
}
