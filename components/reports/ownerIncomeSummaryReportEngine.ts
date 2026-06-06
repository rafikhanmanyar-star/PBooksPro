import { ContactType, TransactionType, type AppState } from '../../types';
import {
    getPropertyIdsForOwner,
    hasMultipleOwnersOnDate,
    getOwnerSharePercentageOnDate,
    resolveOwnerForTransaction,
    getPropertyExpenseAllocatedAmountForOwner,
    getBrokerFeeAllocatedAmountForOwner,
    getBillCostAllocatedAmountForOwner,
} from '../../services/propertyOwnershipService';
import { billAffectsOwnerRentalIncomeLedger, isBillPaymentFromSecurityDepositIncome } from '../../utils/rentalBillPayments';

export interface UnitSummary {
    unitId: string;
    unitName: string;
    collected: number;
    expenses: number;
    brokerFee: number;
    billAmount: number;
    payable: number;
}

export interface OwnerSummary {
    ownerId: string;
    ownerName: string;
    units: UnitSummary[];
    generalPayouts: number;
    totalBrokerFee: number;
    totalBillAmount: number;
    totalPayable: number;
}

export function computeOwnerIncomeSummaryReport(
    state: AppState,
    filters: {
        startDate: string;
        endDate: string;
        selectedBuildingId: string;
        selectedOwnerId: string;
        searchQuery?: string;
    }
): OwnerSummary[] {
    const { startDate, endDate, selectedBuildingId, selectedOwnerId, searchQuery = '' } = filters;
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const rentalIncomeCategory = state.categories.find((c) => c.name === 'Rental Income');
    const brokerFeeCategory = state.categories.find((c) => c.name === 'Broker Fee');
    const ownerPayoutCategory = state.categories.find((c) => c.name === 'Owner Payout');
    const ownerShareCat = state.categories.find((c) => c.name === 'Owner Rental Income Share');
    const clearingRentCat = state.categories.find((c) => c.name === 'Owner Rental Allocation (Clearing)');

    if (!rentalIncomeCategory) return [];

    const brokerFeeTxIds = new Set<string>();
    if (brokerFeeCategory) {
        state.transactions.forEach((tx) => {
            if (tx.type === TransactionType.EXPENSE && tx.categoryId === brokerFeeCategory.id) {
                brokerFeeTxIds.add(tx.id);
            }
        });
    }

    const filteredOwners = state.contacts.filter(
        (c) =>
            (c.type === ContactType.OWNER || c.type === ContactType.CLIENT) &&
            (selectedOwnerId === 'all' || c.id === selectedOwnerId)
    );

    const summaries: OwnerSummary[] = filteredOwners
        .map((owner) => {
            const b = selectedBuildingId === 'all' ? undefined : selectedBuildingId;
            const stakeIds = getPropertyIdsForOwner(state, owner.id, b);
            const ownerProperties = state.properties.filter((p) => stakeIds.has(String(p.id)));
            const unitData: { [unitId: string]: UnitSummary } = {};

            ownerProperties.forEach((p) => {
                unitData[p.id] = {
                    unitId: p.id,
                    unitName: p.name,
                    collected: 0,
                    expenses: 0,
                    brokerFee: 0,
                    billAmount: 0,
                    payable: 0,
                };
            });

            state.transactions.forEach((tx) => {
                if (tx.ownerId === owner.id && tx.propertyId && !unitData[tx.propertyId]) {
                    const prop = state.properties.find((p) => p.id === tx.propertyId);
                    if (prop && (selectedBuildingId === 'all' || prop.buildingId === selectedBuildingId)) {
                        unitData[tx.propertyId] = {
                            unitId: tx.propertyId,
                            unitName: prop.name,
                            collected: 0,
                            expenses: 0,
                            brokerFee: 0,
                            billAmount: 0,
                            payable: 0,
                        };
                    }
                }
            });

            let generalPayouts = 0;

            state.rentalAgreements.forEach((ra) => {
                if (!ra.brokerId || !ra.brokerFee || ra.brokerFee <= 0) return;
                if (!ra.propertyId || !unitData[ra.propertyId]) return;

                const raDate = new Date(ra.startDate);
                if (raDate < start || raDate > end) return;

                const fee = typeof ra.brokerFee === 'string' ? parseFloat(ra.brokerFee) : Number(ra.brokerFee);
                if (isNaN(fee) || fee <= 0) return;
                const share = getBrokerFeeAllocatedAmountForOwner(state, ra, owner.id);
                if (share > 0) unitData[ra.propertyId!].brokerFee += share;
            });

            (state.bills || []).forEach((bill) => {
                if (!bill.propertyId || bill.projectId || !unitData[bill.propertyId]) return;
                if (!billAffectsOwnerRentalIncomeLedger(bill, state)) return;
                const billDate = new Date(bill.issueDate);
                if (billDate < start || billDate > end) return;
                const share = getBillCostAllocatedAmountForOwner(state, bill, owner.id);
                if (share > 0) unitData[bill.propertyId].billAmount += share;
            });

            const ownerBillIds = new Set(
                (state.bills || []).filter((bill) => bill.propertyId && !bill.projectId).map((bill) => bill.id)
            );
            const billPaymentTxIds = new Set<string>();
            state.transactions.forEach((tx) => {
                if (tx.type === TransactionType.EXPENSE && tx.billId && ownerBillIds.has(tx.billId)) {
                    billPaymentTxIds.add(tx.id);
                }
            });

            state.transactions.forEach((tx) => {
                const txDate = new Date(tx.date);
                if (txDate < start || txDate > end) return;

                const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : Number(tx.amount);
                if (isNaN(amount)) return;

                if (clearingRentCat && tx.categoryId === clearingRentCat.id) return;

                if (tx.type === TransactionType.INCOME && tx.categoryId === rentalIncomeCategory.id) {
                    if (isBillPaymentFromSecurityDepositIncome(tx)) return;
                    if (tx.propertyId && unitData[tx.propertyId]) {
                        const d = (tx.date || '').slice(0, 10);
                        if (d && hasMultipleOwnersOnDate(state, String(tx.propertyId), d)) {
                            const hasExplicitShares =
                                ownerShareCat &&
                                state.transactions.some(
                                    (st) =>
                                        st.categoryId === ownerShareCat.id &&
                                        ((st.invoiceId && st.invoiceId === tx.invoiceId) ||
                                            (st.batchId && st.batchId === tx.batchId))
                                );
                            if (!hasExplicitShares) {
                                const pct = getOwnerSharePercentageOnDate(state, String(tx.propertyId), owner.id, d);
                                if (pct > 0) unitData[tx.propertyId].collected += Math.round(amount * pct) / 100;
                            }
                            return;
                        }
                        const resolvedOwner =
                            resolveOwnerForTransaction(state, tx) ??
                            state.properties.find((p) => p.id === tx.propertyId)?.ownerId;
                        if (resolvedOwner === owner.id) unitData[tx.propertyId].collected += amount;
                    }
                }

                if (
                    tx.type === TransactionType.INCOME &&
                    ownerShareCat &&
                    tx.categoryId === ownerShareCat.id &&
                    tx.contactId === owner.id &&
                    tx.propertyId &&
                    unitData[tx.propertyId]
                ) {
                    unitData[tx.propertyId].collected += amount;
                }

                if (tx.type === TransactionType.EXPENSE) {
                    const category = state.categories.find((c) => c.id === tx.categoryId);
                    const catName = category?.name || '';

                    if (
                        catName === 'Security Deposit Refund' ||
                        catName === 'Owner Security Payout' ||
                        catName.includes('(Tenant)')
                    ) {
                        return;
                    }

                    if (brokerFeeTxIds.has(tx.id)) return;
                    if (billPaymentTxIds.has(tx.id)) return;

                    if (ownerPayoutCategory && tx.categoryId === ownerPayoutCategory.id) {
                        if (tx.contactId === owner.id) {
                            if (tx.propertyId && unitData[tx.propertyId]) {
                                unitData[tx.propertyId].expenses += amount;
                            } else {
                                generalPayouts += amount;
                            }
                        }
                        return;
                    }

                    if (tx.propertyId && unitData[tx.propertyId]) {
                        unitData[tx.propertyId].expenses += getPropertyExpenseAllocatedAmountForOwner(
                            state,
                            tx,
                            amount,
                            owner.id
                        );
                    } else if (tx.contactId === owner.id) {
                        generalPayouts += amount;
                    }
                }
            });

            const units = Object.values(unitData)
                .map((u) => ({
                    ...u,
                    payable: u.collected - u.expenses - u.brokerFee - u.billAmount,
                }))
                .filter((u) => u.collected !== 0 || u.expenses !== 0 || u.brokerFee !== 0 || u.billAmount !== 0);

            const totalUnitPayable = units.reduce((sum, u) => sum + u.payable, 0);
            const totalBrokerFee = units.reduce((sum, u) => sum + u.brokerFee, 0);
            const totalBillAmount = units.reduce((sum, u) => sum + u.billAmount, 0);

            return {
                ownerId: owner.id,
                ownerName: owner.name,
                units,
                generalPayouts,
                totalBrokerFee,
                totalBillAmount,
                totalPayable: totalUnitPayable - generalPayouts,
            };
        })
        .filter((s) => s.units.length > 0 || s.generalPayouts !== 0);

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return summaries.filter(
            (s) =>
                s.ownerName.toLowerCase().includes(q) ||
                s.units.some((u) => u.unitName.toLowerCase().includes(q))
        );
    }

    return summaries;
}
