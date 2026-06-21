/**
 * PaySalaryModal - Pay a payslip: optionally offset prior salary advance (liability clearing)
 * and pay the rest from Bank/Cash. Totals reconcile with payroll ledger (Σ nets − Σ expenses).
 */

import { useDispatchOnly, usePayrollPaymentState } from '../../../hooks/useSelectiveState';
import React, { useState, useMemo } from 'react';
import { X, Banknote, Loader2, AlertCircle } from 'lucide-react';
import { PayrollEmployee, Payslip, PayrollRun, PayrollStatus } from '../types';
import { storageService } from '../services/storageService';
import { Account, Transaction, TransactionType, AccountType } from '../../../types';
import { isAccountingBackedByRemoteApi } from '../../../config/apiUrl';
import { payrollApi } from '../../../services/api/payrollApi';
import { syncPayrollFromServer } from '../services/payrollSync';
import { resolveSystemCategoryId } from '../../../services/systemEntityIds';
import { payslipDisplayPaidAmount, payslipRemainingAmount } from '../utils/payslipPaymentState';
import { resolvePayslipAssignment } from '../utils/payslipAssignment';
import { employeePayrollNetBalanceFromTotals } from '../utils/payrollLedgerCore';
import { todayLocalYyyyMmDd, toLocalDateString } from '../../../utils/dateUtils';
import { canPayPayrollRun } from '../utils/payrollWorkflowGuards';
import DatePicker from '../../ui/DatePicker';
import AmountInput from '../../common/AmountInput';
import { useRecordLock, isAdminRole } from '../../../hooks/useRecordLock';
import RecordLockBanner from '../../recordLock/RecordLockBanner';
import RecordLockConflictModal from '../../recordLock/RecordLockConflictModal';

const EPS = 0.01;

function round2(n: number): number {
  return Math.round(Math.max(-1e15, Math.min(1e15, n)) * 100) / 100;
}

function parseMoney(s: string): number {
  const n = parseFloat(String(s ?? '').trim().replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/** Prior payroll advance (Σ nets − Σ payslip-linked expenses < 0) for this employee. */
function employeeSalaryAdvanceOutstanding(tenantId: string, employeeId: string, transactions: Transaction[]): number {
  const slips = storageService.getPayslips(tenantId).filter((p) => p.employee_id === employeeId);
  if (slips.length === 0) return 0;
  const nets = slips.map((p) => Number(p.net_pay) || 0);
  const slipIds = new Set(slips.map((s) => s.id));
  const paymentAmounts = (transactions ?? [])
    .filter((t) => t.payslipId != null && slipIds.has(String(t.payslipId)))
    .filter((t) => String(t.type ?? '').toLowerCase() === 'expense')
    .map((t) => Number(t.amount) || 0)
    .filter((a) => a > 0);
  const { advanceAmount } = employeePayrollNetBalanceFromTotals(nets, paymentAmounts);
  return advanceAmount;
}

function pickSalaryAdvanceClearingAccount(accounts: Account[]): Account | null {
  const liab = (accounts ?? []).filter((a) => a.type === AccountType.LIABILITY);
  if (liab.length === 0) return null;
  const prefs = ['salary advance', 'advances', 'advance', 'staff', 'salaries payable', 'salary payable', 'payroll'];
  const sorted = [...liab].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  for (const pref of prefs) {
    const hit = sorted.find((a) => a.name.toLowerCase().includes(pref));
    if (hit) return hit;
  }
  return sorted[0] ?? null;
}

type Piece = { kind: 'project' | 'building'; id: string; name: string; percentage: number };

const PAY_ABORT = '__PAY_SALARY_ABORT__';

interface PaySalaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: () => void;
  payslip: Payslip | null;
  employee: PayrollEmployee | null;
  run: PayrollRun | null;
  tenantId: string;
  userId: string;
}

const PaySalaryModal: React.FC<PaySalaryModalProps> = ({
  isOpen,
  onClose,
  onPaymentComplete,
  payslip,
  employee,
  run,
  tenantId,
  userId,
}) => {
  const { accounts, categories, projects, buildings, transactions, currentUser } = usePayrollPaymentState();
  const dispatch = useDispatchOnly();
  const payrollRunId = run?.id ?? payslip?.payroll_run_id;
  const recordLock = useRecordLock({
    recordType: 'payroll',
    recordId: payrollRunId,
    enabled: isOpen && Boolean(payrollRunId),
    currentUserId: currentUser?.id ?? userId,
    currentUserName: currentUser?.name,
    userRole: currentUser?.role,
  });
  const [advanceApplyStr, setAdvanceApplyStr] = useState('');
  const [cashAmountStr, setCashAmountStr] = useState('');
  const [advanceClearingAccountId, setAdvanceClearingAccountId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [note, setNote] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => toLocalDateString(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payGuard = useMemo(() => canPayPayrollRun(run), [run]);
  const paymentBlocked = !payGuard.allowed;

  const bankAccounts = useMemo(
    () =>
      (accounts || []).filter(
        (a) =>
          a.type === AccountType.BANK ||
          a.type === AccountType.CASH ||
          (a as { type?: string }).type?.toLowerCase() === 'bank' ||
          (a as { type?: string }).type?.toLowerCase() === 'cash'
      ),
    [accounts]
  );

  const liabilityAccounts = useMemo(
    () => (accounts || []).filter((a) => a.type === AccountType.LIABILITY),
    [accounts]
  );

  const salaryCategory = useMemo(() => {
    const sid = resolveSystemCategoryId(categories, 'sys-cat-sal-exp');
    return (categories || []).find((c) => (sid && c.id === sid) || c.name === 'Salary Expenses');
  }, [categories]);

  const paidSoFar = payslip ? payslipDisplayPaidAmount(payslip) : 0;
  const remainingAmount = payslip ? payslipRemainingAmount(payslip) : 0;

  const advanceOutstanding = useMemo(() => {
    if (!tenantId || !employee?.id) return 0;
    return employeeSalaryAdvanceOutstanding(tenantId, employee.id, transactions ?? []);
  }, [tenantId, employee?.id, transactions]);

  React.useEffect(() => {
    if (!isOpen || !payslip || !tenantId || !employee) return;
    const rem = payslipRemainingAmount(payslip);
    const ao = employeeSalaryAdvanceOutstanding(tenantId, employee.id, transactions ?? []);
    const defAdv = Math.max(0, Math.min(rem, ao));
    setAdvanceApplyStr(defAdv > EPS ? String(round2(defAdv)) : '');
    setCashAmountStr(String(round2(Math.max(0, rem - defAdv))));
    const pick = pickSalaryAdvanceClearingAccount(accounts || []);
    setAdvanceClearingAccountId(pick?.id ?? '');
    setBankAccountId('');
    setNote('');
    setPaymentDate(todayLocalYyyyMmDd());
    setError(null);
  }, [isOpen, payslip?.id, tenantId, employee?.id, transactions, accounts]);

  const totalAppliedParsed = (): number =>
    round2((parseMoney(advanceApplyStr) || 0) + (parseMoney(cashAmountStr) || 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payslip || !employee || !tenantId) return;
    if (recordLock.viewOnly) return;
    if (paymentBlocked) {
      setError(payGuard.reason ?? 'Payroll run must be approved before payment.');
      return;
    }
    if (!salaryCategory) {
      setError('Salary expense category not found. Please contact support.');
      return;
    }

    const rawAdv = parseMoney(advanceApplyStr);
    const rawCash = parseMoney(cashAmountStr);
    let advanceA =
      typeof rawAdv === 'number' && !Number.isNaN(rawAdv) ? Math.max(0, round2(rawAdv)) : 0;
    const cashC =
      typeof rawCash === 'number' && !Number.isNaN(rawCash) ? Math.max(0, round2(rawCash)) : 0;

    const maxAdvApply = Math.max(0, Math.min(advanceOutstanding, remainingAmount));
    advanceA = Math.min(advanceA, maxAdvApply);

    if (!(advanceA + cashC > EPS)) {
      setError('Enter an amount applied from salary advance and/or paid from bank/cash.');
      return;
    }
    if (advanceA > EPS && !advanceClearingAccountId) {
      setError('Select a Liability account to book the salary advance offset (e.g. Salary advance / Payroll payable).');
      return;
    }
    if (cashC > EPS && !bankAccountId) {
      setError('Select a bank/cash account for the payment.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const stamp = Date.now();
    let sliceIdx = 0;

    const pushExpenseSlices = (
      gross: number,
      accountIdSlice: string,
      descriptionPlain: string
    ): Transaction[] => {
      const out: Transaction[] = [];
      if (!(gross > EPS)) return out;

      const proj =
        employee.projects && employee.projects.length > 0
          ? employee.projects.map((p) => ({
              kind: 'project' as const,
              id: p.project_id,
              name: p.project_name || 'Unallocated',
              percentage: p.percentage,
            }))
          : [];
      const bld =
        employee.buildings && employee.buildings.length > 0
          ? employee.buildings.map((b) => ({
              kind: 'building' as const,
              id: b.building_id,
              name: b.building_name || 'Unallocated',
              percentage: b.percentage,
            }))
          : [];
      const pieces: Piece[] = [...proj, ...bld];
      const totalPct = pieces.reduce((s, a) => s + a.percentage, 0);

      if (pieces.length > 0 && totalPct > 0) {
        let consumed = 0;
        for (let i = 0; i < pieces.length; i++) {
          const p = pieces[i]!;
          const pct = p.percentage / totalPct;
          const isLast = i === pieces.length - 1;
          const amt = isLast ? round2(gross - consumed) : round2(gross * pct);
          consumed = round2(consumed + amt);
          if (!(amt > EPS)) continue;
          const desc =
            pieces.length > 1
              ? `${descriptionPlain} (${p.name} ${p.percentage}%)`
              : descriptionPlain;
          const tx: any = {
            id: `pay-sal-${stamp}-${sliceIdx}-${Math.random().toString(36).slice(2, 8)}`,
            type: TransactionType.EXPENSE,
            amount: amt,
            date: paymentDate,
            description: desc,
            accountId: accountIdSlice,
            categoryId: salaryCategory.id,
            payslipId: payslip.id,
          };
          sliceIdx++;
          if (p.kind === 'project') tx.projectId = p.id || undefined;
          else tx.buildingId = p.id || undefined;
          out.push(tx);
        }
      } else {
        out.push({
          id: `pay-sal-${stamp}-${sliceIdx}-${Math.random().toString(36).slice(2, 8)}`,
          type: TransactionType.EXPENSE,
          amount: round2(gross),
          date: paymentDate,
          description: descriptionPlain,
          accountId: accountIdSlice,
          categoryId: salaryCategory.id,
          payslipId: payslip.id,
        } as Transaction);
        sliceIdx++;
      }
      return out;
    };

    try {
      if (!isAccountingBackedByRemoteApi()) {
        const periodLabel = run ? `${run.month} ${run.year}` : 'Payroll';
        const descriptionBase = note?.trim()
          ? `Salary - ${employee.name} - ${periodLabel}. ${note}`
          : `Salary - ${employee.name} - ${periodLabel}`;
        const descAdvance = `${descriptionBase} — salary advance offset`;

        const txs: Transaction[] = [];
        if (advanceA > EPS && advanceClearingAccountId) {
          txs.push(...pushExpenseSlices(advanceA, advanceClearingAccountId, descAdvance));
        }
        if (cashC > EPS && bankAccountId) {
          txs.push(...pushExpenseSlices(cashC, bankAccountId, descriptionBase));
        }

        dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: txs });

        const previousPaid = payslipDisplayPaidAmount(payslip);
        const totalApplied = advanceA + cashC;
        const newPaidTotal = Math.min(Number(payslip.net_pay) || 0, previousPaid + totalApplied);
        const isFullyPaid = newPaidTotal >= (Number(payslip.net_pay) || 0) - EPS;
        const updatedPayslip: Payslip = {
          ...payslip,
          paid_amount: newPaidTotal,
          is_paid: isFullyPaid,
          paid_at: previousPaid === 0 ? paymentDate : payslip.paid_at ?? paymentDate,
          transaction_id: txs[0]?.id,
          updated_at: new Date().toISOString(),
        };
        storageService.updatePayslip(tenantId, updatedPayslip);

        const runPayslipsAfter = storageService.getPayslipsByRunId(tenantId, payslip.payroll_run_id);
        const allPaid = runPayslipsAfter.every((ps) => ps.is_paid);
        if (allPaid) {
          const runs = storageService.getPayrollRuns(tenantId);
          const runToUpdate = runs.find((r) => r.id === payslip.payroll_run_id);
          if (runToUpdate) {
            storageService.updatePayrollRun(
              tenantId,
              {
                ...runToUpdate,
                status: PayrollStatus.PAID,
                paid_at: paymentDate,
                updated_at: new Date().toISOString(),
              },
              userId
            );
          }
        }

        onPaymentComplete();
        onClose();
      } else {
        const periodLabel = run ? `${run.month} ${run.year}` : 'Payroll';
        const descriptionBase = note?.trim()
          ? `Salary - ${employee.name} - ${periodLabel}. ${note}`
          : `Salary - ${employee.name} - ${periodLabel}`;

        const { projects: snapProjectsApi, buildings: snapBuildingsApi } = resolvePayslipAssignment(
          payslip,
          employee
        );
        const projectAllocs =
          snapProjectsApi.length > 0
            ? snapProjectsApi.map((p) => ({
                kind: 'project' as const,
                id: p.project_id,
                name: p.project_name || 'Unallocated',
                percentage: p.percentage,
              }))
            : [];
        const buildingAllocs =
          snapBuildingsApi.length > 0
            ? snapBuildingsApi.map((b) => ({
                kind: 'building' as const,
                id: b.building_id,
                name: b.building_name || 'Unallocated',
                percentage: b.percentage,
              }))
            : [];
        const pieces: Piece[] = [...projectAllocs, ...buildingAllocs];

        const mapApiTx = (tx: Record<string, unknown>, fallbackAccountId: string): Transaction => ({
          id: String(tx.id),
          type: ((tx.type as Transaction['type']) || TransactionType.EXPENSE),
          amount: Number(tx.amount),
          date:
            typeof tx.date === 'string'
              ? tx.date.slice(0, 10)
              : String(tx.date ?? paymentDate).slice(0, 10),
          description: (tx.description as string) || descriptionBase,
          accountId: String(tx.accountId ?? fallbackAccountId),
          categoryId: (tx.categoryId as string) || salaryCategory!.id,
          projectId: tx.projectId as string | undefined,
          buildingId: tx.buildingId as string | undefined,
          payslipId: (tx.payslipId as string) || payslip.id,
          version: typeof tx.version === 'number' ? tx.version : undefined,
        });

        const paySlices = async (grossAmt: number, accountIdSlice: string, descForSingle: string) => {
          if (!(grossAmt > EPS)) return;
          const totalPct = pieces.reduce((s, a) => s + a.percentage, 0);
          if (pieces.length === 0 || totalPct <= EPS) {
            const res = await payrollApi.payPayslip(payslip!.id, {
              accountId: accountIdSlice,
              categoryId: salaryCategory!.id,
              amount: grossAmt,
              description: descForSingle,
              date: paymentDate,
            });
            if (!res?.success || !res.transaction) {
              setError(res?.error || 'Payment failed.');
              throw new Error(PAY_ABORT);
            }
            dispatch({
              type: 'ADD_TRANSACTION',
              payload: mapApiTx(res.transaction as Record<string, unknown>, accountIdSlice),
            });
            return;
          }
          let consumed = 0;
          for (let i = 0; i < pieces.length; i++) {
            const a = pieces[i]!;
            const pct = a.percentage / totalPct;
            const isLast = i === pieces.length - 1;
            const amt = isLast ? round2(grossAmt - consumed) : round2(grossAmt * pct);
            consumed = round2(consumed + amt);
            if (!(amt > EPS)) continue;
            const desc =
              pieces.length > 1
                ? `${descForSingle.replace(/\.$/, '')} (${a.name} ${a.percentage}%)`
                : descForSingle;
            const res = await payrollApi.payPayslip(payslip!.id, {
              accountId: accountIdSlice,
              categoryId: salaryCategory!.id,
              amount: amt,
              description: desc,
              date: paymentDate,
              projectId: a.kind === 'project' ? a.id : undefined,
              buildingId: a.kind === 'building' ? a.id : undefined,
            });
            if (!res?.success || !res.transaction) {
              setError(res?.error || 'Payment failed.');
              throw new Error(PAY_ABORT);
            }
            dispatch({
              type: 'ADD_TRANSACTION',
              payload: mapApiTx(res.transaction as Record<string, unknown>, accountIdSlice),
            });
          }
        };

        if (advanceA > EPS && advanceClearingAccountId) {
          await paySlices(advanceA, advanceClearingAccountId, `${descriptionBase} — salary advance offset`);
        }

        if (cashC > EPS && bankAccountId) {
          await paySlices(cashC, bankAccountId, descriptionBase);
        }

        await syncPayrollFromServer(tenantId);
        onPaymentComplete();
        onClose();
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message === PAY_ABORT) {
        /* setError already set in paySlices */
      } else {
        setError(e instanceof Error ? e.message : 'Payment failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const employeeName = employee?.name ?? '—';
  const runLabel = run ? `${run.month} ${run.year}` : '—';

  const advPars = parseMoney(advanceApplyStr);
  const cashPars = parseMoney(cashAmountStr);
  let advClamp =
    typeof advPars === 'number' && !Number.isNaN(advPars) ? Math.max(0, round2(advPars)) : 0;
  advClamp = Math.min(advClamp, Math.max(0, Math.min(advanceOutstanding, remainingAmount)));
  const cashClamp =
    typeof cashPars === 'number' && !Number.isNaN(cashPars) ? Math.max(0, round2(cashPars)) : 0;
  const submitOk =
    advClamp + cashClamp > EPS &&
    (!advClamp || !!advanceClearingAccountId) &&
    (!(cashClamp > EPS) || !!bankAccountId) &&
    !recordLock.viewOnly;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <RecordLockConflictModal
          isOpen={recordLock.showConflictModal}
          lockedByName={recordLock.lockedByName ?? 'Another user'}
          isAdmin={isAdminRole(currentUser?.role)}
          onViewOnly={recordLock.chooseViewOnly}
          onForceEdit={() => void recordLock.forceTakeover()}
          onDismiss={recordLock.dismissModal}
        />
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Banknote className="text-emerald-600" size={24} />
            <h2 className="text-lg font-bold text-slate-900">Pay Salary</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={20} />
          </button>
        </div>

        {recordLock.bannerMode === 'self' && (
          <RecordLockBanner mode="self" currentUserName={currentUser?.name} />
        )}
        {recordLock.bannerMode === 'other' && (
          <RecordLockBanner mode="other" otherEditorName={recordLock.lockedByName} />
        )}

        {paymentBlocked && payGuard.reason && (
          <div className="mx-6 mb-0 flex items-center gap-2 text-amber-800 text-sm bg-amber-50 rounded-xl px-3 py-2 border border-amber-200">
            <AlertCircle size={18} />
            {payGuard.reason}
          </div>
        )}

        <form onSubmit={handleSubmit} className={`p-6 space-y-5 ${recordLock.viewOnly ? 'pointer-events-none opacity-[0.88]' : ''}`}>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Employee</label>
              <div className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium">
                {employeeName}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Period</label>
              <div className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                {runLabel}
              </div>
            </div>

            {(paidSoFar > EPS || remainingAmount > EPS) && (
              <p className="text-xs text-slate-500">
                Payslip payable:{' '}
                <span className="font-semibold tabular-nums">{remainingAmount.toLocaleString()}</span> outstanding
                {paidSoFar > EPS ? (
                  <>
                    {' '}
                    (<span className="tabular-nums">{paidSoFar.toLocaleString()}</span> already paid toward net)
                  </>
                ) : null}
              </p>
            )}

            {advanceOutstanding > EPS && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-semibold text-amber-900">Prior salary advance (credit)</p>
                <p className="text-sm text-amber-900 tabular-nums font-black">
                  {advanceOutstanding.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="text-[10px] text-amber-900/85 mt-1">
                  Applies against this payslip up to remaining payable. Posted to your liability clearing account (not Bank/Cash).
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Deduct from salary advance <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <AmountInput
                value={advanceApplyStr}
                onChange={(e) => setAdvanceApplyStr(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="0"
                disabled={advanceOutstanding <= EPS}
                aria-label="Deduct from salary advance"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Max {Math.max(0, Math.min(advanceOutstanding, remainingAmount)).toLocaleString()} for this payslip.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Pay from bank / cash</label>
              <AmountInput
                value={cashAmountStr}
                onChange={(e) => setCashAmountStr(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="0"
                aria-label="Pay from bank or cash"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Total applied to this payslip now:{' '}
                <span className="font-semibold tabular-nums text-slate-600">
                  {totalAppliedParsed().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                . Pay more than remaining to record a new advance (extra credit in the payroll ledger).
              </p>
            </div>

            {advanceOutstanding > EPS && liabilityAccounts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Advance offset account</label>
                <select
                  value={advanceClearingAccountId}
                  onChange={(e) => setAdvanceClearingAccountId(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  aria-label="Liability account for salary advance offset"
                >
                  <option value="">Select liability account</option>
                  {liabilityAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (Liability)
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Use a liability such as &quot;Salary advance&quot; or &quot;Salaries payable&quot;. Required when applying an advance amount.
                </p>
              </div>
            )}

            {advanceOutstanding > EPS && liabilityAccounts.length === 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Add a Liability account in your chart of accounts to book salary advance offsets (e.g. Salary advance).
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bank / cash account</label>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                aria-label="Bank account"
              >
                <option value="">Select account</option>
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} {acc.type ? `(${acc.type})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">Required when paying any amount from bank or cash.</p>
            </div>

            <div>
              <DatePicker
                label="Payment date"
                value={paymentDate}
                onChange={(d) => setPaymentDate(toLocalDateString(d))}
                className="!rounded-xl !border-slate-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                placeholder="e.g. March 2025 salary"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !submitOk || !salaryCategory || paymentBlocked}
              className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={18} />}
              {isSubmitting ? 'Processing...' : 'Pay salary'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaySalaryModal;
