/**
 * PaymentHistory - Historical archive of completed payment cycles
 * Uses storage only (runs marked PAID from Payroll Cycle pay flow). No test/demo data.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  History, 
  Search, 
  FileText, 
  ExternalLink, 
  BadgeCheck,
  X,
  Printer,
  FileCheck,
  Loader2
} from 'lucide-react';
import { storageService } from './services/storageService';
import { PayrollRun, PayrollStatus } from './types';
import { useAuth } from '../../context/AuthContext';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { payrollApi } from '../../services/api/payrollApi';
import { syncPayrollFromServer } from './services/payrollSync';
import { usePayrollContext } from '../../context/PayrollContext';
import { usePrintContext } from '../../context/PrintContext';
import { formatCurrency } from './utils/formatters';
import { toLocalDateString } from '../../utils/dateUtils';

function formatPaidAt(paidAt: string | undefined): string {
  if (!paidAt) return '—';
  try {
    const d = new Date(paidAt);
    return isNaN(d.getTime()) ? paidAt : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return paidAt;
  }
}

const PaymentHistory: React.FC = () => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || '';
  
  const {
    historySearchTerm,
    setHistorySearchTerm,
    historyFilterYear,
    setHistoryFilterYear,
    selectedBatch,
    setSelectedBatch,
    activeSubTab,
  } = usePayrollContext();
  const { print: triggerPrint } = usePrintContext();

  const [history, setHistory] = useState<PayrollRun[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }
    if (activeSubTab !== 'history') return;
    setIsLoading(true);
    const load = async () => {
      try {
        if (!isLocalOnlyMode()) {
          await syncPayrollFromServer(tenantId);
        }
        storageService.init(tenantId);
        const allPaid = storageService.getPayrollRuns(tenantId).filter(r => r.status === PayrollStatus.PAID);
        const emptyRunIds = allPaid.filter(r => r.employee_count === 0 || (r.total_amount ?? 0) === 0).map(r => r.id);
        if (isLocalOnlyMode()) {
          emptyRunIds.forEach(id => storageService.deletePayrollRun(tenantId, id));
        } else {
          for (const runId of emptyRunIds) {
            await payrollApi.deletePayrollRun(runId);
          }
          if (emptyRunIds.length > 0) await syncPayrollFromServer(tenantId);
        }
        const runs = storageService
          .getPayrollRuns(tenantId)
          .filter(r => r.status === PayrollStatus.PAID && r.employee_count > 0 && (r.total_amount ?? 0) > 0);
        setHistory(runs);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [tenantId, activeSubTab]);

  const years = useMemo(() => {
    const uniqueYears = [...new Set(history.map(run => run.year.toString()))];
    return ['All', ...uniqueYears.sort((a, b) => parseInt(b) - parseInt(a))];
  }, [history]);

  const filteredHistory = useMemo(() => {
    return history.filter(run => {
      const matchesSearch = run.month.toLowerCase().includes(historySearchTerm.toLowerCase()) || 
                           run.year.toString().includes(historySearchTerm);
      const matchesYear = historyFilterYear === 'All' || run.year.toString() === historyFilterYear;
      return matchesSearch && matchesYear;
    });
  }, [history, historySearchTerm, historyFilterYear]);

  const handleExportCSV = () => {
    setIsExporting(true);
    setTimeout(() => {
      const headers = ['Period', 'Year', 'Transaction ID', 'Employee Count', 'Amount (PKR)', 'Status'];
      const rows = filteredHistory.map(run => [
        run.month, 
        run.year, 
        `TXN-${run.id.split('-')[1]}`, 
        run.employee_count, 
        run.total_amount, 
        run.status
      ]);

      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `Disbursement_Ledger_${toLocalDateString(new Date())}.csv`);
      link.click();
      setIsExporting(false);
    }, 800);
  };

  if (!tenantId || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={32} className="text-primary animate-spin" />
        <p className="text-app-muted font-bold">Loading payment history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-app-text tracking-tight flex items-center gap-3">
            <div className="p-2 bg-ds-warning/15 text-ds-warning rounded-xl hidden sm:block"><History size={24} /></div>
            Disbursement Ledger
          </h1>
          <p className="text-app-muted text-xs sm:text-sm font-medium">Historical archive of all completed payment cycles.</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-app-card rounded-2xl sm:rounded-3xl border border-app-border shadow-ds-card overflow-hidden">
        {/* Filters */}
        <div className="p-4 sm:p-6 border-b border-app-border flex flex-col gap-3 sm:gap-4 bg-app-toolbar/30 no-print">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-app-muted" size={16} />
              <input 
                type="text" 
                placeholder="Search by month or year..." 
                value={historySearchTerm} 
                onChange={(e) => setHistorySearchTerm(e.target.value)} 
                className="ds-input-field w-full pl-10 pr-4 py-2.5 rounded-xl text-sm font-medium" 
              />
            </div>
            <div className="flex gap-3">
              <select
                value={historyFilterYear}
                onChange={(e) => setHistoryFilterYear(e.target.value)}
                className="ds-input-field flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-medium outline-none"
                aria-label="Filter by year"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y === 'All' ? 'All Years' : y}</option>
                ))}
              </select>
              <button 
                disabled={isExporting} 
                onClick={handleExportCSV} 
                className="px-4 sm:px-6 py-2.5 bg-primary text-ds-on-primary rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 shadow-ds-card disabled:opacity-50 shrink-0"
              >
                {isExporting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FileText size={14} />} 
                <span className="hidden sm:inline">Export CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="block md:hidden p-4 space-y-3">
          {filteredHistory.length > 0 ? (
            filteredHistory.map((run) => (
              <div 
                key={run.id} 
                className="bg-app-toolbar/40 rounded-xl border border-app-border p-4"
                onClick={() => setSelectedBatch(run)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-app-text">{run.month} {run.year}</div>
                    <div className="text-[10px] text-app-muted">Paid {formatPaidAt(run.paid_at)}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[9px] font-black text-ds-success bg-ds-success/10 px-1.5 py-0.5 rounded uppercase tracking-widest border border-ds-success/20">
                    <BadgeCheck size={10} /> Paid
                  </span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-app-border">
                  <span className="text-xs text-app-muted">{run.employee_count} employees</span>
                  <span className="font-black text-app-text text-sm">PKR {formatCurrency(run.total_amount)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-slate-400 font-medium text-sm">
              {historySearchTerm || historyFilterYear !== 'All' 
                ? 'No matching payment records found.'
                : 'No completed payment cycles yet.'}
            </div>
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto print-full">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-app-toolbar/40 text-[10px] font-black text-app-muted uppercase tracking-[0.15em]">
                <th className="px-6 lg:px-8 py-5">Period</th>
                <th className="px-6 lg:px-8 py-5">Paid on</th>
                <th className="px-6 lg:px-8 py-5">Headcount</th>
                <th className="px-6 lg:px-8 py-5">Net disbursement</th>
                <th className="px-6 lg:px-8 py-5">Status</th>
                <th className="px-6 lg:px-8 py-5 text-right no-print">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {filteredHistory.length > 0 ? (
                filteredHistory.map((run) => (
                  <tr key={run.id} className="group hover:bg-app-toolbar/30 transition-colors">
                    <td className="px-6 lg:px-8 py-5">
                      <div className="font-bold text-app-text">{run.month} {run.year}</div>
                    </td>
                    <td className="px-6 lg:px-8 py-5 text-app-muted text-sm">
                      {formatPaidAt(run.paid_at)}
                    </td>
                    <td className="px-6 lg:px-8 py-5">
                      <span className="text-sm font-bold text-app-text">{run.employee_count} employees</span>
                    </td>
                    <td className="px-6 lg:px-8 py-5">
                      <span className="font-black text-app-text">PKR {formatCurrency(run.total_amount)}</span>
                    </td>
                    <td className="px-6 lg:px-8 py-5">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-ds-success bg-ds-success/10 px-2 py-1 rounded-lg uppercase tracking-widest border border-ds-success/20">
                        <BadgeCheck size={12} /> Paid
                      </span>
                    </td>
                    <td className="px-6 lg:px-8 py-5 text-right no-print">
                      <button 
                        onClick={() => setSelectedBatch(run)} 
                        className="p-2 text-app-muted hover:text-primary transition-colors"
                        aria-label="View batch"
                      >
                        <ExternalLink size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center text-app-muted font-medium">
                    {historySearchTerm || historyFilterYear !== 'All' 
                      ? 'No matching payment records found.'
                      : 'No completed payment cycles yet. Pay salary from the Payroll Cycle tab.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch Detail Modal */}
      {selectedBatch && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 no-print-backdrop">
          <div className="bg-app-card w-full max-w-xl rounded-3xl shadow-ds-modal overflow-hidden animate-in zoom-in-95 duration-200 border border-app-border">
            <div className="px-8 py-6 bg-app-toolbar/40 border-b border-app-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/15 text-primary rounded-xl"><FileCheck size={20} /></div>
                <h3 className="font-bold text-xl text-app-text">Payment summary</h3>
              </div>
              <button onClick={() => setSelectedBatch(null)} className="p-2 hover:bg-app-toolbar rounded-lg text-app-muted transition-colors" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-8">
              <div id="payment-history-printable-area" className="printable-area bg-slate-900 rounded-2xl p-6 text-white space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-white/10">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Period</span>
                  <span className="text-lg font-black">{selectedBatch.month} {selectedBatch.year}</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-white/10">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Paid on</span>
                  <span className="text-lg font-black">{formatPaidAt(selectedBatch.paid_at)}</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-white/10">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total payout</span>
                  <span className="text-2xl font-black">PKR {formatCurrency(selectedBatch.total_amount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Employees paid</span>
                  <span className="text-lg font-black">{selectedBatch.employee_count}</span>
                </div>
              </div>
              <button 
                onClick={() => triggerPrint('REPORT', { elementId: 'payment-history-printable-area' })} 
                className="w-full py-4 bg-app-card border border-app-border text-app-text font-bold rounded-2xl hover:bg-app-toolbar flex items-center justify-center gap-2"
              >
                <Printer size={18} /> Print record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentHistory;
