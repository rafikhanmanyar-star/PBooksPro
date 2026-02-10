
import React, { useState, useMemo, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, Transaction, Category, RentalAgreementStatus, ContactType } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Modal from '../ui/Modal';
import { ICONS, CURRENCY } from '../../constants';
import ManualServiceChargeModal from './ManualServiceChargeModal';
import ServiceChargeUpdateModal from './ServiceChargeUpdateModal';
import ReceiveFromOwnerModal from './ReceiveFromOwnerModal';
import { useNotification } from '../../context/NotificationContext';
import { formatCurrency } from '../../utils/numberUtils';

type SortKey = 'building' | 'unit' | 'owner' | 'status' | 'monthlyCharge' | 'thisMonth' | 'ownerBalance';

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
    ownerBalance: number;
}

interface OwnerNegativeBalance {
    ownerId: string;
    ownerName: string;
    vacantProperties: string[];
    totalOwed: number;
}

const MonthlyServiceChargesPage: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showConfirm, showToast, showAlert } = useNotification();

    // Toolbar State
    const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [buildingFilter, setBuildingFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showHistory, setShowHistory] = useState(false);

    // Modal States
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [receiveOwner, setReceiveOwner] = useState<{ ownerId: string; ownerName: string; amount: number } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'building', direction: 'asc' });

    // Negative balance panel
    const [isNegativePanelOpen, setIsNegativePanelOpen] = useState(true);

    // --- Helpers ---

    const getPropertyStatus = useCallback((propertyId: string): 'Rented' | 'Vacant' => {
        return state.rentalAgreements.some(
            a => a.propertyId === propertyId && a.status === RentalAgreementStatus.ACTIVE
        ) ? 'Rented' : 'Vacant';
    }, [state.rentalAgreements]);

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (sortConfig.key !== column) return <span className="text-slate-300 opacity-50 ml-1 text-[10px]">↕</span>;
        return <span className="text-accent ml-1 text-[10px]">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    // --- Owner Balance Calculation ---
    const ownerBalances = useMemo(() => {
        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
        const ownerSvcPayCategory = state.categories.find(c => c.name === 'Owner Service Charge Payment');

        const balances: Record<string, number> = {};

        // Initialize all owners
        state.contacts.filter(c => c.type === ContactType.OWNER).forEach(owner => {
            balances[owner.id] = 0;
        });

        // Credits: Rental Income (positive = rent, negative = service charge deductions)
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

        // Credits: Owner Service Charge Payment (money received from owner)
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

        // Debits: Payouts + Property Expenses
        state.transactions
            .filter(tx => tx.type === TransactionType.EXPENSE)
            .forEach(tx => {
                // Direct payouts
                if (tx.categoryId === ownerPayoutCategory?.id && tx.contactId && balances[tx.contactId] !== undefined) {
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount) && amount > 0) balances[tx.contactId] -= amount;
                }
                // Property expenses (excluding payouts, security, tenant items)
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

    // --- Property Grid Data ---
    const propertiesWithCharges = useMemo(() => {
        return state.properties.filter(p => (p.monthlyServiceCharge || 0) > 0);
    }, [state.properties]);

    const svcIncomeCategory = useMemo(() => {
        return state.categories.find(c => c.name === 'Service Charge Income');
    }, [state.categories]);

    const gridData = useMemo<PropertyRow[]>(() => {
        let data = propertiesWithCharges.map(property => {
            const building = state.buildings.find(b => b.id === property.buildingId);
            const owner = state.contacts.find(c => c.id === property.ownerId);
            const status = getPropertyStatus(property.id);

            // Check if deducted this month
            const deductedThisMonth = svcIncomeCategory
                ? state.transactions.some(tx =>
                    tx.propertyId === property.id &&
                    tx.categoryId === svcIncomeCategory.id &&
                    tx.date.startsWith(selectedMonth)
                )
                : false;

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
                ownerBalance: property.ownerId ? (ownerBalances[property.ownerId] || 0) : 0,
            };
        });

        // Apply building filter
        if (buildingFilter !== 'all') {
            data = data.filter(d => d.buildingId === buildingFilter);
        }

        // Apply search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            data = data.filter(d =>
                d.unit.toLowerCase().includes(q) ||
                d.ownerName.toLowerCase().includes(q) ||
                d.buildingName.toLowerCase().includes(q)
            );
        }

        // Apply sort
        return data.sort((a, b) => {
            let valA: any = a[sortConfig.key];
            let valB: any = b[sortConfig.key];

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = (valB as string).toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [propertiesWithCharges, state.buildings, state.contacts, state.transactions, svcIncomeCategory, selectedMonth, buildingFilter, searchQuery, sortConfig, getPropertyStatus, ownerBalances]);

    // --- Summary KPIs ---
    const summaryStats = useMemo(() => {
        const total = propertiesWithCharges.length;
        const rented = propertiesWithCharges.filter(p => getPropertyStatus(p.id) === 'Rented').length;
        const vacant = total - rented;
        const totalCharges = propertiesWithCharges.reduce((sum, p) => sum + (p.monthlyServiceCharge || 0), 0);
        const deductedCount = gridData.filter(d => d.deductedThisMonth).length;
        const pendingCount = gridData.length - gridData.filter(d => d.deductedThisMonth).length;

        // Owners with negative balance
        const ownersNegative = Object.entries(ownerBalances).filter(([, bal]) => bal < -0.01);
        const totalNegative = ownersNegative.reduce((sum, [, bal]) => sum + bal, 0);

        return { total, rented, vacant, totalCharges, deductedCount, pendingCount, ownersNegativeCount: ownersNegative.length, totalNegative };
    }, [propertiesWithCharges, gridData, getPropertyStatus, ownerBalances]);

    // --- Owner Negative Balances ---
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

    // --- History View: Transaction list (existing style) ---
    const historyTransactions = useMemo(() => {
        if (!showHistory) return [];
        const serviceIncomeCategoryIds = state.categories
            .filter(c => c.type === TransactionType.INCOME && c.name.toLowerCase().includes('service charge'))
            .map(c => c.id);
        if (serviceIncomeCategoryIds.length === 0) return [];

        const targetIds = new Set(serviceIncomeCategoryIds);
        return state.transactions
            .filter(tx => {
                if (tx.type !== TransactionType.INCOME || !tx.categoryId || !targetIds.has(tx.categoryId)) return false;
                return tx.date.startsWith(selectedMonth);
            })
            .map(tx => {
                const property = state.properties.find(p => p.id === tx.propertyId);
                const owner = state.contacts.find(c => c.id === (tx.contactId || property?.ownerId));
                return { ...tx, propertyName: property?.name || 'Unknown', ownerName: owner?.name || 'Unknown' };
            })
            .sort((a, b) => b.date.localeCompare(a.date));
    }, [showHistory, selectedMonth, state.transactions, state.categories, state.properties, state.contacts]);

    // --- Bulk Deduction ---
    const handleBulkRun = async () => {
        let rentalIncomeCategory = state.categories.find(c => c.id === 'sys-cat-rent-inc' || c.name === 'Rental Income');
        let svcCat = state.categories.find(c => c.name === 'Service Charge Income');
        let cashAccount = state.accounts.find(a => a.name === 'Cash') || state.accounts[0];

        const catsToCreate: Category[] = [];

        if (!rentalIncomeCategory) {
            showAlert("Critical Error: 'Rental Income' category not found.");
            return;
        }

        if (!svcCat) {
            const newCat: Category = {
                id: 'cat-service-charge',
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

        const confirmed = await showConfirm(
            `Run auto-deduction for ${propertiesWithCharges.length} properties for ${selectedMonth}?\n\nThis deducts service charges from owner balances regardless of rental status.`,
            { title: 'Run Service Charges', confirmLabel: 'Run Process' }
        );

        if (confirmed) {
            setIsProcessing(true);
            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                const dateStr = `${selectedMonth}-01`;
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
                        tx.date.startsWith(selectedMonth)
                    );

                    if (alreadyApplied) {
                        skippedCount++;
                        continue;
                    }

                    const amount = property.monthlyServiceCharge || 0;
                    const isRented = getPropertyStatus(property.id) === 'Rented';

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

    // --- Building options for filter ---
    const buildingOptions = useMemo(() => {
        const ids = new Set(propertiesWithCharges.map(p => p.buildingId).filter(Boolean));
        return state.buildings.filter(b => ids.has(b.id)).sort((a, b) => a.name.localeCompare(b.name));
    }, [propertiesWithCharges, state.buildings]);

    return (
        <div className="flex flex-col h-full space-y-4 overflow-y-auto">
            {/* Section 1: Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 flex-shrink-0">
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total Properties</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{summaryStats.total}</p>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Rented</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{summaryStats.rented}</p>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Vacant</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">{summaryStats.vacant}</p>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Monthly Charges</p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{CURRENCY} {formatCurrency(summaryStats.totalCharges)}</p>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Deducted / Pending</p>
                    <p className="text-2xl font-bold mt-1">
                        <span className="text-emerald-600">{summaryStats.deductedCount}</span>
                        <span className="text-slate-400 mx-1">/</span>
                        <span className="text-amber-600">{summaryStats.pendingCount}</span>
                    </p>
                </div>
                <button
                    onClick={() => setIsNegativePanelOpen(prev => !prev)}
                    className={`rounded-lg border shadow-sm p-4 text-left transition-colors ${
                        summaryStats.ownersNegativeCount > 0
                            ? 'bg-red-50 border-red-200 hover:bg-red-100'
                            : 'bg-white border-slate-200'
                    }`}
                >
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Owners Owed</p>
                    <p className={`text-2xl font-bold mt-1 ${summaryStats.ownersNegativeCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {summaryStats.ownersNegativeCount}
                    </p>
                    {summaryStats.ownersNegativeCount > 0 && (
                        <p className="text-xs text-red-500 mt-0.5">{CURRENCY} {formatCurrency(Math.abs(summaryStats.totalNegative))}</p>
                    )}
                </button>
            </div>

            {/* Toolbar */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between flex-shrink-0">
                <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
                    {/* Month Selector */}
                    <Input
                        type="month"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="w-40 py-1.5 text-sm"
                    />

                    {/* Building Filter */}
                    <Select
                        value={buildingFilter}
                        onChange={e => setBuildingFilter(e.target.value)}
                        className="w-44 text-sm py-1.5"
                    >
                        <option value="all">All Buildings</option>
                        {buildingOptions.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </Select>

                    {/* Search */}
                    <div className="relative w-full sm:w-48">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <span className="h-4 w-4">{ICONS.search}</span>
                        </div>
                        <Input
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 py-1.5 text-sm"
                        />
                    </div>

                    {/* History Toggle */}
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={showHistory}
                            onChange={e => setShowHistory(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        History
                    </label>
                </div>

                <div className="flex gap-2 flex-wrap w-full lg:w-auto justify-end">
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

            {/* Section 2: Properties Grid (main) OR History View */}
            {!showHistory ? (
                <div className="flex-grow overflow-hidden flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm min-h-0">
                    <div className="flex-grow overflow-y-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th onClick={() => handleSort('building')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Building <SortIcon column="building" /></th>
                                    <th onClick={() => handleSort('unit')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Unit <SortIcon column="unit" /></th>
                                    <th onClick={() => handleSort('owner')} className="px-4 py-3 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Owner <SortIcon column="owner" /></th>
                                    <th onClick={() => handleSort('status')} className="px-4 py-3 text-center font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Status <SortIcon column="status" /></th>
                                    <th onClick={() => handleSort('monthlyCharge')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Monthly Charge <SortIcon column="monthlyCharge" /></th>
                                    <th onClick={() => handleSort('thisMonth')} className="px-4 py-3 text-center font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">This Month <SortIcon column="thisMonth" /></th>
                                    <th onClick={() => handleSort('ownerBalance')} className="px-4 py-3 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap">Owner Balance <SortIcon column="ownerBalance" /></th>
                                    <th className="px-4 py-3 text-center font-semibold text-slate-600 whitespace-nowrap">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {gridData.length > 0 ? gridData.map(row => (
                                    <tr key={row.propertyId} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-slate-600">{row.buildingName}</td>
                                        <td className="px-4 py-3 text-slate-800 font-medium">{row.unit}</td>
                                        <td className="px-4 py-3 text-slate-700">{row.ownerName}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                                row.status === 'Rented'
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {row.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-700">{CURRENCY} {formatCurrency(row.monthlyCharge)}</td>
                                        <td className="px-4 py-3 text-center">
                                            {row.deductedThisMonth ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                    Deducted
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500">
                                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" /></svg>
                                                    Pending
                                                </span>
                                            )}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-mono font-semibold ${row.ownerBalance < -0.01 ? 'text-red-600' : 'text-slate-700'}`}>
                                            {CURRENCY} {formatCurrency(row.ownerBalance)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {row.ownerBalance < -0.01 ? (
                                                <button
                                                    onClick={() => setReceiveOwner({
                                                        ownerId: row.ownerId,
                                                        ownerName: row.ownerName,
                                                        amount: Math.abs(row.ownerBalance)
                                                    })}
                                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                                                >
                                                    Receive
                                                </button>
                                            ) : (
                                                <span className="text-slate-300">--</span>
                                            )}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                                            No properties with service charges configured. Add monthly service charges in Property Settings.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-sm">
                        <span className="text-slate-500">{gridData.length} properties</span>
                        <span className="font-bold text-slate-700">Total Monthly: {CURRENCY} {formatCurrency(gridData.reduce((s, r) => s + r.monthlyCharge, 0))}</span>
                    </div>
                </div>
            ) : (
                /* History View: Transaction-level */
                <div className="flex-grow overflow-hidden flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm min-h-0">
                    <div className="flex-grow overflow-y-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Date</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Unit</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Owner</th>
                                    <th className="px-4 py-3 text-left font-semibold text-slate-600">Description</th>
                                    <th className="px-4 py-3 text-right font-semibold text-slate-600">Amount</th>
                                    <th className="px-4 py-3 text-center font-semibold text-slate-600">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {historyTransactions.length > 0 ? historyTransactions.map(tx => (
                                    <tr key={tx.id} onClick={() => setEditingTransaction(tx)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                                        <td className="px-4 py-3 whitespace-nowrap text-slate-700">{new Date(tx.date).toLocaleDateString()}</td>
                                        <td className="px-4 py-3 text-slate-800 font-medium">{(tx as any).propertyName}</td>
                                        <td className="px-4 py-3 text-slate-600">{(tx as any).ownerName}</td>
                                        <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-xs">{tx.description}</td>
                                        <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-600">{CURRENCY} {formatCurrency(tx.amount)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button className="text-indigo-600 hover:text-indigo-900 text-xs font-semibold">Edit</button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                                            No service charge transactions found for {selectedMonth}.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-3 border-t border-slate-200 bg-slate-50 text-right text-sm font-bold text-slate-700">
                        Total: {CURRENCY} {formatCurrency(historyTransactions.reduce((sum, tx) => sum + tx.amount, 0))}
                    </div>
                </div>
            )}

            {/* Section 3: Owner Negative Balances Panel */}
            {ownerNegativeBalances.length > 0 && (
                <div className={`flex-shrink-0 bg-white rounded-lg border border-red-200 shadow-sm overflow-hidden transition-all ${isNegativePanelOpen ? '' : 'max-h-12'}`}>
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

            {/* Modals */}
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
