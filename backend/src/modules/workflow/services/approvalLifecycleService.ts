import type pg from 'pg';
import type { ApprovalLifecycleStatus } from '../../../workflow/approvalLifecycle.js';

export type ApprovalEntityTable = 'bills' | 'contracts' | 'transactions';

export type ApprovalAuditRow = {
  approval_status: string;
  submitted_at: Date | null;
  submitted_by: string | null;
  approved_at: Date | null;
  approved_by: string | null;
};

export async function getApprovalAuditRow(
  client: pg.PoolClient,
  tenantId: string,
  table: ApprovalEntityTable,
  entityId: string
): Promise<ApprovalAuditRow | null> {
  const r = await client.query<ApprovalAuditRow>(
    `SELECT approval_status, submitted_at, submitted_by, approved_at, approved_by
     FROM ${table}
     WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [tenantId, entityId]
  );
  return r.rows[0] ?? null;
}

export async function setApprovalLifecycleStatus(
  client: pg.PoolClient,
  tenantId: string,
  table: ApprovalEntityTable,
  entityId: string,
  status: ApprovalLifecycleStatus,
  userId: string | null,
  extra?: { paymentStatus?: string; contractStatus?: string }
): Promise<void> {
  const sets = ['approval_status = $3', 'updated_at = NOW()', 'version = version + 1'];
  const params: unknown[] = [tenantId, entityId, status];

  if (status === 'Submitted') {
    sets.push('submitted_at = NOW()', 'submitted_by = $4');
    params.push(userId);
  } else if (status === 'Approved') {
    sets.push('approved_at = NOW()', 'approved_by = $4');
    params.push(userId);
  } else if (status === 'Draft') {
    sets.push('submitted_at = NULL', 'submitted_by = NULL');
  }

  if (extra?.paymentStatus && table === 'bills') {
    params.push(extra.paymentStatus);
    sets.push(`status = $${params.length}`);
  }
  if (extra?.contractStatus && table === 'contracts') {
    params.push(extra.contractStatus);
    sets.push(`status = $${params.length}`);
  }

  await client.query(
    `UPDATE ${table} SET ${sets.join(', ')}
     WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    params
  );
}

export function transactionRequiresPaymentApproval(row: {
  type: string;
  bill_id?: string | null;
  vendor_id?: string | null;
  is_system?: boolean;
}): boolean {
  if (row.is_system) return false;
  if (String(row.type) !== 'Expense') return false;
  return Boolean(row.bill_id?.trim() || row.vendor_id?.trim());
}
