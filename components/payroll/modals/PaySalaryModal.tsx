/**
 * PaySalaryModal - Form to pay a payslip: employee name, amount, bank account, note, date.
 * On submit: marks payslip paid, records expense transaction(s) by project allocation, updates accounts/reports.
 */

import React, { useState, useMemo } from 'react';
import { X, Banknote, Loader2, AlertCircle } from 'lucide-react';
import { PayrollEmployee, Payslip, PayrollRun, PayrollStatus } from '../types';
import { storageService } from '../services/storageService';
import { useAppContext } from '../../../context/AppContext';
import { Transaction, TransactionType } from '../../../types';
import { isLocalOnlyMode } from '../../../config/apiUrl';
import { payrollApi } from '../../../services/api/payrollApi';
import { syncPayrollFromServer } from '../services/payrollSync';
import { resolveSystemCategoryId } from '../../../services/systemEntityIds';
import { payslipDisplayPaidAmount, payslipRemainingAmount } from '../utils/payslipPaymentState';
import { resolvePayslipAssignment } from '../utils/payslipAssignment';
import { todayLocalYyyyMmDd, toLocalDateString } from '../../../utils/dateUtils';
import DatePicker from '../../ui/DatePicker';

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
  userId
}) => {
  const { state, dispatch } = useAppContext();
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => toLocalDateString(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bankAccounts = useMemo(() => {
    return (state.accounts || []).filter(
      a => a.type === 'Bank' || a.type === 'Cash' || (a as any).type === 'bank' || (a as any).type === 'cash'
    );
  }, [state.accounts]);

  const salaryCategory = useMemo(() => {
    const sid = resolveSystemCategoryId(state.categories, 'sys-cat-sal-exp');
    return (state.categories || []).find(
      c => (sid && c.id === sid) || c.name === 'Salary Expenses'
    );
  }, [state.categories]);

  const paidSoFar = payslip ? payslipDisplayPaidAmount(payslip) : 0;
  const remainingAmount = payslip ? payslipRemainingAmount(payslip) : 0;

  // Reset form when modal opens with new payslip (default amount = remaining to pay)
  React.useEffect(() => {
    if (isOpen && payslip) {
      setAmount(String(payslipRemainingAmount(payslip)));
      setAccountId('');
      setNote('');
      setPaymentDate(todayLocalYyyyMmDd());
      setError(null);
    }
  }, [isOpen, payslip?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payslip || !employee || !tenantId) return;
    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    const remaining = payslipRemainingAmount(payslip);
    if (payAmount > remaining) {
      setError(`Amount cannot exceed remaining balance (${remaining.toLocaleString()}).`);
      return;
    }
    if (!accountId) {
      setError('Please select a bank account.');
      return;
    }
    if (!salaryCategory) {
      setError('Salary expense category not found. Please contact support.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      if (isLocalOnlyMode()) {
        const periodLabel = run ? `${run.month} ${run.year}` : 'Payroll';
        const description = note?.trim()
          ? `Salary - ${employee.name} - ${periodLabel}. ${note}`
          : `Salary - ${employee.name} - ${periodLabel}`;

        const projectAllocs = employee.projects && employee.projects.length > 0
          ? employee.projects.map(p => ({ type: 'project' as const, id: p.project_id, name: p.project_name || 'Unallocated', percentage: p.percentage }))
          : [];
        const buildingAllocs = (employee.buildings && employee.buildings.length > 0)
          ? employee.buildings.map(b => ({ type: 'building' as const, id: b.building_id, name: b.building_name || 'Unallocated', percentage: b.percentage }))
          : [];
        const allAllocs = [...projectAllocs, ...buildingAllocs];
        const totalPct = allAllocs.reduce((s, a) => s + a.percentage, 0);
        const transactions: any[] = [];
        const timestamp = Date.now();

        if (allAllocs.length > 0 && totalPct > 0) {
          for (let i = 0; i < allAllocs.length; i++) {
            const a = allAllocs[i];
            const pct = a.percentage / totalPct;
            const txAmount = Math.round(payAmount * pct * 100) / 100;
            if (txAmount <= 0) continue;
            const tx: any = {
              id: `pay-sal-${timestamp}-${i}-${Math.random().toString(36).slice(2, 8)}`,
              type: TransactionType.EXPENSE,
              amount: txAmount,
              date: paymentDate,
              description: allAllocs.length > 1 ? `${description} (${a.name} ${a.percentage}%)` : description,
              accountId,
              categoryId: salaryCategory.id,
              payslipId: payslip.id
            };
            if (a.type === 'project') tx.projectId = a.id || undefined;
            else tx.buildingId = a.id || undefined;
            transactions.push(tx);
          }
        }

        if (transactions.length === 0) {
          transactions.push({
            id: `pay-sal-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
            type: TransactionType.EXPENSE,
            amount: payAmount,
            date: paymentDate,
            description,
            accountId,
            categoryId: salaryCategory.id,
            payslipId: payslip.id
          });
        }

        dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: transactions });

        const previousPaid = payslipDisplayPaidAmount(payslip);
        const newPaidTotal = Math.min(payslip.net_pay, previousPaid + payAmount);
        const isFullyPaid = newPaidTotal >= payslip.net_pay;
        const updatedPayslip: Payslip = {
          ...payslip,
          paid_amount: newPaidTotal,
          is_paid: isFullyPaid,
          paid_at: previousPaid === 0 ? paymentDate : (payslip.paid_at ?? paymentDate),
          transaction_id: transactions[0]?.id,
          updated_at: new Date().toISOString()
        };
        storageService.updatePayslip(tenantId, updatedPayslip);

        const runPayslipsAfter = storageService.getPayslipsByRunId(tenantId, payslip.payroll_run_id);
        const allPaid = runPayslipsAfter.every(ps => ps.is_paid);
        if (allPaid) {
          const runs = storageService.getPayrollRuns(tenantId);
          const runToUpdate = runs.find(r => r.id === payslip.payroll_run_id);
          if (runToUpdate) {
            storageService.updatePayrollRun(tenantId, {
              ...runToUpdate,
              status: PayrollStatus.PAID,
              paid_at: paymentDate,
              updated_at: new Date().toISOString()
            }, userId);
          }
        }

        onPaymentComplete();
        onClose();
      } else {
        const periodLabel = run ? `${run.month} ${run.year}` : 'Payroll';
        const descriptionBase = note?.trim()
          ? `Salary - ${employee.name} - ${periodLabel}. ${note}`
          : `Salary - ${employee.name} - ${periodLabel}`;

        const { projects: snapProjectsApi, buildings: snapBuildingsApi } = resolvePayslipAssignment(payslip, employee);
        const projectAllocs =
          snapProjectsApi.length > 0
            ? snapProjectsApi.map((p) => ({
                type: 'project' as const,
                id: p.project_id,
                name: p.project_name || 'Unallocated',
                percentage: p.percentage,
              }))
            : [];
        const buildingAllocs =
          snapBuildingsApi.length > 0
            ? snapBuildingsApi.map((b) => ({
                type: 'building' as const,
                id: b.building_id,
                name: b.building_name || 'Unallocated',
                percentage: b.percentage,
              }))
            : [];
        const allAllocs = [...projectAllocs, ...buildingAllocs];
        const totalPct = allAllocs.reduce((s, a) => s + a.percentage, 0);

        const mapApiTx = (tx: Record<string, unknown>): Transaction => ({
          id: String(tx.id),
          type: (tx.type as Transaction['type']) || TransactionType.EXPENSE,
          amount: Number(tx.amount),
          date:
            typeof tx.date === 'string'
              ? tx.date.slice(0, 10)
              : String(tx.date ?? paymentDate).slice(0, 10),
          description: (tx.description as string) || descriptionBase,
          accountId: String(tx.accountId ?? accountId),
          categoryId: (tx.categoryId as string) || salaryCategory.id,
          projectId: tx.projectId as string | undefined,
          buildingId: tx.buildingId as string | undefined,
          payslipId: (tx.payslipId as string) || payslip.id,
          version: typeof tx.version === 'number' ? tx.version : undefined,
        });

        if (allAllocs.length > 0 && totalPct > 0) {
          for (let i = 0; i < allAllocs.length; i++) {
            const a = allAllocs[i];
            const pct = a.percentage / totalPct;
            const txAmount = Math.round(payAmount * pct * 100) / 100;
            if (txAmount <= 0) continue;
            const desc = allAllocs.length > 1 ? `${descriptionBase} (${a.name} ${a.percentage}%)` : descriptionBase;
            const res = await payrollApi.payPayslip(payslip.id, {
              accountId,
              categoryId: salaryCategory.id,
              amount: txAmount,
              description: desc,
              date: paymentDate,
              projectId: a.type === 'project' ? a.id : undefined,
              buildingId: a.type === 'building' ? a.id : undefined,
            });
            if (!res?.success || !res.transaction) {
              setError(res?.error || 'Payment failed.');
              return;
            }
            dispatch({ type: 'ADD_TRANSACTION', payload: mapApiTx(res.transaction as Record<string, unknown>) });
          }
        } else {
          const res = await payrollApi.payPayslip(payslip.id, {
            accountId,
            categoryId: salaryCategory.id,
            amount: payAmount,
            description: descriptionBase,
            date: paymentDate,
          });
          if (!res?.success || !res.transaction) {
            setError(res?.error || 'Payment failed.');
            return;
          }
          dispatch({ type: 'ADD_TRANSACTION', payload: mapApiTx(res.transaction as Record<string, unknown>) });
        }

        await syncPayrollFromServer(tenantId);
        onPaymentComplete();
        onClose();
      }
    } catch (e: any) {
      setError(e?.message || 'Payment failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const employeeName = employee?.name ?? '—';
  const runLabel = run ? `${run.month} ${run.year}` : '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Banknote className="text-emerald-600" size={24} />
            <h2 className="text-lg font-bold text-slate-900">Pay Salary</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
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
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
              {paidSoFar > 0 && (
                <p className="text-xs text-slate-500 mb-1">
                  Paid so far: {paidSoFar.toLocaleString()} · Remaining: {remainingAmount.toLocaleString()}
                </p>
              )}
              <input
                type="number"
                min="0"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder={String(remainingAmount)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bank account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
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
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !amount || !accountId || parseFloat(amount) <= 0}
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
