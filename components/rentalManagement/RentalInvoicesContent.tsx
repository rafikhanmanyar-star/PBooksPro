import React, { useState, useMemo, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Invoice, InvoiceStatus, InvoiceType, Transaction, TransactionType } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import RentalFinancialGrid, { FinancialRecord } from '../invoices/RentalFinancialGrid';
import InvoiceDetailView from '../invoices/InvoiceDetailView';
import RentalPaymentModal from '../invoices/RentalPaymentModal';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import BulkPaymentModal from '../invoices/BulkPaymentModal';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';
import { ImportType } from '../../services/importService';
import useLocalStorage from '../../hooks/useLocalStorage';
import { useGenerateDueInvoices } from '../../hooks/useGenerateDueInvoices';
import { useDebounce } from '../../hooks/useDebounce';

interface RentalInvoicesContentProps {
  onCreateRentalClick?: () => void;
  onCreateSecurityClick?: () => void;
  onSchedulesClick?: () => void;
}

const RENTAL_INVOICE_TYPES = [InvoiceType.RENTAL, InvoiceType.SECURITY_DEPOSIT];

const RentalInvoicesContent: React.FC<RentalInvoicesContentProps> = ({
  onCreateRentalClick,
  onCreateSecurityClick,
  onSchedulesClick,
}) => {
  const { state, dispatch } = useAppContext();
  const { showConfirm, showToast, showAlert } = useNotification();

  const [statusFilter, setStatusFilter] = useLocalStorage<string>('rental_invoices_statusFilter', 'All');
  const [groupBy, setGroupBy] = useLocalStorage<'tenant' | 'owner' | 'property' | 'building'>(
    'rental_invoices_groupBy',
    'tenant'
  );
  const [entityFilterId, setEntityFilterId] = useState<string>('all');

  const handleSetGroupBy = useCallback((g: 'tenant' | 'owner' | 'property' | 'building') => {
    setGroupBy(g);
    setEntityFilterId('all');
  }, [setGroupBy]);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<string>('All');

  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
  const [paymentDeleteModal, setPaymentDeleteModal] = useState<{ isOpen: boolean; transaction: Transaction | null }>({ isOpen: false, transaction: null });

  const { overdueCount, handleGenerateAllDue, isGenerating } = useGenerateDueInvoices();

  // Shared lookup Maps — O(1) lookups replace repeated .find() calls across all memos
  const contactsById = useMemo(() => new Map(state.contacts.map(c => [c.id, c])), [state.contacts]);
  const propertiesById = useMemo(() => new Map(state.properties.map(p => [p.id, p])), [state.properties]);
  const buildingsById = useMemo(() => new Map(state.buildings.map(b => [b.id, b])), [state.buildings]);
  const accountsById = useMemo(() => new Map(state.accounts.map(a => [a.id, a])), [state.accounts]);
  const invoicesById = useMemo(() => new Map(state.invoices.map(i => [i.id, i])), [state.invoices]);

  const tenantsWithInvoices = useMemo(() => {
    const contactIds = new Set(
      state.invoices
        .filter(inv => RENTAL_INVOICE_TYPES.includes(inv.invoiceType))
        .map(inv => inv.contactId)
    );
    return state.contacts.filter(c => contactIds.has(c.id));
  }, [state.invoices, state.contacts]);

  const ownersWithInvoices = useMemo(() => {
    const ownerIds = new Set<string>();
    for (const inv of state.invoices) {
      if (!RENTAL_INVOICE_TYPES.includes(inv.invoiceType) || !inv.propertyId) continue;
      const ownerId = propertiesById.get(inv.propertyId)?.ownerId;
      if (ownerId) ownerIds.add(ownerId);
    }
    return state.contacts.filter(c => ownerIds.has(c.id));
  }, [state.invoices, propertiesById, state.contacts]);

  const propertiesWithInvoices = useMemo(() => {
    const propIds = new Set(
      state.invoices
        .filter(inv => RENTAL_INVOICE_TYPES.includes(inv.invoiceType))
        .map(inv => inv.propertyId)
        .filter(Boolean) as string[]
    );
    return state.properties.filter(p => propIds.has(p.id));
  }, [state.invoices, state.properties]);

  const baseInvoices = useMemo(() => {
    let invoices = state.invoices.filter(inv =>
      RENTAL_INVOICE_TYPES.includes(inv.invoiceType)
    );

    if (entityFilterId && entityFilterId !== 'all' && groupBy === 'building') {
      invoices = invoices.filter(inv => {
        if (inv.buildingId === entityFilterId) return true;
        if (inv.propertyId) {
          return propertiesById.get(inv.propertyId)?.buildingId === entityFilterId;
        }
        return false;
      });
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      invoices = invoices.filter(inv => {
        if (inv.invoiceNumber?.toLowerCase().includes(q)) return true;
        if (contactsById.get(inv.contactId)?.name?.toLowerCase().includes(q)) return true;
        if (inv.description?.toLowerCase().includes(q)) return true;
        if (inv.propertyId) {
          const prop = propertiesById.get(inv.propertyId);
          if (prop?.name?.toLowerCase().includes(q)) return true;
          if (prop?.buildingId) {
            if (buildingsById.get(prop.buildingId)?.name?.toLowerCase().includes(q)) return true;
          }
        }
        return false;
      });
    }

    if (statusFilter !== 'All') {
      invoices = invoices.filter(inv => inv.status === statusFilter);
    }

    if (entityFilterId && entityFilterId !== 'all') {
      if (groupBy === 'tenant') {
        invoices = invoices.filter(inv => inv.contactId === entityFilterId);
      } else if (groupBy === 'owner') {
        invoices = invoices.filter(inv => {
          return propertiesById.get(inv.propertyId!)?.ownerId === entityFilterId;
        });
      } else if (groupBy === 'property') {
        invoices = invoices.filter(inv => inv.propertyId === entityFilterId);
      }
    }

    return invoices;
  }, [
    state.invoices,
    contactsById,
    propertiesById,
    buildingsById,
    debouncedSearch,
    statusFilter,
    groupBy,
    entityFilterId,
  ]);

  const invoicesWithoutStatusFilter = useMemo(() => {
    let invoices = state.invoices.filter(inv =>
      RENTAL_INVOICE_TYPES.includes(inv.invoiceType)
    );
    if (entityFilterId && entityFilterId !== 'all' && groupBy === 'building') {
      invoices = invoices.filter(inv => {
        if (inv.buildingId === entityFilterId) return true;
        if (inv.propertyId) {
          return propertiesById.get(inv.propertyId)?.buildingId === entityFilterId;
        }
        return false;
      });
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      invoices = invoices.filter(inv => {
        if (inv.invoiceNumber?.toLowerCase().includes(q)) return true;
        if (contactsById.get(inv.contactId)?.name?.toLowerCase().includes(q)) return true;
        if (inv.description?.toLowerCase().includes(q)) return true;
        if (inv.propertyId) {
          if (propertiesById.get(inv.propertyId)?.name?.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    if (entityFilterId && entityFilterId !== 'all') {
      if (groupBy === 'tenant') invoices = invoices.filter(inv => inv.contactId === entityFilterId);
      else if (groupBy === 'owner') invoices = invoices.filter(inv => propertiesById.get(inv.propertyId!)?.ownerId === entityFilterId);
      else if (groupBy === 'property') invoices = invoices.filter(inv => inv.propertyId === entityFilterId);
      else if (groupBy === 'building') {
        invoices = invoices.filter(inv => {
          if (inv.buildingId === entityFilterId) return true;
          return propertiesById.get(inv.propertyId!)?.buildingId === entityFilterId;
        });
      }
    }
    return invoices;
  }, [state.invoices, contactsById, propertiesById, debouncedSearch, groupBy, entityFilterId]);

  const financialRecords = useMemo<FinancialRecord[]>(() => {
    const records: FinancialRecord[] = [];
    const invoiceIdSet = new Set(invoicesWithoutStatusFilter.map(i => i.id));

    for (const inv of baseInvoices) {
      records.push({
        id: inv.id,
        type: 'Invoice',
        reference: inv.invoiceNumber,
        date: inv.issueDate,
        accountName: contactsById.get(inv.contactId)?.name || 'Unknown',
        amount: inv.amount,
        remainingAmount: inv.amount - inv.paidAmount,
        raw: inv,
        status: inv.status,
      });
    }

    // Precompute batch groups in a single pass: O(M) instead of O(M^2)
    const batchGroups = new Map<string, Transaction[]>();
    const unbatchedTxs: Transaction[] = [];
    for (const tx of state.transactions) {
      if (tx.type !== TransactionType.INCOME) continue;
      if (!tx.invoiceId || !invoiceIdSet.has(tx.invoiceId)) continue;
      if (tx.batchId) {
        let group = batchGroups.get(tx.batchId);
        if (!group) { group = []; batchGroups.set(tx.batchId, group); }
        group.push(tx);
      } else {
        unbatchedTxs.push(tx);
      }
    }

    for (const [batchId, batchTxs] of batchGroups) {
      const totalAmount = batchTxs.reduce((sum, t) => sum + t.amount, 0);
      const firstTx = batchTxs[0];
      records.push({
        id: `batch-${batchId}`,
        type: 'Payment (Bulk)',
        reference: `${batchTxs.length} Items`,
        date: firstTx.date,
        accountName: accountsById.get(firstTx.accountId)?.name || 'Unknown',
        amount: totalAmount,
        remainingAmount: 0,
        raw: { ...firstTx, amount: totalAmount, children: batchTxs } as Transaction,
        status: 'Paid',
      });
    }

    for (const tx of unbatchedTxs) {
      records.push({
        id: tx.id,
        type: 'Payment',
        reference: invoicesById.get(tx.invoiceId!)?.invoiceNumber || '',
        date: tx.date,
        accountName: accountsById.get(tx.accountId)?.name || 'Unknown',
        amount: tx.amount,
        remainingAmount: 0,
        raw: tx,
        status: 'Paid',
      });
    }

    return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [baseInvoices, invoicesWithoutStatusFilter, state.transactions, accountsById, contactsById, invoicesById]);

  const summaryStats = useMemo(() => {
    const effectiveStatus = (inv: Invoice) => {
      const remaining = inv.amount - inv.paidAmount;
      if (remaining <= 0.01) return InvoiceStatus.PAID;
      if (inv.paidAmount > 0.01) return InvoiceStatus.PARTIALLY_PAID;
      if (inv.dueDate && new Date(inv.dueDate) < new Date() && remaining > 0) return InvoiceStatus.OVERDUE;
      return InvoiceStatus.UNPAID;
    };
    const unpaid = baseInvoices.filter(inv => { const s = effectiveStatus(inv); return s === InvoiceStatus.UNPAID || s === InvoiceStatus.OVERDUE; });
    const paid = baseInvoices.filter(inv => effectiveStatus(inv) === InvoiceStatus.PAID);
    const overdue = baseInvoices.filter(inv => effectiveStatus(inv) === InvoiceStatus.OVERDUE);
    const totalPending = baseInvoices
      .filter(inv => effectiveStatus(inv) !== InvoiceStatus.PAID)
      .reduce((sum, inv) => sum + Math.max(0, inv.amount - inv.paidAmount), 0);

    return {
      unpaidCount: unpaid.length,
      unpaidAmount: unpaid.reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount), 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((s, i) => s + i.paidAmount, 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((s, i) => s + Math.max(0, i.amount - i.paidAmount), 0),
      totalPending,
    };
  }, [baseInvoices]);

  const toggleSelection = useCallback((id: string) => {
    const inv = state.invoices.find(i => i.id === id);
    if (!inv || !RENTAL_INVOICE_TYPES.includes(inv.invoiceType)) return;
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [state.invoices]);

  const handleRecordPayment = useCallback((item: Invoice) => {
    setViewInvoice(null);
    setPaymentInvoice(item);
    setIsPaymentModalOpen(true);
  }, []);

  const handleInvoiceClick = useCallback((item: unknown) => {
    if (item && typeof item === 'object' && 'invoiceNumber' in item) {
      setViewInvoice(item as Invoice);
    }
  }, []);

  const handleEditInvoice = useCallback((invoice: Invoice) => {
    setInvoiceToEdit(invoice);
    setViewInvoice(null);
  }, []);

  const handlePaymentClick = useCallback((tx: Transaction) => {
    if (!tx?.id) return;
    setTransactionToEdit(tx);
  }, []);

  const handleShowDeleteWarning = useCallback((tx: Transaction) => {
    setPaymentDeleteModal({ isOpen: true, transaction: tx });
  }, []);

  const handleConfirmPaymentDelete = useCallback(() => {
    const { transaction } = paymentDeleteModal;
    if (transaction) {
      dispatch({ type: 'DELETE_TRANSACTION', payload: transaction.id });
      showToast('Payment deleted. Invoice status updated.');
    }
    setPaymentDeleteModal({ isOpen: false, transaction: null });
    setTransactionToEdit(null);
  }, [paymentDeleteModal, dispatch, showToast]);

  const getLinkedItemName = useCallback((tx: Transaction | null): string => {
    if (!tx) return '';
    if (tx.invoiceId) return 'an Invoice';
    if (tx.billId) return 'a Bill';
    return 'linked item';
  }, []);

  const handleDeleteInvoice = useCallback(async (invoice: Invoice) => {
    if (invoice.paidAmount > 0) {
      await showAlert('This invoice has payments. Delete payments first.', { title: 'Cannot Delete' });
      return;
    }
    const ok = await showConfirm(`Delete Invoice #${invoice.invoiceNumber}?`, {
      title: 'Delete Invoice',
      confirmLabel: 'Delete',
    });
    if (ok) {
      dispatch({ type: 'DELETE_INVOICE', payload: invoice.id });
      setViewInvoice(null);
      showToast('Invoice deleted.');
    }
  }, [dispatch, showAlert, showConfirm, showToast]);

  const selectedInvoicesList = useMemo(
    () => state.invoices.filter(inv => selectedInvoiceIds.has(inv.id)),
    [state.invoices, selectedInvoiceIds]
  );

  const availableTypeOptions = useMemo(() => {
    const types = new Set(financialRecords.map(r => r.type));
    return ['All', ...Array.from(types)];
  }, [financialRecords]);

  const filterInputClass =
    'w-full pl-2.5 py-1.5 text-sm border border-slate-300 rounded-md shadow-sm focus:ring-2 focus:ring-accent/50 focus:border-accent bg-white';

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50/50 pt-2 px-3 sm:pt-3 sm:px-4 pb-1 gap-2">
      {/* Due for Generation Banner */}
      {overdueCount > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-amber-800">
              {overdueCount} invoice{overdueCount > 1 ? 's are' : ' is'} due for generation
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleGenerateAllDue}
              disabled={isGenerating}
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isGenerating ? 'Generating...' : `Generate All (${overdueCount})`}
            </Button>
            {onSchedulesClick && (
              <Button variant="secondary" onClick={onSchedulesClick} size="sm">
                Manage Schedules
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Summary Cards - compact height */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
        <div className="bg-white rounded-lg border border-slate-200 px-2.5 py-1.5 shadow-sm">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Unpaid</p>
          <p className="text-sm font-bold text-slate-800 leading-tight">{summaryStats.unpaidCount}</p>
          <p className="text-xs text-slate-600 truncate">
            {CURRENCY} {summaryStats.unpaidAmount.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
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

      {/* Filter Bar */}
      <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row gap-2 flex-wrap">
        <div className="flex flex-wrap items-center gap-1.5">
          {['All', InvoiceStatus.UNPAID, InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE].map(
            s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === s
                    ? 'bg-accent text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {s}
              </button>
            )
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase">View by:</span>
          {['tenant', 'owner', 'property', 'building'].map(g => (
            <button
              key={g}
              type="button"
              onClick={() => handleSetGroupBy(g as typeof groupBy)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                groupBy === g
                  ? 'bg-accent text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <select
          value={entityFilterId}
          onChange={e => setEntityFilterId(e.target.value)}
          className={filterInputClass}
          style={{ width: '180px' }}
        >
          <option value="all">
            All {groupBy === 'tenant' ? 'Tenants' : groupBy === 'owner' ? 'Owners' : groupBy === 'property' ? 'Properties' : 'Buildings'}
          </option>
          {groupBy === 'tenant' &&
            tenantsWithInvoices.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          {groupBy === 'owner' &&
            ownersWithInvoices.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          {groupBy === 'property' &&
            propertiesWithInvoices.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          {groupBy === 'building' &&
            state.buildings.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
        </select>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className={filterInputClass}
          style={{ width: '130px' }}
        >
          {availableTypeOptions.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className={filterInputClass}
          style={{ width: '130px' }}
        >
          <option value="All">All Dates</option>
          <option value="This Month">This Month</option>
          <option value="Last Month">Last Month</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
            <div className="w-4 h-4">{ICONS.search}</div>
          </div>
          <input
            type="text"
            placeholder="Search invoice #, tenant, property..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-1.5 w-full text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
        </div>
      </div>

      {/* Invoice Grid + Detail Panel - same height, aligned top */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 flex overflow-hidden">
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
            <RentalFinancialGrid
          records={financialRecords}
          onInvoiceClick={handleInvoiceClick}
          onPaymentClick={handlePaymentClick}
          selectedIds={selectedInvoiceIds}
          onToggleSelect={toggleSelection}
          onNewClick={onCreateRentalClick}
          onBulkImportClick={() => {
            dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.INVOICES });
            dispatch({ type: 'SET_PAGE', payload: 'import' });
          }}
          showButtons={false}
          onBulkPaymentClick={() => setIsBulkPayModalOpen(true)}
          selectedCount={selectedInvoiceIds.size}
          onEditInvoice={handleEditInvoice}
          onReceivePayment={handleRecordPayment}
          onEditPayment={handlePaymentClick}
          typeFilter={typeFilter}
          dateFilter={dateFilter}
          onTypeFilterChange={setTypeFilter}
          onDateFilterChange={setDateFilter}
          hideTypeDateFiltersInToolbar
          hideTypeDateFiltersInToolbar
        />
          </div>

          {/* Detail Panel - same height as grid, aligned top */}
          {viewInvoice && (
            <div className="flex-shrink-0 w-full sm:w-[380px] lg:w-[400px] h-full flex flex-col bg-white shadow-lg border-l border-slate-200 overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                <InvoiceDetailView
                  invoice={viewInvoice}
                  onRecordPayment={handleRecordPayment}
                  onEdit={handleEditInvoice}
                  onDelete={handleDeleteInvoice}
                />
              </div>
              <div className="flex-shrink-0 p-3 border-t border-slate-200 bg-slate-50/50">
                <Button variant="secondary" onClick={() => setViewInvoice(null)} className="w-full sm:w-auto">
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={!!invoiceToEdit}
        onClose={() => setInvoiceToEdit(null)}
        title="Edit Invoice"
        size="xl"
      >
        {invoiceToEdit && (
          <InvoiceBillForm
            itemToEdit={invoiceToEdit}
            onClose={() => setInvoiceToEdit(null)}
            type="invoice"
          />
        )}
      </Modal>

      {/* Payment Modal - for both recording new payments and editing existing payments */}
      <RentalPaymentModal
        isOpen={isPaymentModalOpen || !!transactionToEdit}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentInvoice(null);
          setTransactionToEdit(null);
        }}
        invoice={paymentInvoice}
        transactionToEdit={transactionToEdit}
        onShowDeleteWarning={transactionToEdit ? handleShowDeleteWarning : undefined}
      />

      {/* Bulk Payment Modal */}
      <BulkPaymentModal
        isOpen={isBulkPayModalOpen}
        onClose={() => setIsBulkPayModalOpen(false)}
        selectedInvoices={selectedInvoicesList}
        onPaymentComplete={() => {
          setSelectedInvoiceIds(new Set());
          setIsBulkPayModalOpen(false);
        }}
      />

      {/* Delete Payment Confirmation */}
      <LinkedTransactionWarningModal
        isOpen={paymentDeleteModal.isOpen}
        onClose={() => setPaymentDeleteModal({ isOpen: false, transaction: null })}
        onConfirm={handleConfirmPaymentDelete}
        linkedItemName={getLinkedItemName(paymentDeleteModal.transaction)}
        action="delete"
      />
    </div>
  );
};

export default RentalInvoicesContent;
