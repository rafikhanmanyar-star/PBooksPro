/** Reports consolidated under the Accounting module. */

export type AccountingView =

  | 'Analytics'

  | 'Trial Balance'

  | 'Profit & Loss'

  | 'Balance Sheet'

  | 'Cash Flows'

  | 'Reconciliation'

  | 'Investor Distribution'

  | 'Overview Reports'

  | 'Banking Analytics'

  | 'Bank Accounts'

  | 'Account Consistency'

  | 'Report Designer'

  | 'Unposted Transactions';



export const ACCOUNTING_FINANCIAL_REPORTS: AccountingView[] = [

  'Trial Balance',

  'Profit & Loss',

  'Balance Sheet',

  'Cash Flows',

  'Analytics',

  'Unposted Transactions',

  'Reconciliation',

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



/** Project management reports (not statutory accounting). */

export type ProjectFinancialView =

  | 'Project Financial Position'

  | 'Project Profitability'

  | 'Project Cash Flow';



export const PROJECT_FINANCIAL_REPORTS: ProjectFinancialView[] = [

  'Project Financial Position',

  'Project Profitability',

  'Project Cash Flow',

];



export function isProjectFinancialView(view: string): view is ProjectFinancialView {

  return (PROJECT_FINANCIAL_REPORTS as readonly string[]).includes(view);

}

