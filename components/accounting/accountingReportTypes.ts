/** Reports consolidated under the Accounting module. */
export type AccountingView =
  | 'Analytics'
  | 'Profit & Loss'
  | 'Balance Sheet'
  | 'Trial Balance'
  | 'Reconciliation'
  | 'Cash Flows'
  | 'Investor Distribution'
  | 'Overview Reports'
  | 'Banking Analytics'
  | 'Bank Accounts'
  | 'Account Consistency'
  | 'Report Designer'
  | 'Unposted Transactions';

export const ACCOUNTING_FINANCIAL_REPORTS: AccountingView[] = [
  'Analytics',
  'Unposted Transactions',
  'Profit & Loss',
  'Balance Sheet',
  'Trial Balance',
  'Reconciliation',
  'Cash Flows',
  'Investor Distribution',
];

export const ACCOUNTING_PORTFOLIO_REPORTS: AccountingView[] = [
  'Overview Reports',
  'Banking Analytics',
  'Bank Accounts',
  'Account Consistency',
  'Report Designer',
];

export const ACCOUNTING_ALL_REPORTS: AccountingView[] = [
  ...ACCOUNTING_FINANCIAL_REPORTS,
  ...ACCOUNTING_PORTFOLIO_REPORTS,
];

export function isAccountingFinancialView(view: string): view is AccountingView {
  return (ACCOUNTING_FINANCIAL_REPORTS as readonly string[]).includes(view);
}

export function isAccountingPortfolioView(view: string): view is AccountingView {
  return (ACCOUNTING_PORTFOLIO_REPORTS as readonly string[]).includes(view);
}

export function isAccountingView(view: string): view is AccountingView {
  return (ACCOUNTING_ALL_REPORTS as readonly string[]).includes(view);
}
