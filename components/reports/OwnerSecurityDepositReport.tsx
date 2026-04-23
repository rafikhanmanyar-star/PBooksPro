
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, ContactType, Transaction } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import Modal from '../ui/Modal';
import TransactionForm from '../transactions/TransactionForm';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import OwnerPayoutModal from '../payouts/OwnerPayoutModal';
import {
    buildOwnerPropertyBreakdown,
    getOwnerPayoutModalPropertyBreakdown,
    getOwnerPayoutModalPropertyBreakdownForProperty,
} from '../payouts/ownerPayoutBreakdown';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import LedgerSummaryCards from './LedgerSummaryCards';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/numberUtils';
import PrintButton from '../ui/PrintButton';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import TreeView, { TreeNode } from '../ui/TreeView';
import { getLedgerOwnerIdsForProperty } from '../../services/propertyOwnershipService';
import {
    TREE_SELECT_AUTO,
    pruneTreeNodesBySearchQuery,
    collectTreeNodeIds,
    findFirstOwnerTreeIdInNodes,
    buildRentalPortfolioTreeNodes,
    resolvePortfolioTreeSelection,
} from './rentalPortfolioReportTree';

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
type SortKey =
    | 'date'
    | 'ownerName'
    | 'tenantName'
    | 'propertyName'
    | 'buildingName'
    | 'particulars'
    | 'depositIn'
    | 'refundOut'
    | 'balance';

const OwnerSecurityDepositReport: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast } = useNotification();
    const { print: triggerPrint } = usePrintContext();

    const [dateRange, setDateRange] = useState<DateRangeOption>('total');
    const [startDate, setStartDate] = useState('2000-01-01');
    const [endDate, setEndDate] = useState(() => toLocalDateString(new Date()));
    const [searchQuery, setSearchQuery] = useState('');

    const [selectedTreeId, setSelectedTreeId] = useState<string>(TREE_SELECT_AUTO);
    const [treeSearchQuery, setTreeSearchQuery] = useState('');
    const [securityPayModalOpen, setSecurityPayModalOpen] = useState(false);

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
        key: 'date',
        direction: 'asc',
    });

    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);

    const [warningModalState, setWarningModalState] = useState<{
        isOpen: boolean;
        transaction: Transaction | null;
        action: 'delete' | 'update' | null;
    }>({
        isOpen: false,
        transaction: null,
        action: null,
    });

    const unfilteredBuildingNodes = useMemo(
        () => buildRentalPortfolioTreeNodes(state),
        [state.buildings, state.properties, state.propertyOwnership, state.rentalAgreements, state.transactions, state.invoices, state.contacts]
    );

    const treeData = useMemo((): TreeNode[] => {
        const allNode: TreeNode = { id: 'all', label: 'All Properties', type: 'all' };
        const filteredBuildings = pruneTreeNodesBySearchQuery(unfilteredBuildingNodes, treeSearchQuery);
        return [allNode, ...filteredBuildings];
    }, [unfilteredBuildingNodes, treeSearchQuery]);

    const treeVisibleIds = useMemo(() => collectTreeNodeIds(treeData), [treeData]);
    const firstOwnerIdInTree = useMemo(() => findFirstOwnerTreeIdInNodes(treeData), [treeData]);

    const resolvedTreeIdForFilters = useMemo(() => {
        let id = selectedTreeId === TREE_SELECT_AUTO ? (firstOwnerIdInTree ?? 'all') : selectedTreeId;
        if (id !== 'all' && !treeVisibleIds.has(id)) {
            id = firstOwnerIdInTree ?? 'all';
        }
        return id;
    }, [selectedTreeId, firstOwnerIdInTree, treeVisibleIds]);

    useEffect(() => {
        if (selectedTreeId === TREE_SELECT_AUTO) return;
        if (selectedTreeId !== 'all' && !treeVisibleIds.has(selectedTreeId)) {
            setSelectedTreeId(firstOwnerIdInTree ?? 'all');
        }
    }, [selectedTreeId, treeVisibleIds, firstOwnerIdInTree]);

    const { selectedBuildingId, selectedOwnerId, selectedUnitId } = useMemo(
        () => resolvePortfolioTreeSelection(resolvedTreeIdForFilters, state.properties),
        [resolvedTreeIdForFilters, state.properties]
    );

    const handleTreeSelect = useCallback((id: string) => {
        if (id === 'all' || id.startsWith('building:') || id.startsWith('owner:') || id.startsWith('unit:')) {
            setSelectedTreeId(id);
        }
    }, []);

    const handleRangeChange = (option: DateRangeOption) => {
        setDateRange(option);
        const now = new Date();

        if (option === 'total') {
            setStartDate('2000-01-01');
            setEndDate(toLocalDateString(now));
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
        setSortConfig((current) => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const ownerPropertyBreakdown = useMemo(() => buildOwnerPropertyBreakdown(state), [state]);

    const securityModalBreakdown = useMemo(() => {
        if (selectedOwnerId === 'all') return [];
        if (selectedUnitId !== 'all') {
            return getOwnerPayoutModalPropertyBreakdownForProperty(
                state,
                selectedOwnerId,
                selectedUnitId,
                'Security',
                ownerPropertyBreakdown
            );
        }
        return getOwnerPayoutModalPropertyBreakdown(state, selectedOwnerId, 'Security', ownerPropertyBreakdown);
    }, [state, selectedOwnerId, selectedUnitId, ownerPropertyBreakdown]);

    const securityPayableTotal = useMemo(
        () => securityModalBreakdown.reduce((s, r) => s + (r.balanceDue || 0), 0),
        [securityModalBreakdown]
    );

    const payFromReportEligible = useMemo(() => {
        const id = resolvedTreeIdForFilters;
        if (id === 'all' || id.startsWith('building:')) return false;
        if (!id.startsWith('owner:') && !id.startsWith('unit:')) return false;
        return securityPayableTotal > 0.01;
    }, [resolvedTreeIdForFilters, securityPayableTotal]);

    useEffect(() => {
        if (!payFromReportEligible && securityPayModalOpen) setSecurityPayModalOpen(false);
    }, [payFromReportEligible, securityPayModalOpen]);

    const payModalOwner = useMemo(
        () => (selectedOwnerId !== 'all' ? state.contacts.find((c) => c.id === selectedOwnerId) ?? null : null),
        [selectedOwnerId, state.contacts]
    );

    const payModalProperty = useMemo(
        () => (selectedUnitId !== 'all' ? state.properties.find((p) => p.id === selectedUnitId) ?? null : null),
        [selectedUnitId, state.properties]
    );

    const { reportData } = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const securityDepositCategory = state.categories.find((c) => c.name === 'Security Deposit');
        const refundCategory = state.categories.find((c) => c.name === 'Security Deposit Refund');
        const ownerPayoutCategory = state.categories.find((c) => c.name === 'Owner Security Payout');

        if (!securityDepositCategory) return { reportData: [] as SecurityDepositRow[] };

        const rows: any[] = [];

        state.transactions.forEach((tx) => {
            const txDate = new Date(tx.date);
            if (txDate < start || txDate > end) return;

            let isRelevant = false;
            let type: 'Deposit' | 'Refund' | 'Deduction' | 'Payout' = 'Deposit';

            if (tx.type === TransactionType.INCOME && tx.categoryId === securityDepositCategory.id) {
                isRelevant = true;
                type = 'Deposit';
            } else if (tx.type === TransactionType.EXPENSE) {
                const category = state.categories.find((c) => c.id === tx.categoryId);

                if (ownerPayoutCategory && tx.categoryId === ownerPayoutCategory.id) {
                    isRelevant = true;
                    type = 'Payout';
                } else if (refundCategory && tx.categoryId === refundCategory.id) {
                    isRelevant = true;
                    type = 'Refund';
                } else {
                    const contact = state.contacts.find((c) => c.id === tx.contactId);
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
                    const inv = state.invoices.find((i) => i.id === tx.invoiceId);
                    if (inv) {
                        propertyId = inv.propertyId;
                        if (!buildingId) buildingId = inv.buildingId;
                    }
                }

                if (tx.contactId) {
                    if (type === 'Payout') ownerId = tx.contactId;
                }

                if (propertyId) {
                    const property = state.properties.find((p) => p.id === propertyId);
                    if (property) {
                        if (!ownerId) ownerId = property.ownerId;
                        if (!buildingId) buildingId = property.buildingId;
                    }
                }

                if (selectedUnitId !== 'all') {
                    if (!propertyId || String(propertyId) !== String(selectedUnitId)) return;
                }
                if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                if (selectedOwnerId !== 'all') {
                    if (propertyId) {
                        if (!getLedgerOwnerIdsForProperty(state, propertyId).has(selectedOwnerId)) return;
                    } else if (ownerId !== selectedOwnerId) {
                        return;
                    }
                }

                const owner = state.contacts.find((c) => c.id === ownerId);
                const tenant = type === 'Payout' ? null : state.contacts.find((c) => c.id === tenantId);
                const property = state.properties.find((p) => p.id === propertyId);
                const building = state.buildings.find((b) => b.id === buildingId);

                rows.push({
                    id: tx.id,
                    date: tx.date,
                    ownerName: owner?.name || 'Unknown',
                    tenantName: tenant?.name || (type === 'Payout' ? '-' : 'Unknown'),
                    propertyName: property?.name || '-',
                    buildingName: building?.name || '-',
                    particulars: tx.description || type,
                    depositIn: type === 'Deposit' ? tx.amount : 0,
                    refundOut: type === 'Refund' || type === 'Deduction' || type === 'Payout' ? tx.amount : 0,
                    entityType: 'transaction' as const,
                    entityId: tx.id,
                });
            }
        });

        rows.sort((a, b) => {
            let valA: any = a[sortConfig.key];
            let valB: any = b[sortConfig.key];

            if (sortConfig.key === 'date') {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();

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

        let runningBalance = 0;
        let processedRows = rows.map((row) => {
            runningBalance += row.depositIn - row.refundOut;
            return { ...row, balance: runningBalance };
        });

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            processedRows = processedRows.filter(
                (r) =>
                    r.ownerName.toLowerCase().includes(q) ||
                    r.tenantName.toLowerCase().includes(q) ||
                    r.propertyName.toLowerCase().includes(q) ||
                    r.particulars.toLowerCase().includes(q)
            );
        }

        return { reportData: processedRows };
    }, [state, startDate, endDate, selectedBuildingId, selectedOwnerId, selectedUnitId, sortConfig, searchQuery]);

    const totals = useMemo(() => {
        return reportData.reduce(
            (acc, curr) => ({
                totalDepositIn: acc.totalDepositIn + curr.depositIn,
                totalRefundOut: acc.totalRefundOut + curr.refundOut,
            }),
            { totalDepositIn: 0, totalRefundOut: 0 }
        );
    }, [reportData]);

    const showLedgerSummary = resolvedTreeIdForFilters !== 'all';

    const ledgerSummaryCards = useMemo(() => {
        const net = totals.totalDepositIn - totals.totalRefundOut;
        return [
            { label: 'Total in', value: `${CURRENCY} ${formatCurrency(totals.totalDepositIn)}`, tone: 'in' as const },
            { label: 'Total out', value: `${CURRENCY} ${formatCurrency(totals.totalRefundOut)}`, tone: 'out' as const },
            {
                label: 'Net',
                value: `${CURRENCY} ${formatCurrency(net)}`,
                tone: net >= 0 ? ('neutral' as const) : ('out' as const),
            },
        ];
    }, [totals.totalDepositIn, totals.totalRefundOut]);

    const handleExport = () => {
        const data = reportData.map((r) => ({
            Date: formatDate(r.date),
            Building: r.buildingName,
            Owner: r.ownerName,
            Tenant: r.tenantName,
            Property: r.propertyName,
            Particulars: r.particulars,
            'Deposit Collected': r.depositIn,
            'Refunded/Paid Out': r.refundOut,
            Balance: r.balance,
        }));
        exportJsonToExcel(data, 'security-deposit-report.xlsx', 'Security Deposits');
    };

    const getLinkedItemName = (tx: Transaction | null): string => {
        if (!tx) return '';
        if (tx.invoiceId) {
            const invoice = state.invoices.find((i) => i.id === tx.invoiceId);
            return invoice ? `Invoice #${invoice.invoiceNumber}` : 'an Invoice';
        }
        if (tx.billId) {
            const bill = state.bills.find((b) => b.id === tx.billId);
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
            showToast(
                `Transaction deleted successfully. ${linkedItemName && linkedItemName !== 'a linked item' ? `The linked ${linkedItemName} has been updated.` : ''}`,
                'info'
            );
        }
        setWarningModalState({ isOpen: false, transaction: null, action: null });
    };

    const handleCloseWarning = () => {
        setWarningModalState({ isOpen: false, transaction: null, action: null });
    };

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column)
            return <span className="text-app-muted opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-accent ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div className="flex flex-col h-full">
            <style>{STANDARD_PRINT_STYLES}</style>

            <div className="flex flex-1 min-h-0 gap-0">
                <div className="flex flex-col w-56 flex-shrink-0 bg-app-card border-r border-app-border overflow-hidden no-print">
                    <div className="px-3 py-3 border-b border-app-border">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-8 h-8 rounded-lg bg-app-toolbar flex items-center justify-center text-app-muted">
                                <div className="w-4 h-4">{ICONS.building}</div>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-app-text leading-tight">Portfolio View</h3>
                                <p className="text-[10px] text-app-muted leading-tight">Management Tree</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-1.5 border-b border-app-border min-w-0">
                        <div className="relative w-full min-w-0">
                            <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none text-app-muted z-10">
                                <span className="h-3.5 w-3.5 shrink-0">{ICONS.search}</span>
                            </div>
                            <Input
                                placeholder="Search..."
                                value={treeSearchQuery}
                                onChange={(e) => setTreeSearchQuery(e.target.value)}
                                className="ds-input-field pl-7 py-1 text-xs w-full min-w-0 max-w-full"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-1.5">
                        <TreeView
                            treeData={treeData}
                            selectedId={resolvedTreeIdForFilters}
                            onSelect={(id) => handleTreeSelect(id)}
                            showLines={true}
                            defaultExpanded={true}
                        />
                    </div>
                </div>

                <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
                    <div className="flex-shrink-0 no-print border-b border-app-border bg-app-card px-3 py-2">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex bg-app-toolbar p-1 rounded-lg flex-shrink-0 overflow-x-auto">
                                {(['total', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map((opt) => (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => handleRangeChange(opt)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap capitalize ${
                                            dateRange === opt
                                                ? 'bg-primary text-ds-on-primary shadow-sm font-bold'
                                                : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/80'
                                        }`}
                                    >
                                        {opt === 'total' ? 'Total' : opt.replace(/([A-Z])/g, ' $1')}
                                    </button>
                                ))}
                            </div>

                            {dateRange === 'custom' && (
                                <div className="flex items-center gap-2 animate-fade-in">
                                    <DatePicker
                                        value={startDate}
                                        onChange={(d) => {
                                            const s =
                                                d && !isNaN(d.getTime()) ? toLocalDateString(d) : startDate;
                                            handleCustomDateChange(s, endDate);
                                        }}
                                    />
                                    <span className="text-app-muted">-</span>
                                    <DatePicker
                                        value={endDate}
                                        onChange={(d) => {
                                            const e =
                                                d && !isNaN(d.getTime()) ? toLocalDateString(d) : endDate;
                                            handleCustomDateChange(startDate, e);
                                        }}
                                    />
                                </div>
                            )}

                            <div className="relative flex-grow min-w-[180px] max-w-md">
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
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-app-text"
                                    >
                                        <div className="w-4 h-4">{ICONS.x}</div>
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => setSecurityPayModalOpen(true)}
                                    disabled={!payFromReportEligible}
                                    className="whitespace-nowrap h-8 min-w-[100px] px-6 bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 hover:border-blue-700 active:bg-blue-800 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={
                                        payFromReportEligible
                                            ? 'Refund or allocate security deposit (owner, tenant, invoices)'
                                            : 'Select an owner or unit with security balance due'
                                    }
                                >
                                    Pay
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleExport}
                                    className="whitespace-nowrap bg-app-toolbar hover:bg-app-toolbar/80 text-app-text border-app-border h-8"
                                >
                                    <div className="w-4 h-4 mr-1">{ICONS.export}</div> Export
                                </Button>
                                <PrintButton
                                    variant="secondary"
                                    size="sm"
                                    onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
                                    className="whitespace-nowrap h-8"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col flex-1 min-h-0 overflow-hidden printable-area" id="printable-area">
                        <Card className="flex flex-col flex-1 min-h-0 min-w-0 border-0 rounded-none shadow-none">
                            <div className="flex-shrink-0">
                                <ReportHeader />
                            </div>
                            <div className="text-center mb-4 px-6 flex-shrink-0">
                                <h3 className="text-2xl font-bold text-app-text">Tenant Security Deposit Liability</h3>
                                <p className="text-sm text-app-muted mt-1">
                                    {formatDate(startDate)} - {formatDate(endDate)}
                                </p>
                                {(selectedBuildingId !== 'all' || selectedOwnerId !== 'all' || selectedUnitId !== 'all') && (
                                    <p className="text-xs text-app-muted mt-1">
                                        {selectedBuildingId !== 'all' &&
                                            `Building: ${state.buildings.find((b) => b.id === selectedBuildingId)?.name} `}
                                        {selectedOwnerId !== 'all' &&
                                            `Owner: ${state.contacts.find((c) => c.id === selectedOwnerId)?.name} `}
                                        {selectedUnitId !== 'all' &&
                                            `Unit: ${state.properties.find((p) => p.id === selectedUnitId)?.name}`}
                                    </p>
                                )}
                            </div>

                            <LedgerSummaryCards show={showLedgerSummary} cards={ledgerSummaryCards} />

                            <div className="flex-1 min-h-0 flex flex-col px-6 pb-2">
                                <div className="flex-1 min-h-0 overflow-auto rounded-md border border-app-border">
                                <table className="min-w-full divide-y divide-app-border text-sm">
                                    <thead className="bg-app-toolbar/40 sticky top-0 z-20 border-b border-app-border">
                                        <tr>
                                            <th
                                                onClick={() => handleSort('date')}
                                                className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none whitespace-nowrap"
                                            >
                                                Date <SortIcon column="date" />
                                            </th>
                                            <th
                                                onClick={() => handleSort('buildingName')}
                                                className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none"
                                            >
                                                Building <SortIcon column="buildingName" />
                                            </th>
                                            <th
                                                onClick={() => handleSort('ownerName')}
                                                className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none"
                                            >
                                                Owner <SortIcon column="ownerName" />
                                            </th>
                                            <th
                                                onClick={() => handleSort('tenantName')}
                                                className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none"
                                            >
                                                Tenant <SortIcon column="tenantName" />
                                            </th>
                                            <th
                                                onClick={() => handleSort('propertyName')}
                                                className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none"
                                            >
                                                Property <SortIcon column="propertyName" />
                                            </th>
                                            <th
                                                onClick={() => handleSort('particulars')}
                                                className="px-3 py-2 text-left font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none"
                                            >
                                                Particulars <SortIcon column="particulars" />
                                            </th>
                                            <th
                                                onClick={() => handleSort('depositIn')}
                                                className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none"
                                            >
                                                Collected <SortIcon column="depositIn" />
                                            </th>
                                            <th
                                                onClick={() => handleSort('refundOut')}
                                                className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none"
                                            >
                                                Paid Out <SortIcon column="refundOut" />
                                            </th>
                                            <th
                                                onClick={() => handleSort('balance')}
                                                className="px-3 py-2 text-right font-semibold text-app-muted cursor-pointer hover:bg-app-toolbar/60 select-none"
                                            >
                                                Net Held <SortIcon column="balance" />
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-app-border bg-app-card">
                                        {reportData.map((item) => {
                                            const transaction = state.transactions.find((t) => t.id === item.entityId);
                                            return (
                                                <tr
                                                    key={item.id}
                                                    className="hover:bg-app-toolbar/30 cursor-pointer transition-colors"
                                                    onClick={() => transaction && setTransactionToEdit(transaction)}
                                                    title="Click to edit"
                                                >
                                                    <td className="px-3 py-2 whitespace-nowrap text-app-text">
                                                        {formatDate(item.date)}
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-app-text">
                                                        {item.buildingName}
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-app-text">
                                                        {item.ownerName}
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-app-text">
                                                        {item.tenantName}
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-app-text">
                                                        {item.propertyName}
                                                    </td>
                                                    <td
                                                        className="px-3 py-2 max-w-xs truncate text-app-muted"
                                                        title={item.particulars}
                                                    >
                                                        {item.particulars}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-success">
                                                        {item.depositIn > 0
                                                            ? `${CURRENCY} ${(item.depositIn || 0).toLocaleString()}`
                                                            : '-'}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-danger">
                                                        {item.refundOut > 0
                                                            ? `${CURRENCY} ${(item.refundOut || 0).toLocaleString()}`
                                                            : '-'}
                                                    </td>
                                                    <td
                                                        className={`px-3 py-2 text-right font-bold ${item.balance >= 0 ? 'text-app-text' : 'text-danger'}`}
                                                    >
                                                        {CURRENCY} {(item.balance || 0).toLocaleString()}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {reportData.length === 0 && (
                                            <tr>
                                                <td colSpan={9} className="px-3 py-8 text-center text-app-muted">
                                                    No records found for the selected criteria.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                    <tfoot className="bg-app-toolbar/40 font-bold border-t border-app-border sticky bottom-0 z-10">
                                        <tr>
                                            <td colSpan={6} className="px-3 py-2 text-right text-app-text">
                                                Totals (Period)
                                            </td>
                                            <td className="px-3 py-2 text-right text-success">
                                                {CURRENCY} {(totals.totalDepositIn || 0).toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2 text-right text-danger">
                                                {CURRENCY} {(totals.totalRefundOut || 0).toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2 text-right"></td>
                                        </tr>
                                    </tfoot>
                                </table>
                                </div>
                            </div>
                            <div className="flex-shrink-0">
                                <ReportFooter />
                            </div>
                        </Card>
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

            <LinkedTransactionWarningModal
                isOpen={warningModalState.isOpen}
                onClose={handleCloseWarning}
                onConfirm={handleConfirmWarning}
                action={warningModalState.action as 'delete' | 'update'}
                linkedItemName={getLinkedItemName(warningModalState.transaction)}
            />

            {payModalOwner && (
                <OwnerPayoutModal
                    isOpen={securityPayModalOpen}
                    onClose={() => setSecurityPayModalOpen(false)}
                    owner={payModalOwner}
                    balanceDue={securityPayableTotal}
                    payoutType="Security"
                    preSelectedBuildingId={payModalProperty?.buildingId}
                    propertyBreakdown={securityModalBreakdown}
                />
            )}
        </div>
    );
};

export default OwnerSecurityDepositReport;
