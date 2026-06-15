/**
 * Canonical system account definitions (ids used across rental payments, KPIs, project sales).
 * Shared by AppContext, backend seed, and legacy SQLite persistence.
 */
import { Account, AccountType } from '../types';

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
