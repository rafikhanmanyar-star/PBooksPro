
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, InvoiceType, TransactionType, Transaction, Invoice } from '../../types';
import Modal from '../ui/Modal';
import TransactionForm from '../transactions/TransactionForm';
import InvoiceBillForm from '../invoices/InvoiceBillForm';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { useNotification } from '../../context/NotificationContext';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

interface LedgerItem {
    id: string;
    date: string;
    tenantName: string;
    particulars: string;
    debit: number;
    credit: number;
    balance: number;
    entityType: 'invoice' | 'transaction';
    entityId: string;
}

const formatLongDate = (dateStr: string): string => {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' });
};

const TenantLedgerReport: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();
    const { openChat } = useWhatsApp();

    const now = new Date();
    const [dateRangeType, setDateRangeType] = useState<DateRangeOption>('thisYear');
    const [startDate, setStartDate] = useState(() => toLocalDateString(new Date(now.getFullYear(), 0, 1)));
    const [endDate, setEndDate] = useState(() => toLocalDateString(new Date(now.getFullYear(), 11, 31)));

    const [selectedTenantId, setSelectedTenantId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [groupBy, setGroupBy] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof LedgerItem; direction: 'asc' | 'desc' } | null>(null);

    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
    const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
    const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'delete' | 'update' | null }>({
        isOpen: false, transaction: null, action: null
    });

    const handleRangeChange = (type: DateRangeOption) => {
        setDateRangeType(type);
        const n = new Date();
        if (type === 'all') {
            setStartDate('2000-01-01');
            setEndDate('2100-12-31');
        } else if (type === 'thisYear') {
            setStartDate(toLocalDateString(new Date(n.getFullYear(), 0, 1)));
            setEndDate(toLocalDateString(new Date(n.getFullYear(), 11, 31)));
        } else if (type === 'thisMonth') {
            setStartDate(toLocalDateString(new Date(n.getFullYear(), n.getMonth(), 1)));
            setEndDate(toLocalDateString(new Date(n.getFullYear(), n.getMonth() + 1, 0)));
        } else if (type === 'lastMonth') {
            setStartDate(toLocalDateString(new Date(n.getFullYear(), n.getMonth() - 1, 1)));
            setEndDate(toLocalDateString(new Date(n.getFullYear(), n.getMonth(), 0)));
        }
    };

    const handleDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
        if (dateRangeType !== 'custom') setDateRangeType('custom');
    };

    const tenants = useMemo(() => state.contacts.filter(c => c.type === ContactType.TENANT), [state.contacts]);
    const tenantItems = useMemo(() => [{ id: 'all', name: 'All Tenants' }, ...tenants], [tenants]);

    const reportData = useMemo<LedgerItem[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        let tenantInvoices = state.invoices.filter(inv =>
            inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SERVICE_CHARGE
        );
        if (selectedTenantId !== 'all') {
            tenantInvoices = tenantInvoices.filter(inv => inv.contactId === selectedTenantId);
        }

        let tenantTransactions = state.transactions.filter(tx =>
            (tx.type === TransactionType.INCOME || tx.type === TransactionType.EXPENSE) && tx.contactId
        );
        if (selectedTenantId !== 'all') {
            tenantTransactions = tenantTransactions.filter(tx => tx.contactId === selectedTenantId);
        } else {
            const tenantIds = new Set(tenants.map(t => t.id));
            tenantTransactions = tenantTransactions.filter(tx => {
                if (tenantIds.has(tx.contactId!)) return true;
                if (tx.invoiceId) {
                    const inv = state.invoices.find(i => i.id === tx.invoiceId);
                    return inv && (inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SERVICE_CHARGE);
                }
                return false;
            });
        }

        const ledgerItems: { date: string, tenantName: string, particulars: string, debit: number, credit: number, entityType: 'invoice' | 'transaction', entityId: string }[] = [];

        tenantInvoices.forEach(inv => {
            const invDate = new Date(inv.issueDate);
            if (invDate >= start && invDate <= end) {
                const tenant = state.contacts.find(c => c.id === inv.contactId);
                ledgerItems.push({
                    date: inv.issueDate,
                    tenantName: tenant?.name || 'Unknown/Deleted Tenant',
                    particulars: `${inv.description || 'Monthly Rent'} – Unit ${inv.invoiceNumber}`,
                    debit: inv.amount,
                    credit: 0,
                    entityType: 'invoice' as const,
                    entityId: inv.id
                });
            }
        });

        const secRefundCategoryNames = ['Security Deposit Refund', 'Owner Security Payout'];
        const isSecRefundCategory = (categoryId: string | undefined) => {
            if (!categoryId) return false;
            const cat = state.categories.find(c => c.id === categoryId);
            return cat ? secRefundCategoryNames.includes(cat.name) : false;
        };

        tenantTransactions.forEach(tx => {
            const txDate = new Date(tx.date);
            if (txDate >= start && txDate <= end) {
                const tenant = state.contacts.find(c => c.id === tx.contactId);
                const tenantName = tenant?.name || 'Unknown/Deleted Tenant';
                const isExpense = tx.type === TransactionType.EXPENSE;
                const isSecRefund = isExpense && isSecRefundCategory(tx.categoryId);

                if (isSecRefund) {
                    ledgerItems.push({
                        date: tx.date, tenantName, particulars: 'Owner security debit',
                        debit: tx.amount, credit: 0, entityType: 'transaction' as const, entityId: `${tx.id}-release`
                    });
                    ledgerItems.push({
                        date: tx.date, tenantName, particulars: tx.description || 'Security Deposit Refund',
                        debit: 0, credit: tx.amount, entityType: 'transaction' as const, entityId: tx.id
                    });
                } else {
                    ledgerItems.push({
                        date: tx.date, tenantName,
                        particulars: tx.description || (isExpense ? 'Charge Paid by Owner' : `Rent Payment – Ref #${tx.id.slice(-5)}`),
                        debit: isExpense ? tx.amount : 0,
                        credit: !isExpense ? tx.amount : 0,
                        entityType: 'transaction' as const, entityId: tx.id
                    });
                }
            }
        });

        ledgerItems.sort((a, b) => {
            if (groupBy === 'tenant') {
                if (a.tenantName < b.tenantName) return -1;
                if (a.tenantName > b.tenantName) return 1;
            }
            const tA = new Date(a.date).getTime();
            const tB = new Date(b.date).getTime();
            if (tA !== tB) return tA - tB;
            return (b.debit - b.credit) - (a.debit - a.credit);
        });

        let runningBalance = 0;
        let currentTenantName = '';
        let finalItems: LedgerItem[] = ledgerItems.map((item, index) => {
            if (groupBy === 'tenant' && item.tenantName !== currentTenantName) {
                currentTenantName = item.tenantName;
                runningBalance = 0;
            }
            runningBalance += item.debit - item.credit;
            return { ...item, id: `${item.date}-${index}`, balance: runningBalance };
        });

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            finalItems = finalItems.filter(item =>
                item.particulars.toLowerCase().includes(q) || item.tenantName.toLowerCase().includes(q)
            );
        }

        if (sortConfig) {
            finalItems.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
                if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return finalItems;
    }, [state, startDate, endDate, selectedTenantId, searchQuery, tenants, groupBy, sortConfig]);

    const requestSort = (key: keyof LedgerItem) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const totals = useMemo(() => {
        return reportData.reduce((acc, item) => {
            acc.debit += item.debit;
            acc.credit += item.credit;
            return acc;
        }, { debit: 0, credit: 0 });
    }, [reportData]);

    const summaryStats = useMemo(() => {
        const allRentalInvoices = state.invoices.filter(inv =>
            inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SERVICE_CHARGE
        );
        const tenantIds = new Set(tenants.map(t => t.id));

        const allRentalPayments = state.transactions.filter(tx =>
            tx.type === TransactionType.INCOME && tx.contactId && tenantIds.has(tx.contactId)
        );
        const totalCollections = allRentalPayments.reduce((sum, tx) => sum + tx.amount, 0);

        const balanceByTenant = new Map<string, number>();
        allRentalInvoices.forEach(inv => {
            if (!inv.contactId) return;
            balanceByTenant.set(inv.contactId, (balanceByTenant.get(inv.contactId) || 0) + inv.amount);
        });
        allRentalPayments.forEach(tx => {
            if (!tx.contactId) return;
            balanceByTenant.set(tx.contactId, (balanceByTenant.get(tx.contactId) || 0) - tx.amount);
        });

        let outstandingArrears = 0;
        let overdueTenantsCount = 0;
        balanceByTenant.forEach((balance) => {
            if (balance > 0) {
                outstandingArrears += balance;
                overdueTenantsCount++;
            }
        });

        const netRevenue = totalCollections - outstandingArrears;

        return { totalCollections, outstandingArrears, overdueTenantsCount, netRevenue };
    }, [state.invoices, state.transactions, tenants]);

    const alertsCount = useMemo(() => {
        const overdueInvoices = state.invoices.filter(inv => {
            if (inv.invoiceType !== InvoiceType.RENTAL && inv.invoiceType !== InvoiceType.SERVICE_CHARGE) return false;
            if (!inv.dueDate) return false;
            const due = new Date(inv.dueDate);
            return due < new Date() && inv.status !== 'paid';
        });
        return overdueInvoices.length;
    }, [state.invoices]);

    const { print: triggerPrint } = usePrintContext();

    const getLinkedItemName = (tx: Transaction | null): string => {
        if (!tx) return '';
        if (tx.invoiceId) {
            const invoice = state.invoices.find(i => i.id === tx.invoiceId);
            return invoice ? `Invoice #${invoice.invoiceNumber}` : 'an Invoice';
        }
        if (tx.billId) {
            const bill = state.bills.find(b => b.id === tx.billId);
            return bill ? `Bill #${bill.billNumber}` : 'a Bill';
        }
        return 'a linked item';
    };

    const handleShowDeleteWarning = (tx: Transaction) => {
        setTransactionToEdit(null);
        setWarningModalState({ isOpen: true, transaction: tx, action: 'delete' });
    };

    const handleConfirmWarning = () => {
        const { transaction, action } = warningModalState;
        if (transaction && action === 'delete') {
            const linkedItemName = getLinkedItemName(transaction);
            dispatch({ type: 'DELETE_TRANSACTION', payload: transaction.id });
            showToast(`Transaction deleted successfully. ${linkedItemName && linkedItemName !== 'a linked item' ? `The linked ${linkedItemName} has been updated.` : ''}`, 'info');
        }
        setWarningModalState({ isOpen: false, transaction: null, action: null });
    };

    const handleCloseWarning = () => {
        setWarningModalState({ isOpen: false, transaction: null, action: null });
    };

    const handleInvoiceUpdated = () => {
        showToast('Invoice updated successfully', 'success');
    };

    const handleExport = () => {
        const dataToExport = reportData.map(item => ({
            'Date': formatDate(item.date),
            'Tenant': item.tenantName,
            'Particulars': item.particulars,
            'Debit (Due)': item.debit,
            'Credit (Paid)': item.credit,
            'Balance': item.balance,
        }));
        exportJsonToExcel(dataToExport, `tenant-ledger.xlsx`, 'Tenant Ledger');
    };

    const handleWhatsApp = async () => {
        const selectedTenant = tenants.find(c => c.id === selectedTenantId);
        if (selectedTenantId === 'all' || !selectedTenant?.contactNo) {
            await showAlert("Please select a single tenant with a contact number to send a report.");
            return;
        }
        try {
            const bal = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;
            let message = `*Statement for ${selectedTenant.name}*\n`;
            message += `Period: ${formatDate(startDate)} to ${formatDate(endDate)}\n\n`;
            message += `Final Balance Due: *${CURRENCY} ${bal.toLocaleString()}*\n\n`;
            message += `This is an automated summary from PBooksPro.`;
            sendOrOpenWhatsApp(
                { contact: selectedTenant, message, phoneNumber: selectedTenant.contactNo },
                () => state.whatsAppMode, openChat
            );
        } catch (error) {
            await showAlert(error instanceof Error ? error.message : 'Failed to send WhatsApp message');
        }
    };

    const finalBalance = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;

    const SortHeader: React.FC<{ label: string, sortKey: keyof LedgerItem, align?: 'left' | 'right' }> = ({ label, sortKey, align = 'left' }) => (
        <th
            className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'} text-[11px] font-semibold uppercase tracking-wider text-app-muted cursor-pointer hover:text-app-text select-none transition-colors`}
            onClick={() => requestSort(sortKey)}
        >
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                {label}
                {sortConfig?.key === sortKey ? (
                    <span className="text-[9px] text-primary">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                ) : (
                    <span className="text-[9px] text-app-muted/40">↕</span>
                )}
            </div>
        </th>
    );

    return (
        <>
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col h-full min-h-0">
                {/* Header Section */}
                <div className="flex-shrink-0 px-6 pt-5 pb-4 no-print">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-app-text tracking-tight">Tenant Ledger</h1>
                            <div className="flex items-center gap-1.5 mt-1 text-sm text-app-muted">
                                <div className="w-4 h-4 opacity-60">{ICONS.calendar}</div>
                                <span>{formatLongDate(startDate)} – {formatLongDate(endDate)}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleWhatsApp}
                                disabled={selectedTenantId === 'all'}
                                className="flex items-center gap-1.5 text-sm text-app-muted hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0-12.814a2.25 2.25 0 1 0 3.935-2.186 2.25 2.25 0 0 0-3.935 2.186Zm0 12.814a2.25 2.25 0 1 0 3.933 2.185 2.25 2.25 0 0 0-3.933-2.185Z" />
                                </svg>
                                Share
                            </button>
                            <button
                                onClick={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                                className="flex items-center gap-1.5 text-sm text-app-muted hover:text-primary transition-colors"
                            >
                                <div className="w-4 h-4">{ICONS.print}</div>
                                Print
                            </button>
                            <button
                                onClick={handleExport}
                                className="flex items-center gap-1.5 text-sm text-app-muted hover:text-primary transition-colors"
                            >
                                <div className="w-4 h-4">{ICONS.export}</div>
                                Export
                            </button>
                        </div>
                    </div>
                </div>

                {/* Filters Row */}
                <div className="flex-shrink-0 mx-6 mb-4 no-print">
                    <div className="bg-app-card rounded-xl border border-app-border px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-3">
                        {/* Tenant Filter */}
                        <div className="flex flex-col gap-1">
                            <label htmlFor="tenant-filter" className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Tenant</label>
                            <select
                                id="tenant-filter"
                                value={selectedTenantId}
                                onChange={(e) => setSelectedTenantId(e.target.value)}
                                className="ds-input-field px-3 py-1.5 text-sm min-w-[160px] rounded-md"
                            >
                                {tenantItems.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Grouping Filter */}
                        <div className="flex flex-col gap-1">
                            <label htmlFor="grouping-filter" className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Grouping</label>
                            <select
                                id="grouping-filter"
                                value={groupBy}
                                onChange={(e) => setGroupBy(e.target.value)}
                                className="ds-input-field px-3 py-1.5 text-sm min-w-[140px] rounded-md"
                            >
                                <option value="">No Grouping</option>
                                <option value="tenant">Group by Tenant</option>
                            </select>
                        </div>

                        {/* Date Range Pills */}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Period</label>
                            <div className="flex bg-app-toolbar rounded-md p-0.5">
                                {(['thisYear', 'thisMonth', 'lastMonth', 'all', 'custom'] as DateRangeOption[]).map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => handleRangeChange(opt)}
                                        className={`px-2.5 py-1 text-xs font-medium rounded transition-all whitespace-nowrap ${
                                            dateRangeType === opt
                                                ? 'bg-primary text-ds-on-primary shadow-sm'
                                                : 'text-app-muted hover:text-app-text'
                                        }`}
                                    >
                                        {opt === 'all' ? 'All' : opt === 'thisYear' ? 'This Year' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : 'Custom'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {dateRangeType === 'custom' && (
                            <div className="flex items-end gap-2 animate-fade-in">
                                <div className="flex flex-col gap-1">
                                    <label htmlFor="ledger-date-from" className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">From</label>
                                    <input id="ledger-date-from" type="date" value={startDate} onChange={(e) => handleDateChange(e.target.value, endDate)} className="ds-input-field px-2 py-1.5 text-sm rounded-md" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label htmlFor="ledger-date-to" className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">To</label>
                                    <input id="ledger-date-to" type="date" value={endDate} onChange={(e) => handleDateChange(startDate, e.target.value)} className="ds-input-field px-2 py-1.5 text-sm rounded-md" />
                                </div>
                            </div>
                        )}

                        {/* Search */}
                        <div className="flex items-end ml-auto">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-app-muted">
                                    <span className="w-3.5 h-3.5">{ICONS.search}</span>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="ds-input-field pl-8 pr-7 py-1.5 text-sm w-40 rounded-md"
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-app-text">
                                        <div className="w-3.5 h-3.5">{ICONS.x}</div>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Alerts Badge */}
                        {alertsCount > 0 && (
                            <div className="flex items-end">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    {alertsCount} Alert{alertsCount !== 1 ? 's' : ''} pending
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content - Scrollable */}
                <div className="flex-grow overflow-y-auto min-h-0 px-6 pb-6">
                    <div id="printable-area" className="printable-area">
                        {/* Print-only header */}
                        <div className="hidden print:block">
                            <ReportHeader />
                            <div className="text-center mb-4">
                                <h3 className="text-2xl font-bold text-app-text">Tenant Ledger</h3>
                                <p className="text-sm text-app-muted">{formatLongDate(startDate)} – {formatLongDate(endDate)}</p>
                                {selectedTenantId !== 'all' && (
                                    <p className="text-sm text-app-muted font-semibold">
                                        Tenant: {state.contacts.find(c => c.id === selectedTenantId)?.name}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Data Table */}
                        {reportData.length > 0 ? (
                            <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-app-border bg-app-toolbar/30">
                                                <SortHeader label="Date" sortKey="date" align="left" />
                                                <SortHeader label="Tenant" sortKey="tenantName" align="left" />
                                                <SortHeader label="Particulars" sortKey="particulars" align="left" />
                                                <SortHeader label="Debit (Due)" sortKey="debit" align="right" />
                                                <SortHeader label="Credit (Paid)" sortKey="credit" align="right" />
                                                <SortHeader label="Balance" sortKey="balance" align="right" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reportData.map((item, idx) => {
                                                const transaction = item.entityType === 'transaction' ? state.transactions.find(t => t.id === item.entityId) : null;
                                                const invoice = item.entityType === 'invoice' ? state.invoices.find(i => i.id === item.entityId) : null;
                                                return (
                                                    <tr
                                                        key={item.id}
                                                        className={`border-b border-app-border/50 cursor-pointer hover:bg-primary/5 transition-colors ${idx % 2 === 0 ? 'bg-app-card' : 'bg-app-toolbar/10'}`}
                                                        onClick={() => {
                                                            if (transaction) setTransactionToEdit(transaction);
                                                            if (invoice) setInvoiceToEdit(invoice);
                                                        }}
                                                        title="Click to edit"
                                                    >
                                                        <td className="px-4 py-3 whitespace-nowrap text-app-muted">{formatDate(item.date)}</td>
                                                        <td className="px-4 py-3 whitespace-nowrap font-medium text-app-text">{item.tenantName}</td>
                                                        <td className="px-4 py-3 text-app-muted max-w-xs truncate">{item.particulars}</td>
                                                        <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums font-medium text-rose-600 dark:text-rose-400">
                                                            {item.debit > 0 ? `${CURRENCY}${item.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-app-muted/40">–</span>}
                                                        </td>
                                                        <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums font-medium text-app-muted">
                                                            {item.credit > 0 ? `${CURRENCY}${item.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-app-muted/40">–</span>}
                                                        </td>
                                                        <td className={`px-4 py-3 text-right whitespace-nowrap tabular-nums font-bold ${
                                                            item.balance > 0 ? 'text-rose-600 dark:text-rose-400' : item.balance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'
                                                        }`}>
                                                            {CURRENCY}{item.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-app-toolbar/40 border-t-2 border-app-border">
                                                <td colSpan={3} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-app-muted">Totals (Period)</td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums font-bold text-rose-600 dark:text-rose-400">
                                                    {CURRENCY}{totals.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums font-bold text-app-text">
                                                    {CURRENCY}{totals.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className={`px-4 py-3 text-right whitespace-nowrap tabular-nums font-bold ${
                                                    finalBalance > 0 ? 'text-rose-600 dark:text-rose-400' : finalBalance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary'
                                                }`}>
                                                    {selectedTenantId !== 'all' ? `${CURRENCY}${finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '–'}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card p-16 text-center">
                                <div className="w-12 h-12 mx-auto mb-4 text-app-muted/30">{ICONS.search}</div>
                                <p className="text-app-muted font-medium">No ledger transactions found for the selected criteria.</p>
                                <p className="text-app-muted/60 text-sm mt-1">Try adjusting the date range or tenant filter.</p>
                            </div>
                        )}

                        <div className="hidden print:block"><ReportFooter /></div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 no-print">
                        {/* Total Collections */}
                        <div className="bg-app-card rounded-xl border border-app-border p-5 shadow-ds-card">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-semibold uppercase tracking-wider text-app-muted">Total Collections</span>
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <svg className="w-4.5 h-4.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                    </svg>
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-app-text tabular-nums">
                                {CURRENCY}{summaryStats.totalCollections.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" /></svg>
                                vs last period
                            </p>
                        </div>

                        {/* Outstanding Arrears */}
                        <div className="bg-app-card rounded-xl border border-app-border p-5 shadow-ds-card">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-semibold uppercase tracking-wider text-app-muted">Outstanding Arrears</span>
                                <div className="w-8 h-8 rounded-lg bg-ds-warning/10 flex items-center justify-center">
                                    <div className="w-4.5 h-4.5 text-ds-warning">{ICONS.alertTriangle}</div>
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-app-text tabular-nums">
                                {CURRENCY}{summaryStats.outstandingArrears.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                            {summaryStats.overdueTenantsCount > 0 && (
                                <p className="text-xs text-ds-warning mt-1 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" /></svg>
                                    {summaryStats.overdueTenantsCount} tenant{summaryStats.overdueTenantsCount !== 1 ? 's' : ''} overdue
                                </p>
                            )}
                        </div>

                        {/* Net Revenue */}
                        <div className="bg-app-card rounded-xl border border-app-border border-l-[3px] border-l-primary p-5 shadow-ds-card">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-semibold uppercase tracking-wider text-app-muted">Net Revenue</span>
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <svg className="w-4.5 h-4.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                                    </svg>
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-app-text tabular-nums">
                                {CURRENCY}{summaryStats.netRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                            <p className="text-xs text-app-muted mt-1">Updated just now</p>
                        </div>
                    </div>
                </div>
            </div>

            <Modal isOpen={!!transactionToEdit} onClose={() => setTransactionToEdit(null)} title="Edit Transaction">
                {transactionToEdit && (
                    <TransactionForm
                        transactionToEdit={transactionToEdit}
                        onClose={() => setTransactionToEdit(null)}
                        onShowDeleteWarning={handleShowDeleteWarning}
                    />
                )}
            </Modal>

            <Modal isOpen={!!invoiceToEdit} onClose={() => setInvoiceToEdit(null)} title="Edit Invoice">
                {invoiceToEdit && (
                    <InvoiceBillForm
                        type="invoice"
                        itemToEdit={invoiceToEdit}
                        onClose={() => {
                            handleInvoiceUpdated();
                            setInvoiceToEdit(null);
                        }}
                    />
                )}
            </Modal>

            <LinkedTransactionWarningModal
                isOpen={warningModalState.isOpen}
                onClose={handleCloseWarning}
                onConfirm={handleConfirmWarning}
                action={warningModalState.action as 'delete' | 'update'}
                linkedItemName={getLinkedItemName(warningModalState.transaction)}
            />
        </>
    );
};

export default TenantLedgerReport;
