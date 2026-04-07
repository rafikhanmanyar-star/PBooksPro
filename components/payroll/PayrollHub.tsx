/**
 * PayrollHub - Main entry point for the Payroll module
 * 
 * This component manages the payroll sub-navigation and renders the appropriate
 * sub-component based on the active tab.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  History,
  Users,
  BarChart3,
  CreditCard,
  Calendar,
  CalendarClock,
  Pencil,
  Banknote,
  Loader2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Settings,
  MessageCircle,
} from 'lucide-react';
import EmployeeList from './EmployeeList';
import EmployeeProfile from './EmployeeProfile';
import EmployeeForm from './EmployeeForm';
import PayrollReport from './PayrollReport';
import PaymentHistory from './PaymentHistory';
import PayrollSettingsPage from './PayrollSettingsPage';
import { PayrollEmployee, PayrollRun, Payslip } from './types';
import { storageService } from './services/storageService';
import { hydratePayrollFromDb } from './services/payrollDb';
import { syncPayrollFromServer } from './services/payrollSync';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { useAuth } from '../../context/AuthContext';
import { usePayrollContext } from '../../context/PayrollContext';
import { useAppContext } from '../../context/AppContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { sendOrOpenWhatsApp } from '../../services/whatsappService';
import { Contact, ContactType, Transaction } from '../../types';
import { formatCurrency } from './utils/formatters';
import { payslipDisplayPaidAmount, payslipIsFullyPaid, payslipRemainingAmount } from './utils/payslipPaymentState';
import { formatPayslipAssignmentDisplay } from './utils/payslipAssignment';
import Modal from '../ui/Modal';
import TransactionForm from '../transactions/TransactionForm';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { useNotification } from '../../context/NotificationContext';
import type { PayrollSubTab } from '../../context/PayrollContext';
import TreeView, { TreeNode } from '../ui/TreeView';
import BackDateSalaryModal from './modals/BackDateSalaryModal';
import EditPayslipModal from './modals/EditPayslipModal';
import PaySalaryModal from './modals/PaySalaryModal';
import BulkPayPayslipsModal, { BulkPayItem } from './modals/BulkPayPayslipsModal';
import { runSalaryCreationForPeriodAsync } from './services/runSalaryCreation';
import { useCollapsibleSubNav } from '../../hooks/useCollapsibleSubNav';
import SubNavModeToggle from '../layout/SubNavModeToggle';

const MONTH_LABEL_TO_NUM: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
};

function formatTableDate(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) return '—';
  const d = new Date(isoOrDate);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

type TableRecordFilter = 'payslips' | 'payments' | 'all';

const PayrollHub: React.FC = () => {
  const { user, tenant } = useAuth();
  const { state: appState, dispatch } = useAppContext();
  const { openChat } = useWhatsApp();
  const { showToast, showAlert } = useNotification();

  // Use PayrollContext for preserving state across navigation
  const {
    activeSubTab,
    setActiveSubTab,
    selectedEmployee,
    setSelectedEmployee,
    isAddingEmployee,
    setIsAddingEmployee,
  } = usePayrollContext();

  // Get tenant ID from auth context
  const tenantId = tenant?.id || '';
  const userId = user?.id || '';
  const userRole = user?.role || '';

  // Check if user is an employee (non-HR role) - for now, we show full access
  const isEmployeeRole = userRole === 'Employee';

  // Trigger refresh when returning from EmployeeForm (employee list refetches on key change)
  const [workforceRefreshKey, setWorkforceRefreshKey] = useState(0);

  // Payroll Cycle tab: back-date modal and payslips for selected run
  const [backDateModalOpen, setBackDateModalOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [cyclePayslips, setCyclePayslips] = useState<Payslip[]>([]);
  const [editPayslipModalOpen, setEditPayslipModalOpen] = useState(false);
  const [editingPayslip, setEditingPayslip] = useState<Payslip | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<PayrollEmployee | null>(null);
  const [creatingCurrentMonth, setCreatingCurrentMonth] = useState(false);
  const [payModalPayslip, setPayModalPayslip] = useState<Payslip | null>(null);
  const [payModalEmployee, setPayModalEmployee] = useState<PayrollEmployee | null>(null);
  const [payModalRun, setPayModalRun] = useState<PayrollRun | null>(null);
  const [payslipsRefreshKey, setPayslipsRefreshKey] = useState(0);
  /** Bumped after SQLite hydrate or API payroll sync so UI re-reads payslips from storage. */
  const [payrollStorageRevision, setPayrollStorageRevision] = useState(0);

  // Selected employee from tree view (filter data table)
  const [selectedCycleEmployeeId, setSelectedCycleEmployeeId] = useState<string | null>(null);

  // Payslip table sort (Payroll Cycle tab)
  type PayslipSortKey = 'employee' | 'period' | 'projects' | 'paid_amount' | 'remaining' | 'gross_pay' | 'status';
  const [payslipSortColumn, setPayslipSortColumn] = useState<PayslipSortKey | null>(null);
  const [payslipSortDir, setPayslipSortDir] = useState<'asc' | 'desc'>('asc');
  const handlePayslipSort = (key: PayslipSortKey) => {
    if (payslipSortColumn === key) {
      setPayslipSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setPayslipSortColumn(key);
      setPayslipSortDir('asc');
    }
  };

  // Resizable tree panel width (percent); only used when cycles tab and lg+ layout
  const [treePanelWidth, setTreePanelWidth] = useState(40);
  const [isResizing, setIsResizing] = useState(false);
  const [isLg, setIsLg] = useState(typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  const splitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsLg(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const container = splitRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.min(70, Math.max(20, (x / rect.width) * 100));
      setTreePanelWidth(pct);
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizing]);

  const refreshCyclePayslips = useCallback(() => {
    if (!tenantId) return;
    if (selectedRunId) setCyclePayslips(storageService.getPayslipsByRunId(tenantId, selectedRunId));
    setPayslipsRefreshKey((k) => k + 1);
  }, [tenantId, selectedRunId]);

  // When an employee is selected, get all their payslips from storage (all runs) for the data table
  const payslipsForSelectedEmployee = useMemo(() => {
    if (!tenantId || !selectedCycleEmployeeId) return [];
    const runs = storageService.getPayrollRuns(tenantId);
    const runsMap = new Map(runs.map(r => [r.id, r]));
    return storageService
      .getPayslips(tenantId)
      .filter(ps => ps.employee_id === selectedCycleEmployeeId)
      .sort((a, b) => {
        const runA = runsMap.get(a.payroll_run_id);
        const runB = runsMap.get(b.payroll_run_id);
        const keyA = runA ? `${runA.year}-${String(runA.month).padStart(2, '0')}` : '';
        const keyB = runB ? `${runB.year}-${String(runB.month).padStart(2, '0')}` : '';
        return keyB.localeCompare(keyA);
      });
  }, [tenantId, selectedCycleEmployeeId, cyclePayslips, payslipsRefreshKey, payrollStorageRevision]);

  const runsMap = useMemo(() => {
    if (!tenantId) return new Map<string, PayrollRun>();
    const runs = storageService.getPayrollRuns(tenantId);
    return new Map(runs.map(r => [r.id, r]));
  }, [tenantId, cyclePayslips, payslipsRefreshKey, payrollStorageRevision]);

  // Bulk pay: selected payslip ids (only unpaid/partial)
  const [selectedPayslipIds, setSelectedPayslipIds] = useState<string[]>([]);
  const [bulkPayModalOpen, setBulkPayModalOpen] = useState(false);
  // Edit payment (transaction) record in Payments view
  const [paymentTransactionToEdit, setPaymentTransactionToEdit] = useState<Transaction | null>(null);
  const [paymentWarningModalState, setPaymentWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'delete' | 'update' | null }>({ isOpen: false, transaction: null, action: null });
  const displayPayslipsForBulk = selectedCycleEmployeeId ? payslipsForSelectedEmployee : cyclePayslips;
  const payableIdsInView = useMemo(() => {
    return displayPayslipsForBulk.filter((ps) => !payslipIsFullyPaid(ps)).map((ps) => ps.id);
  }, [displayPayslipsForBulk]);
  const bulkPayItems = useMemo((): BulkPayItem[] => {
    const employees = storageService.getEmployees(tenantId);
    return selectedPayslipIds
      .filter((id) => displayPayslipsForBulk.some((p) => p.id === id))
      .map((id) => {
        const ps = displayPayslipsForBulk.find((p) => p.id === id)!;
        const employee = employees.find((e) => e.id === ps.employee_id) || null;
        const run = runsMap.get(ps.payroll_run_id) || null;
        return { payslip: ps, employee, run };
      })
      .filter((i) => payslipRemainingAmount(i.payslip) > 0);
  }, [tenantId, selectedPayslipIds, displayPayslipsForBulk, runsMap]);
  const togglePayslipSelection = (id: string) => {
    setSelectedPayslipIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const selectAllPayables = () => {
    const allSelected = payableIdsInView.length > 0 && payableIdsInView.every((id) => selectedPayslipIds.includes(id));
    setSelectedPayslipIds(allSelected ? [] : [...payableIdsInView]);
  };

  // Record type filter (Payslips | Payments | All) and month/year filter
  const [tableRecordFilter, setTableRecordFilter] = useState<TableRecordFilter>('payslips');
  const [filterYear, setFilterYear] = useState<number | ''>('');
  const [filterMonth, setFilterMonth] = useState<number | ''>('');
  const allPayslips = storageService.getPayslips(tenantId);
  const payslipIdsByTenant = useMemo(() => new Set(allPayslips.map((p) => p.id)), [allPayslips]);
  const paymentRecords = useMemo(() => {
    const txs = (appState.transactions || []).filter(
      (t: { payslipId?: string }) => t.payslipId && payslipIdsByTenant.has(t.payslipId)
    );
    const employees = storageService.getEmployees(tenantId);
    const accounts = (appState.accounts || []) as { id: string; name: string }[];
    return txs.map((tx: any) => {
      const ps = allPayslips.find((p) => p.id === tx.payslipId);
      const emp = ps ? employees.find((e) => e.id === ps.employee_id) : null;
      const run = ps ? runsMap.get(ps.payroll_run_id) : null;
      const account = accounts.find((a) => a.id === tx.accountId);
      return {
        id: tx.id,
        type: 'payment' as const,
        transaction: tx,
        payslip: ps ?? null,
        employee: emp ?? null,
        run: run ?? null,
        employeeName: emp?.name ?? ps?.employee_id ?? '—',
        periodLabel: run ? `${run.month} ${run.year}` : '—',
        payslipNetPay: ps?.net_pay ?? 0,
        paymentAmount: tx.amount,
        paymentDate: tx.date,
        accountName: account?.name ?? '—',
        description: tx.description ?? '—',
      };
    });
  }, [appState.transactions, appState.accounts, payslipIdsByTenant, allPayslips, tenantId, runsMap]);
  const yearMonthOptions = useMemo(() => {
    const years = new Set<number>();
    const monthsByYear = new Map<number, Set<number>>();
    runsMap.forEach((r) => {
      years.add(r.year);
      if (!monthsByYear.has(r.year)) monthsByYear.set(r.year, new Set());
      monthsByYear.get(r.year)!.add(MONTH_LABEL_TO_NUM[r.month] ?? 0);
    });
    paymentRecords.forEach((pr) => {
      const d = pr.paymentDate ? new Date(pr.paymentDate) : null;
      if (d && !isNaN(d.getTime())) {
        years.add(d.getFullYear());
        if (!monthsByYear.has(d.getFullYear())) monthsByYear.set(d.getFullYear(), new Set());
        monthsByYear.get(d.getFullYear())!.add(d.getMonth() + 1);
      }
    });
    const yearList = Array.from(years).sort((a, b) => b - a);
    return { years: yearList, monthsByYear };
  }, [runsMap, paymentRecords]);
  // When an employee is selected, show only that employee's payment records (same as payslips)
  const filteredPaymentRecords = useMemo(() => {
    let list = paymentRecords;
    if (selectedCycleEmployeeId) {
      list = list.filter((pr) => pr.payslip?.employee_id === selectedCycleEmployeeId);
    }
    if (filterYear === '' && filterMonth === '') return list;
    return list.filter((pr) => {
      const d = pr.paymentDate ? new Date(pr.paymentDate) : null;
      if (!d || isNaN(d.getTime())) return false;
      if (filterYear !== '' && d.getFullYear() !== filterYear) return false;
      if (filterMonth !== '' && d.getMonth() + 1 !== filterMonth) return false;
      return true;
    });
  }, [paymentRecords, selectedCycleEmployeeId, filterYear, filterMonth]);
  const filteredPayslipsForTable = useMemo(() => {
    const list = selectedCycleEmployeeId ? payslipsForSelectedEmployee : cyclePayslips;
    if (filterYear === '' && filterMonth === '') return list;
    return list.filter((ps) => {
      const run = runsMap.get(ps.payroll_run_id);
      if (!run) return false;
      const runMonthNum = MONTH_LABEL_TO_NUM[run.month] ?? 0;
      if (filterYear !== '' && run.year !== filterYear) return false;
      if (filterMonth !== '' && runMonthNum !== filterMonth) return false;
      return true;
    });
  }, [selectedCycleEmployeeId, payslipsForSelectedEmployee, cyclePayslips, runsMap, filterYear, filterMonth]);

  const handleBackDateSuccess = useCallback((runId: string, payslips: Payslip[]) => {
    setSelectedRunId(runId);
    setCyclePayslips(payslips);
  }, []);

  // Create salary for "current month" = last calendar month (first to last day of previous month)
  const handleCreateCurrentMonth = useCallback(async () => {
    if (!tenantId || !userId) return;
    setCreatingCurrentMonth(true);
    try {
      const now = new Date();
      const lastMonth0 = now.getMonth() - 1; // 0-indexed previous month
      const lastMonthYear = lastMonth0 < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const lastMonth1Based = lastMonth0 < 0 ? 12 : lastMonth0 + 1; // 1-12
      const { runId, payslips } = await runSalaryCreationForPeriodAsync(tenantId, userId, lastMonthYear, lastMonth1Based);
      setSelectedRunId(runId);
      setCyclePayslips(payslips);
    } catch (e) {
      console.error('Create current month failed:', e);
      const msg = e instanceof Error ? e.message : 'Could not create payroll for last month.';
      showToast(msg, 'error');
    } finally {
      setCreatingCurrentMonth(false);
    }
  }, [tenantId, userId, showToast]);

  const openEditPayslip = (ps: Payslip) => {
    const employees = storageService.getEmployees(tenantId);
    const emp = employees.find(e => e.id === ps.employee_id) || null;
    setEditingPayslip(ps);
    setEditingEmployee(emp);
    setEditPayslipModalOpen(true);
  };

  const getPaymentLinkedItemName = (tx: Transaction | null): string => {
    if (!tx || !tx.payslipId) return 'a linked item';
    return 'payroll payslip payment';
  };
  const handlePaymentShowDeleteWarning = (tx: Transaction) => {
    setPaymentTransactionToEdit(null);
    setPaymentWarningModalState({ isOpen: true, transaction: tx, action: 'delete' });
  };
  const handlePaymentCloseWarning = () => {
    setPaymentWarningModalState({ isOpen: false, transaction: null, action: null });
  };
  const handlePaymentConfirmWarning = () => {
    const { transaction, action } = paymentWarningModalState;
    if (transaction && action === 'delete') {
      dispatch({ type: 'DELETE_TRANSACTION', payload: transaction.id });
      const linkedName = getPaymentLinkedItemName(transaction);
      showToast(`Transaction deleted successfully. The linked ${linkedName} has been updated.`, 'info');
    }
    handlePaymentCloseWarning();
  };

  useEffect(() => {
    if (activeSubTab === 'cycles' && tenantId && selectedRunId) {
      setCyclePayslips(storageService.getPayslipsByRunId(tenantId, selectedRunId));
    }
  }, [activeSubTab, tenantId, selectedRunId]);

  // Local-only: hydrate from SQLite. API mode: pull payroll from PostgreSQL into localStorage cache.
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    if (isLocalOnlyMode()) {
      hydratePayrollFromDb(tenantId).then(async (result) => {
        if (cancelled) return;
        let { runs, payslips, employees, departments, grades } = result;
        if (employees.length === 0 && runs.length === 0) {
          const fallback = await hydratePayrollFromDb('local');
          employees = fallback.employees;
          departments = fallback.departments;
          grades = fallback.grades;
          runs = fallback.runs;
          payslips = fallback.payslips;
        }
        if (employees.length > 0) storageService.setEmployees(tenantId, employees);
        if (departments.length > 0) storageService.setDepartments(tenantId, departments);
        if (grades.length > 0) storageService.setGradeLevels(tenantId, grades);
        if (runs.length > 0) storageService.setPayrollRuns(tenantId, runs);
        if (payslips.length > 0) storageService.setPayslips(tenantId, payslips);
        if (selectedRunId) setCyclePayslips(storageService.getPayslipsByRunId(tenantId, selectedRunId));
        setPayrollStorageRevision((r) => r + 1);
      }).catch(() => {
        if (!cancelled) setPayrollStorageRevision((r) => r + 1);
      });
    } else {
      syncPayrollFromServer(tenantId)
        .then(() => {
          if (cancelled) return;
          if (selectedRunId) setCyclePayslips(storageService.getPayslipsByRunId(tenantId, selectedRunId));
          setPayrollStorageRevision((r) => r + 1);
        })
        .catch(() => {
          if (!cancelled) setPayrollStorageRevision((r) => r + 1);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    const onStorageUpdated = (ev: Event) => {
      const t = (ev as CustomEvent<{ tenantId?: string }>).detail?.tenantId;
      if (t && t !== tenantId) return;
      setPayrollStorageRevision((r) => r + 1);
      if (selectedRunId && tenantId) {
        setCyclePayslips(storageService.getPayslipsByRunId(tenantId, selectedRunId));
      }
    };
    window.addEventListener('pbooks-payroll-storage-updated', onStorageUpdated as EventListener);
    return () => window.removeEventListener('pbooks-payroll-storage-updated', onStorageUpdated as EventListener);
  }, [tenantId, selectedRunId]);

  // Navigation tabs: Workforce, Payroll Cycle, Analytics, Payment History, Settings
  const hrTabs = [
    { id: 'workforce' as const, label: 'Workforce', icon: Users },
    { id: 'cycles' as const, label: 'Payroll Cycle', icon: CreditCard },
    { id: 'report' as const, label: 'Analytics', icon: BarChart3 },
    { id: 'history' as const, label: 'Payment History', icon: History },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  const payrollSubNav = useCollapsibleSubNav('subnav_payroll');

  // Unpaid (remaining) amount per employee (across all runs) for tree view
  const unpaidByEmployeeId = useMemo((): Map<string, number> => {
    if (activeSubTab !== 'cycles' || !tenantId) return new Map();
    const payslips = storageService.getPayslips(tenantId);
    const map = new Map<string, number>();
    payslips.forEach((ps) => {
      const remaining = payslipRemainingAmount(ps);
      if (remaining > 0) {
        map.set(ps.employee_id, (map.get(ps.employee_id) ?? 0) + remaining);
      }
    });
    return map;
  }, [tenantId, activeSubTab, cyclePayslips, payrollStorageRevision]);

  // Employee tree for Payroll Cycle tab: group by department, show name + total unpaid
  const employeeTree = useMemo((): TreeNode[] => {
    if (activeSubTab !== 'cycles') return [];
    const employees = storageService.getEmployees(tenantId);
    if (employees.length === 0) return [];
    const byDept = new Map<string, PayrollEmployee[]>();
    employees.forEach((emp) => {
      const dept = emp.department || 'Other';
      if (!byDept.has(dept)) byDept.set(dept, []);
      byDept.get(dept)!.push(emp);
    });
    return Array.from(byDept.entries()).map(([dept, emps]) => ({
      id: `dept-${dept}`,
      label: dept,
      type: 'department',
      children: emps.map((emp) => {
        const unpaid = unpaidByEmployeeId.get(emp.id) ?? 0;
        return {
          id: emp.id,
          label: emp.name,
          value: unpaid,
          valueColor: unpaid > 0 ? 'text-ds-warning' : undefined,
          type: 'employee',
        };
      }),
    }));
  }, [tenantId, activeSubTab, unpaidByEmployeeId, payrollStorageRevision]);

  // If no tenant, show loading or error
  if (!tenantId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-app-muted font-bold">Loading payroll module...</p>
      </div>
    );
  }

  // For employee-only role, show their profile only
  if (isEmployeeRole) {
    const employees = storageService.getEmployees(tenantId);
    const selfEmployee = employees.find(e => e.email === user?.username) || employees[0];

    if (selfEmployee) {
      return (
        <EmployeeProfile
          employee={selfEmployee}
          onBack={() => { }}
          payrollStorageRevision={payrollStorageRevision}
        />
      );
    }

    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-app-muted font-bold">Initializing your secure profile...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0 w-full -mx-2 -mb-2 sm:-mx-3 sm:-mb-3 md:-mx-4 md:-mb-4 lg:-mx-6 lg:-mb-6 xl:-mx-8 xl:-mb-8">
      {/* Second-level navigation (desktop) */}
      <aside
        className={`hidden md:flex flex-col shrink-0 border-r border-app-border bg-app-toolbar/30 h-full min-h-0 no-print overflow-hidden transition-[width] duration-200 ease-out ${payrollSubNav.effectiveCollapsed ? 'w-14' : 'w-60'}`}
        aria-label="Payroll module navigation"
      >
        <div
          className={`border-b border-app-border shrink-0 flex items-center gap-1 ${payrollSubNav.effectiveCollapsed ? 'flex-col py-2 px-1' : 'justify-between px-3 py-2.5'}`}
        >
          {!payrollSubNav.effectiveCollapsed && (
            <p className="text-[10px] font-bold uppercase tracking-wider text-app-muted">Payroll</p>
          )}
          <SubNavModeToggle
            collapsed={payrollSubNav.effectiveCollapsed}
            onToggle={payrollSubNav.toggle}
            title={payrollSubNav.toggleTitle}
            compact
          />
        </div>
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-0.5 scrollbar-thin min-h-0" aria-label="Payroll sections">
          {hrTabs.map((t) => {
            const Icon = t.icon;
            const on = activeSubTab === t.id;
            if (payrollSubNav.effectiveCollapsed) {
              return (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  onClick={() => setActiveSubTab(t.id)}
                  className={`w-full flex items-center justify-center p-2 rounded-md transition-colors ${on
                    ? 'bg-primary text-ds-on-primary shadow-sm'
                    : 'text-app-muted hover:bg-app-toolbar/60 hover:text-app-text'
                    }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${on ? 'text-ds-on-primary' : 'opacity-80'}`} aria-hidden />
                </button>
              );
            }
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveSubTab(t.id)}
                className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${on
                  ? 'bg-primary text-ds-on-primary shadow-sm'
                  : 'text-app-muted hover:bg-app-toolbar/60 hover:text-app-text'
                  }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${on ? 'text-ds-on-primary' : 'opacity-80'}`} aria-hidden />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="md:hidden shrink-0 border-b border-app-border bg-app-toolbar/30 px-3 py-2 no-print">
        <label htmlFor="payroll-section" className="block text-[10px] font-bold uppercase tracking-wider text-app-muted mb-1">Payroll</label>
        <select
          id="payroll-section"
          value={activeSubTab}
          onChange={(e) => setActiveSubTab(e.target.value as PayrollSubTab)}
          className="ds-input-field w-full rounded-lg border border-app-border bg-app-card text-app-text text-sm py-2 px-3"
          aria-label="Payroll section"
        >
          {hrTabs.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Tab content - fills viewport; cycles uses fixed layout with independent scrolls, others scroll in this area */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-app-card rounded-lg md:rounded-l-none md:border-l-0 border border-app-border animate-in fade-in duration-500">
        {activeSubTab === 'workforce' && (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4 lg:p-6 xl:p-8 pb-20 sm:pb-24 md:pb-6">
          {selectedEmployee ? (
            <EmployeeProfile
              employee={selectedEmployee}
              onBack={() => setSelectedEmployee(null)}
              onUpdate={(updated) => setSelectedEmployee(updated)}
              payrollStorageRevision={payrollStorageRevision}
            />
          ) : isAddingEmployee ? (
            <EmployeeForm
              onBack={() => setIsAddingEmployee(false)}
              onSave={() => {
                setIsAddingEmployee(false);
                setWorkforceRefreshKey(k => k + 1);
              }}
            />
          ) : (
            <EmployeeList
              key={`${workforceRefreshKey}-${payrollStorageRevision}`}
              onSelect={setSelectedEmployee}
              onAdd={() => setIsAddingEmployee(true)}
            />
          )}
          </div>
        )}

        {activeSubTab === 'cycles' && (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden p-2 sm:p-3 md:p-4 lg:p-6 xl:p-8">
            <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-app-text tracking-tight">Payroll Cycle</h1>
                <p className="text-app-muted text-xs sm:text-sm">Create and manage salary runs for your workforce.</p>
              </div>
            </div>
            <div className="flex-shrink-0 flex flex-wrap gap-3 sm:gap-4 mb-4 sm:mb-6">
              <button
                type="button"
                onClick={handleCreateCurrentMonth}
                disabled={creatingCurrentMonth}
                className="bg-primary text-ds-on-primary px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl font-bold hover:opacity-90 transition-all shadow-ds-card flex items-center justify-center gap-2 text-sm disabled:opacity-70"
              >
                {creatingCurrentMonth ? <Loader2 size={18} className="animate-spin" /> : <Calendar size={18} />}
                {creatingCurrentMonth ? 'Creating...' : 'Create salary for the current month'}
              </button>
              <button
                type="button"
                onClick={() => setBackDateModalOpen(true)}
                className="bg-app-toolbar text-app-text border-2 border-app-border px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl font-bold hover:bg-app-toolbar/80 transition-all flex items-center justify-center gap-2 text-sm"
              >
                <CalendarClock size={18} />
                Create salary in back date
              </button>
            </div>

            {/* Split: tree and table fixed to bottom, each with own scroll */}
            <div
              ref={splitRef}
              data-cycles-split
              className="flex flex-col lg:flex-row gap-0 flex-1 min-h-0"
            >
              {/* Left: Employee tree view - resizable, scrollable */}
              <div
                className="bg-app-card rounded-2xl border border-app-border shadow-ds-card overflow-hidden flex flex-col lg:rounded-r-none flex-shrink-0 min-h-0"
                style={isLg ? { width: `${treePanelWidth}%`, minWidth: 200 } : undefined}
              >
                <div className="flex-shrink-0 px-4 py-3 border-b border-app-border bg-app-toolbar/40">
                  <h2 className="text-sm font-bold text-app-text uppercase tracking-wider">Employees</h2>
                  <p className="text-xs text-app-muted mt-0.5">Name and total salary unpaid</p>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-3">
                  <TreeView
                    nodes={employeeTree}
                    showLines
                    defaultExpanded={true}
                    selectedId={selectedCycleEmployeeId}
                    onSelect={(id, type) => type === 'employee' ? setSelectedCycleEmployeeId(id) : setSelectedCycleEmployeeId(null)}
                  />
                </div>
              </div>

              {/* Resizer - only on lg+ when side by side */}
              <div
                role="separator"
                aria-label="Resize panels"
                onMouseDown={() => setIsResizing(true)}
                className={`hidden lg:block w-2 flex-shrink-0 cursor-col-resize bg-app-border hover:bg-primary/50 transition-colors ${isResizing ? 'bg-primary' : ''}`}
                style={{ minWidth: 8 }}
              />

              {/* Right: Payslips data table - scrollable */}
              <div className="bg-app-card rounded-2xl border border-app-border shadow-ds-card overflow-hidden flex flex-col lg:rounded-l-none flex-1 min-w-0 min-h-0">
                <div className="flex-shrink-0 px-4 py-3 border-b border-app-border bg-app-toolbar/40 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-sm font-bold text-app-text uppercase tracking-wider">Payslips &amp; payments</h2>
                      <p className="text-xs text-app-muted mt-0.5">
                        {tableRecordFilter === 'payslips' && (selectedCycleEmployeeId
                          ? `${payslipsForSelectedEmployee.length} payslip(s) for selected employee`
                          : selectedRunId
                            ? `${cyclePayslips.length} payslip(s) in this run`
                            : 'Select an employee from the tree or create salary (back date).')}
                        {tableRecordFilter === 'payments' && (selectedCycleEmployeeId
                          ? `${filteredPaymentRecords.length} payment(s) for selected employee`
                          : `${filteredPaymentRecords.length} payment record(s)`)}
                        {tableRecordFilter === 'all' && `${filteredPayslipsForTable.length} payslip(s) + ${filteredPaymentRecords.length} payment(s)`}
                      </p>
                    </div>
                    {tableRecordFilter === 'payslips' && selectedPayslipIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setBulkPayModalOpen(true)}
                        className="bg-ds-success text-white px-4 py-2 rounded-xl font-bold text-sm hover:opacity-90 flex items-center gap-2"
                      >
                        <Banknote size={16} /> Pay selected ({selectedPayslipIds.length})
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-app-text">
                      <span>Show:</span>
                      <select
                        value={tableRecordFilter}
                        onChange={(e) => setTableRecordFilter(e.target.value as TableRecordFilter)}
                        className="ds-input-field border border-app-border rounded-lg px-2 py-1.5 text-sm bg-app-card"
                        aria-label="Show records"
                      >
                        <option value="payslips">Payslips</option>
                        <option value="payments">Payments</option>
                        <option value="all">All (payslips + payments)</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium text-app-text">
                      <span>Year:</span>
                      <select
                        value={filterYear === '' ? '' : filterYear}
                        onChange={(e) => setFilterYear(e.target.value === '' ? '' : Number(e.target.value))}
                        className="ds-input-field border border-app-border rounded-lg px-2 py-1.5 text-sm bg-app-card min-w-[5rem]"
                      >
                        <option value="">All</option>
                        {yearMonthOptions.years.map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium text-app-text">
                      <span>Month:</span>
                      <select
                        value={filterMonth === '' ? '' : filterMonth}
                        onChange={(e) => setFilterMonth(e.target.value === '' ? '' : Number(e.target.value))}
                        className="ds-input-field border border-app-border rounded-lg px-2 py-1.5 text-sm bg-app-card min-w-[6rem]"
                        aria-label="Filter month"
                      >
                        <option value="">All</option>
                        {(filterYear !== ''
                          ? Array.from(yearMonthOptions.monthsByYear.get(filterYear) ?? []).sort((a, b) => a - b)
                          : Array.from({ length: 12 }, (_, i) => i + 1)
                        ).map((m) => (
                          <option key={m} value={m}>{Object.keys(MONTH_LABEL_TO_NUM).find((k) => MONTH_LABEL_TO_NUM[k] === m) ?? String(m)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-auto p-4">
                  <table className="w-full text-left text-sm">
                    {tableRecordFilter === 'payments' && (
                      <thead>
                        <tr className="border-b border-app-border text-app-muted font-semibold">
                          <th className="py-3 pr-4">Employee</th>
                          <th className="py-3 pr-4">Period</th>
                          <th className="py-3 pr-4">Payslip date</th>
                          <th className="py-3 pr-4">Payslip net pay</th>
                          <th className="py-3 pr-4">Payment amount</th>
                          <th className="py-3 pr-4">Payment date</th>
                          <th className="py-3 pr-4">Account</th>
                          <th className="py-3 pr-4">Description</th>
                          <th className="py-3 pr-4 text-right">Actions</th>
                        </tr>
                      </thead>
                    )}
                    {(tableRecordFilter === 'payslips' || tableRecordFilter === 'all') && (
                    <thead>
                      <tr className="border-b border-app-border text-app-muted font-semibold">
                        {tableRecordFilter === 'all' && <th className="py-3 pr-4">Record type</th>}
                        <th className="py-3 pr-2 w-10">
                          {tableRecordFilter === 'payslips' && payableIdsInView.length > 0 && (
                            <button
                              type="button"
                              onClick={selectAllPayables}
                              className="inline-flex items-center justify-center w-6 h-6 rounded border border-app-border hover:bg-app-toolbar/50"
                              title={payableIdsInView.every((id) => selectedPayslipIds.includes(id)) ? 'Clear selection' : 'Select all payables'}
                            >
                              {payableIdsInView.every((id) => selectedPayslipIds.includes(id)) ? '✓' : ''}
                            </button>
                          )}
                        </th>
                        <th className="py-3 pr-4">
                          <button type="button" onClick={() => handlePayslipSort('employee')} className="inline-flex items-center gap-1 hover:text-app-text focus:outline-none">
                            Employee {payslipSortColumn === 'employee' ? (payslipSortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={14} className="opacity-50" />}
                          </button>
                        </th>
                        {(selectedCycleEmployeeId || tableRecordFilter === 'all') && (
                          <th className="py-3 pr-4">
                            <button type="button" onClick={() => handlePayslipSort('period')} className="inline-flex items-center gap-1 hover:text-app-text focus:outline-none">
                              Period {payslipSortColumn === 'period' ? (payslipSortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={14} className="opacity-50" />}
                            </button>
                          </th>
                        )}
                        <th className="py-3 pr-4">Date</th>
                        <th className="py-3 pr-4">
                          <button type="button" onClick={() => handlePayslipSort('projects')} className="inline-flex items-center gap-1 hover:text-app-text focus:outline-none">
                            Project / building {payslipSortColumn === 'projects' ? (payslipSortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={14} className="opacity-50" />}
                          </button>
                        </th>
                        <th className="py-3 pr-4">
                          <button type="button" onClick={() => handlePayslipSort('paid_amount')} className="inline-flex items-center gap-1 hover:text-app-text focus:outline-none">
                            Paid amount {payslipSortColumn === 'paid_amount' ? (payslipSortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={14} className="opacity-50" />}
                          </button>
                        </th>
                        <th className="py-3 pr-4">
                          <button type="button" onClick={() => handlePayslipSort('remaining')} className="inline-flex items-center gap-1 hover:text-app-text focus:outline-none">
                            Remaining amount {payslipSortColumn === 'remaining' ? (payslipSortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={14} className="opacity-50" />}
                          </button>
                        </th>
                        <th className="py-3 pr-4">
                          <button type="button" onClick={() => handlePayslipSort('gross_pay')} className="inline-flex items-center gap-1 hover:text-app-text focus:outline-none">
                            Total salary {payslipSortColumn === 'gross_pay' ? (payslipSortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={14} className="opacity-50" />}
                          </button>
                        </th>
                        <th className="py-3 pr-4">
                          <button type="button" onClick={() => handlePayslipSort('status')} className="inline-flex items-center gap-1 hover:text-app-text focus:outline-none">
                            Status {payslipSortColumn === 'status' ? (payslipSortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={14} className="opacity-50" />}
                          </button>
                        </th>
                        {tableRecordFilter === 'all' ? <th className="py-3 pr-4">Description</th> : null}
                        <th className="py-3 pr-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    )}
                    <tbody>
                      {tableRecordFilter === 'payments' && (() => {
                        if (filteredPaymentRecords.length === 0) {
                          return (
                            <tr>
                              <td colSpan={9} className="py-12 text-center text-app-muted text-sm">
                                No payment records for the selected filters.
                              </td>
                            </tr>
                          );
                        }
                        return filteredPaymentRecords.map((pr) => (
                          <tr key={pr.id} className="border-b border-app-border hover:bg-app-toolbar/30">
                            <td className="py-3 pr-4 font-medium text-app-text">{pr.employeeName}</td>
                            <td className="py-3 pr-4 text-app-muted">{pr.periodLabel}</td>
                            <td className="py-3 pr-4 text-app-muted">{formatTableDate(pr.payslip?.created_at)}</td>
                            <td className="py-3 pr-4 tabular-nums">{pr.payslipNetPay.toLocaleString()}</td>
                            <td className="py-3 pr-4 tabular-nums">{pr.paymentAmount.toLocaleString()}</td>
                            <td className="py-3 pr-4 text-app-muted">{formatTableDate(pr.paymentDate)}</td>
                            <td className="py-3 pr-4 text-app-muted">{pr.accountName}</td>
                            <td className="py-3 pr-4 text-app-muted max-w-[200px] truncate" title={pr.description}>{pr.description}</td>
                            <td className="py-3 pr-4 text-right">
                              <button
                                type="button"
                                onClick={() => setPaymentTransactionToEdit(pr.transaction)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-primary hover:bg-primary/10 font-medium text-xs"
                                title="Edit payment record"
                              >
                                <Pencil size={14} /> Edit
                              </button>
                            </td>
                          </tr>
                        ));
                      })()}
                      {(tableRecordFilter === 'payslips' || tableRecordFilter === 'all') && (() => {
                        const displayPayslips = tableRecordFilter === 'all' ? filteredPayslipsForTable : filteredPayslipsForTable;
                        const colCount = selectedCycleEmployeeId ? (tableRecordFilter === 'all' ? 12 : 10) : (tableRecordFilter === 'all' ? 11 : 9);
                        if (tableRecordFilter === 'payslips') {
                          if (selectedCycleEmployeeId && displayPayslips.length === 0) {
                            return (
                              <tr>
                                <td colSpan={colCount} className="py-12 text-center text-app-muted text-sm">
                                  No payslips for this employee yet.
                                </td>
                              </tr>
                            );
                          }
                          if (!selectedCycleEmployeeId && (!selectedRunId || cyclePayslips.length === 0)) {
                            return (
                              <tr>
                                <td colSpan={colCount} className="py-12 text-center text-app-muted text-sm">
                                  {selectedRunId ? 'No payslips in this run.' : 'No run selected. Create salary (back date) or select an employee from the tree.'}
                                </td>
                              </tr>
                            );
                          }
                        }
                        if (tableRecordFilter === 'all' && filteredPayslipsForTable.length === 0 && filteredPaymentRecords.length === 0) {
                          return (
                            <tr>
                              <td colSpan={12} className="py-12 text-center text-app-muted text-sm">
                                No payslips or payments for the selected filters.
                              </td>
                            </tr>
                          );
                        }
                        if (tableRecordFilter === 'payslips' && displayPayslips.length === 0) {
                          return (
                            <tr>
                              <td colSpan={colCount} className="py-12 text-center text-app-muted text-sm">
                                No payslips match the selected filters. Try a different month/year or run.
                              </td>
                            </tr>
                          );
                        }
                        const employees = storageService.getEmployees(tenantId);
                        const statusOrder = (s: string) => (s === 'Unpaid' ? 0 : s === 'Partially paid' ? 1 : 2);
                        const rows = displayPayslips.map((ps) => {
                          const emp = employees.find(e => e.id === ps.employee_id);
                          const name = emp?.name ?? ps.employee_id;
                          const projectInfo = formatPayslipAssignmentDisplay(ps, emp);
                          const run = runsMap.get(ps.payroll_run_id);
                          const periodLabel = run ? `${run.year}-${String(run.month).padStart(2, '0')}` : '—';
                          const periodSortKey = run ? run.year * 100 + (MONTH_LABEL_TO_NUM[run.month] ?? 0) : 0;
                          const paidAmt = payslipDisplayPaidAmount(ps);
                          const remainingAmt = payslipRemainingAmount(ps);
                          const isFullyPaid = payslipIsFullyPaid(ps);
                          const isPartiallyPaid = paidAmt > 0 && !isFullyPaid;
                          const status = isFullyPaid ? 'Paid' : isPartiallyPaid ? 'Partially paid' : 'Unpaid';
                          return { ps, emp, run, name, periodLabel, periodSortKey, projectInfo, status, statusOrder: statusOrder(status), paid_amount: paidAmt, remaining: remainingAmt, gross_pay: ps.gross_pay, isFullyPaid };
                        });
                        const sortedRows = payslipSortColumn
                          ? [...rows].sort((a, b) => {
                              const mul = payslipSortDir === 'asc' ? 1 : -1;
                              switch (payslipSortColumn) {
                                case 'employee': return mul * (a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
                                case 'period': return mul * (a.periodSortKey - b.periodSortKey);
                                case 'projects': return mul * (a.projectInfo.localeCompare(b.projectInfo, undefined, { sensitivity: 'base' }));
                                case 'paid_amount': return mul * (a.paid_amount - b.paid_amount);
                                case 'remaining': return mul * (a.remaining - b.remaining);
                                case 'gross_pay': return mul * (a.gross_pay - b.gross_pay);
                                case 'status': return mul * (a.statusOrder - b.statusOrder);
                                default: return 0;
                              }
                            })
                          : rows;
                        const payslipRows = sortedRows.map(({ ps, emp, run, name, periodLabel, projectInfo, status, isFullyPaid }) => {
                          const paidAmt = payslipDisplayPaidAmount(ps);
                          const remainingAmt = payslipRemainingAmount(ps);
                          const isPayable = !isFullyPaid;
                          const isSelected = selectedPayslipIds.includes(ps.id);
                          return (
                          <tr key={`ps-${ps.id}`} className="border-b border-app-border hover:bg-app-toolbar/30">
                            {tableRecordFilter === 'all' && <td className="py-3 pr-4"><span className="px-2 py-0.5 rounded bg-app-toolbar text-app-text text-xs font-medium">Payslip</span></td>}
                            <td className="py-3 pr-2 w-10">
                              {isPayable ? (
                                <button
                                  type="button"
                                  onClick={() => togglePayslipSelection(ps.id)}
                                  className="inline-flex items-center justify-center w-6 h-6 rounded border border-app-border hover:bg-app-toolbar/50"
                                  aria-label={isSelected ? 'Deselect' : 'Select'}
                                >
                                  {isSelected ? '✓' : ''}
                                </button>
                              ) : null}
                            </td>
                            <td className="py-3 pr-4 font-medium text-app-text">{name}</td>
                            {(selectedCycleEmployeeId || tableRecordFilter === 'all') && <td className="py-3 pr-4 text-app-muted">{periodLabel}</td>}
                            <td className="py-3 pr-4 text-app-muted">{formatTableDate(ps.created_at)}</td>
                            <td className="py-3 pr-4 text-app-muted max-w-[180px] truncate" title={projectInfo}>{projectInfo}</td>
                            <td className="py-3 pr-4 tabular-nums">{paidAmt.toLocaleString()}</td>
                            <td className="py-3 pr-4 tabular-nums">{remainingAmt.toLocaleString()}</td>
                            <td className="py-3 pr-4 tabular-nums">{ps.gross_pay.toLocaleString()}</td>
                            <td className="py-3 pr-4">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${isFullyPaid ? 'bg-ds-success/15 text-ds-success' : status === 'Partially paid' ? 'bg-primary/15 text-primary' : 'bg-ds-warning/15 text-ds-warning'}`}>
                                {status}
                              </span>
                            </td>
                            {tableRecordFilter === 'all' && <td className="py-3 pr-4 text-app-muted">—</td>}
                            <td className="py-3 pr-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditPayslip(ps)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-primary hover:bg-primary/10 font-medium text-xs"
                                >
                                  <Pencil size={14} /> Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={isFullyPaid}
                                  title={isFullyPaid ? 'Already fully paid' : status === 'Partially paid' ? 'Pay remaining amount' : 'Pay salary'}
                                  onClick={() => {
                                    setPayModalPayslip(ps);
                                    setPayModalEmployee(emp || null);
                                    setPayModalRun(run || null);
                                  }}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-medium text-xs ${isFullyPaid ? 'text-app-muted cursor-not-allowed bg-app-toolbar' : 'text-ds-success hover:bg-ds-success/10'}`}
                                >
                                  <Banknote size={14} /> Pay
                                </button>
                                {(() => {
                                  const companyName = tenant?.companyName || tenant?.name || 'Company';
                                  const message = run ? `Payslip for ${run.month} ${run.year}: Net Pay PKR ${formatCurrency(ps.net_pay)}. ${companyName}.` : '';
                                  const phone = (emp?.phone || '').replace(/\D/g, '');
                                  const waNumber = phone.startsWith('0') ? '92' + phone.slice(1) : phone.length >= 10 ? '92' + phone : '';
                                  const hasPhone = !!waNumber;
                                  const contactLike: Contact = { id: emp?.id ?? ps.employee_id, name, type: ContactType.OWNER, contactNo: waNumber || emp?.phone || '' };
                                  const handleWhatsApp = () => {
                                    try {
                                      sendOrOpenWhatsApp(
                                        { contact: contactLike, message, phoneNumber: contactLike.contactNo || undefined },
                                        () => appState.whatsAppMode ?? 'manual',
                                        openChat
                                      );
                                    } catch (_err) {
                                      // no-op or could show toast
                                    }
                                  };
                                  return (
                                    <button
                                      type="button"
                                      disabled={!hasPhone}
                                      title={hasPhone ? 'Send payslip via WhatsApp' : 'Add employee phone to send via WhatsApp'}
                                      onClick={handleWhatsApp}
                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-medium text-xs ${hasPhone ? 'text-ds-success hover:bg-ds-success/10' : 'text-app-muted cursor-not-allowed bg-app-toolbar'}`}
                                    >
                                      <MessageCircle size={14} /> WhatsApp
                                    </button>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                          );
                        });
                        const paymentRowsForAll = tableRecordFilter === 'all' ? filteredPaymentRecords.map((pr) => (
                          <tr key={`pay-${pr.id}`} className="border-b border-app-border hover:bg-app-toolbar/30 bg-app-toolbar/20">
                            <td className="py-3 pr-4"><span className="px-2 py-0.5 rounded bg-ds-success/15 text-ds-success text-xs font-medium">Payment</span></td>
                            <td className="py-3 pr-2 w-10" />
                            <td className="py-3 pr-4 font-medium text-app-text">{pr.employeeName}</td>
                            <td className="py-3 pr-4 text-app-muted">{pr.periodLabel}</td>
                            <td className="py-3 pr-4 text-app-muted">{formatTableDate(pr.paymentDate)}</td>
                            <td className="py-3 pr-4 text-app-muted">—</td>
                            <td className="py-3 pr-4 tabular-nums">{pr.paymentAmount.toLocaleString()}</td>
                            <td className="py-3 pr-4 text-app-muted">—</td>
                            <td className="py-3 pr-4 text-app-muted">—</td>
                            <td className="py-3 pr-4 text-app-muted">—</td>
                            <td className="py-3 pr-4 text-app-muted max-w-[200px] truncate" title={pr.description}>{pr.description || '—'}</td>
                            <td className="py-3 pr-4 text-right">—</td>
                          </tr>
                        )) : [];
                        return [...payslipRows, ...paymentRowsForAll];
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <BackDateSalaryModal
              isOpen={backDateModalOpen}
              onClose={() => setBackDateModalOpen(false)}
              onSuccess={handleBackDateSuccess}
              tenantId={tenantId}
              userId={userId}
            />
            <PaySalaryModal
              isOpen={!!payModalPayslip}
              onClose={() => { setPayModalPayslip(null); setPayModalEmployee(null); setPayModalRun(null); }}
              onPaymentComplete={refreshCyclePayslips}
              payslip={payModalPayslip}
              employee={payModalEmployee}
              run={payModalRun}
              tenantId={tenantId}
              userId={userId}
            />
            <BulkPayPayslipsModal
              isOpen={bulkPayModalOpen}
              onClose={() => { setBulkPayModalOpen(false); setSelectedPayslipIds([]); }}
              onPaymentComplete={() => { refreshCyclePayslips(); setSelectedPayslipIds([]); }}
              items={bulkPayItems}
              tenantId={tenantId}
              userId={userId}
            />
            <EditPayslipModal
              isOpen={editPayslipModalOpen}
              onClose={() => { setEditPayslipModalOpen(false); setEditingPayslip(null); setEditingEmployee(null); }}
              onSaved={refreshCyclePayslips}
              onDeleted={refreshCyclePayslips}
              payslip={editingPayslip}
              employee={editingEmployee}
              tenantId={tenantId}
              userId={userId}
            />
            <Modal isOpen={!!paymentTransactionToEdit} onClose={() => setPaymentTransactionToEdit(null)} title="Edit Payment">
              {paymentTransactionToEdit && (
                <TransactionForm
                  transactionToEdit={paymentTransactionToEdit}
                  onClose={() => setPaymentTransactionToEdit(null)}
                  onShowDeleteWarning={handlePaymentShowDeleteWarning}
                />
              )}
            </Modal>
            <LinkedTransactionWarningModal
              isOpen={paymentWarningModalState.isOpen}
              onClose={handlePaymentCloseWarning}
              onConfirm={handlePaymentConfirmWarning}
              action={paymentWarningModalState.action ?? 'delete'}
              linkedItemName={getPaymentLinkedItemName(paymentWarningModalState.transaction)}
            />
          </div>
        )}

        {activeSubTab === 'report' && (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4 lg:p-6 xl:p-8 pb-20 sm:pb-24 md:pb-6">
            <PayrollReport />
          </div>
        )}

        {activeSubTab === 'history' && (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4 lg:p-6 xl:p-8 pb-20 sm:pb-24 md:pb-6">
            <PaymentHistory />
          </div>
        )}

        {activeSubTab === 'settings' && (
          <PayrollSettingsPage />
        )}
      </div>
    </div>
  );
};

export default PayrollHub;
