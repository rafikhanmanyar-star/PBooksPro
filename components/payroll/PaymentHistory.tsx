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
  FileCheck
} from 'lucide-react';
import { storageService } from './services/storageService';
import { PayrollRun, PayrollStatus } from './types';
import { useAuth } from '../../context/AuthContext';

const PaymentHistory: React.FC = () => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || '';
  
  const [history, setHistory] = useState<PayrollRun[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterYear, setFilterYear] = useState<string>('All');
  const [isExporting, setIsExporting] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<PayrollRun | null>(null);

  useEffect(() => {
    if (tenantId) {
      const runs = storageService.getPayrollRuns(tenantId).filter(r => r.status === PayrollStatus.PAID);
      setHistory(runs);
    }
  }, [tenantId]);

  const years = useMemo(() => {
    const uniqueYears = [...new Set(history.map(run => run.year.toString()))];
    return ['All', ...uniqueYears.sort((a, b) => parseInt(b) - parseInt(a))];
  }, [history]);

  const filteredHistory = useMemo(() => {
    return history.filter(run => {
      const matchesSearch = run.month.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           run.year.toString().includes(searchTerm);
      const matchesYear = filterYear === 'All' || run.year.toString() === filterYear;
      return matchesSearch && matchesYear;
    });
  }, [history, searchTerm, filterYear]);

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

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-400 font-bold">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><History size={24} /></div>
            Disbursement Ledger
          </h1>
          <p className="text-slate-500 text-sm font-medium">Historical archive of all completed payment cycles.</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Filters */}
        <div className="p-6 border-b border-slate-100 flex flex-col xl:flex-row gap-4 justify-between items-center bg-slate-50/30 no-print">
          <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search by month or year..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 ring-blue-500/20" 
              />
            </div>
            <select 
              value={filterYear} 
              onChange={(e) => setFilterYear(e.target.value)}
              className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none"
            >
              {years.map(y => (
                <option key={y} value={y}>{y === 'All' ? 'All Years' : y}</option>
              ))}
            </select>
          </div>
          <button 
            disabled={isExporting} 
            onClick={handleExportCSV} 
            className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 shadow-lg disabled:opacity-50"
          >
            {isExporting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FileText size={14} />} 
            Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto print-full">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
                <th className="px-8 py-5">Period</th>
                <th className="px-8 py-5">Transaction ID</th>
                <th className="px-8 py-5">Headcount</th>
                <th className="px-8 py-5">Net Disbursement</th>
                <th className="px-8 py-5">Verification</th>
                <th className="px-8 py-5 text-right no-print">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.length > 0 ? (
                filteredHistory.map((run) => (
                  <tr key={run.id} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-5">
                      <div className="font-bold text-slate-900">{run.month} {run.year}</div>
                    </td>
                    <td className="px-8 py-5">
                      <code className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        TXN-{run.id.split('-')[1]}
                      </code>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-bold text-slate-700">{run.employee_count} Employees</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="font-black text-slate-900">PKR {run.total_amount.toLocaleString()}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase tracking-widest border border-emerald-100">
                        <BadgeCheck size={12} /> Confirmed
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right no-print">
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
