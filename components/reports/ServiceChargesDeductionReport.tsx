
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

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

interface ReportRow {
    id: string;
    date: string;
    buildingName: string;
    propertyName: string;
    ownerName: string;
    particulars: string;
    amount: number;
    entityType: 'transaction';
    entityId: string;
}

type SortKey = 'date' | 'buildingName' | 'propertyName' | 'ownerName' | 'particulars' | 'amount';

const ServiceChargesDeductionReport: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();
    
    // Filters State
    const [dateRange, setDateRange] = useState<DateRangeOption>('all');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState('2100-12-31');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'desc' });
    
    // Edit Modal State
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
    
    // Warning Modal State
    const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'delete' | 'update' | null }>({
        isOpen: false,
        transaction: null,
        action: null
    });

    // Dropdown Items
    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);
    const owners = useMemo(() => {
        const ownerContacts = state.contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
        return [{ id: 'all', name: 'All Owners' }, ...ownerContacts];
    }, [state.contacts]);

    const handleRangeChange = (option: DateRangeOption) => {
        setDateRange(option);
        const now = new Date();
        
        if (option === 'all') {
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
        setSortConfig(current => {
            if (current?.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    const reportData = useMemo<ReportRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const rentalIncomeCatId = state.categories.find(c => c.name === 'Rental Income')?.id;
        
        const deductionCategoryIds = new Set(state.categories
            .filter(c => c.type === TransactionType.EXPENSE && c.name.toLowerCase().includes('service charge'))
            .map(c => c.id));
        
        const legacyId = state.categories.find(c => c.name === 'Service Charge Deduction')?.id;
        if (legacyId) deductionCategoryIds.add(legacyId);

        const rows: ReportRow[] = [];

        state.transactions.forEach(tx => {
            const date = new Date(tx.date);
            if (date < start || date > end) return;

            let isDeduction = false;
            let amount = 0;

            if (tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCatId && tx.amount < 0) {
                isDeduction = true;
                amount = Math.abs(tx.amount);
            } else if (tx.type === TransactionType.EXPENSE && tx.categoryId && deductionCategoryIds.has(tx.categoryId)) {
                isDeduction = true;
                amount = tx.amount;
            }

            if (isDeduction) {
                const property = state.properties.find(p => p.id === tx.propertyId);
                const building = state.buildings.find(b => b.id === (tx.buildingId || property?.buildingId));
                const owner = state.contacts.find(c => c.id === (tx.contactId || property?.ownerId));

                // Apply Filters
                if (selectedBuildingId !== 'all') {
                    if (building?.id !== selectedBuildingId) return;
                }
                if (selectedOwnerId !== 'all') {
                    if (owner?.id !== selectedOwnerId) return;
                }

                rows.push({
                    id: tx.id,
                    date: tx.date,
                    buildingName: building?.name || 'Unknown',
                    propertyName: property?.name || 'Unknown',
                    ownerName: owner?.name || 'Unknown',
                    particulars: tx.description || 'Service Charge Deduction',
                    amount,
                    entityType: 'transaction' as const,
                    entityId: tx.id
                });
            }
        });

        // Sorting
        if (sortConfig) {
            rows.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];

                if (sortConfig.key === 'date') {
                     return sortConfig.direction === 'asc' 
                        ? new Date(aVal as string).getTime() - new Date(bVal as string).getTime()
                        : new Date(bVal as string).getTime() - new Date(aVal as string).getTime();
                }

                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
                }
                return 0;
            });
        } else {
            // Default Sort
            rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return rows.filter(r => r.ownerName.toLowerCase().includes(q) || r.propertyName.toLowerCase().includes(q));
        }

        return rows;
    }, [state, startDate, endDate, searchQuery, selectedBuildingId, selectedOwnerId, sortConfig]);

    const totalAmount = useMemo(() => reportData.reduce((sum, r) => sum + r.amount, 0), [reportData]);

    const handleExport = () => {
        const data = reportData.map(r => ({
            Date: formatDate(r.date),
            Building: r.buildingName,
            Property: r.propertyName,
            Owner: r.ownerName,
            Particulars: r.particulars,
            Amount: r.amount
        }));
        exportJsonToExcel(data, 'service-charges-report.xlsx', 'Deductions');
    };

    const handlePrint = () => window.print();

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

    const SortIcon = ({ column }: { column: keyof ReportRow }) => {
        if (sortConfig?.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-accent ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 12.7mm;
                    }
                    html, body {
                        height: auto !important;
                        overflow: visible !important;
                    }
                    body * {
                        visibility: hidden;
                    }
                    .printable-area, .printable-area * {
                        visibility: visible !important;
                    }
                    .printable-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        height: auto !important;
                        overflow: visible !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background-color: white;
                        z-index: 9999;
                    }
                    .no-print {
                        display: none !important;
                    }
                    ::-webkit-scrollbar {
                        display: none;
                    }
                    table {
                        page-break-inside: auto;
                    }
                    tr {
                        page-break-inside: avoid;
                        page-break-after: auto;
                    }
                    thead {
                        display: table-header-group;
                    }
                    tfoot {
                        display: table-footer-group;
                    }
                }
            `}</style>
            
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
                                    dateRange === opt 
                                    ? 'bg-white text-accent shadow-sm font-bold' 
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                                }`}
                            >
                                {opt === 'all' ? 'Total' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : 'Custom'}
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
                        <Button variant="secondary" size="sm" onClick={handlePrint} className="whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300">
                            <div className="w-4 h-4 mr-1">{ICONS.print}</div> Print
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex-grow overflow-y-auto printable-area min-h-0">
                <Card className="min-h-full">
                    <ReportHeader />
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-slate-800">Service Charges Deduction Report</h3>
                        <p className="text-sm text-slate-500">
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
                                    <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Date <SortIcon column="date"/></th>
                                    <th onClick={() => handleSort('buildingName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Building <SortIcon column="buildingName"/></th>
                                    <th onClick={() => handleSort('propertyName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Property <SortIcon column="propertyName"/></th>
                                    <th onClick={() => handleSort('ownerName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Owner <SortIcon column="ownerName"/></th>
                                    <th onClick={() => handleSort('particulars')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Particulars <SortIcon column="particulars"/></th>
                                    <th onClick={() => handleSort('amount')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Amount <SortIcon column="amount"/></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {reportData.map(item => {
                                    const transaction = state.transactions.find(t => t.id === item.entityId);
                                    return (
                                        <tr 
                                            key={item.id} 
                                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                                            onClick={() => transaction && setTransactionToEdit(transaction)}
                                            title="Click to edit"
                                        >
                                            <td className="px-3 py-2 whitespace-nowrap text-slate-700">{formatDate(item.date)}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.buildingName}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.propertyName}</td>
                                            <td className="px-3 py-2 whitespace-nowrap text-slate-700">{item.ownerName}</td>
                                            <td className="px-3 py-2 max-w-xs truncate" title={item.particulars}>{item.particulars}</td>
                                            <td className="px-3 py-2 text-right font-medium text-slate-800">{CURRENCY} {(item.amount || 0).toLocaleString()}</td>
                                        </tr>
                                    );
                                })}
                                {reportData.length === 0 && (
                                    <tr><td colSpan={6} className="text-center py-8 text-slate-500">No records found for the selected criteria.</td></tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold sticky bottom-0 border-t border-slate-300">
                                <tr>
                                    <td colSpan={5} className="px-3 py-2 text-right">Total Deductions</td>
                                    <td className="px-3 py-2 text-right text-sm">{CURRENCY} {(totalAmount || 0).toLocaleString()}</td>
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

export default ServiceChargesDeductionReport;
