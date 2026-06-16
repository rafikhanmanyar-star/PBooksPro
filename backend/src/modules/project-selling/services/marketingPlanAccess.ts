import type pg from 'pg';
import {
  roleCanApproveMarketingPlans,
  roleCanViewAllMarketingPlans,
} from '../../../auth/permissions.js';

export { roleCanApproveMarketingPlans, roleCanViewAllMarketingPlans };

export type InstallmentPlanAccessRow = {
  user_id: string | null;
  status: string;
  approval_requested_to: string | null;
  approval_reviewed_by: string | null;
};

export function normalizeMarketingPlanStatus(status: string): string {
  return status.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isPendingMarketingPlanStatus(status: string): boolean {
  return normalizeMarketingPlanStatus(status) === 'pending approval';
}

export function isMarketingPlanApprovalDecisionStatus(status: string): boolean {
  const norm = normalizeMarketingPlanStatus(status);
  return norm === 'approved' || norm === 'rejected';
}

/** Sales users see only plans they created; admins and project managers see all. */
export function canUserAccessInstallmentPlanRow(
  row: InstallmentPlanAccessRow,
  userId: string | null | undefined,
  role: string | undefined | null
): boolean {
  if (roleCanViewAllMarketingPlans(role)) return true;
  if (!userId) return false;
  return row.user_id === userId;
}

export function filterInstallmentPlanRowsForUser<T extends InstallmentPlanAccessRow>(
  rows: T[],
  userId: string | null | undefined,
  role: string | undefined | null
): T[] {
  if (roleCanViewAllMarketingPlans(role)) return rows;
  if (!userId) return [];
  return rows.filter((row) => row.user_id === userId);
}

export async function assertUserIsMarketingPlanApprover(
  client: pg.PoolClient,
  tenantId: string,
  approverUserId: string
): Promise<void> {
  const r = await client.query<{ role: string }>(
    `SELECT ut.role
     FROM user_tenants ut
     INNER JOIN users u ON u.id = ut.user_id
     WHERE ut.tenant_id = $1
       AND ut.user_id = $2
       AND COALESCE(u.is_active, TRUE) = TRUE`,
    [tenantId, approverUserId]
  );
  const role = r.rows[0]?.role;
  if (!role || !roleCanApproveMarketingPlans(role)) {
    throw new Error('Approver must be a company admin or project manager.');
  }
}

export async function listMarketingPlanApprovers(
  client: pg.PoolClient,
  tenantId: string
): Promise<Array<{ id: string; name: string; username: string; role: string }>> {
  const r = await client.query<{ id: string; name: string; username: string; role: string }>(
    `SELECT u.id, u.name, u.username, ut.role
     FROM user_tenants ut
     INNER JOIN users u ON u.id = ut.user_id
     WHERE ut.tenant_id = $1
       AND COALESCE(u.is_active, TRUE) = TRUE
     ORDER BY name ASC, username ASC`,
    [tenantId]
  );
  return r.rows.filter((row) => roleCanApproveMarketingPlans(row.role));
}
