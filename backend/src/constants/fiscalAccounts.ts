/** System GL accounts used by fiscal period close. */
export const SYS_RETAINED_EARNINGS = 'sys-acc-retained-earnings';
export const SYS_CURRENT_YEAR_EARNINGS = 'sys-acc-current-year-earnings';
export const SYS_INCOME_SUMMARY = 'sys-acc-income-summary';
export const SYS_EXPENSE_SUMMARY = 'sys-acc-expense-summary';
export const SYS_CLEARING = 'sys-acc-clearing';

export const FISCAL_EQUITY_ACCOUNT_IDS = new Set([
  SYS_RETAINED_EARNINGS,
  SYS_CURRENT_YEAR_EARNINGS,
  SYS_INCOME_SUMMARY,
  SYS_EXPENSE_SUMMARY,
]);
