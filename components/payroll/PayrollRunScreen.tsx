/**
 * PayrollRunScreen - Manage payroll cycles and process payroll
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  Lock, 
  PlayCircle, 
  Calculator,
  ShieldCheck,
  Loader2,
  Eye,
  Search,
  Printer,
  ArrowLeft,
  Wallet
} from 'lucide-react';
import { 
  PayrollStatus, 
  EmploymentStatus, 
  PayrollRun, 
  PayrollEmployee,
  Payslip
} from './types';
import { storageService } from './services/storageService';
import { payrollApi } from '../../services/api/payrollApi';
import PayslipModal from './modals/PayslipModal';
import { useAuth } from '../../context/AuthContext';

const PayrollRunScreen: React.FC = () => {
  const { user, tenant } = useAuth();
  const tenantId = tenant?.id || '';
  const userId = user?.id || '';

  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [activeEmployees, setActiveEmployees] = useState<PayrollEmployee[]>([]);
  
  const [selectedRunDetail, setSelectedRunDetail] = useState<PayrollRun | null>(null);
  const [selectedEmployeeForPayslip, setSelectedEmployeeForPayslip] = useState<PayrollEmployee | null>(null);
  const [payslipsForRun, setPayslipsForRun] = useState<Payslip[]>([]);
  const [loadingPayslips, setLoadingPayslips] = useState(false);

  const [newRunData, setNewRunData] = useState({
    month: 'January',
    year: new Date().getFullYear()
  });

  const refreshRuns = async () => {
    if (!tenantId) return;
    
    try {
      // Fetch payroll runs from API first
      const apiRuns = await payrollApi.getPayrollRuns();
      if (apiRuns.length > 0) {
        setRuns(apiRuns);
      } else {
        // Fallback to localStorage
        setRuns(storageService.getPayrollRuns(tenantId));
      }
    } catch (error) {
      console.warn('Failed to fetch payroll runs from API:', error);
      setRuns(storageService.getPayrollRuns(tenantId));
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (!tenantId) return;
      
      await refreshRuns();
      
      // Load employees from API first
      try {
        const apiEmployees = await payrollApi.getEmployees();
        if (apiEmployees.length > 0) {
          setActiveEmployees(apiEmployees.filter(e => e.status === EmploymentStatus.ACTIVE));
        } else {
          const employees = storageService.getEmployees(tenantId);
          setActiveEmployees(employees.filter(e => e.status === EmploymentStatus.ACTIVE));
        }
      } catch (error) {
        console.warn('Failed to fetch employees from API:', error);
        const employees = storageService.getEmployees(tenantId);
        setActiveEmployees(employees.filter(e => e.status === EmploymentStatus.ACTIVE));
      }
    };
    
    loadData();
  }, [tenantId]);

  const calculatePayrollTotals = () => {
    let total = 0;
    activeEmployees.forEach(emp => {
      const basic = emp.salary.basic;
      const allowances = emp.salary.allowances.reduce((acc, curr) => {
        return acc + (curr.is_percentage ? (basic * curr.amount) / 100 : curr.amount);
      }, 0);
      const earningsAdjustments = (emp.adjustments || [])
        .filter(a => a.type === 'EARNING')
        .reduce((acc, curr) => acc + curr.amount, 0);
      const gross = basic + allowances + earningsAdjustments;
      const standardGross = basic + allowances;
      const deductions = emp.salary.deductions.reduce((acc, curr) => {
        return acc + (curr.is_percentage ? (standardGross * curr.amount) / 100 : curr.amount);
      }, 0);
      const deductionAdjustments = (emp.adjustments || [])
        .filter(a => a.type === 'DEDUCTION')
        .reduce((acc, curr) => acc + curr.amount, 0);
      total += (gross - deductions - deductionAdjustments);
    });
    return total;
  };

  const handleStartRun = async () => {
    if (!tenantId || !userId) return;
    setCalculating(true);
    
    try {
      // Create payroll run via API
      const newRun = await payrollApi.createPayrollRun({
        month: newRunData.month,
        year: newRunData.year
      });
      
      if (newRun) {
        // Process payroll to generate payslips
        await payrollApi.processPayrollRun(newRun.id);
        
        // Also cache in localStorage
        storageService.addPayrollRun(tenantId, newRun, userId);
      } else {
        // Fallback to localStorage only
        const totalAmount = calculatePayrollTotals();
        const localRun: PayrollRun = {
          id: `run-${Date.now()}`,
          tenant_id: tenantId,
          month: newRunData.month,
          year: newRunData.year,
          status: PayrollStatus.DRAFT,
          total_amount: totalAmount,
          employee_count: activeEmployees.length,
          created_by: userId,
        };
        storageService.addPayrollRun(tenantId, localRun, userId);
      }
    } catch (error) {
      console.error('Failed to create payroll run via API:', error);
      // Fallback to localStorage only
      const totalAmount = calculatePayrollTotals();
      const localRun: PayrollRun = {
        id: `run-${Date.now()}`,
        tenant_id: tenantId,
        month: newRunData.month,
        year: newRunData.year,
        status: PayrollStatus.DRAFT,
        total_amount: totalAmount,
        employee_count: activeEmployees.length,
        created_by: userId,
      };
      storageService.addPayrollRun(tenantId, localRun, userId);
    }
    
    setCalculating(false);
    setIsCreating(false);
    await refreshRuns();
  };

  // Handle viewing run detail and fetching payslips
  const handleViewRunDetail = async (run: PayrollRun) => {
    setSelectedRunDetail(run);
    setLoadingPayslips(true);
    
    try {
      const payslips = await payrollApi.getPayslipsByRun(run.id);
      setPayslipsForRun(payslips);
    } catch (error) {
      console.error('Failed to fetch payslips:', error);
      setPayslipsForRun([]);
    } finally {
      setLoadingPayslips(false);
    }
  };

  // Get payslip for specific employee in current run
  const getPayslipForEmployee = (employeeId: string): Payslip | undefined => {
    return payslipsForRun.find(p => p.employee_id === employeeId);
  };

  // Refresh payslips after payment
  const handlePayslipPaymentComplete = async () => {
    if (selectedRunDetail) {
      const payslips = await payrollApi.getPayslipsByRun(selectedRunDetail.id);
      setPayslipsForRun(payslips);
    }
  };

  const handleUpdateStatus = async (run: PayrollRun, nextStatus: PayrollStatus) => {
    if (!tenantId || !userId) return;
    
    try {
      // Update status via API
      const updatedRun = await payrollApi.updatePayrollRun(run.id, { 
        status: nextStatus,
        total_amount: run.total_amount
      });
      
      if (updatedRun) {
        // Also update localStorage cache
        storageService.updatePayrollRun(tenantId, updatedRun, userId);
        if (selectedRunDetail?.id === run.id) {
          setSelectedRunDetail(updatedRun);
        }
      } else {
        // Fallback
        const localUpdatedRun = { ...run, status: nextStatus };
        storageService.updatePayrollRun(tenantId, localUpdatedRun, userId);
        if (selectedRunDetail?.id === run.id) {
          setSelectedRunDetail(localUpdatedRun);
        }
      }
    } catch (error) {
      console.error('Failed to update payroll run status via API:', error);
      // Fallback to localStorage only
      const localUpdatedRun = { ...run, status: nextStatus };
      storageService.updatePayrollRun(tenantId, localUpdatedRun, userId);
      if (selectedRunDetail?.id === run.id) {
        setSelectedRunDetail(localUpdatedRun);
      }
    }
    
    await refreshRuns();
  };

  const getStatusBadge = (status: PayrollStatus) => {
    switch (status) {
      case PayrollStatus.PAID:
        return <span className="flex items-center gap-1 text-green-700 bg-green-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"><CheckCircle2 size={12}/> Paid</span>;
      case PayrollStatus.APPROVED:
        return <span className="flex items-center gap-1 text-blue-700 bg-blue-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"><CheckCircle2 size={12}/> Approved</span>;
      case PayrollStatus.DRAFT:
        return <span className="flex items-center gap-1 text-slate-600 bg-slate-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"><Clock size={12}/> Draft</span>;
      case PayrollStatus.PROCESSING:
        return <span className="flex items-center gap-1 text-amber-600 bg-amber-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"><Loader2 size={12} className="animate-spin"/> Processing</span>;
      case PayrollStatus.CANCELLED:
        return <span className="flex items-center gap-1 text-red-600 bg-red-100 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"><Lock size={12}/> Cancelled</span>;
      default: 
        return null;
    }
  };

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-400 font-bold">Loading...</p>
      </div>
    );
  }

  // Create new payroll run view
  if (isCreating) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <button onClick={() => setIsCreating(false)} className="text-blue-600 hover:underline flex items-center gap-1 font-bold group">
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Back to History
          </button>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Initiate Payroll Run</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Calculator size={20} className="text-blue-600" /> Cycle Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Target Month</label>
                <select 
                  value={newRunData.month} 
                  onChange={e => setNewRunData({...newRunData, month: e.target.value})} 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold"
                >
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Fiscal Year</label>
                <select 
                  value={newRunData.year} 
                  onChange={e => setNewRunData({...newRunData, year: parseInt(e.target.value)})} 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold"
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-xl space-y-6 relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <ShieldCheck size={20} className="text-emerald-400" /> Workforce Audit
              </h3>
              <div className="mt-6 space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-slate-400 font-medium">Active Headcount</span>
                  <span className="text-xl font-black">{activeEmployees.length}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-white/10">
                  <span className="text-slate-400 font-medium">Estimated Net Payout</span>
                  <span className="text-xl font-black text-emerald-400">PKR {calculatePayrollTotals().toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-center pt-8">
          <button 
            disabled={calculating} 
            onClick={handleStartRun} 
            className="px-12 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-2xl shadow-blue-200 hover:bg-blue-700 hover:-translate-y-1 transition-all disabled:opacity-50 flex items-center gap-3"
          >
            {calculating ? (
              <><Loader2 size={24} className="animate-spin" /> Calculating Cycle...</>
            ) : (
              <><PlayCircle size={24} /> Generate Draft Payroll</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // View payroll run detail
  if (selectedRunDetail) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between no-print">
          <button onClick={() => setSelectedRunDetail(null)} className="text-blue-600 hover:underline flex items-center gap-1 font-bold group">
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Back to Cycles
          </button>
          <div className="text-right">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{selectedRunDetail.month} {selectedRunDetail.year} Details</h1>
            <div className="mt-2">{getStatusBadge(selectedRunDetail.status)}</div>
          </div>
        </div>

        {/* Status Action Buttons */}
        {selectedRunDetail.status !== PayrollStatus.PAID && selectedRunDetail.status !== PayrollStatus.CANCELLED && (
          <div className="flex gap-3 justify-end no-print">
            {selectedRunDetail.status === PayrollStatus.DRAFT && (
              <button 
                onClick={() => handleUpdateStatus(selectedRunDetail, PayrollStatus.APPROVED)}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-all"
              >
                Approve Payroll
              </button>
            )}
            {selectedRunDetail.status === PayrollStatus.APPROVED && (
              <button 
                onClick={() => handleUpdateStatus(selectedRunDetail, PayrollStatus.PAID)}
                className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 transition-all"
              >
                Mark as Paid
              </button>
            )}
          </div>
        )}

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden print-full">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 no-print">
            <div className="flex items-center gap-4 bg-white px-4 py-2.5 rounded-xl border border-slate-200 w-full max-w-md">
              <Search size={18} className="text-slate-400" />
              <input type="text" placeholder="Search employees in this run..." className="bg-transparent outline-none text-sm w-full font-medium" />
            </div>
            <button onClick={() => window.print()} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-800 transition-all">
              <Printer size={14} /> Print Batch
            </button>
          </div>
          {loadingPayslips ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-blue-600" />
              <span className="ml-2 text-slate-500 font-medium">Loading payslips...</span>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-8 py-4">Employee</th>
                  <th className="px-8 py-4">Department</th>
                  <th className="px-8 py-4">Net Pay</th>
                  <th className="px-8 py-4">Payment Status</th>
                  <th className="px-8 py-4 text-right no-print">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeEmployees.map(emp => {
                  const payslip = getPayslipForEmployee(emp.id);
                  const isPaid = payslip?.is_paid || false;
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-8 py-4">
                        <div className="font-bold text-slate-900">{emp.name}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{emp.employee_code || emp.id.substring(0, 8)}</div>
                      </td>
                      <td className="px-8 py-4 text-sm font-medium text-slate-600">{emp.department}</td>
                      <td className="px-8 py-4">
                        <span className="font-bold text-slate-900">
                          PKR {payslip?.net_pay?.toLocaleString() || '—'}
                        </span>
                      </td>
                      <td className="px-8 py-4">
                        {isPaid ? (
                          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 bg-green-50 text-green-600 rounded border border-green-100 flex items-center gap-1 w-fit">
                            <CheckCircle2 size={10} /> Paid
                          </span>
                        ) : payslip ? (
                          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 bg-amber-50 text-amber-600 rounded border border-amber-100">
                            Pending
                          </span>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 bg-slate-50 text-slate-400 rounded border border-slate-100">
                            Not Generated
                          </span>
                        )}
                      </td>
                      <td className="px-8 py-4 text-right no-print">
                        <button 
                          onClick={() => setSelectedEmployeeForPayslip(emp)} 
                          className={`font-black text-xs uppercase tracking-widest flex items-center gap-2 ml-auto px-3 py-1.5 rounded-lg transition-all ${
                            isPaid 
                              ? 'text-slate-600 hover:bg-slate-100' 
                              : 'text-blue-600 hover:bg-blue-50'
                          }`}
                        >
                          <Eye size={14} /> {isPaid ? 'View' : 'View / Pay'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {selectedEmployeeForPayslip && selectedRunDetail && (
          <PayslipModal 
            isOpen={!!selectedEmployeeForPayslip} 
            onClose={() => setSelectedEmployeeForPayslip(null)} 
            employee={selectedEmployeeForPayslip} 
            run={selectedRunDetail}
            payslipData={getPayslipForEmployee(selectedEmployeeForPayslip.id)}
            onPaymentComplete={handlePayslipPaymentComplete}
          />
        )}
      </div>
    );
  }

  // Main list view
  return (
    <div className="space-y-4 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Payroll Cycles</h1>
          <p className="text-slate-500 text-xs sm:text-sm">Review, approve and disburse monthly workforce compensation.</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)} 
          className="bg-blue-600 text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-black hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-100 text-sm"
        >
          <PlayCircle size={20} /> Run New Payroll
        </button>
      </div>

      {/* Mobile Cards */}
      <div className="block md:hidden space-y-3">
        {runs.length > 0 ? (
          runs.map((run) => (
            <div 
              key={run.id} 
              className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm"
              onClick={() => handleViewRunDetail(run)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-black text-slate-900 tracking-tight">{run.month} {run.year}</div>
                  <div className="text-[10px] text-slate-400 font-bold">ID: {run.id}</div>
                </div>
                {getStatusBadge(run.status)}
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-500">{run.employee_count} Members</div>
                <div className="font-black text-slate-900 text-sm">
                  {run.total_amount > 0 ? `PKR ${run.total_amount.toLocaleString()}` : '—'}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-12 text-center text-slate-400 font-medium text-sm">
            No payroll cycles yet. Click "Run New Payroll" to get started.
          </div>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 lg:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Payroll Period</th>
                <th className="px-6 lg:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Headcount</th>
                <th className="px-6 lg:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Amount</th>
                <th className="px-6 lg:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Status</th>
                <th className="px-6 lg:px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.length > 0 ? (
                runs.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 lg:px-8 py-5">
                      <div className="font-black text-slate-900 tracking-tight">{run.month} {run.year}</div>
                      <div className="text-[10px] text-slate-400 font-bold">ID: {run.id}</div>
                    </td>
                    <td className="px-6 lg:px-8 py-5 text-slate-600 font-bold">{run.employee_count} Members</td>
                    <td className="px-6 lg:px-8 py-5 font-black text-slate-900">
                      {run.total_amount > 0 ? `PKR ${run.total_amount.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-6 lg:px-8 py-5">{getStatusBadge(run.status)}</td>
                    <td className="px-6 lg:px-8 py-5 text-right">
                      <button 
                        onClick={() => handleViewRunDetail(run)} 
                        className="px-4 py-2 text-xs font-black bg-slate-100 text-slate-900 rounded-xl hover:bg-slate-200 transition-all flex items-center gap-2 ml-auto"
                      >
                        <Eye size={14} /> View Batch
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center text-slate-400 font-medium">
                    No payroll cycles yet. Click "Run New Payroll" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PayrollRunScreen;
