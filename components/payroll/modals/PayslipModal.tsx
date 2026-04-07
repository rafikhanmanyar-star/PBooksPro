/**
 * PayslipModal - View employee payslip for a specific payroll run
 */

import React, { useState, useEffect } from 'react';
import { X, Download, Printer, ShieldCheck, Building2, Plus, TrendingDown, Wallet, CheckCircle2, Loader2, AlertCircle, MessageCircle } from 'lucide-react';
import { PayrollEmployee, PayrollRun, Payslip } from '../types';
import { payrollApi } from '../../../services/api/payrollApi';
import { useAuth } from '../../../context/AuthContext';
import { useAppContext } from '../../../context/AppContext';
import { Account, Category, Project, Transaction, TransactionType, AccountType } from '../../../types';
import { apiClient } from '../../../services/api/client';
import { isLocalOnlyMode } from '../../../config/apiUrl';
import { formatDate, formatCurrency, calculateAmount, roundToTwo } from '../utils/formatters';
import { payslipDisplayPaidAmount, payslipIsFullyPaid, payslipRemainingAmount } from '../utils/payslipPaymentState';
import { resolvePayslipAssignment, formatPayslipAssignmentDisplay } from '../utils/payslipAssignment';
import ComboBox from '../../../components/ui/ComboBox';
import PrintButton from '../../../components/ui/PrintButton';
import { usePrintContext } from '../../../context/PrintContext';
import { PayslipPrintData } from '../../print/PayslipPrintTemplate';
import { resolveSystemCategoryId } from '../../../services/systemEntityIds';

interface PayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: PayrollEmployee;
  run: PayrollRun;
  payslipData?: Payslip | null;
  onPaymentComplete?: () => void;
  /** When 'print', trigger print dialog shortly after open (e.g. from Past Payslips Print button). */
  initialAction?: 'view' | 'print';
}

const PayslipModal: React.FC<PayslipModalProps> = ({ isOpen, onClose, employee, run, payslipData, onPaymentComplete, initialAction }) => {
  const { tenant } = useAuth();
  const { state, dispatch } = useAppContext();
  const { print: triggerPrint } = usePrintContext();
  const companyName = tenant?.companyName || tenant?.name || 'Organization';

  // Payment state
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState(() => (payslipData ? payslipIsFullyPaid(payslipData) : false));

  // Payment form data
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState<string>('');

  const salaryExpensesCategoryId = React.useMemo(
    () => resolveSystemCategoryId(state.categories, 'sys-cat-sal-exp'),
    [state.categories]
  );

  // State for accounts fetched directly from API (fallback if AppContext doesn't have them)
  const [fetchedAccounts, setFetchedAccounts] = useState<Account[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

  // Get bank and cash accounts - try AppContext first, then fetch from API if needed
  const paymentAccounts = React.useMemo(() => {
    const accountsToUse = state.accounts.length > 0 ? state.accounts : fetchedAccounts;
    if (!accountsToUse || accountsToUse.length === 0) return [];

    const filtered = accountsToUse.filter(a => {
      if (!a || !a.type) return false;
      const typeLower = a.type.toLowerCase().trim();
      const isBank = typeLower === 'bank' || (a.type as string) === AccountType.BANK || a.type === 'Bank';
      const isCash = typeLower === 'cash' || (a.type as string) === AccountType.CASH || a.type === 'Cash';
      return (isBank || isCash) && a.name !== 'Internal Clearing';
    });

    return filtered.sort((a, b) => b.balance - a.balance);
  }, [state.accounts, fetchedAccounts]);

  // Get expense categories
  const expenseCategories = React.useMemo(() => {
    return state.categories
      .filter(c => c.type === TransactionType.EXPENSE)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state.categories]);

  // Get projects
  const projects = React.useMemo(() => {
    return state.projects;
  }, [state.projects]);

  /** Project/building split for this payslip: snapshot when present, else employee profile (legacy). */
  const allocationForPayment = React.useMemo(
    () => resolvePayslipAssignment(payslipData ?? null, employee),
    [payslipData, employee]
  );

  // In local-only mode, accounts come from AppContext (local DB). Otherwise fetch from API if needed.
  useEffect(() => {
    if (isLocalOnlyMode()) {
      if (isOpen && state.accounts.length === 0) setIsLoadingAccounts(false);
      return;
    }
    if (!isOpen || isLoadingAccounts) return;
    if (state.accounts.length > 0 && !showPaymentForm) return;

    setIsLoadingAccounts(true);
    apiClient.get<Account[]>('/accounts')
      .then(accountsData => {
        if (accountsData && Array.isArray(accountsData)) {
          if (accountsData.length === 0) {
            setPaymentError('No accounts found. Please create a Bank or Cash account in Settings → Financial → Chart of Accounts.');
          } else {
            setFetchedAccounts(accountsData);
          }
        } else {
          setFetchedAccounts([]);
          setPaymentError('Invalid account data received. Please refresh the page.');
        }
        setIsLoadingAccounts(false);
      })
      .catch(error => {
        setFetchedAccounts([]);
        setIsLoadingAccounts(false);
        if (error?.status === 401) setPaymentError('Session expired. Please refresh the page and login again.');
        else if (error?.status === 0) setPaymentError('No internet connection. Please check your network.');
        else setPaymentError(`Failed to load accounts: ${error?.message || 'Unknown error'}. Please refresh the page.`);
      });
  }, [isOpen, state.accounts.length, showPaymentForm, isLoadingAccounts]);

  // Initialize form data when modal opens or when accounts become available
  useEffect(() => {
    if (isOpen) {
      setIsPaid(payslipData ? payslipIsFullyPaid(payslipData) : false);
      setPaymentError(null);

      console.log('🔍 PayslipModal opened - State check:', {
        totalAccountsInState: state.accounts.length,
        fetchedAccountsCount: fetchedAccounts.length,
        paymentAccountsCount: paymentAccounts.length,
        isLoadingAccounts,
        accountTypes: [...new Set([...state.accounts, ...fetchedAccounts].map(a => a.type))],
        allAccountNames: [...state.accounts, ...fetchedAccounts].map(a => ({ name: a.name, type: a.type }))
      });

      // Auto-select first account if available
      if (paymentAccounts.length > 0) {
        const cashAccount = paymentAccounts.find(a => a.name === 'Cash');
        const accountToSelect = cashAccount
          ? (cashAccount.id || (cashAccount as any)._id || '')
          : (paymentAccounts[0].id || (paymentAccounts[0] as any)._id || '');
        const cleanAccountId = String(accountToSelect).trim();
        if (cleanAccountId) {
          setSelectedAccountId(cleanAccountId);
          console.log('✅ Auto-selected account:', { id: cleanAccountId, name: cashAccount?.name || paymentAccounts[0].name });
        }
      } else if (!isLoadingAccounts) {
        console.warn('⚠️ No payment accounts available to auto-select');
        const totalAccounts = state.accounts.length + fetchedAccounts.length;
        if (totalAccounts === 0) {
          setPaymentError('No accounts found in system. Please ensure accounts are loaded.');
        } else {
          setPaymentError(`Found ${totalAccounts} account(s) but none are Bank or Cash type. Please create a Bank or Cash account in Settings → Chart of Accounts.`);
        }
      }

      // Auto-select "Salary Expenses" system category as default
      const salaryExpensesCat = salaryExpensesCategoryId
        ? expenseCategories.find(c => c.id === salaryExpensesCategoryId)
        : undefined;
      if (salaryExpensesCat) {
        setSelectedCategoryId(salaryExpensesCat.id);
      }

      // When this payslip has project/building allocation, leave project empty so cost splits by allocation
      if (allocationForPayment.projects.length > 0 || allocationForPayment.buildings.length > 0) {
        setSelectedProjectId(''); // Auto-split by allocation
      }
    } else {
      // Reset selections when modal closes
      setSelectedAccountId('');
      setSelectedCategoryId('');
      setSelectedProjectId('');
      setPaymentAmount('');
      setFetchedAccounts([]);
      setIsLoadingAccounts(false);
    }
  }, [isOpen, payslipData, paymentAccounts, expenseCategories, allocationForPayment.projects, allocationForPayment.buildings, state.accounts, fetchedAccounts, isLoadingAccounts, salaryExpensesCategoryId]);

  // When opened with initialAction 'print', trigger print dialog (e.g. from Past Payslips Print button)
  React.useEffect(() => {
    if (!isOpen || initialAction !== 'print' || !payslipData) return;
    const buildPrintData = (): PayslipPrintData => {
      const allowanceDetails = Array.isArray(payslipData.allowance_details) ? payslipData.allowance_details : [];
      const deductionDetails = Array.isArray(payslipData.deduction_details) ? payslipData.deduction_details : [];
      const adjDetails = Array.isArray(payslipData.adjustment_details) ? payslipData.adjustment_details : [];
      const adjustmentEarnings = adjDetails.filter((a: any) => a.type === 'EARNING');
      const adjustmentDeductions = adjDetails.filter((a: any) => a.type === 'DEDUCTION');
      return {
        companyName,
        month: run.month,
        year: run.year,
        employee: {
          name: employee.name,
          employee_code: employee.employee_code,
          id: employee.id,
          designation: employee.designation,
          joining_date: employee.joining_date
        },
        earnings: {
          basic: payslipData.basic_pay,
          allowances: allowanceDetails.map((a: any) => ({ name: a.name, amount: a.amount })),
          adjustments: adjustmentEarnings.map((a: any) => ({ name: a.name, amount: a.amount })),
          total: payslipData.gross_pay
        },
        deductions: {
          regular: deductionDetails.map((d: any) => ({ name: d.name, amount: d.amount })),
          adjustments: adjustmentDeductions.map((a: any) => ({ name: a.name, amount: a.amount })),
          total: payslipData.total_deductions
        },
        netPay: payslipData.net_pay,
        isPaid: payslipIsFullyPaid(payslipData),
        paidAt: payslipData.paid_at
      };
    };
    const t = setTimeout(() => {
      triggerPrint('PAYSLIP', buildPrintData());
    }, 300);
    return () => clearTimeout(t);
  }, [isOpen, initialAction, payslipData, run, employee, companyName]);

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
            <a
              href={(() => {
                const text = encodeURIComponent(`Payslip for ${run.month} ${run.year}: Net Pay PKR ${formatCurrency(netPay)}. ${companyName}.`);
                const phone = (employee.phone || '').replace(/\D/g, '');
                const waNum = phone.startsWith('0') ? '92' + phone.slice(1) : phone.length >= 10 ? '92' + phone : '';
                return waNum ? `https://wa.me/${waNum}?text=${text}` : `https://web.whatsapp.com/send?text=${text}`;
              })()}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-slate-200 rounded-lg text-emerald-600 transition-colors"
              title="Send via WhatsApp"
            >
              <MessageCircle size={18} />
            </a>
            <PrintButton
              onPrint={() => {
                const printData: PayslipPrintData = {
                  companyName,
                  month: run.month,
                  year: run.year,
                  employee: {
                    name: employee.name,
                    employee_code: employee.employee_code,
                    id: employee.id,
                    designation: employee.designation,
                    joining_date: employee.joining_date
                  },
                  earnings: {
                    basic,
                    allowances: allowances.map(a => ({ name: a.name, amount: a.calculated })),
                    adjustments: adjustmentEarnings.map(a => ({ name: a.name, amount: a.amount })),
                    total: totalEarnings
                  },
                  deductions: {
                    regular: deductions.map(d => ({ name: d.name, amount: d.calculated })),
                    adjustments: adjustmentDeductions.map(a => ({ name: a.name, amount: a.amount })),
                    total: totalDeductions
                  },
                  netPay,
                  isPaid: payslipData ? payslipIsFullyPaid(payslipData) : isPaid,
                  paidAt: payslipData?.paid_at
                };
                triggerPrint('PAYSLIP', printData);
              }}
              variant="secondary"
              className="!bg-slate-200 !text-slate-500 hover:!bg-slate-300"
              showLabel={false}
            />
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
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Department</p>
              <p className="font-bold text-slate-900 text-sm">{employee.department || '—'}</p>
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Grade</p>
              <p className="font-bold text-slate-900 text-sm">{employee.grade || '—'}</p>
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
                <div className="mt-2 space-y-0.5">
                  <div className="flex items-center gap-2 text-green-300">
                    <CheckCircle2 size={14} />
                    <span className="text-[10px] font-bold">PAID</span>
                    {payslipData?.paid_at && (
                      <span className="text-[10px] text-green-400">
                        on {new Date(payslipData.paid_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {payslipData && (
                    <p className="text-[11px] font-bold text-green-200/95 tabular-nums">
                      Amount paid: PKR {formatCurrency(payslipDisplayPaidAmount(payslipData))}
                      <span className="font-semibold text-green-300/90"> · Remaining: PKR {formatCurrency(payslipRemainingAmount(payslipData))}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="text-right no-print">
              {!isPaid && !showPaymentForm && (
                <button
                  onClick={() => {
                    // Local-only: accounts from AppContext. Non–local: already loaded or from useEffect.
                    if (!isLocalOnlyMode() && (state.accounts.length === 0 || fetchedAccounts.length === 0)) {
                      setIsLoadingAccounts(true);
                      apiClient.get<Account[]>('/accounts')
                        .then((fresh: Account[] | undefined) => {
                          if (fresh && Array.isArray(fresh)) setFetchedAccounts(fresh);
                        })
                        .catch(() => {})
                        .finally(() => setIsLoadingAccounts(false));
                    }
                    setPaymentAmount(
                      payslipData != null
                        ? String(payslipRemainingAmount(payslipData))
                        : netPay != null
                          ? String(netPay)
                          : ''
                    );
                    setShowPaymentForm(true);
                  }}
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  {paymentAccounts.length > 0 ? (
                    <ComboBox
                      label="Pay From Account"
                      items={paymentAccounts.map(acc => {
                        // Ensure we're using the correct account ID
                        const accountId = acc.id || (acc as any)._id || '';
                        console.log('Mapping account to ComboBox item:', {
                          accountName: acc.name,
                          accountId: accountId,
                          accountIdType: typeof accountId,
                          fullAccount: acc
                        });
                        return {
                          id: accountId,
                          name: `${acc.name} (${acc.type}) - PKR ${formatCurrency(acc.balance)}`
                        };
                      })}
                      selectedId={selectedAccountId}
                      onSelect={(item) => {
                        console.log('🔵 ComboBox onSelect called with item:', item);
                        console.log('🔵 Item details:', {
                          item,
                          itemId: item?.id,
                          itemIdType: typeof item?.id,
                          itemName: item?.name
                        });

                        // Find the original account object to ensure we have the correct ID
                        const originalAccount = paymentAccounts.find(acc => {
                          const accId = acc.id || (acc as any)._id || '';
                          return accId === item?.id;
                        });

                        console.log('🔵 Original account found:', originalAccount);

                        if (!originalAccount) {
                          console.error('❌ Could not find original account for selected item:', item);
                          setPaymentError('Selected account not found in available accounts. Please refresh and try again.');
                          return;
                        }

                        const accountId = originalAccount.id || (originalAccount as any)._id || '';
                        const cleanAccountId = String(accountId).trim();

                        console.log('🔵 Setting selectedAccountId to:', cleanAccountId);
                        console.log('🔵 Account details:', {
                          name: originalAccount.name,
                          type: originalAccount.type,
                          id: cleanAccountId,
                          idType: typeof cleanAccountId
                        });

                        setSelectedAccountId(cleanAccountId);

                        // Clear any previous errors when selecting a new account
                        if (cleanAccountId && paymentError) {
                          setPaymentError(null);
                        }
                      }}
                      placeholder="Select Payment Account"
                      required
                      entityType="account"
                    />
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                        Pay From Account <span className="text-red-500">*</span>
                      </label>
                      <div className="w-full px-3 py-2.5 rounded-xl border-2 border-amber-300 bg-amber-50">
                        <p className="text-sm text-amber-700 font-medium mb-2">
                          No payment accounts available
                        </p>
                        {isLoadingAccounts ? (
                          <p className="text-xs text-amber-600">Loading accounts...</p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs text-amber-700 font-semibold">
                              To fix this issue:
                            </p>
                            <ol className="text-xs text-amber-600 list-decimal list-inside space-y-1 ml-2">
                              <li>Go to <strong>Settings</strong> → <strong>Financial</strong> → <strong>Chart of Accounts</strong></li>
                              <li>Click <strong>"Add New Account"</strong></li>
                              <li>Create an account with type <strong>"Bank"</strong> or <strong>"Cash"</strong></li>
                              <li>Save the account and return here</li>
                            </ol>
                            <p className="text-xs text-amber-600 mt-2">
                              The system should have created a default "Cash" account. If it's missing, please create one manually.
                            </p>
                          </div>
                        )}
                      </div>
                      {!isLoadingAccounts && (state.accounts.length > 0 || fetchedAccounts.length > 0) && (
                        <p className="text-[10px] text-slate-500 mt-1">
                          Found {(state.accounts.length || fetchedAccounts.length)} account(s) but none are Bank or Cash type.
                          Available types: {[...new Set([...state.accounts, ...fetchedAccounts].map(a => a.type))].join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <ComboBox
                    label="Expense Category"
                    items={expenseCategories.map(cat => ({
                      id: cat.id,
                      name: cat.name
                    }))}
                    selectedId={selectedCategoryId}
                    onSelect={(item) => setSelectedCategoryId(item?.id || '')}
                    placeholder="Select Expense Category"
                    required
                    entityType="category"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Default: Salary Expenses. Expense recorded under this category.
                  </p>
                </div>
                <div>
                  <ComboBox
                    label="Charge to Project"
                    items={projects.map(proj => ({
                      id: proj.id,
                      name: proj.name
                    }))}
                    selectedId={selectedProjectId}
                    onSelect={(item) => setSelectedProjectId(item?.id || '')}
                    placeholder={(allocationForPayment.projects.length > 0 || allocationForPayment.buildings.length > 0) ? "Leave empty to split by payslip allocation" : "Select Project (Optional)"}
                    entityType="project"
                  />
                  {(allocationForPayment.projects.length > 0 || allocationForPayment.buildings.length > 0) && !selectedProjectId && (
                    <p className="text-[10px] text-emerald-600 mt-1">
                      Cost will be split: {formatPayslipAssignmentDisplay(payslipData ?? undefined, employee)}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder={payslipData != null ? String(payslipRemainingAmount(payslipData)) : String(netPay)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 ring-blue-500/20 outline-none font-medium text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {payslipData != null ? (
                      <>
                        Paid so far: PKR {formatCurrency(payslipDisplayPaidAmount(payslipData))} · Remaining: PKR{' '}
                        {formatCurrency(payslipRemainingAmount(payslipData))}
                      </>
                    ) : (
                      <>Net pay: PKR {formatCurrency(netPay)} — edit to override</>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-blue-200">
                <div className="text-sm text-slate-600">
                  Amount to debit: <span className="font-bold text-slate-900">PKR {formatCurrency(parseFloat(paymentAmount) || netPay)}</span>
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

                      if (!selectedCategoryId) {
                        setPaymentError('Please select an expense category');
                        return;
                      }

                      const amount = parseFloat(paymentAmount);
                      if (isNaN(amount) || amount <= 0) {
                        setPaymentError('Please enter a valid amount greater than zero');
                        return;
                      }

                      if (!payslipData?.id) {
                        setPaymentError('Payslip ID not found');
                        return;
                      }

                      // Verify the selected account exists in our available accounts
                      // Use flexible matching to handle ID format differences
                      const selectedAccount = paymentAccounts.find(acc => {
                        const accId = String(acc.id || '').trim();
                        const selectedId = String(selectedAccountId || '').trim();
                        return accId === selectedId || accId.toLowerCase() === selectedId.toLowerCase();
                      });

                      if (!selectedAccount) {
                        console.error('❌ Selected account not found in paymentAccounts:', {
                          selectedAccountId,
                          selectedAccountIdType: typeof selectedAccountId,
                          selectedAccountIdLength: selectedAccountId?.length,
                          availableAccountIds: paymentAccounts.map(a => ({
                            id: a.id,
                            idType: typeof a.id,
                            name: a.name
                          })),
                          allAccounts: paymentAccounts.map(a => ({
                            id: a.id,
                            name: a.name,
                            type: a.type
                          }))
                        });
                        setPaymentError(`Selected account not found in available accounts. Please refresh the page and select again.`);
                        setIsPaying(false);
                        return;
                      }

                      // Use the account ID from the found account object (ensures correct format)
                      const verifiedAccountId = String(selectedAccount.id || '').trim();
                      if (!verifiedAccountId) {
                        console.error('❌ Account found but has no valid ID:', selectedAccount);
                        setPaymentError('Selected account has invalid ID. Please select a different account.');
                        setIsPaying(false);
                        return;
                      }

                      console.log('✅ Account validation passed:', {
                        originalSelectedId: selectedAccountId,
                        verifiedAccountId: verifiedAccountId,
                        accountName: selectedAccount.name,
                        accountType: selectedAccount.type,
                        accountBalance: selectedAccount.balance,
                        accountIdMatch: selectedAccountId === verifiedAccountId
                      });

                      setIsPaying(true);
                      setPaymentError(null);

                      console.log('💰 Processing salary payment:', {
                        payslipId: payslipData.id,
                        accountId: verifiedAccountId,
                        accountName: selectedAccount.name,
                        categoryId: selectedCategoryId,
                        projectId: selectedProjectId,
                        amount: netPay
                      });

                      try {
                        // Use the verified account ID from the found account object
                        // Ensure it's a clean string with no whitespace
                        const cleanAccountId = String(verifiedAccountId).trim();

                        // Double-check the account still exists in our list
                        const finalAccountCheck = paymentAccounts.find(acc => {
                          const accId = String(acc.id || (acc as any)._id || '').trim();
                          return accId === cleanAccountId || accId.toLowerCase() === cleanAccountId.toLowerCase();
                        });

                        if (!finalAccountCheck) {
                          console.error('❌ Account validation failed - account not in list:', {
                            cleanAccountId,
                            availableIds: paymentAccounts.map(a => String(a.id || '').trim())
                          });
                          setPaymentError('Account validation failed. Please refresh the page and try again.');
                          setIsPaying(false);
                          return;
                        }

                        console.log('📤 Sending payment request:', {
                          payslipId: payslipData.id,
                          accountId: cleanAccountId,
                          accountIdType: typeof cleanAccountId,
                          accountIdLength: cleanAccountId.length,
                          accountIdJSON: JSON.stringify(cleanAccountId),
                          accountName: selectedAccount.name,
                          accountType: selectedAccount.type,
                          categoryId: selectedCategoryId,
                          projectId: selectedProjectId,
                          amount,
                          selectedAccount: {
                            id: selectedAccount.id,
                            idType: typeof selectedAccount.id,
                            name: selectedAccount.name,
                            type: selectedAccount.type
                          }
                        });

                        const result = await payrollApi.payPayslip(payslipData.id, {
                          accountId: cleanAccountId,
                          categoryId: selectedCategoryId,
                          projectId: selectedProjectId || undefined,
                          amount,
                          description: `Salary payment for ${employee.name} - ${run.month} ${run.year}`
                        });

                        console.log('✅ Payment result:', result);

                        if (result && result.success) {
                          setIsPaid(true);
                          setShowPaymentForm(false);

                          // Dispatch all transactions to global state (one per project when split by allocation)
                          const txns = result.transactions || (result.transaction ? [result.transaction] : []);
                          txns.forEach((txn: any) => {
                            dispatch({
                              type: 'ADD_TRANSACTION',
                              payload: txn,
                              _isRemote: true // Skip sync because server already has it
                            } as any);
                          });

                          if (onPaymentComplete) onPaymentComplete();
                        } else {
                          const errorMsg = result?.error || 'Failed to process payment. Please check your network or refresh the page.';
                          console.error('❌ Payment failed:', errorMsg);
                          setPaymentError(errorMsg);
                        }
                      } catch (error: any) {
                        console.error('❌ Payment exception:', error);
                        const errorMessage = error.message || error.error || error.response?.data?.error || 'An unexpected error occurred during payment processing.';
                        setPaymentError(errorMessage);

                        // Provide helpful messages for common errors
                        if (errorMessage.includes('account not found') || errorMessage.includes('Payment account not found')) {
                          // Check if error response has available accounts
                          const availableAccounts = error.response?.data?.availableAccounts;

                          let errorMsg = `Payment account not found. `;
                          if (availableAccounts && availableAccounts.length > 0) {
                            errorMsg += `Available accounts for this tenant: ${availableAccounts.map((a: any) => `${a.name} (${a.type})`).join(', ')}. `;
                            errorMsg += `Please refresh the page and select one of these accounts.`;
                          } else {
                            errorMsg += `The account may have been deleted or does not belong to this tenant. `;
                            errorMsg += `Current available accounts: ${paymentAccounts.map(a => `${a.name} (${a.type})`).join(', ')}. `;
                            errorMsg += `Please refresh the page and try again.`;
                          }

                          setPaymentError(errorMsg);
                        }
                      } finally {
                        setIsPaying(false);
                      }
                    }}
                    disabled={isPaying || !selectedAccountId || !selectedCategoryId || !paymentAmount || isNaN(parseFloat(paymentAmount)) || parseFloat(paymentAmount) <= 0}
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
