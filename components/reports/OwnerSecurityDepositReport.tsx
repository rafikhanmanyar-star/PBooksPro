
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, ContactType, Transaction } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Modal from '../ui/Modal';
import TransactionForm from '../transactions/TransactionForm';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { formatDate } from '../../utils/dateUtils';
import PrintButton from '../ui/PrintButton';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

interface SecurityDepositRow {
    id: string;
    date: string;
    ownerName: string;
    tenantName: string;
    propertyName: string;
    buildingName: string;
    particulars: string;
    depositIn: number;
    refundOut: number;
    balance: number;
    entityType: 'transaction';
    entityId: string;
}

type DateRangeOption = 'total' | 'thisMonth' | 'lastMonth' | 'custom';
type SortKey = 'date' | 'ownerName' | 'tenantName' | 'propertyName' | 'buildingName' | 'particulars' | 'depositIn' | 'refundOut' | 'balance';

const OwnerSecurityDepositReport: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();
    const { print: triggerPrint } = usePrintContext();

    // Filters
    const [dateRange, setDateRange] = useState<DateRangeOption>('total');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState('2100-12-31');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Sorting
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
    
    // Edit Modal State
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
    
    // Warning Modal State
    const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'delete' | 'update' | null }>({
        isOpen: false,
        transaction: null,
        action: null
    });

    // Selection Lists
    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);
    const owners = useMemo(() => {
        const ownerContacts = state.contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
        return [{ id: 'all', name: 'All Owners' }, ...ownerContacts];
    }, [state.contacts]);

    const handleRangeChange = (option: DateRangeOption) => {
        setDateRange(option);
        const now = new Date();
        
        if (option === 'total') {
            setStartDate('2000-01-01');
            setEndDate('2100-12-31');
        } else if (option === 'thisMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]);
        } else if (option === 'lastMonth') {
            setStartDate(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]);
            setEndDate(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]);
        }
    };

    const handleCustomDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
        setDateRange('custom');
    };

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const reportData = useMemo<SecurityDepositRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const securityDepositCategory = state.categories.find(c => c.name === 'Security Deposit');
        const refundCategory = state.categories.find(c => c.name === 'Security Deposit Refund');
        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Security Payout');

        if (!securityDepositCategory) return [];

        const rows: any[] = [];

        state.transactions.forEach(tx => {
            const txDate = new Date(tx.date);
            if (txDate < start || txDate > end) return;

            // Check if transaction is related to security deposit flow
            let isRelevant = false;
            let type: 'Deposit' | 'Refund' | 'Deduction' | 'Payout' = 'Deposit';

            if (tx.type === TransactionType.INCOME && tx.categoryId === securityDepositCategory.id) {
                isRelevant = true;
                type = 'Deposit';
            } else if (tx.type === TransactionType.EXPENSE) {
                const category = state.categories.find(c => c.id === tx.categoryId);
                
                // 1. Check for explicit Owner Payout of Security
                if (ownerPayoutCategory && tx.categoryId === ownerPayoutCategory.id) {
                    isRelevant = true;
                    type = 'Payout';
                }
                // 2. Check for Tenant Refund
                else if (refundCategory && tx.categoryId === refundCategory.id) {
                    isRelevant = true;
                    type = 'Refund';
                }
                // 3. Check for Tenant-linked expenses (Repairs/Deductions against security)
                else {
                    const contact = state.contacts.find(c => c.id === tx.contactId);
                    if (contact?.type === ContactType.TENANT) {
                        isRelevant = true;
                        type = 'Deduction';
                    } else if (category?.name.includes('(Tenant)')) {
                        isRelevant = true;
                        type = 'Deduction';
                    }
                }
            }

            if (isRelevant) {
                let propertyId = tx.propertyId;
                let ownerId = '';
                let buildingId = tx.buildingId;
                let tenantId = tx.contactId;

                if (!propertyId && tx.invoiceId) {
                    const inv = state.invoices.find(i => i.id === tx.invoiceId);
                    if (inv) {
                        propertyId = inv.propertyId;
                        if (!buildingId) buildingId = inv.buildingId;
                    }
                }

                if (tx.contactId) {
                     // If payout to owner, contactId is ownerId
                     if (type === 'Payout') ownerId = tx.contactId;
                }

                if (propertyId) {
                    const property = state.properties.find(p => p.id === propertyId);
                    if (property) {
                        if (!ownerId) ownerId = property.ownerId;
                        if (!buildingId) buildingId = property.buildingId;
                    }
                }

                // Filters
                if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;

                const owner = state.contacts.find(c => c.id === ownerId);
                const tenant = type === 'Payout' ? null : state.contacts.find(c => c.id === tenantId);
                const property = state.properties.find(p => p.id === propertyId);
                const building = state.buildings.find(b => b.id === buildingId);

                rows.push({
                    id: tx.id,
                    date: tx.date,
                    ownerName: owner?.name || 'Unknown',
                    tenantName: tenant?.name || (type === 'Payout' ? '-' : 'Unknown'),
                    propertyName: property?.name || '-',
                    buildingName: building?.name || '-',
                    particulars: tx.description || type,
                    depositIn: type === 'Deposit' ? tx.amount : 0,
                    refundOut: (type === 'Refund' || type === 'Deduction' || type === 'Payout') ? tx.amount : 0,
                    entityType: 'transaction' as const,
                    entityId: tx.id
                });
            }
        });

        // Sort
        rows.sort((a, b) => {
            let valA: any = a[sortConfig.key];
            let valB: any = b[sortConfig.key];

            if (sortConfig.key === 'date') {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
                
                // Stable sort for same date: Deposits first
                if (valA === valB) {
                    if (a.depositIn > 0 && b.depositIn === 0) return -1;
                    if (a.depositIn === 0 && b.depositIn > 0) return 1;
                    return 0;
                }
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        // Calculate running balance
        let runningBalance = 0;
        let processedRows = rows.map(row => {
            runningBalance += row.depositIn - row.refundOut;
            return { ...row, balance: runningBalance };
        });

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            processedRows = processedRows.filter(r => 
                r.ownerName.toLowerCase().includes(q) ||
                r.tenantName.toLowerCase().includes(q) ||
                r.propertyName.toLowerCase().includes(q) ||
                r.particulars.toLowerCase().includes(q)
            );
        }

        return processedRows;

    }, [state, startDate, endDate, selectedBuildingId, selectedOwnerId, sortConfig, searchQuery]);

    const totals = useMemo(() => {
        return reportData.reduce((acc, curr) => ({
            totalDepositIn: acc.totalDepositIn + curr.depositIn,
            totalRefundOut: acc.totalRefundOut + curr.refundOut
        }), { totalDepositIn: 0, totalRefundOut: 0 });
    }, [reportData]);

    const handleExport = () => {
        const data = reportData.map(r => ({
            Date: formatDate(r.date),
            Building: r.buildingName,
            Owner: r.ownerName,
            Tenant: r.tenantName,
            Property: r.propertyName,
            Particulars: r.particulars,
            'Deposit Collected': r.depositIn,
            'Refunded/Paid Out': r.refundOut,
            Balance: r.balance
        }));
        exportJsonToExcel(data, 'security-deposit-report.xlsx', 'Security Deposits');
    };


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

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-accent ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{STANDARD_PRINT_STYLES}</style>

            {/* Custom Toolbar - All controls in first row */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm no-print">
                
                {/* First Row: Dates, Filters, and Actions */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Date Range Pills */}
                    <div className="flex bg-slate-100 p-1 rounded-lg flex-shrink-0 overflow-x-auto">
                        {(['total', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                            <button
                                key={opt}
                                onClick={() => handleRangeChange(opt)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${
                                    dateRange === opt 
                                    ? 'bg-white text-accent shadow-sm font-bold' 
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                                }`}
                            >
                                {opt === 'total' ? 'Total' : opt.replace(/([A-Z])/g, ' $1')}
                            </button>
                        ))}
                    </div>

                    {/* Custom Date Pickers */}
                    {dateRange === 'custom' && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(d.toISOString().split('T')[0], endDate)} />
                            <span className="text-slate-400">-</span>
                            <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, d.toISOString().split('T')[0])} />
                        </div>
                    )}

                    {/* Building Filter */}
                    <div className="w-48 flex-shrink-0">
                        <ComboBox 
                            items={buildings} 
                            selectedId={selectedBuildingId} 
                            onSelect={(item) => setSelectedBuildingId(item?.id || 'all')} 
                            allowAddNew={false}
                            placeholder="Filter Building"
                        />
                    </div>

                    {/* Owner Filter */}
                    <div className="w-48 flex-shrink-0">
                        <ComboBox 
                            items={owners} 
                            selectedId={selectedOwnerId} 
                            onSelect={(item) => setSelectedOwnerId(item?.id || 'all')} 
                            allowAddNew={false}
                            placeholder="Filter Owner"
                        />
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
                        <Button variant="secondary" size="sm" onClick={handleExport} className="whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300">
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
                        <h3 className="text-2xl font-bold text-slate-800">Tenant Security Deposit Liability</h3>
                        <p className="text-sm text-slate-500 mt-1">
                            {formatDate(startDate)} - {formatDate(endDate)}
                        </p>
                        {(selectedBuildingId !== 'all' || selectedOwnerId !== 'all') && (
                            <p className="text-xs text-slate-400 mt-1">
                                Filters: 
                                {selectedBuildingId !== 'all' && ` Building: ${state.buildings.find(b=>b.id===selectedBuildingId)?.name} `}
                                {selectedOwnerId !== 'all' && ` Owner: ${state.contacts.find(c=>c.id===selectedOwnerId)?.name}`}
                            </p>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="date"/></th>
                                    <th onClick={() => handleSort('buildingName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Building <SortIcon column="buildingName"/></th>
                                    <th onClick={() => handleSort('ownerName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Owner <SortIcon column="ownerName"/></th>
                                    <th onClick={() => handleSort('tenantName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Tenant <SortIcon column="tenantName"/></th>
                                    <th onClick={() => handleSort('propertyName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Property <SortIcon column="propertyName"/></th>
                                    <th onClick={() => handleSort('particulars')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Particulars <SortIcon column="particulars"/></th>
                                    <th onClick={() => handleSort('depositIn')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Collected <SortIcon column="depositIn"/></th>
                                    <th onClick={() => handleSort('refundOut')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Paid Out <SortIcon column="refundOut"/></th>
                                    <th onClick={() => handleSort('balance')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Net Held <SortIcon column="balance"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {reportData.map(item => {
                                    const transaction = state.transactions.find(t => t.id === item.entityId);
                                    return (
                                        <tr 
                                            key={item.id} 
                                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                                            onClick={() => transaction && setTransactionToEdit(transaction)}
                                            title="Click to edit"
                                        >
                                            <td className="px-3 py-2 whitespace-nowrap text-slate-700">{formatDate(item.date)}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.buildingName}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.ownerName}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.tenantName}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.propertyName}</td>
                                            <td className="px-3 py-2 max-w-xs truncate text-slate-600" title={item.particulars}>{item.particulars}</td>
                                            <td className="px-3 py-2 text-right text-success">{item.depositIn > 0 ? `${CURRENCY} ${(item.depositIn || 0).toLocaleString()}` : '-'}</td>
                                            <td className="px-3 py-2 text-right text-danger">{item.refundOut > 0 ? `${CURRENCY} ${(item.refundOut || 0).toLocaleString()}` : '-'}</td>
                                            <td className={`px-3 py-2 text-right font-bold ${item.balance >= 0 ? 'text-slate-800' : 'text-danger'}`}>{CURRENCY} {(item.balance || 0).toLocaleString()}</td>
                                        </tr>
                                    );
                                })}
                                {reportData.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="px-3 py-8 text-center text-slate-500">No records found for the selected criteria.</td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold border-t border-slate-300 sticky bottom-0">
                                <tr>
                                    <td colSpan={6} className="px-3 py-2 text-right">Totals (Period)</td>
                                    <td className="px-3 py-2 text-right text-success">{CURRENCY} {(totals.totalDepositIn || 0).toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right text-danger">{CURRENCY} {(totals.totalRefundOut || 0).toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <ReportFooter />
                </Card>
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

            {/* Linked Transaction Warning Modal */}
            <LinkedTransactionWarningModal
                isOpen={warningModalState.isOpen}
                onClose={handleCloseWarning}
                onConfirm={handleConfirmWarning}
                action={warningModalState.action as 'delete' | 'update'}
                linkedItemName={getLinkedItemName(warningModalState.transaction)}
            />
        </div>
    );
};

export default OwnerSecurityDepositReport;
