import React, { useState, useMemo, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Invoice, InvoiceStatus, InvoiceType, Transaction, TransactionType } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import RentalFinancialGrid, { FinancialRecord } from '../invoices/RentalFinancialGrid';
import InvoiceDetailView from '../invoices/InvoiceDetailView';
import RentalPaymentModal from '../invoices/RentalPaymentModal';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import BulkPaymentModal from '../invoices/BulkPaymentModal';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';
import { ImportType } from '../../services/importService';
import useLocalStorage from '../../hooks/useLocalStorage';
import { useGenerateDueInvoices } from '../../hooks/useGenerateDueInvoices';

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
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');

  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());

  const { overdueCount, handleGenerateAllDue, isGenerating } = useGenerateDueInvoices();

  const tenantsWithInvoices = useMemo(() => {
    const contactIds = new Set(
      state.invoices
        .filter(inv => RENTAL_INVOICE_TYPES.includes(inv.invoiceType))
        .map(inv => inv.contactId)
    );
    return state.contacts.filter(c => contactIds.has(c.id));
  }, [state.invoices, state.contacts]);

  const ownersWithInvoices = useMemo(() => {
    const ownerIds = new Set(
      state.invoices
        .filter(inv => RENTAL_INVOICE_TYPES.includes(inv.invoiceType) && inv.propertyId)
        .map(inv => state.properties.find(p => p.id === inv.propertyId)?.ownerId)
        .filter(Boolean) as string[]
    );
    return state.contacts.filter(c => ownerIds.has(c.id));
  }, [state.invoices, state.properties, state.contacts]);

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
          const prop = state.properties.find(p => p.id === inv.propertyId);
          return prop && prop.buildingId === entityFilterId;
        }
        return false;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      invoices = invoices.filter(inv => {
        if (inv.invoiceNumber?.toLowerCase().includes(q)) return true;
        const contact = state.contacts.find(c => c.id === inv.contactId);
        if (contact?.name?.toLowerCase().includes(q)) return true;
        if (inv.description?.toLowerCase().includes(q)) return true;
        if (inv.propertyId) {
          const prop = state.properties.find(p => p.id === inv.propertyId);
          if (prop?.name?.toLowerCase().includes(q)) return true;
        }
        const prop = inv.propertyId ? state.properties.find(p => p.id === inv.propertyId) : null;
        const bld = prop ? state.buildings.find(b => b.id === prop.buildingId) : null;
        if (bld?.name?.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    if (dateRangeStart) {
      invoices = invoices.filter(inv => inv.issueDate >= dateRangeStart);
    }
    if (dateRangeEnd) {
      invoices = invoices.filter(inv => inv.issueDate <= dateRangeEnd);
    }

    if (statusFilter !== 'All') {
      invoices = invoices.filter(inv => inv.status === statusFilter);
    }

    if (entityFilterId && entityFilterId !== 'all') {
      if (groupBy === 'tenant') {
        invoices = invoices.filter(inv => inv.contactId === entityFilterId);
      } else if (groupBy === 'owner') {
        invoices = invoices.filter(inv => {
          const prop = inv.propertyId ? state.properties.find(p => p.id === inv.propertyId) : null;
          return prop?.ownerId === entityFilterId;
        });
      } else if (groupBy === 'property') {
        invoices = invoices.filter(inv => inv.propertyId === entityFilterId);
      }
    }

    return invoices;
  }, [
    state.invoices,
    state.contacts,
    state.properties,
    searchQuery,
    dateRangeStart,
    dateRangeEnd,
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
          const prop = state.properties.find(p => p.id === inv.propertyId);
          return prop && prop.buildingId === entityFilterId;
        }
        return false;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      invoices = invoices.filter(inv => {
        if (inv.invoiceNumber?.toLowerCase().includes(q)) return true;
        const contact = state.contacts.find(c => c.id === inv.contactId);
        if (contact?.name?.toLowerCase().includes(q)) return true;
        if (inv.description?.toLowerCase().includes(q)) return true;
        if (inv.propertyId) {
          const prop = state.properties.find(p => p.id === inv.propertyId);
          if (prop?.name?.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    if (dateRangeStart) invoices = invoices.filter(inv => inv.issueDate >= dateRangeStart);
    if (dateRangeEnd) invoices = invoices.filter(inv => inv.issueDate <= dateRangeEnd);
    if (entityFilterId && entityFilterId !== 'all') {
      if (groupBy === 'tenant') invoices = invoices.filter(inv => inv.contactId === entityFilterId);
      else if (groupBy === 'owner') invoices = invoices.filter(inv => (state.properties.find(p => p.id === inv.propertyId)?.ownerId) === entityFilterId);
      else if (groupBy === 'property') invoices = invoices.filter(inv => inv.propertyId === entityFilterId);
      else if (groupBy === 'building') {
        invoices = invoices.filter(inv => {
          if (inv.buildingId === entityFilterId) return true;
          const prop = state.properties.find(p => p.id === inv.propertyId);
          return prop?.buildingId === entityFilterId;
        });
      }
    }
    return invoices;
  }, [state.invoices, state.contacts, state.properties, searchQuery, dateRangeStart, dateRangeEnd, groupBy, entityFilterId]);

  const financialRecords = useMemo<FinancialRecord[]>(() => {
    const records: FinancialRecord[] = [];
    const invoiceIdSet = new Set(invoicesWithoutStatusFilter.map(i => i.id));

    baseInvoices.forEach(inv => {
      const contact = state.contacts.find(c => c.id === inv.contactId);
      records.push({
        id: inv.id,
        type: 'Invoice',
        reference: inv.invoiceNumber,
        date: inv.issueDate,
        accountName: contact?.name || 'Unknown',
        amount: inv.amount,
        remainingAmount: inv.amount - inv.paidAmount,
        raw: inv,
        status: inv.status,
      });
    });

    const processedBatchIds = new Set<string>();
    state.transactions.forEach(tx => {
      if (tx.type !== TransactionType.INCOME) return;
      if (!tx.invoiceId || !invoiceIdSet.has(tx.invoiceId)) return;

      if (tx.batchId) {
        if (processedBatchIds.has(tx.batchId)) return;
        const batchTxs = state.transactions.filter(t => t.batchId === tx.batchId);
        const totalAmount = batchTxs.reduce((sum, t) => sum + t.amount, 0);
        const account = state.accounts.find(a => a.id === tx.accountId);
        records.push({
          id: `batch-${tx.batchId}`,
          type: 'Payment (Bulk)',
          reference: `${batchTxs.length} Items`,
          date: tx.date,
          accountName: account?.name || 'Unknown',
          amount: totalAmount,
          remainingAmount: 0,
          raw: { ...tx, amount: totalAmount, children: batchTxs } as Transaction,
          status: 'Paid',
        });
        processedBatchIds.add(tx.batchId);
      } else {
        const inv = state.invoices.find(i => i.id === tx.invoiceId);
        const account = state.accounts.find(a => a.id === tx.accountId);
        records.push({
          id: tx.id,
          type: 'Payment',
          reference: inv?.invoiceNumber || '',
          date: tx.date,
          accountName: account?.name || 'Unknown',
          amount: tx.amount,
          remainingAmount: 0,
          raw: tx,
          status: 'Paid',
        });
      }
    });

    return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [baseInvoices, invoicesWithoutStatusFilter, state.transactions, state.accounts, state.contacts, state.invoices]);

  const summaryStats = useMemo(() => {
    const unpaid = baseInvoices.filter(inv => inv.status === InvoiceStatus.UNPAID || inv.status === InvoiceStatus.OVERDUE);
    const paid = baseInvoices.filter(inv => inv.status === InvoiceStatus.PAID);
    const overdue = baseInvoices.filter(inv => inv.status === InvoiceStatus.OVERDUE);
    const totalPending = baseInvoices
      .filter(inv => inv.status !== InvoiceStatus.PAID)
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

  const filterInputClass =
    'w-full pl-3 py-2 text-sm border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-accent/50 focus:border-accent bg-white';

  return (
    <div className="flex flex-col h-full bg-slate-50/50 p-4 sm:p-6 gap-4">
      {/* Due for Generation Banner */}
      {overdueCount > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex-shrink-0">
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

      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onCreateRentalClick} size="sm">
          <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
          New Rental Invoice
        </Button>
        <Button variant="secondary" onClick={onCreateSecurityClick} size="sm">
          <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
          New Security Deposit
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            dispatch({ type: 'SET_INITIAL_IMPORT_TYPE', payload: ImportType.INVOICES });
            dispatch({ type: 'SET_PAGE', payload: 'import' });
          }}
          size="sm"
        >
          <div className="w-4 h-4 mr-2">{ICONS.download}</div>
          Bulk Import
        </Button>
        {onSchedulesClick && (
          <Button variant="ghost" onClick={onSchedulesClick} size="sm">
            Manage Schedules
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Unpaid</p>
          <p className="text-lg font-bold text-slate-800">{summaryStats.unpaidCount}</p>
          <p className="text-sm text-slate-600">
            {CURRENCY} {summaryStats.unpaidAmount.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Paid</p>
          <p className="text-lg font-bold text-emerald-700">{summaryStats.paidCount}</p>
          <p className="text-sm text-slate-600">
            {CURRENCY} {summaryStats.paidAmount.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-rose-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-rose-600 uppercase">Overdue</p>
          <p className="text-lg font-bold text-rose-700">{summaryStats.overdueCount}</p>
          <p className="text-sm text-slate-600">
            {CURRENCY} {summaryStats.overdueAmount.toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-indigo-200 p-4 shadow-sm">
          <p className="text-xs font-semibold text-indigo-600 uppercase">Total Pending</p>
          <p className="text-lg font-bold text-indigo-700">
            {CURRENCY} {summaryStats.totalPending.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 flex-wrap">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase">Status:</span>
          {['All', InvoiceStatus.UNPAID, InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE].map(
            s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase">View by:</span>
          {['tenant', 'owner', 'property', 'building'].map(g => (
            <button
              key={g}
              type="button"
              onClick={() => handleSetGroupBy(g as typeof groupBy)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${
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
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateRangeStart}
            onChange={e => setDateRangeStart(e.target.value)}
            placeholder="From"
            className={filterInputClass}
            style={{ width: '140px' }}
          />
          <input
            type="date"
            value={dateRangeEnd}
            onChange={e => setDateRangeEnd(e.target.value)}
            placeholder="To"
            className={filterInputClass}
            style={{ width: '140px' }}
          />
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
            <div className="w-4 h-4">{ICONS.search}</div>
          </div>
          <input
            type="text"
            placeholder="Search invoice #, tenant, property..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 w-full text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
        </div>
      </div>

      {/* Invoice Grid */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <RentalFinancialGrid
          records={financialRecords}
          onInvoiceClick={handleInvoiceClick}
          onPaymentClick={() => {}}
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
        />
      </div>

      {/* Detail Panel Sidebar */}
      {viewInvoice && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[400px] max-w-full bg-white shadow-xl border-l border-slate-200 z-50 overflow-y-auto">
          <div className="p-4">
            <InvoiceDetailView
              invoice={viewInvoice}
              onRecordPayment={handleRecordPayment}
              onEdit={handleEditInvoice}
              onDelete={handleDeleteInvoice}
            />
            <Button variant="secondary" onClick={() => setViewInvoice(null)} className="mt-4">
              Close
            </Button>
          </div>
        </div>
      )}

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

      {/* Payment Modal */}
      {paymentInvoice && (
        <RentalPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setPaymentInvoice(null);
          }}
          invoice={paymentInvoice}
        />
      )}

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
    </div>
  );
};

export default RentalInvoicesContent;
