import type pg from 'pg';
import { recordDomainMutation, type DomainMutationInput } from '../../../../core/recordDomainMutation.js';
import type { PayrollAuditAction } from './payrollAuditCatalog.js';

export type RecordPayrollAuditInput = {
  tenantId: string;
  userId?: string | null;
  entityType: string;
  entityId: string;
  auditAction: PayrollAuditAction | string;
  /** create | update | delete for change_log */
  action?: DomainMutationInput['action'];
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  summary?: string;
};

function enrichWithReason(value: unknown, reason?: string | null): unknown {
  if (!reason?.trim()) return value;
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>), reason: reason.trim() };
  }
  return { reason: reason.trim(), snapshot: value ?? null };
}

export async function recordPayrollAudit(
  client: pg.PoolClient,
  input: RecordPayrollAuditInput
): Promise<string> {
  const reason = input.reason?.trim() || null;
  const summary =
    input.summary ??
    (reason ? `${input.auditAction} — ${reason}` : input.auditAction);
  return recordDomainMutation(client, {
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    module: 'payroll',
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action ?? 'update',
    auditAction: input.auditAction,
    summary,
    oldValue: input.oldValue,
    newValue: enrichWithReason(input.newValue, reason),
  });
}
