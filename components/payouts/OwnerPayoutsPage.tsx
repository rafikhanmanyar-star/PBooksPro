
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, TransactionType, Transaction, Contact } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatCurrency } from '../../utils/numberUtils';
import OwnerPayoutModal from './OwnerPayoutModal';
import PayoutTreePanel, {
    PayoutTreeNode,
    filterPayoutTreeNodes,
    sortPayoutTreeNodes,
} from './PayoutTreePanel';
import OwnerLedger from './OwnerLedger';
import BrokerLedger from './BrokerLedger';
import BrokerPayoutModal from './BrokerPayoutModal';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import ReceiveFromOwnerModal from '../rentalManagement/ReceiveFromOwnerModal';
import Modal from '../ui/Modal';
import TransactionForm from '../transactions/TransactionForm';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { useNotification } from '../../context/NotificationContext';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import useLocalStorage from '../../hooks/useLocalStorage';
import { getPropertyIdsForOwner, hasMultipleOwnersOnDate } from '../../services/propertyOwnershipService';

// --- Types ---

type PayoutCategory = 'all' | 'ownerIncome' | 'brokerCommission' | 'securityDeposit';

interface PayeeRow {
    id: string;
    name: string;
    type: 'Owner' | 'Broker';
    category: 'ownerIncome' | 'brokerCommission' | 'securityDeposit';
    categoryLabel: string;
    collected: number;   // For owners: rent collected / security collected. For brokers: total earned
    paid: number;        // For owners: payouts + expenses. For brokers: paid commissions
    balance: number;     // collected - paid (positive = due to payee)
    contact: Contact;
    properties?: string; // comma-separated property names for display
}

type SortKey = 'name' | 'category' | 'collected' | 'paid' | 'balance';

// --- Component ---

const OwnerPayoutsPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { openChat } = useWhatsApp();
    const { showToast } = useNotification();

    // UI state
    const [activeCategory, setActiveCategory] = useState<PayoutCategory>('ownerIncome');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
    const [selectedUnitId, setSelectedUnitId] = useState<string>('all');
    const [selectedBrokerId, setSelectedBrokerId] = useState<string>('all');
    const [treeSortConfig, setTreeSortConfig] = useState<{ key: 'name' | 'amount'; direction: 'asc' | 'desc' }>({
        key: 'amount',
        direction: 'desc',
    });
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('owner_payouts_tree_sidebar', 340);
    const [isTreeResizing, setIsTreeResizing] = useState(false);
    const payoutSplitContainerRef = useRef<HTMLDivElement>(null);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'balance', direction: 'desc' });
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

    // Modal state
    const [ownerPayoutModal, setOwnerPayoutModal] = useState<{
        isOpen: boolean;
        owner: Contact | null;
        balanceDue: number;
        payoutType: 'Rent' | 'Security';
        buildingId?: string;
        transactionToEdit?: Transaction;
    }>({ isOpen: false, owner: null, balanceDue: 0, payoutType: 'Rent' });

    const [brokerPayoutModal, setBrokerPayoutModal] = useState<{
        isOpen: boolean;
        broker: Contact | null;
        balanceDue: number;
    }>({ isOpen: false, broker: null, balanceDue: 0 });

    const [receiveOwner, setReceiveOwner] = useState<{
        ownerId: string;
        ownerName: string;
        amount: number;
    } | null>(null);

    const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
    const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'delete' | 'update' | null }>({
        isOpen: false,
        transaction: null,
        action: null
    });

    // Reset expanded row when category changes
    useEffect(() => {
        setExpandedRowId(null);
    }, [activeCategory]);

    // Cascade: when building changes, reset owner and unit
    useEffect(() => {
        setSelectedOwnerId('all');
        setSelectedUnitId('all');
    }, [selectedBuildingId]);

    // Cascade: when owner changes, reset unit
    useEffect(() => {
        setSelectedUnitId('all');
    }, [selectedOwnerId]);

    useEffect(() => {
        if (activeCategory !== 'brokerCommission') setSelectedBrokerId('all');
    }, [activeCategory]);

    // Owner options: after building selection (owners with properties in that building, or all owners with properties)
    const ownerFilterOptions = useMemo(() => {
        const owners = state.contacts.filter(c => c.type === ContactType.OWNER);
        const b = selectedBuildingId === 'all' ? undefined : selectedBuildingId;
        return owners.filter((o) => getPropertyIdsForOwner(state, o.id, b).size > 0);
    }, [state.contacts, state.properties, state.propertyOwnership, selectedBuildingId]);

    // Unit options: after owner selection (properties of that owner, optionally in selected building)
    const unitFilterOptions = useMemo(() => {
        if (selectedOwnerId === 'all') return [];
        const b = selectedBuildingId === 'all' ? undefined : selectedBuildingId;
        const keys = getPropertyIdsForOwner(state, selectedOwnerId, b);
        return state.properties.filter((p) => keys.has(String(p.id)));
    }, [state.properties, state.propertyOwnership, selectedOwnerId, selectedBuildingId]);

    // Property scope for filters: when building/owner/unit selected, balances and summary show only that scope.
    // Use string ids so comparisons with rentalAgreement.propertyId (may be string or number) always match.
    const propertyIdsInScope = useMemo(() => {
        if (selectedUnitId !== 'all') return new Set<string>([String(selectedUnitId)]);
        const b = selectedBuildingId === 'all' ? undefined : selectedBuildingId;
        if (selectedOwnerId !== 'all') {
            return getPropertyIdsForOwner(state, selectedOwnerId, b);
        }
        return new Set(
            state.properties.filter((p) => (b ? p.buildingId === b : true)).map((p) => String(p.id))
        );
    }, [selectedBuildingId, selectedOwnerId, selectedUnitId, state.properties, state.propertyOwnership]);

    // --- Owner Rental Income Balances ---
    // Aligned with Owner Ledger / Owner Income report: broker fee is deducted from owner balance.
    // Scoped by selected building/owner/unit so summary cards show correct totals when a filter is selected.
    const ownerRentalBalances = useMemo(() => {
        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        if (!rentalIncomeCategory) return [];

        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
        const ownerSvcPayCategory = state.categories.find(c => c.name === 'Owner Service Charge Payment');
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const ownerShareCat = state.categories.find(c => c.name === 'Owner Rental Income Share');
        const clearingRentCat = state.categories.find(c => c.name === 'Owner Rental Allocation (Clearing)');

        // Only owners that have at least one property in scope (use string id for consistency)
        const ownersInScope = new Set<string>();
        propertyIdsInScope.forEach(pid => {
            const prop = state.properties.find(p => String(p.id) === pid);
            if (prop?.ownerId) ownersInScope.add(prop.ownerId);
            (state.propertyOwnership || [])
                .filter((r) => r.propertyId === pid)
                .forEach((r) => ownersInScope.add(r.ownerId));
        });

        // Exclude broker fee payment transactions from expenses (broker fee is deducted from agreements below)
        const brokerFeeTxIds = new Set<string>();
        if (brokerFeeCategory) {
            state.transactions.forEach(tx => {
                if (tx.type === TransactionType.EXPENSE && tx.categoryId === brokerFeeCategory.id) {
                    brokerFeeTxIds.add(tx.id);
                }
            });
        }
        // Exclude bill payment transactions where bill cost center is owner (bill amount is deducted from bills below)
        const ownerBillIds = new Set(state.bills.filter(b => b.propertyId && !b.projectId).map(b => b.id));
        const billPaymentTxIds = new Set<string>();
        state.transactions.forEach(tx => {
            if (tx.type === TransactionType.EXPENSE && tx.billId && ownerBillIds.has(tx.billId)) {
                billPaymentTxIds.add(tx.id);
            }
        });

        const ownerData: Record<string, { collected: number; paid: number }> = {};
        ownersInScope.forEach(ownerId => {
            ownerData[ownerId] = { collected: 0, paid: 0 };
        });

        // Rental Income — gross (single-owner) + per-owner share lines (multi-owner). Only in-scope properties.
        state.transactions
            .filter((tx) => {
                if (tx.type !== TransactionType.INCOME || !tx.propertyId || !propertyIdsInScope.has(String(tx.propertyId)))
                    return false;
                if (clearingRentCat && tx.categoryId === clearingRentCat.id) return false;
                if (tx.categoryId === rentalIncomeCategory.id) {
                    const d = (tx.date || '').slice(0, 10);
                    if (d && hasMultipleOwnersOnDate(state, String(tx.propertyId), d)) return false;
                    return true;
                }
                if (ownerShareCat && tx.categoryId === ownerShareCat.id && tx.contactId) return true;
                return false;
            })
            .forEach((tx) => {
                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (isNaN(amount)) return;

                if (ownerShareCat && tx.categoryId === ownerShareCat.id && tx.contactId) {
                    const oid = tx.contactId;
                    if (oid && ownerData[oid]) {
                        if (amount > 0) ownerData[oid].collected += amount;
                    }
                    return;
                }

                const ownerIdForTx = tx.ownerId ?? state.properties.find((p) => p.id === tx.propertyId)?.ownerId;
                if (ownerIdForTx && ownerData[ownerIdForTx]) {
                    if (amount > 0) ownerData[ownerIdForTx].collected += amount;
                    else ownerData[ownerIdForTx].paid += Math.abs(amount);
                }
            });

        // Owner Service Charge Payments — only for owners in scope
        if (ownerSvcPayCategory) {
            state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === ownerSvcPayCategory.id && tx.contactId && ownersInScope.has(tx.contactId))
                .forEach(tx => {
                    if (tx.contactId && ownerData[tx.contactId]) {
                        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                        if (!isNaN(amount) && amount > 0) ownerData[tx.contactId].collected += amount;
                    }
                });
        }

        // Expenses (excluding Broker Fee and owner bill payments). Only in-scope properties or Owner Payout to in-scope owner.
        state.transactions.filter(tx => tx.type === TransactionType.EXPENSE).forEach(tx => {
            if (brokerFeeTxIds.has(tx.id)) return;
            if (billPaymentTxIds.has(tx.id)) return;

            let isOwnerPayout = false;

            if (tx.categoryId === ownerPayoutCategory?.id) {
                isOwnerPayout = true;
                if (tx.contactId && ownerData[tx.contactId]) {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount) && amount > 0) ownerData[tx.contactId].paid += amount;
                }
            }

            if (!isOwnerPayout && tx.propertyId && propertyIdsInScope.has(String(tx.propertyId))) {
                const category = state.categories.find(c => c.id === tx.categoryId);
                const catName = category?.name || '';
                if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout' || catName.includes('(Tenant)')) return;

                const ownerIdForTx = tx.ownerId ?? state.properties.find(p => p.id === tx.propertyId)?.ownerId;
                if (ownerIdForTx && ownerData[ownerIdForTx]) {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount) && amount > 0) ownerData[ownerIdForTx].paid += amount;
                }
            }
        });

        // Broker fee from rental agreements — always deducted from owner balance (same as Owner Rental Income report). Only in-scope properties.
        // Exclude renewed agreements (previousAgreementId set) so broker fee is charged only once per tenant/property, not again on renewal.
        state.rentalAgreements.forEach(ra => {
            if (ra.previousAgreementId) return;
            const fee = typeof ra.brokerFee === 'number' ? ra.brokerFee : parseFloat(String(ra.brokerFee ?? 0));
            if (!ra.brokerId || (fee <= 0 || isNaN(fee))) return;
            const propId = ra.propertyId ?? (ra as any).property_id;
            if (!propId || !propertyIdsInScope.has(String(propId))) return;

            const property = state.properties.find(p => String(p.id) === String(propId));
            if (!property?.ownerId || !ownerData[property.ownerId]) return;

            ownerData[property.ownerId].paid += fee;
        });

        // Bills with cost center = owner — only in-scope properties
        state.bills.forEach(bill => {
            if (!bill.propertyId || bill.projectId || !propertyIdsInScope.has(String(bill.propertyId))) return;
            const property = state.properties.find(p => p.id === bill.propertyId);
            if (!property?.ownerId || !ownerData[property.ownerId]) return;
            const amount = typeof bill.amount === 'number' ? bill.amount : parseFloat(String(bill.amount ?? 0));
            if (!isNaN(amount) && amount > 0) ownerData[property.ownerId].paid += amount;
        });

        return Object.entries(ownerData)
            .map(([ownerId, data]) => ({ ownerId, ...data, balance: data.collected - data.paid }))
            .filter(item => Math.abs(item.balance) > 0.01 || item.collected > 0 || item.paid > 0);
    }, [state.transactions, state.categories, state.properties, state.contacts, state.rentalAgreements, state.bills, propertyIdsInScope]);

    // --- Owner Security Deposit Balances ---
    // Aligned with Owner Security Deposit report. Scoped by selected building/owner/unit.
    const ownerSecurityBalances = useMemo(() => {
        const secDepCategory = state.categories.find(c => c.name === 'Security Deposit');
        const secRefCategory = state.categories.find(c => c.name === 'Security Deposit Refund');
        const ownerSecPayoutCategory = state.categories.find(c => c.name === 'Owner Security Payout');
        if (!secDepCategory) return [];

        const ownersInScope = new Set<string>();
        propertyIdsInScope.forEach(pid => {
            const prop = state.properties.find(p => String(p.id) === pid);
            if (prop?.ownerId) ownersInScope.add(prop.ownerId);
        });

        const ownerData: Record<string, { collected: number; paid: number }> = {};
        ownersInScope.forEach(ownerId => {
            ownerData[ownerId] = { collected: 0, paid: 0 };
        });

        // Security Deposit Income — only in-scope properties
        state.transactions.filter(tx =>
            tx.type === TransactionType.INCOME &&
            tx.categoryId === secDepCategory.id &&
            tx.propertyId && propertyIdsInScope.has(String(tx.propertyId))
        ).forEach(tx => {
            const property = state.properties.find(p => p.id === tx.propertyId);
            if (property?.ownerId && ownerData[property.ownerId]) {
                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (!isNaN(amount) && amount > 0) ownerData[property.ownerId].collected += amount;
            }
        });

        // Security Outflows — aligned with Owner Security Deposit report: Refund, Owner Security Payout, tenant deductions. Only in-scope.
        state.transactions.filter(tx => tx.type === TransactionType.EXPENSE).forEach(tx => {
            let ownerId = '';
            const category = state.categories.find(c => c.id === tx.categoryId);
            const catName = category?.name || '';

            if (tx.contactId && ownerData[tx.contactId] && ownerSecPayoutCategory && tx.categoryId === ownerSecPayoutCategory.id) {
                ownerId = tx.contactId;
            } else if (tx.propertyId && propertyIdsInScope.has(String(tx.propertyId))) {
                const property = state.properties.find(p => p.id === tx.propertyId);
                if (property) ownerId = property.ownerId;
            }

            const isRefund = secRefCategory && tx.categoryId === secRefCategory.id;
            const isOwnerSecPayout = ownerSecPayoutCategory && tx.categoryId === ownerSecPayoutCategory.id;
            const contact = tx.contactId ? state.contacts.find(c => c.id === tx.contactId) : null;
            const isTenantDeduction = contact?.type === ContactType.TENANT || catName.includes('(Tenant)');

            if (ownerId && ownerData[ownerId] && (isRefund || isOwnerSecPayout || (isTenantDeduction && tx.propertyId))) {
                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (!isNaN(amount) && amount > 0) ownerData[ownerId].paid += amount;
            }
        });

        return Object.entries(ownerData)
            .map(([ownerId, data]) => ({ ownerId, ...data, balance: data.collected - data.paid }))
            .filter(item => Math.abs(item.balance) > 0.01 || item.collected > 0 || item.paid > 0);
    }, [state.transactions, state.categories, state.properties, state.contacts, propertyIdsInScope]);

    // --- Broker Commission Balances ---
    // Scoped by selected building/owner/unit so summary shows correct broker total when a filter is selected.
    const brokerCommissionBalances = useMemo(() => {
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const rebateCategory = state.categories.find(c => c.name === 'Rebate Amount');
        const relevantCategoryIds = [brokerFeeCategory?.id, rebateCategory?.id].filter(Boolean) as string[];

        const brokerData: Record<string, { earned: number; paid: number }> = {};

        // From Rental Agreements — only in-scope properties. Exclude renewed agreements so broker is not charged again on renewal.
        state.rentalAgreements.forEach(ra => {
            if (ra.previousAgreementId) return;
            const propId = ra.propertyId ?? (ra as any).property_id;
            if (!propId || !propertyIdsInScope.has(String(propId))) return;
            const fee = typeof ra.brokerFee === 'number' ? ra.brokerFee : parseFloat(String(ra.brokerFee ?? 0));
            if (ra.brokerId && !isNaN(fee) && fee > 0) {
                if (!brokerData[ra.brokerId]) brokerData[ra.brokerId] = { earned: 0, paid: 0 };
                brokerData[ra.brokerId].earned += fee;
            }
        });

        // Payments — only count payments for in-scope properties (same filter as earned), so balance matches filtered view.
        state.transactions
            .filter(tx =>
                tx.type === TransactionType.EXPENSE &&
                tx.contactId &&
                tx.categoryId && relevantCategoryIds.includes(tx.categoryId) &&
                !tx.projectId // Only rental context
            )
            .filter(tx => {
                const category = state.categories.find(c => c.id === tx.categoryId);
                return category?.name !== 'Rebate Amount';
            })
            .filter(tx => {
                // Only count payment if it's for an in-scope property. Broker payouts set tx.propertyId; legacy payments without it count only when no filter.
                if (tx.propertyId) return propertyIdsInScope.has(String(tx.propertyId));
                return selectedUnitId === 'all' && selectedBuildingId === 'all';
            })
            .forEach(tx => {
                if (tx.contactId && brokerData[tx.contactId]) {
                    const amount = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount ?? 0));
                    if (!isNaN(amount)) brokerData[tx.contactId].paid += amount;
                }
            });

        return Object.entries(brokerData)
            .map(([brokerId, data]) => ({ brokerId, ...data, balance: data.earned - data.paid }))
            .filter(item => Math.abs(item.balance) > 0.01 || item.earned > 0 || item.paid > 0);
    }, [state.rentalAgreements, state.transactions, state.contacts, state.categories, propertyIdsInScope, selectedUnitId, selectedBuildingId]);

    // --- Per-property balance breakdown (for payout modal: which property amounts to pay) ---
    // Aligned with ownerRentalBalances: Rental Income + Owner Service Charge, expenses (excl. Broker Fee tx and bill payments), broker fee from agreements, bills from state.
    const ownerPropertyBreakdown = useMemo(() => {
        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const ownerSvcPayCategory = state.categories.find(c => c.name === 'Owner Service Charge Payment');
        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const secDepCategory = state.categories.find(c => c.name === 'Security Deposit');
        const secRefCategory = state.categories.find(c => c.name === 'Security Deposit Refund');
        const ownerSecPayoutCategory = state.categories.find(c => c.name === 'Owner Security Payout');
        const result: Record<string, { rent: PropertyBalanceItem[]; security: PropertyBalanceItem[] }> = {};

        // Broker Fee expense tx ids — we count broker fee from agreements only, not from expense transactions (avoid double count)
        const brokerFeeTxIds = new Set<string>();
        if (brokerFeeCategory) {
            state.transactions.forEach(tx => {
                if (tx.type === TransactionType.EXPENSE && tx.categoryId === brokerFeeCategory.id) brokerFeeTxIds.add(tx.id);
            });
        }
        // Bill payment tx ids — we count bill amount from state.bills only, not from expense transactions (avoid double count)
        const ownerBillIds = new Set(state.bills.filter(b => b.propertyId && !b.projectId).map(b => b.id));
        const billPaymentTxIds = new Set<string>();
        state.transactions.forEach(tx => {
            if (tx.type === TransactionType.EXPENSE && tx.billId && ownerBillIds.has(tx.billId)) billPaymentTxIds.add(tx.id);
        });

        state.properties.forEach(prop => {
            if (!prop.ownerId) return;
            if (!result[prop.ownerId]) result[prop.ownerId] = { rent: [], security: [] };
            const propIdStr = String(prop.id);

            if (rentalIncomeCategory) {
                let collected = 0;
                let paid = 0;
                // Rental Income — same rule as main balance: attribute by property, use tx.ownerId when set
                state.transactions
                    .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory.id && String(tx.propertyId) === propIdStr)
                    .forEach(tx => {
                        const ownerIdForTx = tx.ownerId ?? prop.ownerId;
                        if (ownerIdForTx !== prop.ownerId) return;
                        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                        if (isNaN(amount)) return;
                        if (amount > 0) collected += amount;
                        else paid += Math.abs(amount);
                    });
                // Owner Service Charge Payment — when tx has propertyId, add to that property; when no propertyId, add to first property of owner
                if (ownerSvcPayCategory) {
                    const isFirstPropertyForOwner = result[prop.ownerId].rent.length === 0;
                    let unallocatedSvc = 0;
                    state.transactions
                        .filter(tx =>
                            tx.type === TransactionType.INCOME &&
                            tx.categoryId === ownerSvcPayCategory.id &&
                            tx.contactId === prop.ownerId
                        )
                        .forEach(tx => {
                            const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                            if (isNaN(amount) || amount <= 0) return;
                            if (tx.propertyId != null && String(tx.propertyId) === propIdStr) {
                                collected += amount;
                            } else if (!tx.propertyId) {
                                unallocatedSvc += amount;
                            }
                        });
                    if (isFirstPropertyForOwner && unallocatedSvc > 0) collected += unallocatedSvc;
                }
                // Expenses: exclude Broker Fee tx (counted from agreements) and bill payments (counted from state.bills)
                state.transactions
                    .filter(tx => tx.type === TransactionType.EXPENSE && String(tx.propertyId) === propIdStr && !brokerFeeTxIds.has(tx.id) && !billPaymentTxIds.has(tx.id))
                    .forEach(tx => {
                        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                        if (isNaN(amount) || amount <= 0) return;
                        if (tx.categoryId === ownerPayoutCategory?.id) {
                            paid += amount;
                            return;
                        }
                        const category = state.categories.find(c => c.id === tx.categoryId);
                        const catName = category?.name || '';
                        if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout' || catName.includes('(Tenant)')) return;
                        paid += amount;
                    });
                state.rentalAgreements
                    .filter(ra => {
                        if (ra.previousAgreementId) return false;
                        const propId = ra.propertyId ?? (ra as any).property_id;
                        const fee = typeof ra.brokerFee === 'number' ? ra.brokerFee : parseFloat(String(ra.brokerFee ?? 0));
                        return propId && String(propId) === String(prop.id) && ra.brokerId && !isNaN(fee) && fee > 0;
                    })
                    .forEach(ra => {
                        const fee = typeof ra.brokerFee === 'number' ? ra.brokerFee : parseFloat(String(ra.brokerFee ?? 0));
                        if (!isNaN(fee)) paid += fee;
                    });
                state.bills
                    .filter(b => String(b.propertyId) === propIdStr && !b.projectId)
                    .forEach(b => {
                        const amt = typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount ?? 0));
                        if (!isNaN(amt) && amt > 0) paid += amt;
                    });
                const balance = collected - paid;
                // Include every property so user sees all units; show balance (0 if none due)
                result[prop.ownerId].rent.push({
                    propertyId: prop.id,
                    propertyName: prop.name || 'Unit',
                    balanceDue: Math.max(0, balance),
                });
            }

            if (secDepCategory) {
                let collected = 0;
                let paid = 0;
                state.transactions
                    .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === secDepCategory.id && String(tx.propertyId) === propIdStr)
                    .forEach(tx => {
                        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                        if (!isNaN(amount) && amount > 0) collected += amount;
                    });
                state.transactions
                    .filter(tx => tx.type === TransactionType.EXPENSE && String(tx.propertyId) === propIdStr)
                    .forEach(tx => {
                        const category = state.categories.find(c => c.id === tx.categoryId);
                        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                        if (isNaN(amount) || amount <= 0) return;
                        if (secRefCategory && tx.categoryId === secRefCategory.id) {
                            paid += amount;
                            return;
                        }
                        if (ownerSecPayoutCategory && tx.categoryId === ownerSecPayoutCategory.id) {
                            paid += amount;
                            return;
                        }
                        if (category?.name?.includes('(Tenant)')) paid += amount;
                    });
                const balance = collected - paid;
                // Include every property so user sees all units; show balance (0 if none due)
                result[prop.ownerId].security.push({
                    propertyId: prop.id,
                    propertyName: prop.name || 'Unit',
                    balanceDue: Math.max(0, balance),
                });
            }
        });
        return result;
    }, [state.transactions, state.properties, state.categories, state.rentalAgreements, state.bills]);

    // When a unit is selected, show its name in the properties column
    const selectedUnitName = useMemo(() => {
        if (selectedUnitId === 'all') return null;
        const p = state.properties.find(prop => prop.id === selectedUnitId);
        return p?.name || 'Unit';
    }, [selectedUnitId, state.properties]);

    // --- Payout tree data (full portfolio; table scope follows building / owner / unit / broker selection) ---
    const ownerStyleTreeNodes = useMemo((): PayoutTreeNode[] => {
        const mode: 'rent' | 'security' = activeCategory === 'securityDeposit' ? 'security' : 'rent';
        const buildings = [...state.buildings].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
        const root: PayoutTreeNode[] = [];

        for (const b of buildings) {
            const propsInB = state.properties.filter(p => p.buildingId === b.id);
            const byOwner = new Map<string, typeof state.properties>();
            for (const p of propsInB) {
                if (!p.ownerId) continue;
                if (!byOwner.has(p.ownerId)) byOwner.set(p.ownerId, []);
                byOwner.get(p.ownerId)!.push(p);
            }

            const ownerChildren: PayoutTreeNode[] = [];

            for (const [ownerId, props] of byOwner) {
                const contact = state.contacts.find(c => c.id === ownerId);
                if (!contact) continue;

                const propNodes: PayoutTreeNode[] = [];
                let oSum = 0;

                for (const prop of props) {
                    const items = ownerPropertyBreakdown[ownerId]?.[mode] ?? [];
                    const item = items.find(i => String(i.propertyId) === String(prop.id));
                    const raw = item?.balanceDue ?? 0;
                    const due = Math.max(0, raw);
                    if (due <= 0.01) continue;
                    oSum += due;
                    propNodes.push({
                        id: `property-${prop.id}`,
                        type: 'property',
                        label: prop.name || 'Unit',
                        value: formatCurrency(due),
                        sortAmount: due,
                    });
                }

                if (propNodes.length === 0) continue;

                ownerChildren.push({
                    id: `bld-${b.id}-own-${ownerId}`,
                    type: 'owner',
                    label: contact.name,
                    value: formatCurrency(oSum),
                    sortAmount: oSum,
                    children: propNodes,
                });
            }

            if (ownerChildren.length === 0) continue;

            const bSum = ownerChildren.reduce((s, c) => s + (c.sortAmount ?? 0), 0);
            root.push({
                id: `bld-${b.id}`,
                type: 'building',
                label: b.name,
                value: formatCurrency(bSum),
                sortAmount: bSum,
                children: ownerChildren,
            });
        }

        return root;
    }, [state.buildings, state.properties, state.contacts, ownerPropertyBreakdown, activeCategory]);

    const brokerPayoutTreeNodes = useMemo((): PayoutTreeNode[] => {
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const rebateCategory = state.categories.find(c => c.name === 'Rebate Amount');
        const relevantCategoryIds = [brokerFeeCategory?.id, rebateCategory?.id].filter(Boolean) as string[];
        const fullScope = new Set(state.properties.map(p => String(p.id)));

        const earned = new Map<string, number>();
        state.rentalAgreements.forEach(ra => {
            if (ra.previousAgreementId) return;
            const propId = ra.propertyId ?? (ra as { property_id?: string }).property_id;
            if (!propId || !ra.brokerId) return;
            const fee = typeof ra.brokerFee === 'number' ? ra.brokerFee : parseFloat(String(ra.brokerFee ?? 0));
            if (isNaN(fee) || fee <= 0) return;
            const k = `${ra.brokerId}::${String(propId)}`;
            earned.set(k, (earned.get(k) || 0) + fee);
        });

        const paid = new Map<string, number>();
        state.transactions
            .filter(
                tx =>
                    tx.type === TransactionType.EXPENSE &&
                    tx.contactId &&
                    tx.categoryId &&
                    relevantCategoryIds.includes(tx.categoryId) &&
                    !tx.projectId
            )
            .forEach(tx => {
                const category = state.categories.find(c => c.id === tx.categoryId);
                if (category?.name === 'Rebate Amount') return;
                if (!tx.contactId) return;
                const amount = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount ?? 0));
                if (isNaN(amount)) return;
                if (tx.propertyId) {
                    if (!fullScope.has(String(tx.propertyId))) return;
                    const k = `${tx.contactId}::${String(tx.propertyId)}`;
                    paid.set(k, (paid.get(k) || 0) + amount);
                } else {
                    const k = `${tx.contactId}::__noprop__`;
                    paid.set(k, (paid.get(k) || 0) + amount);
                }
            });

        const pairBalance = new Map<string, number>();
        const keys = new Set<string>([...earned.keys(), ...paid.keys()]);
        keys.forEach(k => {
            if (k.endsWith('::__noprop__')) return;
            const e = earned.get(k) ?? 0;
            const pAmt = paid.get(k) ?? 0;
            pairBalance.set(k, e - pAmt);
        });

        const buildings = [...state.buildings].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
        const root: PayoutTreeNode[] = [];

        for (const b of buildings) {
            const propsInB = state.properties.filter(p => p.buildingId === b.id);
            const propIdsB = new Set(propsInB.map(p => String(p.id)));

            const byBroker = new Map<string, PayoutTreeNode[]>();

            pairBalance.forEach((bal, pairKey) => {
                const sep = pairKey.indexOf('::');
                if (sep < 0) return;
                const brokerId = pairKey.slice(0, sep);
                const propId = pairKey.slice(sep + 2);
                if (!propIdsB.has(propId)) return;

                const eAmt = earned.get(pairKey) ?? 0;
                const pAmt = paid.get(pairKey) ?? 0;
                const hasActivity = eAmt > 0.01 || pAmt > 0.01;
                if (!hasActivity) return;

                const due = Math.max(0, bal);
                if (due <= 0.01) return;

                const prop = state.properties.find(p => String(p.id) === propId);
                if (!prop) return;

                const node: PayoutTreeNode = {
                    id: `bld-${b.id}-brk-${brokerId}-prop-${propId}`,
                    type: 'brokerProperty',
                    label: prop.name || 'Unit',
                    value: formatCurrency(due),
                    sortAmount: due,
                };
                if (!byBroker.has(brokerId)) byBroker.set(brokerId, []);
                byBroker.get(brokerId)!.push(node);
            });

            const brokerChildren: PayoutTreeNode[] = [];
            byBroker.forEach((propNodes, brokerId) => {
                if (propNodes.length === 0) return;
                const broker = state.contacts.find(c => c.id === brokerId);
                if (!broker) return;
                const brSum = propNodes.reduce((s, n) => s + (n.sortAmount ?? 0), 0);
                brokerChildren.push({
                    id: `bld-${b.id}-brk-${brokerId}`,
                    type: 'broker',
                    label: broker.name,
                    value: formatCurrency(brSum),
                    sortAmount: brSum,
                    children: propNodes,
                });
            });

            if (brokerChildren.length === 0) continue;
            const bSum = brokerChildren.reduce((s, c) => s + (c.sortAmount ?? 0), 0);
            root.push({
                id: `bld-${b.id}`,
                type: 'building',
                label: b.name,
                value: formatCurrency(bSum),
                sortAmount: bSum,
                children: brokerChildren,
            });
        }

        return root;
    }, [state.buildings, state.properties, state.contacts, state.rentalAgreements, state.transactions, state.categories]);

    const payoutTreeNodes = useMemo((): PayoutTreeNode[] => {
        if (activeCategory === 'brokerCommission') return brokerPayoutTreeNodes;
        return ownerStyleTreeNodes;
    }, [activeCategory, brokerPayoutTreeNodes, ownerStyleTreeNodes]);

    const payoutTreeDisplayNodes = useMemo(
        () =>
            sortPayoutTreeNodes(
                filterPayoutTreeNodes(payoutTreeNodes, searchQuery),
                treeSortConfig.key,
                treeSortConfig.direction
            ),
        [payoutTreeNodes, searchQuery, treeSortConfig]
    );

    const treeSelectedId = useMemo(() => {
        if (activeCategory === 'brokerCommission') {
            if (selectedBrokerId !== 'all' && selectedUnitId !== 'all' && selectedBuildingId !== 'all') {
                return `bld-${selectedBuildingId}-brk-${selectedBrokerId}-prop-${selectedUnitId}`;
            }
            if (selectedBrokerId !== 'all' && selectedBuildingId !== 'all') {
                return `bld-${selectedBuildingId}-brk-${selectedBrokerId}`;
            }
            if (selectedBuildingId !== 'all') return `bld-${selectedBuildingId}`;
            return null;
        }
        if (selectedUnitId !== 'all') return `property-${selectedUnitId}`;
        if (selectedOwnerId !== 'all' && selectedBuildingId !== 'all') {
            return `bld-${selectedBuildingId}-own-${selectedOwnerId}`;
        }
        if (selectedOwnerId !== 'all' && selectedBuildingId === 'all') {
            const props = state.properties.filter(p => p.ownerId === selectedOwnerId);
            const first = props[0];
            if (first) return `bld-${first.buildingId}-own-${selectedOwnerId}`;
        }
        if (selectedBuildingId !== 'all') return `bld-${selectedBuildingId}`;
        return null;
    }, [
        activeCategory,
        selectedBrokerId,
        selectedUnitId,
        selectedBuildingId,
        selectedOwnerId,
        state.properties,
    ]);

    const treeSelectedParentId = useMemo(() => {
        if (activeCategory === 'brokerCommission') {
            if (selectedBrokerId !== 'all' && selectedUnitId !== 'all' && selectedBuildingId !== 'all') {
                return `bld-${selectedBuildingId}-brk-${selectedBrokerId}`;
            }
            if (selectedBrokerId !== 'all' && selectedBuildingId !== 'all') return `bld-${selectedBuildingId}`;
            if (selectedBuildingId !== 'all') return null;
            return null;
        }
        if (selectedUnitId !== 'all') {
            const prop = state.properties.find(p => p.id === selectedUnitId);
            if (prop) return `bld-${prop.buildingId}-own-${prop.ownerId}`;
            return null;
        }
        if (selectedOwnerId !== 'all' && selectedBuildingId !== 'all') return `bld-${selectedBuildingId}`;
        if (selectedOwnerId !== 'all' && selectedBuildingId === 'all') {
            const props = state.properties.filter(p => p.ownerId === selectedOwnerId);
            const first = props[0];
            if (first) return `bld-${first.buildingId}`;
        }
        if (selectedBuildingId !== 'all') return null;
        return null;
    }, [
        activeCategory,
        selectedBrokerId,
        selectedUnitId,
        selectedBuildingId,
        selectedOwnerId,
        state.properties,
    ]);

    const clearLocationFilters = () => {
        setSelectedBuildingId('all');
        setSelectedOwnerId('all');
        setSelectedUnitId('all');
        setSelectedBrokerId('all');
        setExpandedRowId(null);
    };

    const hasLocationFilters =
        selectedBuildingId !== 'all' ||
        selectedOwnerId !== 'all' ||
        selectedUnitId !== 'all' ||
        selectedBrokerId !== 'all';

    const handleTreeSortColumn = useCallback((column: 'label' | 'value') => {
        setTreeSortConfig(prev => {
            const key = column === 'label' ? 'name' : 'amount';
            if (prev.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: key === 'amount' ? 'desc' : 'asc' };
        });
    }, []);

    const handleTreeResizeMove = useCallback(
        (e: MouseEvent) => {
            if (!payoutSplitContainerRef.current) return;
            const left = payoutSplitContainerRef.current.getBoundingClientRect().left;
            const newWidth = e.clientX - left;
            if (newWidth > 200 && newWidth < 600) setSidebarWidth(newWidth);
        },
        [setSidebarWidth]
    );

    useEffect(() => {
        if (!isTreeResizing) return;
        const handleUp = () => {
            setIsTreeResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', handleTreeResizeMove);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('blur', handleUp);
        document.addEventListener('visibilitychange', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleTreeResizeMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('blur', handleUp);
            document.removeEventListener('visibilitychange', handleUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isTreeResizing, handleTreeResizeMove]);

    const handleTreeSelect = (id: string, _type?: string, _parentId?: string | null) => {
        if (id.startsWith('bld-') && !id.includes('-own-') && !id.includes('-brk-')) {
            const buildingId = id.replace('bld-', '');
            setSelectedBuildingId(buildingId);
            setSelectedOwnerId('all');
            setSelectedUnitId('all');
            setSelectedBrokerId('all');
            setExpandedRowId(null);
            return;
        }
        const ownMatch = id.match(/^bld-(.+)-own-(.+)$/);
        if (ownMatch) {
            setSelectedBuildingId(ownMatch[1]);
            setSelectedOwnerId(ownMatch[2]);
            setSelectedUnitId('all');
            setSelectedBrokerId('all');
            setExpandedRowId(null);
            return;
        }
        if (id.startsWith('property-')) {
            const pid = id.replace('property-', '');
            const prop = state.properties.find(p => String(p.id) === pid);
            if (prop) {
                setSelectedBuildingId(prop.buildingId || 'all');
                setSelectedOwnerId(prop.ownerId || 'all');
                setSelectedUnitId(prop.id);
                setSelectedBrokerId('all');
                setExpandedRowId(null);
            }
            return;
        }
        const brkPropMatch = id.match(/^bld-(.+)-brk-(.+)-prop-(.+)$/);
        if (brkPropMatch) {
            setSelectedBuildingId(brkPropMatch[1]);
            setSelectedOwnerId('all');
            setSelectedUnitId(brkPropMatch[3]);
            setSelectedBrokerId(brkPropMatch[2]);
            setExpandedRowId(null);
            return;
        }
        const brkMatch = id.match(/^bld-(.+)-brk-(.+)$/);
        if (brkMatch) {
            setSelectedBuildingId(brkMatch[1]);
            setSelectedOwnerId('all');
            setSelectedUnitId('all');
            setSelectedBrokerId(brkMatch[2]);
            setExpandedRowId(null);
        }
    };

    // --- Unified Payee Rows ---
    const allPayeeRows = useMemo<PayeeRow[]>(() => {
        const rows: PayeeRow[] = [];
        const propsLabel = (ownerId: string) => {
            if (selectedUnitName) return selectedUnitName;
            const list = state.properties.filter(p => p.ownerId === ownerId).map(p => p.name);
            return list.slice(0, 3).join(', ') + (list.length > 3 ? ` +${list.length - 3}` : '');
        };

        // Owner Income rows
        ownerRentalBalances.forEach(ob => {
            const contact = state.contacts.find(c => c.id === ob.ownerId);
            if (!contact) return;
            rows.push({
                id: `owner-income-${ob.ownerId}`,
                name: contact.name,
                type: 'Owner',
                category: 'ownerIncome',
                categoryLabel: 'Owner Income',
                collected: ob.collected,
                paid: ob.paid,
                balance: ob.balance,
                contact,
                properties: propsLabel(ob.ownerId),
            });
        });

        // Broker Commission rows (when unit selected, show that unit name)
        brokerCommissionBalances.forEach(bb => {
            const contact = state.contacts.find(c => c.id === bb.brokerId);
            if (!contact) return;
            const brokerAgreements = state.rentalAgreements.filter(ra => ra.brokerId === bb.brokerId && (!selectedUnitId || selectedUnitId === 'all' || ra.propertyId === selectedUnitId));
            const propertyNames = selectedUnitName ? [selectedUnitName] : brokerAgreements.map(ra => state.properties.find(p => p.id === ra.propertyId)?.name).filter(Boolean).slice(0, 3);
            rows.push({
                id: `broker-${bb.brokerId}`,
                name: contact.name,
                type: 'Broker',
                category: 'brokerCommission',
                categoryLabel: 'Commission',
                collected: bb.earned,
                paid: bb.paid,
                balance: bb.balance,
                contact,
                properties: propertyNames.join(', ') + (!selectedUnitName && brokerAgreements.length > 3 ? ` +${brokerAgreements.length - 3}` : ''),
            });
        });

        // Owner Security Deposit rows
        ownerSecurityBalances.forEach(ob => {
            const contact = state.contacts.find(c => c.id === ob.ownerId);
            if (!contact) return;
            rows.push({
                id: `owner-security-${ob.ownerId}`,
                name: contact.name,
                type: 'Owner',
                category: 'securityDeposit',
                categoryLabel: 'Security Deposit',
                collected: ob.collected,
                paid: ob.paid,
                balance: ob.balance,
                contact,
                properties: propsLabel(ob.ownerId),
            });
        });

        return rows;
    }, [ownerRentalBalances, brokerCommissionBalances, ownerSecurityBalances, state.contacts, state.properties, state.rentalAgreements, selectedUnitId, selectedUnitName]);

    // --- Filtering --- (balances are already scoped by building/owner/unit; here only category and search)
    const filteredRows = useMemo(() => {
        let rows = [...allPayeeRows];

        // Category filter
        if (activeCategory !== 'all') {
            rows = rows.filter(r => r.category === activeCategory);
        }

        if (activeCategory === 'brokerCommission' && selectedBrokerId !== 'all') {
            rows = rows.filter(r => r.id === `broker-${selectedBrokerId}`);
        }

        // Search filter
        if (searchQuery) {
            const lower = searchQuery.toLowerCase();
            rows = rows.filter(r => {
                if (r.name.toLowerCase().includes(lower)) return true;
                if (r.properties?.toLowerCase().includes(lower)) return true;
                if (r.categoryLabel.toLowerCase().includes(lower)) return true;
                return false;
            });
        }

        // Sort
        rows = [...rows].sort((a, b) => {
            let valA: any = a[sortConfig.key];
            let valB: any = b[sortConfig.key];
            if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = (valB || '').toLowerCase(); }
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return rows;
    }, [allPayeeRows, activeCategory, searchQuery, sortConfig, selectedBrokerId]);

    // Rows for summary (same scope as allPayeeRows; only search filter so all three cards show correct totals)
    const rowsForSummary = useMemo(() => {
        let rows = [...allPayeeRows];
        if (searchQuery) {
            const lower = searchQuery.toLowerCase();
            rows = rows.filter(r => {
                if (r.name.toLowerCase().includes(lower)) return true;
                if (r.properties?.toLowerCase().includes(lower)) return true;
                if (r.categoryLabel.toLowerCase().includes(lower)) return true;
                return false;
            });
        }
        return rows;
    }, [allPayeeRows, searchQuery]);

    // --- Summary Totals (from rowsForSummary so all three cards always show; category tab only filters the table) ---
    const summaryTotals = useMemo(() => {
        const ownerRows = rowsForSummary.filter(r => r.category === 'ownerIncome');
        const brokerRows = rowsForSummary.filter(r => r.category === 'brokerCommission');
        const securityRows = rowsForSummary.filter(r => r.category === 'securityDeposit');

        const ownerIncome = ownerRows.reduce((sum, r) => sum + Math.max(0, r.balance), 0);
        const ownerIncomeCount = ownerRows.filter(r => r.balance > 0.01).length;
        const brokerComm = brokerRows.reduce((sum, r) => sum + Math.max(0, r.balance), 0);
        const brokerCount = brokerRows.filter(r => r.balance > 0.01).length;
        const security = securityRows.reduce((sum, r) => sum + Math.max(0, r.balance), 0);
        const securityCount = securityRows.filter(r => r.balance > 0.01).length;

        return { ownerIncome, ownerIncomeCount, brokerComm, brokerCount, security, securityCount };
    }, [rowsForSummary]);

    // --- Helpers ---
    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleSummaryCardClick = (cat: 'ownerIncome' | 'brokerCommission' | 'securityDeposit') => {
        setActiveCategory(cat);
        setExpandedRowId(null);
        if (cat === 'brokerCommission') {
            setSelectedOwnerId('all');
            setSelectedUnitId('all');
        } else {
            setSelectedBrokerId('all');
        }
    };

    const handleCategoryChipClick = (cat: PayoutCategory) => {
        setActiveCategory(cat);
        setExpandedRowId(null);
        if (cat === 'brokerCommission') {
            setSelectedOwnerId('all');
            setSelectedUnitId('all');
        } else {
            setSelectedBrokerId('all');
        }
    };

    const handlePay = (row: PayeeRow) => {
        if (row.type === 'Broker') {
            setBrokerPayoutModal({ isOpen: true, broker: row.contact, balanceDue: row.balance });
        } else if (row.category === 'securityDeposit') {
            setOwnerPayoutModal({
                isOpen: true,
                owner: row.contact,
                balanceDue: row.balance,
                payoutType: 'Security',
                buildingId: selectedBuildingId !== 'all' ? selectedBuildingId : undefined,
            });
        } else {
            setOwnerPayoutModal({
                isOpen: true,
                owner: row.contact,
                balanceDue: row.balance,
                payoutType: 'Rent',
                buildingId: selectedBuildingId !== 'all' ? selectedBuildingId : undefined,
            });
        }
    };

    const handleReceiveFromOwner = (row: PayeeRow) => {
        setReceiveOwner({
            ownerId: row.contact.id,
            ownerName: row.contact.name,
            amount: Math.abs(row.balance),
        });
    };

    const handleWhatsApp = (row: PayeeRow) => {
        const templates = state.whatsAppTemplates;
        let message = '';

        if (row.type === 'Broker') {
            const template = templates.brokerPayoutLedger || 'Dear {contactName}, your commission balance is {balance}.';
            message = WhatsAppService.generateBrokerPayoutLedger(
                template, row.contact, row.collected, row.paid, row.balance
            );
        } else {
            const payoutType = row.category === 'securityDeposit' ? 'Security Deposit' : 'Rental Income';
            const template = templates.ownerPayoutLedger || 'Dear {contactName}, your {payoutType} balance is {balance}.';
            const expenses = row.category === 'ownerIncome' ? row.paid : 0;
            const paidToOwner = row.category === 'ownerIncome' ? 0 : row.paid;
            message = WhatsAppService.generateOwnerPayoutLedger(
                template, row.contact, row.collected, expenses, paidToOwner, row.balance, payoutType
            );
        }

        const phoneNumber = row.contact.contactNo || '';
        sendOrOpenWhatsApp(
            { contact: row.contact, message, phoneNumber: phoneNumber || undefined },
            () => state.whatsAppMode,
            openChat
        );
    };

    const handleExpandToggle = (rowId: string) => {
        setExpandedRowId(prev => prev === rowId ? null : rowId);
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-app-muted inline-block">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    const getCategoryBadgeClasses = (category: PayeeRow['category']) => {
        const pill = 'border px-2 py-0.5 rounded-full text-[10px] font-medium';
        switch (category) {
            case 'ownerIncome': return `${pill} border-ds-success/35 bg-[color:var(--badge-paid-bg)] text-ds-success`;
            case 'brokerCommission': return `${pill} border-primary/25 bg-app-toolbar text-primary`;
            case 'securityDeposit': return `${pill} border-ds-warning/35 bg-app-toolbar text-ds-warning`;
        }
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

    // --- Expanded row detail ---
    const renderExpandedDetail = (row: PayeeRow) => {
        const ownerId = row.contact.id;
        if (row.type === 'Broker') {
            const buildingIdForLedger = selectedBuildingId === 'all' ? undefined : selectedBuildingId;
            const propertyIdForLedger = selectedUnitId !== 'all' ? selectedUnitId : undefined;
            return (
                <div className="p-4 bg-app-toolbar/40 border-t border-app-border">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="font-semibold text-app-text">Commission Ledger - {row.name}</h4>
                    </div>
                    <BrokerLedger
                        brokerId={ownerId}
                        context="Rental"
                        buildingId={buildingIdForLedger}
                        propertyId={propertyIdForLedger}
                    />
                </div>
            );
        }

        const ledgerType = row.category === 'securityDeposit' ? 'Security' : 'Rent';
        const buildingIdForLedger = selectedBuildingId === 'all' ? undefined : selectedBuildingId;
        const propertyIdForLedger = selectedUnitId !== 'all' ? selectedUnitId : undefined;

        return (
            <div className="p-4 bg-app-toolbar/40 border-t border-app-border">
                <div className="flex justify-between items-center mb-3">
                    <h4 className="font-semibold text-app-text">
                        {row.category === 'securityDeposit' ? 'Security Deposit' : 'Rental Income'} Ledger - {row.name}
                    </h4>
                </div>
                <OwnerLedger
                    ownerId={ownerId}
                    ledgerType={ledgerType}
                    buildingId={buildingIdForLedger}
                    propertyId={propertyIdForLedger}
                    onRecordClick={(item) => {
                        if (!item.transaction) return;
                        if (item.type === 'Payout') {
                            setOwnerPayoutModal({
                                isOpen: true,
                                owner: row.contact,
                                balanceDue: row.balance,
                                payoutType: ledgerType === 'Security' ? 'Security' : 'Rent',
                                buildingId: buildingIdForLedger,
                                transactionToEdit: item.transaction,
                            });
                        } else {
                            setTransactionToEdit(item.transaction);
                        }
                    }}
                />
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Summary Cards */}
            <div className="flex-shrink-0 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 pb-0">
                {/* Owner Income Card */}
                <button
                    type="button"
                    onClick={() => handleSummaryCardClick('ownerIncome')}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                        activeCategory === 'ownerIncome'
                            ? 'border-ds-success bg-ds-success/10 shadow-ds-card'
                            : 'border-app-border bg-app-card hover:border-ds-success/40 hover:shadow-ds-card'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                activeCategory === 'ownerIncome' ? 'bg-ds-success text-ds-on-primary' : 'bg-ds-success/15 text-ds-success'
                            }`}>
                                <div className="w-4 h-4">{ICONS.users}</div>
                            </div>
                            <span className="text-sm font-medium text-app-text">Owner Income</span>
                        </div>
                        <span className="text-xs text-app-muted">{summaryTotals.ownerIncomeCount} owners</span>
                    </div>
                    <p className="text-2xl font-bold text-ds-success">{CURRENCY} {formatCurrency(summaryTotals.ownerIncome)}</p>
                    <p className="text-xs text-app-muted mt-1">Due to property owners</p>
                </button>

                {/* Broker Commission Card */}
                <button
                    type="button"
                    onClick={() => handleSummaryCardClick('brokerCommission')}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                        activeCategory === 'brokerCommission'
                            ? 'border-primary bg-primary/10 shadow-ds-card'
                            : 'border-app-border bg-app-card hover:border-primary/40 hover:shadow-ds-card'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                activeCategory === 'brokerCommission' ? 'bg-primary text-ds-on-primary' : 'bg-primary/15 text-primary'
                            }`}>
                                <div className="w-4 h-4">{ICONS.dollarSign}</div>
                            </div>
                            <span className="text-sm font-medium text-app-text">Broker Commission</span>
                        </div>
                        <span className="text-xs text-app-muted">{summaryTotals.brokerCount} brokers</span>
                    </div>
                    <p className="text-2xl font-bold text-primary">{CURRENCY} {formatCurrency(summaryTotals.brokerComm)}</p>
                    <p className="text-xs text-app-muted mt-1">Due to brokers</p>
                </button>

                {/* Security Deposit Card */}
                <button
                    type="button"
                    onClick={() => handleSummaryCardClick('securityDeposit')}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                        activeCategory === 'securityDeposit'
                            ? 'border-ds-warning bg-ds-warning/10 shadow-ds-card'
                            : 'border-app-border bg-app-card hover:border-ds-warning/40 hover:shadow-ds-card'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                activeCategory === 'securityDeposit' ? 'bg-ds-warning text-ds-on-primary' : 'bg-ds-warning/15 text-ds-warning'
                            }`}>
                                <div className="w-4 h-4">{ICONS.wallet}</div>
                            </div>
                            <span className="text-sm font-medium text-app-text">Security Deposits</span>
                        </div>
                        <span className="text-xs text-app-muted">{summaryTotals.securityCount} owners</span>
                    </div>
                    <p className="text-2xl font-bold text-ds-warning">{CURRENCY} {formatCurrency(summaryTotals.security)}</p>
                    <p className="text-xs text-app-muted mt-1">Held for property owners</p>
                </button>
            </div>

            {/* Filter Bar */}
            <div className="flex-shrink-0 flex flex-wrap items-center gap-3 px-4 py-3">
                {/* Category chips */}
                <div className="flex gap-1.5">
                    {(['all', 'ownerIncome', 'brokerCommission', 'securityDeposit'] as PayoutCategory[]).map(cat => {
                        const labels: Record<PayoutCategory, string> = {
                            all: 'All',
                            ownerIncome: 'Owner Income',
                            brokerCommission: 'Broker Commission',
                            securityDeposit: 'Security Deposit',
                        };
                        return (
                            <button
                                type="button"
                                key={cat}
                                onClick={() => handleCategoryChipClick(cat)}
                                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                                    activeCategory === cat
                                        ? 'bg-primary text-ds-on-primary'
                                        : 'bg-app-toolbar text-app-muted hover:bg-app-toolbar/80 hover:text-app-text'
                                }`}
                            >
                                {labels[cat]}
                            </button>
                        );
                    })}
                </div>

                <div className="h-5 w-px bg-app-border hidden md:block" />

                {/* Building → Owner → Unit filters (cascading) */}
                <div className="w-44">
                    <Select
                        value={selectedBuildingId}
                        onChange={(e) => setSelectedBuildingId(e.target.value)}
                        className="text-xs py-1"
                    >
                        <option value="all">All Buildings</option>
                        {state.buildings.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </Select>
                </div>
                <div className="w-44">
                    <Select
                        value={selectedOwnerId}
                        onChange={(e) => setSelectedOwnerId(e.target.value)}
                        className="text-xs py-1"
                        disabled={ownerFilterOptions.length === 0}
                    >
                        <option value="all">All Owners</option>
                        {ownerFilterOptions.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                    </Select>
                </div>
                <div className="w-44">
                    <Select
                        value={selectedUnitId}
                        onChange={(e) => setSelectedUnitId(e.target.value)}
                        className="text-xs py-1"
                        disabled={unitFilterOptions.length === 0}
                    >
                        <option value="all">All Units</option>
                        {unitFilterOptions.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </Select>
                </div>

                {hasLocationFilters && (
                    <Button type="button" variant="outline" className="text-xs py-1 px-2" onClick={clearLocationFilters}>
                        Clear tree filters
                    </Button>
                )}

                <div className="relative flex-grow max-w-xs ml-auto">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-app-muted">
                        <div className="w-3.5 h-3.5">{ICONS.search}</div>
                    </div>
                    <Input
                        placeholder="Search payee, property, building…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="ds-input-field pl-8 py-1 text-xs placeholder:text-app-muted"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute inset-y-0 right-0 flex items-center pr-2 text-app-muted hover:text-app-text"
                        >
                            <div className="w-3.5 h-3.5">{ICONS.x}</div>
                        </button>
                    )}
                </div>
            </div>

            {/* Tree + payees table (resizable split from lg; full-width stacked tree on small screens) */}
            <div
                ref={payoutSplitContainerRef}
                className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden gap-y-3 lg:gap-y-0 px-4 pb-4"
            >
                <div
                    className="w-full lg:w-[var(--payout-tree-w)] lg:flex-shrink-0 flex flex-col min-h-[220px] h-[min(40vh,320px)] lg:h-full lg:min-h-0 border border-app-border lg:border-r-0 rounded-xl lg:rounded-r-none bg-app-card overflow-hidden"
                    style={{ ['--payout-tree-w' as string]: `${sidebarWidth}px` } as React.CSSProperties}
                >
                    <PayoutTreePanel
                        nodes={payoutTreeDisplayNodes}
                        selectedId={treeSelectedId}
                        selectedParentId={treeSelectedParentId}
                        onNodeSelect={handleTreeSelect}
                        valueColumnHeader="Unpaid"
                        treeSortKey={treeSortConfig.key}
                        treeSortDirection={treeSortConfig.direction}
                        onTreeSortColumn={handleTreeSortColumn}
                    />
                </div>
                <div
                    className="hidden lg:block w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors flex-shrink-0 self-stretch min-h-[120px]"
                    onMouseDown={e => {
                        e.preventDefault();
                        setIsTreeResizing(true);
                    }}
                    role="separator"
                    aria-orientation="vertical"
                    title="Drag to resize tree panel"
                />
                <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
                <Card className="overflow-hidden flex-1 flex flex-col min-h-0">
                    <div className="overflow-x-auto flex-1 overflow-y-auto">
                        <table className="min-w-full divide-y divide-app-border">
                            <thead className="bg-app-table-header">
                                <tr>
                                    <th className="w-8 px-3 py-3"></th>
                                    <th
                                        onClick={() => handleSort('name')}
                                        className="px-3 py-3 text-left text-xs font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar/60 select-none"
                                    >
                                        Payee <SortIcon column="name" />
                                    </th>
                                    <th
                                        onClick={() => handleSort('category')}
                                        className="px-3 py-3 text-left text-xs font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar/60 select-none"
                                    >
                                        Type <SortIcon column="category" />
                                    </th>
                                    <th className="px-3 py-3 text-left text-xs font-semibold text-app-muted uppercase tracking-wider hidden lg:table-cell">
                                        Properties / Agreements
                                    </th>
                                    <th
                                        onClick={() => handleSort('collected')}
                                        className="px-3 py-3 text-right text-xs font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar/60 select-none"
                                    >
                                        Collected <SortIcon column="collected" />
                                    </th>
                                    <th
                                        onClick={() => handleSort('paid')}
                                        className="px-3 py-3 text-right text-xs font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar/60 select-none"
                                    >
                                        Paid / Expenses <SortIcon column="paid" />
                                    </th>
                                    <th
                                        onClick={() => handleSort('balance')}
                                        className="px-3 py-3 text-right text-xs font-semibold text-app-muted uppercase tracking-wider cursor-pointer hover:bg-app-toolbar/60 select-none"
                                    >
                                        Amount Due <SortIcon column="balance" />
                                    </th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-app-muted uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-app-border">
                                {filteredRows.length > 0 ? (
                                    filteredRows.map(row => (
                                        <React.Fragment key={row.id}>
                                            <tr
                                                className={`transition-colors hover:bg-app-toolbar/60 cursor-pointer ${
                                                    expandedRowId === row.id ? 'bg-primary/10' : ''
                                                }`}
                                                onClick={() => handleExpandToggle(row.id)}
                                            >
                                                <td className="px-3 py-3 text-app-muted">
                                                    <div className={`w-4 h-4 transition-transform ${expandedRowId === row.id ? 'rotate-90' : ''}`}>
                                                        {ICONS.chevronRight}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="font-semibold text-sm text-app-text">{row.name}</div>
                                                    <div className="text-xs text-app-muted">{row.type}</div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getCategoryBadgeClasses(row.category)}`}>
                                                        {row.categoryLabel}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-xs text-app-muted max-w-[200px] truncate hidden lg:table-cell" title={row.properties}>
                                                    {row.properties || '-'}
                                                </td>
                                                <td className="px-3 py-3 text-right text-sm text-app-text">
                                                    {formatCurrency(row.collected)}
                                                </td>
                                                <td className="px-3 py-3 text-right text-sm text-app-text">
                                                    {formatCurrency(row.paid)}
                                                </td>
                                                <td className="px-3 py-3 text-right">
                                                    <span className={`text-base font-bold ${
                                                        row.balance > 0.01 ? 'text-ds-danger' : row.balance < -0.01 ? 'text-ds-success' : 'text-app-muted'
                                                    }`}>
                                                        {row.balance < -0.01 && '-'}
                                                        {CURRENCY} {formatCurrency(Math.abs(row.balance))}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-center gap-1">
                                                        {row.balance > 0.01 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handlePay(row)}
                                                                className="px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-ds-on-primary hover:opacity-95 transition-colors"
                                                                title="Record Payment"
                                                            >
                                                                Pay
                                                            </button>
                                                        )}
                                                        {row.balance < -0.01 && row.type === 'Owner' && row.category === 'ownerIncome' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleReceiveFromOwner(row)}
                                                                className="px-2.5 py-1 text-xs font-medium rounded-md bg-ds-success text-ds-on-primary hover:opacity-95 transition-colors"
                                                                title="Receive from Owner"
                                                            >
                                                                Receive
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleWhatsApp(row)}
                                                            className="p-1.5 rounded-md text-ds-success hover:bg-ds-success/10 transition-colors"
                                                            title="Send Ledger via WhatsApp"
                                                        >
                                                            <div className="w-4 h-4">{ICONS.whatsapp}</div>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedRowId === row.id && (
                                                <tr>
                                                    <td colSpan={8} className="p-0">
                                                        {renderExpandedDetail(row)}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={8} className="px-3 py-16 text-center">
                                            <p className="text-app-muted text-sm">
                                                {searchQuery
                                                    ? 'No payees match your search.'
                                                    : selectedBuildingId !== 'all' || selectedOwnerId !== 'all' || selectedUnitId !== 'all'
                                                        ? 'No payees match the selected Building / Owner / Unit filters.'
                                                    : activeCategory !== 'all'
                                                        ? 'No pending payouts in this category.'
                                                        : 'No pending payouts found.'
                                                }
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
                </div>
            </div>

            {/* Modals */}
            {ownerPayoutModal.owner && (
                <OwnerPayoutModal
                    isOpen={ownerPayoutModal.isOpen}
                    onClose={() => setOwnerPayoutModal({ isOpen: false, owner: null, balanceDue: 0, payoutType: 'Rent' })}
                    owner={ownerPayoutModal.owner}
                    balanceDue={ownerPayoutModal.balanceDue}
                    payoutType={ownerPayoutModal.payoutType}
                    preSelectedBuildingId={ownerPayoutModal.buildingId}
                    transactionToEdit={ownerPayoutModal.transactionToEdit}
                    propertyBreakdown={
                        ownerPropertyBreakdown[ownerPayoutModal.owner.id]?.[ownerPayoutModal.payoutType === 'Rent' ? 'rent' : 'security'] ?? []
                    }
                />
            )}

            {brokerPayoutModal.broker && (
                <BrokerPayoutModal
                    isOpen={brokerPayoutModal.isOpen}
                    onClose={() => setBrokerPayoutModal({ isOpen: false, broker: null, balanceDue: 0 })}
                    broker={brokerPayoutModal.broker}
                    balanceDue={brokerPayoutModal.balanceDue}
                    context="Rental"
                />
            )}

            {receiveOwner && (
                <ReceiveFromOwnerModal
                    isOpen={!!receiveOwner}
                    onClose={() => setReceiveOwner(null)}
                    ownerId={receiveOwner.ownerId}
                    ownerName={receiveOwner.ownerName}
                    suggestedAmount={receiveOwner.amount}
                />
            )}

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
        </div>
    );
};

export default OwnerPayoutsPage;
