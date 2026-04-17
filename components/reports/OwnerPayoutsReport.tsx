
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
import { sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';

type DateRangeOption = 'today' | 'thisMonth' | 'lastMonth' | 'custom';

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
    const { openChat } = useWhatsApp();
    const now = new Date();
    const [dateRange, setDateRange] = useState<DateRangeOption>('thisMonth');
    const [startDate, setStartDate] = useState(() => toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)));
    const [endDate, setEndDate] = useState(() => toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
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
            label: 'All Properties',
            type: 'all'
        };

        const buildingNodes: TreeNode[] = state.buildings
            .filter(b => matchesTreeSearch(b.name))
            .map(building => {
                const propsInBuilding = state.properties.filter(p => p.buildingId === building.id);
                const ownerIds = [...new Set(propsInBuilding.map(p => p.ownerId).filter(Boolean))];

                if (ownerIds.length <= 1) {
                    const unitChildren: TreeNode[] = propsInBuilding
                        .filter(p => matchesTreeSearch(p.name))
                        .map(prop => ({ id: `unit:${prop.id}`, label: prop.name, type: 'unit' as const }));
                    unitChildren.sort((a, b) => a.label.localeCompare(b.label));
                    return {
                        id: `building:${building.id}`,
                        label: building.name,
                        type: 'building',
                        children: unitChildren.length ? unitChildren : undefined
                    };
                }

                const ownerChildren: TreeNode[] = ownerIds
                    .map(ownerId => {
                        const owner = ownerContacts.find(c => c.id === ownerId);
                        if (!owner || !matchesTreeSearch(owner.name)) return null;
                        const unitChildren: TreeNode[] = propsInBuilding
                            .filter(p => p.ownerId === ownerId && matchesTreeSearch(p.name))
                            .map(prop => ({ id: `unit:${prop.id}`, label: prop.name, type: 'unit' as const }));
                        unitChildren.sort((a, b) => a.label.localeCompare(b.label));
                        return {
                            id: `owner:${owner.id}`,
                            label: owner.name,
                            type: 'owner',
                            children: unitChildren.length ? unitChildren : undefined
                        } as TreeNode;
                    })
                    .filter((n): n is TreeNode => n !== null && (!!n.children?.length || matchesTreeSearch(n.label)));
                ownerChildren.sort((a, b) => a.label.localeCompare(b.label));

                return {
                    id: `building:${building.id}`,
                    label: building.name,
                    type: 'building',
                    children: ownerChildren.length ? ownerChildren : undefined
                };
            })
            .filter(n => n.children?.length || matchesTreeSearch(n.label));
        buildingNodes.sort((a, b) => a.label.localeCompare(b.label));

        return [allNode, ...buildingNodes];
    }, [state.buildings, state.properties, ownerContacts, matchesTreeSearch]);

    const handleRangeChange = (option: DateRangeOption) => {
        setDateRange(option);
        const n = new Date();

        if (option === 'today') {
            const today = toLocalDateString(n);
            setStartDate(today);
            setEndDate(today);
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

        let balance = 0;

        state.transactions.forEach(tx => {
            const date = new Date(tx.date);
            if (date >= start) return;

            if (tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory.id && tx.propertyId) {
                const property = state.properties.find(p => p.id === tx.propertyId);
                const ownerIdForTx = tx.ownerId ?? property?.ownerId;
                const buildingId = tx.buildingId || property?.buildingId;
                if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                if (selectedOwnerId !== 'all' && ownerIdForTx !== selectedOwnerId) return;
                if (selectedUnitId !== 'all' && tx.propertyId !== selectedUnitId) return;

                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (!isNaN(amount)) balance += amount;
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
                    let ownerId = tx.contactId;
                    if (propertyId) {
                        const property = state.properties.find(p => p.id === propertyId);
                        if (property) {
                            ownerId = tx.ownerId ?? property.ownerId;
                            if (!buildingId) buildingId = property.buildingId;
                        }
                    }
                    if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
                    if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                    if (selectedUnitId !== 'all' && propertyId !== selectedUnitId) return;

                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount)) balance -= amount;
                }
            }
        });

        state.rentalAgreements.forEach(ra => {
            if (!ra.brokerId || !ra.brokerFee || ra.brokerFee <= 0 || !ra.propertyId) return;
            const raDate = new Date(ra.startDate);
            if (raDate >= start) return;
            const property = state.properties.find(p => p.id === ra.propertyId);
            if (!property) return;
            const ownerId = property.ownerId;
            const buildingId = property.buildingId;
            if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
            if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
            if (selectedUnitId !== 'all' && ra.propertyId !== selectedUnitId) return;
            const fee = typeof ra.brokerFee === 'string' ? parseFloat(ra.brokerFee) : Number(ra.brokerFee);
            if (!isNaN(fee)) balance -= fee;
        });

        (state.bills || []).forEach(bill => {
            if (!bill.propertyId || bill.projectId) return;
            const billDate = new Date(bill.issueDate);
            if (billDate >= start) return;
            const property = state.properties.find(p => p.id === bill.propertyId);
            if (!property) return;
            const ownerId = property.ownerId;
            const buildingId = property.buildingId;
            if (selectedOwnerId !== 'all' && ownerId !== selectedOwnerId) return;
            if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
            if (selectedUnitId !== 'all' && bill.propertyId !== selectedUnitId) return;
            const amt = typeof bill.amount === 'number' ? bill.amount : parseFloat(String(bill.amount ?? 0));
            if (!isNaN(amt) && amt > 0) balance -= amt;
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

        let runningBalance = openingBalance;
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
    }, [state, startDate, endDate, searchQuery, selectedBuildingId, selectedOwnerId, selectedUnitId, sortConfig, openingBalance]);

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
        if (openingBalance !== 0) {
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
        if (openingBalance !== 0) {
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
                    <div className="p-1.5 border-b border-app-border">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none text-app-muted">
                                <span className="h-3.5 w-3.5">{ICONS.search}</span>
                            </div>
                            <Input
                                placeholder="Search..."
                                value={treeSearchQuery}
                                onChange={(e) => setTreeSearchQuery(e.target.value)}
                                className="ds-input-field pl-7 py-1 text-xs"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-1.5">
                        <TreeView
                            treeData={treeData}
                            selectedId={selectedTreeId}
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
                                        {(['today', 'thisMonth', 'lastMonth', 'custom'] as DateRangeOption[]).map(opt => (
                                            <button
                                                type="button"
                                                key={opt}
                                                onClick={() => handleRangeChange(opt)}
                                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${dateRange === opt
                                                    ? 'bg-app-card text-primary shadow-sm font-bold border border-primary/25'
                                                    : 'text-app-muted hover:text-app-text hover:bg-app-toolbar/80'
                                                    }`}
                                            >
                                                {opt === 'today' ? 'Today' : opt === 'thisMonth' ? 'This Month' : opt === 'lastMonth' ? 'Last Month' : (
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
                                        {openingBalance !== 0 && (
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
                                            return (
                                                <tr
                                                    key={item.id}
                                                    className="hover:bg-app-toolbar/30 cursor-pointer transition-colors"
                                                    onClick={() => transaction && setTransactionToEdit(transaction)}
                                                    title="Click to edit"
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
