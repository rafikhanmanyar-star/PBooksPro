/**
 * Canonical system account definitions (ids used across rental payments, KPIs, project sales).
 * Kept in one module so AppContext, loadState repair, and backend seed stay aligned.
 */
import { Account, AccountType } from '../../types';
import type { AccountsRepository } from './repositories/index';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart';

export const MANDATORY_SYSTEM_ACCOUNTS: Account[] = [
    { id: 'sys-acc-cash', name: 'Cash', type: AccountType.BANK, balance: 0, isPermanent: true, description: 'Default cash account' },
    { id: 'sys-acc-ar', name: 'Accounts Receivable', type: AccountType.ASSET, balance: 0, isPermanent: true, description: 'System account for unpaid invoices' },
    { id: 'sys-acc-ap', name: 'Accounts Payable', type: AccountType.LIABILITY, balance: 0, isPermanent: true, description: 'System account for unpaid bills and salaries' },
    { id: 'sys-acc-equity', name: 'Owner Equity', type: AccountType.EQUITY, balance: 0, isPermanent: true, description: 'System account for owner capital and equity' },
    { id: 'sys-acc-clearing', name: 'Internal Clearing', type: AccountType.BANK, balance: 0, isPermanent: true, description: 'System account for internal transfers and equity clearing' },
    { id: 'sys-acc-sec-liability', name: 'Security Liability', type: AccountType.LIABILITY, balance: 0, isPermanent: true, description: 'Tenant security deposits held until refunded or applied' },
    { id: 'sys-acc-received-assets', name: 'Project Received Assets', type: AccountType.ASSET, balance: 0, isPermanent: true, description: 'Non-cash consideration received on unit sales until sold' },
    { id: 'sys-acc-retained-earnings', name: 'Retained Earnings', type: AccountType.EQUITY, balance: 0, isPermanent: true, description: 'Cumulative retained earnings after year-end close' },
    { id: 'sys-acc-current-year-earnings', name: 'Current Year Earnings', type: AccountType.EQUITY, balance: 0, isPermanent: true, description: 'Current fiscal year net income before year-end transfer' },
    { id: 'sys-acc-income-summary', name: 'Income Summary', type: AccountType.EQUITY, balance: 0, isPermanent: true, description: 'Temporary closing account for period income' },
    { id: 'sys-acc-expense-summary', name: 'Expense Summary', type: AccountType.EQUITY, balance: 0, isPermanent: true, description: 'Temporary closing account for period expenses' },
];

/**
 * Inserts any mandatory system accounts missing from the DB (e.g. after app updates or restored backups).
 */
export function ensureMandatorySystemAccountsPersisted(
    accountsRepo: AccountsRepository,
    existing: Account[]
): void {
    const have = new Set(existing.map(a => a.id));
    for (const acc of MANDATORY_SYSTEM_ACCOUNTS) {
        if (have.has(acc.id)) continue;
        try {
            accountsRepo.insert({
                id: acc.id,
                tenantId: GLOBAL_SYSTEM_TENANT_ID,
                name: acc.name,
                type: acc.type,
                balance: 0,
                description: acc.description,
                isPermanent: true,
            } as Partial<Account>);
            have.add(acc.id);
        } catch (e) {
            console.warn(`[mandatorySystemAccounts] Could not insert ${acc.id}:`, e);
        }
    }
}
