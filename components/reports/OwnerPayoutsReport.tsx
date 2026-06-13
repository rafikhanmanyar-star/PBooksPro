
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useDispatchOnly, useRentalReportAppState } from '../../hooks/useSelectiveState';
import { TransactionType, Transaction } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import Modal from '../ui/Modal';
import TransactionForm from '../transactions/TransactionForm';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import ServiceChargeUpdateModal from '../rentalManagement/ServiceChargeUpdateModal';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY, ICONS } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import LedgerSummaryCards from './LedgerSummaryCards';
import { formatCurrency } from '../../utils/numberUtils';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import PrintButton from '../ui/PrintButton';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import { OWNER_RENTAL_INCOME_PRINT_CSS } from './ownerRentalIncomePrint.css';
import TreeView, { TreeNode } from '../ui/TreeView';
import OwnerRentalIncomePayModal from './OwnerRentalIncomePayModal';
import OwnerRentalIncomeReceiveModal from './OwnerRentalIncomeReceiveModal';
import {
    TREE_SELECT_AUTO,
    pruneTreeNodesBySearchQuery,
    collectTreeNodeIds,
    findFirstOwnerTreeIdInNodes,
    buildRentalPortfolioTreeNodes,
    resolvePortfolioTreeSelection,
} from './rentalPortfolioReportTree';
import { sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import {
    computeOwnerRentalIncomeReport,
    type OwnerRentalIncomeSortKey,
    type ReportRow,
} from './ownerRentalIncomeLedgerEngine';
import { isAccountingBackedByRemoteApi } from '../../config/apiUrl';
import { fetchOwnerRentalIncomeReport } from '../../services/api/rentalReportsApi';
import { getAppStateApiService } from '../../services/api/appStateApi';
import { useServerRentalReportLedger } from '../../hooks/useServerRentalReportLedger';

type DateRangeOption = 'total' | 'thisMonth' | 'lastMonth' | 'custom';

const OwnerPayoutsReport: React.FC = () => {
    const rentalState = useRentalReportAppState();
    const dispatch = useDispatchOnly();
    const { showToast, showAlert } = useNotification();
    const { print: triggerPrint } = usePrintContext();
    const { openChat } = useWhatsApp();
    const now = new Date();
    const [dateRange, setDateRange] = useState<DateRangeOption>('total');
    const [startDate, setStartDate] = useState(() => '2000-01-01');
    const [endDate, setEndDate] = useState(() => toLocalDateString(new Date()));
    const [searchQuery, setSearchQuery] = useState('');
    /** Single tree selection: TREE_SELECT_AUTO | 'all' | 'building:{id}' | 'owner:{id}' | 'unit:{propertyId}' */
    const [selectedTreeId, setSelectedTreeId] = useState<string>(TREE_SELECT_AUTO);
    const [treeSearchQuery, setTreeSearchQuery] = useState('');

    const unfilteredBuildingNodes = useMemo(
        () => buildRentalPortfolioTreeNodes(rentalState),
        [rentalState]
    );

    const treeData = useMemo((): TreeNode[] => {
        const allNode: TreeNode = {
            id: 'all',
            label: 'All Properties',
            type: 'all'
        };
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

    // Derive filters from tree selection (so report logic stays unchanged)
    const { selectedBuildingId, selectedOwnerId, selectedUnitId } = useMemo(
        () => resolvePortfolioTreeSelection(resolvedTreeIdForFilters, rentalState.properties),
        [resolvedTreeIdForFilters, rentalState.properties]
    );

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: OwnerRentalIncomeSortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'asc' });

    // Edit Modal State
    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
    /** Paired Service Charge Income (credit) tx — same target as Monthly Service Charges → Edit */
    const [serviceChargeEditTransaction, setServiceChargeEditTransaction] = useState<Transaction | null>(null);

    // Warning Modal State
    const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'delete' | 'update' | null }>({
        isOpen: false,
        transaction: null,
        action: null
    });
    const [payModalOpen, setPayModalOpen] = useState(false);
    const [receiveModalOpen, setReceiveModalOpen] = useState(false);

    const handleRangeChange = (option: DateRangeOption) => {
        setDateRange(option);
        const n = new Date();

        if (option === 'total') {
            setStartDate('2000-01-01');
            setEndDate(toLocalDateString(n));
        } else if (option === 'thisMonth') {
            setStartDate(toLocalDateString(new Date(n.getFullYear(), n.getMonth(), 1)));
            setEndDate(toLocalDateString(new Date(n.getFullYear(), n.getMonth() + 1, 0)));
        } else if (option === 'lastMonth') {
            setStartDate(toLocalDateString(new Date(n.getFullYear(), n.getMonth() - 1, 1)));
            setEndDate(toLocalDateString(new Date(n.getFullYear(), n.getMonth(), 0)));
        }
    };

    const handleCustomDateChange = (start: string, end: string) => {
        setStartDate(start);
        setEndDate(end);
        setDateRange('custom');
    };

    const handleSort = (key: OwnerRentalIncomeSortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const localLedger = useMemo(
        () =>
            computeOwnerRentalIncomeReport(rentalState, {
                startDate,
                endDate,
                selectedBuildingId,
                selectedOwnerId,
                selectedUnitId,
                searchQuery,
                sortConfig,
            }),
        [rentalState, startDate, endDate, searchQuery, selectedBuildingId, selectedOwnerId, selectedUnitId, sortConfig]
    );

    const ledgerFilterKey = `${startDate}|${endDate}|${selectedBuildingId}|${selectedOwnerId}|${selectedUnitId}|${searchQuery}|${sortConfig.key}|${sortConfig.direction}`;

    const fetchServerLedger = useCallback(
        () =>
            fetchOwnerRentalIncomeReport({
                startDate,
                endDate,
                buildingId: selectedBuildingId,
                ownerId: selectedOwnerId,
                propertyId: selectedUnitId,
                search: searchQuery,
                sortKey: sortConfig.key,
                sortDirection: sortConfig.direction,
            }).then((r) => ({
                openingBalance: r.openingBalance,
                reportData: r.rows,
                fullLedgerClosingBalance: r.fullLedgerClosingBalance,
            })),
        [
            startDate,
            endDate,
            selectedBuildingId,
            selectedOwnerId,
            selectedUnitId,
            searchQuery,
            sortConfig.key,
            sortConfig.direction,
        ]
    );

    const {
        localOnly,
        result: ledgerResult,
        loading: ledgerLoading,
        updating: ledgerUpdating,
        error: ledgerFetchError,
        beginUpdating: beginLedgerUpdating,
        requestRefresh: requestLedgerRefresh,
    } = useServerRentalReportLedger({
        localResult: localLedger,
        fetchServer: fetchServerLedger,
        filterKey: ledgerFilterKey,
        initialEmpty: { openingBalance: 0, reportData: [] as ReportRow[], fullLedgerClosingBalance: 0 },
    });

    const { openingBalance, reportData, fullLedgerClosingBalance } = ledgerResult;

    /** Multiple owners visible with no owner filter — opening balance is not a single chain; hide aggregate opening row. */
    const perOwnerLedgerMode = useMemo(() => {
        if (selectedOwnerId !== 'all') return false;
        const ids = new Set(reportData.map((r) => r.ledgerOwnerId).filter(Boolean));
        return ids.size > 1;
    }, [reportData, selectedOwnerId]);

    /** Pay is only for a specific owner or unit in the tree, with a single running ledger and amount owed > 0. */
    const payFromReportEligible = useMemo(() => {
        const id = resolvedTreeIdForFilters;
        if (id === 'all' || id.startsWith('building:')) return false;
        if (!id.startsWith('owner:') && !id.startsWith('unit:')) return false;
        if (perOwnerLedgerMode) return false;
        return fullLedgerClosingBalance > 0.01;
    }, [resolvedTreeIdForFilters, perOwnerLedgerMode, fullLedgerClosingBalance]);

    /** Receive when the owner owes the business (negative closing balance), same tree scope as Pay. */
    const receiveFromReportEligible = useMemo(() => {
        const id = resolvedTreeIdForFilters;
        if (id === 'all' || id.startsWith('building:')) return false;
        if (!id.startsWith('owner:') && !id.startsWith('unit:')) return false;
        if (perOwnerLedgerMode) return false;
        return fullLedgerClosingBalance < -0.01;
    }, [resolvedTreeIdForFilters, perOwnerLedgerMode, fullLedgerClosingBalance]);

    useEffect(() => {
        if (!payFromReportEligible && payModalOpen) setPayModalOpen(false);
    }, [payFromReportEligible, payModalOpen]);

    useEffect(() => {
        if (!receiveFromReportEligible && receiveModalOpen) setReceiveModalOpen(false);
    }, [receiveFromReportEligible, receiveModalOpen]);

    const payModalOwner = useMemo(
        () => (selectedOwnerId !== 'all' ? rentalState.contacts.find((c) => c.id === selectedOwnerId) ?? null : null),
        [selectedOwnerId, rentalState.contacts]
    );

    const payModalProperty = useMemo(
        () => (selectedUnitId !== 'all' ? rentalState.properties.find((p) => p.id === selectedUnitId) ?? null : null),
        [selectedUnitId, rentalState.properties]
    );

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

    const showLedgerSummary = resolvedTreeIdForFilters !== 'all';

    const ledgerSummaryCards = useMemo(
        () => [
            { label: 'Total in', value: `${CURRENCY} ${formatCurrency(totals.totalIn)}`, tone: 'in' as const },
            { label: 'Total out', value: `${CURRENCY} ${formatCurrency(totals.totalOut)}`, tone: 'out' as const },
            {
                label: 'Net',
                value: `${CURRENCY} ${formatCurrency(totals.netBalance)}`,
                tone: totals.netBalance >= 0 ? ('neutral' as const) : ('out' as const),
            },
        ],
        [totals.totalIn, totals.totalOut, totals.netBalance]
    );

    const handleExport = () => {
        const exportRows: any[] = [];
        if (openingBalance !== 0 && !perOwnerLedgerMode) {
            exportRows.push({
                Date: formatDate(startDate),
                Owner: activeOwnerName || '-',
                Property: activePropertyName || '-',
                Particulars: 'Opening Balance',
                'Rent In': '',
                'Paid Out': '',
                Balance: openingBalance
            });
        }
        reportData.forEach(r => {
            exportRows.push({
                Date: formatDate(r.date),
                Owner: r.ownerName,
                Property: r.propertyName,
                Particulars: r.particulars,
                'Rent In': r.rentIn,
                'Paid Out': r.paidOut,
                Balance: r.balance
            });
        });
        exportJsonToExcel(exportRows, 'owner-rental-income-report.xlsx', 'Owner Rental Income');
    };

    const handleShare = () => {
        const ownerName = activeOwnerName || 'All Owners';
        const propertyName = activePropertyName || 'All Properties';
        const period = `${formatDate(startDate)} - ${formatDate(endDate)}`;
        let message = `*Owner Rental Income Report*\n`;
        message += `Period: ${period}\n`;
        if (activeOwnerName) message += `Owner: ${ownerName}\n`;
        if (activePropertyName) message += `Property: ${propertyName}\n`;
        message += `\n`;
        if (openingBalance !== 0 && !perOwnerLedgerMode) {
            message += `Opening Balance: ${CURRENCY} ${formatCurrency(openingBalance)}\n`;
        }
        reportData.forEach(r => {
            const rentIn = r.rentIn > 0 ? `+${formatCurrency(r.rentIn)}` : '';
            const paidOut = r.paidOut > 0 ? `-${formatCurrency(r.paidOut)}` : '';
            message += `${formatDate(r.date)} | ${r.particulars} | ${rentIn || paidOut} | Bal: ${formatCurrency(r.balance)}\n`;
        });
        message += `\n*Totals: Rent In ${CURRENCY} ${formatCurrency(totals.totalIn)} | Paid Out ${CURRENCY} ${formatCurrency(totals.totalOut)} | Balance ${CURRENCY} ${formatCurrency(totals.netBalance)}*`;

        const ownerContact = selectedOwnerId !== 'all' ? rentalState.contacts.find(c => c.id === selectedOwnerId) : undefined;
        if (ownerContact) {
            sendOrOpenWhatsApp(
                { contact: ownerContact, message, phoneNumber: ownerContact.contactNo || undefined },
                () => rentalState.whatsAppMode,
                openChat
            );
        } else {
            window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
        }
    };

    const activeFilters = useMemo(() => {
        const filters: { key: string; label: string; value: string; onClear: () => void }[] = [];
        if (selectedBuildingId !== 'all') {
            const building = rentalState.buildings.find(b => b.id === selectedBuildingId);
            if (building) filters.push({ key: 'building', label: 'Building', value: building.name, onClear: () => setSelectedTreeId('all') });
        }
        if (selectedOwnerId !== 'all') {
            const owner = rentalState.contacts.find(c => c.id === selectedOwnerId);
            if (owner) filters.push({ key: 'owner', label: 'Owner', value: owner.name, onClear: () => {
                if (selectedBuildingId !== 'all') {
                    setSelectedTreeId(`building:${selectedBuildingId}`);
                } else {
                    setSelectedTreeId('all');
                }
            }});
        }
        if (selectedUnitId !== 'all') {
            const unit = rentalState.properties.find(p => p.id === selectedUnitId);
            if (unit) filters.push({ key: 'unit', label: 'Unit', value: unit.name, onClear: () => {
                if (selectedOwnerId !== 'all') {
                    const ownerNodeId = selectedBuildingId !== 'all'
                        ? `owner:${selectedBuildingId}:${selectedOwnerId}`
                        : `owner:${selectedOwnerId}`;
                    setSelectedTreeId(ownerNodeId);
                } else if (selectedBuildingId !== 'all') {
                    setSelectedTreeId(`building:${selectedBuildingId}`);
                } else {
                    setSelectedTreeId('all');
                }
            }});
        }
        return filters;
    }, [selectedBuildingId, selectedOwnerId, selectedUnitId, rentalState.buildings, rentalState.contacts, rentalState.properties]);

    const activeOwnerName = useMemo(() => {
        if (selectedOwnerId !== 'all') return rentalState.contacts.find(c => c.id === selectedOwnerId)?.name || null;
        return null;
    }, [selectedOwnerId, rentalState.contacts]);

    const activePropertyName = useMemo(() => {
        if (selectedUnitId !== 'all') return rentalState.properties.find(p => p.id === selectedUnitId)?.name || null;
        return null;
    }, [selectedUnitId, rentalState.properties]);

    const handlePrintReport = useCallback(() => {
        const fileName = `Owner-Rental-Income-${formatDate(startDate)}-${formatDate(endDate)}.pdf`.replace(/[<>:"/\\|?*]+/g, '-');
        const ownerContact = selectedOwnerId !== 'all' ? rentalState.contacts.find(c => c.id === selectedOwnerId) ?? null : null;

        triggerPrint('REPORT', {
            elementId: 'owner-rental-income-print-root',
            pdfWhatsApp: { fileName, contact: ownerContact },
        });
    }, [startDate, endDate, selectedOwnerId, rentalState.contacts, triggerPrint]);

    const getLinkedItemName = (tx: Transaction | null): string => {
        if (!tx) return '';
        if (tx.invoiceId) {
            const invoice = rentalState.invoices.find(i => i.id === tx.invoiceId);
            return invoice ? `Invoice #${invoice.invoiceNumber}` : 'an Invoice';
        }
        if (tx.billId) {
            const bill = rentalState.bills.find(b => b.id === tx.billId);
            return bill ? `Bill #${bill.billNumber}` : 'a Bill';
        }
        return 'a linked item';
    };

    /** Service Charge Update modal expects the positive Service Charge Income (credit) tx — report rows use the paired debit line. */
    const resolveServiceChargeCreditTx = useCallback((tx: Transaction | undefined): Transaction | null => {
        const svcIncomeCategory = rentalState.categories.find(c => c.id === 'sys-cat-svc-inc' || c.name === 'Service Charge Income');
        const rentalIncomeCategory = rentalState.categories.find(c => c.name === 'Rental Income');
        if (!tx || !svcIncomeCategory || !rentalIncomeCategory) return null;

        if (tx.type === TransactionType.INCOME && tx.categoryId === svcIncomeCategory.id) {
            const a = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
            if (!isNaN(a) && a > 0) return tx;
        }

        const rawAmt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
        if (
            tx.type !== TransactionType.INCOME ||
            tx.categoryId !== rentalIncomeCategory.id ||
            isNaN(rawAmt) ||
            rawAmt >= 0
        ) {
            return null;
        }
        const desc = (tx.description || '').toLowerCase();
        if (!desc.includes('service charge')) return null;

        let pairId = '';
        if (tx.id.includes('bm-credit')) pairId = tx.id.replace('bm-credit', 'bm-debit');
        else if (tx.id.includes('bm-debit')) pairId = tx.id.replace('bm-debit', 'bm-credit');
        let pair = pairId ? rentalState.transactions.find(t => t.id === pairId) : undefined;
        if (!pair) {
            pair = rentalState.transactions.find(t =>
                t.id !== tx.id &&
                t.propertyId === tx.propertyId &&
                t.date === tx.date &&
                t.type === TransactionType.INCOME &&
                t.categoryId === svcIncomeCategory.id &&
                Math.abs((typeof t.amount === 'string' ? parseFloat(t.amount) : Number(t.amount)) + rawAmt) < 0.01
            );
        }
        return pair ?? null;
    }, [rentalState.categories, rentalState.transactions]);

    const handleShowDeleteWarning = (tx: Transaction) => {
        setTransactionToEdit(null);
        setWarningModalState({ isOpen: true, transaction: tx, action: 'delete' });
    };

    const handleConfirmWarning = async () => {
        const { transaction, action } = warningModalState;
        if (transaction && action === 'delete') {
            const linkedItemName = getLinkedItemName(transaction);
            beginLedgerUpdating();
            try {
                if (isAccountingBackedByRemoteApi()) {
                    const api = getAppStateApiService();
                    await api.deleteTransaction(transaction.id);
                    dispatch({ type: 'DELETE_TRANSACTION', payload: transaction.id, _isRemote: true } as never);
                } else {
                    dispatch({ type: 'DELETE_TRANSACTION', payload: transaction.id });
                }
                showToast(
                    `Transaction deleted successfully. ${linkedItemName && linkedItemName !== 'a linked item' ? `The linked ${linkedItemName} has been updated.` : ''}`,
                    'info'
                );
                requestLedgerRefresh();
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                await showAlert(`Failed to delete transaction: ${msg}`);
            }
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

    const SortIcon = ({ column }: { column: OwnerRentalIncomeSortKey }) => (
        <span className="no-print ml-1 text-[10px] text-app-muted">
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
            <style>{OWNER_RENTAL_INCOME_PRINT_CSS}</style>

            <div className="flex flex-1 min-h-0 gap-0">
                {/* Left: Portfolio View sidebar (hidden when printing) */}
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

                {/* Right: Report area — table scrolls internally; header/summary stay fixed */}
                <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
                    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                        <Card className="flex flex-col flex-1 min-h-0 min-w-0 border-0 rounded-none shadow-none">
                            <div className="flex-shrink-0">
                                <ReportHeader />
                                {!localOnly && (ledgerLoading || ledgerUpdating) && (
                                    <p className="px-6 pt-2 text-sm text-app-muted">
                                        {ledgerUpdating ? 'Updating ledger…' : 'Loading ledger from server…'}
                                    </p>
                                )}
                                {!localOnly && ledgerFetchError && (
                                    <p className="px-6 pt-2 text-sm text-ds-danger">
                                        Server report failed: {ledgerFetchError}. Showing empty ledger until refresh.
                                    </p>
                                )}
                            </div>

                            {/* Report header row: title + actions + date pills */}
                            <div className="px-6 pt-4 pb-3 no-print flex-shrink-0">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-2xl font-bold text-app-text">Owner Rental Income</h3>
                                        <p className="text-sm text-app-muted mt-0.5">Detailed view of rental income and owner distributions</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setReceiveModalOpen(true)}
                                            disabled={!receiveFromReportEligible}
                                            className="h-8 min-w-[100px] px-4 border-app-border disabled:opacity-50 disabled:cursor-not-allowed"
                                            title={
                                                receiveFromReportEligible
                                                    ? 'Record cash received from the owner against unpaid bills or service charges'
                                                    : 'Select an owner or unit with a negative closing balance to receive reimbursement'
                                            }
                                        >
                                            Receive amount
                                        </Button>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={() => setPayModalOpen(true)}
                                            disabled={!payFromReportEligible}
                                            className="h-8 min-w-[100px] px-6 bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 hover:border-blue-700 active:bg-blue-800 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title={
                                                payFromReportEligible
                                                    ? 'Record a rental income payout to this owner'
                                                    : 'Select an owner or unit in the tree with a closing balance greater than zero'
                                            }
                                        >
                                            Pay
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={handleShare}
                                            className="text-ds-success bg-ds-success/10 hover:bg-ds-success/15 border-ds-success/30 h-8"
                                            title="Share on WhatsApp"
                                        >
                                            <div className="w-4 h-4">{ICONS.whatsapp}</div>
                                            <span className="ml-1">Share</span>
                                        </Button>
                                        <PrintButton
                                            variant="secondary"
                                            size="sm"
                                            onPrint={handlePrintReport}
                                            className="h-8"
                                            showLabel={true}
                                        />
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={handleExport}
                                            className="bg-app-toolbar hover:bg-app-toolbar/80 text-app-text border-app-border h-8"
                                        >
                                            <div className="w-4 h-4 mr-1">{ICONS.export}</div> Export
                                        </Button>
                                    </div>
                                </div>

                                {/* Date range pills */}
                                <div className="flex items-center gap-3 mt-3">
                                    <div className="flex bg-app-toolbar p-0.5 rounded-lg border border-app-border">
                                        {(['total', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                                            <button
                                                type="button"
                                                key={opt}
                                                onClick={() => handleRangeChange(opt)}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${dateRange === opt
                                                    ? 'bg-app-card text-primary shadow-sm font-bold border border-primary/25'
                                                    : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/80'
                                                    }`}
                                            >
                                                {opt === 'total' ? 'Total' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : (
                                                    <span className="flex items-center gap-1">Custom <span className="w-3.5 h-3.5 inline-block">{ICONS.calendar}</span></span>
                                                )}
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
                                </div>
                            </div>

                            {/* Active filter pills */}
                            {activeFilters.length > 0 && (
                                <div className="px-6 pb-3 no-print flex-shrink-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-medium text-app-muted uppercase tracking-wider">Active Filters:</span>
                                        {activeFilters.map(f => (
                                            <span
                                                key={f.key}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-app-toolbar border border-app-border text-xs text-app-text"
                                            >
                                                <span className="text-app-muted">{f.label}:</span>
                                                <span className="font-medium">{f.value}</span>
                                                <button
                                                    type="button"
                                                    onClick={f.onClear}
                                                    className="ml-0.5 text-app-muted hover:text-app-text transition-colors"
                                                >
                                                    <div className="w-3 h-3">{ICONS.x}</div>
                                                </button>
                                            </span>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => setSelectedTreeId('all')}
                                            className="text-xs text-primary hover:text-primary/80 font-medium ml-2"
                                        >
                                            Clear All
                                        </button>
                                    </div>
                                </div>
                            )}

                            <LedgerSummaryCards show={showLedgerSummary} cards={ledgerSummaryCards} />

                            {/* Data table (scroll container) — this block alone is cloned for print / PDF */}
                            <div
                                className={`owner-rental-income-print-root flex-1 min-h-0 flex flex-col px-6 pb-2${ledgerUpdating ? ' opacity-80 pointer-events-none' : ''}`}
                                id="owner-rental-income-print-root"
                                data-print-orientation="landscape"
                                data-print-page-size="a4"
                            >
                                <div className="owner-rental-income-print-header">
                                    <h2>Owner Rental Income</h2>
                                    <p>
                                        Period: {formatDate(startDate)} – {formatDate(endDate)}
                                        {activeOwnerName ? ` · Owner: ${activeOwnerName}` : ''}
                                        {activePropertyName ? ` · Property: ${activePropertyName}` : ''}
                                    </p>
                                </div>
                                <div className="flex-1 min-h-0 overflow-auto rounded-md border border-app-border" data-print-scroll-container>
                                    <table className="owner-rental-income-print-table min-w-full text-[15px] leading-snug">
                                    <colgroup>
                                        <col className="col-date" />
                                        <col className="col-owner" />
                                        <col className="col-property" />
                                        <col className="col-particulars" />
                                        <col className="col-rent-in" />
                                        <col className="col-paid-out" />
                                        <col className="col-balance" />
                                    </colgroup>
                                    <thead className="sticky top-0 z-20 bg-app-card border-b-2 border-app-border">
                                        <tr>
                                            <th onClick={() => handleSort('date')} className="col-date px-3 py-3 text-left text-sm font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none whitespace-nowrap">Date <SortIcon column="date" /></th>
                                            <th onClick={() => handleSort('ownerName')} className="col-owner px-3 py-3 text-left text-sm font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none whitespace-nowrap">Owner <SortIcon column="ownerName" /></th>
                                            <th onClick={() => handleSort('propertyName')} className="col-property px-3 py-3 text-left text-sm font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none whitespace-nowrap">Property <SortIcon column="propertyName" /></th>
                                            <th onClick={() => handleSort('particulars')} className="col-particulars px-3 py-3 text-left text-sm font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none whitespace-nowrap">Particulars <SortIcon column="particulars" /></th>
                                            <th onClick={() => handleSort('rentIn')} className="col-rent-in px-3 py-3 text-right text-sm font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none">Rent In <SortIcon column="rentIn" /></th>
                                            <th onClick={() => handleSort('paidOut')} className="col-paid-out px-3 py-3 text-right text-sm font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none">Paid Out <SortIcon column="paidOut" /></th>
                                            <th onClick={() => handleSort('balance')} className="col-balance px-3 py-3 text-right text-sm font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none">Balance <SortIcon column="balance" /></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-app-border/50">
                                        {/* Opening Balance row */}
                                        {openingBalance !== 0 && !perOwnerLedgerMode && (
                                            <tr className="bg-app-toolbar/20">
                                                <td className="px-3 py-3 whitespace-nowrap text-app-text">{formatDate(startDate)}</td>
                                                <td className="px-3 py-3 text-app-muted whitespace-nowrap">{activeOwnerName || '-'}</td>
                                                <td className="px-3 py-3 text-app-muted whitespace-nowrap">{activePropertyName || '-'}</td>
                                                <td className="px-3 py-3 text-app-muted font-medium whitespace-nowrap">Opening Balance</td>
                                                <td className="px-3 py-3 text-right text-app-muted">-</td>
                                                <td className="px-3 py-3 text-right text-app-muted">-</td>
                                                <td className="px-3 py-3 text-right font-bold text-app-text whitespace-nowrap">{formatCurrency(openingBalance)}</td>
                                            </tr>
                                        )}

                                        {reportData.map((item) => {
                                            const transaction = rentalState.transactions.find(t => t.id === item.entityId);
                                            const serviceChargeCredit = resolveServiceChargeCreditTx(transaction);
                                            return (
                                                <tr
                                                    key={item.id}
                                                    className="hover:bg-app-toolbar/30 cursor-pointer transition-colors"
                                                    onClick={() => {
                                                        if (serviceChargeCredit) {
                                                            setServiceChargeEditTransaction(serviceChargeCredit);
                                                            return;
                                                        }
                                                        if (transaction) setTransactionToEdit(transaction);
                                                    }}
                                                    title={serviceChargeCredit ? 'Click to edit service charge' : 'Click to edit'}
                                                >
                                                    <td className="px-3 py-3 whitespace-nowrap text-app-text">{formatDate(item.date)}</td>
                                                    <td className="px-3 py-3 whitespace-nowrap text-app-text">{item.ownerName}</td>
                                                    <td className="px-3 py-3 whitespace-nowrap text-primary">{item.propertyName}</td>
                                                    <td className="px-3 py-3 whitespace-nowrap text-app-muted" title={item.particulars}>{item.particulars}</td>
                                                    <td className="px-3 py-3 text-right text-success whitespace-nowrap">{item.rentIn > 0 ? formatCurrency(item.rentIn) : '-'}</td>
                                                    <td className="px-3 py-3 text-right text-danger whitespace-nowrap">{item.paidOut > 0 ? formatCurrency(item.paidOut) : '-'}</td>
                                                    <td className={`px-3 py-3 text-right font-bold whitespace-nowrap ${item.balance >= 0 ? 'text-app-text' : 'text-danger'}`}>{formatCurrency(item.balance)}</td>
                                                </tr>
                                            );
                                        })}
                                        {reportData.length === 0 && openingBalance === 0 && (
                                            <tr>
                                                <td colSpan={7} className="px-3 py-8 text-center text-app-muted">No records found for the selected period.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-app-border bg-app-card">
                                            <td colSpan={4} className="px-3 py-3 text-right font-bold text-app-text uppercase tracking-wide">Totals (Period)</td>
                                            <td className="col-rent-in px-3 py-3 text-right font-bold text-success whitespace-nowrap">{formatCurrency(totals.totalIn)}</td>
                                            <td className="col-paid-out px-3 py-3 text-right font-bold text-danger whitespace-nowrap">{formatCurrency(totals.totalOut)}</td>
                                            <td className={`col-balance px-3 py-3 text-right font-bold whitespace-nowrap ${totals.netBalance >= 0 ? 'text-app-text' : 'text-danger'}`}>
                                                {formatCurrency(totals.netBalance)}
                                            </td>
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

            {/* Edit Transaction Modal */}
            <Modal isOpen={!!transactionToEdit} onClose={() => setTransactionToEdit(null)} title="Edit Transaction">
                {transactionToEdit && (
                    <TransactionForm
                        transactionToEdit={transactionToEdit}
                        onClose={() => {
                            setTransactionToEdit(null);
                            if (!localOnly) {
                                beginLedgerUpdating();
                                window.setTimeout(() => requestLedgerRefresh(), 400);
                            }
                        }}
                        onShowDeleteWarning={handleShowDeleteWarning}
                    />
                )}
            </Modal>

            {serviceChargeEditTransaction && (
                <ServiceChargeUpdateModal
                    isOpen={!!serviceChargeEditTransaction}
                    onClose={() => {
                        setServiceChargeEditTransaction(null);
                        if (!localOnly) {
                            beginLedgerUpdating();
                            window.setTimeout(() => requestLedgerRefresh(), 400);
                        }
                    }}
                    transaction={serviceChargeEditTransaction}
                />
            )}

            {/* Linked Transaction Warning Modal */}
            <LinkedTransactionWarningModal
                isOpen={warningModalState.isOpen}
                onClose={handleCloseWarning}
                onConfirm={handleConfirmWarning}
                action={warningModalState.action as 'delete' | 'update'}
                linkedItemName={getLinkedItemName(warningModalState.transaction)}
            />

            {payModalOwner && (
                <OwnerRentalIncomePayModal
                    isOpen={payModalOpen}
                    onClose={() => setPayModalOpen(false)}
                    owner={payModalOwner}
                    property={payModalProperty}
                    reportPayableBalance={fullLedgerClosingBalance}
                    preSelectedBuildingId={payModalProperty?.buildingId}
                    onLedgerMutationStart={beginLedgerUpdating}
                    onLedgerMutationComplete={requestLedgerRefresh}
                />
            )}

            {payModalOwner && (
                <OwnerRentalIncomeReceiveModal
                    isOpen={receiveModalOpen}
                    onClose={() => setReceiveModalOpen(false)}
                    owner={payModalOwner}
                    property={payModalProperty}
                    selectedBuildingId={selectedBuildingId}
                    selectedOwnerId={selectedOwnerId}
                    selectedUnitId={selectedUnitId}
                    reportClosingBalance={fullLedgerClosingBalance}
                    onLedgerMutationStart={beginLedgerUpdating}
                    onLedgerMutationComplete={requestLedgerRefresh}
                />
            )}
        </div>
    );
};

export default OwnerPayoutsReport;
