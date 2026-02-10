
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, ContactType, Transaction } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import Select from '../ui/Select';
import DatePicker from '../ui/DatePicker';
import Modal from '../ui/Modal';
import TransactionForm from '../transactions/TransactionForm';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import { formatCurrency } from '../../utils/numberUtils';
import { formatDate } from '../../utils/dateUtils';
import PrintButton from '../ui/PrintButton';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

type DateRangeOption = 'all' | 'thisMonth' | 'lastMonth' | 'custom';

interface ReportRow {
    id: string;
    date: string;
    ownerName: string;
    propertyName: string;
    particulars: string;
    rentIn: number;
    paidOut: number;
    balance: number;
    entityType: 'transaction';
    entityId: string;
}

type SortKey = 'date' | 'ownerName' | 'propertyName' | 'particulars' | 'rentIn' | 'paidOut' | 'balance';

const OwnerPayoutsReport: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();
    const { print: triggerPrint } = usePrintContext();
    const [dateRange, setDateRange] = useState<DateRangeOption>('all');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState('2100-12-31');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'asc' });

    // Edit Modal State
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);

    // Warning Modal State
    const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'delete' | 'update' | null }>({
        isOpen: false,
        transaction: null,
        action: null
    });

    // Grouping State
    const [groupBy, setGroupBy] = useState<'' | 'owner'>('');

    const buildings = useMemo(() => [{ id: 'all', name: 'All Buildings' }, ...state.buildings], [state.buildings]);

    const owners = useMemo(() => {
        const relevantContacts = state.contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
        return [{ id: 'all', name: 'All Owners' }, ...relevantContacts];
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
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const reportData = useMemo<ReportRow[]>(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');

        if (!rentalIncomeCategory) return [];

        // Build set of broker fee transaction IDs to exclude from expenses (avoid double-counting with agreement fees)
        const brokerFeeTxIds = new Set<string>();
        if (brokerFeeCategory) {
            state.transactions.forEach(tx => {
                if (tx.type === TransactionType.EXPENSE && tx.categoryId === brokerFeeCategory.id) {
                    brokerFeeTxIds.add(tx.id);
                }
            });
        }

        const items: any[] = [];

        // 1. Rental Income (including negative amounts for service charge deductions)
        state.transactions
            .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory.id)
            .forEach(tx => {
                const date = new Date(tx.date);
                if (date >= start && date <= end && tx.propertyId) {
                    const property = state.properties.find(p => p.id === tx.propertyId);
                    const owner = state.contacts.find(c => c.id === property?.ownerId);
                    const buildingId = tx.buildingId || property?.buildingId;

                    // Filters
                    if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                    if (selectedOwnerId !== 'all' && owner?.id !== selectedOwnerId) return;

                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (isNaN(amount)) return;

                    // If negative (service charge deduction), show as paidOut; if positive (rent), show as rentIn
                    if (amount < 0) {
                        items.push({
                            id: tx.id,
                            date: tx.date,
                            ownerName: owner?.name || 'Unknown',
                            propertyName: property?.name || 'Unknown',
                            particulars: tx.description || 'Service Charge Deduction',
                            rentIn: 0,
                            paidOut: Math.abs(amount),
                            entityType: 'transaction' as const,
                            entityId: tx.id
                        });
                    } else {
                        items.push({
                            id: tx.id,
                            date: tx.date,
                            ownerName: owner?.name || 'Unknown',
                            propertyName: property?.name || 'Unknown',
                            particulars: tx.description || 'Rent Collected',
                            rentIn: amount,
                            paidOut: 0,
                            entityType: 'transaction' as const,
                            entityId: tx.id
                        });
                    }
                }
            });

        // 2. Expenses (Payouts, Repairs, General Property Expenses — excludes broker fee payments)
        state.transactions
            .filter(tx => tx.type === TransactionType.EXPENSE)
            .forEach(tx => {
                const date = new Date(tx.date);
                if (date >= start && date <= end) {
                    // Skip broker fee payment transactions (broker fees are shown from agreements below)
                    if (brokerFeeTxIds.has(tx.id)) return;

                    let isRelevant = false;
                    let ownerId = tx.contactId;
                    let propertyId = tx.propertyId;

                    // CRITICAL: If cost center is explicitly a Tenant, DO NOT include in owner report
                    if (tx.contactId) {
                        const contact = state.contacts.find(c => c.id === tx.contactId);
                        if (contact?.type === ContactType.TENANT) return;
                    }

                    // A. Direct Payouts (Category match)
                    if (ownerPayoutCategory && tx.categoryId === ownerPayoutCategory.id) {
                        isRelevant = true;
                    }
                    // B. Expenses linked to a specific Property (Cost Center = Owner/Property)
                    else if (propertyId) {
                        const category = state.categories.find(c => c.id === tx.categoryId);
                        const isTenantExpense = category?.name.includes('(Tenant)') || category?.name === 'Security Deposit Refund';

                        if (!isTenantExpense) {
                            isRelevant = true;
                        }
                    }

                    if (isRelevant) {
                        let propertyName = '-';
                        let buildingId = tx.buildingId;

                        if (propertyId) {
                            const property = state.properties.find(p => p.id === propertyId);
                            if (property) {
                                ownerId = property.ownerId; // Override contactId with property owner
                                propertyName = property.name;
                                if (!buildingId) buildingId = property.buildingId;
                            }
                        }

                        // Apply Filters
                        if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
                        if (selectedBuildingId !== 'all') {
                            if (buildingId !== selectedBuildingId) return;
                        }

                        const owner = state.contacts.find(c => c.id === ownerId);

                        items.push({
                            id: tx.id,
                            date: tx.date,
                            ownerName: owner?.name || 'Unknown',
                            propertyName: propertyName,
                            particulars: tx.description || 'Expense/Payout',
                            rentIn: 0,
                            paidOut: typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount),
                            entityType: 'transaction' as const,
                            entityId: tx.id
                        });
                    }
                }
            });

        // 3. Broker Fee Deductions from Rental Agreements (same approach as BrokerFeeReport)
        // This ensures broker fees always show as explicit deductions from owner income
        state.rentalAgreements.forEach(ra => {
            if (!ra.brokerId || !ra.brokerFee || ra.brokerFee <= 0) return;
            if (!ra.propertyId) return;

            const raDate = new Date(ra.startDate);
            if (raDate < start || raDate > end) return;

            const property = state.properties.find(p => p.id === ra.propertyId);
            if (!property) return;

            const ownerId = property.ownerId;
            const ownerContact = state.contacts.find(c => c.id === ownerId);
            const buildingId = property.buildingId;

            // Apply Filters
            if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
            if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;

            items.push({
                id: `broker-fee-${ra.id}`,
                date: ra.startDate,
                ownerName: ownerContact?.name || 'Unknown',
                propertyName: property.name,
                particulars: `Broker Fee: ${property.name} (Agr #${ra.agreementNumber})`,
                rentIn: 0,
                paidOut: ra.brokerFee,
                entityType: 'transaction' as const,
                entityId: ra.id
            });
        });

        // Default Sort
        items.sort((a, b) => {
            let valA: any = a[sortConfig.key];
            let valB: any = b[sortConfig.key];

            if (sortConfig.key === 'date') {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        // Grouping Logic
        if (groupBy === 'owner') {
            items.sort((a, b) => a.ownerName.localeCompare(b.ownerName) || new Date(a.date).getTime() - new Date(b.date).getTime());
        }

        let runningBalance = 0;
        let currentGroupKey = '';
        let rows = items.map((item, index) => {
            if (groupBy === 'owner' && item.ownerName !== currentGroupKey) {
                currentGroupKey = item.ownerName;
                runningBalance = 0;
            }
            runningBalance += item.rentIn - item.paidOut;
            return { ...item, balance: runningBalance };
        });

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            rows = rows.filter(r =>
                r.ownerName.toLowerCase().includes(q) ||
                r.propertyName.toLowerCase().includes(q) ||
                r.particulars.toLowerCase().includes(q)
            );
        }

        return rows;
    }, [state, startDate, endDate, searchQuery, selectedBuildingId, selectedOwnerId, sortConfig, groupBy]);

    const totals = useMemo(() => {
        return reportData.reduce((acc, curr) => ({
            totalIn: acc.totalIn + curr.rentIn,
            totalOut: acc.totalOut + curr.paidOut
        }), { totalIn: 0, totalOut: 0 });
    }, [reportData]);

    const handleExport = () => {
        const data = reportData.map(r => ({
            Date: formatDate(r.date),
            Owner: r.ownerName,
            Property: r.propertyName,
            Particulars: r.particulars,
            'Rent Collected': r.rentIn,
            'Paid Out': r.paidOut,
            Balance: r.balance
        }));
        exportJsonToExcel(data, 'owner-income-report.xlsx', 'Owner Income');
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

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <div className="flex flex-col h-full space-y-4">
            <style>{STANDARD_PRINT_STYLES}</style>

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
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${dateRange === opt
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

                    {/* Group By Filter */}
                    <div className="w-48 flex-shrink-0">
                        <Select
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value as any)}
                            className="text-sm py-1.5"
                        >
                            <option value="">No Grouping</option>
                            <option value="owner">Group by Owner</option>
                        </Select>
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
                        <h3 className="text-2xl font-bold text-slate-800">Owner Income Report</h3>
                        <p className="text-sm text-slate-500 mt-1">
                            {formatDate(startDate)} - {formatDate(endDate)}
                        </p>
                        {(selectedBuildingId !== 'all' || selectedOwnerId !== 'all') && (
                            <p className="text-xs text-slate-400 mt-1">
                                Filters:
                                {selectedBuildingId !== 'all' && ` Building: ${state.buildings.find(b => b.id === selectedBuildingId)?.name} `}
                                {selectedOwnerId !== 'all' && ` Owner: ${state.contacts.find(c => c.id === selectedOwnerId)?.name}`}
                                {groupBy && ` Grouped by: ${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}`}
                            </p>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0">
                                <tr>
                                    <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Date <SortIcon column="date" /></th>
                                    <th onClick={() => handleSort('ownerName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Owner <SortIcon column="ownerName" /></th>
                                    <th onClick={() => handleSort('propertyName')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Property <SortIcon column="propertyName" /></th>
                                    <th onClick={() => handleSort('particulars')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Particulars <SortIcon column="particulars" /></th>
                                    <th onClick={() => handleSort('rentIn')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Rent In <SortIcon column="rentIn" /></th>
                                    <th onClick={() => handleSort('paidOut')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Paid Out <SortIcon column="paidOut" /></th>
                                    <th onClick={() => handleSort('balance')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Balance <SortIcon column="balance" /></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {(() => {
                                    let lastGroupKey = '';
                                    let groupRentIn = 0;
                                    let groupPaidOut = 0;
                                    const rows: React.ReactNode[] = [];

                                    reportData.forEach((item, index) => {
                                        const isNewGroup = groupBy === 'owner' && item.ownerName !== lastGroupKey;

                                        // If it's a new group and not the first item, add the subtotal for the previous group
                                        if (isNewGroup && index > 0) {
                                            rows.push(
                                                <tr key={`subtotal-${lastGroupKey}`} className="bg-slate-50 font-bold border-t-2 border-slate-200">
                                                    <td colSpan={4} className="px-3 py-2 text-right text-slate-600">Subtotal for {lastGroupKey}</td>
                                                    <td className="px-3 py-2 text-right text-success whitespace-nowrap">{CURRENCY} {formatCurrency(groupRentIn)}</td>
                                                    <td className="px-3 py-2 text-right text-danger whitespace-nowrap">{CURRENCY} {formatCurrency(groupPaidOut)}</td>
                                                    <td className="px-3 py-2 text-right text-slate-800 whitespace-nowrap">{CURRENCY} {formatCurrency(groupRentIn - groupPaidOut)}</td>
                                                </tr>
                                            );
                                            // Reset group totals
                                            groupRentIn = 0;
                                            groupPaidOut = 0;
                                        }

                                        if (isNewGroup) {
                                            lastGroupKey = item.ownerName;
                                            rows.push(
                                                <tr key={`header-${item.ownerName}`} className="bg-indigo-50/50">
                                                    <td colSpan={7} className="px-3 py-2 font-bold text-accent border-b border-indigo-100">
                                                        Owner: {item.ownerName}
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        groupRentIn += item.rentIn;
                                        groupPaidOut += item.paidOut;

                                        const transaction = state.transactions.find(t => t.id === item.entityId);
                                        rows.push(
                                            <tr
                                                key={item.id}
                                                className="hover:bg-slate-50 cursor-pointer transition-colors"
                                                onClick={() => transaction && setTransactionToEdit(transaction)}
                                                title="Click to edit"
                                            >
                                                <td className="px-3 py-2 whitespace-nowrap text-slate-700">{formatDate(item.date)}</td>
                                                <td className="px-3 py-2 whitespace-normal break-words text-slate-700 max-w-[150px]">{item.ownerName}</td>
                                                <td className="px-3 py-2 whitespace-normal break-words text-slate-700 max-w-[150px]">{item.propertyName}</td>
                                                <td className="px-3 py-2 whitespace-normal break-words text-slate-600 max-w-xs" title={item.particulars}>{item.particulars}</td>
                                                <td className="px-3 py-2 text-right text-success whitespace-nowrap">{item.rentIn > 0 ? `${CURRENCY} ${formatCurrency(item.rentIn || 0)}` : '-'}</td>
                                                <td className="px-3 py-2 text-right text-danger whitespace-nowrap">{item.paidOut > 0 ? `${CURRENCY} ${formatCurrency(item.paidOut || 0)}` : '-'}</td>
                                                <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${item.balance >= 0 ? 'text-slate-800' : 'text-danger'}`}>{CURRENCY} {formatCurrency(item.balance || 0)}</td>
                                            </tr>
                                        );

                                        // If it's the last item, add the subtotal for the final group
                                        if (index === reportData.length - 1 && groupBy === 'owner') {
                                            rows.push(
                                                <tr key={`subtotal-final-${lastGroupKey}`} className="bg-slate-50 font-bold border-t-2 border-slate-200">
                                                    <td colSpan={4} className="px-3 py-2 text-right text-slate-600">Subtotal for {lastGroupKey}</td>
                                                    <td className="px-3 py-2 text-right text-success whitespace-nowrap">{CURRENCY} {formatCurrency(groupRentIn)}</td>
                                                    <td className="px-3 py-2 text-right text-danger whitespace-nowrap">{CURRENCY} {formatCurrency(groupPaidOut)}</td>
                                                    <td className="px-3 py-2 text-right text-slate-800 whitespace-nowrap">{CURRENCY} {formatCurrency(groupRentIn - groupPaidOut)}</td>
                                                </tr>
                                            );
                                        }
                                    });

                                    return rows;
                                })()}
                                {reportData.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-8 text-center text-slate-500">No records found for the selected period.</td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-slate-50 font-bold border-t border-slate-300 sticky bottom-0">
                                <tr>
                                    <td colSpan={4} className="px-3 py-2 text-right">Totals (Period)</td>
                                    <td className="px-3 py-2 text-right text-success whitespace-nowrap">{CURRENCY} {formatCurrency(totals.totalIn || 0)}</td>
                                    <td className="px-3 py-2 text-right text-danger whitespace-nowrap">{CURRENCY} {formatCurrency(totals.totalOut || 0)}</td>
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
        </div >
    );
};

export default OwnerPayoutsReport;
