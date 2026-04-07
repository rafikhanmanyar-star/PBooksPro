/**
 * BulkPayPayslipsModal - Pay multiple selected payslips in one go.
 * Each selected payslip has an editable amount so some can be fully paid and some partially.
 * Uses same account, date, and note for all.
 */

import React, { useState, useMemo, useEffect } from 'react';
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

export interface BulkPayItem {
  payslip: Payslip;
  employee: PayrollEmployee | null;
  run: PayrollRun | null;
}

interface BulkPayPayslipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentComplete: () => void;
  items: BulkPayItem[];
  tenantId: string;
  userId: string;
}

const BulkPayPayslipsModal: React.FC<BulkPayPayslipsModalProps> = ({
  isOpen,
  onClose,
  onPaymentComplete,
  items,
  tenantId,
  userId
}) => {
  const { state, dispatch } = useAppContext();
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => toLocalDateString(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-payslip amount to pay (editable); key = payslip.id, value = amount (0 to remaining)
  const [amountByPayslipId, setAmountByPayslipId] = useState<Record<string, string>>({});

  const bankAccounts = useMemo(() => {
    return (state.accounts || []).filter(
      (a: any) => a.type === 'Bank' || a.type === 'Cash' || a.type === 'bank' || a.type === 'cash'
    );
  }, [state.accounts]);

  const salaryCategory = useMemo(() => {
    const sid = resolveSystemCategoryId(state.categories, 'sys-cat-sal-exp');
    return (state.categories || []).find(
      (c: { id: string; name: string }) => (sid && c.id === sid) || c.name === 'Salary Expenses'
    );
  }, [state.categories]);

  // Initialize editable amounts to remaining when modal opens or items change
  useEffect(() => {
    if (isOpen && items.length > 0) {
      const next: Record<string, string> = {};
      items.forEach(({ payslip }) => {
        const rem = payslipRemainingAmount(payslip);
        next[payslip.id] = rem > 0 ? String(rem) : '0';
      });
      setAmountByPayslipId(next);
    }
  }, [isOpen, items]);

  const totalToPay = useMemo(() => {
    let sum = 0;
    items.forEach(({ payslip }) => {
      const rem = payslipRemainingAmount(payslip);
      if (rem <= 0) return;
      const raw = amountByPayslipId[payslip.id];
      const num = typeof raw === 'string' ? parseFloat(raw) : 0;
      if (!Number.isNaN(num) && num > 0) sum += Math.min(num, rem);
    });
    return Math.round(sum * 100) / 100;
  }, [items, amountByPayslipId]);

  const payAmountByPayslipId = useMemo(() => {
    const out: Record<string, number> = {};
    items.forEach(({ payslip }) => {
      const rem = payslipRemainingAmount(payslip);
      if (rem <= 0) {
        out[payslip.id] = 0;
        return;
      }
      const raw = amountByPayslipId[payslip.id];
      const num = typeof raw === 'string' ? parseFloat(raw) : 0;
      out[payslip.id] = Number.isNaN(num) || num <= 0 ? 0 : Math.min(num, rem);
    });
    return out;
  }, [items, amountByPayslipId]);

  const itemsWithPositivePay = useMemo(() => {
    return items.filter(({ payslip }) => payAmountByPayslipId[payslip.id] > 0);
  }, [items, payAmountByPayslipId]);

  const setAmountForPayslip = (payslipId: string, value: string) => {
    setAmountByPayslipId((prev) => ({ ...prev, [payslipId]: value }));
  };

  React.useEffect(() => {
    if (isOpen) {
      setAccountId('');
      setNote('');
      setPaymentDate(todayLocalYyyyMmDd());
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    if (!accountId) {
      setError('Please select a bank account.');
      return;
    }
    if (!salaryCategory) {
      setError('Salary expense category not found. Please contact support.');
      return;
    }
    if (totalToPay <= 0 || itemsWithPositivePay.length === 0) {
      setError('Enter at least one amount to pay.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      if (isLocalOnlyMode()) {
        const allTransactions: any[] = [];
        const timestamp = Date.now();

        for (let idx = 0; idx < items.length; idx++) {
          const { payslip, employee, run } = items[idx];
          const payAmount = payAmountByPayslipId[payslip.id] ?? 0;
          if (payAmount <= 0) continue;

          const periodLabel = run ? `${run.month} ${run.year}` : 'Payroll';
          const empName = employee?.name ?? payslip.employee_id;
          const description = note?.trim()
            ? `Salary - ${empName} - ${periodLabel}. ${note}`
            : `Salary - ${empName} - ${periodLabel}`;

          const { projects: snapP, buildings: snapB } = resolvePayslipAssignment(payslip, employee ?? undefined);
          const projectAllocs = snapP.length > 0
            ? snapP.map((p: any) => ({ type: 'project' as const, id: p.project_id, name: p.project_name || 'Unallocated', percentage: p.percentage }))
            : [];
          const buildingAllocs = snapB.length > 0
            ? snapB.map((b: any) => ({ type: 'building' as const, id: b.building_id, name: b.building_name || 'Unallocated', percentage: b.percentage }))
            : [];
          const allAllocs = [...projectAllocs, ...buildingAllocs];
          const totalPct = allAllocs.reduce((s: number, a: any) => s + a.percentage, 0);

          if (allAllocs.length > 0 && totalPct > 0) {
            for (let i = 0; i < allAllocs.length; i++) {
              const a = allAllocs[i];
              const pct = a.percentage / totalPct;
              const txAmount = Math.round(payAmount * pct * 100) / 100;
              if (txAmount <= 0) continue;
              const tx: any = {
                id: `pay-sal-${timestamp}-${idx}-${i}-${Math.random().toString(36).slice(2, 8)}`,
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
              allTransactions.push(tx);
            }
          } else {
            allTransactions.push({
              id: `pay-sal-${timestamp}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
              type: TransactionType.EXPENSE,
              amount: payAmount,
              date: paymentDate,
              description,
              accountId,
              categoryId: salaryCategory.id,
              payslipId: payslip.id
            });
          }

          const previousPaid = payslipDisplayPaidAmount(payslip);
          const newPaidTotal = Math.min(payslip.net_pay, previousPaid + payAmount);
          const isFullyPaid = newPaidTotal >= payslip.net_pay;
          const updatedPayslip: Payslip = {
            ...payslip,
            paid_amount: newPaidTotal,
            is_paid: isFullyPaid,
            paid_at: previousPaid === 0 ? paymentDate : (payslip.paid_at ?? paymentDate),
            transaction_id: allTransactions[allTransactions.length - 1]?.id,
            updated_at: new Date().toISOString()
          };
          storageService.updatePayslip(tenantId, updatedPayslip);

          const runPayslipsAfter = storageService.getPayslipsByRunId(tenantId, payslip.payroll_run_id);
          const allPaid = runPayslipsAfter.every((ps: Payslip) => ps.is_paid);
          if (allPaid && run) {
            const runs = storageService.getPayrollRuns(tenantId);
            const runToUpdate = runs.find((r: PayrollRun) => r.id === payslip.payroll_run_id);
            if (runToUpdate) {
              storageService.updatePayrollRun(tenantId, {
                ...runToUpdate,
                status: PayrollStatus.PAID,
                paid_at: paymentDate,
                updated_at: new Date().toISOString()
              }, userId);
            }
          }
        }

        if (allTransactions.length > 0) {
          dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: allTransactions });
        }

        onPaymentComplete();
        onClose();
      } else {
        const mapApiTx = (tx: Record<string, unknown>, fallbackDesc: string): Transaction => ({
          id: String(tx.id),
          type: (tx.type as Transaction['type']) || TransactionType.EXPENSE,
          amount: Number(tx.amount),
          date:
            typeof tx.date === 'string'
              ? tx.date.slice(0, 10)
              : String(tx.date ?? paymentDate).slice(0, 10),
          description: (tx.description as string) || fallbackDesc,
          accountId: String(tx.accountId ?? accountId),
          categoryId: (tx.categoryId as string) || salaryCategory!.id,
          projectId: tx.projectId as string | undefined,
          buildingId: tx.buildingId as string | undefined,
          payslipId: (tx.payslipId as string) || undefined,
          version: typeof tx.version === 'number' ? tx.version : undefined,
        });

        for (let idx = 0; idx < items.length; idx++) {
          const { payslip, employee, run } = items[idx];
          const payAmount = payAmountByPayslipId[payslip.id] ?? 0;
          if (payAmount <= 0) continue;

          const periodLabel = run ? `${run.month} ${run.year}` : 'Payroll';
          const empName = employee?.name ?? payslip.employee_id;
          const descriptionBase = note?.trim()
            ? `Salary - ${empName} - ${periodLabel}. ${note}`
            : `Salary - ${empName} - ${periodLabel}`;

          const { projects: snapPApi, buildings: snapBApi } = resolvePayslipAssignment(payslip, employee ?? undefined);
          const projectAllocs =
            snapPApi.length > 0
              ? snapPApi.map((p: { project_id: string; project_name?: string; percentage: number }) => ({
                  type: 'project' as const,
                  id: p.project_id,
                  name: p.project_name || 'Unallocated',
                  percentage: p.percentage,
                }))
              : [];
          const buildingAllocs =
            snapBApi.length > 0
              ? snapBApi.map((b: { building_id: string; building_name?: string; percentage: number }) => ({
                  type: 'building' as const,
                  id: b.building_id,
                  name: b.building_name || 'Unallocated',
                  percentage: b.percentage,
                }))
              : [];
          const allAllocs = [...projectAllocs, ...buildingAllocs];
          const totalPct = allAllocs.reduce((s: number, a: { percentage: number }) => s + a.percentage, 0);

          if (allAllocs.length > 0 && totalPct > 0) {
            for (let i = 0; i < allAllocs.length; i++) {
              const a = allAllocs[i];
              const pct = a.percentage / totalPct;
              const txAmount = Math.round(payAmount * pct * 100) / 100;
              if (txAmount <= 0) continue;
              const desc = allAllocs.length > 1 ? `${descriptionBase} (${a.name} ${a.percentage}%)` : descriptionBase;
              const res = await payrollApi.payPayslip(payslip.id, {
                accountId,
                categoryId: salaryCategory!.id,
                amount: txAmount,
                description: desc,
                date: paymentDate,
                projectId: a.type === 'project' ? a.id : undefined,
                buildingId: a.type === 'building' ? a.id : undefined,
              });
              if (!res?.success || !res.transaction) {
                setError(res?.error || `Payment failed for ${empName}.`);
                return;
              }
              dispatch({ type: 'ADD_TRANSACTION', payload: mapApiTx(res.transaction as Record<string, unknown>, desc) });
            }
          } else {
            const res = await payrollApi.payPayslip(payslip.id, {
              accountId,
              categoryId: salaryCategory!.id,
              amount: payAmount,
              description: descriptionBase,
              date: paymentDate,
            });
            if (!res?.success || !res.transaction) {
              setError(res?.error || `Payment failed for ${empName}.`);
              return;
            }
            dispatch({
              type: 'ADD_TRANSACTION',
              payload: mapApiTx(res.transaction as Record<string, unknown>, descriptionBase),
            });
          }
        }

        await syncPayrollFromServer(tenantId);
        onPaymentComplete();
        onClose();
      }
    } catch (e: any) {
      setError(e?.message || 'Bulk payment failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl shrink-0">
          <div className="flex items-center gap-2">
            <Banknote className="text-emerald-600" size={24} />
            <h2 className="text-lg font-bold text-slate-900">Bulk pay selected payslips</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-6 overflow-y-auto space-y-4 shrink-0">
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2 px-3 text-left">Employee</th>
                    <th className="py-2 px-3 text-left">Period</th>
                    <th className="py-2 px-3 text-right">Remaining</th>
                    <th className="py-2 px-3 text-right">Amount to pay</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ payslip, employee, run }) => {
                    const remaining = payslipRemainingAmount(payslip);
                    if (remaining <= 0) return null;
                    const name = employee?.name ?? payslip.employee_id;
                    const periodLabel = run ? `${run.month} ${run.year}` : '—';
                    const rawAmount = amountByPayslipId[payslip.id] ?? String(remaining);
                    const payAmount = payAmountByPayslipId[payslip.id] ?? 0;
                    const invalid = (() => {
                      const n = parseFloat(rawAmount);
                      return rawAmount !== '' && (Number.isNaN(n) || n < 0 || n > remaining);
                    })();
                    return (
                      <tr key={payslip.id} className="border-b border-slate-100">
                        <td className="py-2 px-3 font-medium text-slate-900">{name}</td>
                        <td className="py-2 px-3 text-slate-600">{periodLabel}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{remaining.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            min={0}
                            max={remaining}
                            step={0.01}
                            value={rawAmount}
                            onChange={(e) => setAmountForPayslip(payslip.id, e.target.value)}
                            className={`w-24 text-right border rounded-lg px-2 py-1.5 tabular-nums focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${invalid ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
                            title={`0 to ${remaining.toLocaleString()}`}
                            aria-label={`Amount to pay for ${name}, max ${remaining.toLocaleString()}`}
                          />
                          {invalid && (
                            <span className="block text-xs text-red-600 mt-0.5">0 – {remaining.toLocaleString()}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-sm font-bold text-slate-700">
              Total to pay: <span className="tabular-nums">{totalToPay.toLocaleString()}</span>
            </p>
            <div>
              <label htmlFor="bulk-pay-bank-account" className="block text-sm font-medium text-slate-700 mb-1">Bank account *</label>
              <select
                id="bulk-pay-bank-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                aria-label="Bank account"
              >
                <option value="">Select account</option>
                {bankAccounts.map((acc: any) => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <DatePicker
                id="bulk-pay-payment-date"
                label="Payment date"
                value={paymentDate}
                onChange={(d) => setPaymentDate(toLocalDateString(d))}
                className="!rounded-xl !border-slate-300"
              />
            </div>
            <div>
              <label htmlFor="bulk-pay-note" className="block text-sm font-medium text-slate-700 mb-1">Note (optional)</label>
              <textarea
                id="bulk-pay-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                placeholder="e.g. Bulk salary March 2025"
                aria-label="Note (optional)"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2">
                <AlertCircle size={18} />
                {error}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 p-6 border-t border-slate-200 shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !accountId || totalToPay <= 0 || itemsWithPositivePay.length === 0}
              className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={18} />}
              Pay {itemsWithPositivePay.length} payslip(s) — {totalToPay.toLocaleString()}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BulkPayPayslipsModal;
