import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDdOptional, todayUtcYyyyMmDd } from '../utils/dateOnly.js';
import { enforceLockForSave } from './recordLocksService.js';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../core/entityMutation.js';
import {
  ProjectAgreementRepository,
  type ProjectAgreementWriteFields,
} from '../modules/project-selling/repositories/ProjectAgreementRepository.js';

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
    issueDate: row.issue_date ? formatPgDateToYyyyMmDd(row.issue_date) : undefined,
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
  return new ProjectAgreementRepository(tenantId).listChangedSince(client, since);
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
  return new ProjectAgreementRepository(tenantId).list(client, filters);
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
  const row = await new ProjectAgreementRepository(tenantId).getById(client, id);
  if (!row) return null;
  const unitMap = await loadUnitIdsMap(client, [id]);
  return { row, unitIds: unitMap.get(id) ?? [] };
}

async function replaceAgreementUnits(
  client: pg.PoolClient,
  tenantId: string,
  agreementId: string,
  unitIds: string[]
): Promise<void> {
  await new ProjectAgreementRepository(tenantId).replaceAgreementUnits(client, agreementId, unitIds);
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

function trimOrNull(v: string | null | undefined): string | null {
  return v && String(v).trim() ? String(v).trim() : null;
}

function toProjectAgreementWriteFields(p: ReturnType<typeof pickBody>): ProjectAgreementWriteFields {
  return {
    agreement_number: p.agreement_number,
    client_id: p.client_id,
    project_id: p.project_id,
    unit_ids_json: p.unit_ids_json,
    list_price: p.list_price,
    customer_discount: p.customer_discount,
    floor_discount: p.floor_discount,
    lump_sum_discount: p.lump_sum_discount,
    misc_discount: p.misc_discount,
    selling_price: p.selling_price,
    rebate_amount: p.rebate_amount != null && Number.isFinite(p.rebate_amount) ? p.rebate_amount : null,
    rebate_broker_id: trimOrNull(p.rebate_broker_id),
    issue_date: p.issue_date,
    description: p.description ?? null,
    status: p.status,
    cancellation_details: p.cancellation_details,
    installment_plan: p.installment_plan,
    list_price_category_id: trimOrNull(p.list_price_category_id),
    customer_discount_category_id: trimOrNull(p.customer_discount_category_id),
    floor_discount_category_id: trimOrNull(p.floor_discount_category_id),
    lump_sum_discount_category_id: trimOrNull(p.lump_sum_discount_category_id),
    misc_discount_category_id: trimOrNull(p.misc_discount_category_id),
    selling_price_category_id: trimOrNull(p.selling_price_category_id),
    rebate_category_id: trimOrNull(p.rebate_category_id),
    user_id: trimOrNull(p.user_id),
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

  const repo = new ProjectAgreementRepository(tenantId);
  const row = await repo.insertAgreement(client, id, toProjectAgreementWriteFields(p));
  await replaceAgreementUnits(client, tenantId, id, p.unitIds);
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id ?? actorUserIdFromBody(body),
    module: 'project_agreements',
    entityType: 'project_agreement',
    entityId: row.id,
    action: 'create',
    summary: `Project agreement ${row.agreement_number} created`,
    newValue: rowToProjectAgreementApi(row, p.unitIds),
    version: row.version,
  });
  return { row, unitIds: p.unitIds };
}

function actorUserIdFromBody(body: Record<string, unknown>): string | null {
  const u = body.userId ?? body.user_id;
  return u != null && String(u).trim() ? String(u).trim() : null;
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

  const repo = new ProjectAgreementRepository(tenantId);
  const fields = toProjectAgreementWriteFields(p);

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'project_agreements',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { row: null, conflict: true, unitIds: [] };

    const row = await repo.updateActive(client, id, fields);
    if (!row) {
      return { row: null, conflict: false, unitIds: [] };
    }
    await replaceAgreementUnits(client, tenantId, id, p.unitIds);
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId ?? row.user_id,
      module: 'project_agreements',
      entityType: 'project_agreement',
      entityId: row.id,
      action: 'update',
      summary: `Project agreement ${row.agreement_number} updated`,
      newValue: rowToProjectAgreementApi(row, p.unitIds),
      version: row.version,
    });
    return { row, conflict: false, unitIds: p.unitIds };
  }

  const row = await repo.updateActive(client, id, fields);
  if (row) {
    await replaceAgreementUnits(client, tenantId, id, p.unitIds);
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId ?? row.user_id,
      module: 'project_agreements',
      entityType: 'project_agreement',
      entityId: row.id,
      action: 'update',
      summary: `Project agreement ${row.agreement_number} updated`,
      newValue: rowToProjectAgreementApi(row, p.unitIds),
      version: row.version,
    });
    return { row, conflict: false, unitIds: p.unitIds };
  }
  return { row: null, conflict: false, unitIds: p.unitIds };
}

export async function softDeleteProjectAgreement(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number,
  actorUserId?: string | null
): Promise<{ ok: boolean; conflict: boolean }> {
  await enforceLockForSave(client, tenantId, 'agreement', id, actorUserId);
  const before = await getProjectAgreementById(client, tenantId, id);
  const repo = new ProjectAgreementRepository(tenantId);
  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'project_agreements',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const row = await repo.markDeleted(client, id);
    if (!row) return { ok: false, conflict: false };
    await repo.deleteAgreementUnits(client, id);
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId ?? row.user_id,
      module: 'project_agreements',
      entityType: 'project_agreement',
      entityId: row.id,
      action: 'delete',
      summary: `Project agreement ${row.agreement_number} deleted`,
      oldValue: before ? rowToProjectAgreementApi(before.row, before.unitIds) : null,
      version: row.version,
    });
    return { ok: true, conflict: false };
  }
  const row = await repo.markDeleted(client, id);
  if (row) {
    await repo.deleteAgreementUnits(client, id);
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId ?? row.user_id,
      module: 'project_agreements',
      entityType: 'project_agreement',
      entityId: row.id,
      action: 'delete',
      summary: `Project agreement ${row.agreement_number} deleted`,
      oldValue: before ? rowToProjectAgreementApi(before.row, before.unitIds) : null,
      version: row.version,
    });
  }
  return { ok: row != null, conflict: false };
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
