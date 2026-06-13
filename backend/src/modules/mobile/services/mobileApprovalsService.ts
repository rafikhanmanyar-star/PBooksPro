import type pg from 'pg';
import { roleHasPermission } from '../../../auth/permissions.js';
import {
  approveProjectExpenseVoucher,
  listProjectExpenseVouchers,
  rejectProjectExpenseVoucher,
  rowToPeVApi,
} from '../../../services/projectExpenseVoucherService.js';
import {
  getInstallmentPlanById,
  listInstallmentPlans,
  rowToInstallmentPlanApi,
  upsertInstallmentPlan,
} from '../../../services/installmentPlansService.js';
import {
  type MobileApprovalItem,
  isPendingInstallmentPlan,
  marketingPlanVisibleToMobileUser,
  sortApprovalsByDate,
} from '../mobileApprovalsHelpers.js';

async function userNameMap(
  client: pg.PoolClient,
  tenantId: string,
  userIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const r = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM users WHERE tenant_id = $1 AND id = ANY($2::text[])`,
    [tenantId, unique]
  );
  return new Map(r.rows.map((row) => [row.id, row.name]));
}

export async function listMobileApprovals(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  role: string | undefined
): Promise<MobileApprovalItem[]> {
  const canApprovePeV = roleHasPermission(role, 'pev.approve');
  const canApprovePlans = roleHasPermission(role, 'financial.write');

  const [pevRows, planRows, contractorRows] = await Promise.all([
    listProjectExpenseVouchers(client, tenantId, { status: 'submitted' }),
    listInstallmentPlans(client, tenantId),
    client
      .query<{
        id: string;
        bill_number: string | null;
        amount: string;
        bill_date: Date;
        status: string;
        contractor_contact_id: string;
        created_at: Date;
      }>(
        `SELECT id, bill_number, amount::text, bill_date, status, contractor_contact_id, created_at
         FROM contractor_bills
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'draft'
         ORDER BY created_at DESC
         LIMIT 50`,
        [tenantId]
      )
      .then((r) => r.rows),
  ]);

  const items: MobileApprovalItem[] = [];

  const allSubmitterIds = pevRows.map((r) => r.submitted_by).filter(Boolean) as string[];
  const submitterNames = await userNameMap(client, tenantId, allSubmitterIds);

  for (const row of pevRows) {
    items.push({
      id: row.id,
      type: 'pev',
      title: `Expense voucher ${row.voucher_number}`,
      subtitle: row.description ?? undefined,
      amount: Number(row.amount),
      currency: 'PKR',
      status: row.status,
      requestedAt:
        row.submitted_at instanceof Date
          ? row.submitted_at.toISOString()
          : row.submitted_at ?? undefined,
      requestedById: row.submitted_by ?? undefined,
      requestedByName: row.submitted_by ? submitterNames.get(row.submitted_by) : undefined,
      canApprove: canApprovePeV,
    });
  }

  const allUserIds = planRows
    .flatMap((p) => [p.approval_requested_by, p.user_id, p.approval_reviewed_by])
    .filter(Boolean) as string[];
  const planNames = await userNameMap(client, tenantId, allUserIds);

  for (const row of planRows) {
    if (!marketingPlanVisibleToMobileUser(row, userId, canApprovePlans)) continue;

    const pending = isPendingInstallmentPlan(row.status, row.approval_requested_to, userId);
    const planLabel = row.description?.trim() || `Unit ${row.unit_id}`;
    const reviewedAt =
      row.approval_reviewed_at instanceof Date
        ? row.approval_reviewed_at.toISOString()
        : row.approval_reviewed_at ?? undefined;

    items.push({
      id: row.id,
      type: 'installment_plan',
      title: 'Marketing plan approval',
      subtitle: planLabel,
      amount: Number(row.net_value),
      currency: 'PKR',
      status: row.status,
      requestedAt:
        row.approval_requested_at instanceof Date
          ? row.approval_requested_at.toISOString()
          : row.approval_requested_at ?? undefined,
      requestedById: row.approval_requested_by ?? row.user_id ?? undefined,
      requestedByName: planNames.get(row.approval_requested_by ?? row.user_id ?? '') ?? undefined,
      reviewedAt,
      reviewedByName: row.approval_reviewed_by
        ? planNames.get(row.approval_reviewed_by)
        : undefined,
      canApprove: pending && canApprovePlans,
    });
  }

  for (const row of contractorRows) {
    items.push({
      id: row.id,
      type: 'contractor_bill',
      title: `Contractor bill ${row.bill_number ?? row.id}`,
      amount: Number(row.amount),
      currency: 'PKR',
      status: row.status,
      requestedAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      canApprove: false,
      requiresFullErp: true,
    });
  }

  return sortApprovalsByDate(items);
}

export async function approveMobileApproval(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  role: string | undefined,
  type: string,
  id: string
): Promise<Record<string, unknown>> {
  if (type === 'pev') {
    if (!roleHasPermission(role, 'pev.approve')) {
      throw new Error('Missing permission: pev.approve');
    }
    const row = await approveProjectExpenseVoucher(client, tenantId, id, userId);
    return rowToPeVApi(row);
  }
  if (type === 'installment_plan') {
    if (!roleHasPermission(role, 'financial.write')) {
      throw new Error('Insufficient permissions to approve installment plans');
    }
    const existing = await getInstallmentPlanById(client, tenantId, id);
    if (!existing) throw new Error('Installment plan not found');
    if (!isPendingInstallmentPlan(existing.status, existing.approval_requested_to, userId)) {
      throw new Error('Plan is not pending your approval');
    }
    const result = await upsertInstallmentPlan(
      client,
      tenantId,
      {
        ...rowToInstallmentPlanApi(existing),
        status: 'Approved',
        approvalReviewedById: userId,
        approvalReviewedAt: new Date().toISOString(),
      },
      userId
    );
    return rowToInstallmentPlanApi(result.row);
  }
  throw new Error('Unsupported approval type or approval requires full ERP');
}

export async function rejectMobileApproval(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  role: string | undefined,
  type: string,
  id: string,
  reason?: string
): Promise<Record<string, unknown>> {
  if (type === 'pev') {
    if (!roleHasPermission(role, 'pev.approve')) {
      throw new Error('Missing permission: pev.approve');
    }
    const row = await rejectProjectExpenseVoucher(client, tenantId, id, userId, reason);
    return rowToPeVApi(row);
  }
  if (type === 'installment_plan') {
    if (!roleHasPermission(role, 'financial.write')) {
      throw new Error('Insufficient permissions to reject installment plans');
    }
    const existing = await getInstallmentPlanById(client, tenantId, id);
    if (!existing) throw new Error('Installment plan not found');
    if (!isPendingInstallmentPlan(existing.status, existing.approval_requested_to, userId)) {
      throw new Error('Plan is not pending your approval');
    }
    const result = await upsertInstallmentPlan(
      client,
      tenantId,
      {
        ...rowToInstallmentPlanApi(existing),
        status: 'Rejected',
        approvalReviewedById: userId,
        approvalReviewedAt: new Date().toISOString(),
      },
      userId
    );
    return rowToInstallmentPlanApi(result.row);
  }
  throw new Error('Unsupported approval type');
}

export type MobileInstallmentPlanDetail = Record<string, unknown> & {
  id: string;
  status: string;
  projectName?: string;
  unitLabel?: string;
  leadName?: string;
  requestedByName?: string;
  reviewedByName?: string;
  canApprove: boolean;
};

export async function getMobileInstallmentPlanDetail(
  client: pg.PoolClient,
  tenantId: string,
  userId: string,
  role: string | undefined,
  planId: string
): Promise<MobileInstallmentPlanDetail | null> {
  const canReviewPlans = roleHasPermission(role, 'financial.write');
  const row = await getInstallmentPlanById(client, tenantId, planId);
  if (!row) return null;
  if (!marketingPlanVisibleToMobileUser(row, userId, canReviewPlans)) return null;

  const [projectR, unitR, leadR] = await Promise.all([
    client.query<{ name: string }>(
      `SELECT name FROM projects WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [tenantId, row.project_id]
    ),
    client.query<{ unit_number: string | null; name: string | null }>(
      `SELECT unit_number, name FROM units WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [tenantId, row.unit_id]
    ),
    row.lead_id
      ? client.query<{ name: string }>(
          `SELECT name FROM contacts WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [tenantId, row.lead_id]
        )
      : Promise.resolve({ rows: [] as { name: string }[] }),
  ]);

  const userIds = [row.approval_requested_by, row.approval_reviewed_by, row.user_id].filter(
    Boolean
  ) as string[];
  const names = await userNameMap(client, tenantId, userIds);

  const unit = unitR.rows[0];
  const unitLabel = unit?.name?.trim() || unit?.unit_number?.trim() || row.unit_id;

  const pending = isPendingInstallmentPlan(row.status, row.approval_requested_to, userId);
  const api = rowToInstallmentPlanApi(row);

  return {
    ...api,
    id: row.id,
    status: row.status,
    projectName: projectR.rows[0]?.name,
    unitLabel,
    leadName: leadR.rows[0]?.name,
    requestedByName: names.get(row.approval_requested_by ?? row.user_id ?? '') ?? undefined,
    reviewedByName: row.approval_reviewed_by
      ? names.get(row.approval_reviewed_by)
      : undefined,
    canApprove: pending && canReviewPlans,
  };
}
