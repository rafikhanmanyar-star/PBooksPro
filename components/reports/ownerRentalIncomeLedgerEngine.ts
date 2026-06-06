import { TransactionType, ContactType, Transaction, type AppState } from '../../types';
import { toDateOnly } from '../../utils/dateUtils';
import {
    getOwnershipSharesForPropertyOnDate,
    hasMultipleOwnersOnDate,
    resolveOwnerForPropertyOnDate,
    resolveOwnerForTransaction,
} from '../../services/propertyOwnershipService';
import {
    resolveOwnerPayoutPayeeId,
    shouldAttributeUnallocatedOwnerPayoutToProperty,
} from '../payouts/ownerPayoutBreakdown';
import {
    billAffectsOwnerRentalIncomeLedger,
    isBillPaymentFromSecurityDepositIncome,
} from '../../utils/rentalBillPayments';

/** Calendar day for running balance — avoids `new Date(iso)` timezone drift vs plain YYYY-MM-DD. */
function ledgerRunningBalanceDateKey(raw: string | undefined): string {
    if (raw == null || String(raw).trim() === '') return '9999-12-31';
    return toDateOnly(raw);
}

/**
 * Same calendar day: (1) Rent In before Paid Out; (2) among several outflows, smaller amount first
 * (partial payout before larger settlement — UUID order had no business meaning and inverted chains).
 */
function compareReportRowsForRunningBalance(
    a: { date: string; id: string; rentIn: number; paidOut: number; ledgerOwnerId?: string },
    b: { date: string; id: string; rentIn: number; paidOut: number; ledgerOwnerId?: string },
    usePerOwnerRunningBalance: boolean
): number {
    if (usePerOwnerRunningBalance) {
        const oa = a.ledgerOwnerId ?? '';
        const ob = b.ledgerOwnerId ?? '';
        if (oa !== ob) return oa.localeCompare(ob);
    }
    const da = ledgerRunningBalanceDateKey(a.date);
    const db = ledgerRunningBalanceDateKey(b.date);
    if (da !== db) return da < db ? -1 : 1;
    const aKind = Number(a.rentIn) > 0 ? 0 : Number(a.paidOut) > 0 ? 1 : 2;
    const bKind = Number(b.rentIn) > 0 ? 0 : Number(b.paidOut) > 0 ? 1 : 2;
    if (aKind !== bKind) return aKind - bKind;
    if (aKind === 0) {
        const diff = Number(a.rentIn) - Number(b.rentIn);
        if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (aKind === 1) {
        const diff = Number(a.paidOut) - Number(b.paidOut);
        if (diff !== 0) return diff < 0 ? -1 : 1;
    }
    return String(a.id).localeCompare(String(b.id));
}

export interface ReportRow {
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

export type OwnerRentalIncomeSortKey =
    | 'date'
    | 'ownerName'
    | 'propertyName'
    | 'particulars'
    | 'rentIn'
    | 'paidOut'
    | 'balance';

export interface OwnerRentalIncomeLedgerFilters {
    startDate: string;
    endDate: string;
    selectedBuildingId: string;
    selectedOwnerId: string;
    selectedUnitId: string;
    searchQuery: string;
    sortConfig: { key: OwnerRentalIncomeSortKey; direction: 'asc' | 'desc' };
}

export interface OwnerRentalIncomeReportResult {
    openingBalance: number;
    reportData: ReportRow[];
    fullLedgerClosingBalance: number;
}

function computeOpeningBalance(
    state: AppState,
    filters: Pick<
        OwnerRentalIncomeLedgerFilters,
        'startDate' | 'selectedBuildingId' | 'selectedOwnerId' | 'selectedUnitId'
    >
): number {
    const { startDate, selectedBuildingId, selectedOwnerId, selectedUnitId } = filters;
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
    const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
    const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');
    const ownerSecurityPayoutCat = state.categories.find(c => c.name === 'Owner Security Payout');
    const securityRefundCat = state.categories.find(c => c.name === 'Security Deposit Refund');
    const obClearingCat = state.categories.find(c => c.name === 'Owner Rental Allocation (Clearing)');
    const obShareCat = state.categories.find(c => c.name === 'Owner Rental Income Share');
    const ownerSvcPayCat = state.categories.find(
        (c) => c.id === 'sys-cat-own-svc-pay' || c.name === 'Owner Service Charge Payment'
    );

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
                if (isBillPaymentFromSecurityDepositIncome(tx)) return;

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

            if (ownerSvcPayCat && tx.categoryId === ownerSvcPayCat.id) {
                const rawAmt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (isNaN(rawAmt) || rawAmt <= 0) return;
                const property = state.properties.find(p => p.id === tx.propertyId);
                const buildingId = tx.buildingId || property?.buildingId;
                addIncomeToBalance(rawAmt, tx.contactId || tx.ownerId, buildingId, tx.propertyId);
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
                let ownerId: string | undefined = resolveOwnerPayoutPayeeId(tx);
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
                    if (isDirectOwnerPayout && !propertyId) {
                        if (selectedBuildingId !== 'all' && tx.buildingId && tx.buildingId !== selectedBuildingId) return;
                        if (selectedUnitId !== 'all' && ownerId && !shouldAttributeUnallocatedOwnerPayoutToProperty(state, ownerId, selectedUnitId, tx)) return;
                    } else {
                        if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                        if (selectedUnitId !== 'all' && propertyId !== selectedUnitId) return;
                    }
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
        if (!billAffectsOwnerRentalIncomeLedger(bill, state)) return;
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
}

function computeReportData(
    state: AppState,
    filters: OwnerRentalIncomeLedgerFilters,
    openingBalance: number
): { reportData: ReportRow[]; fullLedgerClosingBalance: number } {
    const {
        startDate,
        endDate,
        selectedBuildingId,
        selectedOwnerId,
        selectedUnitId,
        searchQuery,
        sortConfig,
    } = filters;

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
    const ownerPayoutCategory = state.categories.find(c => c.name === 'Owner Payout');
    const brokerFeeCategory = state.categories.find(c => c.name === 'Broker Fee');

    if (!rentalIncomeCategory) return { reportData: [], fullLedgerClosingBalance: 0 };

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

    const items: Omit<ReportRow, 'balance'>[] = [];

    const clearingAllocCat = state.categories.find(c => c.name === 'Owner Rental Allocation (Clearing)');
    const ownerShareCat = state.categories.find(c => c.name === 'Owner Rental Income Share');
    const ownerSvcPayCat = state.categories.find(
        (c) => c.id === 'sys-cat-own-svc-pay' || c.name === 'Owner Service Charge Payment'
    );

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

    state.transactions.forEach(tx => {
        if (tx.type !== TransactionType.INCOME || !tx.propertyId) return;
        const date = new Date(tx.date);
        if (date < start || date > end) return;

        if (clearingAllocCat && tx.categoryId === clearingAllocCat.id) return;

        if (tx.categoryId === rentalIncomeCategory.id) {
            if (isBillPaymentFromSecurityDepositIncome(tx)) return;

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

        if (ownerSvcPayCat && tx.categoryId === ownerSvcPayCat.id) {
            const rawAmt = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
            if (isNaN(rawAmt) || rawAmt <= 0) return;
            pushIncomeItem(tx, rawAmt, tx.contactId || tx.ownerId);
            return;
        }
    });

    const ownerSecurityPayoutCat = state.categories.find(c => c.name === 'Owner Security Payout');
    const securityRefundCat = state.categories.find(c => c.name === 'Security Deposit Refund');
    state.transactions
        .filter(tx => tx.type === TransactionType.EXPENSE)
        .forEach(tx => {
            const date = new Date(tx.date);
            if (date >= start && date <= end) {
                if (ownerSecurityPayoutCat && tx.categoryId === ownerSecurityPayoutCat.id) return;
                if (securityRefundCat && tx.categoryId === securityRefundCat.id) return;
                if (brokerFeeTxIds.has(tx.id)) return;
                if (billPaymentTxIds.has(tx.id)) return;

                let isRelevant = false;
                let ownerId = resolveOwnerPayoutPayeeId(tx);
                let propertyId = tx.propertyId;

                if (tx.contactId) {
                    const contact = state.contacts.find(c => c.id === tx.contactId);
                    if (contact?.type === ContactType.TENANT) return;
                }

                const category = state.categories.find(c => c.id === tx.categoryId);
                const catName = category?.name || '';
                if (catName === 'Owner Security Payout' || catName === 'Security Deposit Refund' || catName.includes('(Tenant)')) return;

                if (ownerPayoutCategory && tx.categoryId === ownerPayoutCategory.id) {
                    isRelevant = true;
                } else if (propertyId) {
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
                        if (isDirectOwnerPayout && !propertyId) {
                            if (selectedBuildingId !== 'all' && tx.buildingId && tx.buildingId !== selectedBuildingId) return;
                            if (selectedUnitId !== 'all' && ownerId && !shouldAttributeUnallocatedOwnerPayoutToProperty(state, ownerId, selectedUnitId, tx)) return;
                            if (selectedUnitId !== 'all') {
                                const u = state.properties.find(p => p.id === selectedUnitId);
                                if (u) propertyName = u.name;
                            }
                        } else {
                            if (selectedBuildingId !== 'all' && buildingId !== selectedBuildingId) return;
                            if (selectedUnitId !== 'all' && propertyId !== selectedUnitId) return;
                        }

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

    (state.bills || []).forEach(bill => {
        if (!bill.propertyId || bill.projectId) return;
        if (!billAffectsOwnerRentalIncomeLedger(bill, state)) return;

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

    const distinctLedgerOwners = new Set(items.map((i) => i.ledgerOwnerId).filter(Boolean));
    const usePerOwnerRunningBalance = selectedOwnerId === 'all' && distinctLedgerOwners.size > 1;

    items.sort((a, b) => {
        if (sortConfig.key === 'date') {
            const da = ledgerRunningBalanceDateKey(a.date);
            const db = ledgerRunningBalanceDateKey(b.date);
            if (da !== db) {
                if (da < db) return sortConfig.direction === 'asc' ? -1 : 1;
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            const run = compareReportRowsForRunningBalance(a, b, usePerOwnerRunningBalance);
            return sortConfig.direction === 'asc' ? run : -run;
        }
        let valA: string | number = a[sortConfig.key];
        let valB: string | number = b[sortConfig.key];

        if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = (valB as string).toLowerCase();
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const balanceById: Record<string, number> = {};
    const sortedForBalance = [...items].sort((a, b) =>
        compareReportRowsForRunningBalance(a, b, usePerOwnerRunningBalance)
    );

    const perOwnerRun = new Map<string, number>();
    let globalRun = openingBalance;
    sortedForBalance.forEach((item) => {
        if (usePerOwnerRunningBalance) {
            const oid = item.ledgerOwnerId ?? '';
            perOwnerRun.set(oid, (perOwnerRun.get(oid) ?? 0) + item.rentIn - item.paidOut);
            balanceById[item.id] = perOwnerRun.get(oid)!;
        } else {
            globalRun += item.rentIn - item.paidOut;
            balanceById[item.id] = globalRun;
        }
    });

    let rows: ReportRow[] = items.map((item) => ({ ...item, balance: balanceById[item.id] ?? 0 }));

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        rows = rows.filter(r =>
            r.ownerName.toLowerCase().includes(q) ||
            r.propertyName.toLowerCase().includes(q) ||
            r.particulars.toLowerCase().includes(q)
        );
    }

    const fullLedgerClosingBalance = usePerOwnerRunningBalance ? 0 : globalRun;

    return { reportData: rows, fullLedgerClosingBalance };
}

export function computeOwnerRentalIncomeReport(
    state: AppState,
    filters: OwnerRentalIncomeLedgerFilters
): OwnerRentalIncomeReportResult {
    const openingBalance = computeOpeningBalance(state, filters);
    const { reportData, fullLedgerClosingBalance } = computeReportData(state, filters, openingBalance);
    return { openingBalance, reportData, fullLedgerClosingBalance };
}
