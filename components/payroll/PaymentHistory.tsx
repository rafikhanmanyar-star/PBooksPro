/**
 * PaymentHistory - Historical archive of completed payment cycles
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
import { payrollApi } from '../../services/api/payrollApi';
import { PayrollRun, PayrollStatus } from './types';
import { useAuth } from '../../context/AuthContext';
import { usePayrollContext } from '../../context/PayrollContext';

const PaymentHistory: React.FC = () => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || '';
  
  // Use PayrollContext for preserving state across navigation
  const {
    historySearchTerm,
    setHistorySearchTerm,
    historyFilterYear,
    setHistoryFilterYear,
    selectedBatch,
    setSelectedBatch,
  } = usePayrollContext();
  
  const [history, setHistory] = useState<PayrollRun[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!tenantId) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      try {
        // Fetch from cloud API first
        const apiRuns = await payrollApi.getPayrollRuns();
        if (apiRuns.length > 0) {
          setHistory(apiRuns.filter(r => r.status === PayrollStatus.PAID));
        } else {
          // Fallback to localStorage
          const runs = storageService.getPayrollRuns(tenantId).filter(r => r.status === PayrollStatus.PAID);
          setHistory(runs);
        }
      } catch (error) {
        console.warn('Failed to fetch payment history from API:', error);
        // Fallback to localStorage
        const runs = storageService.getPayrollRuns(tenantId).filter(r => r.status === PayrollStatus.PAID);
        setHistory(runs);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchHistory();
  }, [tenantId]);

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
      link.setAttribute("download", `Disbursement_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
      link.click();
      setIsExporting(false);
    }, 800);
  };

  if (!tenantId || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={32} className="text-amber-600 animate-spin" />
        <p className="text-slate-400 font-bold">Loading payment history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-xl hidden sm:block"><History size={24} /></div>
            Disbursement Ledger
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm font-medium">Historical archive of all completed payment cycles.</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Filters */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col gap-3 sm:gap-4 bg-slate-50/30 no-print">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search by month or year..." 
                value={historySearchTerm} 
                onChange={(e) => setHistorySearchTerm(e.target.value)} 
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 ring-blue-500/20" 
              />
            </div>
            <div className="flex gap-3">
              <select 
                value={historyFilterYear} 
                onChange={(e) => setHistoryFilterYear(e.target.value)}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y === 'All' ? 'All Years' : y}</option>
                ))}
              </select>
              <button 
                disabled={isExporting} 
                onClick={handleExportCSV} 
                className="px-4 sm:px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 shadow-lg disabled:opacity-50 shrink-0"
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
                className="bg-slate-50/50 rounded-xl border border-slate-100 p-4"
                onClick={() => setSelectedBatch(run)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-slate-900">{run.month} {run.year}</div>
                    <code className="text-[10px] font-mono text-slate-400">TXN-{run.id.split('-')[1]}</code>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded uppercase tracking-widest border border-emerald-100">
                    <BadgeCheck size={10} /> Confirmed
                  </span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="text-xs text-slate-500">{run.employee_count} Employees</span>
                  <span className="font-black text-slate-900 text-sm">PKR {run.total_amount.toLocaleString()}</span>
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
              <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                <th className="px-6 lg:px-8 py-5">Period</th>
                <th className="px-6 lg:px-8 py-5">Transaction ID</th>
                <th className="px-6 lg:px-8 py-5">Headcount</th>
                <th className="px-6 lg:px-8 py-5">Net Disbursement</th>
                <th className="px-6 lg:px-8 py-5">Verification</th>
                <th className="px-6 lg:px-8 py-5 text-right no-print">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.length > 0 ? (
                filteredHistory.map((run) => (
                  <tr key={run.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 lg:px-8 py-5">
                      <div className="font-bold text-slate-900">{run.month} {run.year}</div>
                    </td>
                    <td className="px-6 lg:px-8 py-5">
                      <code className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        TXN-{run.id.split('-')[1]}
                      </code>
                    </td>
                    <td className="px-6 lg:px-8 py-5">
                      <span className="text-sm font-bold text-slate-700">{run.employee_count} Employees</span>
                    </td>
                    <td className="px-6 lg:px-8 py-5">
                      <span className="font-black text-slate-900">PKR {run.total_amount.toLocaleString()}</span>
                    </td>
                    <td className="px-6 lg:px-8 py-5">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase tracking-widest border border-emerald-100">
                        <BadgeCheck size={12} /> Confirmed
                      </span>
                    </td>
                    <td className="px-6 lg:px-8 py-5 text-right no-print">
                      <button 
                        onClick={() => setSelectedBatch(run)} 
                        className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <ExternalLink size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center text-slate-400 font-medium">
                    {searchTerm || filterYear !== 'All' 
                      ? 'No matching payment records found.'
                      : 'No completed payment cycles yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch Detail Modal */}
      {selectedBatch && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 no-print-backdrop">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><FileCheck size={20} /></div>
                <h3 className="font-bold text-xl text-slate-900">Batch Summary</h3>
              </div>
              <button onClick={() => setSelectedBatch(null)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-8 space-y-8">
              <div className="bg-slate-900 rounded-2xl p-6 text-white space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-white/10">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Period</span>
                  <span className="text-lg font-black">{selectedBatch.month} {selectedBatch.year}</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-white/10">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Payout</span>
                  <span className="text-2xl font-black">PKR {selectedBatch.total_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-white/10">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Employees Paid</span>
                  <span className="text-lg font-black">{selectedBatch.employee_count}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Transaction ID</span>
                  <code className="text-sm font-mono bg-white/10 px-2 py-1 rounded">TXN-{selectedBatch.id.split('-')[1]}</code>
                </div>
              </div>
              <button 
                onClick={() => window.print()} 
                className="w-full py-4 bg-white border border-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-50 flex items-center justify-center gap-2"
              >
                <Printer size={18} /> Print Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentHistory;
