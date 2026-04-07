
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, InvoiceType, TransactionType, Transaction, Invoice } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
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
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

interface LedgerItem {
    id: string;
    date: string;
    tenantName: string;
    particulars: string;
    debit: number; // Invoice amount (Due)
    credit: number; // Payment Received
    balance: number;
    entityType: 'invoice' | 'transaction';
    entityId: string;
}

const TenantLedgerReport: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();
    const { openChat } = useWhatsApp();
    
    const [dateRangeType, setDateRangeType] = useState<DateRangeOption>('all');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState('2100-12-31');
    
    const [selectedTenantId, setSelectedTenantId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [groupBy, setGroupBy] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof LedgerItem; direction: 'asc' | 'desc' } | null>(null);
    
    // Edit Modal State
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
    const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
    
    // Warning Modal State
    const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'delete' | 'update' | null }>({
        isOpen: false,
        transaction: null,
        action: null
    });

    const handleRangeChange = (type: DateRangeOption) => {
        setDateRangeType(type);
        const now = new Date();
        if (type === 'all') {
            setStartDate('2000-01-01');
            setEndDate('2100-12-31');
        } else if (type === 'thisMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
        } else if (type === 'lastMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 0)));
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

        // 1. Rental Invoices (Debit - Tenant owes us)
        let tenantInvoices = state.invoices.filter(inv => 
            inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SERVICE_CHARGE
        );
        
        if (selectedTenantId !== 'all') {
            tenantInvoices = tenantInvoices.filter(inv => inv.contactId === selectedTenantId);
        }

        // 2. Payments & Charges (Credits & Debits)
        // INCOME: Tenant paid us (Credit)
        // EXPENSE: Owner paid for tenant (Debit)
        let tenantTransactions = state.transactions.filter(tx => 
            (tx.type === TransactionType.INCOME || tx.type === TransactionType.EXPENSE) &&
            tx.contactId
        );

        if (selectedTenantId !== 'all') {
            tenantTransactions = tenantTransactions.filter(tx => tx.contactId === selectedTenantId);
        } else {
            // Filter to only valid tenants if 'all' is selected
            const tenantIds = new Set(tenants.map(t => t.id));
            // Also include transactions that are linked to rental invoices even if the tenant is deleted (orphan transactions)
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
            if(invDate >= start && invDate <= end) {
                const tenant = state.contacts.find(c => c.id === inv.contactId);
                ledgerItems.push({ 
                    date: inv.issueDate, 
                    tenantName: tenant?.name || 'Unknown/Deleted Tenant',
                    particulars: `Invoice #${inv.invoiceNumber} (${inv.description || 'Rent'})`, 
                    debit: inv.amount, 
                    credit: 0,
                    entityType: 'invoice' as const,
                    entityId: inv.id
                });
            }
        });

        // Security deposit refund: show two lines so ledger balances (owner security debit + amount refunded)
        const secRefundCategoryNames = ['Security Deposit Refund', 'Owner Security Payout'];
        const isSecRefundCategory = (categoryId: string | undefined) => {
            if (!categoryId) return false;
            const cat = state.categories.find(c => c.id === categoryId);
            return cat ? secRefundCategoryNames.includes(cat.name) : false;
        };

        tenantTransactions.forEach(tx => {
            const txDate = new Date(tx.date);
            if(txDate >= start && txDate <= end) {
                const tenant = state.contacts.find(c => c.id === tx.contactId);
                const tenantName = tenant?.name || 'Unknown/Deleted Tenant';
                const isExpense = tx.type === TransactionType.EXPENSE;
                const isSecRefund = isExpense && isSecRefundCategory(tx.categoryId);

                if (isSecRefund) {
                    // Line 1: Owner security debit (liability released) – debit so balance steps up
                    ledgerItems.push({
                        date: tx.date,
                        tenantName,
                        particulars: 'Owner security debit',
                        debit: tx.amount,
                        credit: 0,
                        entityType: 'transaction' as const,
                        entityId: `${tx.id}-release`
                    });
                    // Line 2: Amount refunded – credit so balance returns to zero
                    ledgerItems.push({
                        date: tx.date,
                        tenantName,
                        particulars: tx.description || 'Security deposit refund',
                        debit: 0,
                        credit: tx.amount,
                        entityType: 'transaction' as const,
                        entityId: tx.id
                    });
                } else {
                    // Non-refund: INCOME = credit, EXPENSE = debit (charge paid by owner)
                    const asDebit = isExpense;
                    const asCredit = !isExpense;
                    ledgerItems.push({
                        date: tx.date,
                        tenantName,
                        particulars: tx.description || (isExpense ? 'Charge Paid by Owner' : 'Payment Received'),
                        debit: asDebit ? tx.amount : 0,
                        credit: asCredit ? tx.amount : 0,
                        entityType: 'transaction' as const,
                        entityId: tx.id
                    });
                }
            }
        });

        // Sort chronologically; for same date keep debit before credit (so refund pair shows debit then credit)
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
        let finalItems: LedgerItem[] = [];

        finalItems = ledgerItems.map((item, index) => {
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
                item.particulars.toLowerCase().includes(q) ||
                item.tenantName.toLowerCase().includes(q)
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
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const totals = useMemo(() => {
        return reportData.reduce((acc, item) => {
            acc.debit += item.debit;
            acc.credit += item.credit;
            return acc;
        }, { debit: 0, credit: 0 });
    }, [reportData]);

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

    const handleTransactionUpdated = () => {
        if (transactionToEdit) {
            const linkedItemName = getLinkedItemName(transactionToEdit);
            if (linkedItemName && linkedItemName !== 'a linked item') {
                showAlert(`Transaction updated successfully. The linked ${linkedItemName} has been updated to reflect the changes.`, { title: 'Transaction Updated' });
            } else {
                showToast('Transaction updated successfully', 'success');
            }
        }
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
            const finalBalance = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;
            
            let message = `*Statement for ${selectedTenant.name}*\n`;
            message += `Period: ${formatDate(startDate)} to ${formatDate(endDate)}\n\n`;
            message += `Final Balance Due: *${CURRENCY} ${finalBalance.toLocaleString()}*\n\n`;
            message += `This is an automated summary from PBooksPro.`;

            sendOrOpenWhatsApp(
                { contact: selectedTenant, message, phoneNumber: selectedTenant.contactNo },
                () => state.whatsAppMode,
                openChat
            );
        } catch (error) {
            await showAlert(error instanceof Error ? error.message : 'Failed to send WhatsApp message');
        }
    };
    
    const finalBalance = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;

    const SortHeader: React.FC<{ label: string, sortKey: keyof LedgerItem, align?: 'left' | 'right' }> = ({ label, sortKey, align = 'left' }) => (
        <th 
            className={`px-3 py-2 ${align === 'right' ? 'text-right' : 'text-left'} font-semibold text-app-muted bg-app-toolbar/40 cursor-pointer hover:bg-app-toolbar/60 select-none`}
            onClick={() => requestSort(sortKey)}
        >
            <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                {label}
                {sortConfig?.key === sortKey && (
                    <span className="text-xs">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
            </div>
        </th>
    );

    return (
        <>
            <style>{STANDARD_PRINT_STYLES}</style>
            <div className="flex flex-col h-full space-y-4">
                {/* Custom Toolbar - All controls in first row */}
                <div className="bg-app-card p-3 rounded-lg border border-app-border shadow-ds-card no-print">
                    {/* First Row: Dates, Filters, and Actions */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Date Range Pills */}
                        <div className="flex bg-app-toolbar p-1 rounded-lg flex-shrink-0 overflow-x-auto">
                            {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                                <button
                                    key={opt}
                                    onClick={() => handleRangeChange(opt)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${
                                        dateRangeType === opt 
                                        ? 'bg-primary text-ds-on-primary shadow-sm font-bold' 
                                        : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/80'
                                    }`}
                                >
                                    {opt === 'all' ? 'Total' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : 'Custom'}
                                </button>
                            ))}
                        </div>

                        {/* Custom Date Pickers */}
                        {dateRangeType === 'custom' && (
                            <div className="flex items-center gap-2 animate-fade-in">
                                <DatePicker value={startDate} onChange={(d) => handleDateChange(toLocalDateString(d), endDate)} />
                                <span className="text-app-muted">-</span>
                                <DatePicker value={endDate} onChange={(d) => handleDateChange(startDate, toLocalDateString(d))} />
                            </div>
                        )}

                        {/* Tenant Filter */}
                        <div className="w-48 flex-shrink-0">
                            <ComboBox 
                                items={tenantItems} 
                                selectedId={selectedTenantId} 
                                onSelect={(item) => setSelectedTenantId(item?.id || 'all')} 
                                allowAddNew={false}
                                placeholder="Filter Tenant"
                            />
                        </div>

                        {/* Group By */}
                        <div className="w-40 flex-shrink-0">
                            <select
                                value={groupBy}
                                onChange={(e) => setGroupBy(e.target.value)}
                                className="ds-input-field block w-full px-3 py-1.5 text-sm"
                                aria-label="Group by"
                            >
                                <option value="">No Grouping</option>
                                <option value="tenant">Group by Tenant</option>
                            </select>
                        </div>

                        {/* Search Input */}
                        <div className="relative flex-grow min-w-[180px]">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-app-muted">
                                <span className="h-4 w-4">{ICONS.search}</span>
                            </div>
                            <Input 
                                placeholder="Search report..." 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)} 
                                className="ds-input-field pl-9 py-1.5 text-sm"
                            />
                            {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery('')} 
                                    className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-app-text"
                                >
                                    <div className="w-4 h-4">{ICONS.x}</div>
                                </button>
                            )}
                        </div>

                        {/* Actions Group */}
                        <div className="flex items-center gap-2 ml-auto">
                            <Button 
                                variant="secondary" 
                                size="sm" 
                                onClick={handleWhatsApp} 
                                disabled={selectedTenantId === 'all'}
                                className="text-ds-success bg-ds-success/10 hover:bg-ds-success/20 border-ds-success/30 whitespace-nowrap"
                            >
                                <div className="w-4 h-4 mr-1">{ICONS.whatsapp}</div> Share
                            </Button>
                            <Button variant="secondary" size="sm" onClick={handleExport} className="whitespace-nowrap bg-app-toolbar hover:bg-app-toolbar/80 text-app-text border-app-border">
                                <div className="w-4 h-4 mr-1">{ICONS.export}</div> Export
                            </Button>
                            <PrintButton
                                variant="secondary"
                                size="sm"
                                onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                                className="whitespace-nowrap"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                    <Card className="min-h-full">
                        <ReportHeader />
                        <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold text-app-text">Tenant Ledger</h3>
                            <p className="text-sm text-app-muted">From {formatDate(startDate)} to {formatDate(endDate)}</p>
                            <p className="text-sm text-app-muted font-semibold">
                                Tenant: {selectedTenantId === 'all' ? 'All Tenants' : state.contacts.find(c=>c.id === selectedTenantId)?.name}
                            </p>
                        </div>

                        {reportData.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-app-border text-sm">
                                    <thead className="bg-app-toolbar/40 sticky top-0 z-10">
                                        <tr>
                                            <SortHeader label="Date" sortKey="date" align="left" />
                                            <SortHeader label="Tenant" sortKey="tenantName" align="left" />
                                            <SortHeader label="Particulars" sortKey="particulars" align="left" />
                                            <SortHeader label="Debit (Due)" sortKey="debit" />
                                            <SortHeader label="Credit (Paid)" sortKey="credit" />
                                            <SortHeader label="Balance" sortKey="balance" />
                                        </tr>
                                    </thead>
                                    <tbody className="bg-app-card divide-y divide-app-border">
                                        {reportData.map(item => {
                                            const transaction = item.entityType === 'transaction' ? state.transactions.find(t => t.id === item.entityId) : null;
                                            const invoice = item.entityType === 'invoice' ? state.invoices.find(i => i.id === item.entityId) : null;
                                            return (
                                                <tr 
                                                    key={item.id}
                                                    className="cursor-pointer hover:bg-app-toolbar/30 transition-colors text-app-text"
                                                    onClick={() => {
                                                        if (transaction) setTransactionToEdit(transaction);
                                                        if (invoice) setInvoiceToEdit(invoice);
                                                    }}
                                                    title="Click to edit"
                                                >
                                                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(item.date)}</td>
                                                    <td className="px-3 py-2 whitespace-normal break-words">{item.tenantName}</td>
                                                    <td className="px-3 py-2 whitespace-normal break-words max-w-xs">{item.particulars}</td>
                                                    <td className="px-3 py-2 text-right whitespace-nowrap">{item.debit > 0 ? `${CURRENCY} ${item.debit.toLocaleString()}` : '-'}</td>
                                                    <td className="px-3 py-2 text-right text-success whitespace-nowrap">{item.credit > 0 ? `${CURRENCY} ${item.credit.toLocaleString()}` : '-'}</td>
                                                    <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${item.balance > 0 ? 'text-danger' : 'text-app-text'}`}>{CURRENCY} {item.balance.toLocaleString()}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-app-toolbar/40 font-bold border-t border-app-border">
                                        <tr>
                                            <td colSpan={3} className="px-3 py-2 text-right text-sm text-app-text">Totals (Period)</td>
                                            <td className="px-3 py-2 text-right text-sm whitespace-nowrap">{CURRENCY} {totals.debit.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-sm text-success whitespace-nowrap">{CURRENCY} {totals.credit.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-sm whitespace-nowrap">
                                                {selectedTenantId !== 'all' ? `${CURRENCY} ${finalBalance.toLocaleString()}` : '-'}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        ) : (<div className="text-center py-16"><p className="text-app-muted">No ledger transactions found for the selected criteria.</p></div>)}
                        <ReportFooter />
                    </Card>
                </div>
            </div>

            {/* Edit Transaction Modal */}
            <Modal isOpen={!!transactionToEdit} onClose={() => setTransactionToEdit(null)} title="Edit Transaction">
                {transactionToEdit && (
                    <TransactionForm
                        transactionToEdit={transactionToEdit}
                        onClose={() => setTransactionToEdit(null)}
                        onShowDeleteWarning={handleShowDeleteWarning}
                    />
                )}
            </Modal>

            {/* Edit Invoice Modal */}
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

            {/* Linked Transaction Warning Modal */}
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
