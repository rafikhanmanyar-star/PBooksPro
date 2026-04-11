/**
 * Single source of truth for Project P&L totals (bills accrual + transactions, same rules as ProjectProfitLossReport).
 * Used by Profit Distribution so "Available to Distribute" matches Project Selling → Profit & Loss.
 */

import type { AppState, Transaction } from '../../types';
import { TransactionType } from '../../types';
import { findProjectAssetCategory } from '../../constants/projectAssetSystemCategories';
import { getProfitLossExcludedCategoryIds } from '../../services/accounting/plExclusions';
import { resolveProjectIdForTransaction, isTransactionFromVoidedOrCancelledInvoice } from './reportUtils';

/** Bill accrual section of P&L (must match computeProjectProfitLossTotals). */
function runPlBillAccrual(
    state: AppState,
    selectedProjectId: string,
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

    state.bills.forEach((bill) => {
        if (!bill.projectId) return;
        if (selectedProjectId !== 'all' && bill.projectId !== selectedProjectId) return;

        const billDate = new Date(bill.issueDate);
        if (billDate < start || billDate > end) return;

        if (!bill.expenseCategoryItems || bill.expenseCategoryItems.length === 0) {
            if (!bill.categoryId) return;
            const categoryId = bill.categoryId;
            if (excludedCats.has(categoryId) || rentalCats.has(categoryId)) return;

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

                if (excludedCats.has(itemCategoryId) || rentalCats.has(itemCategoryId)) return;

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

/** Bills whose expense is fully reflected in P&L via accrual lines (skip double-counting payment txs). */
export function computePlProcessedBills(
    state: AppState,
    selectedProjectId: string,
    startDate: string,
    endDate: string
): Set<string> {
    const categoryAmounts: Record<string, number> = {};
    return runPlBillAccrual(state, selectedProjectId, startDate, endDate, categoryAmounts, { value: 0 }, { value: 0 });
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
        if (bill && !bill.expenseCategoryItems && !categoryId) {
            categoryId = bill.categoryId;
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

/** Same inclusion rules as computeProjectProfitLossTotals for the transaction loop (before amount bucketing). */
export function transactionIncludedInPlLoop(
    tx: Transaction,
    state: AppState,
    processedBills: Set<string>,
    selectedProjectId: string,
    startDate: string,
    endDate: string
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

    const projectId = resolveProjectIdForTransaction(tx, state);
    if (!projectId) return false;
    if (selectedProjectId !== 'all' && projectId !== selectedProjectId) return false;

    const categoryId = resolvePlCategoryIdForTransaction(tx, state, processedBills);
    if (categoryId && (excludedCats.has(categoryId) || rentalCats.has(categoryId))) return false;

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
    endDate: string
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
    const processedBills = runPlBillAccrual(state, selectedProjectId, startDate, endDate, categoryAmounts, incomeRef, expenseRef);
    totalIncome += incomeRef.value;
    totalExpense += expenseRef.value;

    const clearingAccountId = state.accounts.find((a) => a.name === 'Internal Clearing')?.id;
    state.transactions.forEach((tx) => {
        if (tx.billId && processedBills.has(tx.billId)) {
            return;
        }

        if (isTransactionFromVoidedOrCancelledInvoice(tx, state)) return;

        const projectId = resolveProjectIdForTransaction(tx, state);
        if (!projectId) return;

        if (selectedProjectId !== 'all' && projectId !== selectedProjectId) return;

        const categoryId = resolvePlCategoryIdForTransaction(tx, state, processedBills);

        if (categoryId && (excludedCats.has(categoryId) || rentalCats.has(categoryId))) return;

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
