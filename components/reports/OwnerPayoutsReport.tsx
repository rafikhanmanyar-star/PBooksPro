
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
import ServiceChargeUpdateModal from '../rentalManagement/ServiceChargeUpdateModal';
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
import { sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { getLedgerOwnerIdsForProperty, resolveOwnerForPropertyOnDate, resolveOwnerForTransaction, isFormerOwner, getOwnershipSharesForPropertyOnDate, hasMultipleOwnersOnDate, getOwnerSharePercentageOnDate } from '../../services/propertyOwnershipService';

type DateRangeOption = 'total' | 'thisMonth' | 'lastMonth' | 'custom';

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
    /** Internal: running balance is computed per owner when multiple owners share the same view. */
    ledgerOwnerId?: string;
}

type SortKey = 'date' | 'ownerName' | 'propertyName' | 'particulars' | 'rentIn' | 'paidOut' | 'balance';

/** Initial tree selection: first owner in portfolio order until the user picks a node explicitly. */
const TREE_SELECT_AUTO = '__portfolio_auto_first_owner__';

function pruneTreeNodesBySearchQuery(nodes: TreeNode[], query: string): TreeNode[] {
    const t = query.trim().toLowerCase();
    if (!t) return nodes;
    const labelMatches = (label: string) => label.toLowerCase().includes(t);
    const prune = (node: TreeNode): TreeNode | null => {
        const childList = node.children;
        if (!childList?.length) {
            return labelMatches(node.label) ? node : null;
        }
        const nextChildren = childList
            .map(prune)
            .filter((n): n is TreeNode => n !== null);
        if (labelMatches(node.label) || nextChildren.length > 0) {
            return { ...node, children: nextChildren.length ? nextChildren : undefined };
        }
        return null;
    };
    return nodes.map(prune).filter((n): n is TreeNode => n !== null);
}

function collectTreeNodeIds(nodes: TreeNode[]): Set<string> {
    const ids = new Set<string>();
    const walk = (list: TreeNode[]) => {
        for (const n of list) {
            ids.add(n.id);
            if (n.children?.length) walk(n.children);
        }
    };
    walk(nodes);
    return ids;
}

function findFirstOwnerTreeIdInNodes(nodes: TreeNode[]): string | null {
    for (const n of nodes) {
        if (n.id.startsWith('owner:')) return n.id;
        if (n.children?.length) {
            const inner = findFirstOwnerTreeIdInNodes(n.children);
            if (inner) return inner;
        }
    }
    return null;
}

const OwnerPayoutsReport: React.FC = () => {
    const { state, dispatch } = useAppContext();
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

    const unfilteredBuildingNodes = useMemo((): TreeNode[] => {
        const buildingNodes: TreeNode[] = state.buildings
            .map(building => {
                const propsInBuilding = state.properties.filter(p => p.buildingId === building.id);

                const ownerIdSet = new Set<string>();
                const ownerIds: string[] = [];
                for (const p of propsInBuilding) {
                    const all = getLedgerOwnerIdsForProperty(state, p.id);
                    for (const oid of all) {
                        if (!ownerIdSet.has(oid)) {
                            ownerIdSet.add(oid);
                            ownerIds.push(oid);
                        }
                    }
                }

                const todayStr = toLocalDateString(new Date());
                const ownerChildren: TreeNode[] = ownerIds
                    .map(ownerId => {
                        const owner = state.contacts.find(c => c.id === ownerId);
                        const ownerLabelBase = owner?.name ?? 'Owner';
                        const former = isFormerOwner(state, ownerId);
                        const unitChildren: TreeNode[] = propsInBuilding
                            .filter(p => {
                                const owners = getLedgerOwnerIdsForProperty(state, p.id);
                                return owners.has(ownerId);
                            })
                            .map(prop => {
                                const shares = getOwnershipSharesForPropertyOnDate(state, prop.id, todayStr);
                                const ownerShare = shares.find(s => s.ownerId === ownerId);
                                const pctSuffix = shares.length > 1 && ownerShare ? ` (${ownerShare.percentage.toFixed(0)}%)` : '';
                                return { id: `unit:${prop.id}:${ownerId}`, label: `${prop.name}${pctSuffix}`, type: 'unit' as const };
                            });
                        unitChildren.sort((a, b) => a.label.localeCompare(b.label));
                        let ownerLabel = ownerLabelBase;
                        if (former) ownerLabel += ' (Former)';
                        return {
                            id: `owner:${ownerId}`,
                            label: ownerLabel,
                            type: 'owner',
                            children: unitChildren.length ? unitChildren : undefined
                        } as TreeNode;
                    });
                ownerChildren.sort((a, b) => a.label.localeCompare(b.label));

                return {
                    id: `building:${building.id}`,
                    label: building.name,
                    type: 'building',
                    children: ownerChildren.length ? ownerChildren : undefined
                };
            })
            .filter(n => !!n.children?.length);
        buildingNodes.sort((a, b) => a.label.localeCompare(b.label));
        return buildingNodes;
    }, [state.buildings, state.properties, state.propertyOwnership, state.rentalAgreements, state.transactions, state.invoices, state.contacts]);

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
    const { selectedBuildingId, selectedOwnerId, selectedUnitId } = useMemo(() => {
        const treeSelId = resolvedTreeIdForFilters;
        if (treeSelId === 'all') {
            return { selectedBuildingId: 'all', selectedOwnerId: 'all', selectedUnitId: 'all' };
        }
        if (treeSelId.startsWith('building:')) {
            const id = treeSelId.slice('building:'.length);
            return { selectedBuildingId: id, selectedOwnerId: 'all', selectedUnitId: 'all' };
        }
        if (treeSelId.startsWith('owner:')) {
            const id = treeSelId.slice('owner:'.length);
            return { selectedBuildingId: 'all', selectedOwnerId: id, selectedUnitId: 'all' };
        }
        if (treeSelId.startsWith('unit:')) {
            const rest = treeSelId.slice('unit:'.length);
            const colonIdx = rest.indexOf(':');
            const propertyIdStr = colonIdx === -1 ? rest : rest.slice(0, colonIdx);
            const ownerFromTree = colonIdx === -1 ? undefined : rest.slice(colonIdx + 1);
            const property = state.properties.find(p => String(p.id) === propertyIdStr);
            if (!property) return { selectedBuildingId: 'all', selectedOwnerId: 'all', selectedUnitId: 'all' };
            return {
                selectedBuildingId: property.buildingId || 'all',
                selectedOwnerId: ownerFromTree || 'all',
                selectedUnitId: property.id
            };
        }
        return { selectedBuildingId: 'all', selectedOwnerId: 'all', selectedUnitId: 'all' };
    }, [resolvedTreeIdForFilters, state.properties]);

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'asc' });

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

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const openingBalance = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);

        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const ownerSecurityPayoutCat = state.categories.find(c => c.name === 'Owner Security Payout');
        const securityRefundCat = state.categories.find(c => c.name === 'Security Deposit Refund');
        const obClearingCat = state.categories.find(c => c.name === 'Owner Rental Allocation (Clearing)');
        const obShareCat = state.categories.find(c => c.name === 'Owner Rental Income Share');

        if (!rentalIncomeCategory) return 0;

        const brokerFeeTxIds = new Set<string>();
        if (brokerFeeCategory) {
            state.transactions.forEach(tx => {
                if (tx.type === TransactionType.EXPENSE && tx.categoryId === brokerFeeCategory.id) {
                    brokerFeeTxIds.add(tx.id);
                }
            });
        }
        const ownerBillIds = new Set((state.bills || []).filter(b => b.propertyId && !b.projectId).map(b => b.id));
        const billPaymentTxIds = new Set<string>();
        state.transactions.forEach(tx => {
            if (tx.type === TransactionType.EXPENSE && tx.billId && ownerBillIds.has(tx.billId)) {
                billPaymentTxIds.add(tx.id);
            }
        });

        const obShareLineInvoices = new Set<string>();
        if (obShareCat) {
            state.transactions.forEach(tx => {
                if (tx.categoryId === obShareCat.id && tx.invoiceId) obShareLineInvoices.add(tx.invoiceId);
                if (tx.categoryId === obShareCat.id && tx.batchId) obShareLineInvoices.add(tx.batchId);
            });
        }

        let balance = 0;

        const addIncomeToBalance = (amount: number, ownerIdForTx: string | undefined, buildingId: string | undefined, propertyId: string | undefined) => {
            if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
            if (selectedOwnerId !== 'all' && ownerIdForTx !== selectedOwnerId) return;
            if (selectedUnitId !== 'all' && propertyId !== selectedUnitId) return;
            balance += amount;
        };

        state.transactions.forEach(tx => {
            const date = new Date(tx.date);
            if (date >= start) return;

            if (tx.type === TransactionType.INCOME && tx.propertyId) {
                if (obClearingCat && tx.categoryId === obClearingCat.id) return;

                if (tx.categoryId === rentalIncomeCategory.id) {
                    const txDate = (tx.date || '').slice(0, 10);
                    const hasExplicit = (tx.invoiceId && obShareLineInvoices.has(tx.invoiceId))
                        || (tx.batchId && obShareLineInvoices.has(tx.batchId));
                    if (hasExplicit) return;

                    const rawAmt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (isNaN(rawAmt)) return;
                    const property = state.properties.find(p => p.id === tx.propertyId);
                    const buildingId = tx.buildingId || property?.buildingId;

                    if (txDate && tx.propertyId && hasMultipleOwnersOnDate(state, String(tx.propertyId), txDate)) {
                        const shares = getOwnershipSharesForPropertyOnDate(state, tx.propertyId, txDate);
                        for (const s of shares) {
                            if (s.percentage <= 0) continue;
                            addIncomeToBalance(Math.round(rawAmt * s.percentage) / 100, s.ownerId, buildingId, tx.propertyId);
                        }
                    } else {
                        const ownerIdForTx = resolveOwnerForTransaction(state, tx) ?? property?.ownerId;
                        addIncomeToBalance(rawAmt, ownerIdForTx, buildingId, tx.propertyId);
                    }
                    return;
                }

                if (obShareCat && tx.categoryId === obShareCat.id) {
                    const rawAmt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (isNaN(rawAmt)) return;
                    const property = state.properties.find(p => p.id === tx.propertyId);
                    addIncomeToBalance(rawAmt, tx.contactId || tx.ownerId, tx.buildingId || property?.buildingId, tx.propertyId);
                    return;
                }

                return;
            }

            if (tx.type === TransactionType.EXPENSE) {
                if (ownerSecurityPayoutCat && tx.categoryId === ownerSecurityPayoutCat.id) return;
                if (securityRefundCat && tx.categoryId === securityRefundCat.id) return;
                if (brokerFeeTxIds.has(tx.id)) return;
                if (billPaymentTxIds.has(tx.id)) return;

                if (tx.contactId) {
                    const contact = state.contacts.find(c => c.id === tx.contactId);
                    if (contact?.type === ContactType.TENANT) return;
                }
                const category = state.categories.find(c => c.id === tx.categoryId);
                const catName = category?.name || '';
                if (catName === 'Owner Security Payout' || catName === 'Security Deposit Refund' || catName.includes('(Tenant)')) return;

                let isRelevant = false;
                let propertyId = tx.propertyId;

                if (ownerPayoutCategory && tx.categoryId === ownerPayoutCategory.id) {
                    isRelevant = true;
                } else if (propertyId) {
                    isRelevant = true;
                }

                if (isRelevant) {
                    let buildingId = tx.buildingId;
                    const isDirectOwnerPayout = !!(ownerPayoutCategory && tx.categoryId === ownerPayoutCategory.id);
                    let ownerId: string | undefined = tx.contactId;
                    if (propertyId) {
                        const property = state.properties.find(p => p.id === propertyId);
                        if (property) {
                            if (!buildingId) buildingId = property.buildingId;
                            if (!isDirectOwnerPayout) {
                                ownerId = resolveOwnerForTransaction(state, tx) ?? property.ownerId;
                            }
                        }
                    }
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (isNaN(amount)) return;

                    const txDate = (tx.date || '').slice(0, 10);
                    if (
                        !isDirectOwnerPayout &&
                        propertyId &&
                        txDate &&
                        hasMultipleOwnersOnDate(state, String(propertyId), txDate)
                    ) {
                        const shares = getOwnershipSharesForPropertyOnDate(state, String(propertyId), txDate);
                        for (const s of shares) {
                            if (s.percentage <= 0) continue;
                            const shareAmt = Math.round(amount * s.percentage) / 100;
                            if (selectedOwnerId !== 'all' && s.ownerId !== selectedOwnerId) continue;
                            if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) continue;
                            if (selectedUnitId !== 'all' && propertyId !== selectedUnitId) continue;
                            balance -= shareAmt;
                        }
                    } else {
                        if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
                        if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                        if (selectedUnitId !== 'all' && propertyId !== selectedUnitId) return;
                        balance -= amount;
                    }
                }
            }
        });

        state.rentalAgreements.forEach(ra => {
            if (!ra.brokerId || !ra.brokerFee || ra.brokerFee <= 0 || !ra.propertyId) return;
            const raDate = new Date(ra.startDate);
            if (raDate >= start) return;
            const property = state.properties.find(p => p.id === ra.propertyId);
            if (!property) return;
            const raDateStr = (ra.startDate || '').slice(0, 10);
            const buildingId = property.buildingId;
            const fee = typeof ra.brokerFee === 'string' ? parseFloat(ra.brokerFee) : Number(ra.brokerFee);
            if (isNaN(fee)) return;

            if (raDateStr && hasMultipleOwnersOnDate(state, String(ra.propertyId), raDateStr)) {
                const shares = getOwnershipSharesForPropertyOnDate(state, String(ra.propertyId), raDateStr);
                for (const s of shares) {
                    if (s.percentage <= 0) continue;
                    const shareFee = Math.round(fee * s.percentage) / 100;
                    if (selectedOwnerId !== 'all' && s.ownerId !== selectedOwnerId) continue;
                    if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) continue;
                    if (selectedUnitId !== 'all' && ra.propertyId !== selectedUnitId) continue;
                    balance -= shareFee;
                }
            } else {
                const ownerId = ra.ownerId ?? (raDateStr ? resolveOwnerForPropertyOnDate(state, ra.propertyId, raDateStr) : property.ownerId);
                if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
                if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                if (selectedUnitId !== 'all' && ra.propertyId !== selectedUnitId) return;
                balance -= fee;
            }
        });

        (state.bills || []).forEach(bill => {
            if (!bill.propertyId || bill.projectId) return;
            const billDate = new Date(bill.issueDate);
            if (billDate >= start) return;
            const property = state.properties.find(p => p.id === bill.propertyId);
            if (!property) return;
            const billDateStr = (bill.issueDate || '').slice(0, 10);
            const buildingId = property.buildingId;
            const amt = typeof bill.amount === 'number' ? bill.amount : parseFloat(String(bill.amount ?? 0));
            if (isNaN(amt) || amt <= 0) return;

            if (billDateStr && hasMultipleOwnersOnDate(state, String(bill.propertyId), billDateStr)) {
                const shares = getOwnershipSharesForPropertyOnDate(state, String(bill.propertyId), billDateStr);
                for (const s of shares) {
                    if (s.percentage <= 0) continue;
                    const shareAmt = Math.round(amt * s.percentage) / 100;
                    if (selectedOwnerId !== 'all' && s.ownerId !== selectedOwnerId) continue;
                    if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) continue;
                    if (selectedUnitId !== 'all' && bill.propertyId !== selectedUnitId) continue;
                    balance -= shareAmt;
                }
            } else {
                const ownerId = billDateStr ? resolveOwnerForPropertyOnDate(state, bill.propertyId, billDateStr) : property.ownerId;
                if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
                if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                if (selectedUnitId !== 'all' && bill.propertyId !== selectedUnitId) return;
                balance -= amt;
            }
        });

        return balance;
    }, [state, startDate, selectedBuildingId, selectedOwnerId, selectedUnitId]);

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

        const clearingAllocCat = state.categories.find(c => c.name === 'Owner Rental Allocation (Clearing)');
        const ownerShareCat = state.categories.find(c => c.name === 'Owner Rental Income Share');

        const txIdsWithShareLines = new Set<string>();
        if (ownerShareCat) {
            state.transactions.forEach(tx => {
                if (tx.categoryId === ownerShareCat.id && tx.invoiceId) txIdsWithShareLines.add(tx.invoiceId);
                if (tx.categoryId === ownerShareCat.id && tx.batchId) txIdsWithShareLines.add(tx.batchId);
            });
        }

        const pushIncomeItem = (
            tx: Transaction,
            amount: number,
            ownerIdForTx: string | undefined,
            rowId?: string,
            particularsSuffix = ''
        ) => {
            const property = state.properties.find(p => p.id === tx.propertyId);
            const owner = state.contacts.find(c => c.id === ownerIdForTx);
            const buildingId = tx.buildingId || property?.buildingId;

            if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
            if (selectedOwnerId !== 'all' && ownerIdForTx !== selectedOwnerId) return;
            if (selectedUnitId !== 'all' && tx.propertyId !== selectedUnitId) return;

            const id = rowId ?? tx.id;
            if (amount < 0) {
                items.push({
                    id, date: tx.date,
                    ownerName: owner?.name || 'Unknown',
                    propertyName: property?.name || 'Unknown',
                    particulars: `${tx.description || 'Service Charge Deduction'}${particularsSuffix}`,
                    rentIn: 0, paidOut: Math.abs(amount),
                    entityType: 'transaction' as const, entityId: tx.id,
                    ledgerOwnerId: ownerIdForTx,
                });
            } else {
                items.push({
                    id, date: tx.date,
                    ownerName: owner?.name || 'Unknown',
                    propertyName: property?.name || 'Unknown',
                    particulars: `${tx.description || 'Rent Collected'}${particularsSuffix}`,
                    rentIn: amount, paidOut: 0,
                    entityType: 'transaction' as const, entityId: tx.id,
                    ledgerOwnerId: ownerIdForTx,
                });
            }
        };

        // 1. Rental Income — with co-ownership awareness
        state.transactions.forEach(tx => {
            if (tx.type !== TransactionType.INCOME || !tx.propertyId) return;
            const date = new Date(tx.date);
            if (date < start || date > end) return;

            if (clearingAllocCat && tx.categoryId === clearingAllocCat.id) return;

            if (tx.categoryId === rentalIncomeCategory.id) {
                const txDate = (tx.date || '').slice(0, 10);
                const hasExplicitShares = (tx.invoiceId && txIdsWithShareLines.has(tx.invoiceId))
                    || (tx.batchId && txIdsWithShareLines.has(tx.batchId));
                if (hasExplicitShares) return;

                const rawAmt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (isNaN(rawAmt)) return;

                if (txDate && tx.propertyId && hasMultipleOwnersOnDate(state, String(tx.propertyId), txDate)) {
                    const shares = getOwnershipSharesForPropertyOnDate(state, tx.propertyId, txDate);
                    for (const s of shares) {
                        const pct = s.percentage;
                        if (pct <= 0) continue;
                        const shareAmt = Math.round(rawAmt * pct) / 100;
                        const shareLabel = shares.length > 1 ? ` (${pct.toFixed(0)}% share)` : '';
                        pushIncomeItem(tx, shareAmt, s.ownerId, `${tx.id}-inc-${s.ownerId}`, shareLabel);
                    }
                } else {
                    const ownerIdForTx = resolveOwnerForTransaction(state, tx) ?? state.properties.find(p => p.id === tx.propertyId)?.ownerId;
                    pushIncomeItem(tx, rawAmt, ownerIdForTx);
                }
                return;
            }

            if (ownerShareCat && tx.categoryId === ownerShareCat.id) {
                const rawAmt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (isNaN(rawAmt)) return;
                pushIncomeItem(tx, rawAmt, tx.contactId || tx.ownerId);
                return;
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
                        const isDirectOwnerPayout = !!(ownerPayoutCategory && tx.categoryId === ownerPayoutCategory.id);

                        if (propertyId) {
                            const property = state.properties.find(p => p.id === propertyId);
                            if (property) {
                                if (!isDirectOwnerPayout) {
                                    ownerId = resolveOwnerForTransaction(state, tx) ?? property.ownerId;
                                }
                                propertyName = property.name;
                                if (!buildingId) buildingId = property.buildingId;
                            }
                        }

                        const rawPaid =
                            typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                        if (isNaN(rawPaid)) return;

                        const txDate = (tx.date || '').slice(0, 10);
                        const baseParticulars = tx.description || 'Expense/Payout';

                        if (
                            !isDirectOwnerPayout &&
                            propertyId &&
                            txDate &&
                            hasMultipleOwnersOnDate(state, String(propertyId), txDate)
                        ) {
                            const shares = getOwnershipSharesForPropertyOnDate(state, String(propertyId), txDate);
                            for (const s of shares) {
                                if (s.percentage <= 0) continue;
                                const sharePaid = Math.round(rawPaid * s.percentage) / 100;
                                if (selectedOwnerId !== 'all' && s.ownerId !== selectedOwnerId) continue;
                                if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) continue;
                                if (selectedUnitId !== 'all' && propertyId !== selectedUnitId) continue;
                                const o = state.contacts.find(c => c.id === s.ownerId);
                                const shareLabel = shares.length > 1 ? ` (${s.percentage.toFixed(0)}% share)` : '';
                                items.push({
                                    id: `${tx.id}-exp-${s.ownerId}`,
                                    date: tx.date,
                                    ownerName: o?.name || 'Unknown',
                                    propertyName,
                                    particulars: `${baseParticulars}${shareLabel}`,
                                    rentIn: 0,
                                    paidOut: sharePaid,
                                    entityType: 'transaction' as const,
                                    entityId: tx.id,
                                    ledgerOwnerId: s.ownerId,
                                });
                            }
                        } else {
                            if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
                            if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                            if (selectedUnitId !== 'all' && propertyId !== selectedUnitId) return;

                            const owner = state.contacts.find(c => c.id === ownerId);

                            items.push({
                                id: tx.id,
                                date: tx.date,
                                ownerName: owner?.name || 'Unknown',
                                propertyName: propertyName,
                                particulars: baseParticulars,
                                rentIn: 0,
                                paidOut: rawPaid,
                                entityType: 'transaction' as const,
                                entityId: tx.id,
                                ledgerOwnerId: ownerId,
                            });
                        }
                    }
                }
            });

        // 3. Broker Fee Deductions from Rental Agreements (same approach as BrokerFeeReport)
        state.rentalAgreements.forEach(ra => {
            if (!ra.brokerId || !ra.brokerFee || ra.brokerFee <= 0) return;
            if (!ra.propertyId) return;

            const raDate = new Date(ra.startDate);
            if (raDate < start || raDate > end) return;

            const property = state.properties.find(p => p.id === ra.propertyId);
            if (!property) return;

            const raDateStr = (ra.startDate || '').slice(0, 10);
            const buildingId = property.buildingId;
            const brokerFeeAmount = typeof ra.brokerFee === 'string' ? parseFloat(ra.brokerFee) : Number(ra.brokerFee);
            if (isNaN(brokerFeeAmount)) return;

            const baseParticulars = `Broker Fee: ${property.name} (Agr #${ra.agreementNumber})`;

            if (raDateStr && hasMultipleOwnersOnDate(state, String(ra.propertyId), raDateStr)) {
                const shares = getOwnershipSharesForPropertyOnDate(state, String(ra.propertyId), raDateStr);
                for (const s of shares) {
                    if (s.percentage <= 0) continue;
                    const shareFee = Math.round(brokerFeeAmount * s.percentage) / 100;
                    if (selectedOwnerId !== 'all' && s.ownerId !== selectedOwnerId) continue;
                    if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) continue;
                    if (selectedUnitId !== 'all' && ra.propertyId !== selectedUnitId) continue;
                    const o = state.contacts.find(c => c.id === s.ownerId);
                    const shareLabel = shares.length > 1 ? ` (${s.percentage.toFixed(0)}% share)` : '';
                    items.push({
                        id: `broker-fee-${ra.id}-${s.ownerId}`,
                        date: ra.startDate,
                        ownerName: o?.name || 'Unknown',
                        propertyName: property.name,
                        particulars: `${baseParticulars}${shareLabel}`,
                        rentIn: 0,
                        paidOut: shareFee,
                        entityType: 'transaction' as const,
                        entityId: ra.id,
                        ledgerOwnerId: s.ownerId,
                    });
                }
            } else {
                const ownerId = ra.ownerId ?? (raDateStr ? resolveOwnerForPropertyOnDate(state, ra.propertyId, raDateStr) : property.ownerId);
                const ownerContact = state.contacts.find(c => c.id === ownerId);
                if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
                if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                if (selectedUnitId !== 'all' && ra.propertyId !== selectedUnitId) return;

                items.push({
                    id: `broker-fee-${ra.id}`,
                    date: ra.startDate,
                    ownerName: ownerContact?.name || 'Unknown',
                    propertyName: property.name,
                    particulars: baseParticulars,
                    rentIn: 0,
                    paidOut: brokerFeeAmount,
                    entityType: 'transaction' as const,
                    entityId: ra.id,
                    ledgerOwnerId: ownerId,
                });
            }
        });

        // 4. Bill deductions (cost center = owner property) — show even if bill not paid yet
        (state.bills || []).forEach(bill => {
            if (!bill.propertyId || bill.projectId) return;

            const billDate = new Date(bill.issueDate);
            if (billDate < start || billDate > end) return;

            const property = state.properties.find(p => p.id === bill.propertyId);
            if (!property) return;

            const billDateStr = (bill.issueDate || '').slice(0, 10);
            const buildingId = property.buildingId;
            const billAmount = typeof bill.amount === 'number' ? bill.amount : parseFloat(String(bill.amount ?? 0));
            if (isNaN(billAmount) || billAmount <= 0) return;

            const baseParticulars = `Bill: ${property.name} #${bill.billNumber || bill.id}`;

            if (billDateStr && hasMultipleOwnersOnDate(state, String(bill.propertyId), billDateStr)) {
                const shares = getOwnershipSharesForPropertyOnDate(state, String(bill.propertyId), billDateStr);
                for (const s of shares) {
                    if (s.percentage <= 0) continue;
                    const shareAmt = Math.round(billAmount * s.percentage) / 100;
                    if (selectedOwnerId !== 'all' && s.ownerId !== selectedOwnerId) continue;
                    if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) continue;
                    if (selectedUnitId !== 'all' && bill.propertyId !== selectedUnitId) continue;
                    const o = state.contacts.find(c => c.id === s.ownerId);
                    const shareLabel = shares.length > 1 ? ` (${s.percentage.toFixed(0)}% share)` : '';
                    items.push({
                        id: `bill-${bill.id}-${s.ownerId}`,
                        date: bill.issueDate,
                        ownerName: o?.name || 'Unknown',
                        propertyName: property.name,
                        particulars: `${baseParticulars}${shareLabel}`,
                        rentIn: 0,
                        paidOut: shareAmt,
                        entityType: 'transaction' as const,
                        entityId: bill.id,
                        ledgerOwnerId: s.ownerId,
                    });
                }
            } else {
                const ownerId = billDateStr ? resolveOwnerForPropertyOnDate(state, bill.propertyId, billDateStr) : property.ownerId;
                const ownerContact = state.contacts.find(c => c.id === ownerId);
                if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
                if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                if (selectedUnitId !== 'all' && bill.propertyId !== selectedUnitId) return;

                items.push({
                    id: `bill-${bill.id}`,
                    date: bill.issueDate,
                    ownerName: ownerContact?.name || 'Unknown',
                    propertyName: property.name,
                    particulars: baseParticulars,
                    rentIn: 0,
                    paidOut: billAmount,
                    entityType: 'transaction' as const,
                    entityId: bill.id,
                    ledgerOwnerId: ownerId,
                });
            }
        });

        // Display sort (user columns)
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

        const distinctLedgerOwners = new Set(items.map((i: { ledgerOwnerId?: string }) => i.ledgerOwnerId).filter(Boolean));
        const usePerOwnerRunningBalance = selectedOwnerId === 'all' && distinctLedgerOwners.size > 1;

        const balanceById: Record<string, number> = {};
        const sortedForBalance = [...items].sort((a, b) => {
            if (usePerOwnerRunningBalance) {
                const oa = (a as { ledgerOwnerId?: string }).ledgerOwnerId ?? '';
                const ob = (b as { ledgerOwnerId?: string }).ledgerOwnerId ?? '';
                if (oa !== ob) return oa.localeCompare(ob);
            }
            const da = new Date(a.date).getTime();
            const db = new Date(b.date).getTime();
            if (da !== db) return da - db;
            return String(a.id).localeCompare(String(b.id));
        });

        const perOwnerRun = new Map<string, number>();
        let globalRun = openingBalance;
        sortedForBalance.forEach((item: { id: string; ledgerOwnerId?: string; rentIn: number; paidOut: number }) => {
            if (usePerOwnerRunningBalance) {
                const oid = item.ledgerOwnerId ?? '';
                perOwnerRun.set(oid, (perOwnerRun.get(oid) ?? 0) + item.rentIn - item.paidOut);
                balanceById[item.id] = perOwnerRun.get(oid)!;
            } else {
                globalRun += item.rentIn - item.paidOut;
                balanceById[item.id] = globalRun;
            }
        });

        let rows = items.map((item) => ({ ...item, balance: balanceById[item.id] ?? 0 }));

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            rows = rows.filter(r =>
                r.ownerName.toLowerCase().includes(q) ||
                r.propertyName.toLowerCase().includes(q) ||
                r.particulars.toLowerCase().includes(q)
            );
        }

        return rows;
    }, [state, startDate, endDate, searchQuery, selectedBuildingId, selectedOwnerId, selectedUnitId, sortConfig, openingBalance]);

    /** Multiple owners visible with no owner filter — opening balance is not a single chain; hide aggregate opening row. */
    const perOwnerLedgerMode = useMemo(() => {
        if (selectedOwnerId !== 'all') return false;
        const ids = new Set(reportData.map((r) => r.ledgerOwnerId).filter(Boolean));
        return ids.size > 1;
    }, [reportData, selectedOwnerId]);

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

        const ownerContact = selectedOwnerId !== 'all' ? state.contacts.find(c => c.id === selectedOwnerId) : undefined;
        if (ownerContact) {
            sendOrOpenWhatsApp(
                { contact: ownerContact, message, phoneNumber: ownerContact.contactNo || undefined },
                () => state.whatsAppMode,
                openChat
            );
        } else {
            window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
        }
    };

    const activeFilters = useMemo(() => {
        const filters: { key: string; label: string; value: string; onClear: () => void }[] = [];
        if (selectedBuildingId !== 'all') {
            const building = state.buildings.find(b => b.id === selectedBuildingId);
            if (building) filters.push({ key: 'building', label: 'Building', value: building.name, onClear: () => setSelectedTreeId('all') });
        }
        if (selectedOwnerId !== 'all') {
            const owner = state.contacts.find(c => c.id === selectedOwnerId);
            if (owner) filters.push({ key: 'owner', label: 'Owner', value: owner.name, onClear: () => {
                if (selectedBuildingId !== 'all') {
                    setSelectedTreeId(`building:${selectedBuildingId}`);
                } else {
                    setSelectedTreeId('all');
                }
            }});
        }
        if (selectedUnitId !== 'all') {
            const unit = state.properties.find(p => p.id === selectedUnitId);
            if (unit) filters.push({ key: 'unit', label: 'Unit', value: unit.name, onClear: () => {
                if (selectedOwnerId !== 'all') {
                    setSelectedTreeId(`owner:${selectedOwnerId}`);
                } else if (selectedBuildingId !== 'all') {
                    setSelectedTreeId(`building:${selectedBuildingId}`);
                } else {
                    setSelectedTreeId('all');
                }
            }});
        }
        return filters;
    }, [selectedBuildingId, selectedOwnerId, selectedUnitId, state.buildings, state.contacts, state.properties]);

    const activeOwnerName = useMemo(() => {
        if (selectedOwnerId !== 'all') return state.contacts.find(c => c.id === selectedOwnerId)?.name || null;
        return null;
    }, [selectedOwnerId, state.contacts]);

    const activePropertyName = useMemo(() => {
        if (selectedUnitId !== 'all') return state.properties.find(p => p.id === selectedUnitId)?.name || null;
        return null;
    }, [selectedUnitId, state.properties]);

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

    /** Service Charge Update modal expects the positive Service Charge Income (credit) tx — report rows use the paired debit line. */
    const resolveServiceChargeCreditTx = useCallback((tx: Transaction | undefined): Transaction | null => {
        const svcIncomeCategory = state.categories.find(c => c.id === 'sys-cat-svc-inc' || c.name === 'Service Charge Income');
        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
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
        let pair = pairId ? state.transactions.find(t => t.id === pairId) : undefined;
        if (!pair) {
            pair = state.transactions.find(t =>
                t.id !== tx.id &&
                t.propertyId === tx.propertyId &&
                t.date === tx.date &&
                t.type === TransactionType.INCOME &&
                t.categoryId === svcIncomeCategory.id &&
                Math.abs((typeof t.amount === 'string' ? parseFloat(t.amount) : Number(t.amount)) + rawAmt) < 0.01
            );
        }
        return pair ?? null;
    }, [state.categories, state.transactions]);

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

                {/* Right: Report area */}
                <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
                        <Card className="min-h-full border-0 rounded-none shadow-none">
                            <ReportHeader />

                            {/* Report header row: title + actions + date pills */}
                            <div className="px-6 pt-4 pb-3 no-print">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-2xl font-bold text-app-text">Owner Rental Income</h3>
                                        <p className="text-sm text-app-muted mt-0.5">Detailed view of rental income and owner distributions</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
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
                                            onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
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

                            {/* Print-only header */}
                            <div className="hidden print:block text-center mb-4 px-6">
                                <h3 className="text-2xl font-bold text-app-text">Owner Rental Income</h3>
                                <p className="text-sm text-app-muted mt-1">
                                    {formatDate(startDate)} - {formatDate(endDate)}
                                </p>
                                {(selectedBuildingId !== 'all' || selectedOwnerId !== 'all' || selectedUnitId !== 'all') && (
                                    <p className="text-xs text-app-muted mt-1">
                                        {selectedBuildingId !== 'all' && `Building: ${state.buildings.find(b => b.id === selectedBuildingId)?.name}  `}
                                        {selectedOwnerId !== 'all' && `Owner: ${state.contacts.find(c => c.id === selectedOwnerId)?.name}  `}
                                        {selectedUnitId !== 'all' && `Unit: ${state.properties.find(p => p.id === selectedUnitId)?.name}`}
                                    </p>
                                )}
                            </div>

                            {/* Active filter pills */}
                            {activeFilters.length > 0 && (
                                <div className="px-6 pb-3 no-print">
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

                            {/* Data table */}
                            <div className="px-6 pb-4 overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead>
                                        <tr className="border-b-2 border-app-border">
                                            <th onClick={() => handleSort('date')} className="px-3 py-2.5 text-left text-xs font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none whitespace-nowrap">Date <SortIcon column="date" /></th>
                                            <th onClick={() => handleSort('ownerName')} className="px-3 py-2.5 text-left text-xs font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none">Owner <SortIcon column="ownerName" /></th>
                                            <th onClick={() => handleSort('propertyName')} className="px-3 py-2.5 text-left text-xs font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none">Property <SortIcon column="propertyName" /></th>
                                            <th onClick={() => handleSort('particulars')} className="px-3 py-2.5 text-left text-xs font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none">Particulars <SortIcon column="particulars" /></th>
                                            <th onClick={() => handleSort('rentIn')} className="px-3 py-2.5 text-right text-xs font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none">Rent In <SortIcon column="rentIn" /></th>
                                            <th onClick={() => handleSort('paidOut')} className="px-3 py-2.5 text-right text-xs font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none">Paid Out <SortIcon column="paidOut" /></th>
                                            <th onClick={() => handleSort('balance')} className="px-3 py-2.5 text-right text-xs font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:text-app-text select-none">Balance <SortIcon column="balance" /></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-app-border/50">
                                        {/* Opening Balance row */}
                                        {openingBalance !== 0 && !perOwnerLedgerMode && (
                                            <tr className="bg-app-toolbar/20">
                                                <td className="px-3 py-2.5 whitespace-nowrap text-app-text">{formatDate(startDate)}</td>
                                                <td className="px-3 py-2.5 text-app-muted">{activeOwnerName || '-'}</td>
                                                <td className="px-3 py-2.5 text-app-muted">{activePropertyName || '-'}</td>
                                                <td className="px-3 py-2.5 text-app-muted font-medium">Opening Balance</td>
                                                <td className="px-3 py-2.5 text-right text-app-muted">-</td>
                                                <td className="px-3 py-2.5 text-right text-app-muted">-</td>
                                                <td className="px-3 py-2.5 text-right font-bold text-app-text whitespace-nowrap">{formatCurrency(openingBalance)}</td>
                                            </tr>
                                        )}

                                        {reportData.map((item) => {
                                            const transaction = state.transactions.find(t => t.id === item.entityId);
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
                                                    <td className="px-3 py-2.5 whitespace-nowrap text-app-text">{formatDate(item.date)}</td>
                                                    <td className="px-3 py-2.5 whitespace-normal break-words text-app-text max-w-[150px]">{item.ownerName}</td>
                                                    <td className="px-3 py-2.5 whitespace-normal break-words text-primary max-w-[150px]">{item.propertyName}</td>
                                                    <td className="px-3 py-2.5 whitespace-normal break-words text-app-muted max-w-xs" title={item.particulars}>{item.particulars}</td>
                                                    <td className="px-3 py-2.5 text-right text-success whitespace-nowrap">{item.rentIn > 0 ? formatCurrency(item.rentIn) : '-'}</td>
                                                    <td className="px-3 py-2.5 text-right text-danger whitespace-nowrap">{item.paidOut > 0 ? formatCurrency(item.paidOut) : '-'}</td>
                                                    <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${item.balance >= 0 ? 'text-app-text' : 'text-danger'}`}>{formatCurrency(item.balance)}</td>
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
                                        <tr className="border-t-2 border-app-border bg-app-toolbar/30">
                                            <td colSpan={4} className="px-3 py-2.5 text-right text-sm font-bold text-app-text uppercase tracking-wide">Totals (Period)</td>
                                            <td className="px-3 py-2.5 text-right text-sm font-bold text-success whitespace-nowrap">{formatCurrency(totals.totalIn)}</td>
                                            <td className="px-3 py-2.5 text-right text-sm font-bold text-danger whitespace-nowrap">{formatCurrency(totals.totalOut)}</td>
                                            <td className={`px-3 py-2.5 text-right text-sm font-bold whitespace-nowrap ${totals.netBalance >= 0 ? 'text-app-text' : 'text-danger'}`}>
                                                {formatCurrency(totals.netBalance)}
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

            {serviceChargeEditTransaction && (
                <ServiceChargeUpdateModal
                    isOpen={!!serviceChargeEditTransaction}
                    onClose={() => setServiceChargeEditTransaction(null)}
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
        </div >
    );
};

export default OwnerPayoutsReport;
