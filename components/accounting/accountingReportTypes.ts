/** Financial statement reports consolidated under the Accounting module. */
export type AccountingView =
  | 'Profit & Loss'
  | 'Balance Sheet'
  | 'Trial Balance'
  | 'Reconciliation'
  | 'Cash Flows'
  | 'Investor Distribution';

export const ACCOUNTING_FINANCIAL_REPORTS: AccountingView[] = [
  'Profit & Loss',
  'Balance Sheet',
  'Trial Balance',
  'Reconciliation',
  'Cash Flows',
  'Investor Distribution',
];

export function isAccountingFinancialView(view: string): view is AccountingView {
  return (ACCOUNTING_FINANCIAL_REPORTS as readonly string[]).includes(view);
}
