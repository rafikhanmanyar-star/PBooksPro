/**
 * PayslipModal - View employee payslip for a specific payroll run
 */

import React, { useState, useEffect } from 'react';
import { X, Download, Printer, ShieldCheck, Building2, Plus, TrendingDown, Wallet, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { PayrollEmployee, PayrollRun, Payslip } from '../types';
import { payrollApi } from '../../../services/api/payrollApi';
import { useAuth } from '../../../context/AuthContext';
import { Account, Category, Project, TransactionType, AccountType } from '../../../types';
import { apiClient } from '../../../services/api/client';

interface PayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: PayrollEmployee;
  run: PayrollRun;
  payslipData?: Payslip | null;
  onPaymentComplete?: () => void;
}

const PayslipModal: React.FC<PayslipModalProps> = ({ isOpen, onClose, employee, run, payslipData, onPaymentComplete }) => {
  const { tenant } = useAuth();
  const companyName = tenant?.companyName || tenant?.name || 'Organization';

  // Payment state
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(payslipData?.is_paid || false);
  
  // Payment form data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // System category ID for Salary Expenses
  const SALARY_EXPENSES_CATEGORY_ID = 'sys-cat-sal-exp';

  // Load accounts, categories, projects on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [accountsData, categoriesData, projectsData] = await Promise.all([
          apiClient.get<Account[]>('/accounts'),
          apiClient.get<Category[]>('/categories'),
          apiClient.get<Project[]>('/projects')
        ]);
        
        // Filter to only Bank accounts for salary payments
        const bankAccounts = (accountsData || []).filter(a => a.type === AccountType.BANK);
        setAccounts(bankAccounts);
        // Filter to only expense categories
        const expenseCategories = (categoriesData || []).filter(c => c.type === TransactionType.EXPENSE);
        setCategories(expenseCategories);
        setProjects(projectsData || []);
        
        // Auto-select "Salary Expenses" system category as default
        const salaryExpensesCat = expenseCategories.find(c => c.id === SALARY_EXPENSES_CATEGORY_ID);
        if (salaryExpensesCat) {
          setSelectedCategoryId(salaryExpensesCat.id);
        }
        
        // If employee has project allocation, use that as default project
        if (employee.projects && employee.projects.length > 0) {
          const sortedProjects = [...employee.projects].sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
          if (sortedProjects[0].project_id) {
            setSelectedProjectId(sortedProjects[0].project_id);
          }
        }
      } catch (error) {
        console.error('Error loading payment data:', error);
      }
    };
    
    if (isOpen) {
      loadData();
      setIsPaid(payslipData?.is_paid || false);
    }
  }, [isOpen, payslipData, employee.projects]);

  if (!isOpen) return null;

  // Use stored payslip data if available, otherwise calculate from employee salary
  // This ensures payslip displays the values from when it was generated, not current salary
  const useStoredData = payslipData && payslipData.basic_pay !== undefined;
  
  // Basic pay from payslip or employee salary
  const basic = useStoredData ? payslipData.basic_pay : employee.salary.basic;
  
  // Get allowances from stored payslip data or calculate from employee salary
  const rawAllowanceDetails = useStoredData && payslipData.allowance_details 
    ? (typeof payslipData.allowance_details === 'string' 
        ? JSON.parse(payslipData.allowance_details) 
        : payslipData.allowance_details)
    : employee.salary.allowances;
  const allowanceDetails = Array.isArray(rawAllowanceDetails) ? rawAllowanceDetails : [];
  
  // Calculate allowances with their computed values
  const allowances = allowanceDetails.map((a: any) => ({
    ...a,
    calculated: a.is_percentage ? (basic * a.amount) / 100 : a.amount
  }));
  
  // Get deductions from stored payslip data or calculate from employee salary
  const rawDeductionDetails = useStoredData && payslipData.deduction_details
    ? (typeof payslipData.deduction_details === 'string'
        ? JSON.parse(payslipData.deduction_details)
        : payslipData.deduction_details)
    : employee.salary.deductions;
  const deductionDetails = Array.isArray(rawDeductionDetails) ? rawDeductionDetails : [];
  
  // Get adjustments from stored payslip data or from employee
  const rawAdjustmentDetails = useStoredData && payslipData.adjustment_details
    ? (typeof payslipData.adjustment_details === 'string'
        ? JSON.parse(payslipData.adjustment_details)
        : payslipData.adjustment_details)
    : (employee.adjustments || []);
  const adjustmentDetails = Array.isArray(rawAdjustmentDetails) ? rawAdjustmentDetails : [];
  
  const adjustmentEarnings = adjustmentDetails.filter((a: any) => a.type === 'EARNING');
  const adjustmentDeductions = adjustmentDetails.filter((a: any) => a.type === 'DEDUCTION');

  // Calculate totals - use stored values if available for accuracy
  const totalAllowancesAmount = useStoredData && payslipData.total_allowances !== undefined
    ? payslipData.total_allowances
    : allowances.reduce((acc: number, curr: any) => acc + curr.calculated, 0);
  
  const totalEarnings = useStoredData && payslipData.gross_pay !== undefined
    ? payslipData.gross_pay
    : basic + totalAllowancesAmount + adjustmentEarnings.reduce((acc: number, curr: any) => acc + curr.amount, 0);
  
  const recurringGrossForDeductions = basic + totalAllowancesAmount;

  const deductions = deductionDetails.map((d: any) => ({
    ...d,
    calculated: d.is_percentage ? (recurringGrossForDeductions * d.amount) / 100 : d.amount
  }));

  // Calculate total deductions (regular deductions + adjustment deductions)
  // Note: payslipData.total_deductions only includes regular deductions, not adjustment deductions
  const regularDeductionsTotal = useStoredData && payslipData.total_deductions !== undefined
    ? payslipData.total_deductions
    : deductions.reduce((acc: number, curr: any) => acc + curr.calculated, 0);
  
  const adjustmentDeductionsTotal = adjustmentDeductions.reduce((acc: number, curr: any) => acc + curr.amount, 0);
  const totalDeductions = regularDeductionsTotal + adjustmentDeductionsTotal;

  // Net pay - use stored value for accuracy, or calculate
  // The stored net_pay is the final correct value from server
  const netPay = useStoredData && payslipData.net_pay !== undefined
    ? payslipData.net_pay
    : totalEarnings - totalDeductions;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 no-print-backdrop">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col print-full">
        {/* Header */}
        <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0 no-print">
          <div className="flex items-center gap-2">
            <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1">
              <ShieldCheck size={10} /> Verified Payslip
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => window.print()}
              className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors" 
              title="Print"
            >
              <Printer size={18} />
            </button>
            <button 
              className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors" 
              title="Download PDF"
            >
              <Download size={18} />
            </button>
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-12 space-y-10 print-area">
          {/* Company Header */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2.5 rounded-xl text-white">
                <Building2 size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">{companyName}</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Payroll Department</p>
              </div>
            </div>
            <div className="text-right">
              <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Payslip</h1>
              <p className="text-slate-500 font-bold">{run.month} {run.year}</p>
            </div>
          </div>

          {/* Employee Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-8 border-y border-slate-100">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Employee Name</p>
              <p className="font-bold text-slate-900">{employee.name}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Employee ID</p>
              <p className="font-bold text-slate-900">{employee.employee_code || employee.id}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Designation</p>
              <p className="font-bold text-slate-900">{employee.designation}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Joining Date</p>
              <p className="font-bold text-slate-900">{employee.joining_date}</p>
            </div>
          </div>

          {/* Earnings & Deductions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Earnings */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest pb-2 border-b-2 border-slate-900 w-fit">
                Earnings
              </h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-50">
                  <tr className="group">
                    <td className="py-3 text-slate-600 font-medium">Basic Pay</td>
                    <td className="py-3 text-right font-bold text-slate-900">PKR {basic.toLocaleString()}</td>
                  </tr>
                  {allowances.map((a, i) => (
                    <tr key={i}>
                      <td className="py-3 text-slate-600 font-medium">{a.name}</td>
                      <td className="py-3 text-right font-bold text-slate-900">PKR {a.calculated.toLocaleString()}</td>
                    </tr>
                  ))}
                  {adjustmentEarnings.map((a, i) => (
                    <tr key={`adj-earn-${i}`} className="bg-green-50/30">
                      <td className="py-3 text-green-700 font-bold flex items-center gap-2 italic">
                        <Plus size={12}/> {a.name}
                      </td>
                      <td className="py-3 text-right font-black text-green-700">PKR {a.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50/50">
                    <td className="py-4 font-black text-slate-900 uppercase text-[10px]">Total Earnings</td>
                    <td className="py-4 text-right font-black text-slate-900">PKR {totalEarnings.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Deductions */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest pb-2 border-b-2 border-slate-900 w-fit">
                Deductions
              </h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-50">
                  {deductions.map((d, i) => (
                    <tr key={i}>
                      <td className="py-3 text-slate-600 font-medium">{d.name}</td>
                      <td className="py-3 text-right font-bold text-slate-900">PKR {d.calculated.toLocaleString()}</td>
                    </tr>
                  ))}
                  {adjustmentDeductions.map((a, i) => (
                    <tr key={`adj-ded-${i}`} className="bg-red-50/30">
                      <td className="py-3 text-red-700 font-bold flex items-center gap-2 italic">
                        <TrendingDown size={12}/> {a.name}
                      </td>
                      <td className="py-3 text-right font-black text-red-700">-PKR {a.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50/50">
                    <td className="py-4 font-black text-slate-900 uppercase text-[10px]">Total Deductions</td>
                    <td className="py-4 text-right font-black text-slate-900">PKR {totalDeductions.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Net Pay */}
          <div className={`rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 ${isPaid ? 'bg-green-900' : 'bg-slate-900'} text-white`}>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Net Payable Amount</p>
              <p className="text-4xl font-black">PKR {netPay.toLocaleString()}</p>
              {isPaid && (
                <div className="flex items-center gap-2 mt-2 text-green-300">
                  <CheckCircle2 size={16} />
                  <span className="text-xs font-bold">PAID</span>
                  {payslipData?.paid_at && (
                    <span className="text-xs text-green-400">
                      on {new Date(payslipData.paid_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="text-right">
              {!isPaid && !showPaymentForm && (
                <button
                  onClick={() => setShowPaymentForm(true)}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl flex items-center gap-2 transition-all no-print"
                >
                  <Wallet size={18} /> Pay Salary
                </button>
              )}
              {isPaid && (
                <div className="flex gap-4 no-print">
                  <div className="px-4 py-2 bg-white/10 rounded-xl text-xs font-bold border border-white/10">
                    Status: Paid
                  </div>
                  <div className="px-4 py-2 bg-white/10 rounded-xl text-xs font-bold border border-white/10">
                    Txn: {payslipData?.transaction_id?.substring(0, 8) || 'N/A'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Payment Form */}
          {showPaymentForm && !isPaid && (
            <div className="bg-blue-50 rounded-2xl p-6 border border-blue-200 space-y-4 no-print">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <Wallet size={18} className="text-blue-600" /> Process Salary Payment
                </h4>
                <button 
                  onClick={() => setShowPaymentForm(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>

              {paymentError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-red-700 text-sm">
                  <AlertCircle size={16} />
                  {paymentError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Pay From Account <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm"
                  >
                    <option value="">Select Bank Account</option>
                    {accounts.length > 0 ? (
                      accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} - PKR {acc.balance.toLocaleString()}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No bank accounts available</option>
                    )}
                  </select>
                  {accounts.length === 0 && (
                    <p className="text-[10px] text-red-500 mt-1">
                      No bank accounts found. Please create a bank account first.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Expense Category
                  </label>
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm"
                  >
                    <option value="">Select Category (Optional)</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Charge to Project
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm"
                  >
                    <option value="">Select Project (Optional)</option>
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id}>{proj.name}</option>
                    ))}
                  </select>
                  {employee.projects && employee.projects.length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Employee allocation: {employee.projects.map(p => `${p.project_name} (${p.percentage}%)`).join(', ')}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-blue-200">
                <div className="text-sm text-slate-600">
                  Amount to debit: <span className="font-bold text-slate-900">PKR {netPay.toLocaleString()}</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowPaymentForm(false)}
                    className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!selectedAccountId) {
                        setPaymentError('Please select a bank account to pay from');
                        return;
                      }
                      
                      if (!payslipData?.id) {
                        setPaymentError('Payslip ID not found');
                        return;
                      }
                      
                      setIsPaying(true);
                      setPaymentError(null);
                      
                      const result = await payrollApi.payPayslip(payslipData.id, {
                        accountId: selectedAccountId,
                        categoryId: selectedCategoryId || undefined,
                        projectId: selectedProjectId || undefined,
                        description: `Salary payment for ${employee.name} - ${run.month} ${run.year}`
                      });
                      
                      setIsPaying(false);
                      
                      if (result.success) {
                        setIsPaid(true);
                        setShowPaymentForm(false);
                        if (onPaymentComplete) onPaymentComplete();
                      } else {
                        setPaymentError(result.error || 'Failed to process payment');
                      }
                    }}
                    disabled={isPaying || !selectedAccountId}
                    className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isPaying ? (
                      <><Loader2 size={16} className="animate-spin" /> Processing...</>
                    ) : (
                      <><CheckCircle2 size={16} /> Confirm Payment</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayslipModal;
