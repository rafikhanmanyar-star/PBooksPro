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
import { formatDate, formatCurrency, calculateAmount, roundToTwo } from '../utils/formatters';

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
  // NOTE: This fetches bank accounts from Chart of Accounts (Settings > Financial > Chart of Accounts)
  useEffect(() => {
    const loadData = async () => {
      try {
        const [accountsData, categoriesData, projectsData] = await Promise.all([
          apiClient.get<Account[]>('/accounts'),
          apiClient.get<Category[]>('/categories'),
          apiClient.get<Project[]>('/projects')
        ]);
        
        console.log('🔍 All accounts loaded:', accountsData);
        
        // Filter to Bank and Cash accounts for salary payments
        // These are the same accounts from Settings > Chart of Accounts
        // Using case-insensitive comparison and checking both enum value and string
        const paymentAccounts = (accountsData || [])
          .filter(a => {
            const type = a.type?.toLowerCase();
            console.log(`Account: ${a.name}, Type: ${a.type}, Matches: ${type === 'bank' || type === 'cash'}`);
            return type === 'bank' || type === 'cash';
          })
          .sort((a, b) => b.balance - a.balance); // Sort by balance (highest first)
        
        console.log('✅ Filtered payment accounts:', paymentAccounts);
        setAccounts(paymentAccounts);
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
  
  // Basic pay from payslip or employee salary (rounded to 2 decimal places)
  const basic = roundToTwo(useStoredData ? payslipData.basic_pay : employee.salary.basic);
  
  // Get allowances from stored payslip data or calculate from employee salary
  const rawAllowanceDetails = useStoredData && payslipData.allowance_details 
    ? (typeof payslipData.allowance_details === 'string' 
        ? JSON.parse(payslipData.allowance_details) 
        : payslipData.allowance_details)
    : employee.salary.allowances;
  const allowanceDetails = Array.isArray(rawAllowanceDetails) ? rawAllowanceDetails : [];
  
  // Calculate allowances with their computed values (rounded to 2 decimal places)
  const allowances = allowanceDetails.map((a: any) => ({
    ...a,
    calculated: calculateAmount(basic, a.amount, a.is_percentage)
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

  // Calculate totals - use stored values if available for accuracy (all rounded to 2 decimal places)
  const totalAllowancesAmount = roundToTwo(
    useStoredData && payslipData.total_allowances !== undefined
      ? payslipData.total_allowances
      : allowances.reduce((acc: number, curr: any) => acc + curr.calculated, 0)
  );
  
  const totalEarnings = roundToTwo(
    useStoredData && payslipData.gross_pay !== undefined
      ? payslipData.gross_pay
      : basic + totalAllowancesAmount + adjustmentEarnings.reduce((acc: number, curr: any) => acc + curr.amount, 0)
  );
  
  const recurringGrossForDeductions = roundToTwo(basic + totalAllowancesAmount);

  const deductions = deductionDetails.map((d: any) => ({
    ...d,
    calculated: calculateAmount(recurringGrossForDeductions, d.amount, d.is_percentage)
  }));

  // Calculate total deductions (regular deductions + adjustment deductions)
  // Note: payslipData.total_deductions only includes regular deductions, not adjustment deductions
  const regularDeductionsTotal = roundToTwo(
    useStoredData && payslipData.total_deductions !== undefined
      ? payslipData.total_deductions
      : deductions.reduce((acc: number, curr: any) => acc + curr.calculated, 0)
  );
  
  const adjustmentDeductionsTotal = roundToTwo(
    adjustmentDeductions.reduce((acc: number, curr: any) => acc + curr.amount, 0)
  );
  const totalDeductions = roundToTwo(regularDeductionsTotal + adjustmentDeductionsTotal);

  // Net pay - use stored value for accuracy, or calculate (rounded to 2 decimal places)
  // The stored net_pay is the final correct value from server
  const netPay = roundToTwo(
    useStoredData && payslipData.net_pay !== undefined
      ? payslipData.net_pay
      : totalEarnings - totalDeductions
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 print:bg-white print:p-0 print:block print:relative">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col print:max-h-none print:shadow-none print:rounded-none print:max-w-none">
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
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-4 sm:space-y-6 print:overflow-visible print:p-6">
          {/* Company Header */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <div className="bg-blue-600 p-2 rounded-lg text-white print:bg-blue-600">
                <Building2 size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">{companyName}</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Payroll Department</p>
              </div>
            </div>
            <div className="text-right">
              <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Payslip</h1>
              <p className="text-sm text-slate-500 font-bold">{run.month} {run.year}</p>
            </div>
          </div>

          {/* Employee Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-y border-slate-200">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Employee Name</p>
              <p className="font-bold text-slate-900 text-sm">{employee.name}</p>
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Employee ID</p>
              <p className="font-bold text-slate-900 text-sm">{employee.employee_code || employee.id}</p>
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Designation</p>
              <p className="font-bold text-slate-900 text-sm">{employee.designation}</p>
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Joining Date</p>
              <p className="font-bold text-slate-900 text-sm">{formatDate(employee.joining_date)}</p>
            </div>
          </div>

          {/* Earnings & Deductions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Earnings */}
            <div className="space-y-2">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider pb-1 border-b-2 border-slate-900">
                Earnings
              </h3>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-1.5 text-slate-600 font-medium">Basic Pay</td>
                    <td className="py-1.5 text-right font-bold text-slate-900">{formatCurrency(basic)}</td>
                  </tr>
                  {allowances.map((a, i) => (
                    <tr key={i}>
                      <td className="py-1.5 text-slate-600 font-medium">{a.name}</td>
                      <td className="py-1.5 text-right font-bold text-slate-900">{formatCurrency(a.calculated)}</td>
                    </tr>
                  ))}
                  {adjustmentEarnings.map((a, i) => (
                    <tr key={`adj-earn-${i}`} className="bg-green-50/50">
                      <td className="py-1.5 text-green-700 font-bold italic text-[11px]">
                        + {a.name}
                      </td>
                      <td className="py-1.5 text-right font-bold text-green-700">{formatCurrency(a.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 border-t-2 border-slate-300">
                    <td className="py-2 font-black text-slate-900 uppercase text-[10px]">Total Earnings</td>
                    <td className="py-2 text-right font-black text-slate-900">{formatCurrency(totalEarnings)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Deductions */}
            <div className="space-y-2">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider pb-1 border-b-2 border-slate-900">
                Deductions
              </h3>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {deductions.map((d, i) => (
                    <tr key={i}>
                      <td className="py-1.5 text-slate-600 font-medium">{d.name}</td>
                      <td className="py-1.5 text-right font-bold text-slate-900">{formatCurrency(d.calculated)}</td>
                    </tr>
                  ))}
                  {adjustmentDeductions.map((a, i) => (
                    <tr key={`adj-ded-${i}`} className="bg-red-50/50">
                      <td className="py-1.5 text-red-700 font-bold italic text-[11px]">
                        - {a.name}
                      </td>
                      <td className="py-1.5 text-right font-bold text-red-700">{formatCurrency(a.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 border-t-2 border-slate-300">
                    <td className="py-2 font-black text-slate-900 uppercase text-[10px]">Total Deductions</td>
                    <td className="py-2 text-right font-black text-slate-900">{formatCurrency(totalDeductions)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Net Pay */}
          <div className={`rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 ${isPaid ? 'bg-green-900' : 'bg-slate-900'} text-white print:bg-slate-900 print:rounded-lg`}>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Net Payable Amount</p>
              <p className="text-2xl sm:text-3xl font-black">PKR {formatCurrency(netPay)}</p>
              {isPaid && (
                <div className="flex items-center gap-2 mt-1 text-green-300">
                  <CheckCircle2 size={14} />
                  <span className="text-[10px] font-bold">PAID</span>
                  {payslipData?.paid_at && (
                    <span className="text-[10px] text-green-400">
                      on {new Date(payslipData.paid_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="text-right no-print">
              {!isPaid && !showPaymentForm && (
                <button
                  onClick={() => setShowPaymentForm(true)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg flex items-center gap-2 transition-all text-sm"
                >
                  <Wallet size={16} /> Pay Salary
                </button>
              )}
              {isPaid && (
                <div className="flex gap-2">
                  <div className="px-3 py-1.5 bg-white/10 rounded-lg text-[10px] font-bold border border-white/10">
                    Status: Paid
                  </div>
                  <div className="px-3 py-1.5 bg-white/10 rounded-lg text-[10px] font-bold border border-white/10">
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
                    <option value="">Select Payment Account</option>
                    {accounts.length > 0 ? (
                      accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type}) - PKR {formatCurrency(acc.balance)}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>No payment accounts available</option>
                    )}
                  </select>
                  {accounts.length === 0 && (
                    <p className="text-[10px] text-amber-600 mt-1 font-medium">
                      ⚠️ No payment accounts found. Create a Bank or Cash account in Settings → Chart of Accounts
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
                  Amount to debit: <span className="font-bold text-slate-900">PKR {formatCurrency(netPay)}</span>
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
                        setPaymentError('Please select a payment account');
                        return;
                      }
                      
                      if (!payslipData?.id) {
                        setPaymentError('Payslip ID not found');
                        return;
                      }
                      
                      setIsPaying(true);
                      setPaymentError(null);
                      
                      console.log('💰 Processing salary payment:', {
                        payslipId: payslipData.id,
                        accountId: selectedAccountId,
                        categoryId: selectedCategoryId,
                        projectId: selectedProjectId,
                        amount: netPay
                      });
                      
                      try {
                        const result = await payrollApi.payPayslip(payslipData.id, {
                          accountId: selectedAccountId,
                          categoryId: selectedCategoryId || undefined,
                          projectId: selectedProjectId || undefined,
                          description: `Salary payment for ${employee.name} - ${run.month} ${run.year}`
                        });
                        
                        console.log('✅ Payment result:', result);
                        
                        setIsPaying(false);
                        
                        if (result.success) {
                          setIsPaid(true);
                          setShowPaymentForm(false);
                          if (onPaymentComplete) onPaymentComplete();
                        } else {
                          const errorMsg = result.error || 'Failed to process payment';
                          console.error('❌ Payment failed:', errorMsg);
                          setPaymentError(errorMsg);
                        }
                      } catch (error: any) {
                        console.error('❌ Payment exception:', error);
                        setIsPaying(false);
                        setPaymentError(error.message || 'An unexpected error occurred');
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
