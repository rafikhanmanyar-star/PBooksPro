
import React, { useState, useMemo, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, ContactType, Transaction } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
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
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import PrintButton from '../ui/PrintButton';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import TreeView, { TreeNode } from '../ui/TreeView';

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
    /** Single tree selection: 'all' | 'building:{id}' | 'owner:{id}' | 'unit:{propertyId}' */
    const [selectedTreeId, setSelectedTreeId] = useState<string>('all');
    const [treeSearchQuery, setTreeSearchQuery] = useState('');

    // Derive filters from tree selection (so report logic stays unchanged)
    const { selectedBuildingId, selectedOwnerId, selectedUnitId } = useMemo(() => {
        if (selectedTreeId === 'all') {
            return { selectedBuildingId: 'all', selectedOwnerId: 'all', selectedUnitId: 'all' };
        }
        if (selectedTreeId.startsWith('building:')) {
            const id = selectedTreeId.slice('building:'.length);
            return { selectedBuildingId: id, selectedOwnerId: 'all', selectedUnitId: 'all' };
        }
        if (selectedTreeId.startsWith('owner:')) {
            const id = selectedTreeId.slice('owner:'.length);
            return { selectedBuildingId: 'all', selectedOwnerId: id, selectedUnitId: 'all' };
        }
        if (selectedTreeId.startsWith('unit:')) {
            const propertyId = selectedTreeId.slice('unit:'.length);
            const property = state.properties.find(p => p.id === propertyId);
            if (!property) return { selectedBuildingId: 'all', selectedOwnerId: 'all', selectedUnitId: 'all' };
            return {
                selectedBuildingId: property.buildingId || 'all',
                selectedOwnerId: property.ownerId || 'all',
                selectedUnitId: property.id
            };
        }
        return { selectedBuildingId: 'all', selectedOwnerId: 'all', selectedUnitId: 'all' };
    }, [selectedTreeId, state.properties]);

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

    const ownerContacts = useMemo(() => {
        return state.contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
    }, [state.contacts]);

    const matchesTreeSearch = useCallback((text: string) => {
        if (!treeSearchQuery.trim()) return true;
        return text.toLowerCase().includes(treeSearchQuery.toLowerCase());
    }, [treeSearchQuery]);

    const treeData = useMemo((): TreeNode[] => {
        const allNode: TreeNode = {
            id: 'all',
            label: 'All',
            type: 'all'
        };

        const byBuildingChildren: TreeNode[] = state.buildings
            .filter(b => matchesTreeSearch(b.name))
            .map(building => {
                const unitChildren: TreeNode[] = state.properties
                    .filter(p => p.buildingId === building.id && matchesTreeSearch(p.name))
                    .map(prop => ({ id: `unit:${prop.id}`, label: prop.name, type: 'unit' as const }));
                unitChildren.sort((a, b) => a.label.localeCompare(b.label));
                return {
                    id: `building:${building.id}`,
                    label: building.name,
                    type: 'building',
                    children: unitChildren.length ? unitChildren : undefined
                };
            })
            .filter(n => n.children?.length || matchesTreeSearch(n.label));
        byBuildingChildren.sort((a, b) => a.label.localeCompare(b.label));

        const byOwnerChildren: TreeNode[] = ownerContacts
            .filter(c => matchesTreeSearch(c.name))
            .map(owner => {
                const unitChildren: TreeNode[] = state.properties
                    .filter(p => p.ownerId === owner.id && matchesTreeSearch(p.name))
                    .map(prop => ({ id: `unit:${prop.id}`, label: prop.name, type: 'unit' as const }));
                unitChildren.sort((a, b) => a.label.localeCompare(b.label));
                return {
                    id: `owner:${owner.id}`,
                    label: owner.name,
                    type: 'owner',
                    children: unitChildren.length ? unitChildren : undefined
                };
            })
            .filter(n => n.children?.length || matchesTreeSearch(n.label));
        byOwnerChildren.sort((a, b) => a.label.localeCompare(b.label));

        const byBuildingNode: TreeNode = {
            id: 'folder-buildings',
            label: 'By Building',
            type: 'folder',
            children: byBuildingChildren.length ? byBuildingChildren : [{ id: 'no-buildings', label: 'No buildings', type: 'folder' }]
        };
        const byOwnerNode: TreeNode = {
            id: 'folder-owners',
            label: 'By Owner',
            type: 'folder',
            children: byOwnerChildren.length ? byOwnerChildren : [{ id: 'no-owners', label: 'No owners', type: 'folder' }]
        };

        return [allNode, byBuildingNode, byOwnerNode];
    }, [state.buildings, state.properties, ownerContacts, matchesTreeSearch]);

    const handleRangeChange = (option: DateRangeOption) => {
        setDateRange(option);
        const now = new Date();

        if (option === 'all') {
            setStartDate('2000-01-01');
            setEndDate('2100-12-31');
        } else if (option === 'thisMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
        } else if (option === 'lastMonth') {
            setStartDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
            setEndDate(toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 0)));
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
        // Exclude bill payment transactions where bill cost center is owner (bill amount shown from bills below)
        const ownerBillIds = new Set((state.bills || []).filter(b => b.propertyId && !b.projectId).map(b => b.id));
        const billPaymentTxIds = new Set<string>();
        state.transactions.forEach(tx => {
            if (tx.type === TransactionType.EXPENSE && tx.billId && ownerBillIds.has(tx.billId)) {
                billPaymentTxIds.add(tx.id);
            }
        });

        const items: any[] = [];

        // 1. Rental Income (including negative amounts for service charge deductions)
        state.transactions
            .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory.id)
            .forEach(tx => {
                const date = new Date(tx.date);
                if (date >= start && date <= end && tx.propertyId) {
                    const property = state.properties.find(p => p.id === tx.propertyId);
                    const ownerIdForTx = tx.ownerId ?? property?.ownerId;
                    const owner = state.contacts.find(c => c.id === ownerIdForTx);
                    const buildingId = tx.buildingId || property?.buildingId;

                    // Filters
                    if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                    if (selectedOwnerId !== 'all' && ownerIdForTx !== selectedOwnerId) return;
                    if (selectedUnitId !== 'all' && tx.propertyId !== selectedUnitId) return;

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

        // 2. Expenses (Rental only: Payouts, Bills, Broker, Service charges — exclude security)
        const ownerSecurityPayoutCat = state.categories.find(c => c.name === 'Owner Security Payout');
        const securityRefundCat = state.categories.find(c => c.name === 'Security Deposit Refund');
        state.transactions
            .filter(tx => tx.type === TransactionType.EXPENSE)
            .forEach(tx => {
                const date = new Date(tx.date);
                if (date >= start && date <= end) {
                    // Exclude security-related: do not mix with rental income report
                    if (ownerSecurityPayoutCat && tx.categoryId === ownerSecurityPayoutCat.id) return;
                    if (securityRefundCat && tx.categoryId === securityRefundCat.id) return;
                    // Skip broker fee payment transactions (broker fees are shown from agreements below)
                    if (brokerFeeTxIds.has(tx.id)) return;
                    // Skip bill payment transactions (bill amounts are shown from bills below)
                    if (billPaymentTxIds.has(tx.id)) return;

                    let isRelevant = false;
                    let ownerId = tx.contactId;
                    let propertyId = tx.propertyId;

                    // CRITICAL: If cost center is explicitly a Tenant, DO NOT include in owner report
                    if (tx.contactId) {
                        const contact = state.contacts.find(c => c.id === tx.contactId);
                        if (contact?.type === ContactType.TENANT) return;
                    }

                    const category = state.categories.find(c => c.id === tx.categoryId);
                    const catName = category?.name || '';
                    // Exclude any security or tenant-only categories
                    if (catName === 'Owner Security Payout' || catName === 'Security Deposit Refund' || catName.includes('(Tenant)')) return;

                    // A. Direct Rental Payouts (Owner Payout category only — not Owner Security Payout)
                    if (ownerPayoutCategory && tx.categoryId === ownerPayoutCategory.id) {
                        isRelevant = true;
                    }
                    // B. Expenses linked to a specific Property (Cost Center = Owner/Property)
                    else if (propertyId) {
                        isRelevant = true;
                    }

                    if (isRelevant) {
                        let propertyName = '-';
                        let buildingId = tx.buildingId;

                        if (propertyId) {
                            const property = state.properties.find(p => p.id === propertyId);
                            if (property) {
                                ownerId = tx.ownerId ?? property.ownerId; // Use tx.ownerId when set (ownership history)
                                propertyName = property.name;
                                if (!buildingId) buildingId = property.buildingId;
                            }
                        }

                        // Apply Filters
                        if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
                        if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                        if (selectedUnitId !== 'all' && propertyId !== selectedUnitId) return;

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
            if (selectedUnitId !== 'all' && ra.propertyId !== selectedUnitId) return;

            const brokerFeeAmount = typeof ra.brokerFee === 'string' ? parseFloat(ra.brokerFee) : Number(ra.brokerFee);
            items.push({
                id: `broker-fee-${ra.id}`,
                date: ra.startDate,
                ownerName: ownerContact?.name || 'Unknown',
                propertyName: property.name,
                particulars: `Broker Fee: ${property.name} (Agr #${ra.agreementNumber})`,
                rentIn: 0,
                paidOut: isNaN(brokerFeeAmount) ? 0 : brokerFeeAmount,
                entityType: 'transaction' as const,
                entityId: ra.id
            });
        });

        // 4. Bill deductions (cost center = owner property) — show even if bill not paid yet
        (state.bills || []).forEach(bill => {
            if (!bill.propertyId || bill.projectId) return;

            const billDate = new Date(bill.issueDate);
            if (billDate < start || billDate > end) return;

            const property = state.properties.find(p => p.id === bill.propertyId);
            if (!property) return;

            const ownerId = property.ownerId;
            const ownerContact = state.contacts.find(c => c.id === ownerId);
            const buildingId = property.buildingId;

            if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
            if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
            if (selectedUnitId !== 'all' && bill.propertyId !== selectedUnitId) return;

            const billAmount = typeof bill.amount === 'number' ? bill.amount : parseFloat(String(bill.amount ?? 0));
            if (isNaN(billAmount) || billAmount <= 0) return;

            items.push({
                id: `bill-${bill.id}`,
                date: bill.issueDate,
                ownerName: ownerContact?.name || 'Unknown',
                propertyName: property.name,
                particulars: `Bill: ${property.name} #${bill.billNumber || bill.id}`,
                rentIn: 0,
                paidOut: billAmount,
                entityType: 'transaction' as const,
                entityId: bill.id
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

        let runningBalance = 0;
        let rows = items.map((item) => {
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
    }, [state, startDate, endDate, searchQuery, selectedBuildingId, selectedOwnerId, selectedUnitId, sortConfig]);

    const totals = useMemo(() => {
        const reduced = reportData.reduce((acc, curr) => ({
            totalIn: acc.totalIn + curr.rentIn,
            totalOut: acc.totalOut + curr.paidOut
        }), { totalIn: 0, totalOut: 0 });
        return {
            ...reduced,
            netBalance: reduced.totalIn - reduced.totalOut
        };
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
        exportJsonToExcel(data, 'owner-rental-income-report.xlsx', 'Owner Rental Income');
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
        <span className="ml-1 text-[10px] text-app-muted">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    const handleTreeSelect = useCallback((id: string) => {
        if (id === 'all' || id.startsWith('building:') || id.startsWith('owner:') || id.startsWith('unit:')) {
            setSelectedTreeId(id);
        }
    }, []);

    return (
        <div className="flex flex-col h-full">
            <style>{STANDARD_PRINT_STYLES}</style>

            <div className="flex flex-1 min-h-0 gap-4">
                {/* Left: Tree view for filters (hidden when printing) */}
                <div className="flex flex-col w-64 flex-shrink-0 bg-app-card rounded-lg border border-app-border shadow-ds-card overflow-hidden no-print">
                    <div className="p-2 border-b border-app-border">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-app-muted">
                                <span className="h-4 w-4">{ICONS.search}</span>
                            </div>
                            <Input
                                placeholder="Search tree..."
                                value={treeSearchQuery}
                                onChange={(e) => setTreeSearchQuery(e.target.value)}
                                className="ds-input-field pl-8 py-1.5 text-sm"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        <TreeView
                            treeData={treeData}
                            selectedId={selectedTreeId}
                            onSelect={(id) => handleTreeSelect(id)}
                            showLines={true}
                            defaultExpanded={true}
                        />
                    </div>
                </div>

                {/* Right: Report area with toolbar and table */}
                <div className="flex flex-col flex-1 min-w-0">
                    <div className="bg-app-card p-3 rounded-lg border border-app-border shadow-ds-card flex-shrink-0">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex bg-app-toolbar p-1 rounded-lg flex-shrink-0 overflow-x-auto">
                                {(['all', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => handleRangeChange(opt)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${dateRange === opt
                                            ? 'bg-primary text-ds-on-primary shadow-sm font-bold'
                                            : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/80'
                                            }`}
                                    >
                                        {opt === 'all' ? 'Total' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : 'Custom'}
                                    </button>
                                ))}
                            </div>
                            {dateRange === 'custom' && (
                                <div className="flex items-center gap-2 animate-fade-in">
                                    <DatePicker value={startDate} onChange={(d) => handleCustomDateChange(toLocalDateString(d), endDate)} />
                                    <span className="text-app-muted">-</span>
                                    <DatePicker value={endDate} onChange={(d) => handleCustomDateChange(startDate, toLocalDateString(d))} />
                                </div>
                            )}
                            <div className="relative flex-grow min-w-[160px]">
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
                            <div className="flex items-center gap-2">
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

                    <div className="flex-grow overflow-y-auto printable-area min-h-0 mt-4" id="printable-area">
                <Card className="min-h-full">
                    <ReportHeader />
                    <div className="text-center mb-6">
                        <h3 className="text-2xl font-bold text-app-text">Owner Rental Income</h3>
                        <p className="text-sm text-app-muted mt-1">
                            {formatDate(startDate)} - {formatDate(endDate)}
                        </p>
                        {(selectedBuildingId !== 'all' || selectedOwnerId !== 'all' || selectedUnitId !== 'all') && (
                            <p className="text-xs text-app-muted mt-1">
                                Filters:
                                {selectedBuildingId !== 'all' && ` Building: ${state.buildings.find(b => b.id === selectedBuildingId)?.name} `}
                                {selectedOwnerId !== 'all' && ` Owner: ${state.contacts.find(c => c.id === selectedOwnerId)?.name} `}
                                {selectedUnitId !== 'all' && ` Unit: ${state.properties.find(p => p.id === selectedUnitId)?.name}`}
                            </p>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-app-border text-sm">
                            <thead className="bg-app-toolbar/40 sticky top-0">
                                <tr>
                                    <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none whitespace-nowrap">Date <SortIcon column="date" /></th>
                                    <th onClick={() => handleSort('ownerName')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Owner <SortIcon column="ownerName" /></th>
                                    <th onClick={() => handleSort('propertyName')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Property <SortIcon column="propertyName" /></th>
                                    <th onClick={() => handleSort('particulars')} className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Particulars <SortIcon column="particulars" /></th>
                                    <th onClick={() => handleSort('rentIn')} className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Rent In <SortIcon column="rentIn" /></th>
                                    <th onClick={() => handleSort('paidOut')} className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Paid Out <SortIcon column="paidOut" /></th>
                                    <th onClick={() => handleSort('balance')} className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none">Balance <SortIcon column="balance" /></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border bg-app-card">
                                {reportData.map((item) => {
                                    const transaction = state.transactions.find(t => t.id === item.entityId);
                                    return (
                                        <tr
                                            key={item.id}
                                            className="hover:bg-app-toolbar/30 cursor-pointer transition-colors"
                                            onClick={() => transaction && setTransactionToEdit(transaction)}
                                            title="Click to edit"
                                        >
                                            <td className="px-3 py-2 whitespace-nowrap text-app-text">{formatDate(item.date)}</td>
                                            <td className="px-3 py-2 whitespace-normal break-words text-app-text max-w-[150px]">{item.ownerName}</td>
                                            <td className="px-3 py-2 whitespace-normal break-words text-app-text max-w-[150px]">{item.propertyName}</td>
                                            <td className="px-3 py-2 whitespace-normal break-words text-app-muted max-w-xs" title={item.particulars}>{item.particulars}</td>
                                            <td className="px-3 py-2 text-right text-success whitespace-nowrap">{item.rentIn > 0 ? `${CURRENCY} ${formatCurrency(item.rentIn || 0)}` : '-'}</td>
                                            <td className="px-3 py-2 text-right text-danger whitespace-nowrap">{item.paidOut > 0 ? `${CURRENCY} ${formatCurrency(item.paidOut || 0)}` : '-'}</td>
                                            <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${item.balance >= 0 ? 'text-app-text' : 'text-danger'}`}>{CURRENCY} {formatCurrency(item.balance || 0)}</td>
                                        </tr>
                                    );
                                })}
                                {reportData.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-3 py-8 text-center text-app-muted">No records found for the selected period.</td>
                                    </tr>
                                )}
                            </tbody>
                            <tfoot className="bg-app-toolbar/40 font-bold border-t border-app-border sticky bottom-0">
                                <tr>
                                    <td colSpan={4} className="px-3 py-2 text-right text-app-text">Totals (Period)</td>
                                    <td className="px-3 py-2 text-right text-success whitespace-nowrap">{CURRENCY} {formatCurrency(totals.totalIn || 0)}</td>
                                    <td className="px-3 py-2 text-right text-danger whitespace-nowrap">{CURRENCY} {formatCurrency(totals.totalOut || 0)}</td>
                                    <td className={`px-3 py-2 text-right whitespace-nowrap ${totals.netBalance > 0 ? 'text-success' : totals.netBalance < 0 ? 'text-danger' : 'text-app-text'}`}>
                                        {CURRENCY} {formatCurrency(totals.netBalance)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <ReportFooter />
                </Card>
            </div>
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
