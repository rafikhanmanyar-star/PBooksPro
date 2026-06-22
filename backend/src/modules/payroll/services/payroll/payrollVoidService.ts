import type pg from 'pg';
import { PayrollValidationError } from '../../../../payroll-core/payrollValidation.js';
import { reversePayrollRunAccrualJournal } from './payrollJournalPostingService.js';
import { PayrollRunRepository } from '../../repositories/PayrollRunRepository.js';
import { PayslipRepository } from '../../repositories/PayslipRepository.js';
import { getPayrollRun, listPayslipsByRun, recalculatePayrollRunAggregates } from './payrollRuns.js';
import { rowToPayrollRunApi, rowToPayslipApi } from './payrollRowMappers.js';
import { numStr } from './payrollHelpers.js';
import { PAYROLL_AUDIT_ACTIONS } from './payrollAuditCatalog.js';
import { recordPayrollAudit } from './payrollAuditService.js';
import { softDeleteTransaction, getTransactionById } from '../../../accounting/services/transactionsService.js';
import type { DataScopeEnforcementContext } from '../../../../auth/tenantRepositoryScope.js';
import { enforceLockForSave } from '../../../accounting/services/recordLocksService.js';

function assertReason(reason: string | null | undefined): string {
  const r = String(reason ?? '').trim();
  if (!r) throw new PayrollValidationError('REASON_REQUIRED', 'A reason is required.');
  if (r.length < 3) {
    throw new PayrollValidationError('REASON_REQUIRED', 'Reason must be at least 3 characters.');
  }
  return r;
}

function payslipHasPayment(ps: { is_paid?: boolean | null; paid_amount?: string | number | null }): boolean {
  return ps.is_paid === true || numStr(ps.paid_amount ?? 0) > 0.005;
}

export async function voidPayslip(
  client: pg.PoolClient,
  tenantId: string,
  payslipId: string,
  reason: string | null | undefined,
  actorUserId: string | null | undefined,
  scopeCtx?: DataScopeEnforcementContext
): Promise<boolean> {
  const why = assertReason(reason);
  const repo = new PayslipRepository(tenantId);
  const ps = await repo.getById(client, payslipId, scopeCtx);
  if (!ps) return false;

  await enforceLockForSave(client, tenantId, 'payroll', ps.payroll_run_id, actorUserId);

  if (payslipHasPayment(ps)) {
    throw new PayrollValidationError(
      'PAYSLIP_HAS_PAYMENTS',
      'Cannot void payslip with recorded payments. Reverse the payroll payment first.'
    );
  }

  const run = await getPayrollRun(client, tenantId, ps.payroll_run_id, scopeCtx);
  if (!run) throw new PayrollValidationError('RUN_NOT_FOUND', 'Payroll run not found.');
  if (run.status === 'APPROVED' || run.status === 'PAID') {
    throw new PayrollValidationError(
      'RUN_LOCKED',
      'Cannot void payslips on an approved or paid run. Unapprove the run first (Correction workflow).'
    );
  }

  const deleted = await repo.markDeleted(client, payslipId);
  if (!deleted) return false;

  const priorApi = rowToPayslipApi(ps);
  await recordPayrollAudit(client, {
    tenantId,
    userId: actorUserId,
    entityType: 'payslip',
    entityId: payslipId,
    auditAction: PAYROLL_AUDIT_ACTIONS.PAYSLIP_VOIDED,
    action: 'delete',
    oldValue: priorApi,
    newValue: { voided: true, payroll_run_id: ps.payroll_run_id },
    reason: why,
  });

  await recalculatePayrollRunAggregates(client, tenantId, ps.payroll_run_id);
  const { syncPayrollLedgerForEmployee } = await import('../payrollLedgerService.js');
  await syncPayrollLedgerForEmployee(client, tenantId, ps.employee_id);
  return true;
}

export async function voidPayrollRun(
  client: pg.PoolClient,
  tenantId: string,
  runId: string,
  reason: string | null | undefined,
  actorUserId: string | null | undefined,
  scopeCtx?: DataScopeEnforcementContext
): Promise<boolean> {
  const why = assertReason(reason);
  const runRepo = new PayrollRunRepository(tenantId);
  const prior = await runRepo.getById(client, runId, scopeCtx);
  if (!prior) return false;

  await enforceLockForSave(client, tenantId, 'payroll', runId, actorUserId);

  if (prior.status === 'PAID') {
    throw new PayrollValidationError(
      'RUN_PAID',
      'Cannot void a paid payroll run. Reverse payments and contact finance.'
    );
  }

  const payslips = await listPayslipsByRun(client, tenantId, runId, scopeCtx);
  if (payslips.some((p) => payslipHasPayment(p))) {
    throw new PayrollValidationError(
      'RUN_HAS_PAYMENTS',
      'Cannot void payroll run: one or more payslips have payments. Reverse payments first.'
    );
  }

  if (prior.status === 'APPROVED') {
    await reversePayrollRunAccrualJournal(
      client,
      tenantId,
      runId,
      actorUserId ?? null,
      `Payroll run voided: ${why}`
    );
    await recordPayrollAudit(client, {
      tenantId,
      userId: actorUserId,
      entityType: 'payroll_run',
      entityId: runId,
      auditAction: PAYROLL_AUDIT_ACTIONS.RUN_REVERSED,
      reason: why,
      oldValue: rowToPayrollRunApi(prior),
      newValue: { accrualReversed: true },
    });
  }

  await new PayslipRepository(tenantId).markDeletedByRun(client, runId);
  const ok = await runRepo.markDeleted(client, runId);
  if (!ok) return false;

  await recordPayrollAudit(client, {
    tenantId,
    userId: actorUserId,
    entityType: 'payroll_run',
    entityId: runId,
    auditAction: PAYROLL_AUDIT_ACTIONS.RUN_VOIDED,
    action: 'delete',
    oldValue: rowToPayrollRunApi(prior),
    newValue: { voided: true, month: prior.month, year: prior.year },
    reason: why,
  });
  return true;
}

export async function reversePayrollPayment(
  client: pg.PoolClient,
  tenantId: string,
  transactionId: string,
  reason: string | null | undefined,
  actorUserId: string | null
): Promise<{ ok: boolean; payslipId?: string | null }> {
  const why = assertReason(reason);
  const row = await getTransactionById(client, tenantId, transactionId);
  if (!row) return { ok: false };
  if (!row.payslip_id) {
    throw new PayrollValidationError(
      'NOT_PAYROLL_PAYMENT',
      'This transaction is not linked to a payroll payslip.'
    );
  }

  const result = await softDeleteTransaction(client, tenantId, transactionId);
  if (!result.ok) {
    if (result.conflict) {
      throw new PayrollValidationError('VERSION_CONFLICT', 'Payment record was modified by another user.');
    }
    return { ok: false };
  }

  await recordPayrollAudit(client, {
    tenantId,
    userId: actorUserId,
    entityType: 'payroll_payment',
    entityId: transactionId,
    auditAction: PAYROLL_AUDIT_ACTIONS.PAYMENT_REVERSED,
    action: 'delete',
    oldValue: { transactionId, payslipId: row.payslip_id, amount: row.amount },
    newValue: { reversed: true },
    reason: why,
  });

  await recordPayrollAudit(client, {
    tenantId,
    userId: actorUserId,
    entityType: 'payslip',
    entityId: row.payslip_id,
    auditAction: PAYROLL_AUDIT_ACTIONS.PAYMENT_VOIDED,
    reason: why,
    newValue: { transactionId, reversed: true },
  });

  return { ok: true, payslipId: row.payslip_id };
}
