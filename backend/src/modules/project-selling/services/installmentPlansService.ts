import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import { InstallmentPlanRepository, type InstallmentPlanListFilters } from '../repositories/InstallmentPlanRepository.js';
import {
  assertUserIsMarketingPlanApprover,
  canUserAccessInstallmentPlanRow,
  filterInstallmentPlanRowsForUser,
  isMarketingPlanApprovalDecisionStatus,
  isPendingMarketingPlanStatus,
  listMarketingPlanApprovers,
  roleCanApproveMarketingPlans,
  roleCanViewAllMarketingPlans,
} from './marketingPlanAccess.js';

export { listMarketingPlanApprovers } from './marketingPlanAccess.js';

export type InstallmentPlanAccessContext = {
  userId?: string | null;
  role?: string | null;
};

export type InstallmentPlanRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  lead_id: string;
  unit_id: string;
  net_value: string;
  status: string;
  duration_years: number | null;
  down_payment_percentage: string | null;
  frequency: string | null;
  list_price: string | null;
  customer_discount: string | null;
  floor_discount: string | null;
  lump_sum_discount: string | null;
  misc_discount: string | null;
  down_payment_amount: string | null;
  installment_amount: string | null;
  total_installments: number | null;
  description: string | null;
  user_id: string | null;
  intro_text: string | null;
  root_id: string | null;
  approval_requested_by: string | null;
  approval_requested_to: string | null;
  approval_requested_at: Date | null;
  approval_reviewed_by: string | null;
  approval_reviewed_at: Date | null;
  discounts: unknown;
  customer_discount_category_id: string | null;
  floor_discount_category_id: string | null;
  lump_sum_discount_category_id: string | null;
  misc_discount_category_id: string | null;
  selected_amenities: unknown;
  amenities_total: string | null;
  created_at: Date;
  updated_at: Date;
  version: number;
  deleted_at: Date | null;
};

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function optStr(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s || null;
}

function optIso(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function jsonbDiscounts(body: Record<string, unknown>): unknown {
  const raw = body.discounts ?? body.Discounts;
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw)) return raw;
  return null;
}

function jsonbSelectedAmenities(body: Record<string, unknown>): unknown {
  const raw = body.selectedAmenities ?? body.selected_amenities;
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw)) return raw;
  return null;
}

function pickBody(body: Record<string, unknown>) {
  const projectId = String(body.projectId ?? body.project_id ?? '').trim();
  const leadId = String(body.leadId ?? body.lead_id ?? '').trim();
  const unitId = String(body.unitId ?? body.unit_id ?? '').trim();
  return {
    project_id: projectId,
    lead_id: leadId,
    unit_id: unitId,
    net_value: num(body.netValue ?? body.net_value),
    status: String(body.status ?? 'Draft'),
    duration_years:
      body.durationYears != null || body.duration_years != null
        ? Math.round(num(body.durationYears ?? body.duration_years))
        : null,
    down_payment_percentage: num(body.downPaymentPercentage ?? body.down_payment_percentage),
    frequency: optStr(body.frequency) ?? 'Monthly',
    list_price: num(body.listPrice ?? body.list_price),
    customer_discount: num(body.customerDiscount ?? body.customer_discount),
    floor_discount: num(body.floorDiscount ?? body.floor_discount),
    lump_sum_discount: num(body.lumpSumDiscount ?? body.lump_sum_discount),
    misc_discount: num(body.miscDiscount ?? body.misc_discount),
    down_payment_amount: num(body.downPaymentAmount ?? body.down_payment_amount),
    installment_amount: num(body.installmentAmount ?? body.installment_amount),
    total_installments:
      body.totalInstallments != null || body.total_installments != null
        ? Math.round(num(body.totalInstallments ?? body.total_installments))
        : null,
    description: body.description === undefined ? null : optStr(body.description),
    user_id: optStr(body.userId ?? body.user_id),
    intro_text: body.introText !== undefined || body.intro_text !== undefined ? optStr(body.introText ?? body.intro_text) : null,
    root_id: optStr(body.rootId ?? body.root_id),
    approval_requested_by: optStr(body.approvalRequestedById ?? body.approval_requested_by),
    approval_requested_to: optStr(body.approvalRequestedToId ?? body.approval_requested_to),
    approval_requested_at: optIso(body.approvalRequestedAt ?? body.approval_requested_at),
    approval_reviewed_by: optStr(body.approvalReviewedById ?? body.approval_reviewed_by),
    approval_reviewed_at: optIso(body.approvalReviewedAt ?? body.approval_reviewed_at),
    discounts: jsonbDiscounts(body),
    customer_discount_category_id: optStr(body.customerDiscountCategoryId ?? body.customer_discount_category_id),
    floor_discount_category_id: optStr(body.floorDiscountCategoryId ?? body.floor_discount_category_id),
    lump_sum_discount_category_id: optStr(body.lumpSumDiscountCategoryId ?? body.lump_sum_discount_category_id),
    misc_discount_category_id: optStr(body.miscDiscountCategoryId ?? body.misc_discount_category_id),
    selected_amenities: jsonbSelectedAmenities(body),
    amenities_total: num(body.amenitiesTotal ?? body.amenities_total),
    version: typeof body.version === 'number' ? body.version : undefined,
  };
}

export function rowToInstallmentPlanApi(row: InstallmentPlanRow): Record<string, unknown> {
  const parseJson = (v: unknown): unknown => {
    if (v == null) return v;
    if (typeof v === 'string') {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }
    return v;
  };

  const discounts = parseJson(row.discounts);
  const selectedAmenities = parseJson(row.selected_amenities);

  const base: Record<string, unknown> = {
    id: row.id,
    projectId: row.project_id,
    leadId: row.lead_id,
    unitId: row.unit_id,
    netValue: Number(row.net_value),
    status: row.status,
    durationYears: row.duration_years ?? 0,
    downPaymentPercentage: Number(row.down_payment_percentage ?? 0),
    frequency: row.frequency ?? 'Monthly',
    listPrice: Number(row.list_price ?? 0),
    customerDiscount: Number(row.customer_discount ?? 0),
    floorDiscount: Number(row.floor_discount ?? 0),
    lumpSumDiscount: Number(row.lump_sum_discount ?? 0),
    miscDiscount: Number(row.misc_discount ?? 0),
    downPaymentAmount: Number(row.down_payment_amount ?? 0),
    installmentAmount: Number(row.installment_amount ?? 0),
    totalInstallments: row.total_installments ?? 0,
    version: row.version,
    amenitiesTotal: Number(row.amenities_total ?? 0),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };

  if (row.description) base.description = row.description;
  if (row.user_id) base.userId = row.user_id;
  if (row.intro_text) base.introText = row.intro_text;
  if (row.root_id) base.rootId = row.root_id;
  if (row.approval_requested_by) base.approvalRequestedById = row.approval_requested_by;
  if (row.approval_requested_to) base.approvalRequestedToId = row.approval_requested_to;
  if (row.approval_requested_at) {
    base.approvalRequestedAt =
      row.approval_requested_at instanceof Date
        ? row.approval_requested_at.toISOString()
        : row.approval_requested_at;
  }
  if (row.approval_reviewed_by) base.approvalReviewedById = row.approval_reviewed_by;
  if (row.approval_reviewed_at) {
    base.approvalReviewedAt =
      row.approval_reviewed_at instanceof Date
        ? row.approval_reviewed_at.toISOString()
        : row.approval_reviewed_at;
  }
  if (Array.isArray(discounts)) base.discounts = discounts;
  else base.discounts = [];
  if (row.customer_discount_category_id) base.customerDiscountCategoryId = row.customer_discount_category_id;
  if (row.floor_discount_category_id) base.floorDiscountCategoryId = row.floor_discount_category_id;
  if (row.lump_sum_discount_category_id) base.lumpSumDiscountCategoryId = row.lump_sum_discount_category_id;
  if (row.misc_discount_category_id) base.miscDiscountCategoryId = row.misc_discount_category_id;
  if (Array.isArray(selectedAmenities)) base.selectedAmenities = selectedAmenities;
  if (row.deleted_at) {
    base.deletedAt = row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at;
  }
  return base;
}

export async function listInstallmentPlans(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { projectId?: string },
  access?: InstallmentPlanAccessContext
): Promise<InstallmentPlanRow[]> {
  const listFilters: InstallmentPlanListFilters = { ...(filters ?? {}) };
  if (access && !roleCanViewAllMarketingPlans(access.role ?? undefined) && access.userId) {
    listFilters.createdByUserId = access.userId;
  }
  return new InstallmentPlanRepository(tenantId).listActive(client, listFilters);
}

export async function getInstallmentPlanById(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  access?: InstallmentPlanAccessContext
): Promise<InstallmentPlanRow | null> {
  const row = await new InstallmentPlanRepository(tenantId).getById(client, id);
  if (!row) return null;
  if (access && !canUserAccessInstallmentPlanRow(row, access.userId, access.role ?? undefined)) {
    return null;
  }
  return row;
}

async function getInstallmentPlanByIdIncludingDeleted(
  client: pg.PoolClient,
  tenantId: string,
  id: string
): Promise<InstallmentPlanRow | null> {
  return new InstallmentPlanRepository(tenantId).getByIdIncludingDeleted(client, id);
}

async function assertMarketingPlanMutationAllowed(
  client: pg.PoolClient,
  tenantId: string,
  existing: InstallmentPlanRow | null,
  picked: ReturnType<typeof pickBody>,
  authUserId?: string | null,
  authRole?: string | null
): Promise<void> {
  if (existing && !canUserAccessInstallmentPlanRow(existing, authUserId, authRole ?? undefined)) {
    throw new Error('You can only edit marketing plans that you created.');
  }

  if (isPendingMarketingPlanStatus(picked.status)) {
    const approverId = picked.approval_requested_to;
    if (!approverId) {
      throw new Error('An approver is required when submitting for approval.');
    }
    await assertUserIsMarketingPlanApprover(client, tenantId, approverId);
    if (
      authUserId &&
      !roleCanViewAllMarketingPlans(authRole ?? undefined) &&
      picked.approval_requested_by &&
      picked.approval_requested_by !== authUserId
    ) {
      throw new Error('You can only submit your own marketing plans for approval.');
    }
  }

  if (isMarketingPlanApprovalDecisionStatus(picked.status)) {
    if (!roleCanApproveMarketingPlans(authRole ?? undefined)) {
      throw new Error('Only company admins and project managers can approve or reject marketing plans.');
    }
  }
}

export async function upsertInstallmentPlan(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  authUserId?: string | null,
  authRole?: string | null
): Promise<{ row: InstallmentPlanRow; conflict: boolean; wasInsert: boolean }> {
  const p = pickBody(body);
  if (!p.project_id) throw new Error('projectId is required.');
  if (!p.lead_id) throw new Error('leadId is required.');
  if (!p.unit_id) throw new Error('unitId is required.');

  const id =
    typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `plan_${randomUUID().replace(/-/g, '')}`;

  const existing = await getInstallmentPlanByIdIncludingDeleted(client, tenantId, id);

  await assertMarketingPlanMutationAllowed(client, tenantId, existing, p, authUserId, authRole);

  const salesScoped = authUserId && !roleCanViewAllMarketingPlans(authRole ?? undefined);
  const userId = salesScoped
    ? String(authUserId)
    : p.user_id ??
      (authUserId != null && String(authUserId).trim() ? String(authUserId).trim() : null);

  if (salesScoped && isPendingMarketingPlanStatus(p.status)) {
    p.approval_requested_by = authUserId ?? p.approval_requested_by;
  }

  if (salesScoped && isMarketingPlanApprovalDecisionStatus(p.status)) {
    p.approval_reviewed_by = authUserId ?? p.approval_reviewed_by;
  }

  const insertValues = [
    id,
    tenantId,
    p.project_id,
    p.lead_id,
    p.unit_id,
    p.net_value,
    p.status,
    p.duration_years,
    p.down_payment_percentage,
    p.frequency,
    p.list_price,
    p.customer_discount,
    p.floor_discount,
    p.lump_sum_discount,
    p.misc_discount,
    p.down_payment_amount,
    p.installment_amount,
    p.total_installments,
    p.description,
    userId,
    p.intro_text,
    p.root_id,
    p.approval_requested_by,
    p.approval_requested_to,
    p.approval_requested_at,
    p.approval_reviewed_by,
    p.approval_reviewed_at,
    p.discounts,
    p.customer_discount_category_id,
    p.floor_discount_category_id,
    p.lump_sum_discount_category_id,
    p.misc_discount_category_id,
    p.selected_amenities,
    p.amenities_total,
  ];

  if (!existing) {
    const planRepo = new InstallmentPlanRepository(tenantId);
    const row = await planRepo.insertPlan(client, id, insertValues.slice(2));
    await recordDomainMutation(client, {
      tenantId,
      userId: row.user_id,
      module: 'installment_plans',
      entityType: 'installment_plan',
      entityId: row.id,
      action: 'create',
      summary: `Installment plan ${row.id} created`,
      newValue: rowToInstallmentPlanApi(row),
      version: row.version,
    });
    return { row, conflict: false, wasInsert: true };
  }

  if (p.version !== undefined) {
    if (existing.deleted_at) {
      if (existing.version !== p.version) {
        return { row: existing, conflict: true, wasInsert: false };
      }
    } else {
      const lww = await checkEntityLwwConflict(client, {
        tenantId,
        table: 'installment_plans',
        entityId: id,
        clientVersion: p.version,
      });
      if (lww.conflict) return { row: existing, conflict: true, wasInsert: false };
    }
  }

  const oldApi = rowToInstallmentPlanApi(existing);

  const fieldValues = insertValues.slice(2);
  const planRepo = new InstallmentPlanRepository(tenantId);

  if (existing.deleted_at) {
    const row = await planRepo.updatePlan(client, id, fieldValues);
    if (row) {
      await recordDomainMutation(client, {
        tenantId,
        userId: row.user_id,
        module: 'installment_plans',
        entityType: 'installment_plan',
        entityId: row.id,
        action: 'update',
        summary: `Installment plan ${row.id} restored`,
        newValue: rowToInstallmentPlanApi(row),
        oldValue: oldApi,
        version: row.version,
      });
      return { row, conflict: false, wasInsert: false };
    }
    return { row: existing, conflict: true, wasInsert: false };
  }

  const row = await planRepo.updatePlan(client, id, fieldValues, { activeOnly: true });
  if (!row) {
    return { row: existing, conflict: true, wasInsert: false };
  }
  await recordDomainMutation(client, {
    tenantId,
    userId: row.user_id,
    module: 'installment_plans',
    entityType: 'installment_plan',
    entityId: row.id,
    action: 'update',
    summary: `Installment plan ${row.id} updated`,
    newValue: rowToInstallmentPlanApi(row),
    oldValue: oldApi,
    version: row.version,
  });
  return { row, conflict: false, wasInsert: false };
}

export async function softDeleteInstallmentPlan(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion?: number,
  access?: InstallmentPlanAccessContext
): Promise<{ ok: boolean; conflict: boolean }> {
  const ex = await getInstallmentPlanByIdIncludingDeleted(client, tenantId, id);
  if (ex && access && !canUserAccessInstallmentPlanRow(ex, access.userId, access.role ?? undefined)) {
    return { ok: false, conflict: false };
  }
  const oldApi = ex ? rowToInstallmentPlanApi(ex) : undefined;

  if (expectedVersion !== undefined) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'installment_plans',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { ok: false, conflict: true };

    const ok = await new InstallmentPlanRepository(tenantId).markDeleted(client, id, expectedVersion);
    if (!ok) {
      const ex = await getInstallmentPlanByIdIncludingDeleted(client, tenantId, id);
      if (!ex || ex.deleted_at) return { ok: false, conflict: false };
      return { ok: false, conflict: true };
    }
    await recordDomainMutation(client, {
      tenantId,
      userId: ex?.user_id ?? null,
      module: 'installment_plans',
      entityType: 'installment_plan',
      entityId: id,
      action: 'delete',
      summary: `Installment plan ${id} deleted`,
      oldValue: oldApi,
    });
    return { ok: true, conflict: false };
  }
  const ok = await new InstallmentPlanRepository(tenantId).markDeleted(client, id);
  if (ok) {
    await recordDomainMutation(client, {
      tenantId,
      userId: ex?.user_id ?? null,
      module: 'installment_plans',
      entityType: 'installment_plan',
      entityId: id,
      action: 'delete',
      summary: `Installment plan ${id} deleted`,
      oldValue: oldApi,
    });
  }
  return { ok, conflict: false };
}

export async function listInstallmentPlansChangedSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date,
  access?: InstallmentPlanAccessContext
): Promise<InstallmentPlanRow[]> {
  const rows = await new InstallmentPlanRepository(tenantId).listChangedSince(client, since);
  return filterInstallmentPlanRowsForUser(rows, access?.userId, access?.role ?? undefined);
}
