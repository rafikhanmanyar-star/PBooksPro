
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ContactType, TransactionType, Transaction, Contact } from '../../types';
import { CURRENCY, ICONS } from '../../constants';
import { formatCurrency } from '../../utils/numberUtils';
import OwnerPayoutModal from './OwnerPayoutModal';
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
import { WhatsAppService } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';

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
    const [activeCategory, setActiveCategory] = useState<PayoutCategory>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBuildingId, setSelectedBuildingId] = useState<string>('all');
    const [selectedOwnerId, setSelectedOwnerId] = useState<string>('all');
    const [selectedUnitId, setSelectedUnitId] = useState<string>('all');
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

    // Owner options: after building selection (owners with properties in that building, or all owners with properties)
    const ownerFilterOptions = useMemo(() => {
        const owners = state.contacts.filter(c => c.type === ContactType.OWNER);
        if (selectedBuildingId === 'all') {
            return owners.filter(o => state.properties.some(p => p.ownerId === o.id));
        }
        return owners.filter(o =>
            state.properties.some(p => p.ownerId === o.id && p.buildingId === selectedBuildingId)
        );
    }, [state.contacts, state.properties, selectedBuildingId]);

    // Unit options: after owner selection (properties of that owner, optionally in selected building)
    const unitFilterOptions = useMemo(() => {
        if (selectedOwnerId === 'all') return [];
        return state.properties.filter(
            p => p.ownerId === selectedOwnerId &&
                (selectedBuildingId === 'all' || p.buildingId === selectedBuildingId)
        );
    }, [state.properties, selectedOwnerId, selectedBuildingId]);

    // --- Owner Rental Income Balances ---
    const ownerRentalBalances = useMemo(() => {
        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        if (!rentalIncomeCategory) return [];

        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
        const ownerSvcPayCategory = state.categories.find(c => c.name === 'Owner Service Charge Payment');

        const ownerData: Record<string, { collected: number; paid: number }> = {};

        state.contacts.filter(c => c.type === ContactType.OWNER).forEach(owner => {
            ownerData[owner.id] = { collected: 0, paid: 0 };
        });

        // Rental Income
        state.transactions.filter(tx =>
            tx.type === TransactionType.INCOME &&
            tx.categoryId === rentalIncomeCategory.id
        ).forEach(tx => {
            if (tx.propertyId) {
                const property = state.properties.find(p => p.id === tx.propertyId);
                if (property?.ownerId && ownerData[property.ownerId]) {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount)) ownerData[property.ownerId].collected += amount;
                }
            }
        });

        // Owner Service Charge Payments
        if (ownerSvcPayCategory) {
            state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === ownerSvcPayCategory.id)
                .forEach(tx => {
                    if (tx.contactId && ownerData[tx.contactId]) {
                        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                        if (!isNaN(amount) && amount > 0) ownerData[tx.contactId].collected += amount;
                    }
                });
        }

        // Expenses
        state.transactions.filter(tx => tx.type === TransactionType.EXPENSE).forEach(tx => {
            let isOwnerPayout = false;

            if (tx.categoryId === ownerPayoutCategory?.id) {
                isOwnerPayout = true;
                if (tx.contactId && ownerData[tx.contactId]) {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount) && amount > 0) ownerData[tx.contactId].paid += amount;
                }
            }

            if (!isOwnerPayout && tx.propertyId) {
                const category = state.categories.find(c => c.id === tx.categoryId);
                const catName = category?.name || '';
                if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout' || catName.includes('(Tenant)')) return;

                const property = state.properties.find(p => p.id === tx.propertyId);
                if (property?.ownerId && ownerData[property.ownerId]) {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount) && amount > 0) ownerData[property.ownerId].paid += amount;
                }
            }
        });

        return Object.entries(ownerData)
            .map(([ownerId, data]) => ({ ownerId, ...data, balance: data.collected - data.paid }))
            .filter(item => Math.abs(item.balance) > 0.01 || item.collected > 0 || item.paid > 0);
    }, [state.transactions, state.categories, state.properties, state.contacts]);

    // --- Owner Security Deposit Balances ---
    const ownerSecurityBalances = useMemo(() => {
        const secDepCategory = state.categories.find(c => c.name === 'Security Deposit');
        const secRefCategory = state.categories.find(c => c.name === 'Security Deposit Refund');
        const ownerSecPayoutCategory = state.categories.find(c => c.name === 'Owner Security Payout');
        if (!secDepCategory) return [];

        const ownerData: Record<string, { collected: number; paid: number }> = {};

        state.contacts.filter(c => c.type === ContactType.OWNER).forEach(owner => {
            ownerData[owner.id] = { collected: 0, paid: 0 };
        });

        // Security Deposit Income
        state.transactions.filter(tx =>
            tx.type === TransactionType.INCOME && tx.categoryId === secDepCategory.id
        ).forEach(tx => {
            if (tx.propertyId) {
                const property = state.properties.find(p => p.id === tx.propertyId);
                if (property?.ownerId && ownerData[property.ownerId]) {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount) && amount > 0) ownerData[property.ownerId].collected += amount;
                }
            }
        });

        // Security Outflows
        state.transactions.filter(tx => tx.type === TransactionType.EXPENSE).forEach(tx => {
            let ownerId = '';
            if (tx.contactId && ownerData[tx.contactId] && ownerSecPayoutCategory && tx.categoryId === ownerSecPayoutCategory.id) {
                ownerId = tx.contactId;
            } else if (tx.propertyId) {
                const property = state.properties.find(p => p.id === tx.propertyId);
                if (property) ownerId = property.ownerId;
            }

            if (ownerId && ownerData[ownerId]) {
                if ((secRefCategory && tx.categoryId === secRefCategory.id) ||
                    (ownerSecPayoutCategory && tx.categoryId === ownerSecPayoutCategory.id)) {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount) && amount > 0) ownerData[ownerId].paid += amount;
                }
            }
        });

        return Object.entries(ownerData)
            .map(([ownerId, data]) => ({ ownerId, ...data, balance: data.collected - data.paid }))
            .filter(item => Math.abs(item.balance) > 0.01 || item.collected > 0 || item.paid > 0);
    }, [state.transactions, state.categories, state.properties, state.contacts]);

    // --- Broker Commission Balances ---
    const brokerCommissionBalances = useMemo(() => {
        const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
        const rebateCategory = state.categories.find(c => c.name === 'Rebate Amount');
        const relevantCategoryIds = [brokerFeeCategory?.id, rebateCategory?.id].filter(Boolean) as string[];

        const brokerData: Record<string, { earned: number; paid: number }> = {};

        state.contacts
            .filter(c => c.type === ContactType.BROKER || c.type === ContactType.DEALER)
            .forEach(broker => { brokerData[broker.id] = { earned: 0, paid: 0 }; });

        // From Rental Agreements
        state.rentalAgreements.forEach(ra => {
            const fee = typeof ra.brokerFee === 'number' ? ra.brokerFee : parseFloat(String(ra.brokerFee ?? 0));
            if (ra.brokerId && !isNaN(fee) && fee > 0) {
                if (!brokerData[ra.brokerId]) brokerData[ra.brokerId] = { earned: 0, paid: 0 };
                brokerData[ra.brokerId].earned += fee;
            }
        });

        // Payments
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
            .forEach(tx => {
                if (tx.contactId && brokerData[tx.contactId]) {
                    const amount = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount ?? 0));
                    if (!isNaN(amount)) brokerData[tx.contactId].paid += amount;
                }
            });

        return Object.entries(brokerData)
            .map(([brokerId, data]) => ({ brokerId, ...data, balance: data.earned - data.paid }))
            .filter(item => Math.abs(item.balance) > 0.01 || item.earned > 0 || item.paid > 0);
    }, [state.rentalAgreements, state.transactions, state.contacts, state.categories]);

    // --- Unified Payee Rows ---
    const allPayeeRows = useMemo<PayeeRow[]>(() => {
        const rows: PayeeRow[] = [];

        // Owner Income rows
        ownerRentalBalances.forEach(ob => {
            const contact = state.contacts.find(c => c.id === ob.ownerId);
            if (!contact) return;
            const ownerProperties = state.properties.filter(p => p.ownerId === ob.ownerId);
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
                properties: ownerProperties.map(p => p.name).slice(0, 3).join(', ') + (ownerProperties.length > 3 ? ` +${ownerProperties.length - 3}` : ''),
            });
        });

        // Broker Commission rows
        brokerCommissionBalances.forEach(bb => {
            const contact = state.contacts.find(c => c.id === bb.brokerId);
            if (!contact) return;
            const brokerAgreements = state.rentalAgreements.filter(ra => ra.brokerId === bb.brokerId);
            const propertyNames = brokerAgreements
                .map(ra => state.properties.find(p => p.id === ra.propertyId)?.name)
                .filter(Boolean)
                .slice(0, 3);
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
                properties: propertyNames.join(', ') + (brokerAgreements.length > 3 ? ` +${brokerAgreements.length - 3}` : ''),
            });
        });

        // Owner Security Deposit rows
        ownerSecurityBalances.forEach(ob => {
            const contact = state.contacts.find(c => c.id === ob.ownerId);
            if (!contact) return;
            const ownerProperties = state.properties.filter(p => p.ownerId === ob.ownerId);
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
                properties: ownerProperties.map(p => p.name).slice(0, 3).join(', ') + (ownerProperties.length > 3 ? ` +${ownerProperties.length - 3}` : ''),
            });
        });

        return rows;
    }, [ownerRentalBalances, brokerCommissionBalances, ownerSecurityBalances, state.contacts, state.properties, state.rentalAgreements]);

    // --- Unit-scoped balances (when a unit is selected, totals for that unit only) ---
    const unitScopedBalances = useMemo(() => {
        if (selectedUnitId === 'all') return null;
        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
        const secDepCategory = state.categories.find(c => c.name === 'Security Deposit');
        const secRefCategory = state.categories.find(c => c.name === 'Security Deposit Refund');
        const prop = state.properties.find(p => p.id === selectedUnitId);
        if (!prop) return null;

        const result: {
            ownerId: string;
            ownerIncome: { collected: number; paid: number; balance: number };
            securityDeposit: { collected: number; paid: number; balance: number };
        } = {
            ownerId: prop.ownerId,
            ownerIncome: { collected: 0, paid: 0, balance: 0 },
            securityDeposit: { collected: 0, paid: 0, balance: 0 },
        };

        if (rentalIncomeCategory) {
            let collected = 0;
            let paid = 0;
            state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory.id && tx.propertyId === selectedUnitId)
                .forEach(tx => {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (isNaN(amount)) return;
                    if (amount > 0) collected += amount;
                    else paid += Math.abs(amount);
                });
            state.transactions
                .filter(tx => tx.type === TransactionType.EXPENSE && tx.propertyId === selectedUnitId)
                .forEach(tx => {
                    if (tx.categoryId === ownerPayoutCategory?.id) return;
                    const category = state.categories.find(c => c.id === tx.categoryId);
                    const catName = category?.name || '';
                    if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout' || catName.includes('(Tenant)')) return;
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount) && amount > 0) paid += amount;
                });
            result.ownerIncome = { collected, paid, balance: collected - paid };
        }

        if (secDepCategory) {
            let collected = 0;
            let paid = 0;
            state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === secDepCategory.id && tx.propertyId === selectedUnitId)
                .forEach(tx => {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount) && amount > 0) collected += amount;
                });
            // Refunds/deductions for this property only (not owner security payout - that's not per-unit)
            state.transactions
                .filter(tx => tx.type === TransactionType.EXPENSE && tx.propertyId === selectedUnitId)
                .forEach(tx => {
                    const category = state.categories.find(c => c.id === tx.categoryId);
                    if (category && (category.id === secRefCategory?.id || category.name.includes('(Tenant)'))) {
                        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                        if (!isNaN(amount) && amount > 0) paid += amount;
                    }
                });
            result.securityDeposit = { collected, paid, balance: collected - paid };
        }

        return result;
    }, [selectedUnitId, state.transactions, state.properties, state.categories]);

    // --- Filtering ---
    const filteredRows = useMemo(() => {
        let rows = [...allPayeeRows];
        const sid = (id: string) => String(id || '');

        // Category filter
        if (activeCategory !== 'all') {
            rows = rows.filter(r => r.category === activeCategory);
        }

        // Building filter: only owner rows in this building; brokers excluded when building is selected
        if (selectedBuildingId !== 'all') {
            const ownerIdsInBuilding = new Set(
                state.properties
                    .filter(p => p.buildingId && sid(p.buildingId) === sid(selectedBuildingId) && p.ownerId)
                    .map(p => sid(p.ownerId))
            );
            rows = rows.filter(r => {
                if (r.type === 'Broker') return false; // hide brokers when filtering by building
                return ownerIdsInBuilding.has(sid(r.contact?.id));
            });
        }

        // Owner filter: only this owner's rows; hide brokers when owner is selected
        if (selectedOwnerId !== 'all') {
            rows = rows.filter(r => {
                if (r.type === 'Broker') return false;
                return sid(r.contact?.id) === sid(selectedOwnerId);
            });
        }

        // Unit filter: only the owner who owns this unit
        if (selectedUnitId !== 'all') {
            const prop = state.properties.find(p => sid(p.id) === sid(selectedUnitId));
            const unitOwnerId = prop?.ownerId;
            if (unitOwnerId) {
                rows = rows.filter(r => {
                    if (r.type === 'Broker') return false;
                    return sid(r.contact?.id) === sid(unitOwnerId);
                });
                // Apply unit-scoped totals and property label so summary row shows filtered unit only
                if (unitScopedBalances && prop) {
                    const unitName = prop.name || 'Unit';
                    rows = rows.map(r => {
                        if (r.type !== 'Owner' || sid(r.contact?.id) !== sid(unitScopedBalances.ownerId)) return r;
                        if (r.category === 'ownerIncome') {
                            const u = unitScopedBalances.ownerIncome;
                            return { ...r, collected: u.collected, paid: u.paid, balance: u.balance, properties: unitName };
                        }
                        if (r.category === 'securityDeposit') {
                            const u = unitScopedBalances.securityDeposit;
                            return { ...r, collected: u.collected, paid: u.paid, balance: u.balance, properties: unitName };
                        }
                        return r;
                    });
                }
            } else {
                rows = [];
            }
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
    }, [allPayeeRows, activeCategory, selectedBuildingId, selectedOwnerId, selectedUnitId, searchQuery, sortConfig, state.properties, unitScopedBalances]);

    // --- Summary Totals ---
    const summaryTotals = useMemo(() => {
        const ownerIncome = ownerRentalBalances.reduce((sum, ob) => sum + Math.max(0, ob.balance), 0);
        const ownerIncomeCount = ownerRentalBalances.filter(ob => ob.balance > 0.01).length;
        const brokerComm = brokerCommissionBalances.reduce((sum, bb) => sum + Math.max(0, bb.balance), 0);
        const brokerCount = brokerCommissionBalances.filter(bb => bb.balance > 0.01).length;
        const security = ownerSecurityBalances.reduce((sum, ob) => sum + Math.max(0, ob.balance), 0);
        const securityCount = ownerSecurityBalances.filter(ob => ob.balance > 0.01).length;
        return { ownerIncome, ownerIncomeCount, brokerComm, brokerCount, security, securityCount };
    }, [ownerRentalBalances, brokerCommissionBalances, ownerSecurityBalances]);

    // --- Helpers ---
    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleCategoryClick = (cat: PayoutCategory) => {
        setActiveCategory(prev => prev === cat ? 'all' : cat);
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
        openChat(row.contact, phoneNumber, message);
    };

    const handleExpandToggle = (rowId: string) => {
        setExpandedRowId(prev => prev === rowId ? null : rowId);
    };

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400 inline-block">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    const getCategoryBadgeClasses = (category: PayeeRow['category']) => {
        switch (category) {
            case 'ownerIncome': return 'bg-emerald-100 text-emerald-700';
            case 'brokerCommission': return 'bg-blue-100 text-blue-700';
            case 'securityDeposit': return 'bg-amber-100 text-amber-700';
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
            return (
                <div className="p-4 bg-slate-50 border-t border-slate-200">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="font-semibold text-slate-700">Commission Ledger - {row.name}</h4>
                    </div>
                    <BrokerLedger brokerId={ownerId} context="Rental" />
                </div>
            );
        }

        const ledgerType = row.category === 'securityDeposit' ? 'Security' : 'Rent';
        const buildingIdForLedger = selectedBuildingId === 'all' ? undefined : selectedBuildingId;
        const propertyIdForLedger = selectedUnitId !== 'all' ? selectedUnitId : undefined;

        return (
            <div className="p-4 bg-slate-50 border-t border-slate-200">
                <div className="flex justify-between items-center mb-3">
                    <h4 className="font-semibold text-slate-700">
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
                    onClick={() => handleCategoryClick('ownerIncome')}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                        activeCategory === 'ownerIncome'
                            ? 'border-emerald-500 bg-emerald-50 shadow-md'
                            : 'border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                activeCategory === 'ownerIncome' ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-600'
                            }`}>
                                <div className="w-4 h-4">{ICONS.users}</div>
                            </div>
                            <span className="text-sm font-medium text-slate-600">Owner Income</span>
                        </div>
                        <span className="text-xs text-slate-400">{summaryTotals.ownerIncomeCount} owners</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-700">{CURRENCY} {formatCurrency(summaryTotals.ownerIncome)}</p>
                    <p className="text-xs text-slate-500 mt-1">Due to property owners</p>
                </button>

                {/* Broker Commission Card */}
                <button
                    onClick={() => handleCategoryClick('brokerCommission')}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                        activeCategory === 'brokerCommission'
                            ? 'border-blue-500 bg-blue-50 shadow-md'
                            : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                activeCategory === 'brokerCommission' ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-600'
                            }`}>
                                <div className="w-4 h-4">{ICONS.dollarSign}</div>
                            </div>
                            <span className="text-sm font-medium text-slate-600">Broker Commission</span>
                        </div>
                        <span className="text-xs text-slate-400">{summaryTotals.brokerCount} brokers</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-700">{CURRENCY} {formatCurrency(summaryTotals.brokerComm)}</p>
                    <p className="text-xs text-slate-500 mt-1">Due to brokers</p>
                </button>

                {/* Security Deposit Card */}
                <button
                    onClick={() => handleCategoryClick('securityDeposit')}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                        activeCategory === 'securityDeposit'
                            ? 'border-amber-500 bg-amber-50 shadow-md'
                            : 'border-slate-200 bg-white hover:border-amber-300 hover:shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                activeCategory === 'securityDeposit' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-600'
                            }`}>
                                <div className="w-4 h-4">{ICONS.wallet}</div>
                            </div>
                            <span className="text-sm font-medium text-slate-600">Security Deposits</span>
                        </div>
                        <span className="text-xs text-slate-400">{summaryTotals.securityCount} owners</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-700">{CURRENCY} {formatCurrency(summaryTotals.security)}</p>
                    <p className="text-xs text-slate-500 mt-1">Held for property owners</p>
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
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                                    activeCategory === cat
                                        ? 'bg-accent text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {labels[cat]}
                            </button>
                        );
                    })}
                </div>

                <div className="h-5 w-px bg-slate-200 hidden md:block" />

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

                {/* Search */}
                <div className="relative flex-grow max-w-xs ml-auto">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                        <div className="w-3.5 h-3.5">{ICONS.search}</div>
                    </div>
                    <Input
                        placeholder="Search payee or property..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 py-1 text-xs"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400 hover:text-slate-600"
                        >
                            <div className="w-3.5 h-3.5">{ICONS.x}</div>
                        </button>
                    )}
                </div>
            </div>

            {/* Payees Table */}
            <div className="flex-grow overflow-auto px-4 pb-4">
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="w-8 px-3 py-3"></th>
                                    <th
                                        onClick={() => handleSort('name')}
                                        className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none"
                                    >
                                        Payee <SortIcon column="name" />
                                    </th>
                                    <th
                                        onClick={() => handleSort('category')}
                                        className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none"
                                    >
                                        Type <SortIcon column="category" />
                                    </th>
                                    <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider hidden lg:table-cell">
                                        Properties / Agreements
                                    </th>
                                    <th
                                        onClick={() => handleSort('collected')}
                                        className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none"
                                    >
                                        Collected <SortIcon column="collected" />
                                    </th>
                                    <th
                                        onClick={() => handleSort('paid')}
                                        className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none"
                                    >
                                        Paid / Expenses <SortIcon column="paid" />
                                    </th>
                                    <th
                                        onClick={() => handleSort('balance')}
                                        className="px-3 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none"
                                    >
                                        Amount Due <SortIcon column="balance" />
                                    </th>
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRows.length > 0 ? (
                                    filteredRows.map(row => (
                                        <React.Fragment key={row.id}>
                                            <tr
                                                className={`transition-colors hover:bg-slate-50 cursor-pointer ${
                                                    expandedRowId === row.id ? 'bg-slate-50' : ''
                                                }`}
                                                onClick={() => handleExpandToggle(row.id)}
                                            >
                                                <td className="px-3 py-3 text-slate-400">
                                                    <div className={`w-4 h-4 transition-transform ${expandedRowId === row.id ? 'rotate-90' : ''}`}>
                                                        {ICONS.chevronRight}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="font-semibold text-sm text-slate-800">{row.name}</div>
                                                    <div className="text-xs text-slate-400">{row.type}</div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getCategoryBadgeClasses(row.category)}`}>
                                                        {row.categoryLabel}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-xs text-slate-500 max-w-[200px] truncate hidden lg:table-cell" title={row.properties}>
                                                    {row.properties || '-'}
                                                </td>
                                                <td className="px-3 py-3 text-right text-sm text-slate-600">
                                                    {formatCurrency(row.collected)}
                                                </td>
                                                <td className="px-3 py-3 text-right text-sm text-slate-600">
                                                    {formatCurrency(row.paid)}
                                                </td>
                                                <td className="px-3 py-3 text-right">
                                                    <span className={`text-base font-bold ${
                                                        row.balance > 0.01 ? 'text-red-600' : row.balance < -0.01 ? 'text-emerald-600' : 'text-slate-400'
                                                    }`}>
                                                        {row.balance < -0.01 && '-'}
                                                        {CURRENCY} {formatCurrency(Math.abs(row.balance))}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-center gap-1">
                                                        {row.balance > 0.01 && (
                                                            <button
                                                                onClick={() => handlePay(row)}
                                                                className="px-2.5 py-1 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent/90 transition-colors"
                                                                title="Record Payment"
                                                            >
                                                                Pay
                                                            </button>
                                                        )}
                                                        {row.balance < -0.01 && row.type === 'Owner' && row.category === 'ownerIncome' && (
                                                            <button
                                                                onClick={() => handleReceiveFromOwner(row)}
                                                                className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                                                                title="Receive from Owner"
                                                            >
                                                                Receive
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleWhatsApp(row)}
                                                            className="p-1.5 rounded-md text-green-600 hover:bg-green-50 transition-colors"
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
                                            <p className="text-slate-400 text-sm">
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
