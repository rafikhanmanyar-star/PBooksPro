/**
 * Canonical system category definitions (rental, monthly service charges, project sales, payroll).
 * Monthly Service Charges UI requires at minimum:
 * - Rental Income (deduction leg), Service Charge Income (allocation leg), Owner Service Charge Payment;
 * - Service Charge Deduction (legacy expense) for reports/tools that still reference it.
 */
import { Category, TransactionType } from '../../types';
import type { CategoriesRepository } from './repositories/index';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart';

export const MANDATORY_SYSTEM_CATEGORIES: Category[] = [
    // Income
    { id: 'sys-cat-rent-inc', name: 'Rental Income', type: TransactionType.INCOME, isPermanent: true, isRental: true },
    { id: 'sys-cat-svc-inc', name: 'Service Charge Income', type: TransactionType.INCOME, isPermanent: true, isRental: true },
    { id: 'sys-cat-sec-dep', name: 'Security Deposit', type: TransactionType.INCOME, isPermanent: true, isRental: true },
    { id: 'sys-cat-proj-list', name: 'Project Listed Income', type: TransactionType.INCOME, isPermanent: true },
    { id: 'sys-cat-unit-sell', name: 'Unit Selling Income', type: TransactionType.INCOME, isPermanent: true },
    { id: 'sys-cat-penalty-inc', name: 'Penalty Income', type: TransactionType.INCOME, isPermanent: true },
    { id: 'sys-cat-own-eq', name: 'Owner Equity', type: TransactionType.INCOME, isPermanent: true },
    { id: 'sys-cat-own-svc-pay', name: 'Owner Service Charge Payment', type: TransactionType.INCOME, isPermanent: true, isRental: true },

    // Project received assets (non-cash installment consideration, sale recognition)
    { id: 'sys-cat-rev-asset-in-kind', name: 'Revenue - Asset received in kind', type: TransactionType.INCOME, isPermanent: true },
    { id: 'sys-cat-asset-bs-only', name: 'Asset received (balance sheet only)', type: TransactionType.INCOME, isPermanent: true },
    { id: 'sys-cat-sales-fixed-asset', name: 'Sales of fixed asset', type: TransactionType.INCOME, isPermanent: true },
    { id: 'sys-cat-asset-sale-proceeds', name: 'Asset Sale Proceeds', type: TransactionType.INCOME, isPermanent: true },
    { id: 'sys-cat-cost-asset-sold', name: 'Cost of Asset Sold', type: TransactionType.EXPENSE, isPermanent: true },

    // Sales returns (cancellation refunds & penalty tagging)
    { id: 'sys-cat-sales-return-refund', name: 'Sales Return Refund (revenue reduction)', type: TransactionType.INCOME, isPermanent: true },
    { id: 'sys-cat-sales-return-penalty', name: 'Sales Return Penalty', type: TransactionType.INCOME, isPermanent: true },

    // Expense
    { id: 'sys-cat-sal-adv', name: 'Salary Advance', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-proj-sal', name: 'Project Staff Salary', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-rent-sal', name: 'Rental Staff Salary', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-bld-maint', name: 'Building Maintenance', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-bld-util', name: 'Building Utilities', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-own-pay', name: 'Owner Payout', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-own-sec-pay', name: 'Owner Security Payout', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-sec-ref', name: 'Security Deposit Refund', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-prop-rep-own', name: 'Property Repair (Owner)', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-prop-rep-ten', name: 'Property Repair (Tenant)', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },
    { id: 'sys-cat-brok-fee', name: 'Broker Fee', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-rebate', name: 'Rebate Amount', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-pm-cost', name: 'Project Management Cost', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-own-with', name: 'Owner Withdrawn', type: TransactionType.EXPENSE, isPermanent: true },

    // Discounts (Virtual Expenses)
    { id: 'sys-cat-disc-cust', name: 'Customer Discount', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-disc-flr', name: 'Floor Discount', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-disc-lump', name: 'Lump Sum Discount', type: TransactionType.EXPENSE, isPermanent: true },
    { id: 'sys-cat-disc-misc', name: 'Misc Discount', type: TransactionType.EXPENSE, isPermanent: true },

    // Legacy
    { id: 'sys-cat-svc-deduct', name: 'Service Charge Deduction', type: TransactionType.EXPENSE, isPermanent: true, isRental: true },

    // Payroll
    { id: 'sys-cat-sal-exp', name: 'Salary Expenses', type: TransactionType.EXPENSE, isPermanent: true },
];

/**
 * Inserts any mandatory system categories missing from the DB (e.g. after app updates or restored backups).
 */
export function ensureMandatorySystemCategoriesPersisted(
    categoriesRepo: CategoriesRepository,
    existing: Category[]
): void {
    const have = new Set(existing.map(c => c.id));
    for (const cat of MANDATORY_SYSTEM_CATEGORIES) {
        if (have.has(cat.id)) continue;
        try {
            categoriesRepo.insert({
                id: cat.id,
                tenantId: GLOBAL_SYSTEM_TENANT_ID,
                name: cat.name,
                type: cat.type,
                isPermanent: true,
                isRental: cat.isRental ?? false,
                isHidden: cat.isHidden ?? false,
            } as Partial<Category>);
            have.add(cat.id);
        } catch (e) {
            console.warn(`[mandatorySystemCategories] Could not insert ${cat.id}:`, e);
        }
    }
}
