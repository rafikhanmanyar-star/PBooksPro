/**
 * Balance sheet calculation engine (IFRS/GAAP-oriented layout).
 * When `journalLedger` is provided, account balances derive from journal_lines (unified GL).
 * Otherwise falls back to transaction roll-forward (legacy).
 */

import type { AppState, Account } from '../../types';
import {
  computeAccountBalancesFromJournal,
  type JournalLedgerInput,
} from '../../services/financialEngine/journalLedgerCore';

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
  | 'properties'
> & { journalLedger?: JournalLedgerInput };
import { TransactionType, InvoiceType, AccountType, LoanSubtype } from '../../types';
import {
  type ReportStateSlice,
} from './reportUtils';
import {
  billMatchesFinancialEntityScope,
  FINANCIAL_ENTITY_FILTER_ALL,
  invoiceMatchesFinancialEntityScope,
  scopeTargetsBuilding,
  scopeTargetsProject,
  transactionMatchesFinancialEntityScope,
  type FinancialEntityScope,
} from './financialEntityScope';
import { isDimensionScopeActive } from '../../shared/financial-core/dimensionScope';
import { findProjectAssetCategory } from '../../constants/projectAssetSystemCategories';
import { resolveSystemAccountId } from '../../services/systemEntityIds';
import { computeProfitLossReport } from './profitLossEngine';
import {
  OPENING_BALANCE_EQUITY_ID,
  openingAmountToGross,
} from '../../services/financialEngine/trialBalanceCore';
import { roundMoney } from '../../services/financialEngine/validation';
import {
  fiscalYearStartForDate,
  priorFiscalYearEnd,
  type BalanceSheetCompareMode,
  compareAsOfDate,
} from '../../utils/fiscalYear';

/** Start date for cumulative P&L → retained earnings (company inception). */
export const BS_PL_CUMULATIVE_START = '2000-01-01';

export type BsPosition = 'asset' | 'liability' | 'equity';
export type BsTerm = 'current' | 'non_current';

/** Line grouping keys — mapped from account tags or derived (no hardcoded user account names). */
/** UI labels for `groupKey` (derived / tagged lines). */
export const BS_GROUP_LABELS: Record<BsGroupKey, string> = {
  cash_equivalents: 'Cash in Hand',
  bank_accounts: 'Bank Accounts',
  accounts_receivable: 'Accounts Receivable',
  inventory: 'Inventory',
  prepaid_expenses: 'Advances to Suppliers',
  other_current_assets: 'Other Current Assets',
  ppe: 'Property, Plant & Equipment',
  intangible_assets: 'Fixed Assets',
  long_term_investments: 'Long-Term Investments',
  project_assets: 'Project Assets',
  other_non_current_assets: 'Security Deposits',
  accounts_payable: 'Accounts Payable',
  short_term_loans: 'Short-Term Loans',
  accrued_expenses: 'Accrued Expenses',
  taxes_payable: 'Taxes Payable',
  other_current_liabilities: 'Customer Advances',
  long_term_loans: 'Long-Term Loans',
  deferred_liabilities: 'Contractor Payables',
  other_non_current_liabilities: 'Lease Liabilities',
  owner_capital: 'Share Capital',
  retained_earnings: 'Retained Earnings',
  current_year_earnings: 'Current Year Earnings',
  drawings: 'Drawings / Withdrawals',
  revaluation_surplus: 'Investor Capital',
  other_equity: 'Partner Capital',
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
  | 'current_year_earnings'
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
  /** Retained earnings through prior fiscal year end (cumulative P&L minus current-year P&L). */
  retainedEarningsPriorYears: number;
  /** Current fiscal year net profit/loss through as-of date. */
  currentYearEarningsFromPL: number;
  isBalanced: boolean;
  discrepancy: number;
  validation: BalanceSheetValidationIssue[];
  /** All statement lines + computed rows for drill-down / debug */
  debugLines: BalanceSheetLine[];
}

const RENTAL_LIABILITY_KEYWORDS = ['rental liability', 'rent liability', 'rental suspense'];

/** DB / API may store `BANK` or `Bank`; compare case-insensitively. */
function accountTypeKey(type: string | AccountType): string {
  return String(type).trim().toLowerCase();
}

function isAccountType(acc: Account, ...types: AccountType[]): boolean {
  const key = accountTypeKey(acc.type);
  return types.some((t) => accountTypeKey(t) === key);
}

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
  if (isAccountType(acc, AccountType.BANK, AccountType.CASH)) {
    const nk = normalizeNameKey(acc.name);
    const group: BsGroupKey =
      isAccountType(acc, AccountType.CASH) || (nk.includes('cash') && !nk.includes('clearing'))
        ? 'cash_equivalents'
        : 'bank_accounts';
    return { position: 'asset', term: 'current', groupKey: group };
  }
  if (isAccountType(acc, AccountType.ASSET)) {
    if (opts.isSysAr) return { position: 'asset', term: 'current', groupKey: 'accounts_receivable' };
    const id = acc.id || '';
    if (id.includes('received-assets') || normalizeNameKey(acc.name).includes('project received')) {
      return { position: 'asset', term: 'non_current', groupKey: 'project_assets' };
    }
    return { position: 'asset', term: 'non_current', groupKey: 'other_non_current_assets' };
  }
  if (isAccountType(acc, AccountType.LIABILITY)) {
    if (opts.isSysAp) return { position: 'liability', term: 'current', groupKey: 'accounts_payable' };
    return { position: 'liability', term: 'current', groupKey: 'other_current_liabilities' };
  }
  if (isAccountType(acc, AccountType.EQUITY)) {
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

/** Journal signed balances use normal balance direction; legacy tx roll-forward uses inverted equity/liability storage. */
function statementDisplayAmount(balance: number, position: BsPosition, useJournal: boolean): number {
  if (useJournal && (position === 'equity' || position === 'liability')) return balance;
  if (position === 'equity' || position === 'liability') return -balance;
  return balance;
}

/**
 * Compute balance sheet as of date for optional project or building filter ('all' = consolidated).
 */
export function computeBalanceSheetReport(
  state: BalanceSheetStateInput,
  options: {
    asOfDate: string;
    selectedProjectId: string;
    selectedBuildingId?: string;
    useJournalLedger?: boolean;
    /** Fiscal year start month (1–12). Default January. */
    fiscalStartMonth?: number;
    /** Filter to a single account group key. */
    accountGroupKey?: BsGroupKey | 'all';
    /** Filter to a single account id. */
    accountId?: string | 'all';
  }
): BalanceSheetReportResult {
  const { asOfDate, selectedProjectId } = options;
  const fiscalStartMonth = options.fiscalStartMonth ?? 1;
  const selectedBuildingId = options.selectedBuildingId ?? FINANCIAL_ENTITY_FILTER_ALL;
  const entityScope: FinancialEntityScope = {
    projectId: selectedProjectId,
    buildingId: selectedBuildingId,
  };
  const reportSlice = state as ReportStateSlice;
  const useJournal = options.useJournalLedger !== false && !!state.journalLedger?.journalLines?.length;
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

  /** Journal-unified path: balances from journal_lines + opening_balance. */
  if (useJournal && state.journalLedger) {
    const jl = state.journalLedger;
    const journalAccounts = jl.accounts.length ? jl.accounts : state.accounts;
    const balMap = computeAccountBalancesFromJournal(
      { ...jl, accounts: journalAccounts },
      asOfDate,
      {
        projectId: selectedProjectId === FINANCIAL_ENTITY_FILTER_ALL ? undefined : selectedProjectId,
        buildingId: selectedBuildingId === FINANCIAL_ENTITY_FILTER_ALL ? undefined : selectedBuildingId,
      }
    );
    for (const [accountId, bal] of balMap) {
      accountBalances[accountId] = bal.signedBalance;
    if (Math.abs(bal.signedBalance) > 0.01) accountsWithTransactions.add(accountId);
    }
  }

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
    if (useJournal) return;
    const txDate = new Date(tx.date);
    if (txDate > dateLimit) return;

    if (!transactionMatchesFinancialEntityScope(tx, reportSlice, entityScope)) return;

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
  let accountsPayable = 0;
  if (!useJournal) {
    const installmentInvoices = (state.invoices || []).filter((inv) => inv.invoiceType === InvoiceType.INSTALLMENT);
    installmentInvoices.forEach((inv) => {
      if (!invoiceMatchesFinancialEntityScope(inv, reportSlice, entityScope)) return;
      if (inv.agreementId) {
        const agreement = state.projectAgreements.find((pa) => pa.id === inv.agreementId);
        if (agreement && agreement.status === 'Cancelled') return;
      }
      if (inv.description?.includes('VOIDED')) return;
      const paidAmount = inv.paidAmount || 0;
      const due = Math.max(0, inv.amount - paidAmount);
      accountsReceivable += due;
    });

    (state.bills || []).forEach((bill) => {
      if (bill.propertyId) return;
      if (!billMatchesFinancialEntityScope(bill, reportSlice, entityScope)) return;
      if (new Date(bill.issueDate) <= dateLimit) {
        const paidAmount = bill.paidAmount || 0;
        const due = Math.max(0, bill.amount - paidAmount);
        accountsPayable += due;
      }
    });
  } else {
    accountsReceivable = accountBalances[sysArId] ?? 0;
    accountsPayable = -(accountBalances[sysApId] ?? 0);
  }

  const receivedAssetsAccountId =
    resolveSystemAccountId(state.accounts, 'sys-acc-received-assets') ?? 'sys-acc-received-assets';
  const receivedAssetsHeldBalance = scopeTargetsBuilding(entityScope)
    ? 0
    : (state.projectReceivedAssets || [])
        .filter((a) => !a.soldDate)
        .filter(
          (a) =>
            !scopeTargetsProject(entityScope) || a.projectId === entityScope.projectId
        )
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
    selectedBuildingId,
  });
  const retainedEarningsFromPL = pl.net_profit;

  const fyStart = fiscalYearStartForDate(fiscalStartMonth, asOfDate);
  const currentYearPl = computeProfitLossReport(state as AppState, {
    startDate: fyStart,
    endDate: asOfDate,
    selectedProjectId,
    selectedBuildingId,
  });
  const currentYearEarningsFromPL = currentYearPl.net_profit;
  const retainedEarningsPriorYears = roundMoney(retainedEarningsFromPL - currentYearEarningsFromPL);

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

    if (isAccountType(acc, AccountType.EQUITY)) {
      if ((acc.id === 'sys-acc-income-summary' || acc.id === 'sys-acc-expense-summary') && !useJournal) {
        return;
      }
      if (acc.id === 'sys-acc-income-summary' || acc.id === 'sys-acc-expense-summary') {
        if (!hasBalance) return;
        const display = statementDisplayAmount(balance, 'equity', useJournal);
        const groupKey: BsGroupKey = 'current_year_earnings';
        const li = lineFromAccount(acc, display, { ...cls, position: 'equity', groupKey }, 'derived');
        equityLines.push(li);
        debugLines.push(li);
        return;
      }
      const isRetained = acc.id === 'sys-acc-retained-earnings';
      const isCye = acc.id === 'sys-acc-current-year-earnings';
      if ((!hasTransactions && !hasBalance) && !isRetained && !isCye) return;
      const display = statementDisplayAmount(balance, 'equity', useJournal);
      const groupKey: BsGroupKey = isRetained
        ? 'retained_earnings'
        : isCye
          ? 'current_year_earnings'
          : 'owner_capital';
      const li = lineFromAccount(acc, display, { ...cls, position: 'equity', groupKey }, 'derived');
      equityLines.push(li);
      debugLines.push(li);
      return;
    }

    if (isAccountType(acc, AccountType.LIABILITY)) {
      if (isSysAp && useJournal) {
        /** Journal mode: A/P from GL control account balance */
        if (Math.abs(balance) > 0.01) {
          const display = statementDisplayAmount(balance, 'liability', useJournal);
          const li = lineFromAccount(acc, display, cls, 'derived');
          liabilityLines.push(li);
          debugLines.push(li);
        }
        return;
      }
      if (isSysAp) {
        /** A/P from bills replaces ledger A/P control account to avoid double count */
        return;
      }
      if (hasTransactions && (hasBalance || rentalLiabilityAccountFound)) {
        if (rentalLiabilityAccountFound && !hasBalance) return;
        const display = statementDisplayAmount(balance, 'liability', useJournal);
        const li = lineFromAccount(acc, display, cls, 'derived');
        liabilityLines.push(li);
        debugLines.push(li);
      }
      return;
    }

    /** Assets: Bank/Cash/Asset types */
    if (isAccountType(acc, AccountType.BANK, AccountType.CASH, AccountType.ASSET)) {
      if (isSysAr && useJournal) {
        if (Math.abs(balance) > 0.01) {
          const li = lineFromAccount(acc, balance, cls, 'derived');
          assetLines.push(li);
          debugLines.push(li);
        }
        return;
      }
      if (isSysAr) {
        /** A/R from invoices replaces control account */
        return;
      }
      if (isClearing) {
        if (useJournal) {
          /** Journal mode: clearing is P&L pass-through; effect is in retained earnings, not BS */
          return;
        }
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

      const showAssetLine = useJournal ? hasBalance : hasTransactions && hasBalance;
      if (!showAssetLine) return;

      const display = balance;
      const li = lineFromAccount(acc, display, cls, 'derived');
      assetLines.push(li);
      debugLines.push(li);
    }
  });

  const finalSecurityDepositsHeld = 0;
  const finalOwnerFundsHeld = rentalLiabilityAccountFound ? 0 : Math.abs(ownerFundsHeld) > 0.01 ? ownerFundsHeld : 0;
  const finalOutstandingLoans = Math.abs(outstandingLoans) > 0.01 ? outstandingLoans : 0;

  if (Math.abs(accountsReceivable) > 0.01 && !useJournal) {
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

  if (Math.abs(accountsPayable) > 0.01 && !useJournal) {
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
  const marketInventory = scopeTargetsBuilding(entityScope)
    ? 0
    : (state.units || [])
        .filter(
          (u) =>
            (!scopeTargetsProject(entityScope) || u.projectId === entityScope.projectId) &&
            !soldUnitIds.has(u.id)
        )
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

  /** Journal: offset bank/cash opening_balance with synthetic equity (consolidated only). */
  if (useJournal && !isDimensionScopeActive(entityScope)) {
    let openingNetDebit = 0;
    for (const acc of state.accounts || []) {
      const ob = roundMoney(Number(acc.openingBalance ?? 0));
      if (Math.abs(ob) < 0.01) continue;
      const { grossDebit, grossCredit } = openingAmountToGross(ob, acc.type);
      openingNetDebit = roundMoney(openingNetDebit + grossDebit - grossCredit);
    }
    if (Math.abs(openingNetDebit) > 0.01) {
      const obEquityLine: BalanceSheetLine = {
        id: OPENING_BALANCE_EQUITY_ID,
        name: 'Opening Balance Equity',
        amount: openingNetDebit,
        groupKey: 'owner_capital',
        position: 'equity',
        term: 'non_current',
        source: 'computed',
      };
      equityLines.push(obEquityLine);
      debugLines.push(obEquityLine);
    }
  }

  let sumAssets = assetLines.reduce((s, l) => s + l.amount, 0);
  let sumLiab = liabilityLines.reduce((s, l) => s + l.amount, 0);
  let sumEq = equityLines.reduce((s, l) => s + l.amount, 0);

  let difference = sumAssets - (sumLiab + sumEq);

  /** Legacy: close residual when clearing / excluded accounts leave a gap. */
  if (!useJournal && Math.abs(difference) > 1) {
    const closeLine: BalanceSheetLine = {
      id: 'computed-retained-earnings',
      name: 'Retained Earnings (residual close)',
      amount: difference,
      groupKey: 'retained_earnings',
      position: 'equity',
      term: 'non_current',
      source: 'computed',
    };
    equityLines.push(closeLine);
    debugLines.push(closeLine);
    sumEq += difference;
    difference = 0;
  }

  /** Journal: close to P&L only when income/expense summary accounts are not on the statement. */
  const hasJournalSummaryEquity =
    useJournal &&
    equityLines.some(
      (l) => l.id === 'sys-acc-income-summary' || l.id === 'sys-acc-expense-summary'
    );
  if (useJournal && !hasJournalSummaryEquity && Math.abs(retainedEarningsFromPL - sumEq) > 1) {
    const plGap = retainedEarningsFromPL - sumEq;
    const closeLine: BalanceSheetLine = {
      id: 'computed-journal-pl-equity',
      name: 'Current Year Earnings (cumulative P&L)',
      amount: plGap,
      groupKey: 'current_year_earnings',
      position: 'equity',
      term: 'non_current',
      source: 'computed',
    };
    equityLines.push(closeLine);
    debugLines.push(closeLine);
    sumEq += plGap;
    difference = sumAssets - (sumLiab + sumEq);
  }

  const isBalanced = Math.abs(difference) < 1;

  const glRetainedEarnings = useJournal
    ? (accountBalances['sys-acc-retained-earnings'] ?? 0) +
      (accountBalances['sys-acc-current-year-earnings'] ?? 0) +
      (accountBalances['sys-acc-income-summary'] ?? 0) +
      (accountBalances['sys-acc-expense-summary'] ?? 0)
    : -(accountBalances['sys-acc-retained-earnings'] ?? 0) +
      -(accountBalances['sys-acc-current-year-earnings'] ?? 0);
  if (useJournal && Math.abs(glRetainedEarnings - retainedEarningsFromPL) > 1) {
    validation.push({
      code: 'RE_DIFFERS_FROM_PL',
      message: `GL retained earnings + current year earnings (${glRetainedEarnings.toFixed(2)}) differ from cumulative P&L net (${retainedEarningsFromPL.toFixed(2)}). Run fiscal period close or review uncategorized activity.`,
      severity: 'warning',
    });
  } else if (
    !useJournal &&
    equityLines.some((l) => l.id === 'computed-retained-earnings') &&
    Math.abs(retainedEarningsFromPL - equityLines.find((l) => l.id === 'computed-retained-earnings')!.amount) > 1
  ) {
    validation.push({
      code: 'RE_DIFFERS_FROM_PL',
      message: `Residual retained earnings close differs from cumulative P&L net (${retainedEarningsFromPL.toFixed(2)}). Review Internal Clearing and uncategorized activity.`,
      severity: 'warning',
    });
  }

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

  const groupFilter = options.accountGroupKey && options.accountGroupKey !== 'all' ? options.accountGroupKey : null;
  const accountFilter = options.accountId && options.accountId !== 'all' ? options.accountId : null;

  const filterLines = (lines: BalanceSheetLine[]) =>
    lines.filter((l) => {
      if (groupFilter && l.groupKey !== groupFilter) return false;
      if (accountFilter && l.accountId !== accountFilter) return false;
      return true;
    });

  const filteredCurrentAssets = filterLines(currentAssets);
  const filteredNonCurrentAssets = filterLines(nonCurrentAssets);
  const filteredCurrentLiab = filterLines(currentLiab);
  const filteredNonCurrentLiab = filterLines(nonCurrentLiab);
  const filteredEquity = filterLines(equityLines);

  const useLineFilter = !!(groupFilter || accountFilter);
  const reportAssets = useLineFilter
    ? filteredCurrentAssets.reduce((s, l) => s + l.amount, 0) + filteredNonCurrentAssets.reduce((s, l) => s + l.amount, 0)
    : sumAssets;
  const reportLiab = useLineFilter
    ? filteredCurrentLiab.reduce((s, l) => s + l.amount, 0) + filteredNonCurrentLiab.reduce((s, l) => s + l.amount, 0)
    : sumLiab;
  const reportEq = useLineFilter ? filteredEquity.reduce((s, l) => s + l.amount, 0) : sumEq;
  const reportDiff = useLineFilter ? reportAssets - (reportLiab + reportEq) : difference;

  return {
    asOfDate,
    selectedProjectId,
    assets: {
      current: filteredCurrentAssets,
      non_current: filteredNonCurrentAssets,
      total: reportAssets,
    },
    liabilities: {
      current: filteredCurrentLiab,
      non_current: filteredNonCurrentLiab,
      total: reportLiab,
    },
    equity: {
      items: filteredEquity,
      total: reportEq,
    },
    supplemental: {
      marketInventoryMemo: supplementalMarketMemo,
    },
    totals: {
      assets: reportAssets,
      liabilities: reportLiab,
      equity: reportEq,
      difference: reportDiff,
    },
    retainedEarningsFromPL,
    retainedEarningsPriorYears,
    currentYearEarningsFromPL,
    isBalanced: Math.abs(reportDiff) < 1,
    discrepancy: reportDiff,
    validation,
    debugLines,
  };
}

export interface ComparativeBalanceSheetResult {
  current: BalanceSheetReportResult;
  previous: BalanceSheetReportResult;
  previousAsOfDate: string;
  compareMode: BalanceSheetCompareMode;
}

/** Run balance sheet for current and prior period (year or month). */
export function computeComparativeBalanceSheetReport(
  state: BalanceSheetStateInput,
  options: {
    asOfDate: string;
    selectedProjectId: string;
    selectedBuildingId?: string;
    useJournalLedger?: boolean;
    fiscalStartMonth?: number;
    compareMode: BalanceSheetCompareMode;
    accountGroupKey?: BsGroupKey | 'all';
    accountId?: string | 'all';
  }
): ComparativeBalanceSheetResult | BalanceSheetReportResult {
  const current = computeBalanceSheetReport(state, options);
  const previousAsOfDate = compareAsOfDate(options.asOfDate, options.compareMode, options.fiscalStartMonth ?? 1);
  if (!previousAsOfDate) return current;
  const previous = computeBalanceSheetReport(state, {
    ...options,
    asOfDate: previousAsOfDate,
  });
  return {
    current,
    previous,
    previousAsOfDate,
    compareMode: options.compareMode,
  };
}

/** Flatten all statement lines for comparative export / variance tables. */
export function flattenBalanceSheetLines(report: BalanceSheetReportResult): BalanceSheetLine[] {
  return [
    ...report.assets.current,
    ...report.assets.non_current,
    ...report.liabilities.current,
    ...report.liabilities.non_current,
    ...report.equity.items,
  ];
}

export { priorFiscalYearEnd, fiscalYearStartForDate, compareAsOfDate };
export type { BalanceSheetCompareMode };
