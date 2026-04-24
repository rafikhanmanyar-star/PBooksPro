/**
 * Indexes and pure helpers for Monthly Service Charges UI performance.
 */

import type { AppState, Transaction } from '../types';
import { TransactionType, ContactType } from '../types';
import { hasMultipleOwnersOnDate, getOwnerSharePercentageOnDate } from './propertyOwnershipService';

export interface MscLedgerRow {
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

export interface ServiceChargeIndexes {
    svcCategoryId: string | null;
    propertyHasScIncome: Set<string>;
    propertyMonthsWithSc: Map<string, Set<string>>;
    scTotalByProperty: Map<string, number>;
    scTotalByPropertyMonth: Map<string, number>;
    monthsWithScIncome: Set<string>;
    ownerMonthScTotal: Map<string, number>;
    portfolioScAllTime: number;
    portfolioScByMonth: Map<string, number>;
}

function pmKey(propertyId: string, monthYyyyMm: string): string {
    return `${propertyId}|${monthYyyyMm}`;
}

export function endOfMonthIso(monthKey: string): string {
    const [y, m] = monthKey.split('-').map(Number);
    if (!y || !m) return monthKey;
    const d = new Date(y, m, 0);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

export function buildServiceChargeIndexes(
    transactions: Transaction[],
    svcCategoryId: string | null,
    propertiesById: Map<string, { ownerId?: string | null }>
): ServiceChargeIndexes {
    const propertyHasScIncome = new Set<string>();
    const propertyMonthsWithSc = new Map<string, Set<string>>();
    const scTotalByProperty = new Map<string, number>();
    const scTotalByPropertyMonth = new Map<string, number>();
    const monthsWithScIncome = new Set<string>();
    const ownerMonthScTotal = new Map<string, number>();
    const portfolioScByMonth = new Map<string, number>();
    let portfolioScAllTime = 0;

    if (!svcCategoryId) {
        return {
            svcCategoryId: null,
            propertyHasScIncome,
            propertyMonthsWithSc,
            scTotalByProperty,
            scTotalByPropertyMonth,
            monthsWithScIncome,
            ownerMonthScTotal,
            portfolioScAllTime: 0,
            portfolioScByMonth,
        };
    }

    for (const tx of transactions) {
        if (tx.type !== TransactionType.INCOME || tx.categoryId !== svcCategoryId || !tx.propertyId) continue;
        const pid = String(tx.propertyId);
        const mk = tx.date?.slice(0, 7);
        const raw = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
        const amt = !isNaN(raw) && raw > 0 ? raw : 0;
        if (amt <= 0) continue;

        propertyHasScIncome.add(pid);
        if (mk) {
            monthsWithScIncome.add(mk);
            let mset = propertyMonthsWithSc.get(pid);
            if (!mset) {
                mset = new Set();
                propertyMonthsWithSc.set(pid, mset);
            }
            mset.add(mk);
            const pkm = pmKey(pid, mk);
            scTotalByPropertyMonth.set(pkm, (scTotalByPropertyMonth.get(pkm) || 0) + amt);
            portfolioScByMonth.set(mk, (portfolioScByMonth.get(mk) || 0) + amt);
        }
        scTotalByProperty.set(pid, (scTotalByProperty.get(pid) || 0) + amt);
        portfolioScAllTime += amt;

        const prop = propertiesById.get(pid);
        const oid = prop?.ownerId;
        if (oid && mk) {
            const ok = `${oid}|${mk}`;
            ownerMonthScTotal.set(ok, (ownerMonthScTotal.get(ok) || 0) + amt);
        }
    }

    return {
        svcCategoryId,
        propertyHasScIncome,
        propertyMonthsWithSc,
        scTotalByProperty,
        scTotalByPropertyMonth,
        monthsWithScIncome,
        ownerMonthScTotal,
        portfolioScAllTime,
        portfolioScByMonth,
    };
}

/** Secondary column: total SC income for property, optionally scoped to one yyyy-mm. */
export function getScSecondaryAmount(
    indexes: ServiceChargeIndexes,
    propertyId: string,
    selectedMonth: string
): number {
    if (!indexes.svcCategoryId) return 0;
    if (selectedMonth === 'all') {
        return indexes.scTotalByProperty.get(propertyId) || 0;
    }
    return indexes.scTotalByPropertyMonth.get(pmKey(propertyId, selectedMonth)) || 0;
}

/** Sum of SC secondary for a list of property rows (O(rows) lookups). */
export function sumScSecondaryForPropertyRows(
    indexes: ServiceChargeIndexes,
    rows: Array<{ propertyId: string }>,
    selectedMonth: string
): number {
    let s = 0;
    for (const r of rows) {
        s += getScSecondaryAmount(indexes, r.propertyId, selectedMonth);
    }
    return s;
}

function ownerMonthKey(ownerId: string, monthKey: string): string {
    return `${ownerId}|${monthKey}`;
}

/**
 * Precompute running balance and rental income for unique (ownerId, monthKey) pairs
 * used by ledger rows — avoids O(rows × full_tx_scan) duplicate work.
 */
export function buildLedgerMetricMaps(
    state: AppState,
    uniqueOwnerMonths: Map<string, { ownerId: string; monthKey: string }>,
    rentalIncomeCategoryId: string | undefined
): { runningBalanceByOwnerMonth: Map<string, number>; rentalIncomeByOwnerMonth: Map<string, number> } {
    const runningBalanceByOwnerMonth = new Map<string, number>();
    const rentalIncomeByOwnerMonth = new Map<string, number>();
    for (const { ownerId, monthKey } of uniqueOwnerMonths.values()) {
        const k = ownerMonthKey(ownerId, monthKey);
        runningBalanceByOwnerMonth.set(
            k,
            computeOwnerBalanceAsOf(ownerId, endOfMonthIso(monthKey), state)
        );
        rentalIncomeByOwnerMonth.set(
            k,
            rentalIncomeForOwnerInMonth(ownerId, monthKey, rentalIncomeCategoryId, state)
        );
    }
    return { runningBalanceByOwnerMonth, rentalIncomeByOwnerMonth };
}

/** Owner balance including all transactions on or before asOfDate (YYYY-MM-DD). */
export function computeOwnerBalanceAsOf(ownerId: string, asOfDate: string, state: AppState): number {
    const categoriesById = new Map(state.categories.map(c => [c.id, c]));
    const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
    const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
    const ownerSvcPayCategory = state.categories.find(c => c.id === 'sys-cat-own-svc-pay' || c.name === 'Owner Service Charge Payment');
    const ownerShareCat = state.categories.find(c => c.name === 'Owner Rental Income Share');
    const clearingRentCat = state.categories.find(c => c.name === 'Owner Rental Allocation (Clearing)');

    const balances: Record<string, number> = {};
    for (const c of state.contacts) {
        if (c.type === ContactType.OWNER) balances[c.id] = 0;
    }

    const txDateOk = (d: string | undefined) => d && d.slice(0, 10) <= asOfDate;

    if (rentalIncomeCategory) {
        for (const tx of state.transactions) {
            if (tx.type !== TransactionType.INCOME || !txDateOk(tx.date)) continue;
            if (clearingRentCat && tx.categoryId === clearingRentCat.id) continue;
            const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
            if (isNaN(amount)) continue;

            if (ownerShareCat && tx.categoryId === ownerShareCat.id && tx.contactId && balances[tx.contactId] !== undefined) {
                balances[tx.contactId] += amount;
                continue;
            }

            if (tx.categoryId !== rentalIncomeCategory.id) continue;
            if (!tx.propertyId) continue;
            const d = (tx.date || '').slice(0, 10);
            if (d && hasMultipleOwnersOnDate(state, String(tx.propertyId), d)) {
                const hasExplicitShares =
                    ownerShareCat &&
                    state.transactions.some(
                        st =>
                            st.categoryId === ownerShareCat.id &&
                            ((st.invoiceId && st.invoiceId === tx.invoiceId) || (st.batchId && st.batchId === tx.batchId))
                    );
                if (!hasExplicitShares) {
                    for (const oid of Object.keys(balances)) {
                        const pct = getOwnerSharePercentageOnDate(state, String(tx.propertyId), oid, d);
                        if (pct > 0) balances[oid] += Math.round(amount * pct) / 100;
                    }
                }
                continue;
            }
            const property = state.properties.find(p => p.id === tx.propertyId);
            if (property?.ownerId && balances[property.ownerId] !== undefined) {
                balances[property.ownerId] += amount;
            }
        }
    }

    if (ownerSvcPayCategory) {
        for (const tx of state.transactions) {
            if (tx.type !== TransactionType.INCOME || tx.categoryId !== ownerSvcPayCategory.id || !txDateOk(tx.date)) continue;
            if (tx.contactId && balances[tx.contactId] !== undefined) {
                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (!isNaN(amount)) balances[tx.contactId] += amount;
            }
        }
    }

    for (const tx of state.transactions) {
        if (tx.type !== TransactionType.EXPENSE || !txDateOk(tx.date)) continue;
        if (tx.categoryId === ownerPayoutCategory?.id && tx.contactId && balances[tx.contactId] !== undefined) {
            const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
            if (!isNaN(amount) && amount > 0) balances[tx.contactId] -= amount;
        } else if (tx.propertyId) {
            const category = categoriesById.get(tx.categoryId);
            const catName = category?.name || '';
            if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout' || catName.includes('(Tenant)')) continue;
            if (tx.categoryId === ownerPayoutCategory?.id) continue;

            const property = state.properties.find(p => p.id === tx.propertyId);
            if (property?.ownerId && balances[property.ownerId] !== undefined) {
                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (!isNaN(amount) && amount > 0) balances[property.ownerId] -= amount;
            }
        }
    }

    return balances[ownerId] ?? 0;
}

export function rentalIncomeForOwnerInMonth(
    ownerId: string,
    monthKey: string,
    rentalIncomeCategoryId: string | undefined,
    state: AppState
): number {
    const shareCat = state.categories.find(c => c.name === 'Owner Rental Income Share');
    const clearCat = state.categories.find(c => c.name === 'Owner Rental Allocation (Clearing)');
    let sum = 0;
    for (const tx of state.transactions) {
        if (tx.type !== TransactionType.INCOME || !tx.date?.startsWith(monthKey)) continue;
        if (!tx.propertyId) continue;
        if (clearCat && tx.categoryId === clearCat.id) continue;

        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
        if (isNaN(amount) || amount <= 0) continue;

        if (shareCat && tx.categoryId === shareCat.id && tx.contactId === ownerId) {
            sum += amount;
            continue;
        }

        if (!rentalIncomeCategoryId || tx.categoryId !== rentalIncomeCategoryId) continue;
        const d = (tx.date || '').slice(0, 10);
        if (d && hasMultipleOwnersOnDate(state, String(tx.propertyId), d)) {
            const hasExplicitShares =
                shareCat &&
                state.transactions.some(
                    st =>
                        st.categoryId === shareCat.id &&
                        ((st.invoiceId && st.invoiceId === tx.invoiceId) || (st.batchId && st.batchId === tx.batchId))
                );
            if (!hasExplicitShares) {
                const pct = getOwnerSharePercentageOnDate(state, String(tx.propertyId), ownerId, d);
                if (pct > 0) sum += Math.round(amount * pct) / 100;
            }
            continue;
        }
        const prop = state.properties.find(p => p.id === tx.propertyId);
        if (prop?.ownerId !== ownerId) continue;
        sum += amount;
    }
    return sum;
}
