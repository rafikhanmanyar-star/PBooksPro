
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, Transaction, Category, RentalAgreementStatus, ContactType } from '../../types';
import type { AppState } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { ICONS, CURRENCY } from '../../constants';
import ManualServiceChargeModal from './ManualServiceChargeModal';
import ServiceChargeUpdateModal from './ServiceChargeUpdateModal';
import ReceiveFromOwnerModal from './ReceiveFromOwnerModal';
import { useNotification } from '../../context/NotificationContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { formatCurrency } from '../../utils/numberUtils';
import { getOwnerIdForPropertyOnDate } from '../../services/ownershipHistoryUtils';
import ARTreeView, { ARTreeNode } from './ARTreeView';
import useLocalStorage from '../../hooks/useLocalStorage';
import { useDebounce } from '../../hooks/useDebounce';
import { currentMonthYyyyMm } from '../../utils/dateUtils';

type ViewBy = 'building' | 'property' | 'tenant' | 'owner';
type MscStatusFilter = 'All' | 'Deducted' | 'Pending';

interface PropertyRow {
    propertyId: string;
    buildingName: string;
    buildingId: string;
    unit: string;
    ownerName: string;
    ownerId: string;
    status: 'Rented' | 'Vacant';
    monthlyCharge: number;
    deductedThisMonth: boolean;
    deductedEver: boolean;
    ownerBalance: number;
}

interface OwnerNegativeBalance {
    ownerId: string;
    ownerName: string;
    vacantProperties: string[];
    totalOwed: number;
}

/** One row per Service Charge Income (credit) transaction — edit/delete target that pair. */
interface LedgerRow {
    /** Credit transaction id (Service Charge Income) */
    id: string;
    monthKey: string;
    propertyId: string;
    unit: string;
    ownerName: string;
    ownerId: string;
    status: 'Rented' | 'Vacant';
    totalDeducted: number;
    runningBalance: number;
    totalOwnerIncome: number;
    shortfall: number;
}

function endOfMonthIso(monthKey: string): string {
    const [y, m] = monthKey.split('-').map(Number);
    if (!y || !m) return monthKey;
    const d = new Date(y, m, 0);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Owner balance including all transactions on or before asOfDate (YYYY-MM-DD). Mirrors page logic. */
function computeOwnerBalanceAsOf(ownerId: string, asOfDate: string, state: AppState): number {
    const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
    const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
    const ownerSvcPayCategory = state.categories.find(c => c.id === 'sys-cat-own-svc-pay' || c.name === 'Owner Service Charge Payment');

    const balances: Record<string, number> = {};
    state.contacts.filter(c => c.type === ContactType.OWNER).forEach(owner => {
        balances[owner.id] = 0;
    });

    const txDateOk = (d: string | undefined) => d && d.slice(0, 10) <= asOfDate;

    if (rentalIncomeCategory) {
        state.transactions
            .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory.id && txDateOk(tx.date))
            .forEach(tx => {
                if (tx.propertyId) {
                    const property = state.properties.find(p => p.id === tx.propertyId);
                    if (property?.ownerId && balances[property.ownerId] !== undefined) {
                        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                        if (!isNaN(amount)) balances[property.ownerId] += amount;
                    }
                }
            });
    }

    if (ownerSvcPayCategory) {
        state.transactions
            .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === ownerSvcPayCategory.id && txDateOk(tx.date))
            .forEach(tx => {
                if (tx.contactId && balances[tx.contactId] !== undefined) {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount)) balances[tx.contactId] += amount;
                }
            });
    }

    state.transactions
        .filter(tx => tx.type === TransactionType.EXPENSE && txDateOk(tx.date))
        .forEach(tx => {
            if (tx.categoryId === ownerPayoutCategory?.id && tx.contactId && balances[tx.contactId] !== undefined) {
                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (!isNaN(amount) && amount > 0) balances[tx.contactId] -= amount;
            } else if (tx.propertyId) {
                const category = state.categories.find(c => c.id === tx.categoryId);
                const catName = category?.name || '';
                if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout' || catName.includes('(Tenant)')) return;
                if (tx.categoryId === ownerPayoutCategory?.id) return;

                const property = state.properties.find(p => p.id === tx.propertyId);
                if (property?.ownerId && balances[property.ownerId] !== undefined) {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount) && amount > 0) balances[property.ownerId] -= amount;
                }
            }
        });

    return balances[ownerId] ?? 0;
}

function rentalIncomeForOwnerInMonth(
    ownerId: string,
    monthKey: string,
    rentalIncomeCategoryId: string | undefined,
    state: AppState
): number {
    if (!rentalIncomeCategoryId) return 0;
    let sum = 0;
    for (const tx of state.transactions) {
        if (tx.type !== TransactionType.INCOME || tx.categoryId !== rentalIncomeCategoryId) continue;
        if (!tx.date?.startsWith(monthKey)) continue;
        if (!tx.propertyId) continue;
        const prop = state.properties.find(p => p.id === tx.propertyId);
        if (prop?.ownerId !== ownerId) continue;
        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
        if (!isNaN(amount) && amount > 0) sum += amount;
    }
    return sum;
}

const MonthlyServiceChargesPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showConfirm, showToast, showAlert } = useNotification();
    const { openChat } = useWhatsApp();

    const [viewBy, setViewBy] = useLocalStorage<ViewBy>('msc_viewBy', 'building');
    const [mscStatusFilter, setMscStatusFilter] = useLocalStorage<MscStatusFilter>('msc_statusFilter', 'All');
    const [entityFilterId, setEntityFilterId] = useState<string>('all');

    const [selectedMonth, setSelectedMonth] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 300);
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [receiveOwner, setReceiveOwner] = useState<{ ownerId: string; ownerName: string; amount: number } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const [isNegativePanelOpen, setIsNegativePanelOpen] = useState(true);

    const [selectedNode, setSelectedNode] = useState<ARTreeNode | null>(null);
    const [sidebarWidth, setSidebarWidth] = useLocalStorage<number>('msc_sidebar_width', 340);
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    /** Default: month ascending (oldest at top, newest at bottom). */
    const [ledgerSort, setLedgerSort] = useState<{ key: 'month' | 'unit'; dir: 'asc' | 'desc' }>({ key: 'month', dir: 'asc' });

    const getPropertyStatus = useCallback((propertyId: string): 'Rented' | 'Vacant' => {
        return state.rentalAgreements.some(
            a => a.propertyId === propertyId && a.status === RentalAgreementStatus.ACTIVE
        ) ? 'Rented' : 'Vacant';
    }, [state.rentalAgreements]);

    const getActiveTenantId = useCallback((propertyId: string): string | null => {
        const ag = state.rentalAgreements.find(
            a => a.propertyId === propertyId && a.status === RentalAgreementStatus.ACTIVE
        );
        return ag?.contactId ?? null;
    }, [state.rentalAgreements]);

    const ownerBalances = useMemo(() => {
        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
        const ownerSvcPayCategory = state.categories.find(c => c.id === 'sys-cat-own-svc-pay' || c.name === 'Owner Service Charge Payment');

        const balances: Record<string, number> = {};

        state.contacts.filter(c => c.type === ContactType.OWNER).forEach(owner => {
            balances[owner.id] = 0;
        });

        if (rentalIncomeCategory) {
            state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory.id)
                .forEach(tx => {
                    if (tx.propertyId) {
                        const property = state.properties.find(p => p.id === tx.propertyId);
                        if (property?.ownerId && balances[property.ownerId] !== undefined) {
                            const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                            if (!isNaN(amount)) balances[property.ownerId] += amount;
                        }
                    }
                });
        }

        if (ownerSvcPayCategory) {
            state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === ownerSvcPayCategory.id)
                .forEach(tx => {
                    if (tx.contactId && balances[tx.contactId] !== undefined) {
                        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                        if (!isNaN(amount)) balances[tx.contactId] += amount;
                    }
                });
        }

        state.transactions
            .filter(tx => tx.type === TransactionType.EXPENSE)
            .forEach(tx => {
                if (tx.categoryId === ownerPayoutCategory?.id && tx.contactId && balances[tx.contactId] !== undefined) {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount) && amount > 0) balances[tx.contactId] -= amount;
                }
                else if (tx.propertyId) {
                    const category = state.categories.find(c => c.id === tx.categoryId);
                    const catName = category?.name || '';
                    if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout' || catName.includes('(Tenant)')) return;
                    if (tx.categoryId === ownerPayoutCategory?.id) return;

                    const property = state.properties.find(p => p.id === tx.propertyId);
                    if (property?.ownerId && balances[property.ownerId] !== undefined) {
                        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                        if (!isNaN(amount) && amount > 0) balances[property.ownerId] -= amount;
                    }
                }
            });

        return balances;
    }, [state.transactions, state.categories, state.properties, state.contacts]);

    const propertiesWithCharges = useMemo(() => {
        return state.properties.filter(p => (p.monthlyServiceCharge || 0) > 0);
    }, [state.properties]);

    const svcIncomeCategory = useMemo(() => {
        return state.categories.find(c => c.id === 'sys-cat-svc-inc' || c.name === 'Service Charge Income');
    }, [state.categories]);

    const rentalIncomeCategory = useMemo(() => {
        return state.categories.find(c => c.id === 'sys-cat-rent-inc' || c.name === 'Rental Income');
    }, [state.categories]);

    /** Ids of this credit tx + paired rental-income deduction (single deduction record). */
    const getPairIdsForServiceChargeCreditTx = useCallback((creditTx: Transaction): string[] => {
        if (!svcIncomeCategory || !rentalIncomeCategory) return [];
        if (creditTx.categoryId !== svcIncomeCategory.id || creditTx.type !== TransactionType.INCOME) return [creditTx.id];
        const ids: string[] = [creditTx.id];
        const propertyId = creditTx.propertyId;
        if (!propertyId) return ids;
        const amount = typeof creditTx.amount === 'string' ? parseFloat(creditTx.amount) : Number(creditTx.amount);
        let pairId = '';
        if (creditTx.id.includes('bm-credit')) pairId = creditTx.id.replace('bm-credit', 'bm-debit');
        else if (creditTx.id.includes('bm-debit')) pairId = creditTx.id.replace('bm-debit', 'bm-credit');
        let pair = state.transactions.find(t => t.id === pairId);
        if (!pair) {
            pair = state.transactions.find(t =>
                t.id !== creditTx.id &&
                t.propertyId === propertyId &&
                t.date === creditTx.date &&
                t.type === TransactionType.INCOME &&
                t.categoryId === rentalIncomeCategory.id &&
                Math.abs((typeof t.amount === 'string' ? parseFloat(t.amount) : Number(t.amount)) + amount) < 0.01
            );
        }
        if (pair) ids.push(pair.id);
        return ids;
    }, [state.transactions, svcIncomeCategory, rentalIncomeCategory]);

    const monthOptions = useMemo(() => {
        if (!svcIncomeCategory) return [{ value: 'all', label: 'All' }];
        const months = new Set<string>();
        state.transactions
            .filter(tx => tx.type === TransactionType.INCOME && tx.categoryId === svcIncomeCategory.id && tx.date)
            .forEach(tx => months.add(tx.date.slice(0, 7)));
        const current = currentMonthYyyyMm();
        months.add(current);
        const sortedMonthKeys = Array.from(months).sort((a, b) => b.localeCompare(a));
        return [{ value: 'all', label: 'All' }, ...sortedMonthKeys.map(m => ({ value: m, label: `${m}` }))];
    }, [state.transactions, svcIncomeCategory]);

    const rawPropertyRows = useMemo((): PropertyRow[] => {
        return propertiesWithCharges.map(property => {
            const building = state.buildings.find(b => b.id === property.buildingId);
            const owner = state.contacts.find(c => c.id === property.ownerId);
            const status = getPropertyStatus(property.id);

            const deductedEver = svcIncomeCategory
                ? state.transactions.some(tx =>
                    tx.propertyId === property.id && tx.categoryId === svcIncomeCategory.id
                )
                : false;

            const deductedThisMonth = svcIncomeCategory && selectedMonth !== 'all'
                ? state.transactions.some(tx =>
                    tx.propertyId === property.id &&
                    tx.categoryId === svcIncomeCategory.id &&
                    tx.date.startsWith(selectedMonth)
                )
                : (svcIncomeCategory && selectedMonth === 'all'
                    ? deductedEver
                    : false);

            return {
                propertyId: property.id,
                buildingName: building?.name || 'Unassigned',
                buildingId: property.buildingId || '',
                unit: property.name,
                ownerName: owner?.name || 'Unknown Owner',
                ownerId: property.ownerId || '',
                status,
                monthlyCharge: property.monthlyServiceCharge || 0,
                deductedThisMonth,
                deductedEver,
                ownerBalance: property.ownerId ? (ownerBalances[property.ownerId] || 0) : 0,
            };
        });
    }, [propertiesWithCharges, state.buildings, state.contacts, state.transactions, svcIncomeCategory, selectedMonth, getPropertyStatus, ownerBalances]);

    const tenantsWithSvc = useMemo(() => {
        const ids = new Set<string>();
        for (const p of propertiesWithCharges) {
            const tid = getActiveTenantId(p.id);
            if (tid) ids.add(tid);
        }
        return state.contacts.filter(c => ids.has(c.id));
    }, [propertiesWithCharges, state.contacts, getActiveTenantId]);

    const ownersWithSvc = useMemo(() => {
        const ids = new Set(propertiesWithCharges.map(p => p.ownerId).filter(Boolean) as string[]);
        return state.contacts.filter(c => ids.has(c.id));
    }, [propertiesWithCharges, state.contacts]);

    const buildingsWithSvc = useMemo(() => {
        const ids = new Set(propertiesWithCharges.map(p => p.buildingId).filter(Boolean) as string[]);
        return state.buildings.filter(b => ids.has(b.id));
    }, [propertiesWithCharges, state.buildings]);

    const filteredPropertyRows = useMemo(() => {
        let data = [...rawPropertyRows];

        if (mscStatusFilter === 'Deducted') {
            data = data.filter(d => (selectedMonth === 'all' ? d.deductedEver : d.deductedThisMonth));
        } else if (mscStatusFilter === 'Pending') {
            data = data.filter(d => (selectedMonth === 'all' ? !d.deductedEver : !d.deductedThisMonth));
        }

        if (entityFilterId && entityFilterId !== 'all') {
            if (viewBy === 'tenant') {
                data = data.filter(d => getActiveTenantId(d.propertyId) === entityFilterId);
            } else if (viewBy === 'owner') {
                data = data.filter(d => d.ownerId === entityFilterId);
            } else if (viewBy === 'property') {
                data = data.filter(d => d.propertyId === entityFilterId);
            } else if (viewBy === 'building') {
                data = data.filter(d => d.buildingId === entityFilterId);
            }
        }

        if (debouncedSearch.trim()) {
            const q = debouncedSearch.toLowerCase();
            data = data.filter(d =>
                d.unit.toLowerCase().includes(q) ||
                d.ownerName.toLowerCase().includes(q) ||
                d.buildingName.toLowerCase().includes(q) ||
                (getActiveTenantId(d.propertyId) && state.contacts.find(c => c.id === getActiveTenantId(d.propertyId))?.name.toLowerCase().includes(q))
            );
        }

        return data.sort((a, b) => {
            const ba = a.buildingName.toLowerCase().localeCompare(b.buildingName.toLowerCase());
            if (ba !== 0) return ba;
            return a.unit.toLowerCase().localeCompare(b.unit.toLowerCase());
        });
    }, [rawPropertyRows, mscStatusFilter, selectedMonth, entityFilterId, viewBy, debouncedSearch, getActiveTenantId, state.contacts]);

    const treeData = useMemo((): ARTreeNode[] => {
        const rows = filteredPropertyRows;
        const calcStats = (list: PropertyRow[]) => {
            let outstanding = 0;
            let overdue = 0;
            let secondary = 0;
            for (const r of list) {
                outstanding += r.monthlyCharge;
                if (selectedMonth === 'all') {
                    if (!r.deductedEver) overdue += r.monthlyCharge;
                } else {
                    if (!r.deductedThisMonth) overdue += r.monthlyCharge;
                }
            }
            if (svcIncomeCategory && selectedMonth !== 'all') {
                for (const r of list) {
                    const amt = state.transactions
                        .filter(tx =>
                            tx.propertyId === r.propertyId &&
                            tx.categoryId === svcIncomeCategory.id &&
                            tx.date?.startsWith(selectedMonth)
                        )
                        .reduce((s, tx) => s + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount) || 0), 0);
                    secondary += amt;
                }
            } else if (svcIncomeCategory && selectedMonth === 'all') {
                for (const r of list) {
                    const amt = state.transactions
                        .filter(tx => tx.propertyId === r.propertyId && tx.categoryId === svcIncomeCategory.id)
                        .reduce((s, tx) => s + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount) || 0), 0);
                    secondary += amt;
                }
            }
            return {
                outstanding,
                overdue,
                secondary,
                invoiceCount: list.length,
            };
        };

        if (viewBy === 'building') {
            const grouped = new Map<string, PropertyRow[]>();
            for (const r of rows) {
                const bid = r.buildingId || '__unassigned';
                if (!grouped.has(bid)) grouped.set(bid, []);
                grouped.get(bid)!.push(r);
            }
            return Array.from(grouped.entries()).map(([buildingId, list]) => {
                const building = state.buildings.find(b => b.id === buildingId);
                const stats = calcStats(list);
                const children: ARTreeNode[] = list.map(r => ({
                    id: r.propertyId,
                    name: r.unit,
                    type: 'property' as const,
                    outstanding: r.monthlyCharge,
                    overdue: selectedMonth === 'all' ? (r.deductedEver ? 0 : r.monthlyCharge) : (r.deductedThisMonth ? 0 : r.monthlyCharge),
                    invoiceCount: 1,
                    secondary: svcIncomeCategory
                        ? state.transactions
                            .filter(tx =>
                                tx.propertyId === r.propertyId &&
                                tx.categoryId === svcIncomeCategory.id &&
                                (selectedMonth === 'all' || (tx.date && tx.date.startsWith(selectedMonth)))
                            )
                            .reduce((s, tx) => s + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount) || 0), 0)
                        : 0,
                }));
                return {
                    id: buildingId === '__unassigned' ? '__building_unassigned' : buildingId,
                    name: building?.name || 'Unassigned Building',
                    type: 'building' as const,
                    outstanding: stats.outstanding,
                    overdue: stats.overdue,
                    secondary: stats.secondary,
                    invoiceCount: stats.invoiceCount,
                    children,
                };
            });
        }

        if (viewBy === 'property') {
            return rows.map(r => ({
                id: r.propertyId,
                name: r.unit,
                type: 'property' as const,
                outstanding: r.monthlyCharge,
                overdue: selectedMonth === 'all' ? (r.deductedEver ? 0 : r.monthlyCharge) : (r.deductedThisMonth ? 0 : r.monthlyCharge),
                secondary: svcIncomeCategory
                    ? state.transactions
                        .filter(tx =>
                            tx.propertyId === r.propertyId &&
                            tx.categoryId === svcIncomeCategory.id &&
                            (selectedMonth === 'all' || (tx.date && tx.date.startsWith(selectedMonth)))
                        )
                        .reduce((s, tx) => s + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount) || 0), 0)
                    : 0,
                invoiceCount: 1,
            }));
        }

        if (viewBy === 'tenant') {
            const grouped = new Map<string, PropertyRow[]>();
            for (const r of rows) {
                const tid = getActiveTenantId(r.propertyId) || '__no_tenant';
                if (!grouped.has(tid)) grouped.set(tid, []);
                grouped.get(tid)!.push(r);
            }
            return Array.from(grouped.entries()).map(([tenantId, list]) => {
                const contact = state.contacts.find(c => c.id === tenantId);
                const stats = calcStats(list);
                const children: ARTreeNode[] = list.map(r => ({
                    id: r.propertyId,
                    name: r.unit,
                    type: 'property' as const,
                    outstanding: r.monthlyCharge,
                    overdue: selectedMonth === 'all' ? (r.deductedEver ? 0 : r.monthlyCharge) : (r.deductedThisMonth ? 0 : r.monthlyCharge),
                    invoiceCount: 1,
                    secondary: svcIncomeCategory
                        ? state.transactions
                            .filter(tx =>
                                tx.propertyId === r.propertyId &&
                                tx.categoryId === svcIncomeCategory.id &&
                                (selectedMonth === 'all' || (tx.date && tx.date.startsWith(selectedMonth)))
                            )
                            .reduce((s, tx) => s + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount) || 0), 0)
                        : 0,
                }));
                return {
                    id: tenantId === '__no_tenant' ? '__tenant_vacant' : tenantId,
                    name: tenantId === '__no_tenant' ? 'Vacant / No tenant' : (contact?.name || 'Unknown Tenant'),
                    type: 'tenant' as const,
                    outstanding: stats.outstanding,
                    overdue: stats.overdue,
                    secondary: stats.secondary,
                    invoiceCount: stats.invoiceCount,
                    children: children.length > 0 ? children : undefined,
                };
            });
        }

        if (viewBy === 'owner') {
            const grouped = new Map<string, PropertyRow[]>();
            for (const r of rows) {
                const oid = r.ownerId || '__unassigned';
                if (!grouped.has(oid)) grouped.set(oid, []);
                grouped.get(oid)!.push(r);
            }
            return Array.from(grouped.entries()).map(([ownerId, list]) => {
                const owner = state.contacts.find(c => c.id === ownerId);
                const stats = calcStats(list);

                const buildingGrouped = new Map<string, PropertyRow[]>();
                for (const r of list) {
                    const bId = r.buildingId || '__unassigned';
                    if (!buildingGrouped.has(bId)) buildingGrouped.set(bId, []);
                    buildingGrouped.get(bId)!.push(r);
                }

                const children: ARTreeNode[] = Array.from(buildingGrouped.entries()).map(([bId, bRows]) => {
                    const building = state.buildings.find(b => b.id === bId);
                    const bStats = calcStats(bRows);
                    const propChildren: ARTreeNode[] = bRows.map(r => ({
                        id: `${r.propertyId}-owner-${ownerId}`,
                        name: r.unit,
                        type: 'property' as const,
                        outstanding: r.monthlyCharge,
                        overdue: selectedMonth === 'all' ? (r.deductedEver ? 0 : r.monthlyCharge) : (r.deductedThisMonth ? 0 : r.monthlyCharge),
                        invoiceCount: 1,
                        secondary: svcIncomeCategory
                            ? state.transactions
                                .filter(tx =>
                                    tx.propertyId === r.propertyId &&
                                    tx.categoryId === svcIncomeCategory.id &&
                                    (selectedMonth === 'all' || (tx.date && tx.date.startsWith(selectedMonth)))
                                )
                                .reduce((s, tx) => s + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount) || 0), 0)
                            : 0,
                    }));
                    return {
                        id: bId === '__unassigned' ? `bld-unassigned-${ownerId}` : `${bId}-owner-${ownerId}`,
                        name: building?.name || 'Unassigned Building',
                        type: 'building' as const,
                        outstanding: bStats.outstanding,
                        overdue: bStats.overdue,
                        secondary: bStats.secondary,
                        invoiceCount: bStats.invoiceCount,
                        children: propChildren,
                    };
                });

                return {
                    id: ownerId === '__unassigned' ? '__owner_unassigned' : ownerId,
                    name: owner?.name || 'Unassigned Owner',
                    type: 'owner' as const,
                    outstanding: stats.outstanding,
                    overdue: stats.overdue,
                    secondary: stats.secondary,
                    invoiceCount: stats.invoiceCount,
                    children: children.length > 0 ? children : undefined,
                };
            });
        }

        return [];
    }, [filteredPropertyRows, viewBy, state.buildings, state.contacts, state.transactions, svcIncomeCategory, selectedMonth, getActiveTenantId]);

    useEffect(() => {
        setSelectedNode(null);
    }, [viewBy, mscStatusFilter, entityFilterId, selectedMonth, debouncedSearch]);

    const selectedPropertyRowsForLedger = useMemo(() => {
        if (!selectedNode) return filteredPropertyRows;
        const nodeId = selectedNode.id;

        if (nodeId.startsWith('tenant__')) {
            const parts = nodeId.split('__');
            const contactId = parts[1];
            const propId = parts[2];
            return filteredPropertyRows.filter(r => r.propertyId === propId && getActiveTenantId(r.propertyId) === contactId);
        }

        switch (selectedNode.type) {
            case 'building':
                if (nodeId.includes('unassigned')) return filteredPropertyRows.filter(r => !r.buildingId);
                return filteredPropertyRows.filter(r => r.buildingId === nodeId);
            case 'property': {
                const cleanPropId = nodeId.includes('-owner-') ? nodeId.split('-owner-')[0] : nodeId;
                return filteredPropertyRows.filter(r => r.propertyId === cleanPropId);
            }
            case 'tenant':
                if (nodeId === '__tenant_vacant') return filteredPropertyRows.filter(r => !getActiveTenantId(r.propertyId));
                return filteredPropertyRows.filter(r => getActiveTenantId(r.propertyId) === nodeId);
            case 'owner':
                if (nodeId.includes('unassigned')) return filteredPropertyRows.filter(r => !r.ownerId);
                return filteredPropertyRows.filter(r => r.ownerId === nodeId);
            default:
                return filteredPropertyRows;
        }
    }, [selectedNode, filteredPropertyRows, getActiveTenantId]);

    const ledgerRows = useMemo((): LedgerRow[] => {
        if (!svcIncomeCategory || !rentalIncomeCategory) return [];
        const rid = rentalIncomeCategory.id;
        const propIds = new Set(selectedPropertyRowsForLedger.map(r => r.propertyId));

        const ownerMonthSvcTotal = (ownerId: string, monthKey: string): number => {
            let sum = 0;
            for (const t of state.transactions) {
                if (t.type !== TransactionType.INCOME || t.categoryId !== svcIncomeCategory.id) continue;
                if (!t.date?.startsWith(monthKey) || !t.propertyId) continue;
                const prop = state.properties.find(p => p.id === t.propertyId);
                if (prop?.ownerId !== ownerId) continue;
                const a = typeof t.amount === 'string' ? parseFloat(t.amount) : Number(t.amount);
                if (!isNaN(a) && a > 0) sum += a;
            }
            return sum;
        };

        const rows: LedgerRow[] = [];
        for (const tx of state.transactions) {
            if (tx.type !== TransactionType.INCOME || tx.categoryId !== svcIncomeCategory.id) continue;
            if (!tx.propertyId || !propIds.has(tx.propertyId)) continue;
            const mk = tx.date?.slice(0, 7);
            if (!mk) continue;
            if (selectedMonth !== 'all' && mk !== selectedMonth) continue;
            const amt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
            if (isNaN(amt) || amt <= 0) continue;

            const propRow = selectedPropertyRowsForLedger.find(r => r.propertyId === tx.propertyId)
                || rawPropertyRows.find(r => r.propertyId === tx.propertyId);
            if (!propRow) continue;

            const asOf = endOfMonthIso(mk);
            const runningBalance = computeOwnerBalanceAsOf(propRow.ownerId, asOf, state);
            const totalOwnerIncome = rentalIncomeForOwnerInMonth(propRow.ownerId, mk, rid, state);
            const svcTotalOwnerMonth = ownerMonthSvcTotal(propRow.ownerId, mk);
            const shortfall = Math.max(0, svcTotalOwnerMonth - totalOwnerIncome);

            rows.push({
                id: tx.id,
                monthKey: mk,
                propertyId: tx.propertyId,
                unit: propRow.unit,
                ownerName: propRow.ownerName,
                ownerId: propRow.ownerId,
                status: propRow.status,
                totalDeducted: amt,
                runningBalance,
                totalOwnerIncome,
                shortfall,
            });
        }

        rows.sort((a, b) => {
            let cmp = 0;
            if (ledgerSort.key === 'month') {
                cmp = a.monthKey.localeCompare(b.monthKey);
                if (cmp === 0) cmp = a.unit.localeCompare(b.unit);
                if (cmp === 0) cmp = a.id.localeCompare(b.id);
            } else {
                cmp = a.unit.localeCompare(b.unit);
                if (cmp === 0) cmp = a.monthKey.localeCompare(b.monthKey);
            }
            return ledgerSort.dir === 'asc' ? cmp : -cmp;
        });
        return rows;
    }, [svcIncomeCategory, rentalIncomeCategory, state, selectedPropertyRowsForLedger, selectedMonth, rawPropertyRows, ledgerSort]);

    const gridData = filteredPropertyRows;

    const deductedAmountForPeriod = useMemo(() => {
        if (!svcIncomeCategory) return 0;
        return state.transactions
            .filter(tx => {
                if (tx.type !== TransactionType.INCOME || tx.categoryId !== svcIncomeCategory.id) return false;
                if (selectedMonth !== 'all' && !tx.date.startsWith(selectedMonth)) return false;
                return true;
            })
            .reduce((sum, tx) => sum + (typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount) || 0), 0);
    }, [state.transactions, svcIncomeCategory, selectedMonth]);

    const summaryStats = useMemo(() => {
        const total = propertiesWithCharges.length;
        const rented = propertiesWithCharges.filter(p => getPropertyStatus(p.id) === 'Rented').length;
        const vacant = total - rented;
        const totalCharges = propertiesWithCharges.reduce((sum, p) => sum + (p.monthlyServiceCharge || 0), 0);
        const deductedCount = gridData.filter(d => d.deductedThisMonth).length;
        const pendingCount = gridData.length - gridData.filter(d => d.deductedThisMonth).length;

        const ownersNegative = Object.entries(ownerBalances).filter(([, bal]) => bal < -0.01);
        const totalNegative = ownersNegative.reduce((sum, [, bal]) => sum + bal, 0);

        return { total, rented, vacant, totalCharges, deductedCount, pendingCount, ownersNegativeCount: ownersNegative.length, totalNegative, deductedAmount: deductedAmountForPeriod };
    }, [propertiesWithCharges, gridData, getPropertyStatus, ownerBalances, deductedAmountForPeriod]);

    const ownerNegativeBalances = useMemo<OwnerNegativeBalance[]>(() => {
        const negativeOwners: OwnerNegativeBalance[] = [];

        Object.entries(ownerBalances).forEach(([ownerId, balance]) => {
            if (balance < -0.01) {
                const owner = state.contacts.find(c => c.id === ownerId);
                const vacantProps = state.properties
                    .filter(p => p.ownerId === ownerId && getPropertyStatus(p.id) === 'Vacant')
                    .map(p => p.name);

                negativeOwners.push({
                    ownerId,
                    ownerName: owner?.name || 'Unknown Owner',
                    vacantProperties: vacantProps,
                    totalOwed: balance,
                });
            }
        });

        return negativeOwners.sort((a, b) => a.totalOwed - b.totalOwed);
    }, [ownerBalances, state.contacts, state.properties, getPropertyStatus]);

    const handleDeleteLedgerRow = async (row: LedgerRow) => {
        const creditTx = state.transactions.find(t => t.id === row.id);
        if (!creditTx) {
            showToast('Transaction not found.', 'info');
            return;
        }
        const confirmed = await showConfirm(
            `Remove this service charge deduction for ${row.unit} (${row.monthKey}) — ${CURRENCY} ${formatCurrency(row.totalDeducted)}? The paired owner income adjustment will be removed too.`,
            { title: 'Delete Service Charge Record', confirmLabel: 'Delete', cancelLabel: 'Cancel' }
        );
        if (!confirmed) return;
        const ids = getPairIdsForServiceChargeCreditTx(creditTx);
        if (ids.length === 0) {
            showToast('No deduction found to delete.', 'info');
            return;
        }
        dispatch({ type: 'BATCH_DELETE_TRANSACTIONS', payload: { transactionIds: ids } });
        showToast('Service charge record removed.', 'success');
        setTimeout(() => {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('save-state-before-logout'));
            }
        }, 150);
    };

    const handleWhatsAppServiceChargeOwner = useCallback(async (row: LedgerRow) => {
        const contact = state.contacts.find(c => c.id === row.ownerId);
        if (!contact) {
            await showAlert('Owner contact not found.');
            return;
        }
        if (!contact.contactNo || !WhatsAppService.isValidPhoneNumber(contact.contactNo)) {
            await showAlert(`Add a valid mobile number for "${contact.name}" in Contacts to send WhatsApp.`);
            return;
        }
        const lines: string[] = [
            `Hello ${contact.name},`,
            '',
            `Monthly service charges — ${row.unit} (${row.monthKey})`,
            `Service charge deducted: ${CURRENCY} ${formatCurrency(row.totalDeducted)}`,
            `Rental income (this month): ${CURRENCY} ${formatCurrency(row.totalOwnerIncome)}`,
        ];
        if (row.shortfall > 0.01) {
            lines.push(`Outstanding vs rental income: ${CURRENCY} ${formatCurrency(row.shortfall)}.`);
        }
        if (row.runningBalance < -0.01) {
            lines.push(
                `Your owner account balance is ${CURRENCY} ${formatCurrency(row.runningBalance)}. Please remit ${CURRENCY} ${formatCurrency(Math.abs(row.runningBalance))} when convenient.`
            );
        } else if (row.shortfall > 0.01) {
            lines.push('Please arrange payment for the outstanding service charge portion.');
        }
        lines.push('', '— PBooks Pro');
        const message = lines.join('\n');
        try {
            sendOrOpenWhatsApp(
                { contact, message, phoneNumber: contact.contactNo || undefined },
                () => state.whatsAppMode,
                openChat
            );
        } catch (e) {
            await showAlert(e instanceof Error ? e.message : 'Could not open WhatsApp.');
        }
    }, [state.contacts, state.whatsAppMode, openChat, showAlert]);

    const handleBulkRun = async () => {
        let rentalIncomeCategory = state.categories.find(c => c.id === 'sys-cat-rent-inc' || c.name === 'Rental Income');
        let svcCat = state.categories.find(c => c.id === 'sys-cat-svc-inc' || c.name === 'Service Charge Income');
        let cashAccount = state.accounts.find(a => a.name === 'Cash') || state.accounts[0];

        const catsToCreate: Category[] = [];

        if (!rentalIncomeCategory) {
            showAlert("Critical Error: 'Rental Income' category not found.");
            return;
        }

        if (!svcCat) {
            const newCat: Category = {
                id: 'sys-cat-svc-inc',
                name: 'Service Charge Income',
                type: TransactionType.INCOME,
                isPermanent: true,
                isRental: true,
                description: 'Income from monthly building service charges.',
            };
            catsToCreate.push(newCat);
            svcCat = newCat;
        }

        if (catsToCreate.length > 0) catsToCreate.forEach(cat => dispatch({ type: 'ADD_CATEGORY', payload: cat }));
        if (!cashAccount) { showAlert('No accounts found.'); return; }

        if (propertiesWithCharges.length === 0) {
            showAlert('No properties have a "Monthly Service Charge" configured in Settings.', { title: 'No Charges Configured' });
            return;
        }

        const runMonth = selectedMonth === 'all' ? currentMonthYyyyMm() : selectedMonth;
        const confirmed = await showConfirm(
            `Run auto-deduction for ${propertiesWithCharges.length} properties for ${runMonth}?\n\nThis deducts service charges from owner balances regardless of rental status.`,
            { title: 'Run Service Charges', confirmLabel: 'Run Process' }
        );

        if (confirmed) {
            setIsProcessing(true);
            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                const dateStr = `${runMonth}-01`;
                const newTxs: Transaction[] = [];
                let rentedCount = 0;
                let vacantCount = 0;
                let skippedCount = 0;
                const baseTimestamp = Date.now();

                for (let i = 0; i < propertiesWithCharges.length; i++) {
                    const property = propertiesWithCharges[i];
                    if (!property.ownerId) continue;

                    const alreadyApplied = state.transactions.some(tx =>
                        tx.propertyId === property.id &&
                        tx.categoryId === svcCat!.id &&
                        tx.date.startsWith(runMonth)
                    );

                    if (alreadyApplied) {
                        skippedCount++;
                        continue;
                    }

                    const amount = property.monthlyServiceCharge || 0;
                    const isRented = getPropertyStatus(property.id) === 'Rented';
                    const ownerId = getOwnerIdForPropertyOnDate(
                        property.id,
                        dateStr,
                        state.propertyOwnershipHistory || [],
                        property.ownerId
                    );

                    const debitTx: Transaction = {
                        id: `bm-debit-${baseTimestamp}-${i}`,
                        type: TransactionType.INCOME,
                        amount: -amount,
                        date: dateStr,
                        description: `Service Charge Deduction for ${property.name} (${isRented ? 'Rented' : 'Vacant'})`,
                        accountId: cashAccount.id,
                        categoryId: rentalIncomeCategory.id,
                        propertyId: property.id,
                        buildingId: property.buildingId,
                        contactId: property.ownerId,
                        ownerId,
                        isSystem: true,
                    };

                    const creditTx: Transaction = {
                        id: `bm-credit-${baseTimestamp}-${i}`,
                        type: TransactionType.INCOME,
                        amount: amount,
                        date: dateStr,
                        description: `Service Charge Allocation for ${property.name} (${isRented ? 'Rented' : 'Vacant'})`,
                        accountId: cashAccount.id,
                        categoryId: svcCat!.id,
                        propertyId: property.id,
                        buildingId: property.buildingId,
                        ownerId,
                        isSystem: true,
                    };

                    newTxs.push(debitTx, creditTx);
                    if (isRented) rentedCount++;
                    else vacantCount++;
                }

                if (newTxs.length > 0) {
                    dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: newTxs });
                    dispatch({ type: 'SET_LAST_SERVICE_CHARGE_RUN', payload: new Date().toISOString() });
                    showToast(
                        `Deducted: ${rentedCount} rented, ${vacantCount} vacant.${skippedCount > 0 ? ` ${skippedCount} already applied.` : ''}`,
                        'success'
                    );
                    setTimeout(() => {
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('save-state-before-logout'));
                        }
                    }, 150);
                } else {
                    showToast('No new charges to apply (all up to date).', 'info');
                }
            } catch (error) {
                console.error(error);
                showAlert('An error occurred during processing.');
            } finally {
                setIsProcessing(false);
            }
        }
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!containerRef.current) return;
        const containerLeft = containerRef.current.getBoundingClientRect().left;
        const newWidth = e.clientX - containerLeft;
        if (newWidth > 200 && newWidth < 600) {
            setSidebarWidth(newWidth);
        }
    }, [setSidebarWidth]);

    useEffect(() => {
        if (!isResizing) return;
        const handleUp = () => {
            setIsResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('blur', handleUp);
        document.addEventListener('visibilitychange', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('blur', handleUp);
            document.removeEventListener('visibilitychange', handleUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing, handleMouseMove]);

    const filterInputClass =
        'w-full pl-2.5 py-1.5 text-sm border border-slate-300 rounded-md shadow-sm focus:ring-2 focus:ring-accent/50 focus:border-accent bg-white';

    const findNodeById = useCallback((nodes: ARTreeNode[], id: string): ARTreeNode | null => {
        for (const n of nodes) {
            if (n.id === id) return n;
            if (n.children) {
                const f = findNodeById(n.children, id);
                if (f) return f;
            }
        }
        return null;
    }, []);

    return (
        <div className="flex flex-col h-full min-h-0 overflow-hidden bg-slate-50/50">
            <div className="flex-shrink-0 space-y-4 px-3 pt-2 overflow-y-auto max-h-[45vh] lg:max-h-none">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 flex-shrink-0 min-w-0">
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3 min-w-0">
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide truncate">Total Properties</p>
                        <p className="text-lg font-bold text-slate-800 mt-0.5">{summaryStats.total}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3 min-w-0">
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide truncate">Rented</p>
                        <p className="text-lg font-bold text-emerald-600 mt-0.5">{summaryStats.rented}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3 min-w-0">
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide truncate">Vacant</p>
                        <p className="text-lg font-bold text-amber-600 mt-0.5">{summaryStats.vacant}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3 min-w-0">
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide truncate">Monthly Charges</p>
                        <p className="text-lg font-bold text-slate-800 mt-0.5 truncate" title={`${CURRENCY} ${formatCurrency(summaryStats.totalCharges)}`}>{CURRENCY} {formatCurrency(summaryStats.totalCharges)}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3 min-w-0">
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide truncate">Deducted (Period)</p>
                        <p className="text-lg font-bold text-emerald-600 mt-0.5 truncate" title={`${CURRENCY} ${formatCurrency(summaryStats.deductedAmount)}`}>{CURRENCY} {formatCurrency(summaryStats.deductedAmount)}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">{selectedMonth === 'all' ? 'All time' : selectedMonth}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-3 min-w-0">
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide truncate">Deducted / Pending</p>
                        <p className="text-lg font-bold mt-0.5">
                            <span className="text-emerald-600">{summaryStats.deductedCount}</span>
                            <span className="text-slate-400 mx-0.5">/</span>
                            <span className="text-amber-600">{summaryStats.pendingCount}</span>
                        </p>
                    </div>
                    <button
                        onClick={() => setIsNegativePanelOpen(prev => !prev)}
                        className={`rounded-lg border shadow-sm p-3 text-left transition-colors min-w-0 ${
                            summaryStats.ownersNegativeCount > 0
                                ? 'bg-red-50 border-red-200 hover:bg-red-100'
                                : 'bg-white border-slate-200'
                        }`}
                    >
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide truncate">Owners Owed</p>
                        <p className={`text-lg font-bold mt-0.5 ${summaryStats.ownersNegativeCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                            {summaryStats.ownersNegativeCount}
                        </p>
                        {summaryStats.ownersNegativeCount > 0 && (
                            <p className="text-[9px] text-red-500 mt-0.5 truncate" title={`${CURRENCY} ${formatCurrency(Math.abs(summaryStats.totalNegative))}`}>{CURRENCY} {formatCurrency(Math.abs(summaryStats.totalNegative))}</p>
                        )}
                    </button>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col xl:flex-row gap-3 items-start xl:items-center justify-between flex-shrink-0">
                    <div className="flex flex-wrap gap-3 items-center w-full xl:w-auto">
                        <Select
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(e.target.value)}
                            className="w-40 text-sm py-1.5"
                        >
                            {monthOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label === 'all' ? 'All' : opt.label}</option>
                            ))}
                        </Select>

                        <div className="flex flex-wrap items-center gap-1.5">
                            {(['All', 'Deducted', 'Pending'] as const).map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setMscStatusFilter(s)}
                                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                                        mscStatusFilter === s ? 'bg-accent text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-500 uppercase">View by:</span>
                            {(['tenant', 'owner', 'property', 'building'] as const).map(g => (
                                <button
                                    key={g}
                                    type="button"
                                    onClick={() => { setViewBy(g); setEntityFilterId('all'); }}
                                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                                        viewBy === g ? 'bg-accent text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {g}
                                </button>
                            ))}
                        </div>
                        <select
                            value={entityFilterId}
                            onChange={e => setEntityFilterId(e.target.value)}
                            className={filterInputClass}
                            style={{ width: '200px' }}
                            aria-label="Filter by entity"
                        >
                            <option value="all">
                                All {viewBy === 'tenant' ? 'Tenants' : viewBy === 'owner' ? 'Owners' : viewBy === 'property' ? 'Properties' : 'Buildings'}
                            </option>
                            {viewBy === 'tenant' && tenantsWithSvc.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                            {viewBy === 'owner' && ownersWithSvc.map(o => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                            {viewBy === 'property' && propertiesWithCharges.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                            {viewBy === 'building' && buildingsWithSvc.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>

                        <div className="relative w-full sm:w-52">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                <span className="h-4 w-4">{ICONS.search}</span>
                            </div>
                            <Input
                                placeholder="Search unit, owner, building, tenant..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 py-1.5 text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 flex-wrap w-full xl:w-auto justify-end">
                        <Button variant="secondary" onClick={() => setIsManualModalOpen(true)}>
                            Manual Deduction
                        </Button>
                        <Button
                            onClick={handleBulkRun}
                            disabled={isProcessing}
                            className={isProcessing ? 'opacity-70 cursor-not-allowed' : ''}
                        >
                            {isProcessing ? 'Processing...' : 'Run Monthly Deduction'}
                        </Button>
                    </div>
                </div>
            </div>

            <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden px-3 pb-2">
                    <div
                        className="flex-shrink-0 border-r border-slate-200 overflow-hidden hidden md:flex flex-col rounded-l-lg bg-white border border-slate-200 border-r-0"
                        style={{ width: `${sidebarWidth}px` }}
                    >
                        <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0 rounded-tl-lg">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                                Service charges
                            </span>
                            <span className="text-[10px] text-slate-400">
                                {treeData.length} {viewBy === 'building' ? 'buildings' : viewBy === 'property' ? 'units' : viewBy === 'tenant' ? 'tenants' : 'owners'}
                            </span>
                        </div>
                        <div className="flex-1 min-h-0 overflow-hidden border-b border-slate-200 rounded-bl-lg">
                            <ARTreeView
                                treeData={treeData}
                                selectedNodeId={selectedNode?.id || null}
                                onNodeSelect={setSelectedNode}
                                searchQuery={debouncedSearch}
                                amountLabel="Monthly"
                                secondaryLabel={selectedMonth === 'all' ? 'Ded. (all)' : 'Ded.'}
                                overdueLabel="pending"
                                emptyText="No properties match filters"
                            />
                        </div>
                    </div>

                    <div
                        className="w-1.5 cursor-col-resize hover:bg-indigo-200 active:bg-indigo-300 transition-colors hidden md:block flex-shrink-0 self-stretch min-h-[120px]"
                        onMouseDown={e => {
                            e.preventDefault();
                            setIsResizing(true);
                        }}
                    />

                    <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white rounded-lg border border-slate-200 shadow-sm md:rounded-l-none">
                        <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 flex-shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-semibold text-slate-700 truncate">
                                    {selectedNode ? selectedNode.name : 'All units (filters)'}
                                </span>
                                {selectedNode && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedNode(null)}
                                        className="text-[10px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-200"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                            <span className="text-[10px] text-slate-400 tabular-nums">
                                {ledgerRows.length} record{ledgerRows.length !== 1 ? 's' : ''}
                            </span>
                        </div>

                        <div className="md:hidden px-3 py-2 bg-white border-b border-slate-200">
                            <select
                                value={selectedNode?.id || ''}
                                onChange={e => {
                                    const id = e.target.value;
                                    if (!id) { setSelectedNode(null); return; }
                                    const n = findNodeById(treeData, id);
                                    setSelectedNode(n);
                                }}
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md"
                                aria-label="Select tree node"
                            >
                                <option value="">All units (filters)</option>
                                {treeData.map(n => (
                                    <option key={n.id} value={n.id}>
                                        {n.name} ({CURRENCY} {n.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex-1 min-h-0 overflow-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-0.5 hover:text-slate-900"
                                                onClick={() => setLedgerSort(p => ({
                                                    key: 'month',
                                                    dir: p.key === 'month' && p.dir === 'desc' ? 'asc' : 'desc',
                                                }))}
                                            >
                                                Month
                                                <span className="text-[9px] text-slate-400">{ledgerSort.key === 'month' ? (ledgerSort.dir === 'desc' ? '▼' : '▲') : '↕'}</span>
                                            </button>
                                        </th>
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-0.5 hover:text-slate-900"
                                                onClick={() => setLedgerSort(p => (
                                                    p.key === 'unit'
                                                        ? { key: 'unit', dir: p.dir === 'asc' ? 'desc' : 'asc' }
                                                        : { key: 'unit', dir: 'asc' }
                                                ))}
                                            >
                                                Unit
                                                <span className="text-[9px] text-slate-400">{ledgerSort.key === 'unit' ? (ledgerSort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                                            </button>
                                        </th>
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap">Owner</th>
                                        <th className="px-3 py-2.5 text-center font-semibold text-slate-600 whitespace-nowrap">Status</th>
                                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 whitespace-nowrap">Total deducted</th>
                                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 whitespace-nowrap">Running balance</th>
                                        <th className="px-3 py-2.5 text-right font-semibold text-slate-600 whitespace-nowrap">Owner income (mo.)</th>
                                        <th className="px-3 py-2.5 text-center font-semibold text-slate-600 whitespace-nowrap">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {ledgerRows.length > 0 ? ledgerRows.map(row => (
                                        <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-3 py-2.5 whitespace-nowrap text-slate-700 font-medium">{row.monthKey}</td>
                                            <td className="px-3 py-2.5 text-slate-800">{row.unit}</td>
                                            <td className="px-3 py-2.5 text-slate-700">{row.ownerName}</td>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                    row.status === 'Rented' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                                }`}>
                                                    {row.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-mono text-slate-800">{CURRENCY} {formatCurrency(row.totalDeducted)}</td>
                                            <td className={`px-3 py-2.5 text-right font-mono font-semibold ${row.runningBalance < -0.01 ? 'text-red-600' : 'text-slate-700'}`}>
                                                {CURRENCY} {formatCurrency(row.runningBalance)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-mono text-slate-700">{CURRENCY} {formatCurrency(row.totalOwnerIncome)}</td>
                                            <td className="px-3 py-2.5 text-center">
                                                <div className="flex flex-wrap items-center justify-center gap-1.5">
                                                    {row.runningBalance < -0.01 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setReceiveOwner({
                                                                ownerId: row.ownerId,
                                                                ownerName: row.ownerName,
                                                                amount: Math.abs(row.runningBalance),
                                                            })}
                                                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-1.5 py-0.5 rounded hover:bg-indigo-50"
                                                        >
                                                            Receive
                                                        </button>
                                                    )}
                                                    {(row.runningBalance < -0.01 || row.shortfall > 0.01) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleWhatsAppServiceChargeOwner(row)}
                                                            className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 px-1.5 py-0.5 rounded bg-green-50 hover:bg-green-100 transition-colors"
                                                            title="Message owner about pending service charge / balance"
                                                        >
                                                            <span className="w-3.5 h-3.5 flex-shrink-0">{ICONS.whatsapp}</span>
                                                            WhatsApp
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const tx = state.transactions.find(t => t.id === row.id);
                                                            if (tx) setEditingTransaction(tx);
                                                        }}
                                                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-1.5 py-0.5 rounded hover:bg-indigo-50"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteLedgerRow(row)}
                                                        className="text-xs font-semibold text-red-600 hover:text-red-800 px-1.5 py-0.5 rounded hover:bg-red-50"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                                                {filteredPropertyRows.length === 0
                                                    ? 'No properties with service charges match the filters.'
                                                    : 'No deduction records for this selection. Run monthly deduction or use Manual Deduction.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-3 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-sm flex-shrink-0">
                            <span className="text-slate-500">{selectedPropertyRowsForLedger.length} unit{selectedPropertyRowsForLedger.length !== 1 ? 's' : ''} in scope</span>
                            <span className="font-bold text-slate-700">
                                Total deducted (table): {CURRENCY} {formatCurrency(ledgerRows.reduce((s, r) => s + r.totalDeducted, 0))}
                            </span>
                        </div>
                    </div>
                </div>

            {ownerNegativeBalances.length > 0 && (
                <div className={`flex-shrink-0 bg-white rounded-lg border border-red-200 shadow-sm overflow-hidden transition-all mx-3 mb-2 ${isNegativePanelOpen ? '' : 'max-h-12'}`}>
                    <button
                        onClick={() => setIsNegativePanelOpen(prev => !prev)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                            <span className="font-semibold text-red-700 text-sm">
                                {ownerNegativeBalances.length} Owner{ownerNegativeBalances.length > 1 ? 's' : ''} with Negative Balance
                            </span>
                            <span className="text-xs text-red-500 ml-2">
                                Total: {CURRENCY} {formatCurrency(Math.abs(ownerNegativeBalances.reduce((s, o) => s + o.totalOwed, 0)))}
                            </span>
                        </div>
                        <svg className={`w-5 h-5 text-red-400 transition-transform ${isNegativePanelOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>

                    {isNegativePanelOpen && (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-red-100 text-sm">
                                <thead className="bg-red-50/50">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Owner</th>
                                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Vacant Properties</th>
                                        <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Total Owed</th>
                                        <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-red-50">
                                    {ownerNegativeBalances.map(owner => (
                                        <tr key={owner.ownerId} className="hover:bg-red-50/50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-slate-800">{owner.ownerName}</td>
                                            <td className="px-4 py-3 text-slate-600 text-xs">
                                                {owner.vacantProperties.length > 0
                                                    ? owner.vacantProperties.join(', ')
                                                    : <span className="text-slate-400 italic">All properties rented</span>
                                                }
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-bold text-red-600">
                                                {CURRENCY} {formatCurrency(Math.abs(owner.totalOwed))}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Button
                                                    variant="secondary"
                                                    onClick={() => setReceiveOwner({
                                                        ownerId: owner.ownerId,
                                                        ownerName: owner.ownerName,
                                                        amount: Math.abs(owner.totalOwed)
                                                    })}
                                                    className="text-xs !py-1.5 !px-3"
                                                >
                                                    Receive Payment
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            <ManualServiceChargeModal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} />

            {editingTransaction && (
                <ServiceChargeUpdateModal
                    isOpen={!!editingTransaction}
                    onClose={() => setEditingTransaction(null)}
                    transaction={editingTransaction}
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
        </div>
    );
};

export default MonthlyServiceChargesPage;
