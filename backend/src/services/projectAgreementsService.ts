import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDdOptional, todayUtcYyyyMmDd } from '../utils/dateOnly.js';
import { enforceLockForSave } from './recordLocksService.js';

export type ProjectAgreementRow = {
  id: string;
  tenant_id: string;
  agreement_number: string;
  client_id: string;
  project_id: string;
  unit_ids: string | null;
  list_price: string | null;
  customer_discount: string | null;
  floor_discount: string | null;
  lump_sum_discount: string | null;
  misc_discount: string | null;
  selling_price: string;
  rebate_amount: string | null;
  rebate_broker_id: string | null;
  issue_date: Date | null;
  description: string | null;
  status: string;
  cancellation_details: unknown;
  installment_plan: unknown;
  list_price_category_id: string | null;
  customer_discount_category_id: string | null;
  floor_discount_category_id: string | null;
  lump_sum_discount_category_id: string | null;
  misc_discount_category_id: string | null;
  selling_price_category_id: string | null;
  rebate_category_id: string | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function numToApi(n: string | null | undefined): number | undefined {
  if (n == null || n === '') return undefined;
  const v = Number(n);
  return Number.isFinite(v) ? v : undefined;
}

function parseJsonField(v: unknown): unknown {
  if (v == null) return undefined;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  return v;
}

export function rowToProjectAgreementApi(
  row: ProjectAgreementRow,
  unitIdsFromJunction?: string[]
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: row.id,
    agreementNumber: row.agreement_number,
    clientId: row.client_id,
    projectId: row.project_id,
    unitIds: (() => {
      if (unitIdsFromJunction && unitIdsFromJunction.length > 0) return unitIdsFromJunction;
      if (!row.unit_ids) return [];
      try {
        const parsed = JSON.parse(row.unit_ids);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
    listPrice: numToApi(row.list_price) ?? 0,
    customerDiscount: numToApi(row.customer_discount) ?? 0,
    floorDiscount: numToApi(row.floor_discount) ?? 0,
    lumpSumDiscount: numToApi(row.lump_sum_discount) ?? 0,
    miscDiscount: numToApi(row.misc_discount) ?? 0,
    sellingPrice: Number(row.selling_price) || 0,
    rebateAmount: numToApi(row.rebate_amount),
    rebateBrokerId: row.rebate_broker_id ?? undefined,
    issueDate:
      row.issue_date instanceof Date
        ? formatPgDateToYyyyMmDd(row.issue_date)
        : row.issue_date
          ? String(row.issue_date).slice(0, 10)
          : undefined,
    description: row.description ?? undefined,
    status: row.status,
    cancellationDetails: parseJsonField(row.cancellation_details) ?? undefined,
    installmentPlan: parseJsonField(row.installment_plan) ?? undefined,
    listPriceCategoryId: row.list_price_category_id ?? undefined,
    customerDiscountCategoryId: row.customer_discount_category_id ?? undefined,
    floorDiscountCategoryId: row.floor_discount_category_id ?? undefined,
    lumpSumDiscountCategoryId: row.lump_sum_discount_category_id ?? undefined,
    miscDiscountCategoryId: row.misc_discount_category_id ?? undefined,
    sellingPriceCategoryId: row.selling_price_category_id ?? undefined,
    rebateCategoryId: row.rebate_category_id ?? undefined,
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

export async function listProjectAgreementsChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<ProjectAgreementRow[]> {
  const r = await client.query<ProjectAgreementRow>(
    `SELECT id, tenant_id, agreement_number, client_id, project_id, unit_ids,
            list_price, customer_discount, floor_discount, lump_sum_discount, misc_discount, selling_price,
            rebate_amount, rebate_broker_id, issue_date, description, status,
            cancellation_details, installment_plan,
            list_price_category_id, customer_discount_category_id, floor_discount_category_id,
            lump_sum_discount_category_id, misc_discount_category_id, selling_price_category_id, rebate_category_id,
            user_id, version, deleted_at, created_at, updated_at
     FROM project_agreements WHERE tenant_id = $1 AND updated_at > $2
     ORDER BY updated_at ASC`,
    [tenantId, since]
  );
  return r.rows;
}

async function loadUnitIdsMap(
  client: pg.PoolClient,
  agreementIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (agreementIds.length === 0) return map;
  const r = await client.query<{ agreement_id: string; unit_id: string }>(
    `SELECT agreement_id, unit_id FROM project_agreement_units WHERE agreement_id = ANY($1::text[])`,
    [agreementIds]
  );
  for (const row of r.rows) {
    const arr = map.get(row.agreement_id) ?? [];
    arr.push(row.unit_id);
    map.set(row.agreement_id, arr);
  }
  return map;
}

export async function listProjectAgreements(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { status?: string; projectId?: string; clientId?: string }
): Promise<ProjectAgreementRow[]> {
  const params: unknown[] = [tenantId];
  let q = `SELECT id, tenant_id, agreement_number, client_id, project_id, unit_ids,
           list_price, customer_discount, floor_discount, lump_sum_discount, misc_discount, selling_price,
           rebate_amount, rebate_broker_id, issue_date, description, status,
           cancellation_details, installment_plan,
           list_price_category_id, customer_discount_category_id, floor_discount_category_id,
           lump_sum_discount_category_id, misc_discount_category_id, selling_price_category_id, rebate_category_id,
           user_id, version, deleted_at, created_at, updated_at
           FROM project_agreements WHERE tenant_id = $1 AND deleted_at IS NULL`;
  if (filters?.status) {
    params.push(filters.status);
    q += ` AND status = $${params.length}`;
  }
  if (filters?.projectId) {
    params.push(filters.projectId);
    q += ` AND project_id = $${params.length}`;
  }
  if (filters?.clientId) {
    params.push(filters.clientId);
    q += ` AND client_id = $${params.length}`;
  }
  q += ' ORDER BY issue_date DESC NULLS LAST, agreement_number ASC';
  const r = await client.query<ProjectAgreementRow>(q, params);
  return r.rows;
}

export async function listProjectAgreementsWithUnits(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { status?: string; projectId?: string; clientId?: string }
): Promise<{ row: ProjectAgreementRow; unitIds: string[] }[]> {
  const rows = await listProjectAgreements(client, tenantId, filters);
  const ids = rows.map((x) => x.id);
  const unitMap = await loadUnitIdsMap(client, ids);
  return rows.map((row) => ({
    row,
    unitIds: unitMap.get(row.id) ?? [],
  }));
}

export async function getProjectAgreementById(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<{ row: ProjectAgreementRow; unitIds: string[] } | null> {
  const r = await client.query<ProjectAgreementRow>(
    `SELECT id, tenant_id, agreement_number, client_id, project_id, unit_ids,
            list_price, customer_discount, floor_discount, lump_sum_discount, misc_discount, selling_price,
            rebate_amount, rebate_broker_id, issue_date, description, status,
            cancellation_details, installment_plan,
            list_price_category_id, customer_discount_category_id, floor_discount_category_id,
            lump_sum_discount_category_id, misc_discount_category_id, selling_price_category_id, rebate_category_id,
            user_id, version, deleted_at, created_at, updated_at
     FROM project_agreements WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const unitMap = await loadUnitIdsMap(client, [id]);
  return { row, unitIds: unitMap.get(id) ?? [] };
}

async function replaceAgreementUnits(
  client: pg.PoolClient,
  agreementId: string,
  unitIds: string[]
): Promise<void> {
  await client.query(`DELETE FROM project_agreement_units WHERE agreement_id = $1`, [agreementId]);
  for (const uid of unitIds) {
    if (!uid || !String(uid).trim()) continue;
    await client.query(
      `INSERT INTO project_agreement_units (agreement_id, unit_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [agreementId, String(uid).trim()]
    );
  }
}

function pickBody(body: Record<string, unknown>) {
  const unitIdsRaw = body.unitIds ?? body.unit_ids;
  let unitIds: string[] = [];
  if (Array.isArray(unitIdsRaw)) {
    unitIds = unitIdsRaw.map((x) => String(x)).filter(Boolean);
  } else if (typeof unitIdsRaw === 'string' && unitIdsRaw.trim()) {
    try {
      const p = JSON.parse(unitIdsRaw);
      unitIds = Array.isArray(p) ? p.map((x: unknown) => String(x)).filter(Boolean) : [];
    } catch {
      unitIds = [];
    }
  }

  const n = (k: string, alt: string, def = 0) => {
    const v = body[k] ?? body[alt as keyof typeof body];
    if (v == null || v === '') return def;
    const x = Number(v);
    return Number.isFinite(x) ? x : def;
  };

  const issueRaw = body.issueDate ?? body.issue_date;
  const issueDate =
    issueRaw != null && String(issueRaw).trim()
      ? parseApiDateToYyyyMmDdOptional(issueRaw) ?? String(issueRaw).slice(0, 10)
      : todayUtcYyyyMmDd();

  const installmentPlan = body.installmentPlan ?? body.installment_plan;
  const cancellationDetails = body.cancellationDetails ?? body.cancellation_details;

  return {
    agreement_number: String(body.agreementNumber ?? body.agreement_number ?? '').trim(),
    client_id: String(body.clientId ?? body.client_id ?? '').trim(),
    project_id: String(body.projectId ?? body.project_id ?? '').trim(),
    unit_ids_json: JSON.stringify(unitIds),
    unitIds,
    list_price: n('listPrice', 'list_price', 0),
    customer_discount: n('customerDiscount', 'customer_discount', 0),
    floor_discount: n('floorDiscount', 'floor_discount', 0),
    lump_sum_discount: n('lumpSumDiscount', 'lump_sum_discount', 0),
    misc_discount: n('miscDiscount', 'misc_discount', 0),
    selling_price: n('sellingPrice', 'selling_price', 0),
    rebate_amount:
      body.rebateAmount != null || body.rebate_amount != null
        ? n('rebateAmount', 'rebate_amount', 0)
        : undefined,
    rebate_broker_id: (body.rebateBrokerId ?? body.rebate_broker_id) as string | null | undefined,
    issue_date: issueDate,
    description:
      body.description === undefined ? undefined : body.description === null ? null : String(body.description),
    status: String(body.status ?? 'Active'),
    installment_plan:
      installmentPlan === undefined || installmentPlan === null
        ? null
        : typeof installmentPlan === 'string'
          ? installmentPlan
          : JSON.stringify(installmentPlan),
    cancellation_details:
      cancellationDetails === undefined || cancellationDetails === null
        ? null
        : typeof cancellationDetails === 'string'
          ? cancellationDetails
          : JSON.stringify(cancellationDetails),
    list_price_category_id: (body.listPriceCategoryId ?? body.list_price_category_id) as string | null | undefined,
    customer_discount_category_id: (body.customerDiscountCategoryId ??
      body.customer_discount_category_id) as string | null | undefined,
    floor_discount_category_id: (body.floorDiscountCategoryId ?? body.floor_discount_category_id) as
      | string
      | null
      | undefined,
    lump_sum_discount_category_id: (body.lumpSumDiscountCategoryId ??
      body.lump_sum_discount_category_id) as string | null | undefined,
    misc_discount_category_id: (body.miscDiscountCategoryId ?? body.misc_discount_category_id) as
      | string
      | null
      | undefined,
    selling_price_category_id: (body.sellingPriceCategoryId ?? body.selling_price_category_id) as
      | string
      | null
      | undefined,
    rebate_category_id: (body.rebateCategoryId ?? body.rebate_category_id) as string | null | undefined,
    user_id: (body.userId ?? body.user_id) as string | null | undefined,
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

/** Owner, project, at least one unit, and final price (selling price) are required for project agreements. */
function assertProjectAgreementCore(p: { unitIds: string[]; selling_price: number }): void {
  if (!p.unitIds || p.unitIds.length === 0) {
    throw new Error('At least one unit is required.');
  }
  if (!Number.isFinite(p.selling_price) || p.selling_price <= 0) {
    throw new Error('Final price (selling price) must be greater than zero.');
  }
}

export async function createProjectAgreement(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>
): Promise<{ row: ProjectAgreementRow; unitIds: string[] }> {
  const p = pickBody(body);
  if (!p.agreement_number) throw new Error('agreementNumber is required.');
  if (!p.client_id) throw new Error('clientId is required.');
  if (!p.project_id) throw new Error('projectId is required.');
  assertProjectAgreementCore({ unitIds: p.unitIds, selling_price: p.selling_price });
  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `pa_${randomUUID().replace(/-/g, '')}`;

  const r = await client.query<ProjectAgreementRow>(
    `INSERT INTO project_agreements (
       id, tenant_id, agreement_number, client_id, project_id, unit_ids,
       list_price, customer_discount, floor_discount, lump_sum_discount, misc_discount, selling_price,
       rebate_amount, rebate_broker_id, issue_date, description, status,
       cancellation_details, installment_plan,
       list_price_category_id, customer_discount_category_id, floor_discount_category_id,
       lump_sum_discount_category_id, misc_discount_category_id, selling_price_category_id, rebate_category_id,
       user_id, version, deleted_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12,
       $13, $14, $15::date, $16, $17,
       $18::jsonb, $19::jsonb,
       $20, $21, $22, $23, $24, $25, $26,
       $27, 1, NULL, NOW(), NOW()
     )
     RETURNING id, tenant_id, agreement_number, client_id, project_id, unit_ids,
               list_price, customer_discount, floor_discount, lump_sum_discount, misc_discount, selling_price,
               rebate_amount, rebate_broker_id, issue_date, description, status,
               cancellation_details, installment_plan,
               list_price_category_id, customer_discount_category_id, floor_discount_category_id,
               lump_sum_discount_category_id, misc_discount_category_id, selling_price_category_id, rebate_category_id,
               user_id, version, deleted_at, created_at, updated_at`,
    [
      id,
      tenantId,
      p.agreement_number,
      p.client_id,
      p.project_id,
      p.unit_ids_json,
      p.list_price,
      p.customer_discount,
      p.floor_discount,
      p.lump_sum_discount,
      p.misc_discount,
      p.selling_price,
      p.rebate_amount != null && Number.isFinite(p.rebate_amount) ? p.rebate_amount : null,
      p.rebate_broker_id && String(p.rebate_broker_id).trim() ? String(p.rebate_broker_id).trim() : null,
      p.issue_date,
      p.description ?? null,
      p.status,
      p.cancellation_details,
      p.installment_plan,
      p.list_price_category_id && String(p.list_price_category_id).trim()
        ? String(p.list_price_category_id).trim()
        : null,
      p.customer_discount_category_id && String(p.customer_discount_category_id).trim()
        ? String(p.customer_discount_category_id).trim()
        : null,
      p.floor_discount_category_id && String(p.floor_discount_category_id).trim()
        ? String(p.floor_discount_category_id).trim()
        : null,
      p.lump_sum_discount_category_id && String(p.lump_sum_discount_category_id).trim()
        ? String(p.lump_sum_discount_category_id).trim()
        : null,
      p.misc_discount_category_id && String(p.misc_discount_category_id).trim()
        ? String(p.misc_discount_category_id).trim()
        : null,
      p.selling_price_category_id && String(p.selling_price_category_id).trim()
        ? String(p.selling_price_category_id).trim()
        : null,
      p.rebate_category_id && String(p.rebate_category_id).trim() ? String(p.rebate_category_id).trim() : null,
      p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : null,
    ]
  );
  await replaceAgreementUnits(client, id, p.unitIds);
  return { row: r.rows[0], unitIds: p.unitIds };
}

export async function updateProjectAgreement(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
  actorUserId?: string | null
): Promise<{ row: ProjectAgreementRow | null; conflict: boolean; unitIds: string[] }> {
  await enforceLockForSave(client, tenantId, 'agreement', id, actorUserId);
  const p = pickBody(body);
  assertProjectAgreementCore({ unitIds: p.unitIds, selling_price: p.selling_price });
  const expectedVersion = p.version;

  const vals = [
    id,
    tenantId,
    p.agreement_number,
    p.client_id,
    p.project_id,
    p.unit_ids_json,
    p.list_price,
    p.customer_discount,
    p.floor_discount,
    p.lump_sum_discount,
    p.misc_discount,
    p.selling_price,
    p.rebate_amount != null && Number.isFinite(p.rebate_amount) ? p.rebate_amount : null,
    p.rebate_broker_id && String(p.rebate_broker_id).trim() ? String(p.rebate_broker_id).trim() : null,
    p.issue_date,
    p.description ?? null,
    p.status,
    p.cancellation_details,
    p.installment_plan,
    p.list_price_category_id && String(p.list_price_category_id).trim()
      ? String(p.list_price_category_id).trim()
      : null,
    p.customer_discount_category_id && String(p.customer_discount_category_id).trim()
      ? String(p.customer_discount_category_id).trim()
      : null,
    p.floor_discount_category_id && String(p.floor_discount_category_id).trim()
      ? String(p.floor_discount_category_id).trim()
      : null,
    p.lump_sum_discount_category_id && String(p.lump_sum_discount_category_id).trim()
      ? String(p.lump_sum_discount_category_id).trim()
      : null,
    p.misc_discount_category_id && String(p.misc_discount_category_id).trim()
      ? String(p.misc_discount_category_id).trim()
      : null,
    p.selling_price_category_id && String(p.selling_price_category_id).trim()
      ? String(p.selling_price_category_id).trim()
      : null,
    p.rebate_category_id && String(p.rebate_category_id).trim() ? String(p.rebate_category_id).trim() : null,
    p.user_id && String(p.user_id).trim() ? String(p.user_id).trim() : null,
  ];

  if (expectedVersion !== undefined) {
    const u = await client.query<ProjectAgreementRow>(
      `UPDATE project_agreements SET
         agreement_number = $3, client_id = $4, project_id = $5, unit_ids = $6,
         list_price = $7, customer_discount = $8, floor_discount = $9, lump_sum_discount = $10, misc_discount = $11,
         selling_price = $12, rebate_amount = $13, rebate_broker_id = $14, issue_date = $15::date, description = $16,
         status = $17, cancellation_details = $18::jsonb, installment_plan = $19::jsonb,
         list_price_category_id = $20, customer_discount_category_id = $21, floor_discount_category_id = $22,
         lump_sum_discount_category_id = $23, misc_discount_category_id = $24, selling_price_category_id = $25, rebate_category_id = $26,
         user_id = $27, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $28
       RETURNING id, tenant_id, agreement_number, client_id, project_id, unit_ids,
                 list_price, customer_discount, floor_discount, lump_sum_discount, misc_discount, selling_price,
                 rebate_amount, rebate_broker_id, issue_date, description, status,
                 cancellation_details, installment_plan,
                 list_price_category_id, customer_discount_category_id, floor_discount_category_id,
                 lump_sum_discount_category_id, misc_discount_category_id, selling_price_category_id, rebate_category_id,
                 user_id, version, deleted_at, created_at, updated_at`,
      [...vals, expectedVersion]
    );
    if (u.rows.length === 0) {
      const exists = await getProjectAgreementById(client, tenantId, id);
      if (!exists) return { row: null, conflict: false, unitIds: [] };
      return { row: null, conflict: true, unitIds: [] };
    }
    await replaceAgreementUnits(client, id, p.unitIds);
    return { row: u.rows[0], conflict: false, unitIds: p.unitIds };
  }

  const u = await client.query<ProjectAgreementRow>(
    `UPDATE project_agreements SET
       agreement_number = $3, client_id = $4, project_id = $5, unit_ids = $6,
       list_price = $7, customer_discount = $8, floor_discount = $9, lump_sum_discount = $10, misc_discount = $11,
       selling_price = $12, rebate_amount = $13, rebate_broker_id = $14, issue_date = $15::date, description = $16,
       status = $17, cancellation_details = $18::jsonb, installment_plan = $19::jsonb,
       list_price_category_id = $20, customer_discount_category_id = $21, floor_discount_category_id = $22,
       lump_sum_discount_category_id = $23, misc_discount_category_id = $24, selling_price_category_id = $25, rebate_category_id = $26,
       user_id = $27, version = version + 1, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, tenant_id, agreement_number, client_id, project_id, unit_ids,
               list_price, customer_discount, floor_discount, lump_sum_discount, misc_discount, selling_price,
               rebate_amount, rebate_broker_id, issue_date, description, status,
               cancellation_details, installment_plan,
               list_price_category_id, customer_discount_category_id, floor_discount_category_id,
               lump_sum_discount_category_id, misc_discount_category_id, selling_price_category_id, rebate_category_id,
               user_id, version, deleted_at, created_at, updated_at`,
    vals
  );
  if (u.rows[0]) await replaceAgreementUnits(client, id, p.unitIds);
  return { row: u.rows[0] ?? null, conflict: false, unitIds: p.unitIds };
}

export async function softDeleteProjectAgreement(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number,
  actorUserId?: string | null
): Promise<{ ok: boolean; conflict: boolean }> {
  await enforceLockForSave(client, tenantId, 'agreement', id, actorUserId);
  if (expectedVersion !== undefined) {
    const r = await client.query(
      `UPDATE project_agreements SET deleted_at = NOW(), updated_at = NOW(), version = version + 1
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $3`,
      [id, tenantId, expectedVersion]
    );
    if (r.rowCount === 0) {
      const ex = await getProjectAgreementById(client, tenantId, id);
      if (!ex) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    await client.query(`DELETE FROM project_agreement_units WHERE agreement_id = $1`, [id]);
    return { ok: true, conflict: false };
  }
  const r = await client.query(
    `UPDATE project_agreements SET deleted_at = NOW(), updated_at = NOW(), version = version + 1
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  if ((r.rowCount ?? 0) > 0) {
    await client.query(`DELETE FROM project_agreement_units WHERE agreement_id = $1`, [id]);
  }
  return { ok: (r.rowCount ?? 0) > 0, conflict: false };
}

/** For incremental sync: attach unit ids from junction + JSON fallback */
export async function enrichRowsWithUnitIds(
  client: pg.PoolClient,
  rows: ProjectAgreementRow[]
): Promise<{ row: ProjectAgreementRow; unitIds: string[] }[]> {
  const ids = rows.map((r) => r.id);
  const unitMap = await loadUnitIdsMap(client, ids);
  return rows.map((row) => ({ row, unitIds: unitMap.get(row.id) ?? [] }));
}
