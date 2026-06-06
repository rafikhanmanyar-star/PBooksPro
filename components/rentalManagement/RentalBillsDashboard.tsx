import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Bill, TransactionType, Transaction, Contact, Vendor } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatDate, parseStoredDateToYyyyMmDdInput, toLocalDateString } from '../../utils/dateUtils';
import ARTreeView, { ARTreeNode } from './ARTreeView';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import TransactionForm from '../transactions/TransactionForm';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import BillBulkPaymentModal from '../bills/BillBulkPaymentModal';
import BillLinkedPaymentsSidePanel from '../bills/BillLinkedPaymentsSidePanel';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import useLocalStorage from '../../hooks/useLocalStorage';
import {
  getExpenseBearerType,
  resolveExpenseCategoryForBillPayment,
  getEffectiveBillPaymentDisplay,
  isBillPaymentFromSecurityDepositIncome,
  findSecurityDepositAppliedExpenseForBillPayment,
} from '../../utils/rentalBillPayments';
import { ImportType } from '../../services/importService';
import {
  computeRentalBillsDashboard,
  type RentalBillsDashboardRow,
} from './rentalBillsDashboardEngine';
import { isLocalOnlyMode } from '../../config/apiUrl';
import {
  fetchRentalBillsDashboard,
  type RentalBillsDashboardApiResult,
} from '../../services/api/rentalReportsApi';

type ViewBy = 'building' | 'property' | 'vendor' | 'bearer';
type StatusFilter = 'all' | 'Unpaid' | 'Paid' | 'Partially Paid' | 'Overdue';
type BillsPaymentsFilter = 'All' | 'Bills' | 'Payments';
type TabFilter = 'all' | 'unpaid' | 'overdue';

const PAGE_SIZE = 20;

const VendorAvatar: React.FC<{ name: string }> = ({ name }) => {
  const initial = (name || '?').charAt(0).toUpperCase();
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-purple-100 text-purple-700',
    'bg-cyan-100 text-cyan-700',
    'bg-orange-100 text-orange-700',
    'bg-indigo-100 text-indigo-700',
  ];
  const idx = name ? name.charCodeAt(0) % colors.length : 0;
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${colors[idx]}`}>
      {initial}
    </div>
  );
};

const RentalBillsDashboard: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showToast, showAlert, showConfirm } = useNotification();
  const { openChat } = useWhatsApp();
  const [whatsAppMenuBillId, setWhatsAppMenuBillId] = useState<string | null>(null);
  const whatsAppMenuRef = useRef<HTMLDivElement>(null);

  const [viewBy, setViewBy] = useLocalStorage<ViewBy>('bills_dash_viewBy', 'building');
  const [statusFilter, setStatusFilter] = useLocalStorage<StatusFilter>('bills_dash_status', 'all');
  const [typeFilter, setTypeFilter] = useLocalStorage<BillsPaymentsFilter>('bills_dash_billsPaymentsFilter', 'Bills');
  const [searchQuery, setSearchQuery] = useState('');
  const [tabFilter, setTabFilter] = useState<TabFilter>('all');

  const [selectedNode, setSelectedNode] = useState<ARTreeNode | null>(null);
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState(false);
  const [bulkPayUsesUnpaidPool, setBulkPayUsesUnpaidPool] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [billToEdit, setBillToEdit] = useState<Bill | null>(null);
  const [duplicateBillData, setDuplicateBillData] = useState<Partial<Bill> | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentBill, setPaymentBill] = useState<Bill | null>(null);
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
  const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null }>({ isOpen: false, transaction: null });

  const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('bills_dash_sidebar', 260);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (whatsAppMenuRef.current && !whatsAppMenuRef.current.contains(e.target as Node)) {
        setWhatsAppMenuBillId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const localOnly = isLocalOnlyMode();
  const [serverDash, setServerDash] = useState<RentalBillsDashboardApiResult | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashFetchError, setDashFetchError] = useState<string | null>(null);

  const dashFilters = useMemo(
    () => ({
      viewBy,
      statusFilter,
      searchQuery,
      tabFilter,
      typeFilter,
      selectedNodeId: selectedNode?.id ?? null,
      sortConfig,
      page: currentPage,
      pageSize: PAGE_SIZE,
    }),
    [viewBy, statusFilter, searchQuery, tabFilter, typeFilter, selectedNode, sortConfig, currentPage]
  );

  const localDash = useMemo(
    () =>
      computeRentalBillsDashboard(
        {
          bills: state.bills,
          transactions: state.transactions,
          properties: state.properties,
          buildings: state.buildings,
          vendors: state.vendors ?? [],
          categories: state.categories,
          rentalAgreements: state.rentalAgreements,
        },
        dashFilters
      ),
    [state.bills, state.transactions, state.properties, state.buildings, state.vendors, state.categories, state.rentalAgreements, dashFilters]
  );

  useEffect(() => {
    if (localOnly) {
      setServerDash(null);
      setDashFetchError(null);
      return;
    }
    let cancelled = false;
    setDashLoading(true);
    setDashFetchError(null);
    void fetchRentalBillsDashboard({
      viewBy,
      status: statusFilter,
      search: searchQuery,
      tab: tabFilter,
      typeFilter,
      nodeId: selectedNode?.id,
      sortKey: sortConfig.key,
      sortDir: sortConfig.dir,
      page: currentPage,
      pageSize: PAGE_SIZE,
    })
      .then((r) => {
        if (cancelled) return;
        setServerDash(r);
      })
      .catch((e) => {
        if (cancelled) return;
        setDashFetchError(e instanceof Error ? e.message : 'Failed to load bills dashboard');
        setServerDash(null);
      })
      .finally(() => {
        if (!cancelled) setDashLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [localOnly, viewBy, statusFilter, searchQuery, tabFilter, typeFilter, selectedNode, sortConfig, currentPage]);

  const activeDash = localOnly ? localDash : serverDash;
  const treeData = (activeDash?.tree ?? []) as ARTreeNode[];
  const summaryStats = activeDash?.summary ?? {
    totalOutstanding: 0,
    overdueBills: 0,
    paidThisMonth: 0,
    paidBillsCount: 0,
    changePercent: 0,
  };
  const paginatedRows: RentalBillsDashboardRow[] = localOnly
    ? localDash.rows
    : ((serverDash?.rows ?? []) as unknown as RentalBillsDashboardRow[]);
  const sortedBills = localOnly
    ? localDash.sortedBills
    : paginatedRows.filter((r): r is { kind: 'bill'; bill: Bill } => r.kind === 'bill').map((r) => r.bill as Bill);
  const paymentRows = localOnly
    ? localDash.paymentRows
    : paginatedRows
        .filter((r): r is { kind: 'payment'; payment: Transaction; bill: Bill } => r.kind === 'payment')
        .map((r) => ({ payment: r.payment as Transaction, bill: r.bill as Bill }));
  const unpaidBillsForBulk = localOnly
    ? localDash.unpaidBills
    : state.bills.filter(
        (b) => !b.projectId && getEffectiveBillPaymentDisplay(b, state.transactions).balance > 0.01
      );
  const totalEntries = activeDash?.totalRows ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedStart = (safeCurrentPage - 1) * PAGE_SIZE;
  const paginatedEnd = Math.min(paginatedStart + PAGE_SIZE, totalEntries);

  const accountMap = useMemo(() => new Map(state.accounts.map(a => [a.id, a])), [state.accounts]);

  useEffect(() => { setSelectedNode(null); }, [viewBy, statusFilter]);
  useEffect(() => { setCurrentPage(1); }, [tabFilter, searchQuery, selectedNode, statusFilter, typeFilter]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const containerLeft = containerRef.current.getBoundingClientRect().left;
    const newWidth = e.clientX - containerLeft;
    if (newWidth > 200 && newWidth < 600) setSidebarWidth(newWidth);
  }, [setSidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const handleUp = () => { setIsResizing(false); document.body.style.cursor = ''; document.body.style.userSelect = ''; };
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('blur', handleUp);
    document.addEventListener('visibilitychange', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('blur', handleUp);
      document.removeEventListener('visibilitychange', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove]);

  const handleSortClick = (key: string) => {
    setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  };
  const SortArrow = ({ column }: { column: string }) => (
    <span className="ml-0.5 text-[9px] text-app-muted">{sortConfig.key === column ? (sortConfig.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
  );

  const statusBadge = (status: string) => {
    const base = 'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide';
    switch (status) {
      case 'Paid': return `${base} bg-[color:var(--badge-paid-bg)] text-[color:var(--badge-paid-text)]`;
      case 'Overdue': return `${base} bg-[color:var(--badge-overdue-bg)] text-[color:var(--badge-overdue-text)]`;
      case 'Partially Paid': return `${base} bg-[color:var(--badge-partial-bg)] text-[color:var(--badge-partial-text)]`;
      case 'Unpaid': return `${base} bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400`;
      default: return `${base} bg-app-toolbar text-app-muted`;
    }
  };

  const bearerBadge = (bill: Bill) => {
    const b = getExpenseBearerType(bill, state);
    const styles: Record<string, string> = {
      owner: 'border-primary/30 bg-app-toolbar text-primary',
      building: 'border-ds-success/35 bg-[color:var(--badge-paid-bg)] text-ds-success',
      tenant: 'border-ds-warning/35 bg-app-toolbar text-ds-warning',
    };
    const labels: Record<string, string> = { owner: 'Owner', building: 'Bldg', tenant: 'Tenant' };
    return <span className={`px-1 py-0.5 rounded text-[9px] font-semibold border ${styles[b] || 'border-app-border bg-app-toolbar text-app-muted'}`}>{labels[b] || b}</span>;
  };

  const handleRecordPayment = (bill: Bill) => { setPaymentBill(bill); setIsPaymentModalOpen(true); };

  const handleDuplicateBill = async (data: Partial<Bill>) => {
    const agreed = await showConfirm(
      'A new bill will open with a copy of the current details. You can change anything before saving.\n\nAfter you save the new bill (or cancel), this bill will no longer be open for editing.\n\nContinue?',
      { title: 'Duplicate bill', confirmLabel: 'Continue', cancelLabel: 'Cancel' }
    );
    if (!agreed) return;
    const { id: _id, paidAmount: _pa, status: _st, ...rest } = data as Bill;
    setDuplicateBillData({ ...rest, paidAmount: 0, status: undefined });
    setBillToEdit(null);
    setIsCreateModalOpen(true);
  };

  const handleEdit = (bill: Bill) => {
    setBillToEdit(bill);
    setDuplicateBillData(null);
    setIsCreateModalOpen(true);
  };

  const getWhatsAppOptions = (bill: Bill) => {
    const opts: { id: 'vendor' | 'owner' | 'tenant'; label: string }[] = [];
    const vendor = state.vendors?.find(v => v.id === bill.vendorId);
    if (vendor?.contactNo) opts.push({ id: 'vendor', label: 'Send to Vendor' });
    const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
    const owner = prop?.ownerId ? state.contacts.find(c => c.id === prop.ownerId) : null;
    if (owner?.contactNo && getExpenseBearerType(bill, state) === 'owner') opts.push({ id: 'owner', label: 'Send to Owner' });
    const ra = bill.projectAgreementId ? state.rentalAgreements.find(ra => ra.id === bill.projectAgreementId) : null;
    const tenant = ra?.contactId ? state.contacts.find(c => c.id === ra.contactId) : null;
    if (tenant?.contactNo && getExpenseBearerType(bill, state) === 'tenant') opts.push({ id: 'tenant', label: 'Send to Tenant' });
    return opts;
  };

  const handleSendWhatsApp = (e: React.MouseEvent, bill: Bill, recipient: 'vendor' | 'owner' | 'tenant') => {
    e.stopPropagation();
    setWhatsAppMenuBillId(null);
    let contact: Contact | Vendor | null = null;
    let message = '';

    if (recipient === 'vendor') {
      const vendor = state.vendors?.find(v => v.id === bill.vendorId);
      if (!vendor?.contactNo) { showAlert('Vendor does not have a phone number saved.'); return; }
      contact = vendor;
      message = WhatsAppService.generateBillPayment((state.whatsAppTemplates as any)?.billPayment, vendor, bill.billNumber, bill.paidAmount);
    } else if (recipient === 'owner') {
      const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
      const owner = prop?.ownerId ? state.contacts.find(c => c.id === prop.ownerId) : null;
      if (!owner?.contactNo) { showAlert('Owner does not have a phone number saved.'); return; }
      contact = owner;
      const billToOwner = (state.whatsAppTemplates as any)?.billToOwner || (state.whatsAppTemplates as any)?.billPayment;
      message = WhatsAppService.replaceTemplateVariables(billToOwner, { contactName: owner.name, billNumber: bill.billNumber, amount: `${CURRENCY} ${bill.amount.toLocaleString()}` });
    } else if (recipient === 'tenant') {
      const ra = bill.projectAgreementId ? state.rentalAgreements.find(ra => ra.id === bill.projectAgreementId) : null;
      const tenant = ra?.contactId ? state.contacts.find(c => c.id === ra.contactId) : null;
      if (!tenant?.contactNo) { showAlert('Tenant does not have a phone number saved.'); return; }
      contact = tenant;
      const billToTenant = (state.whatsAppTemplates as any)?.billToTenant || (state.whatsAppTemplates as any)?.billPayment;
      message = WhatsAppService.replaceTemplateVariables(billToTenant, { contactName: tenant.name, billNumber: bill.billNumber, amount: `${CURRENCY} ${bill.amount.toLocaleString()}`, note: 'This amount will be deducted from your security deposit.' });
    }
    if (contact && message) {
      sendOrOpenWhatsApp(
        { contact, message, phoneNumber: contact.contactNo ?? undefined },
        () => (state as any).whatsAppMode,
        openChat
      );
    }
  };

  const paymentTransactionData = useMemo(() => {
    if (!paymentBill) return { id: '', type: TransactionType.EXPENSE, amount: 0, date: toLocalDateString(new Date()), accountId: '' } as any;
    let tenantId: string | undefined;
    if (paymentBill.projectAgreementId) {
      const ra = state.rentalAgreements.find(ra => ra.id === paymentBill.projectAgreementId);
      if (ra) tenantId = ra.contactId;
    }
    const categoryId = resolveExpenseCategoryForBillPayment(paymentBill, state.categories, state.rentalAgreements);
    const due = getEffectiveBillPaymentDisplay(paymentBill, state.transactions).balance;
    return {
      id: '', type: TransactionType.EXPENSE,
      amount: due,
      date: paymentBill.issueDate
        ? parseStoredDateToYyyyMmDdInput(paymentBill.issueDate)
        : toLocalDateString(new Date()),
      accountId: '', billId: paymentBill.id,
      contactId: tenantId || paymentBill.contactId,
      buildingId: paymentBill.buildingId, propertyId: paymentBill.propertyId,
      categoryId,
      description: paymentBill.description || `Payment for Bill #${paymentBill.billNumber}`,
    } as any;
  }, [paymentBill, state.rentalAgreements, state.categories, state.transactions]);

  const selectedBillsList = useMemo(() => state.bills.filter(b => selectedBillIds.has(b.id)), [state.bills, selectedBillIds]);
  const toggleSelection = useCallback((id: string) => {
    setSelectedBillIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const selectClass = 'ds-input-field px-2 py-1.5 text-xs cursor-pointer min-w-[100px]';

  const renderPagination = () => {
    if (totalEntries <= PAGE_SIZE) return null;
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push('...');
      for (let i = Math.max(2, safeCurrentPage - 1); i <= Math.min(totalPages - 1, safeCurrentPage + 1); i++) pages.push(i);
      if (safeCurrentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safeCurrentPage === 1}
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-app-muted hover:bg-app-toolbar disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="w-8 h-8 flex items-center justify-center text-app-muted text-sm">...</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => setCurrentPage(p)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                p === safeCurrentPage ? 'bg-primary text-ds-on-primary shadow-sm' : 'text-app-muted hover:bg-app-toolbar'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          disabled={safeCurrentPage === totalPages}
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-app-muted hover:bg-app-toolbar disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
    );
  };

  const renderBillRow = (bill: Bill) => {
    const vendor = state.vendors?.find(v => v.id === bill.vendorId);
    const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
    const bld = prop ? state.buildings.find(bl => bl.id === prop.buildingId) : bill.buildingId ? state.buildings.find(bl => bl.id === bill.buildingId) : null;
    const { balance, status: effStatus } = getEffectiveBillPaymentDisplay(bill, state.transactions);
    const isChecked = selectedBillIds.has(bill.id);
    const whatsAppOpts = getWhatsAppOptions(bill);

    return (
      <tr
        key={bill.id}
        onClick={() => handleEdit(bill)}
        className={`group border-b border-app-border cursor-pointer transition-all duration-150 ${
          isChecked ? 'bg-primary/8 border-l-[3px] border-l-primary' : 'hover:bg-app-toolbar/40'
        }`}
      >
        <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={isChecked} onChange={() => toggleSelection(bill.id)}
            className="w-4 h-4 rounded border-app-border accent-primary cursor-pointer"
            aria-label={`Select bill ${bill.billNumber}`} title={`Select bill ${bill.billNumber}`} />
        </td>
        <td className="px-3 py-3 font-semibold text-primary text-sm">{bill.billNumber}</td>
        <td className="px-3 py-3 text-app-muted text-sm tabular-nums">{formatDate(bill.issueDate)}</td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2.5">
            <VendorAvatar name={vendor?.name || '?'} />
            <span className="text-sm font-medium text-app-text truncate max-w-[140px]" title={vendor?.name}>{vendor?.name || '—'}</span>
          </div>
        </td>
        <td className="px-3 py-3">
          <div className="text-sm text-app-text leading-tight">
            {prop?.name || (bill.buildingId ? (bld?.name || 'Building') : '—')}
            {prop?.name && bld?.name && (
              <div className="text-[11px] text-app-muted">{bld.name}</div>
            )}
          </div>
        </td>
        <td className="px-3 py-3 text-right font-semibold text-sm tabular-nums text-app-text">
          {CURRENCY} {bill.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td className="px-3 py-3 text-center">
          <span className={statusBadge(effStatus)}>{effStatus}</span>
        </td>
        <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {whatsAppOpts.length > 0 && (
              <div className="relative" ref={whatsAppMenuBillId === bill.id ? whatsAppMenuRef : null}>
                <button type="button" onClick={(e) => { e.stopPropagation(); setWhatsAppMenuBillId(prev => prev === bill.id ? null : bill.id); }}
                  className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors" title="WhatsApp">
                  <span className="w-4 h-4 inline-block">{ICONS.whatsapp}</span>
                </button>
                {whatsAppMenuBillId === bill.id && (
                  <div className="absolute right-0 mt-1 py-1 bg-app-card border border-app-border rounded-xl shadow-lg z-20 min-w-[150px]">
                    {whatsAppOpts.map(opt => (
                      <button key={opt.id} type="button" onClick={(e) => handleSendWhatsApp(e, bill, opt.id)}
                        className="block w-full text-left px-3 py-2 text-xs hover:bg-app-toolbar/60 transition-colors">{opt.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" onClick={(e) => { e.stopPropagation(); handleRecordPayment(bill); }}
              className="p-1.5 rounded-lg hover:bg-app-toolbar/60 text-app-text transition-colors" title="Pay">
              <span className="w-4 h-4 inline-block">{ICONS.dollarSign}</span>
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); handleEdit(bill); }}
              className="p-1.5 rounded-lg hover:bg-app-toolbar/60 text-app-muted transition-colors" title="Edit">
              <span className="w-4 h-4 inline-block">{ICONS.edit}</span>
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderPaymentRow = (payment: Transaction, bill: Bill, menuKeyPrefix: string) => {
    const vendor = state.vendors?.find(v => v.id === bill.vendorId);
    const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
    const bld = prop ? state.buildings.find(bl => bl.id === prop.buildingId) : bill.buildingId ? state.buildings.find(bl => bl.id === bill.buildingId) : null;
    const payAccount = payment.accountId ? accountMap.get(payment.accountId) : undefined;
    const whatsAppOpts = getWhatsAppOptions(bill);
    const menuKey = `${menuKeyPrefix}-${payment.id}`;
    const paymentTypeBadge =
      payment.type === TransactionType.INCOME && isBillPaymentFromSecurityDepositIncome(payment) ? (
        <span className="inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-violet-100 text-violet-800">Security</span>
      ) : (
        <span className="inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">Pay</span>
      );
    return (
      <tr
        key={`pay-${payment.id}`}
        onClick={() => setTransactionToEdit(payment)}
        className="group border-b border-app-border cursor-pointer hover:bg-ds-success/5 transition-all duration-150"
      >
        <td className="px-3 py-3" onClick={e => e.stopPropagation()} />
        <td className="px-3 py-3">{paymentTypeBadge}</td>
        <td className="px-3 py-3 text-app-text text-sm tabular-nums">{formatDate(payment.date)}</td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2.5">
            <VendorAvatar name={vendor?.name || '?'} />
            <span className="text-sm font-medium text-app-text truncate max-w-[140px]" title={vendor?.name}>{vendor?.name || '—'}</span>
          </div>
        </td>
        <td className="px-3 py-3 text-sm text-app-muted">{prop?.name || (bill.buildingId ? (bld?.name || 'Building') : '—')}</td>
        <td className="px-3 py-3 text-right font-semibold text-sm tabular-nums text-emerald-700">
          {CURRENCY} {payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td className="px-3 py-3 text-center">
          <span className="text-[11px] font-medium text-app-muted">{payAccount?.name || '—'}</span>
        </td>
        <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {whatsAppOpts.length > 0 && (
              <div className="relative" ref={whatsAppMenuBillId === menuKey ? whatsAppMenuRef : null}>
                <button type="button" onClick={(e) => { e.stopPropagation(); setWhatsAppMenuBillId(prev => prev === menuKey ? null : menuKey); }}
                  className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors" title="WhatsApp">
                  <span className="w-4 h-4 inline-block">{ICONS.whatsapp}</span>
                </button>
                {whatsAppMenuBillId === menuKey && (
                  <div className="absolute right-0 mt-1 py-1 bg-app-card border border-app-border rounded-xl shadow-lg z-20 min-w-[150px]">
                    {whatsAppOpts.map(opt => (
                      <button key={opt.id} type="button" onClick={(e) => { handleSendWhatsApp(e, bill, opt.id); setWhatsAppMenuBillId(null); }}
                        className="block w-full text-left px-3 py-2 text-xs hover:bg-app-toolbar/60 transition-colors">{opt.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" onClick={(e) => { e.stopPropagation(); setTransactionToEdit(payment); }}
              className="p-1.5 rounded-lg hover:bg-app-toolbar/60 text-app-text transition-colors" title="Edit">
              <span className="w-4 h-4 inline-block">{ICONS.edit}</span>
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setWarningModalState({ isOpen: true, transaction: payment }); }}
              className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 transition-colors" title="Delete">
              <span className="w-4 h-4 inline-block">{ICONS.trash}</span>
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {!localOnly && dashLoading && (
        <p className="px-5 pt-3 text-sm text-app-muted">Loading bills dashboard from server…</p>
      )}
      {!localOnly && dashFetchError && (
        <p className="px-5 pt-3 text-sm text-ds-danger">Server dashboard failed: {dashFetchError}</p>
      )}
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-5 py-4 flex-shrink-0">
        <div className="bg-app-card rounded-xl border border-app-border p-5 shadow-ds-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wider mb-1">Total Outstanding</p>
              <p className="text-2xl font-bold text-app-text tabular-nums">
                {CURRENCY} {summaryStats.totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {summaryStats.changePercent !== 0 && (
                <p className={`text-xs mt-1.5 font-medium ${summaryStats.changePercent > 0 ? 'text-ds-success' : 'text-ds-danger'}`}>
                  {summaryStats.changePercent > 0 ? '+' : ''}{summaryStats.changePercent}% vs last month
                </p>
              )}
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-app-card rounded-xl border border-app-border p-5 shadow-ds-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wider mb-1">Overdue Bills</p>
              <p className="text-2xl font-bold text-ds-danger tabular-nums">{summaryStats.overdueBills}</p>
              <p className="text-xs mt-1.5 font-medium text-ds-danger">Requires immediate action</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-ds-danger/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-ds-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-app-card rounded-xl border border-app-border p-5 shadow-ds-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-app-muted uppercase tracking-wider mb-1">Paid This Month</p>
              <p className="text-2xl font-bold text-app-text tabular-nums">
                {CURRENCY} {summaryStats.paidThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs mt-1.5 text-app-muted">{summaryStats.paidBillsCount} bills cleared</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-ds-success/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-ds-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden px-5 pb-4 gap-4">
        {/* Left Panel: Portfolio Filter */}
        <div className="flex-shrink-0 hidden md:flex flex-col bg-app-card rounded-xl border border-app-border shadow-ds-card overflow-hidden" style={{ width: `${sidebarWidth}px` }}>
          <div className="px-4 py-3 border-b border-app-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-app-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              <span className="text-sm font-semibold text-app-text">Portfolio Filter</span>
            </div>
            <select value={viewBy} onChange={e => setViewBy(e.target.value as ViewBy)} className={selectClass} aria-label="View by">
              <option value="building">Building</option>
              <option value="property">Property</option>
              <option value="vendor">Vendor</option>
              <option value="bearer">Expense Bearer</option>
            </select>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ARTreeView
              treeData={treeData}
              selectedNodeId={selectedNode?.id || null}
              onNodeSelect={setSelectedNode}
              searchQuery={searchQuery}
              amountLabel="A/P"
              overdueLabel="overdue"
              emptyText="No payables found"
            />
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className="w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors hidden md:block flex-shrink-0 rounded-full"
          onMouseDown={e => { e.preventDefault(); setIsResizing(true); }}
        />

        {/* Right Panel: Bill List */}
        <div className="flex-1 min-w-0 flex flex-col bg-app-card rounded-xl border border-app-border shadow-ds-card overflow-hidden">
          {/* Tab Bar + Actions */}
          <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-app-border gap-3 flex-shrink-0">
            <div className="flex items-center gap-1">
              {/* Bill/Payment type tabs */}
              {(['All', 'Bills', 'Payments'] as BillsPaymentsFilter[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTypeFilter(t); setTabFilter('all'); }}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    typeFilter === t
                      ? 'bg-primary/10 text-primary'
                      : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/60'
                  }`}
                >
                  {t === 'All' ? 'All Bills' : t}
                </button>
              ))}

              {typeFilter === 'Bills' && (
                <>
                  <div className="w-px h-5 bg-app-border mx-1" />
                  <button type="button" onClick={() => setTabFilter('unpaid')}
                    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${tabFilter === 'unpaid' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/60'}`}>
                    Unpaid
                  </button>
                  <button type="button" onClick={() => setTabFilter('overdue')}
                    className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${tabFilter === 'overdue' ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400' : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/60'}`}>
                    Overdue
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.RENTAL_BILLS });
                  dispatch({ type: 'SET_PAGE', payload: 'import' });
                }}
                size="sm"
                className="text-xs"
              >
                <div className="w-3.5 h-3.5 mr-1.5">{ICONS.download}</div>
                Bulk Import
              </Button>
              <Button onClick={() => { setBillToEdit(null); setDuplicateBillData(null); setIsCreateModalOpen(true); }} size="sm" className="text-xs">
                <div className="w-3.5 h-3.5 mr-1.5">{ICONS.plus}</div>
                New Bill
              </Button>
              {typeFilter !== 'Payments' && selectedBillIds.size > 0 && (
                <Button variant="secondary" onClick={() => { setBulkPayUsesUnpaidPool(false); setIsBulkPayModalOpen(true); }} size="sm" className="text-xs">
                  Pay Selected ({selectedBillIds.size})
                </Button>
              )}
              {(typeFilter === 'Payments' || typeFilter === 'All') && unpaidBillsForBulk.length > 0 && (
                <Button variant="secondary" onClick={() => { setBulkPayUsesUnpaidPool(true); setIsBulkPayModalOpen(true); }} size="sm" className="text-xs">
                  Bulk pay bills ({unpaidBillsForBulk.length})
                </Button>
              )}
            </div>
          </div>

          {/* Status filter + Search */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-app-border flex-shrink-0 bg-app-toolbar/30">
            <div className="flex items-center gap-1">
              {['All', 'Unpaid', 'Paid', 'Partially Paid', 'Overdue'].map(s => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setStatusFilter(s === 'All' ? 'all' : s as StatusFilter)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    (s === 'All' && statusFilter === 'all') || statusFilter === s
                      ? 'bg-primary text-ds-on-primary shadow-sm' : 'text-app-muted hover:text-app-text hover:bg-app-toolbar'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-app-border" />

            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-app-muted">
                <div className="w-3.5 h-3.5">{ICONS.search}</div>
              </div>
              <input
                type="text"
                placeholder="Search bill #, vendor, property..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="ds-input-field pl-8 pr-3 py-1.5 w-full text-xs placeholder:text-app-muted rounded-lg"
              />
            </div>

            {selectedNode && (
              <button type="button" onClick={() => setSelectedNode(null)}
                className="text-xs text-primary hover:text-primary/80 px-2 py-1 rounded-md hover:bg-primary/10 transition-colors font-medium">
                Clear filter: {selectedNode.name}
              </button>
            )}
          </div>

          {/* Mobile dropdown */}
          <div className="md:hidden px-4 py-2 bg-app-card border-b border-app-border">
            <select
              value={selectedNode?.id || ''}
              onChange={e => {
                const id = e.target.value;
                if (!id) { setSelectedNode(null); return; }
                const findNode = (nodes: ARTreeNode[]): ARTreeNode | null => {
                  for (const n of nodes) { if (n.id === id) return n; if (n.children) { const f = findNode(n.children); if (f) return f; } } return null;
                };
                setSelectedNode(findNode(treeData));
              }}
              className="ds-input-field w-full px-2 py-1.5 text-sm"
              aria-label="Select bill node"
            >
              <option value="">All Bills</option>
              {treeData.map(n => <option key={n.id} value={n.id}>{n.name} ({CURRENCY} {n.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })})</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 overflow-auto">
            {typeFilter === 'All' ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-app-table-header text-[11px] font-semibold text-app-muted uppercase tracking-wider border-b border-app-border">
                  <th className="w-10 px-3 py-3 text-center">
                    <input type="checkbox" checked={sortedBills.length > 0 && selectedBillIds.size > 0 && selectedBillIds.size === sortedBills.length}
                      onChange={() => { selectedBillIds.size === sortedBills.length ? setSelectedBillIds(new Set()) : setSelectedBillIds(new Set(sortedBills.map(b => b.id))); }}
                      className="w-4 h-4 rounded border-app-border accent-primary"
                      aria-label="Select all bills" title="Select all bills" />
                  </th>
                  <th className="px-3 py-3 text-left w-14">Type</th>
                  <th className="px-3 py-3 text-left cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('date')}>Date <SortArrow column="date" /></th>
                  <th className="px-3 py-3 text-left cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('vendor')}>Vendor <SortArrow column="vendor" /></th>
                  <th className="px-3 py-3 text-left cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('property')}>Property / Unit <SortArrow column="property" /></th>
                  <th className="px-3 py-3 text-right cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('amount')}>Amount <SortArrow column="amount" /></th>
                  <th className="px-3 py-3 text-center cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('status')}>Status <SortArrow column="status" /></th>
                  <th className="px-3 py-3 text-center w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {totalEntries === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-12 text-center text-app-muted">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-10 h-10 text-app-muted/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12h6M9 16h6M13 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V11l-8-8z"/><path d="M13 3v8h8"/></svg>
                      <p className="text-sm">No bills or payments in this view.</p>
                    </div>
                  </td></tr>
                ) : paginatedRows.map(row => {
                  if (row.kind === 'bill') {
                    const bill = row.bill;
                    const vendor = state.vendors?.find(v => v.id === bill.vendorId);
                    const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
                    const bld = prop ? state.buildings.find(bl => bl.id === prop.buildingId) : bill.buildingId ? state.buildings.find(bl => bl.id === bill.buildingId) : null;
                    const { balance, status: effStatus } = getEffectiveBillPaymentDisplay(bill, state.transactions);
                    const isChecked = selectedBillIds.has(bill.id);
                    const whatsAppOpts = getWhatsAppOptions(bill);
                    return (
                      <tr
                        key={`all-bill-${bill.id}`}
                        onClick={() => handleEdit(bill)}
                        className={`group border-b border-app-border cursor-pointer transition-all duration-150 ${isChecked ? 'bg-primary/8 border-l-[3px] border-l-primary' : 'hover:bg-app-toolbar/40'}`}
                      >
                        <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={isChecked} onChange={() => toggleSelection(bill.id)} className="w-4 h-4 rounded border-app-border accent-primary" aria-label={`Select bill ${bill.billNumber}`} title={`Select bill ${bill.billNumber}`} />
                        </td>
                        <td className="px-3 py-3"><span className="inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-100 text-blue-800">Bill</span></td>
                        <td className="px-3 py-3 text-app-muted text-sm tabular-nums">{formatDate(bill.issueDate)}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <VendorAvatar name={vendor?.name || '?'} />
                            <span className="text-sm font-medium text-app-text truncate max-w-[130px]" title={vendor?.name}>{vendor?.name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-sm text-app-text leading-tight">
                            {prop?.name || (bill.buildingId ? (bld?.name || 'Building') : '—')}
                            {prop?.name && bld?.name && <div className="text-[11px] text-app-muted">{bld.name}</div>}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-sm tabular-nums text-app-text">
                          {CURRENCY} {bill.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-3 text-center"><span className={statusBadge(effStatus)}>{effStatus}</span></td>
                        <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {whatsAppOpts.length > 0 && (
                              <div className="relative" ref={whatsAppMenuBillId === bill.id ? whatsAppMenuRef : null}>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setWhatsAppMenuBillId(prev => prev === bill.id ? null : bill.id); }} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors" title="WhatsApp"><span className="w-4 h-4 inline-block">{ICONS.whatsapp}</span></button>
                                {whatsAppMenuBillId === bill.id && (
                                  <div className="absolute right-0 mt-1 py-1 bg-app-card border border-app-border rounded-xl shadow-lg z-20 min-w-[150px]">
                                    {whatsAppOpts.map(opt => (
                                      <button key={opt.id} type="button" onClick={(e) => handleSendWhatsApp(e, bill, opt.id)} className="block w-full text-left px-3 py-2 text-xs hover:bg-app-toolbar/60 transition-colors">{opt.label}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleRecordPayment(bill); }} className="p-1.5 rounded-lg hover:bg-app-toolbar/60 text-app-text transition-colors" title="Pay"><span className="w-4 h-4 inline-block">{ICONS.dollarSign}</span></button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleEdit(bill); }} className="p-1.5 rounded-lg hover:bg-app-toolbar/60 text-app-muted transition-colors" title="Edit"><span className="w-4 h-4 inline-block">{ICONS.edit}</span></button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return renderPaymentRow(row.payment, row.bill, 'all-dash');
                })}
              </tbody>
            </table>
            ) : typeFilter === 'Bills' ? (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-app-table-header text-[11px] font-semibold text-app-muted uppercase tracking-wider border-b border-app-border">
                  <th className="w-10 px-3 py-3 text-center">
                    <input type="checkbox" checked={sortedBills.length > 0 && selectedBillIds.size > 0 && selectedBillIds.size === sortedBills.length}
                      onChange={() => { selectedBillIds.size === sortedBills.length ? setSelectedBillIds(new Set()) : setSelectedBillIds(new Set(sortedBills.map(b => b.id))); }}
                      className="w-4 h-4 rounded border-app-border accent-primary"
                      aria-label="Select all bills" title="Select all bills" />
                  </th>
                  <th className="px-3 py-3 text-left cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('billNumber')}>Bill # <SortArrow column="billNumber" /></th>
                  <th className="px-3 py-3 text-left cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('date')}>Date <SortArrow column="date" /></th>
                  <th className="px-3 py-3 text-left cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('vendor')}>Vendor <SortArrow column="vendor" /></th>
                  <th className="px-3 py-3 text-left cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('property')}>Property / Unit <SortArrow column="property" /></th>
                  <th className="px-3 py-3 text-right cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('amount')}>Amount <SortArrow column="amount" /></th>
                  <th className="px-3 py-3 text-center cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('status')}>Status <SortArrow column="status" /></th>
                  <th className="px-3 py-3 text-center w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {totalEntries === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-12 text-center text-app-muted">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-10 h-10 text-app-muted/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12h6M9 16h6M13 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V11l-8-8z"/><path d="M13 3v8h8"/></svg>
                      <p className="text-sm">No bills found</p>
                    </div>
                  </td></tr>
                ) : paginatedRows.filter((r): r is { kind: 'bill'; bill: Bill } => r.kind === 'bill').map(row => renderBillRow(row.bill))}
              </tbody>
            </table>
            ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-app-table-header text-[11px] font-semibold text-app-muted uppercase tracking-wider border-b border-app-border">
                  <th className="px-3 py-3 text-left w-14">Type</th>
                  <th className="px-3 py-3 text-left cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('date')}>Payment date <SortArrow column="date" /></th>
                  <th className="px-3 py-3 text-left cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('billNumber')}>Bill # <SortArrow column="billNumber" /></th>
                  <th className="px-3 py-3 text-left cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('vendor')}>Vendor <SortArrow column="vendor" /></th>
                  <th className="px-3 py-3 text-center">Bearer</th>
                  <th className="px-3 py-3 text-left cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('property')}>Property <SortArrow column="property" /></th>
                  <th className="px-3 py-3 text-left max-w-[140px]">Note</th>
                  <th className="px-3 py-3 text-right cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('amount')}>Amount <SortArrow column="amount" /></th>
                  <th className="px-3 py-3 text-left">Account</th>
                  <th className="px-3 py-3 text-center cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('status')}>Bill status <SortArrow column="status" /></th>
                  <th className="px-3 py-3 text-right cursor-pointer hover:bg-app-toolbar/60 transition-colors" onClick={() => handleSortClick('balance')}>Bill balance <SortArrow column="balance" /></th>
                  <th className="px-3 py-3 text-center w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {totalEntries === 0 ? (
                  <tr><td colSpan={12} className="px-6 py-12 text-center text-app-muted">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-10 h-10 text-app-muted/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12h6M9 16h6M13 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V11l-8-8z"/><path d="M13 3v8h8"/></svg>
                      <p className="text-sm">No linked payments in this view.</p>
                      <p className="text-xs text-app-muted">Use Bills tab to pay, or Bulk pay bills.</p>
                    </div>
                  </td></tr>
                ) : paymentRows.map(row => {
                  const { payment, bill } = row;
                  const vendor = state.vendors?.find(v => v.id === bill.vendorId);
                  const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
                  const bld = prop ? state.buildings.find(bl => bl.id === prop.buildingId) : bill.buildingId ? state.buildings.find(bl => bl.id === bill.buildingId) : null;
                  const { balance: billBal, status: billEffStatus } = getEffectiveBillPaymentDisplay(bill, state.transactions);
                  const account = payment.accountId ? accountMap.get(payment.accountId) : undefined;
                  const whatsAppOpts = getWhatsAppOptions(bill);
                  const menuKey = `dash-pay-${payment.id}`;
                  return (
                    <tr
                      key={payment.id}
                      onClick={() => setTransactionToEdit(payment)}
                      className="group border-b border-app-border cursor-pointer hover:bg-ds-success/5 transition-all duration-150"
                    >
                      <td className="px-3 py-3">
                        {payment.type === TransactionType.INCOME && isBillPaymentFromSecurityDepositIncome(payment) ? (
                          <span className="inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-violet-100 text-violet-800">Security</span>
                        ) : (
                          <span className="inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">Pay</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-app-text text-sm tabular-nums">{formatDate(payment.date)}</td>
                      <td className="px-3 py-3 font-semibold text-primary text-sm">{bill.billNumber}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <VendorAvatar name={vendor?.name || '?'} />
                          <span className="text-sm font-medium text-app-text truncate max-w-[120px]" title={vendor?.name}>{vendor?.name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">{bearerBadge(bill)}</td>
                      <td className="px-3 py-3 text-app-muted text-sm truncate max-w-[100px]">{prop?.name || (bill.buildingId ? (bld?.name || 'Building') : '—')}</td>
                      <td className="px-3 py-3 text-app-text text-sm truncate max-w-[140px]" title={payment.description || ''}>{payment.description || '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-emerald-700">{payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-3 text-app-muted truncate max-w-[100px]" title={account?.name}>{account?.name || '—'}</td>
                      <td className="px-3 py-3 text-center"><span className={statusBadge(billEffStatus)}>{billEffStatus}</span></td>
                      <td className={`px-3 py-3 text-right tabular-nums font-medium ${billBal > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {billBal > 0 ? billBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                      </td>
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {whatsAppOpts.length > 0 && (
                            <div className="relative" ref={whatsAppMenuBillId === menuKey ? whatsAppMenuRef : null}>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setWhatsAppMenuBillId(prev => prev === menuKey ? null : menuKey); }} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors" title="WhatsApp"><span className="w-4 h-4 inline-block">{ICONS.whatsapp}</span></button>
                              {whatsAppMenuBillId === menuKey && (
                                <div className="absolute right-0 mt-1 py-1 bg-app-card border border-app-border rounded-xl shadow-lg z-20 min-w-[150px]">
                                  {whatsAppOpts.map(opt => (
                                    <button key={opt.id} type="button" onClick={(e) => { handleSendWhatsApp(e, bill, opt.id); setWhatsAppMenuBillId(null); }} className="block w-full text-left px-3 py-2 text-xs hover:bg-app-toolbar/60 transition-colors">{opt.label}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <button type="button" onClick={(e) => { e.stopPropagation(); setTransactionToEdit(payment); }} className="p-1.5 rounded-lg hover:bg-app-toolbar/60 text-app-text transition-colors" title="Edit"><span className="w-4 h-4 inline-block">{ICONS.edit}</span></button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setWarningModalState({ isOpen: true, transaction: payment }); }} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 transition-colors" title="Delete"><span className="w-4 h-4 inline-block">{ICONS.trash}</span></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
          </div>

          {/* Footer with Pagination */}
          <div className="px-5 py-3 bg-app-toolbar/30 border-t border-app-border flex items-center justify-between flex-shrink-0">
            <span className="text-xs text-app-muted tabular-nums">
              Showing {totalEntries > 0 ? paginatedStart + 1 : 0} to {paginatedEnd} of {totalEntries} entries
            </span>
            {renderPagination()}
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => { setIsCreateModalOpen(false); setBillToEdit(null); setDuplicateBillData(null); }}
        title={billToEdit ? 'Edit Bill' : duplicateBillData ? 'Duplicate Bill' : 'Record New Bill'}
        size={billToEdit?.id ? 'xl' : 'lg'}
        className={billToEdit?.id ? 'sm:!max-w-7xl' : undefined}
      >
        <div
          className={`flex flex-col lg:flex-row lg:items-stretch -m-3 sm:-m-4 md:-m-6 lg:-m-8 ${billToEdit?.id ? 'lg:min-h-[min(720px,calc(100vh-10rem))]' : ''}`}
        >
          <div className="flex-1 min-w-0 min-h-0">
            <InvoiceBillForm
              key={billToEdit?.id ?? (duplicateBillData ? 'duplicate-bill' : 'new-bill')}
              onClose={() => { setIsCreateModalOpen(false); setBillToEdit(null); setDuplicateBillData(null); }}
              type="bill"
              rentalContext={true}
              itemToEdit={billToEdit || undefined}
              initialData={duplicateBillData || undefined}
              onDuplicate={handleDuplicateBill}
            />
          </div>
          {billToEdit?.id ? (
            <BillLinkedPaymentsSidePanel
              billId={billToEdit.id}
              includeRentalOrphanPayments
              className="lg:w-[min(100%,380px)] lg:flex-shrink-0 lg:max-w-full lg:sticky lg:top-0 lg:self-start lg:max-h-[min(85vh,calc(100vh-8rem))] lg:overflow-y-auto"
            />
          ) : null}
        </div>
      </Modal>

      <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title={paymentBill ? `Pay Bill #${paymentBill.billNumber}` : 'Pay Bill'}>
        <TransactionForm
          key={paymentBill ? `pay-${paymentBill.id}` : 'pay-none'}
          onClose={() => setIsPaymentModalOpen(false)}
          transactionTypeForNew={TransactionType.EXPENSE}
          transactionToEdit={paymentTransactionData}
          onShowDeleteWarning={() => {}}
        />
      </Modal>

      <Modal isOpen={!!transactionToEdit} onClose={() => setTransactionToEdit(null)} title="Edit Payment">
        <TransactionForm onClose={() => setTransactionToEdit(null)} transactionToEdit={transactionToEdit} onShowDeleteWarning={(tx) => { setTransactionToEdit(null); setWarningModalState({ isOpen: true, transaction: tx }); }} />
      </Modal>

      <LinkedTransactionWarningModal
        isOpen={warningModalState.isOpen}
        onClose={() => setWarningModalState({ isOpen: false, transaction: null })}
        onConfirm={() => {
          const tx = warningModalState.transaction;
          if (tx) {
            const ids = [tx.id];
            if (tx.type === TransactionType.INCOME && tx.billId && isBillPaymentFromSecurityDepositIncome(tx)) {
              const bill = state.bills.find(b => b.id === tx.billId);
              if (bill) {
                const companion = findSecurityDepositAppliedExpenseForBillPayment(tx, bill, state.transactions);
                if (companion) ids.push(companion.id);
              }
            }
            if (ids.length > 1) {
              dispatch({ type: 'BATCH_DELETE_TRANSACTIONS', payload: { transactionIds: ids } });
            } else {
              dispatch({ type: 'DELETE_TRANSACTION', payload: tx.id });
            }
          }
          setWarningModalState({ isOpen: false, transaction: null });
          showToast('Payment deleted successfully');
        }}
        action="delete"
        linkedItemName="this bill"
        customConsequence={
          warningModalState.transaction &&
          warningModalState.transaction.type === TransactionType.INCOME &&
          isBillPaymentFromSecurityDepositIncome(warningModalState.transaction)
            ? 'Deleting this payment will restore the unpaid balance on the bill and remove the linked security-deposit ledger line.'
            : undefined
        }
      />

      <BillBulkPaymentModal
        isOpen={isBulkPayModalOpen}
        onClose={() => { setIsBulkPayModalOpen(false); setBulkPayUsesUnpaidPool(false); }}
        selectedBills={bulkPayUsesUnpaidPool ? unpaidBillsForBulk : selectedBillsList}
        onPaymentComplete={() => { setSelectedBillIds(new Set()); setIsBulkPayModalOpen(false); setBulkPayUsesUnpaidPool(false); }}
      />
    </div>
  );
};

export default RentalBillsDashboard;
