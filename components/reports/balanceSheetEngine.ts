/**
 * Balance sheet calculation engine (IFRS/GAAP-oriented layout).
 * Single source for ProjectBalanceSheet UI and validation; keep formulas aligned with Project P&L (computeProjectProfitLossTotals).
 * Trial Balance (journal) is the double-entry check for posted GL activity; this report uses transactions until migration is complete.
 */

import type { AppState, Account } from '../../types';

/** Minimal state required for balance sheet + cumulative P&L (retained earnings). */
export type BalanceSheetStateInput = Pick<
  AppState,
  | 'accounts'
  | 'transactions'
  | 'categories'
  | 'invoices'
  | 'bills'
  | 'projectAgreements'
  | 'projectReceivedAssets'
  | 'units'
>;
import { TransactionType, InvoiceType, AccountType, LoanSubtype } from '../../types';
import { resolveProjectIdForTransaction } from './reportUtils';
import { findProjectAssetCategory } from '../../constants/projectAssetSystemCategories';
import { resolveSystemAccountId } from '../../services/systemEntityIds';
import { computeProfitLossReport } from './profitLossEngine';

/** Start date for cumulative P&L → retained earnings (company inception). */
export const BS_PL_CUMULATIVE_START = '2000-01-01';

export type BsPosition = 'asset' | 'liability' | 'equity';
export type BsTerm = 'current' | 'non_current';

/** Line grouping keys — mapped from account tags or derived (no hardcoded user account names). */
/** UI labels for `groupKey` (derived / tagged lines). */
export const BS_GROUP_LABELS: Record<BsGroupKey, string> = {
  cash_equivalents: 'Cash & Cash Equivalents',
  bank_accounts: 'Bank Accounts',
  accounts_receivable: 'Accounts Receivable',
  inventory: 'Inventory',
  prepaid_expenses: 'Prepaid Expenses',
  other_current_assets: 'Other Current Assets',
  ppe: 'Property, Plant & Equipment',
  intangible_assets: 'Intangible Assets',
  long_term_investments: 'Long-term Investments',
  project_assets: 'Project Assets',
  other_non_current_assets: 'Other Non-current Assets',
  accounts_payable: 'Accounts Payable',
  short_term_loans: 'Short-term Loans',
  accrued_expenses: 'Accrued Expenses',
  taxes_payable: 'Taxes Payable',
  other_current_liabilities: 'Other Current Liabilities',
  long_term_loans: 'Long-term Loans',
  deferred_liabilities: 'Deferred Liabilities',
  other_non_current_liabilities: 'Other Non-current Liabilities',
  owner_capital: 'Owner / Shareholder Capital',
  retained_earnings: 'Retained Earnings',
  drawings: 'Drawings / Withdrawals',
  revaluation_surplus: 'Revaluation Surplus',
  other_equity: 'Other Equity Adjustments',
  internal_clearing_suspense: 'Internal Clearing / Suspense',
  unknown: 'Unclassified',
};

export type BsGroupKey =
  | 'cash_equivalents'
  | 'bank_accounts'
  | 'accounts_receivable'
  | 'inventory'
  | 'prepaid_expenses'
  | 'other_current_assets'
  | 'ppe'
  | 'intangible_assets'
  | 'long_term_investments'
  | 'project_assets'
  | 'other_non_current_assets'
  | 'accounts_payable'
  | 'short_term_loans'
  | 'accrued_expenses'
  | 'taxes_payable'
  | 'other_current_liabilities'
  | 'long_term_loans'
  | 'deferred_liabilities'
  | 'other_non_current_liabilities'
  | 'owner_capital'
  | 'retained_earnings'
  | 'drawings'
  | 'revaluation_surplus'
  | 'other_equity'
  | 'internal_clearing_suspense'
  | 'unknown';

export interface BalanceSheetLine {
  id: string;
  name: string;
  /** Normal statement sign: assets positive = debit balance; liabilities/equity positive = credit balance (display convention). */
  amount: number;
  accountId?: string;
  groupKey: BsGroupKey;
  position: BsPosition;
  term: BsTerm;
  /** True if excluded from accounting equation (memo / non-GAAP). */
  memo?: boolean;
  /** Classification source for debugging */
  source: 'tag' | 'derived' | 'computed';
}

export interface BalanceSheetValidationIssue {
  code: string;
  message: string;
  accountId?: string;
  severity: 'warning' | 'error';
}

export interface BalanceSheetReportResult {
  asOfDate: string;
  selectedProjectId: string;
  assets: {
    current: BalanceSheetLine[];
    non_current: BalanceSheetLine[];
    total: number;
  };
  liabilities: {
    current: BalanceSheetLine[];
    non_current: BalanceSheetLine[];
    total: number;
  };
  equity: {
    items: BalanceSheetLine[];
    total: number;
  };
  /** Non-GAAP / management memo (does not affect equation totals). */
  supplemental: {
    marketInventoryMemo: number;
  };
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
    /** assets - (liabilities + equity); should be ~0 */
    difference: number;
  };
  retainedEarningsFromPL: number;
  isBalanced: boolean;
  discrepancy: number;
  validation: BalanceSheetValidationIssue[];
  /** All statement lines + computed rows for drill-down / debug */
  debugLines: BalanceSheetLine[];
}

const RENTAL_LIABILITY_KEYWORDS = ['rental liability', 'rent liability', 'rental suspense'];

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Optional columns on Account (migration); safe when undefined. */
function getAccountTag(acc: Account): {
  bsPosition?: BsPosition | null;
  bsTerm?: BsTerm | null;
  bsGroupKey?: string | null;
} {
  return {
    bsPosition: acc.bsPosition ?? undefined,
    bsTerm: acc.bsTerm ?? undefined,
    bsGroupKey: acc.bsGroupKey ?? undefined,
  };
}

/**
 * Classify account for balance sheet (tag overrides > heuristics).
 * Does not hardcode user-defined names except system helpers (Internal Clearing id/name).
 */
export function classifyAccountForBalanceSheet(
  acc: Account,
  opts: { isInternalClearing: boolean; isSysAr: boolean; isSysAp: boolean }
): { position: BsPosition; term: BsTerm; groupKey: BsGroupKey } {
  const tag = getAccountTag(acc);
  if (tag.bsPosition && tag.bsTerm && tag.bsGroupKey) {
    return {
      position: tag.bsPosition as BsPosition,
      term: tag.bsTerm as BsTerm,
      groupKey: tag.bsGroupKey as BsGroupKey,
    };
  }

  if (opts.isInternalClearing) {
    return { position: 'asset', term: 'current', groupKey: 'internal_clearing_suspense' };
  }

  if (tag.bsPosition && tag.bsTerm) {
    return {
      position: tag.bsPosition,
      term: tag.bsTerm,
      groupKey: (tag.bsGroupKey as BsGroupKey) || 'unknown',
    };
  }

  const t = acc.type;
  if (t === AccountType.BANK || t === AccountType.CASH) {
    const nk = normalizeNameKey(acc.name);
    const group: BsGroupKey =
      t === AccountType.CASH || (nk.includes('cash') && !nk.includes('clearing'))
        ? 'cash_equivalents'
        : 'bank_accounts';
    return { position: 'asset', term: 'current', groupKey: group };
  }
  if (t === AccountType.ASSET) {
    if (opts.isSysAr) return { position: 'asset', term: 'current', groupKey: 'accounts_receivable' };
    const id = acc.id || '';
    if (id.includes('received-assets') || normalizeNameKey(acc.name).includes('project received')) {
      return { position: 'asset', term: 'non_current', groupKey: 'project_assets' };
    }
    return { position: 'asset', term: 'non_current', groupKey: 'other_non_current_assets' };
  }
  if (t === AccountType.LIABILITY) {
    if (opts.isSysAp) return { position: 'liability', term: 'current', groupKey: 'accounts_payable' };
    return { position: 'liability', term: 'current', groupKey: 'other_current_liabilities' };
  }
  if (t === AccountType.EQUITY) {
    return { position: 'equity', term: 'non_current', groupKey: 'owner_capital' };
  }
  return { position: 'asset', term: 'current', groupKey: 'other_current_assets' };
}

function lineFromAccount(
  acc: Account,
  amount: number,
  cls: { position: BsPosition; term: BsTerm; groupKey: BsGroupKey },
  source: BalanceSheetLine['source']
): BalanceSheetLine {
  return {
    id: acc.id,
    name: acc.name,
    amount,
    accountId: acc.id,
    groupKey: cls.groupKey,
    position: cls.position,
    term: cls.term,
    source,
  };
}

/**
 * Compute balance sheet as of date for optional single project filter ('all' = consolidated).
 */
export function computeBalanceSheetReport(
  state: BalanceSheetStateInput,
  options: { asOfDate: string; selectedProjectId: string }
): BalanceSheetReportResult {
  const { asOfDate, selectedProjectId } = options;
  const dateLimit = new Date(asOfDate);
  dateLimit.setHours(23, 59, 59, 999);

  const clearingAccount = state.accounts.find((a) => a.name === 'Internal Clearing');
  const clearingId = clearingAccount?.id;
  const sysArId = resolveSystemAccountId(state.accounts, 'sys-acc-ar') ?? 'sys-acc-ar';
  const sysApId = resolveSystemAccountId(state.accounts, 'sys-acc-ap') ?? 'sys-acc-ap';

  const accountBalances: Record<string, number> = {};
  (state.accounts || []).forEach((acc) => {
    accountBalances[acc.id] = 0;
  });

  const accountsWithTransactions = new Set<string>();

  let securityDepositsHeld = 0;
  let ownerFundsHeld = 0;
  let outstandingLoans = 0;
  let ownerContribution = 0;

  const categories = state.categories || [];
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const equityCats = new Set(categories.filter((c) => c.name === 'Owner Equity').map((c) => c.id));
  const drawingsCats = new Set(categories.filter((c) => c.name === 'Owner Withdrawn').map((c) => c.id));
  const secDepIn = categories.find((c) => c.name === 'Security Deposit')?.id;
  const rentalIn = categories.find((c) => c.name === 'Rental Income')?.id;
  const assetReceivedCat = findProjectAssetCategory(categories, 'ASSET_BALANCE_SHEET_ONLY')?.id;
  const secDepOut = new Set(
    categories.filter((c) => c.name === 'Security Deposit Refund' || c.name === 'Owner Security Payout').map((c) => c.id)
  );
  const rentalOut = new Set(categories.filter((c) => c.name === 'Owner Payout').map((c) => c.id));

  (state.transactions || []).forEach((tx) => {
    const txDate = new Date(tx.date);
    if (txDate > dateLimit) return;

    const projectId = resolveProjectIdForTransaction(tx, state);
    if (selectedProjectId !== 'all') {
      if (projectId !== selectedProjectId) return;
      if (!projectId) return;
    }

    if (tx.type === TransactionType.INCOME) {
      if (tx.accountId) accountsWithTransactions.add(tx.accountId);
    } else if (tx.type === TransactionType.EXPENSE) {
      if (tx.accountId) accountsWithTransactions.add(tx.accountId);
    } else if (tx.type === TransactionType.TRANSFER) {
      if (tx.fromAccountId) accountsWithTransactions.add(tx.fromAccountId);
      if (tx.toAccountId) accountsWithTransactions.add(tx.toAccountId);
    } else if (tx.type === TransactionType.LOAN) {
      if (tx.accountId) accountsWithTransactions.add(tx.accountId);
    }

    const applyBalance = (accId: string | undefined, amount: number, factor: number) => {
      if (accId && accountBalances[accId] !== undefined) {
        accountBalances[accId] += amount * factor;
      }
    };

    if (tx.type === TransactionType.INCOME) applyBalance(tx.accountId, tx.amount, 1);
    else if (tx.type === TransactionType.EXPENSE) applyBalance(tx.accountId, tx.amount, -1);
    else if (tx.type === TransactionType.TRANSFER) {
      applyBalance(tx.fromAccountId, tx.amount, -1);
      applyBalance(tx.toAccountId, tx.amount, 1);
    } else if (tx.type === TransactionType.LOAN) {
      const isInflow = tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT;
      applyBalance(tx.accountId, tx.amount, isInflow ? 1 : -1);
    }

    if (tx.type === TransactionType.LOAN) {
      if (tx.subtype === LoanSubtype.RECEIVE) outstandingLoans += tx.amount;
      else if (tx.subtype === LoanSubtype.REPAY || tx.subtype === LoanSubtype.COLLECT) outstandingLoans -= tx.amount;
      return;
    }

    if (tx.type === TransactionType.INCOME) {
      if (tx.categoryId && equityCats.has(tx.categoryId)) {
        ownerContribution += tx.amount;
      } else if (tx.categoryId === secDepIn) {
        /* liability — skip P&L */
      } else if (tx.categoryId === rentalIn) {
        ownerFundsHeld += tx.amount;
      } else if (tx.categoryId === assetReceivedCat) {
        /* BS only */
      }
    } else if (tx.type === TransactionType.EXPENSE) {
      if (clearingAccount && tx.accountId === clearingAccount.id) {
        return;
      }
      if (tx.categoryId && drawingsCats.has(tx.categoryId)) {
        ownerContribution -= tx.amount;
      } else if (tx.categoryId && secDepOut.has(tx.categoryId)) {
        /* skip */
      } else if (tx.categoryId && rentalOut.has(tx.categoryId)) {
        ownerFundsHeld -= tx.amount;
      } else {
        const category = categories.find((c) => c.id === tx.categoryId);
        if (category && category.type === TransactionType.INCOME) {
          return;
        }
        let isOwnerExpense = false;
        const catName = String(catMap.get(tx.categoryId || '') || '');
        if (tx.propertyId && !tx.projectId && !catName.includes('(Tenant)')) {
          isOwnerExpense = true;
        }
        if (isOwnerExpense) {
          ownerFundsHeld -= tx.amount;
        }
      }
    }
  });

  let accountsReceivable = 0;
  const installmentInvoices = (state.invoices || []).filter((inv) => inv.invoiceType === InvoiceType.INSTALLMENT);
  installmentInvoices.forEach((inv) => {
    if (selectedProjectId !== 'all') {
      if (inv.projectId !== selectedProjectId) return;
    }
    if (inv.agreementId) {
      const agreement = state.projectAgreements.find((pa) => pa.id === inv.agreementId);
      if (agreement && agreement.status === 'Cancelled') return;
    }
    if (inv.description?.includes('VOIDED')) return;
    const paidAmount = inv.paidAmount || 0;
    const due = Math.max(0, inv.amount - paidAmount);
    accountsReceivable += due;
  });

  let accountsPayable = 0;
  (state.bills || []).forEach((bill) => {
    if (bill.propertyId) return;
    if (selectedProjectId !== 'all') {
      if (bill.projectId !== selectedProjectId) return;
    }
    if (new Date(bill.issueDate) <= dateLimit) {
      const paidAmount = bill.paidAmount || 0;
      const due = Math.max(0, bill.amount - paidAmount);
      accountsPayable += due;
    }
  });

  const receivedAssetsAccountId =
    resolveSystemAccountId(state.accounts, 'sys-acc-received-assets') ?? 'sys-acc-received-assets';
  const receivedAssetsHeldBalance = (state.projectReceivedAssets || [])
    .filter((a) => !a.soldDate)
    .filter((a) => selectedProjectId === 'all' || a.projectId === selectedProjectId)
    .reduce((sum, a) => sum + (a.recordedValue || 0), 0);
  if (state.accounts?.some((a) => a.id === receivedAssetsAccountId)) {
    accountBalances[receivedAssetsAccountId] = receivedAssetsHeldBalance;
    if (receivedAssetsHeldBalance > 0.01) accountsWithTransactions.add(receivedAssetsAccountId);
  }

  /** Cumulative net profit through as-of date — IFRS/GAAP P&L engine (aligned with Project P&L ledger totals). */
  const pl = computeProfitLossReport(state as AppState, {
    startDate: BS_PL_CUMULATIVE_START,
    endDate: asOfDate,
    selectedProjectId,
  });
  const retainedEarningsFromPL = pl.net_profit;

  const receivedAssetsEquityOffset = receivedAssetsHeldBalance;

  let rentalLiabilityAccountFound = false;

  const validation: BalanceSheetValidationIssue[] = [];
  const debugLines: BalanceSheetLine[] = [];

  const assetLines: BalanceSheetLine[] = [];
  const liabilityLines: BalanceSheetLine[] = [];
  const equityLines: BalanceSheetLine[] = [];

  (state.accounts || []).forEach((acc) => {
    let balance = accountBalances[acc.id] || 0;
    const nameLower = acc.name.toLowerCase();
    if (RENTAL_LIABILITY_KEYWORDS.some((kw) => nameLower.includes(kw))) {
      balance = -ownerFundsHeld;
      rentalLiabilityAccountFound = true;
    }

    const isClearing = clearingId === acc.id;
    const isSysAr = acc.id === sysArId;
    const isSysAp = acc.id === sysApId;

    const cls = classifyAccountForBalanceSheet(acc, { isInternalClearing: !!isClearing, isSysAr, isSysAp });
    const hasTransactions = accountsWithTransactions.has(acc.id);
    const hasBalance = Math.abs(balance) > 0.01;

    if (acc.type === AccountType.EQUITY) {
      if (!hasTransactions || !hasBalance) return;
      const display = -balance;
      const li = lineFromAccount(acc, display, { ...cls, position: 'equity', groupKey: 'owner_capital' }, 'derived');
      equityLines.push(li);
      debugLines.push(li);
      return;
    }

    if (acc.type === AccountType.LIABILITY) {
      if (isSysAp) {
        /** A/P from bills replaces ledger A/P control account to avoid double count */
        return;
      }
      if (hasTransactions && (hasBalance || rentalLiabilityAccountFound)) {
        if (rentalLiabilityAccountFound && !hasBalance) return;
        const display = -balance;
        const li = lineFromAccount(acc, display, cls, 'derived');
        liabilityLines.push(li);
        debugLines.push(li);
      }
      return;
    }

    /** Assets: Bank/Cash/Asset types */
    if (acc.type === AccountType.BANK || acc.type === AccountType.CASH || acc.type === AccountType.ASSET) {
      if (isSysAr) {
        /** A/R from invoices replaces control account */
        return;
      }
      if (isClearing) {
        if (!hasBalance && !hasTransactions) return;
        /** Credit balance on clearing = liability; debit = asset — inter-account transfers should net to zero */
        const b = balance;
        if (b >= 0) {
          const li: BalanceSheetLine = {
            id: acc.id,
            name: acc.name,
            amount: b,
            accountId: acc.id,
            groupKey: 'internal_clearing_suspense',
            position: 'asset',
            term: 'current',
            source: 'derived',
          };
          assetLines.push(li);
          debugLines.push(li);
        } else {
          const li: BalanceSheetLine = {
            id: acc.id,
            name: `${acc.name} (credit balance)`,
            amount: -b,
            accountId: acc.id,
            groupKey: 'internal_clearing_suspense',
            position: 'liability',
            term: 'current',
            source: 'derived',
          };
          liabilityLines.push(li);
          debugLines.push(li);
        }
        if (Math.abs(b) > 0.01) {
          validation.push({
            code: 'CLEARING_NON_ZERO',
            message:
              'Internal Clearing should net to zero across transfers. Non-zero balance indicates reconciliation is needed.',
            accountId: acc.id,
            severity: 'warning',
          });
        }
        return;
      }

      if (!hasTransactions || !hasBalance) return;

      const display = balance;
      const li = lineFromAccount(acc, display, cls, 'derived');
      assetLines.push(li);
      debugLines.push(li);
    }
  });

  const finalSecurityDepositsHeld = 0;
  const finalOwnerFundsHeld = rentalLiabilityAccountFound ? 0 : Math.abs(ownerFundsHeld) > 0.01 ? ownerFundsHeld : 0;
  const finalOutstandingLoans = Math.abs(outstandingLoans) > 0.01 ? outstandingLoans : 0;

  if (Math.abs(accountsReceivable) > 0.01) {
    const arLine: BalanceSheetLine = {
      id: 'computed-ar-installments',
      name: 'Accounts Receivable (from installment invoices)',
      amount: accountsReceivable,
      groupKey: 'accounts_receivable',
      position: 'asset',
      term: 'current',
      source: 'computed',
    };
    assetLines.push(arLine);
    debugLines.push(arLine);
  }

  if (Math.abs(accountsPayable) > 0.01) {
    const apLine: BalanceSheetLine = {
      id: 'computed-ap-bills',
      name: 'Accounts Payable (from unpaid bills)',
      amount: accountsPayable,
      groupKey: 'accounts_payable',
      position: 'liability',
      term: 'current',
      source: 'computed',
    };
    liabilityLines.push(apLine);
    debugLines.push(apLine);
  }

  if (Math.abs(finalOutstandingLoans) > 0.01) {
    const loanLine: BalanceSheetLine = {
      id: 'computed-outstanding-loans',
      name: 'Outstanding loans (from loan transactions)',
      amount: finalOutstandingLoans,
      groupKey: 'long_term_loans',
      position: 'liability',
      term: 'non_current',
      source: 'computed',
    };
    liabilityLines.push(loanLine);
    debugLines.push(loanLine);
  }

  if (Math.abs(finalSecurityDepositsHeld) > 0.01) {
    const sdLine: BalanceSheetLine = {
      id: 'computed-security-deposits',
      name: 'Tenant security deposits held',
      amount: finalSecurityDepositsHeld,
      groupKey: 'other_current_liabilities',
      position: 'liability',
      term: 'current',
      source: 'computed',
    };
    liabilityLines.push(sdLine);
    debugLines.push(sdLine);
  }

  if (Math.abs(finalOwnerFundsHeld) > 0.01) {
    const ofLine: BalanceSheetLine = {
      id: 'computed-owner-funds-rental',
      name: 'Owner funds held (rental pass-through)',
      amount: finalOwnerFundsHeld,
      groupKey: 'other_current_liabilities',
      position: 'liability',
      term: 'current',
      source: 'computed',
    };
    liabilityLines.push(ofLine);
    debugLines.push(ofLine);
  }

  const finalOwnerContribution = Math.abs(ownerContribution) > 0.01 ? ownerContribution : 0;
  if (Math.abs(finalOwnerContribution) > 0.01) {
    const ocLine: BalanceSheetLine = {
      id: 'computed-owner-contribution',
      name: "Owner contributions / withdrawals (via Owner Equity & Owner Withdrawn categories)",
      amount: finalOwnerContribution,
      groupKey: 'owner_capital',
      position: 'equity',
      term: 'non_current',
      source: 'computed',
    };
    equityLines.push(ocLine);
    debugLines.push(ocLine);
  }

  const finalRetainedEarnings = Math.abs(retainedEarningsFromPL) > 0.01 ? retainedEarningsFromPL : 0;
  if (Math.abs(finalRetainedEarnings) > 0.01) {
    const reLine: BalanceSheetLine = {
      id: 'computed-retained-earnings',
      name: 'Retained earnings (cumulative net profit per P&L)',
      amount: finalRetainedEarnings,
      groupKey: 'retained_earnings',
      position: 'equity',
      term: 'non_current',
      source: 'computed',
    };
    equityLines.push(reLine);
    debugLines.push(reLine);
  }

  const finalReceivedAssetsEquityOffset = Math.abs(receivedAssetsEquityOffset) > 0.01 ? receivedAssetsEquityOffset : 0;
  if (Math.abs(finalReceivedAssetsEquityOffset) > 0.01) {
    const raLine: BalanceSheetLine = {
      id: 'computed-in-kind-equity',
      name: 'In-kind project assets (held) — equity offset',
      amount: finalReceivedAssetsEquityOffset,
      groupKey: 'other_equity',
      position: 'equity',
      term: 'non_current',
      source: 'computed',
    };
    equityLines.push(raLine);
    debugLines.push(raLine);
  }

  const soldUnitIds = new Set<string>();
  (state.projectAgreements || []).forEach((pa) => {
    if (pa.status === 'Active' && new Date(pa.issueDate) <= dateLimit) {
      (pa.unitIds || []).forEach((uid) => soldUnitIds.add(uid));
    }
  });
  const marketInventory = (state.units || [])
    .filter((u) => (selectedProjectId === 'all' || u.projectId === selectedProjectId) && !soldUnitIds.has(u.id))
    .reduce((sum, u) => sum + (u.salePrice || 0), 0);

  const supplementalMarketMemo = Math.abs(marketInventory) > 0.01 ? marketInventory : 0;
  if (supplementalMarketMemo > 0) {
    validation.push({
      code: 'MEMO_INVENTORY',
      message:
        'Unsold units list-price total is shown as supplemental information only — not recognized as inventory under IFRS until sale.',
      severity: 'warning',
    });
  }

  const sumAssets = assetLines.reduce((s, l) => s + l.amount, 0);
  const sumLiab = liabilityLines.reduce((s, l) => s + l.amount, 0);
  const sumEq = equityLines.reduce((s, l) => s + l.amount, 0);

  const difference = sumAssets - (sumLiab + sumEq);
  const isBalanced = Math.abs(difference) < 1;

  if (!isBalanced) {
    console.warn('[BalanceSheet] Equation imbalance', {
      asOfDate,
      selectedProjectId,
      difference,
      sumAssets,
      sumLiab,
      sumEq,
    });
    validation.push({
      code: 'EQUATION_IMBALANCE',
      message: `Assets ≠ Liabilities + Equity by ${difference.toFixed(2)}. Review computed lines and clearing accounts.`,
      severity: 'error',
    });
  }

  const currentAssets = assetLines.filter((l) => l.term === 'current');
  const nonCurrentAssets = assetLines.filter((l) => l.term === 'non_current');
  const currentLiab = liabilityLines.filter((l) => l.term === 'current');
  const nonCurrentLiab = liabilityLines.filter((l) => l.term === 'non_current');

  return {
    asOfDate,
    selectedProjectId,
    assets: {
      current: currentAssets,
      non_current: nonCurrentAssets,
      total: sumAssets,
    },
    liabilities: {
      current: currentLiab,
      non_current: nonCurrentLiab,
      total: sumLiab,
    },
    equity: {
      items: equityLines,
      total: sumEq,
    },
    supplemental: {
      marketInventoryMemo: supplementalMarketMemo,
    },
    totals: {
      assets: sumAssets,
      liabilities: sumLiab,
      equity: sumEq,
      difference,
    },
    retainedEarningsFromPL,
    isBalanced,
    discrepancy: difference,
    validation,
    debugLines,
  };
}
