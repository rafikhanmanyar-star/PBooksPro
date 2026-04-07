/**
 * Loan Manager UI utilities. PKR display and status/group derived from existing data only.
 */

export const PKR_SYMBOL = '₨';

export function formatPKR(value: number): string {
  return `${PKR_SYMBOL} ${Math.abs(value).toLocaleString('en-PK')}`;
}

/** Loan display status from balance and activity (UI only) */
export type LoanStatusUI = 'Pending' | 'Partial' | 'Completed' | 'Overdue';

export function getLoanStatusUI(
  netBalance: number,
  hasRepayOrCollect: boolean,
  lastActivityDate: Date
): LoanStatusUI {
  const settled = Math.abs(netBalance) < 0.01;
  if (settled) return 'Completed';
  const now = new Date();
  const daysSince = (now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 30) return 'Overdue';
  if (hasRepayOrCollect) return 'Partial';
  return 'Pending';
}

/** Quick filter: To Receive (they owe us), To Return (we owe), Overdue, Completed, All */
export type QuickFilterKey = 'all' | 'to_receive' | 'to_return' | 'overdue' | 'completed';

/** Advanced filter state (UI only) */
export interface AdvancedFilterState {
  status: LoanStatusUI | '';
  amountRange: 'under_5k' | '5k_20k' | '20k_plus' | '';
  dueDate: 'today' | 'week' | 'month' | '';
  loanType: 'i_gave' | 'i_borrowed' | '';
}

export const defaultAdvancedFilter: AdvancedFilterState = {
  status: '',
  amountRange: '',
  dueDate: '',
  loanType: '',
};

/** Tree group key matching quick filter */
export type TreeGroupKey = 'to_receive' | 'to_return' | 'completed';

export function getTreeGroup(netBalance: number): TreeGroupKey {
  if (Math.abs(netBalance) < 0.01) return 'completed';
  if (netBalance < 0) return 'to_receive'; // they owe us
  return 'to_return'; // we owe them
}
