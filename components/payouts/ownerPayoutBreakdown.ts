import { AppState, TransactionType } from '../../types';
import {
    getPayoutOwnerIdsForProperty,
    hasMultipleOwnersOnDate,
    getOwnerSharePercentageOnDate,
    resolveOwnerForTransaction,
    isFormerOwner,
    getOwnershipSharesForPropertyOnDate,
    getPropertyExpenseAllocatedAmountForOwner,
    getBrokerFeeAllocatedAmountForOwner,
    getBillCostAllocatedAmountForOwner,
} from '../../services/propertyOwnershipService';
import type { PropertyBalanceItem } from './OwnerPayoutModal';

export type OwnerPropertyBreakdownMap = Record<
    string,
    { rent: PropertyBalanceItem[]; security: PropertyBalanceItem[] }
>;

/**
 * First property in `state.properties` order where this owner is a payee (matches breakdown iteration).
 * Used to attribute unallocated Owner Service Charge payments to one unit.
 */
export function isFirstPropertyForOwnerRentSlice(state: AppState, ownerId: string, propertyIdStr: string): boolean {
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const prop of state.properties) {
        const allOwnerIds = getPayoutOwnerIdsForProperty(state, prop.id, todayStr);
        if (allOwnerIds.size === 0 && prop.ownerId) allOwnerIds.add(prop.ownerId);
        if (!allOwnerIds.has(ownerId)) continue;
        return String(prop.id) === propertyIdStr;
    }
    return false;
}

/**
 * Collected / paid / net balance for one owner on one unit — same rules as Owner Payouts tree and modal.
 * Owner Payout expenses without `propertyId` are excluded (they belong to portfolio view, not a single unit).
 */
export function computeOwnerRentCollectedPaidBalanceForProperty(
    state: AppState,
    ownerId: string,
    propertyIdStr: string
): { collected: number; paid: number; balance: number } | null {
    const rentalIncomeCategory = state.categories.find((c) => c.name === 'Rental Income');
    if (!rentalIncomeCategory) return null;

    const ownerSvcPayCategory = state.categories.find((c) => c.name === 'Owner Service Charge Payment');
    const ownerPayoutCategory = state.categories.find((c) => c.name === 'Owner Payout');
    const brokerFeeCategory = state.categories.find((c) => c.name === 'Broker Fee');
    const ownerShareCat = state.categories.find((c) => c.name === 'Owner Rental Income Share');
    const clearingRentCat = state.categories.find((c) => c.name === 'Owner Rental Allocation (Clearing)');

    const brokerFeeTxIds = new Set<string>();
    if (brokerFeeCategory) {
        state.transactions.forEach((tx) => {
            if (tx.type === TransactionType.EXPENSE && tx.categoryId === brokerFeeCategory.id) brokerFeeTxIds.add(tx.id);
        });
    }
    const ownerBillIds = new Set(state.bills.filter((b) => b.propertyId && !b.projectId).map((b) => b.id));
    const billPaymentTxIds = new Set<string>();
    state.transactions.forEach((tx) => {
        if (tx.type === TransactionType.EXPENSE && tx.billId && ownerBillIds.has(tx.billId)) billPaymentTxIds.add(tx.id);
    });

    const txIdsWithShareLines = new Set<string>();
    if (ownerShareCat) {
        state.transactions.forEach((tx) => {
            if (tx.categoryId === ownerShareCat.id && tx.invoiceId) txIdsWithShareLines.add(tx.invoiceId);
            if (tx.categoryId === ownerShareCat.id && tx.batchId) txIdsWithShareLines.add(tx.batchId);
        });
    }

    let collected = 0;
    let paid = 0;

    state.transactions
        .filter((tx) => {
            if (tx.type !== TransactionType.INCOME || String(tx.propertyId) !== propertyIdStr) return false;
            if (clearingRentCat && tx.categoryId === clearingRentCat.id) return false;
            if (tx.categoryId === rentalIncomeCategory.id) {
                const d = (tx.date || '').slice(0, 10);
                if (d && hasMultipleOwnersOnDate(state, propertyIdStr, d)) {
                    const hasExplicitShares =
                        (tx.invoiceId && txIdsWithShareLines.has(tx.invoiceId)) ||
                        (tx.batchId && txIdsWithShareLines.has(tx.batchId));
                    if (hasExplicitShares) return false;
                    return true;
                }
                return true;
            }
            if (ownerShareCat && tx.categoryId === ownerShareCat.id && tx.contactId) return true;
            return false;
        })
        .forEach((tx) => {
            let amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
            if (isNaN(amount)) return;

            if (ownerShareCat && tx.categoryId === ownerShareCat.id && tx.contactId) {
                if (tx.contactId === ownerId) {
                    if (amount > 0) collected += amount;
                    else if (amount < 0) paid += Math.abs(amount);
                }
                return;
            }

            const d = (tx.date || '').slice(0, 10);
            const isMultiOwner = d && hasMultipleOwnersOnDate(state, propertyIdStr, d);

            if (isMultiOwner) {
                const pct = getOwnerSharePercentageOnDate(state, propertyIdStr, ownerId, d);
                const share = Math.round((amount * pct) / 100);
                if (share > 0) collected += share;
                else if (share < 0) paid += Math.abs(share);
            } else {
                const ownerIdForTx = resolveOwnerForTransaction(state, tx);
                if (ownerIdForTx !== ownerId) return;
                if (amount > 0) collected += amount;
                else paid += Math.abs(amount);
            }
        });

    if (ownerSvcPayCategory) {
        const isFirstPropertyForOwner = isFirstPropertyForOwnerRentSlice(state, ownerId, propertyIdStr);
        let unallocatedSvc = 0;
        state.transactions
            .filter(
                (tx) =>
                    tx.type === TransactionType.INCOME &&
                    tx.categoryId === ownerSvcPayCategory.id &&
                    tx.contactId === ownerId
            )
            .forEach((tx) => {
                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (isNaN(amount) || amount <= 0) return;
                if (tx.propertyId != null && String(tx.propertyId) === propertyIdStr) {
                    collected += amount;
                } else if (!tx.propertyId) {
                    unallocatedSvc += amount;
                }
            });
        if (isFirstPropertyForOwner && unallocatedSvc > 0) collected += unallocatedSvc;
    }

    state.transactions
        .filter(
            (tx) =>
                tx.type === TransactionType.EXPENSE &&
                String(tx.propertyId) === propertyIdStr &&
                !brokerFeeTxIds.has(tx.id) &&
                !billPaymentTxIds.has(tx.id)
        )
        .forEach((tx) => {
            const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
            if (isNaN(amount) || amount <= 0) return;
            if (tx.categoryId === ownerPayoutCategory?.id) {
                if (tx.contactId === ownerId) paid += amount;
                return;
            }
            const category = state.categories.find((c) => c.id === tx.categoryId);
            const catName = category?.name || '';
            if (catName === 'Security Deposit Refund' || catName === 'Owner Security Payout' || catName.includes('(Tenant)')) return;
            paid += getPropertyExpenseAllocatedAmountForOwner(state, tx, amount, ownerId);
        });

    state.rentalAgreements
        .filter((ra) => {
            if (ra.previousAgreementId) return false;
            const propId = ra.propertyId ?? (ra as { property_id?: string }).property_id;
            const fee = typeof ra.brokerFee === 'number' ? ra.brokerFee : parseFloat(String(ra.brokerFee ?? 0));
            return propId && String(propId) === propertyIdStr && ra.brokerId && !isNaN(fee) && fee > 0;
        })
        .forEach((ra) => {
            paid += getBrokerFeeAllocatedAmountForOwner(state, ra, ownerId);
        });

    state.bills
        .filter((b) => String(b.propertyId) === propertyIdStr && !b.projectId)
        .forEach((b) => {
            paid += getBillCostAllocatedAmountForOwner(state, b, ownerId);
        });

    const balance = collected - paid;
    return { collected, paid, balance };
}

/** One row per (unit, owner) so rent payouts can pay former and current owners on the same unit. */
export function expandRentBreakdownForModal(
    state: AppState,
    modalOwnerId: string,
    primaryItems: PropertyBalanceItem[],
    fullBreakdown: OwnerPropertyBreakdownMap
): PropertyBalanceItem[] {
    const out: PropertyBalanceItem[] = [];
    const seen = new Set<string>();

    const todayStr = new Date().toISOString().slice(0, 10);

    for (const item of primaryItems) {
        const pid = String(item.propertyId);
        const ownersToShow = new Set<string>(getPayoutOwnerIdsForProperty(state, pid, todayStr));
        ownersToShow.add(modalOwnerId);

        const shareRows = getOwnershipSharesForPropertyOnDate(state, pid, todayStr);
        const multiCo = shareRows.length > 1;

        for (const oid of ownersToShow) {
            const slice = fullBreakdown[oid]?.rent?.find((r) => String(r.propertyId) === pid);
            const due = slice?.balanceDue ?? 0;
            if (due <= 0.01) continue;
            const key = `${pid}::${oid}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const c = state.contacts.find((x) => x.id === oid);
            const former = isFormerOwner(state, oid);
            const baseName = c?.name ?? 'Owner';
            const pct = shareRows.find((s) => s.ownerId === oid)?.percentage;
            const pctSuffix = multiCo && pct != null ? ` (${pct.toFixed(0)}%)` : '';
            const label = former ? `${baseName} (former)${pctSuffix}` : `${baseName}${pctSuffix}`;
            out.push({
                propertyId: item.propertyId,
                propertyName: item.propertyName,
                balanceDue: due,
                payeeOwnerId: oid,
                payeeOwnerName: label,
            });
        }
    }

    out.sort((a, b) => {
        const pn = (a.propertyName || '').localeCompare(b.propertyName || '', undefined, { sensitivity: 'base' });
        if (pn !== 0) return pn;
        return (a.payeeOwnerName || '').localeCompare(b.payeeOwnerName || '', undefined, { sensitivity: 'base' });
    });
    return out;
}

/** Full portfolio per-owner rent/security slices (same rules as Owner Payouts page). */
export function buildOwnerPropertyBreakdown(state: AppState): OwnerPropertyBreakdownMap {
    const rentalIncomeCategory = state.categories.find((c) => c.name === 'Rental Income');
    const secDepCategory = state.categories.find((c) => c.name === 'Security Deposit');
    const secRefCategory = state.categories.find((c) => c.name === 'Security Deposit Refund');
    const ownerSecPayoutCategory = state.categories.find((c) => c.name === 'Owner Security Payout');
    const result: OwnerPropertyBreakdownMap = {};

    const todayStr = new Date().toISOString().slice(0, 10);
    state.properties.forEach((prop) => {
        const allOwnerIds = getPayoutOwnerIdsForProperty(state, prop.id, todayStr);
        if (allOwnerIds.size === 0 && prop.ownerId) allOwnerIds.add(prop.ownerId);
        const propIdStr = String(prop.id);

        for (const ownerId of allOwnerIds) {
            if (!result[ownerId]) result[ownerId] = { rent: [], security: [] };

            if (rentalIncomeCategory) {
                const slice = computeOwnerRentCollectedPaidBalanceForProperty(state, ownerId, propIdStr);
                if (slice && (slice.collected > 0.01 || slice.paid > 0.01)) {
                    const { balance } = slice;
                    result[ownerId].rent.push({
                        propertyId: prop.id,
                        propertyName: prop.name || 'Unit',
                        balanceDue: Math.max(0, balance),
                    });
                }
            }

            if (secDepCategory) {
                let collected = 0;
                let paid = 0;
                state.transactions
                    .filter((tx) => tx.type === TransactionType.INCOME && tx.categoryId === secDepCategory.id && String(tx.propertyId) === propIdStr)
                    .forEach((tx) => {
                        const txOwnerId = resolveOwnerForTransaction(state, tx);
                        if (txOwnerId !== ownerId) return;
                        const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                        if (!isNaN(amount) && amount > 0) collected += amount;
                    });
                state.transactions
                    .filter((tx) => tx.type === TransactionType.EXPENSE && String(tx.propertyId) === propIdStr)
                    .forEach((tx) => {
                        const txOwnerId = resolveOwnerForTransaction(state, tx);
                        if (txOwnerId !== ownerId) return;
                        const category = state.categories.find((c) => c.id === tx.categoryId);
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
                if (collected > 0.01 || paid > 0.01) {
                    result[ownerId].security.push({
                        propertyId: prop.id,
                        propertyName: prop.name || 'Unit',
                        balanceDue: Math.max(0, balance),
                    });
                }
            }
        }
    });
    return result;
}

/**
 * Security-deposit slices only (no rent collected/paid math). Used by Owner Security Deposit report
 * so opening that page does not run {@link computeOwnerRentCollectedPaidBalanceForProperty} for every owner×property.
 */
export function buildOwnerSecurityPropertyBreakdownOnly(state: AppState): OwnerPropertyBreakdownMap {
    const secDepCategory = state.categories.find((c) => c.name === 'Security Deposit');
    const secRefCategory = state.categories.find((c) => c.name === 'Security Deposit Refund');
    const ownerSecPayoutCategory = state.categories.find((c) => c.name === 'Owner Security Payout');
    const result: OwnerPropertyBreakdownMap = {};
    if (!secDepCategory) return result;

    const categoryById = new Map(state.categories.map((c) => [c.id, c]));

    const todayStr = new Date().toISOString().slice(0, 10);
    state.properties.forEach((prop) => {
        const allOwnerIds = getPayoutOwnerIdsForProperty(state, prop.id, todayStr);
        if (allOwnerIds.size === 0 && prop.ownerId) allOwnerIds.add(prop.ownerId);
        const propIdStr = String(prop.id);

        for (const ownerId of allOwnerIds) {
            if (!result[ownerId]) result[ownerId] = { rent: [], security: [] };

            let collected = 0;
            let paid = 0;
            state.transactions
                .filter(
                    (tx) =>
                        tx.type === TransactionType.INCOME &&
                        tx.categoryId === secDepCategory.id &&
                        String(tx.propertyId) === propIdStr
                )
                .forEach((tx) => {
                    const txOwnerId = resolveOwnerForTransaction(state, tx);
                    if (txOwnerId !== ownerId) return;
                    const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                    if (!isNaN(amount) && amount > 0) collected += amount;
                });
            state.transactions
                .filter((tx) => tx.type === TransactionType.EXPENSE && String(tx.propertyId) === propIdStr)
                .forEach((tx) => {
                    const txOwnerId = resolveOwnerForTransaction(state, tx);
                    if (txOwnerId !== ownerId) return;
                    const category = categoryById.get(tx.categoryId);
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
            if (collected > 0.01 || paid > 0.01) {
                result[ownerId].security.push({
                    propertyId: prop.id,
                    propertyName: prop.name || 'Unit',
                    balanceDue: Math.max(0, balance),
                });
            }
        }
    });
    return result;
}

/**
 * Rent tree + rent payout modal slices from server `owner_balances` (API mode).
 * Security slices stay empty; use `buildOwnerPropertyBreakdown` when the Security tab or security modal needs full rules.
 */
export function buildOwnerPropertyBreakdownFromApiBalances(
    state: AppState,
    rows: ReadonlyArray<{ ownerId: string; propertyId: string; balance: number }>
): OwnerPropertyBreakdownMap {
    const result: OwnerPropertyBreakdownMap = {};
    for (const r of rows) {
        const oid = String(r.ownerId);
        const pid = String(r.propertyId);
        const bal = Number(r.balance);
        if (!Number.isFinite(bal) || bal <= 0.01) continue;
        if (!result[oid]) result[oid] = { rent: [], security: [] };
        const prop = state.properties.find((p) => String(p.id) === pid);
        const propertyId = (prop?.id ?? pid) as string;
        result[oid].rent.push({
            propertyId,
            propertyName: prop?.name || 'Unit',
            balanceDue: bal,
        });
    }
    return result;
}

export function getOwnerPayoutModalPropertyBreakdown(
    state: AppState,
    ownerId: string,
    payoutType: 'Rent' | 'Security',
    fullBreakdown: OwnerPropertyBreakdownMap
): PropertyBalanceItem[] {
    const mode = payoutType === 'Rent' ? 'rent' : 'security';
    const raw = fullBreakdown[ownerId]?.[mode] ?? [];
    if (payoutType !== 'Rent') return raw;
    return expandRentBreakdownForModal(state, ownerId, raw, fullBreakdown);
}

/** Same as payouts page modal, but only rows for one unit (visual layout property card). */
export function getOwnerPayoutModalPropertyBreakdownForProperty(
    state: AppState,
    ownerId: string,
    propertyId: string,
    payoutType: 'Rent' | 'Security',
    fullBreakdown: OwnerPropertyBreakdownMap
): PropertyBalanceItem[] {
    const mode = payoutType === 'Rent' ? 'rent' : 'security';
    const raw = (fullBreakdown[ownerId]?.[mode] ?? []).filter((p) => String(p.propertyId) === String(propertyId));
    if (payoutType !== 'Rent') return raw;
    return expandRentBreakdownForModal(state, ownerId, raw, fullBreakdown);
}

/**
 * Total owner rental payout due for one unit: sum of rent `balanceDue` across all owners with a slice on that property.
 * Matches Owner Payouts page / Owner Payout modal (not raw property income minus expenses).
 */
export function getOwnerRentalPayoutDueForProperty(breakdown: OwnerPropertyBreakdownMap, propertyId: string): number {
    const pid = String(propertyId);
    let sum = 0;
    for (const ownerId of Object.keys(breakdown)) {
        for (const row of breakdown[ownerId]?.rent ?? []) {
            if (String(row.propertyId) === pid) sum += row.balanceDue ?? 0;
        }
    }
    return Math.max(0, sum);
}

/** Owner-specific rental payout due for one unit (used by visual unit cards). */
export function getOwnerRentalPayoutDueForOwnerOnProperty(
    breakdown: OwnerPropertyBreakdownMap,
    ownerId: string,
    propertyId: string
): number {
    const pid = String(propertyId);
    return Math.max(
        0,
        (breakdown[String(ownerId)]?.rent ?? [])
            .filter((row) => String(row.propertyId) === pid)
            .reduce((sum, row) => sum + (row.balanceDue ?? 0), 0)
    );
}
