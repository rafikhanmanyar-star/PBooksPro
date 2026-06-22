/**
 * Payroll run approval accrual — Dr Payroll Expense (summary) / Cr Accounts Payable.
 * Mirrors vendor bill accrual pattern; settlement occurs on payslip payment (Dr AP / Cr Bank).
 */
import type pg from 'pg';
import { formatPgDateToYyyyMmDd } from '../../../../utils/dateOnly.js';
import { roundMoney, type JournalLineInput } from '../../../../financial/validation.js';
import {
  entryDimensionsFrom,
  journalLineWithDimensions,
  resolveJournalDimensions,
  type JournalDimensions,
} from '../../../../financial/journalDimensions.js';
import { type CreateJournalBody } from '../../../accounting/services/journalService.js';
import { createFinancialPostingService } from '../../../accounting/services/FinancialPostingService.js';
import type { PayrollRunRow } from './payrollTypes.js';
import { numStr } from './payrollHelpers.js';

export const PAYROLL_RUN_JOURNAL_SOURCE_MODULE = 'payroll_run';

const SYS_AP = 'sys-acc-ap';
const SYS_EXPENSE_SUMMARY = 'sys-acc-expense-summary';

export type PayrollRunAccrualInput = {
  run: PayrollRunRow;
  accrualAmount: number;
  approvedBy: string | null;
  categoryId?: string | null;
  projectId?: string | null;
};

function runEntryDateYmd(run: PayrollRunRow): string {
  if (run.period_end) {
    return formatPgDateToYyyyMmDd(run.period_end as Date | string);
  }
  if (run.approved_at) {
    return formatPgDateToYyyyMmDd(run.approved_at as Date);
  }
  return formatPgDateToYyyyMmDd(new Date());
}

function accrualDimensions(input: PayrollRunAccrualInput): JournalDimensions {
  return resolveJournalDimensions({ project_id: input.projectId });
}

export function shouldSkipPayrollRunAccrual(accrualAmount: number): boolean {
  return roundMoney(Math.abs(accrualAmount)) < 0.005;
}

export function buildJournalLinesFromPayrollRunAccrual(
  accrualAmount: number,
  dims: JournalDimensions
): JournalLineInput[] | null {
  const M = roundMoney(Math.abs(accrualAmount));
  if (M < 0.005) return null;
  return [
    journalLineWithDimensions({ accountId: SYS_EXPENSE_SUMMARY, debitAmount: M, creditAmount: 0 }, dims),
    journalLineWithDimensions({ accountId: SYS_AP, debitAmount: 0, creditAmount: M }, dims),
  ];
}

export function buildJournalBodyFromPayrollRunAccrual(
  input: PayrollRunAccrualInput,
  lines: JournalLineInput[]
): CreateJournalBody {
  const dims = accrualDimensions(input);
  const period = `${input.run.month} ${input.run.year}`;
  return {
    entryDate: runEntryDateYmd(input.run),
    reference: `PAYROLL:${input.run.id}`,
    description: `Payroll accrual — ${period}`,
    sourceModule: PAYROLL_RUN_JOURNAL_SOURCE_MODULE,
    sourceId: input.run.id,
    createdBy: input.approvedBy,
    ...entryDimensionsFrom(dims),
    lines,
  };
}

export async function findActivePayrollRunAccrualJournalId(
  client: pg.PoolClient,
  tenantId: string,
  runId: string
): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT je.id FROM journal_entries je
     WHERE je.tenant_id = $1 AND je.source_module = $2 AND je.source_id = $3
       AND NOT EXISTS (
         SELECT 1 FROM journal_reversals jr
         WHERE jr.original_journal_entry_id = je.id AND jr.tenant_id = $1
       )
     ORDER BY je.created_at DESC, je.id DESC
     LIMIT 1`,
    [tenantId, PAYROLL_RUN_JOURNAL_SOURCE_MODULE, runId]
  );
  return r.rows[0]?.id ?? null;
}

/** Post payroll accrual on approval; idempotent when journal already exists. */
export async function ensurePayrollRunAccrualJournal(
  client: pg.PoolClient,
  tenantId: string,
  input: PayrollRunAccrualInput
): Promise<{ journalEntryId: string | null; skipped: 'no_amount' | 'already_posted' | null }> {
  if (shouldSkipPayrollRunAccrual(input.accrualAmount)) {
    return { journalEntryId: null, skipped: 'no_amount' };
  }
  const existing = await findActivePayrollRunAccrualJournalId(client, tenantId, input.run.id);
  if (existing) {
    return { journalEntryId: existing, skipped: 'already_posted' };
  }
  const dims = accrualDimensions(input);
  const lines = buildJournalLinesFromPayrollRunAccrual(input.accrualAmount, dims);
  if (!lines) return { journalEntryId: null, skipped: 'no_amount' };
  const body = buildJournalBodyFromPayrollRunAccrual(input, lines);
  const { journalEntryId } = await createFinancialPostingService(tenantId, client).postJournal(client, body, {
    actorUserId: input.approvedBy,
  });
  return { journalEntryId, skipped: null };
}

/** Reverse accrual when an approved run is unapproved (no payments recorded). */
export async function reversePayrollRunAccrualJournal(
  client: pg.PoolClient,
  tenantId: string,
  runId: string,
  actorUserId: string | null,
  reason = 'Payroll run unapproved'
): Promise<void> {
  const existingId = await findActivePayrollRunAccrualJournalId(client, tenantId, runId);
  if (!existingId) return;
  await createFinancialPostingService(tenantId, client).reverseJournal(client, existingId, reason, actorUserId);
}

/** Sum accrual from run total_amount with payslip net_pay fallback. */
export function resolvePayrollRunAccrualAmount(run: PayrollRunRow, payslipNetTotal: number): number {
  const fromRun = numStr(run.total_amount);
  if (fromRun > 0.005) return roundMoney(fromRun);
  return roundMoney(payslipNetTotal);
}
