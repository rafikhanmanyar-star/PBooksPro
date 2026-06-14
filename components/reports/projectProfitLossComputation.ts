/**
 * Single source of truth for Project P&L totals (bills accrual + transactions, same rules as ProjectProfitLossReport).
 * Used by Profit Distribution so "Available to Distribute" matches Project Selling → Profit & Loss.
 */

import type { AppState, Bill, Transaction } from '../../types';
import { TransactionType } from '../../types';
import { resolveBillLinkedExpenseCategoryId } from '../../utils/billExpenseCategory';
import {
    transactionIsDuplicatePrepaidAdvanceVersusAccruedBill,
    resolveBillLinkedExpenseCategoryIdFromTransactionMemo,
} from '../../utils/supplierPrepaidPl';
import { findProjectAssetCategory } from '../../constants/projectAssetSystemCategories';
import { getProfitLossExcludedCategoryIds } from '../../services/accounting/plExclusions';
import {
    resolveProjectIdForTransaction,
    resolveBuildingIdForTransaction,
    isTransactionFromVoidedOrCancelledInvoice,
    type ReportStateSlice,
} from './reportUtils';
import {
    scopeIsConsolidated,
    scopeTargetsBuilding,
    scopeTargetsProject,
    transactionMatchesFinancialEntityScope,
    billMatchesFinancialEntityScope,
    type FinancialEntityScope,
} from './financialEntityScope';

function resolveBillBuildingId(bill: Bill, state: AppState): string | undefined {
    if (bill.buildingId) return bill.buildingId;
    if (bill.propertyId && state.properties?.length) {
        return state.properties.find((p) => p.id === bill.propertyId)?.buildingId;
    }
    return undefined;
}

function plEntityScope(selectedProjectId: string, selectedBuildingId: string): FinancialEntityScope {
    return { projectId: selectedProjectId, buildingId: selectedBuildingId };
}

/** Bill accrual section of P&L (must match computeProjectProfitLossTotals). */
function runPlBillAccrual(
    state: AppState,
    selectedProjectId: string,
    selectedBuildingId: string,
    startDate: string,
    endDate: string,
    categoryAmounts: Record<string, number>,
    totalIncomeRef: { value: number },
    totalExpenseRef: { value: number }
): Set<string> {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const excludedCats = getProfitLossExcludedCategoryIds(state);
    const bsOnlyPl = findProjectAssetCategory(state.categories, 'ASSET_BALANCE_SHEET_ONLY');
    if (bsOnlyPl) excludedCats.add(bsOnlyPl.id);

    const rentalCats = new Set(state.categories.filter((c) => c.isRental).map((c) => c.id));

    const categoryMap = new Map(state.categories.map((c) => [c.id, c]));

    const processedBills = new Set<string>();
    const scope = plEntityScope(selectedProjectId, selectedBuildingId);

    state.bills.forEach((bill) => {
        if (!billMatchesFinancialEntityScope(bill, state as ReportStateSlice, scope)) return;
        const isProjectBill = !!bill.projectId;
        const buildingId = resolveBillBuildingId(bill, state);
        if (scopeTargetsBuilding(scope)) {
            if (!buildingId) return;
        } else if (scopeTargetsProject(scope)) {
            if (!isProjectBill) return;
        }
        const excludeRentalCats = isProjectBill || scopeTargetsProject(scope);

        const billDate = new Date(bill.issueDate);
        if (billDate < start || billDate > end) return;

        if (!bill.expenseCategoryItems || bill.expenseCategoryItems.length === 0) {
            if (!bill.categoryId) return;
            const categoryId = bill.categoryId;
            if (excludedCats.has(categoryId) || (excludeRentalCats && rentalCats.has(categoryId))) return;

            const category = categoryMap.get(categoryId);
            if (category && category.type === TransactionType.EXPENSE) {
                categoryAmounts[categoryId] = (categoryAmounts[categoryId] || 0) + bill.amount;
                totalExpenseRef.value += bill.amount;
            }
            processedBills.add(bill.id);
            return;
        }

        const totalBillAmount = bill.expenseCategoryItems.reduce((sum, item) => sum + (item.netValue || 0), 0);
        if (totalBillAmount > 0) {
            bill.expenseCategoryItems.forEach((item) => {
                if (!item.categoryId) return;
                const itemCategoryId = item.categoryId;

                if (excludedCats.has(itemCategoryId) || (excludeRentalCats && rentalCats.has(itemCategoryId))) return;

                const allocatedAmount = item.netValue || 0;

                const category = categoryMap.get(itemCategoryId);
                if (category && category.type === TransactionType.INCOME) {
                    categoryAmounts[itemCategoryId] = (categoryAmounts[itemCategoryId] || 0) - allocatedAmount;
                    totalIncomeRef.value -= allocatedAmount;
                } else {
                    categoryAmounts[itemCategoryId] = (categoryAmounts[itemCategoryId] || 0) + allocatedAmount;
                    totalExpenseRef.value += allocatedAmount;
                }
            });
            processedBills.add(bill.id);
        }
    });

    return processedBills;
}

/**
 * Construction-side expense from vendor bills only (same accrual rules as Project P&amp;L bill section).
 * Excludes non-bill transactions; use for Inv. Mgmt “Undistributed funds” construction total.
 */
export function computeProjectBillAccruedExpenseTotal(
    state: AppState,
    selectedProjectId: string,
    startDate: string,
    endDate: string
): number {
    const categoryAmounts: Record<string, number> = {};
    const incomeRef = { value: 0 };
    const expenseRef = { value: 0 };
    runPlBillAccrual(state, selectedProjectId, 'all', startDate, endDate, categoryAmounts, incomeRef, expenseRef);
    return expenseRef.value;
}

/** Bills whose expense is fully reflected in P&L via accrual lines (skip double-counting payment txs). */
export function computePlProcessedBills(
    state: AppState,
    selectedProjectId: string,
    startDate: string,
    endDate: string
): Set<string> {
    const categoryAmounts: Record<string, number> = {};
    return runPlBillAccrual(state, selectedProjectId, 'all', startDate, endDate, categoryAmounts, { value: 0 }, { value: 0 });
}

/** Lines from vendor bills accrued into P&L (payment txs are suppressed for processed bills — modal needs these). */
export interface PlBillDrilldownEntry {
    kind: 'bill_accrual';
    billId: string;
    lineKey: string;
    billNumber: string;
    issueDate: string;
    amount: number;
    description: string;
    vendorDisplayName: string;
}

function resolveBillVendorDisplayName(state: AppState, bill: Bill): string {
    if (bill.vendorId) {
        const v = state.vendors.find((x) => x.id === bill.vendorId);
        if (v?.name) return v.name;
    }
    if (bill.contactId) {
        const c = state.contacts.find((x) => x.id === bill.contactId);
        if (c?.name) return c.name;
    }
    return 'Vendor bill';
}

/**
 * Category id used for P&L after invoice/bill fallbacks (before the uncategorized_* synthetic key).
 * If undefined, P&L buckets the line under uncategorized_income / uncategorized_expense.
 */
export function resolvePlCategoryIdForTransaction(
    tx: Transaction,
    state: AppState,
    processedBills: Set<string>
): string | undefined {
    const invoiceMap = new Map(state.invoices.map((i) => [i.id, i]));
    const billMap = new Map(state.bills.map((b) => [b.id, b]));
    const categoryByName = new Map(state.categories.map((c) => [`${c.name}||${c.type}`, c]));

    let categoryId = tx.categoryId;
    const linkedInv = tx.invoiceId ? invoiceMap.get(tx.invoiceId) : undefined;
    if (linkedInv) {
        if (!categoryId) categoryId = linkedInv.categoryId;
        if (!categoryId && linkedInv.invoiceType) {
            const defaultCatName =
                linkedInv.invoiceType === 'Installment'
                    ? 'Unit Selling Income'
                    : linkedInv.invoiceType === 'Service Charge'
                      ? 'Service Charge Income'
                      : linkedInv.invoiceType === 'Rental'
                        ? 'Rental Income'
                        : linkedInv.invoiceType === 'Security Deposit'
                          ? 'Security Deposit'
                          : null;
            if (defaultCatName) {
                const fallbackCat = categoryByName.get(`${defaultCatName}||${TransactionType.INCOME}`);
                if (fallbackCat) categoryId = fallbackCat.id;
            }
        }
        if (!categoryId && linkedInv.agreementId) {
            const pa = state.projectAgreements?.find((a) => a.id === linkedInv.agreementId);
            if (pa) {
                const fallbackCat = categoryByName.get(`Unit Selling Income||${TransactionType.INCOME}`);
                if (fallbackCat) categoryId = fallbackCat.id;
            } else {
                const ra = state.rentalAgreements?.find((a) => a.id === linkedInv.agreementId);
                if (ra) {
                    const fallbackCat = categoryByName.get(`Rental Income||${TransactionType.INCOME}`);
                    if (fallbackCat) categoryId = fallbackCat.id;
                }
            }
        }
    }
    if (tx.billId && !processedBills.has(tx.billId)) {
        const bill = billMap.get(tx.billId);
        if (bill && !categoryId) {
            const fromBill = resolveBillLinkedExpenseCategoryId(bill, state.categories);
            if (fromBill) categoryId = fromBill;
        }
    }
    if (!categoryId && tx.type === TransactionType.INCOME && tx.invoiceId) {
        const fallbackCat = categoryByName.get(`Unit Selling Income||${TransactionType.INCOME}`);
        if (fallbackCat) categoryId = fallbackCat.id;
    }
    if (!categoryId && tx.type === TransactionType.INCOME && resolveProjectIdForTransaction(tx, state)) {
        const fallbackCat = categoryByName.get(`Unit Selling Income||${TransactionType.INCOME}`);
        if (fallbackCat) categoryId = fallbackCat.id;
    }

    if (!categoryId && tx.type === TransactionType.EXPENSE) {
        const memoCat = resolveBillLinkedExpenseCategoryIdFromTransactionMemo(tx, state);
        if (memoCat) categoryId = memoCat;
    }

    return categoryId || undefined;
}

/**
 * Drill-down row match: transaction resolved P&L category equals the row id, or the row is a parent
 * category and the resolved category is any descendant (so parent rows match child transactions).
 */
export function isResolvedPlCategoryInDrilldownRow(
    resolvedCategoryId: string | undefined,
    drilldownRowCategoryId: string,
    categories: AppState['categories']
): boolean {
    if (
        drilldownRowCategoryId === 'uncategorized_income' ||
        drilldownRowCategoryId === 'uncategorized_expense' ||
        drilldownRowCategoryId === 'gain-loss-fixed-asset'
    ) {
        return false;
    }
    if (!resolvedCategoryId) return false;
    const byId = new Map(categories.map((c) => [c.id, c]));
    let cur: (typeof categories)[number] | undefined = byId.get(resolvedCategoryId);
    while (cur) {
        if (cur.id === drilldownRowCategoryId) return true;
        cur = cur.parentCategoryId ? byId.get(cur.parentCategoryId) : undefined;
    }
    return false;
}

/**
 * Bill-accrual detail for Project P&amp;L drill-down. Only bills in {@link computePlProcessedBills}
 * (same period/project as P&amp;L) are included — others appear via normal transactions only.
 */
export function computePlBillDrilldownEntries(
    state: AppState,
    selectedProjectId: string,
    startDate: string,
    endDate: string,
    processedBills: Set<string>,
    params: {
        drillCategoryId?: string;
        drillType: TransactionType.INCOME | TransactionType.EXPENSE;
    },
    selectedBuildingId: string = 'all'
): PlBillDrilldownEntry[] {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const cid = params.drillCategoryId;
    if (!cid || cid === 'gain-loss-fixed-asset' || cid === 'uncategorized') {
        return [];
    }
    if (cid === 'uncategorized_income' || cid === 'uncategorized_expense') {
        return [];
    }

    const excludedCats = getProfitLossExcludedCategoryIds(state);
    const bsOnlyPl = findProjectAssetCategory(state.categories, 'ASSET_BALANCE_SHEET_ONLY');
    if (bsOnlyPl) excludedCats.add(bsOnlyPl.id);
    const rentalCats = new Set(state.categories.filter((c) => c.isRental).map((c) => c.id));

    const categoryMap = new Map(state.categories.map((c) => [c.id, c]));
    const out: PlBillDrilldownEntry[] = [];
    const scope = plEntityScope(selectedProjectId, selectedBuildingId);

    const categoryMatchesDrillRow = (lineCategoryId: string | undefined) =>
        !!lineCategoryId &&
        isResolvedPlCategoryInDrilldownRow(lineCategoryId, cid!, state.categories);

    state.bills.forEach((bill) => {
        if (!billMatchesFinancialEntityScope(bill, state as ReportStateSlice, scope)) return;

        const billDate = new Date(bill.issueDate);
        if (billDate < start || billDate > end) return;

        if (!processedBills.has(bill.id)) return;

        const vendorDisplayName = resolveBillVendorDisplayName(state, bill);

        if (!bill.expenseCategoryItems || bill.expenseCategoryItems.length === 0) {
            const categoryId = bill.categoryId;
            if (!categoryId || excludedCats.has(categoryId) || rentalCats.has(categoryId)) return;
            const category = categoryMap.get(categoryId);
            if (!category || category.type !== TransactionType.EXPENSE) return;
            if (params.drillType !== TransactionType.EXPENSE) return;
            if (!categoryMatchesDrillRow(categoryId)) return;
            const descParts = [`Bill ${bill.billNumber}`];
            if (bill.description?.trim()) descParts.push(bill.description.trim());
            out.push({
                kind: 'bill_accrual',
                billId: bill.id,
                lineKey: `${bill.id}-single`,
                billNumber: bill.billNumber,
                issueDate: bill.issueDate,
                amount: bill.amount,
                description: descParts.join(' · '),
                vendorDisplayName,
            });
            return;
        }

        const totalBillAmount = bill.expenseCategoryItems.reduce((sum, item) => sum + (item.netValue || 0), 0);
        if (totalBillAmount <= 0) return;

        bill.expenseCategoryItems.forEach((item) => {
            const itemCategoryId = item.categoryId;
            if (!itemCategoryId || excludedCats.has(itemCategoryId) || rentalCats.has(itemCategoryId)) return;
            const category = categoryMap.get(itemCategoryId);
            const allocatedAmount = item.netValue || 0;

            const isIncomeLine = !!(category && category.type === TransactionType.INCOME);
            if (isIncomeLine) {
                if (params.drillType !== TransactionType.INCOME || !categoryMatchesDrillRow(itemCategoryId))
                    return;
            } else {
                if (params.drillType !== TransactionType.EXPENSE || !categoryMatchesDrillRow(itemCategoryId))
                    return;
            }

            const baseLabel = `${bill.billNumber} · Line`;
            const descParts = [`Bill ${bill.billNumber}`];
            const catLabel = category?.name;
            if (catLabel) descParts.push(catLabel);
            out.push({
                kind: 'bill_accrual',
                billId: bill.id,
                lineKey: `${bill.id}-${item.id}`,
                billNumber: bill.billNumber,
                issueDate: bill.issueDate,
                amount: Math.abs(allocatedAmount),
                description: descParts.join(' · ') || baseLabel,
                vendorDisplayName,
            });
        });
    });

    return out;
}

/** Same inclusion rules as computeProjectProfitLossTotals for the transaction loop (before amount bucketing). */
export function transactionIncludedInPlLoop(
    tx: Transaction,
    state: AppState,
    processedBills: Set<string>,
    selectedProjectId: string,
    startDate: string,
    endDate: string,
    selectedBuildingId: string = 'all'
): boolean {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const excludedCats = getProfitLossExcludedCategoryIds(state);
    const bsOnlyPl = findProjectAssetCategory(state.categories, 'ASSET_BALANCE_SHEET_ONLY');
    if (bsOnlyPl) excludedCats.add(bsOnlyPl.id);
    const rentalCats = new Set(state.categories.filter((c) => c.isRental).map((c) => c.id));

    if (tx.billId && processedBills.has(tx.billId)) {
        return false;
    }

    if (isTransactionFromVoidedOrCancelledInvoice(tx, state)) return false;

    const scope = plEntityScope(selectedProjectId, selectedBuildingId);
    if (!transactionMatchesFinancialEntityScope(tx, state as ReportStateSlice, scope)) return false;

    const projectId = resolveProjectIdForTransaction(tx, state);
    const buildingId = resolveBuildingIdForTransaction(tx, state as ReportStateSlice);
    if (scopeTargetsBuilding(scope)) {
        if (!buildingId) return false;
    } else if (scopeTargetsProject(scope)) {
        if (!projectId) return false;
    }

    if (transactionIsDuplicatePrepaidAdvanceVersusAccruedBill(tx, state, processedBills, selectedProjectId)) {
        return false;
    }

    const categoryId = resolvePlCategoryIdForTransaction(tx, state, processedBills);
    const excludeRentalCats =
        scopeTargetsProject(scope) || (scopeIsConsolidated(scope) && !!projectId && !buildingId);
    if (categoryId && (excludedCats.has(categoryId) || (excludeRentalCats && rentalCats.has(categoryId)))) {
        return false;
    }

    const clearingAccountId = state.accounts.find((a) => a.name === 'Internal Clearing')?.id;
    if (clearingAccountId && tx.accountId === clearingAccountId) return false;

    const date = new Date(tx.date);
    if (date < start || date > end) return false;

    return true;
}

/**
 * True if this transaction contributes to the P&L "Uncategorized" row for income or expense
 * (matches projectProfitLossComputation bucket uncategorized_income / uncategorized_expense).
 */
export function transactionIsPlUncategorized(
    tx: Transaction,
    state: AppState,
    processedBills: Set<string>,
    selectedProjectId: string,
    startDate: string,
    endDate: string,
    type: TransactionType.INCOME | TransactionType.EXPENSE
): boolean {
    if (tx.type !== type) return false;
    if (!transactionIncludedInPlLoop(tx, state, processedBills, selectedProjectId, startDate, endDate)) return false;

    const salesOfFixedAssetCatId = findProjectAssetCategory(state.categories, 'SALES_OF_FIXED_ASSET')?.id;
    const costOfAssetSoldCatId = findProjectAssetCategory(state.categories, 'COST_OF_ASSET_SOLD')?.id;
    const assetSaleProceedsCatId = findProjectAssetCategory(state.categories, 'ASSET_SALE_PROCEEDS')?.id;

    const resolved = resolvePlCategoryIdForTransaction(tx, state, processedBills);

    if (type === TransactionType.INCOME) {
        if (resolved === salesOfFixedAssetCatId || resolved === assetSaleProceedsCatId) return false;
        return !resolved;
    }
    if (resolved === costOfAssetSoldCatId) return false;
    return !resolved;
}

export interface ProjectProfitLossTotals {
    totalIncome: number;
    totalExpense: number;
    netProfit: number;
    categoryAmounts: Record<string, number>;
    assetSaleRevenue: number;
    assetSaleCost: number;
}

export function computeProjectProfitLossTotals(
    state: AppState,
    selectedProjectId: string,
    startDate: string,
    endDate: string,
    options?: { mirroredTransactionIds?: Set<string>; requireJournalMirror?: boolean },
    selectedBuildingId: string = 'all'
): ProjectProfitLossTotals {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const excludedCats = getProfitLossExcludedCategoryIds(state);
    const bsOnlyPl = findProjectAssetCategory(state.categories, 'ASSET_BALANCE_SHEET_ONLY');
    if (bsOnlyPl) excludedCats.add(bsOnlyPl.id);

    const rentalCats = new Set(state.categories.filter((c) => c.isRental).map((c) => c.id));

    const categoryMap = new Map(state.categories.map((c) => [c.id, c]));

    const categoryAmounts: Record<string, number> = {};
    let totalIncome = 0;
    let totalExpense = 0;
    const salesOfFixedAssetCatId = findProjectAssetCategory(state.categories, 'SALES_OF_FIXED_ASSET')?.id;
    const costOfAssetSoldCatId = findProjectAssetCategory(state.categories, 'COST_OF_ASSET_SOLD')?.id;
    const assetSaleProceedsCatId = findProjectAssetCategory(state.categories, 'ASSET_SALE_PROCEEDS')?.id;
    let assetSaleRevenue = 0;
    let assetSaleCost = 0;

    const incomeRef = { value: 0 };
    const expenseRef = { value: 0 };
    const processedBills = runPlBillAccrual(
        state,
        selectedProjectId,
        selectedBuildingId,
        startDate,
        endDate,
        categoryAmounts,
        incomeRef,
        expenseRef
    );
    totalIncome += incomeRef.value;
    totalExpense += expenseRef.value;

    const scope = plEntityScope(selectedProjectId, selectedBuildingId);
    const clearingAccountId = state.accounts.find((a) => a.name === 'Internal Clearing')?.id;
    state.transactions.forEach((tx) => {
        if (options?.requireJournalMirror && options.mirroredTransactionIds && !options.mirroredTransactionIds.has(tx.id)) {
            return;
        }
        if (tx.billId && processedBills.has(tx.billId)) {
            return;
        }

        if (isTransactionFromVoidedOrCancelledInvoice(tx, state)) return;

        if (!transactionMatchesFinancialEntityScope(tx, state as ReportStateSlice, scope)) return;

        const projectId = resolveProjectIdForTransaction(tx, state);
        const buildingId = resolveBuildingIdForTransaction(tx, state as ReportStateSlice);
        if (scopeTargetsBuilding(scope)) {
            if (!buildingId) return;
        } else if (scopeTargetsProject(scope)) {
            if (!projectId) return;
        }

        if (transactionIsDuplicatePrepaidAdvanceVersusAccruedBill(tx, state, processedBills, selectedProjectId)) {
            return;
        }

        const categoryId = resolvePlCategoryIdForTransaction(tx, state, processedBills);
        const excludeRentalCats =
            scopeTargetsProject(scope) || (scopeIsConsolidated(scope) && !!projectId && !buildingId);

        if (categoryId && (excludedCats.has(categoryId) || (excludeRentalCats && rentalCats.has(categoryId)))) return;

        if (clearingAccountId && tx.accountId === clearingAccountId) {
            return;
        }

        const date = new Date(tx.date);
        if (date < start || date > end) return;

        const catId =
            categoryId ||
            (tx.type === TransactionType.INCOME ? 'uncategorized_income' : 'uncategorized_expense');

        if (tx.type === TransactionType.INCOME) {
            if (categoryId === salesOfFixedAssetCatId || categoryId === assetSaleProceedsCatId) {
                assetSaleRevenue += tx.amount;
                totalIncome += tx.amount;
                return;
            }
            categoryAmounts[catId] = (categoryAmounts[catId] || 0) + tx.amount;
            totalIncome += tx.amount;
        } else if (tx.type === TransactionType.EXPENSE) {
            if (categoryId === costOfAssetSoldCatId) {
                assetSaleCost += tx.amount;
                totalExpense += tx.amount;
                return;
            }
            const category = categoryId ? categoryMap.get(categoryId) : null;
            if (category && category.type === TransactionType.INCOME) {
                categoryAmounts[catId] = (categoryAmounts[catId] || 0) - tx.amount;
                totalIncome -= tx.amount;
            } else {
                categoryAmounts[catId] = (categoryAmounts[catId] || 0) + tx.amount;
                totalExpense += tx.amount;
            }
        }
    });

    return {
        totalIncome,
        totalExpense,
        netProfit: totalIncome - totalExpense,
        categoryAmounts,
        assetSaleRevenue,
        assetSaleCost,
    };
}

/**
 * PM Cycle module: same total expense as Project P&L, with "excluded" cost summed from
 * configured excluded expense categories. Net cost base = total expense − excluded (commissionable base).
 */
export function computePmFeeNetBaseForPeriod(
    state: AppState,
    selectedProjectId: string,
    startDate: string,
    endDate: string,
    excludedCategoryIds: Set<string>
): { totalExpense: number; excludedCost: number; netBase: number } {
    const pl = computeProjectProfitLossTotals(state, selectedProjectId, startDate, endDate);
    const categoryMap = new Map(state.categories.map((c) => [c.id, c]));

    let excludedCost = 0;
    excludedCategoryIds.forEach((cid) => {
        const cat = categoryMap.get(cid);
        if (!cat || cat.type !== TransactionType.EXPENSE) return;
        const v = pl.categoryAmounts[cid] ?? 0;
        if (v > 0) excludedCost += v;
    });

    const netBase = Math.max(0, pl.totalExpense - excludedCost);
    return {
        totalExpense: pl.totalExpense,
        excludedCost,
        netBase,
    };
}
