import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import Button from '../ui/Button';
import { ICONS, CURRENCY } from '../../constants';
import Modal from '../ui/Modal';
import TransactionForm from '../transactions/TransactionForm';
import { TransactionType, Bill, Transaction, ExpenseBearerType } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import { useNotification } from '../../context/NotificationContext';
import { WhatsAppService } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import useLocalStorage from '../../hooks/useLocalStorage';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { ImportType } from '../../services/importService';
import BillBulkPaymentModal from '../bills/BillBulkPaymentModal';

/** Derive expense bearer type from bill data (for bills without expenseBearerType) */
function getExpenseBearerType(bill: Bill, state: { rentalAgreements: { id: string }[] }): ExpenseBearerType {
  if (bill.expenseBearerType) return bill.expenseBearerType;
  if (bill.projectAgreementId && state.rentalAgreements?.some(ra => ra.id === bill.projectAgreementId))
    return 'tenant';
  if (bill.propertyId) return 'owner';
  if (bill.buildingId) return 'building';
  return 'building';
}

type ExpenseBearerFilter = 'all' | ExpenseBearerType;
type SortKey = 'issueDate' | 'billNumber' | 'vendorName' | 'expenseBearer' | 'propertyName' | 'buildingName' | 'amount' | 'balance' | 'status' | 'dueDate';

const RentalBillsPage: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showToast, showAlert } = useNotification();
  const { openChat } = useWhatsApp();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [expenseBearerFilter, setExpenseBearerFilter] = useLocalStorage<ExpenseBearerFilter>('rentalBills_expenseBearer', 'all');
  const [statusFilter, setStatusFilter] = useLocalStorage<string>('rentalBills_statusFilter', 'all');
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');

  // View & selection
  const [sortConfig, setSortConfig] = useLocalStorage<{ key: SortKey; direction: 'asc' | 'desc' }>('rentalBills_sort', { key: 'issueDate', direction: 'desc' });
  const [expandedBillIds, setExpandedBillIds] = useState<Set<string>>(new Set());
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentBill, setPaymentBill] = useState<Bill | null>(null);
  const [duplicateBillData, setDuplicateBillData] = useState<Partial<Bill> | null>(null);
  const [billToEdit, setBillToEdit] = useState<Bill | null>(null);
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
  const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'delete' | null }>({ isOpen: false, transaction: null, action: null });
  const [whatsAppMenuBillId, setWhatsAppMenuBillId] = useState<string | null>(null);
  const whatsAppMenuRef = useRef<HTMLDivElement>(null);

  // Close WhatsApp dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (whatsAppMenuRef.current && !whatsAppMenuRef.current.contains(e.target as Node)) {
        setWhatsAppMenuBillId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Base bills: rental only (no projectId)
  const baseBills = useMemo(() => state.bills.filter(b => !b.projectId), [state.bills]);

  // Vendors with bills (for filter dropdown)
  const vendorsWithBills = useMemo(() => {
    const vendorIds = new Set(baseBills.map(b => b.vendorId).filter(Boolean));
    return (state.vendors || []).filter(v => vendorIds.has(v.id));
  }, [baseBills, state.vendors]);

  // Filtered bills
  const filteredBills = useMemo(() => {
    let result = baseBills;

    if (expenseBearerFilter !== 'all') {
      result = result.filter(b => getExpenseBearerType(b, state) === expenseBearerFilter);
    }
    if (vendorFilter !== 'all') result = result.filter(b => b.vendorId === vendorFilter);
    if (propertyFilter !== 'all') result = result.filter(b => b.propertyId === propertyFilter);
    if (buildingFilter !== 'all') {
      result = result.filter(b => {
        if (b.buildingId === buildingFilter) return true;
        const prop = b.propertyId ? state.properties.find(p => p.id === b.propertyId) : null;
        return prop?.buildingId === buildingFilter;
      });
    }
    if (statusFilter !== 'all') result = result.filter(b => b.status === statusFilter);
    if (dateRangeStart) result = result.filter(b => b.issueDate >= dateRangeStart);
    if (dateRangeEnd) result = result.filter(b => b.issueDate <= dateRangeEnd);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => {
        if (b.billNumber?.toLowerCase().includes(q)) return true;
        const vendor = state.vendors?.find(v => v.id === b.vendorId);
        if (vendor?.name?.toLowerCase().includes(q)) return true;
        if (b.description?.toLowerCase().includes(q)) return true;
        if (b.propertyId) {
          const prop = state.properties.find(p => p.id === b.propertyId);
          if (prop?.name?.toLowerCase().includes(q)) return true;
        }
        const prop = b.propertyId ? state.properties.find(p => p.id === b.propertyId) : null;
        const bld = prop ? state.buildings.find(bl => bl.id === prop.buildingId) : b.buildingId ? state.buildings.find(bl => bl.id === b.buildingId) : null;
        if (bld?.name?.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    return result.sort((a, b) => {
      let valA: any, valB: any;
      const getBearer = (x: Bill) => getExpenseBearerType(x, state);
      const getPropertyName = (x: Bill) => state.properties.find(p => p.id === x.propertyId)?.name || '';
      const getBldName = (x: Bill) => {
        if (x.buildingId) return state.buildings.find(b => b.id === x.buildingId)?.name || '';
        const prop = x.propertyId ? state.properties.find(p => p.id === x.propertyId) : null;
        return prop ? state.buildings.find(b => b.id === prop.buildingId)?.name || '' : '';
      };
      switch (sortConfig.key) {
        case 'issueDate': valA = new Date(a.issueDate).getTime(); valB = new Date(b.issueDate).getTime(); break;
        case 'dueDate': valA = a.dueDate ? new Date(a.dueDate).getTime() : 0; valB = b.dueDate ? new Date(b.dueDate).getTime() : 0; break;
        case 'amount': valA = a.amount; valB = b.amount; break;
        case 'balance': valA = a.amount - a.paidAmount; valB = b.amount - b.paidAmount; break;
        case 'status': valA = a.status; valB = b.status; break;
        case 'billNumber': valA = a.billNumber.toLowerCase(); valB = b.billNumber.toLowerCase(); break;
        case 'vendorName': valA = state.vendors?.find(v => v.id === a.vendorId)?.name?.toLowerCase() || ''; valB = state.vendors?.find(v => v.id === b.vendorId)?.name?.toLowerCase() || ''; break;
        case 'expenseBearer': valA = getBearer(a); valB = getBearer(b); break;
        case 'propertyName': valA = getPropertyName(a).toLowerCase(); valB = getPropertyName(b).toLowerCase(); break;
        case 'buildingName': valA = getBldName(a).toLowerCase(); valB = getBldName(b).toLowerCase(); break;
        default: valA = a.issueDate; valB = b.issueDate;
      }
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [baseBills, expenseBearerFilter, vendorFilter, propertyFilter, buildingFilter, statusFilter, dateRangeStart, dateRangeEnd, searchQuery, sortConfig, state]);

  // Summary stats (4 cards matching invoice page)
  const summaryStats = useMemo(() => {
    const unpaid = filteredBills.filter(b => b.status === 'Unpaid' || b.status === 'Overdue');
    const paid = filteredBills.filter(b => b.status === 'Paid');
    const overdue = filteredBills.filter(b => b.status === 'Overdue' || (b.dueDate && new Date(b.dueDate) < new Date() && b.status !== 'Paid'));
    const totalPending = filteredBills
      .filter(b => b.status !== 'Paid')
      .reduce((sum, b) => sum + Math.max(0, b.amount - b.paidAmount), 0);

    return {
      unpaidCount: unpaid.length,
      unpaidAmount: unpaid.reduce((s, b) => s + Math.max(0, b.amount - b.paidAmount), 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((s, b) => s + b.paidAmount, 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((s, b) => s + Math.max(0, b.amount - b.paidAmount), 0),
      totalPending,
    };
  }, [filteredBills]);

  const handleSort = (key: SortKey) => {
    setSortConfig(c => ({ key, direction: c.key === key && c.direction === 'asc' ? 'desc' : 'asc' }));
  };
  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
    return <span className="text-accent ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  const handleRecordPayment = (bill: Bill) => { setPaymentBill(bill); setIsPaymentModalOpen(true); };
  const handleEdit = (bill: Bill) => { setBillToEdit(bill); setDuplicateBillData(null); setIsCreateModalOpen(true); };
  const handleDuplicate = (data: Partial<Bill>) => {
    const { id, paidAmount, status, ...rest } = data;
    setDuplicateBillData({ ...rest, paidAmount: 0, status: undefined });
    setBillToEdit(null);
    setIsCreateModalOpen(true);
  };
  const handleBulkPaymentComplete = () => { setSelectedBillIds(new Set()); setIsBulkPayModalOpen(false); };
  const selectedBillsList = useMemo(() => state.bills.filter(b => selectedBillIds.has(b.id)), [state.bills, selectedBillIds]);

  const paymentTransactionData = useMemo(() => {
    if (!paymentBill) return { id: '', type: TransactionType.EXPENSE, amount: 0, date: new Date().toISOString().split('T')[0], accountId: '' } as any;
    let tenantId: string | undefined;
    let tenantCategoryId: string | undefined;
    if (paymentBill.projectAgreementId) {
      const ra = state.rentalAgreements.find(ra => ra.id === paymentBill.projectAgreementId);
      if (ra) tenantId = ra.contactId;
    }
    if (tenantId && paymentBill.categoryId) {
      const orig = state.categories.find(c => c.id === paymentBill.categoryId);
      if (orig) {
        const tenantCat = state.categories.find(c => c.name === `${orig.name} (Tenant)` && c.type === TransactionType.EXPENSE);
        tenantCategoryId = tenantCat?.id || paymentBill.categoryId;
      }
    }
    return {
      id: '', type: TransactionType.EXPENSE,
      amount: paymentBill.amount - paymentBill.paidAmount,
      date: paymentBill.issueDate ? new Date(paymentBill.issueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      accountId: '', billId: paymentBill.id,
      contactId: tenantId || paymentBill.contactId,
      projectId: paymentBill.projectId, buildingId: paymentBill.buildingId, propertyId: paymentBill.propertyId,
      categoryId: tenantCategoryId || paymentBill.categoryId,
      contractId: paymentBill.contractId,
      description: paymentBill.description || `Payment for Bill #${paymentBill.billNumber}`,
    } as any;
  }, [paymentBill, state.rentalAgreements, state.categories]);

  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedBillIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const getPropertyOrUnitLabel = (bill: Bill) => {
    if (bill.propertyId) return state.properties.find(p => p.id === bill.propertyId)?.name || '-';
    if (bill.buildingId && !bill.propertyId) return 'Building-wide';
    return '-';
  };
  const getBuildingName = (bill: Bill) => {
    if (bill.buildingId) return state.buildings.find(b => b.id === bill.buildingId)?.name || 'Unknown';
    const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
    return prop ? state.buildings.find(b => b.id === prop.buildingId)?.name || 'Unknown' : 'General';
  };

  const handleSendWhatsApp = (e: React.MouseEvent, bill: Bill, recipient: 'vendor' | 'owner' | 'tenant') => {
    e.stopPropagation();
    setWhatsAppMenuBillId(null);
    let contact: { name: string; contactNo?: string } | null = null;
    let message = '';

    if (recipient === 'vendor') {
      const vendor = state.vendors?.find(v => v.id === bill.vendorId);
      if (!vendor?.contactNo) { showAlert('Vendor does not have a phone number saved.'); return; }
      contact = vendor;
      message = WhatsAppService.generateBillPayment(state.whatsAppTemplates.billPayment, vendor, bill.billNumber, bill.paidAmount);
    } else if (recipient === 'owner') {
      const prop = bill.propertyId ? state.properties.find(p => p.id === bill.propertyId) : null;
      const owner = prop?.ownerId ? state.contacts.find(c => c.id === prop.ownerId) : null;
      if (!owner?.contactNo) { showAlert('Owner does not have a phone number saved.'); return; }
      contact = owner;
      const billToOwner = (state.whatsAppTemplates as any).billToOwner || state.whatsAppTemplates.billPayment;
      message = WhatsAppService.replaceTemplateVariables(billToOwner, { contactName: owner.name, billNumber: bill.billNumber, amount: `${CURRENCY} ${bill.amount.toLocaleString()}` });
    } else if (recipient === 'tenant') {
      const ra = bill.projectAgreementId ? state.rentalAgreements.find(ra => ra.id === bill.projectAgreementId) : null;
      const tenant = ra?.contactId ? state.contacts.find(c => c.id === ra.contactId) : null;
      if (!tenant?.contactNo) { showAlert('Tenant does not have a phone number saved.'); return; }
      contact = tenant;
      const billToTenant = (state.whatsAppTemplates as any).billToTenant || state.whatsAppTemplates.billPayment;
      message = WhatsAppService.replaceTemplateVariables(billToTenant, { contactName: tenant.name, billNumber: bill.billNumber, amount: `${CURRENCY} ${bill.amount.toLocaleString()}`, note: 'This amount will be deducted from your security deposit.' });
    }
    if (contact && message) openChat(contact, contact.contactNo!, message);
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

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'Paid': 'bg-emerald-100 text-emerald-800',
      'Unpaid': 'bg-rose-100 text-rose-800',
      'Partially Paid': 'bg-amber-100 text-amber-800',
      'Overdue': 'bg-red-100 text-red-900',
      'Draft': 'bg-slate-100 text-slate-800'
    };
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${colors[status] || 'bg-gray-100'}`}>{status}</span>;
  };

  const getExpenseBearerBadge = (bearer: ExpenseBearerType) => {
    const styles = { owner: 'bg-indigo-100 text-indigo-800', building: 'bg-emerald-100 text-emerald-800', tenant: 'bg-amber-100 text-amber-800' };
    const labels = { owner: 'Owner', building: 'Building', tenant: 'Tenant' };
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${styles[bearer]}`}>{labels[bearer]}</span>;
  };

  const filterInputClass =
    'w-full pl-2.5 py-1.5 text-sm border border-slate-300 rounded-md shadow-sm focus:ring-2 focus:ring-accent/50 focus:border-accent bg-white';

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50/50 pt-2 px-3 sm:pt-3 sm:px-4 pb-1 gap-2">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button onClick={() => { setDuplicateBillData(null); setBillToEdit(null); setIsCreateModalOpen(true); }} size="sm">
          <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
          New Bill
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.RENTAL_BILLS });
            dispatch({ type: 'SET_PAGE', payload: 'import' });
          }}
          size="sm"
        >
          <div className="w-4 h-4 mr-2">{ICONS.download}</div>
          Bulk Import
        </Button>
        {selectedBillIds.size > 0 && (
          <Button onClick={() => setIsBulkPayModalOpen(true)} size="sm">
            Pay Selected ({selectedBillIds.size})
          </Button>
        )}
      </div>

      {/* Summary Cards - compact (match invoices page) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
        <div className="bg-white rounded-lg border border-slate-200 px-2.5 py-1.5 shadow-sm">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Unpaid</p>
          <p className="text-sm font-bold text-slate-800 leading-tight">{summaryStats.unpaidCount}</p>
          <p className="text-xs text-slate-600 truncate">
            {CURRENCY} {summaryStats.unpaidAmount.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 px-2.5 py-1.5 shadow-sm">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Paid</p>
          <p className="text-sm font-bold text-emerald-700 leading-tight">{summaryStats.paidCount}</p>
          <p className="text-xs text-slate-600 truncate">
            {CURRENCY} {summaryStats.paidAmount.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-rose-200 px-2.5 py-1.5 shadow-sm">
          <p className="text-[10px] font-semibold text-rose-600 uppercase tracking-wide">Overdue</p>
          <p className="text-sm font-bold text-rose-700 leading-tight">{summaryStats.overdueCount}</p>
          <p className="text-xs text-slate-600 truncate">
            {CURRENCY} {summaryStats.overdueAmount.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-indigo-200 px-2.5 py-1.5 shadow-sm">
          <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">Total Pending</p>
          <p className="text-sm font-bold text-indigo-700 leading-tight truncate">
            {CURRENCY} {summaryStats.totalPending.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filter Bar - compact (match invoices page) */}
      <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row gap-2 flex-wrap">
        <div className="flex flex-wrap items-center gap-1.5">
          {['All', 'Unpaid', 'Paid', 'Partially Paid', 'Overdue'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s === 'All' ? 'all' : s)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                (s === 'All' && statusFilter === 'all') || statusFilter === s
                  ? 'bg-accent text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'All' },
            { id: 'owner', label: 'Owner' },
            { id: 'building', label: 'Building' },
            { id: 'tenant', label: 'Tenant' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setExpenseBearerFilter(opt.id as ExpenseBearerFilter)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                expenseBearerFilter === opt.id
                  ? 'bg-accent text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={vendorFilter}
          onChange={e => setVendorFilter(e.target.value)}
          className={filterInputClass}
          style={{ width: '160px' }}
        >
          <option value="all">All Vendors</option>
          {vendorsWithBills.map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <select
          value={buildingFilter}
          onChange={e => setBuildingFilter(e.target.value)}
          className={filterInputClass}
          style={{ width: '160px' }}
        >
          <option value="all">All Buildings</option>
          {state.buildings.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select
          value={propertyFilter}
          onChange={e => setPropertyFilter(e.target.value)}
          className={filterInputClass}
          style={{ width: '160px' }}
        >
          <option value="all">All Properties</option>
          {state.properties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateRangeStart}
            onChange={e => setDateRangeStart(e.target.value)}
            placeholder="From"
            className={filterInputClass}
            style={{ width: '130px' }}
          />
          <input
            type="date"
            value={dateRangeEnd}
            onChange={e => setDateRangeEnd(e.target.value)}
            placeholder="To"
            className={filterInputClass}
            style={{ width: '130px' }}
          />
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-slate-400">
            <div className="w-4 h-4">{ICONS.search}</div>
          </div>
          <input
            type="text"
            placeholder="Search bill #, vendor, property..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-1.5 w-full text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
        </div>
      </div>

      {/* Bills Table */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto bg-white rounded-xl border border-slate-200 shadow-sm">
          <table className="min-w-full divide-y divide-slate-100 text-xs border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-3 py-1.5 w-10 text-center border-b border-slate-200 bg-slate-50"></th>
                <th onClick={() => handleSort('issueDate')} className="px-3 py-1.5 text-left text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none border-b border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">Date <SortIcon column="issueDate" /></th>
                <th onClick={() => handleSort('billNumber')} className="px-3 py-1.5 text-left text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none border-b border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">Bill # <SortIcon column="billNumber" /></th>
                <th onClick={() => handleSort('vendorName')} className="px-3 py-1.5 text-left text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none border-b border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">Vendor <SortIcon column="vendorName" /></th>
                <th onClick={() => handleSort('expenseBearer')} className="px-3 py-1.5 text-left text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none border-b border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">Bearer <SortIcon column="expenseBearer" /></th>
                <th onClick={() => handleSort('propertyName')} className="px-3 py-1.5 text-left text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none border-b border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">Property <SortIcon column="propertyName" /></th>
                <th onClick={() => handleSort('buildingName')} className="px-3 py-1.5 text-left text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none border-b border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">Building <SortIcon column="buildingName" /></th>
                <th onClick={() => handleSort('amount')} className="px-3 py-1.5 text-right text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none border-b border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">Amount <SortIcon column="amount" /></th>
                <th className="px-3 py-1.5 text-right text-[10px] uppercase font-bold tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50">Paid</th>
                <th onClick={() => handleSort('balance')} className="px-3 py-1.5 text-right text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none border-b border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">Balance <SortIcon column="balance" /></th>
                <th onClick={() => handleSort('status')} className="px-3 py-1.5 text-center text-[10px] uppercase font-bold tracking-wider text-slate-500 cursor-pointer select-none border-b border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">Status <SortIcon column="status" /></th>
                <th className="px-3 py-1.5 text-center text-[10px] uppercase font-bold tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50 w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBills.length > 0 ? filteredBills.map((bill, idx) => {
                const balance = bill.amount - bill.paidAmount;
                const bearer = getExpenseBearerType(bill, state);
                const vendor = state.vendors?.find(v => v.id === bill.vendorId);
                const isExpanded = expandedBillIds.has(bill.id);
                const hasPayments = bill.paidAmount > 0;
                const payments = hasPayments ? state.transactions.filter(t => t.billId === bill.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [];
                const whatsAppOpts = getWhatsAppOptions(bill);

                return (
                  <React.Fragment key={bill.id}>
                    <tr className={`cursor-pointer transition-colors group border-b border-slate-50 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-slate-100`} onClick={() => handleEdit(bill)}>
                      <td className="px-3 py-1.5 text-center w-10 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="rounded text-accent focus:ring-accent w-4 h-4 border-gray-300 cursor-pointer" checked={selectedBillIds.has(bill.id)}
                          onChange={(e) => { e.stopPropagation(); setSelectedBillIds(prev => { const n = new Set(prev); n.has(bill.id) ? n.delete(bill.id) : n.add(bill.id); return n; }); }} />
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-xs text-slate-500 overflow-hidden text-ellipsis">
                        <div className="flex items-center gap-1">
                          {hasPayments && <button onClick={(e) => toggleExpand(e, bill.id)} className={`p-0.5 rounded hover:bg-slate-200 text-slate-400 inline-flex ${isExpanded ? 'rotate-90' : ''}`}><span className="w-3 h-3">{ICONS.chevronRight}</span></button>}
                          {formatDate(bill.issueDate)}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-xs font-bold text-slate-700 tabular-nums overflow-hidden text-ellipsis">{bill.billNumber}</td>
                      <td className="px-3 py-1.5 text-xs text-slate-600 truncate max-w-[120px] overflow-hidden text-ellipsis">{vendor?.name || '-'}</td>
                      <td className="px-3 py-1.5">{getExpenseBearerBadge(bearer)}</td>
                      <td className="px-3 py-1.5 text-xs text-slate-600 truncate max-w-[120px] overflow-hidden text-ellipsis">{getPropertyOrUnitLabel(bill)}</td>
                      <td className="px-3 py-1.5 text-xs text-slate-600 truncate overflow-hidden text-ellipsis">{getBuildingName(bill)}</td>
                      <td className="px-3 py-1.5 text-right text-xs font-bold text-slate-700 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">{CURRENCY} {bill.amount.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right text-xs font-bold text-slate-700 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis text-emerald-600">{CURRENCY} {bill.paidAmount.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right">
                        <span className={`text-xs font-bold tabular-nums whitespace-nowrap ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{CURRENCY} {balance.toLocaleString()}</span>
                        {balance > 0 && <Button size="sm" onClick={(e) => { e.stopPropagation(); handleRecordPayment(bill); }} className="ml-2 opacity-0 group-hover:opacity-100 h-6 text-[10px] px-2">Pay</Button>}
                      </td>
                      <td className="px-3 py-1.5 text-center">{getStatusBadge(bill.status)}</td>
                      <td className="px-3 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleEdit(bill)} className="p-1.5 rounded hover:bg-slate-200 text-slate-500" title="Edit"><span className="w-4 h-4">{ICONS.edit}</span></button>
                          {whatsAppOpts.length > 0 && (
                            <div className="relative" ref={whatsAppMenuBillId === bill.id ? whatsAppMenuRef : null}>
                              <button onClick={(e) => { e.stopPropagation(); setWhatsAppMenuBillId(prev => prev === bill.id ? null : bill.id); }} className="p-1.5 rounded text-green-600 hover:bg-green-50" title="Send via WhatsApp"><span className="w-4 h-4">{ICONS.whatsapp}</span></button>
                              {whatsAppMenuBillId === bill.id && (
                                <div className="absolute right-0 mt-1 py-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 min-w-[140px]">
                                  {whatsAppOpts.map(opt => (
                                    <button key={opt.id} onClick={(e) => handleSendWhatsApp(e, bill, opt.id)} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">{opt.label}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && hasPayments && (
                      <tr className="!bg-indigo-50/30">
                        <td colSpan={12} className="p-0 border-b border-slate-100">
                          <div className="border-l-4 border-indigo-200 ml-8 my-2 pl-4 py-2 space-y-1">
                            {payments.map((pay) => (
                              <div key={pay.id} className="flex items-center text-xs text-slate-600 hover:bg-slate-100 p-1 rounded cursor-pointer" onClick={() => setTransactionToEdit(pay)}>
                                <span className="w-24 flex-shrink-0 text-slate-500">{formatDate(pay.date)}</span>
                                <span className="flex-grow truncate font-medium">{pay.description || 'Payment'}</span>
                                <span className="w-32 flex-shrink-0 text-right">{state.accounts.find(a => a.id === pay.accountId)?.name}</span>
                                <span className="w-24 text-right font-mono text-emerald-600">{CURRENCY} {pay.amount.toLocaleString()}</span>
                                <span className="w-6 inline-flex opacity-0 group-hover:opacity-100"><span className="w-3 h-3">{ICONS.edit}</span></span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              }) : (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-slate-500 text-xs">No bills found matching selected criteria.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-1.5 border-t border-slate-200 bg-slate-50/80 flex justify-between items-center text-xs font-semibold text-slate-600">
          <span>Total Bills: {filteredBills.length}</span>
          <span>Total Amount: {CURRENCY} {filteredBills.reduce((s, b) => s + b.amount, 0).toLocaleString()}</span>
          <span>Total Payable: {CURRENCY} {filteredBills.reduce((s, b) => s + Math.max(0, b.amount - b.paidAmount), 0).toLocaleString()}</span>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} title={duplicateBillData ? 'New Bill (Duplicate)' : billToEdit ? 'Edit Bill' : 'Record New Bill'} size="xl">
        <InvoiceBillForm onClose={() => setIsCreateModalOpen(false)} type="bill" rentalContext={true} itemToEdit={billToEdit || undefined} initialData={duplicateBillData || undefined} onDuplicate={handleDuplicate} />
      </Modal>
      <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title={paymentBill ? `Pay Bill #${paymentBill.billNumber}` : 'Pay Bill'}>
        <TransactionForm onClose={() => setIsPaymentModalOpen(false)} transactionTypeForNew={TransactionType.EXPENSE} transactionToEdit={paymentTransactionData} onShowDeleteWarning={() => {}} />
      </Modal>
      <Modal isOpen={!!transactionToEdit} onClose={() => setTransactionToEdit(null)} title="Edit Payment">
        <TransactionForm onClose={() => setTransactionToEdit(null)} transactionToEdit={transactionToEdit} onShowDeleteWarning={(tx) => { setTransactionToEdit(null); setWarningModalState({ isOpen: true, transaction: tx, action: 'delete' }); }} />
      </Modal>
      <LinkedTransactionWarningModal isOpen={warningModalState.isOpen} onClose={() => setWarningModalState({ isOpen: false, transaction: null, action: null })} onConfirm={() => {
        if (warningModalState.transaction) dispatch({ type: 'DELETE_TRANSACTION', payload: warningModalState.transaction.id });
        setWarningModalState({ isOpen: false, transaction: null, action: null });
        showToast('Payment deleted successfully');
      }} action="delete" linkedItemName="this bill" />
      <BillBulkPaymentModal isOpen={isBulkPayModalOpen} onClose={() => setIsBulkPayModalOpen(false)} selectedBills={selectedBillsList} onPaymentComplete={handleBulkPaymentComplete} />
    </div>
  );
};

export default RentalBillsPage;
