import type pg from 'pg';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDdOptional } from '../utils/dateOnly.js';
import { randomUUID } from 'crypto';

export type ContractRow = {
  id: string;
  tenant_id: string;
  contract_number: string;
  name: string;
  project_id: string;
  vendor_id: string;
  total_amount: string;
  area: string | null;
  rate: string | null;
  start_date: Date | null;
  end_date: Date | null;
  status: string;
  category_ids: string | null;
  expense_category_items: string | null;
  terms_and_conditions: string | null;
  payment_terms: string | null;
  description: string | null;
  document_path: string | null;
  document_id: string | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function optDate(v: unknown): string | null {
  return parseApiDateToYyyyMmDdOptional(v);
}

function parseJsonArray(v: unknown): string {
  if (v == null) return '[]';
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      return JSON.stringify(Array.isArray(p) ? p : []);
    } catch {
      return '[]';
    }
  }
  return '[]';
}

function parseExpenseItems(v: unknown): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'string' && v.trim()) return v;
  return null;
}

export function rowToContractApi(row: ContractRow): Record<string, unknown> {
  const sd =
    row.start_date instanceof Date
      ? row.start_date
      : row.start_date
        ? new Date(row.start_date as unknown as string)
        : null;
  const ed =
    row.end_date instanceof Date
      ? row.end_date
      : row.end_date
        ? new Date(row.end_date as unknown as string)
        : null;
  const base: Record<string, unknown> = {
    id: row.id,
    contractNumber: row.contract_number,
    name: row.name,
    projectId: row.project_id,
    vendorId: row.vendor_id,
    totalAmount: Number(row.total_amount) || 0,
    area: row.area != null && row.area !== '' ? Number(row.area) : undefined,
    rate: row.rate != null && row.rate !== '' ? Number(row.rate) : undefined,
    startDate: sd ? formatPgDateToYyyyMmDd(sd) : undefined,
    endDate: ed ? formatPgDateToYyyyMmDd(ed) : undefined,
    status: row.status,
    categoryIds: (() => {
      if (!row.category_ids) return [];
      try {
        const p = JSON.parse(row.category_ids);
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    })(),
    expenseCategoryItems: (() => {
      if (!row.expense_category_items) return undefined;
      try {
        return JSON.parse(row.expense_category_items);
      } catch {
        return undefined;
      }
    })(),
    termsAndConditions: row.terms_and_conditions ?? undefined,
    paymentTerms: row.payment_terms ?? undefined,
    description: row.description ?? undefined,
    documentPath: row.document_path ?? undefined,
    documentId: row.document_id ?? undefined,
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
  const totalRaw = body.totalAmount ?? body.total_amount;
  const total = Number(totalRaw);
  return {
    contract_number: String(body.contractNumber ?? body.contract_number ?? '').trim(),
    name: String(body.name ?? '').trim(),
    project_id: String(body.projectId ?? body.project_id ?? '').trim(),
    vendor_id: String(body.vendorId ?? body.vendor_id ?? '').trim(),
    total_amount: Number.isFinite(total) ? total : 0,
    area:
      body.area === undefined || body.area === null || body.area === ''
        ? undefined
        : Number(body.area),
    rate:
      body.rate === undefined || body.rate === null || body.rate === ''
        ? undefined
        : Number(body.rate),
    start_date: optDate(body.startDate ?? body.start_date),
    end_date: optDate(body.endDate ?? body.end_date),
    status: String(body.status ?? 'Active').trim() || 'Active',
    category_ids: parseJsonArray(body.categoryIds ?? body.category_ids),
    expense_category_items: parseExpenseItems(body.expenseCategoryItems ?? body.expense_category_items),
    terms_and_conditions:
      body.termsAndConditions === undefined && body.terms_and_conditions === undefined
        ? undefined
        : body.termsAndConditions === null || body.terms_and_conditions === null
          ? null
          : String(body.termsAndConditions ?? body.terms_and_conditions),
    payment_terms:
      body.paymentTerms === undefined && body.payment_terms === undefined
        ? undefined
        : body.paymentTerms === null || body.payment_terms === null
          ? null
          : String(body.paymentTerms ?? body.payment_terms),
    description:
      body.description === undefined ? undefined : body.description === null ? null : String(body.description),
    document_path:
      body.documentPath === undefined && body.document_path === undefined
        ? undefined
        : body.documentPath === null || body.document_path === null
          ? null
          : String(body.documentPath ?? body.document_path),
    document_id:
      body.documentId === undefined && body.document_id === undefined
        ? undefined
        : body.documentId === null || body.document_id === null
          ? null
          : String(body.documentId ?? body.document_id),
    user_id: (body.userId ?? body.user_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

export async function listContracts(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { status?: string; projectId?: string; vendorId?: string }
): Promise<ContractRow[]> {
  const params: unknown[] = [tenantId];
  let q = `SELECT id, tenant_id, contract_number, name, project_id, vendor_id, total_amount, area, rate,
                  start_date, end_date, status, category_ids, expense_category_items,
                  terms_and_conditions, payment_terms, description, document_path, document_id,
                  user_id, version, deleted_at, created_at, updated_at
           FROM contracts WHERE tenant_id = $1 AND deleted_at IS NULL`;
  if (filters?.status) {
    params.push(filters.status);
    q += ` AND status = $${params.length}`;
  }
  if (filters?.projectId) {
    params.push(filters.projectId);
    q += ` AND project_id = $${params.length}`;
  }
  if (filters?.vendorId) {
    params.push(filters.vendorId);
    q += ` AND vendor_id = $${params.length}`;
  }
  q += ' ORDER BY start_date DESC NULLS LAST, contract_number ASC';
  const r = await client.query<ContractRow>(q, params);
  return r.rows;
}

export async function listContractsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<ContractRow[]> {
  const r = await client.query<ContractRow>(
    `SELECT id, tenant_id, contract_number, name, project_id, vendor_id, total_amount, area, rate,
            start_date, end_date, status, category_ids, expense_category_items,
            terms_and_conditions, payment_terms, description, document_path, document_id,
            user_id, version, deleted_at, created_at, updated_at
     FROM contracts WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}

export async function getContractById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ContractRow | null> {
  const r = await client.query<ContractRow>(
    `SELECT id, tenant_id, contract_number, name, project_id, vendor_id, total_amount, area, rate,
            start_date, end_date, status, category_ids, expense_category_items,
            terms_and_conditions, payment_terms, description, document_path, document_id,
            user_id, version, deleted_at, created_at, updated_at
     FROM contracts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function getContractByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<ContractRow | null> {
  const r = await client.query<ContractRow>(
    `SELECT id, tenant_id, contract_number, name, project_id, vendor_id, total_amount, area, rate,
            start_date, end_date, status, category_ids, expense_category_items,
            terms_and_conditions, payment_terms, description, document_path, document_id,
            user_id, version, deleted_at, created_at, updated_at
     FROM contracts WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

export async function upsertContract(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<{ row: ContractRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.contract_number) throw new Error('contractNumber is required.');
  if (!p.name) throw new Error('name is required.');
  if (!p.project_id) throw new Error('projectId is required.');
  if (!p.vendor_id) throw new Error('vendorId is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `cnt_${randomUUID().replace(/-/g, '')}`;

  const existing = await getContractByIdIncludingDeleted(client, tenantId, id);
  if (!existing) {
    const row = await insertContract(client, tenantId, { ...body, id }, actorUserId);
    return { row, conflict: false, wasInsert: true };
  }

  const expectedVersion = p.version;
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    return { row: existing, conflict: true, wasInsert: false };
  }

  const vals = [
    p.contract_number,
    p.name,
    p.project_id,
    p.vendor_id,
    p.total_amount,
    p.area != null && Number.isFinite(p.area) ? p.area : null,
    p.rate != null && Number.isFinite(p.rate) ? p.rate : null,
    p.start_date,
    p.end_date,
    p.status,
    p.category_ids,
    p.expense_category_items,
    p.terms_and_conditions ?? null,
    p.payment_terms ?? null,
    p.description ?? null,
    p.document_path ?? null,
    p.document_id ?? null,
  ];

  const u = await client.query<ContractRow>(
    `UPDATE contracts SET
       contract_number = $3, name = $4, project_id = $5, vendor_id = $6,
       total_amount = $7, area = $8, rate = $9,
       start_date = $10::date, end_date = $11::date, status = $12,
       category_ids = $13, expense_category_items = $14,
       terms_and_conditions = $15, payment_terms = $16, description = $17,
       document_path = $18, document_id = $19,
       deleted_at = NULL, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, tenant_id, contract_number, name, project_id, vendor_id, total_amount, area, rate,
               start_date, end_date, status, category_ids, expense_category_items,
               terms_and_conditions, payment_terms, description, document_path, document_id,
               user_id, version, deleted_at, created_at, updated_at`,
    [id, tenantId, ...vals]
  );
  const row = u.rows[0];
  if (!row) throw new Error('Upsert failed.');
  return { row, conflict: false, wasInsert: false };
}

async function insertContract(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  actorUserId: string | null
): Promise<ContractRow> {
  const p = pickBody(body);
  if (!p.contract_number) throw new Error('contractNumber is required.');
  if (!p.name) throw new Error('name is required.');
  if (!p.project_id) throw new Error('projectId is required.');
  if (!p.vendor_id) throw new Error('vendorId is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `cnt_${randomUUID().replace(/-/g, '')}`;

  const uid =
    p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : actorUserId && String(actorUserId).trim()
      ? String(actorUserId).trim()
      : null;

  const r = await client.query<ContractRow>(
    `INSERT INTO contracts (
       id, tenant_id, contract_number, name, project_id, vendor_id, total_amount, area, rate,
       start_date, end_date, status, category_ids, expense_category_items,
       terms_and_conditions, payment_terms, description, document_path, document_id,
       user_id, version, deleted_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11::date, $12, $13, $14, $15, $16, $17, $18, $19,
       $20, 1, NULL, NOW(), NOW()
     )
     RETURNING id, tenant_id, contract_number, name, project_id, vendor_id, total_amount, area, rate,
               start_date, end_date, status, category_ids, expense_category_items,
               terms_and_conditions, payment_terms, description, document_path, document_id,
               user_id, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.contract_number,
      p.name,
      p.project_id,
      p.vendor_id,
      p.total_amount,
      p.area != null && Number.isFinite(p.area) ? p.area : null,
      p.rate != null && Number.isFinite(p.rate) ? p.rate : null,
      p.start_date,
      p.end_date,
      p.status,
      p.category_ids,
      p.expense_category_items,
      p.terms_and_conditions ?? null,
      p.payment_terms ?? null,
      p.description ?? null,
      p.document_path ?? null,
      p.document_id ?? null,
      uid,
    ]
  );
  return r.rows[0];
}

export async function softDeleteContract(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number
): Promise<{ ok: boolean; conflict: boolean }> {
  if (expectedVersion !== undefined) {
    const r = await client.query(
      `UPDATE contracts SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      const exists = await getContractById(client, tenantId, id);
      if (!exists) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    return { ok: true, conflict: false };
  }
  const r = await client.query(
    `UPDATE contracts SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  return { ok: (r.rowCount ?? 0) > 0, conflict: false };
}
