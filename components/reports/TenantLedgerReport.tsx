
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
import { formatDate } from '../../utils/dateUtils';
import { WhatsAppService } from '../../services/whatsappService';
import { usePrint } from '../../hooks/usePrint';
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
            setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
        } else if (type === 'lastMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]);
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

        tenantTransactions.forEach(tx => {
            const txDate = new Date(tx.date);
            if(txDate >= start && txDate <= end) {
                const tenant = state.contacts.find(c => c.id === tx.contactId);
                const isExpense = tx.type === TransactionType.EXPENSE;
                
                ledgerItems.push({ 
                    date: tx.date, 
                    tenantName: tenant?.name || 'Unknown/Deleted Tenant',
                    particulars: tx.description || (isExpense ? 'Charge Paid by Owner' : 'Payment Received'), 
                    debit: isExpense ? tx.amount : 0, 
                    credit: isExpense ? 0 : tx.amount,
                    entityType: 'transaction' as const,
                    entityId: tx.id
                });
            }
        });
        
        // Sort Chronologically
        ledgerItems.sort((a, b) => {
            if (groupBy === 'tenant') {
                if (a.tenantName < b.tenantName) return -1;
                if (a.tenantName > b.tenantName) return 1;
            }
            return new Date(a.date).getTime() - new Date(b.date).getTime();
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

    const { handlePrint } = usePrint();

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
        if (tx.payslipId) {
            return 'a Payslip';
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
        
            WhatsAppService.sendMessage({ contact: selectedTenant, message });
        } catch (error) {
            await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
        }
    };
    
    const finalBalance = reportData.length > 0 ? reportData[reportData.length - 1].balance : 0;

    const SortHeader: React.FC<{ label: string, sortKey: keyof LedgerItem, align?: 'left' | 'right' }> = ({ label, sortKey, align = 'left' }) => (
        <th 
            className={`px-3 py-2 text-${align} font-semibold text-slate-600 bg-slate-50 cursor-pointer hover:bg-slate-100 select-none`}
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
                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm no-print">
                    {/* First Row: Dates, Filters, and Actions */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Date Range Pills */}
                        <div className="flex bg-slate-100 p-1 rounded-lg flex-shrink-0 overflow-x-auto">
                            {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                                <button
                                    key={opt}
                                    onClick={() => handleRangeChange(opt)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${
                                        dateRangeType === opt 
                                        ? 'bg-white text-accent shadow-sm font-bold' 
                                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                                    }`}
                                >
                                    {opt === 'all' ? 'Total' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : 'Custom'}
                                </button>
                            ))}
                        </div>

                        {/* Custom Date Pickers */}
                        {dateRangeType === 'custom' && (
                            <div className="flex items-center gap-2 animate-fade-in">
                                <DatePicker value={startDate} onChange={(d) => handleDateChange(d.toISOString().split('T')[0], endDate)} />
                                <span className="text-slate-400">-</span>
                                <DatePicker value={endDate} onChange={(d) => handleDateChange(startDate, d.toISOString().split('T')[0])} />
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
                                className="block w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-green-500/50 focus:border-green-500"
                            >
                                <option value="">No Grouping</option>
                                <option value="tenant">Group by Tenant</option>
                            </select>
                        </div>

                        {/* Search Input */}
                        <div className="relative flex-grow min-w-[180px]">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                <span className="h-4 w-4">{ICONS.search}</span>
                            </div>
                            <Input 
                                placeholder="Search report..." 
                                value={searchQuery} 
                                onChange={(e) => setSearchQuery(e.target.value)} 
                                className="pl-9 py-1.5 text-sm"
                            />
                            {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery('')} 
                                    className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600"
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
                                className="text-green-600 bg-green-50 hover:bg-green-100 border-green-200 whitespace-nowrap"
                            >
                                <div className="w-4 h-4 mr-1">{ICONS.whatsapp}</div> Share
                            </Button>
                            <Button variant="secondary" size="sm" onClick={handleExport} className="whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300">
                                <div className="w-4 h-4 mr-1">{ICONS.export}</div> Export
                            </Button>
                            <PrintButton
                                variant="secondary"
                                size="sm"
                                onPrint={handlePrint}
                                className="whitespace-nowrap"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                    <Card className="min-h-full">
                        <ReportHeader />
                        <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold">Tenant Ledger</h3>
                            <p className="text-sm text-slate-500">From {formatDate(startDate)} to {formatDate(endDate)}</p>
                            <p className="text-sm text-slate-500 font-semibold">
                                Tenant: {selectedTenantId === 'all' ? 'All Tenants' : state.contacts.find(c=>c.id === selectedTenantId)?.name}
                            </p>
                        </div>

                        {reportData.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200 text-sm">
                                    <thead className="bg-slate-50 sticky top-0 z-10">
                                        <tr>
                                            <SortHeader label="Date" sortKey="date" align="left" />
                                            <SortHeader label="Tenant" sortKey="tenantName" align="left" />
                                            <SortHeader label="Particulars" sortKey="particulars" align="left" />
                                            <SortHeader label="Debit (Due)" sortKey="debit" />
                                            <SortHeader label="Credit (Paid)" sortKey="credit" />
                                            <SortHeader label="Balance" sortKey="balance" />
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-200">
                                        {reportData.map(item => {
                                            const transaction = item.entityType === 'transaction' ? state.transactions.find(t => t.id === item.entityId) : null;
                                            const invoice = item.entityType === 'invoice' ? state.invoices.find(i => i.id === item.entityId) : null;
                                            return (
                                                <tr 
                                                    key={item.id}
                                                    className="cursor-pointer hover:bg-slate-50 transition-colors"
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
                                                    <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${item.balance > 0 ? 'text-danger' : 'text-slate-700'}`}>{CURRENCY} {item.balance.toLocaleString()}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-slate-50 font-bold">
                                        <tr>
                                            <td colSpan={3} className="px-3 py-2 text-right text-sm">Totals (Period)</td>
                                            <td className="px-3 py-2 text-right text-sm whitespace-nowrap">{CURRENCY} {totals.debit.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-sm text-success whitespace-nowrap">{CURRENCY} {totals.credit.toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right text-sm whitespace-nowrap">
                                                {selectedTenantId !== 'all' ? `${CURRENCY} ${finalBalance.toLocaleString()}` : '-'}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        ) : (<div className="text-center py-16"><p className="text-slate-500">No ledger transactions found for the selected criteria.</p></div>)}
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
