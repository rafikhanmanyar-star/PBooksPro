/**
 * IAS 7 / GAAP Cash Flow Statement — DIRECT METHOD.
 * Single source for Project Cash Flow UI and GET /api/reports/cash-flow.
 * Cash movement from posted journals can be cross-checked via Trial Balance (Bank/Cash lines) and journalStatementBridge.
 */

import type {
  Account,
  AppState,
  CashflowCategoryMappingEntry,
  CashflowStatementSection,
  Transaction,
} from '../../types';
import {
  AccountType,
  EquityLedgerSubtype,
  LoanSubtype,
  TransactionType,
} from '../../types';
import { resolveProjectIdForTransaction, isTransactionFromVoidedOrCancelledInvoice } from './reportUtils';
import { computeBalanceSheetReport, type BalanceSheetReportResult } from './balanceSheetEngine';
import { resolvePlTypeForCategory } from './profitLossEngine';
import { CANONICAL_PROFIT_DISTRIBUTION_EXPENSE_CATEGORY_ID } from '../../services/database/resolveProfitDistributionExpenseCategory';

/**
 * Profit distribution posts (1) an EXPENSE on Internal Clearing and (2) a paired TRANSFER
 * (PROFIT_SHARE) from clearing to investor equity. Neither is a real cash movement because
 * Internal Clearing is a pass-through account excluded from cash calculations. This guard
 * catches the expense leg in case an account override maps the category to a real bank.
 */
function isProfitDistributionDuplicateCashLeg(tx: Transaction): boolean {
  if (tx.type !== TransactionType.EXPENSE) return false;
  if (tx.categoryId === CANONICAL_PROFIT_DISTRIBUTION_EXPENSE_CATEGORY_ID) return true;
  return Boolean(tx.description?.includes('Profit Distribution:'));
}

export interface CashFlowEngineOptions {
  fromDate: string;
  toDate: string;
  selectedProjectId: string;
  /** Default IAS 7: interest paid is usually classified under operating activities. */
  interestPaidAsOperating?: boolean;
  /** account_id → section override (ambiguous accounts / bank-specific rules). */
  cashFlowCategoryByAccountId?: Partial<Record<string, CashflowStatementSection>>;
}

export interface CashFlowLine {
  key: string;
  label: string;
  /** Signed: inflow positive, outflow negative (presentation). */
  amount: number;
  transactionIds: string[];
}

export interface CashFlowSectionResult {
  items: CashFlowLine[];
  total: number;
}

export interface CashFlowReportResult {
  operating: CashFlowSectionResult;
  investing: CashFlowSectionResult;
  financing: CashFlowSectionResult;
  summary: {
    net_change: number;
    opening_cash: number;
    closing_cash: number;
    computed_closing_cash: number;
  };
  validation: {
    reconciled: boolean;
    discrepancy: number;
    balance_sheet_cash: number;
    messages: string[];
  };
  flags: {
    negative_opening_cash: boolean;
  };
}

type LineBucket = Map<string, { label: string; amount: number; ids: Set<string> }>;

const EPS = 0.01;

function addDaysYyyyMmDd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date {
  return new Date(`${s}T12:00:00`);
}

function inPeriodInclusive(txDateStr: string, fromYmd: string, toYmd: string): boolean {
  const t = parseYmd(txDateStr.slice(0, 10));
  return t >= parseYmd(fromYmd) && t <= parseYmd(toYmd);
}

function isBankCash(acc: Account | undefined | null, clearingId?: string): boolean {
  if (!acc) return false;
  if (clearingId && acc.id === clearingId) return false;
  return acc.type === AccountType.BANK || acc.type === AccountType.CASH;
}

function sumCashFromBalanceSheet(bs: BalanceSheetReportResult): number {
  const keys = new Set(['cash_equivalents', 'bank_accounts']);
  let s = 0;
  for (const line of bs.assets.current) {
    if (keys.has(line.groupKey)) s += line.amount;
  }
  return s;
}

/** Net change to consolidated cash & cash equivalents for one transaction. */
export function getTransactionCashDelta(tx: Transaction, accountsById: Map<string, Account>, clearingId?: string): number {
  if (tx.type === TransactionType.INCOME || tx.type === TransactionType.EXPENSE) {
    const acc = accountsById.get(tx.accountId);
    if (!isBankCash(acc, clearingId)) return 0;
    return tx.type === TransactionType.INCOME ? tx.amount : -tx.amount;
  }
  if (tx.type === TransactionType.LOAN) {
    const acc = accountsById.get(tx.accountId);
    if (!isBankCash(acc, clearingId)) return 0;
    const st = tx.subtype as LoanSubtype | undefined;
    if (st === LoanSubtype.RECEIVE || st === LoanSubtype.COLLECT) return tx.amount;
    if (st === LoanSubtype.GIVE || st === LoanSubtype.REPAY) return -tx.amount;
    return 0;
  }
  if (tx.type === TransactionType.TRANSFER) {
    let d = 0;
    if (tx.fromAccountId && isBankCash(accountsById.get(tx.fromAccountId), clearingId)) d -= tx.amount;
    if (tx.toAccountId && isBankCash(accountsById.get(tx.toAccountId), clearingId)) d += tx.amount;
    return d;
  }
  return 0;
}

function getAccountOverride(
  tx: Transaction,
  map: Partial<Record<string, CashflowStatementSection>>
): CashflowStatementSection | undefined {
  const ids = [tx.accountId, tx.fromAccountId, tx.toAccountId].filter(Boolean) as string[];
  for (const id of ids) {
    const c = map[id];
    if (c) return c;
  }
  return undefined;
}

function ensureBucket(
  buckets: LineBucket,
  key: string,
  label: string,
  txId: string,
  signedAmount: number
): void {
  const cur = buckets.get(key);
  if (!cur) {
    buckets.set(key, { label, amount: signedAmount, ids: new Set([txId]) });
  } else {
    cur.amount += signedAmount;
    cur.ids.add(txId);
  }
}

function bucketsToLines(buckets: LineBucket): CashFlowLine[] {
  const lines: CashFlowLine[] = [];
  for (const [, v] of [...buckets.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label))) {
    lines.push({
      key: '',
      label: v.label,
      amount: v.amount,
      transactionIds: [...v.ids],
    });
  }
  return lines;
}

function sectionTotal(lines: CashFlowLine[]): number {
  return lines.reduce((s, l) => s + l.amount, 0);
}

type StateIn = Pick<
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

export function cashFlowCategoryMapFromEntries(
  entries: CashflowCategoryMappingEntry[] | undefined
): Partial<Record<string, CashflowStatementSection>> {
  const m: Partial<Record<string, CashflowStatementSection>> = {};
  for (const e of entries || []) {
    if (e.accountId && e.category) m[e.accountId] = e.category;
  }
  return m;
}

export function computeCashFlowReport(
  state: StateIn,
  options: CashFlowEngineOptions
): CashFlowReportResult {
  const {
    fromDate,
    toDate,
    selectedProjectId,
    interestPaidAsOperating = true,
    cashFlowCategoryByAccountId = {},
  } = options;

  const accountsById = new Map(state.accounts.map((a) => [a.id, a]));
  const catById = new Map(state.categories.map((c) => [c.id, c]));
  const clearingAccount = state.accounts.find((a) => a.name === 'Internal Clearing');
  const clearingId = clearingAccount?.id;
  const assetIds = new Set(
    state.accounts.filter((a) => a.type === AccountType.ASSET).map((a) => a.id)
  );
  const equityIds = new Set(
    state.accounts.filter((a) => a.type === AccountType.EQUITY).map((a) => a.id)
  );

  const operating: LineBucket = new Map();
  const investing: LineBucket = new Map();
  const financing: LineBucket = new Map();

  const openingBs = computeBalanceSheetReport(state as never, {
    asOfDate: addDaysYyyyMmDd(fromDate, -1),
    selectedProjectId,
  });
  const closingBs = computeBalanceSheetReport(state as never, {
    asOfDate: toDate,
    selectedProjectId,
  });

  const opening_cash = sumCashFromBalanceSheet(openingBs);
  const balance_sheet_cash = sumCashFromBalanceSheet(closingBs);

  const messages: string[] = [];
  if (opening_cash < -EPS) {
    messages.push('Opening cash is negative — verify bank/cash ledger balances.');
  }

  for (const tx of state.transactions || []) {
    if (!inPeriodInclusive(tx.date, fromDate, toDate)) continue;

    const projectId = resolveProjectIdForTransaction(tx, state);
    if (selectedProjectId !== 'all') {
      if (projectId !== selectedProjectId) continue;
      if (!projectId) continue;
    }

    const cashDelta = getTransactionCashDelta(tx, accountsById, clearingId);
    if (Math.abs(cashDelta) < EPS) continue;

    const override = getAccountOverride(tx, cashFlowCategoryByAccountId);

    // --- Loans (financing) — do not allow mapping to break loan substance ---
    if (tx.type === TransactionType.LOAN && isBankCash(accountsById.get(tx.accountId), clearingId)) {
      const st = tx.subtype as LoanSubtype | undefined;
      if (st === LoanSubtype.RECEIVE || st === LoanSubtype.COLLECT) {
        ensureBucket(financing, 'loans_received', 'Proceeds from borrowings', tx.id, cashDelta);
      } else if (st === LoanSubtype.GIVE || st === LoanSubtype.REPAY) {
        ensureBucket(financing, 'loans_repaid', 'Repayment of borrowings', tx.id, cashDelta);
      }
      continue;
    }

    // --- Transfers ---
    if (tx.type === TransactionType.TRANSFER) {
      const fromA = tx.fromAccountId ? accountsById.get(tx.fromAccountId) : undefined;
      const toA = tx.toAccountId ? accountsById.get(tx.toAccountId) : undefined;
      const fromB = isBankCash(fromA, clearingId);
      const toB = isBankCash(toA, clearingId);
      if (fromB && toB) {
        // Internal cash pool transfer — no net impact; should already be delta 0
        continue;
      }

      const st = tx.subtype as string | undefined;

      // Bank ↔ Asset (investing)
      if ((fromB && toA && assetIds.has(toA.id)) || (toB && fromA && assetIds.has(fromA.id))) {
        if (cashDelta < 0) {
          ensureBucket(investing, 'capex', 'Purchase of long-term assets', tx.id, cashDelta);
        } else {
          ensureBucket(investing, 'asset_proceeds', 'Proceeds from disposal of assets', tx.id, cashDelta);
        }
        continue;
      }

      // Bank ↔ Equity (financing)
      const touchesEquity =
        (fromA && equityIds.has(fromA.id)) || (toA && equityIds.has(toA.id));
      if (touchesEquity && (fromB || toB)) {
        if (
          st === EquityLedgerSubtype.PROFIT_SHARE ||
          st === EquityLedgerSubtype.PM_FEE_EQUITY ||
          st === EquityLedgerSubtype.CAPITAL_PAYOUT
        ) {
          ensureBucket(
            financing,
            'distributions',
            'Distributions and profit allocations to owners',
            tx.id,
            cashDelta
          );
        } else if (st === EquityLedgerSubtype.INVESTMENT || st === EquityLedgerSubtype.MOVE_IN) {
          ensureBucket(
            financing,
            'owner_contributions',
            'Owner and investor contributions',
            tx.id,
            cashDelta
          );
        } else if (
          st === EquityLedgerSubtype.WITHDRAWAL ||
          st === EquityLedgerSubtype.MOVE_OUT ||
          st === EquityLedgerSubtype.EQUITY_TRANSFER_BETWEEN
        ) {
          ensureBucket(
            financing,
            'owner_withdrawals',
            'Owner withdrawals and drawings',
            tx.id,
            cashDelta
          );
        } else {
          // Legacy / unspecified equity–cash transfer
          if (cashDelta > 0) {
            ensureBucket(
              financing,
              'owner_contributions',
              'Owner and investor contributions',
              tx.id,
              cashDelta
            );
          } else {
            ensureBucket(
              financing,
              'owner_withdrawals',
              'Owner withdrawals and drawings',
              tx.id,
              cashDelta
            );
          }
        }
        continue;
      }

      if (override) {
        const bucketMap = { operating, investing, financing };
        ensureBucket(
          bucketMap[override],
          `mapped_${override}`,
          `Other ${override} activities (account mapping)`,
          tx.id,
          cashDelta
        );
        continue;
      }

      // Remaining transfers (e.g. bank–liability) — treat as financing if cash out, else operating
      ensureBucket(
        operating,
        'other_operating_transfer',
        'Other operating cash flows (transfers)',
        tx.id,
        cashDelta
      );
      continue;
    }

    // --- Income / Expense on bank ---
    if (tx.type === TransactionType.INCOME || tx.type === TransactionType.EXPENSE) {
      const acc = accountsById.get(tx.accountId);
      if (!isBankCash(acc, clearingId)) continue;

      if (isTransactionFromVoidedOrCancelledInvoice(tx, state)) continue;

      if (isProfitDistributionDuplicateCashLeg(tx)) continue;

      // Proceeds from sale of project asset (cash)
      if (tx.type === TransactionType.INCOME && tx.projectAssetId) {
        ensureBucket(
          investing,
          'asset_sale_proceeds',
          'Proceeds from disposal of assets',
          tx.id,
          cashDelta
        );
        continue;
      }

      if (override) {
        const bucketMap = { operating, investing, financing };
        ensureBucket(
          bucketMap[override],
          `mapped_${override}`,
          `Other ${override} activities (account mapping)`,
          tx.id,
          cashDelta
        );
        continue;
      }

      if (tx.type === TransactionType.INCOME) {
        ensureBucket(
          operating,
          'cash_from_customers',
          'Cash received from customers',
          tx.id,
          cashDelta
        );
        continue;
      }

      // Expense (direct method outflows — negative amounts)
      const cat = tx.categoryId ? catById.get(tx.categoryId) : undefined;
      const { plType } = resolvePlTypeForCategory(cat, cat?.plSubType);

      if (tx.payslipId) {
        ensureBucket(operating, 'payroll', 'Cash paid to employees', tx.id, cashDelta);
        continue;
      }

      if (plType === 'tax') {
        ensureBucket(operating, 'taxes', 'Taxes paid', tx.id, cashDelta);
        continue;
      }

      if (plType === 'finance_cost') {
        if (interestPaidAsOperating) {
          ensureBucket(operating, 'interest', 'Interest paid', tx.id, cashDelta);
        } else {
          ensureBucket(financing, 'interest_fin', 'Interest paid', tx.id, cashDelta);
        }
        continue;
      }

      if (tx.billId || plType === 'cost_of_sales') {
        ensureBucket(operating, 'suppliers', 'Cash paid to suppliers', tx.id, cashDelta);
        continue;
      }

      ensureBucket(
        operating,
        'opex',
        'Cash paid for operating expenses',
        tx.id,
        cashDelta
      );
    }
  }

  const opLines = bucketsToLines(operating);
  const invLines = bucketsToLines(investing);
  const finLines = bucketsToLines(financing);

  const netOperating = sectionTotal(opLines);
  const netInvesting = sectionTotal(invLines);
  const netFinancing = sectionTotal(finLines);
  const net_change = netOperating + netInvesting + netFinancing;
  const computed_closing_cash = opening_cash + net_change;
  const discrepancy = computed_closing_cash - balance_sheet_cash;
  const reconciled = Math.abs(discrepancy) <= EPS;

  if (!reconciled) {
    const msg = `Cash flow reconciliation: computed closing ${computed_closing_cash.toFixed(
      2
    )} vs balance sheet cash ${balance_sheet_cash.toFixed(2)} (discrepancy ${discrepancy.toFixed(2)}).`;
    messages.push(msg);
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[CashFlow]', msg);
    }
  }

  return {
    operating: { items: opLines, total: netOperating },
    investing: { items: invLines, total: netInvesting },
    financing: { items: finLines, total: netFinancing },
    summary: {
      net_change,
      opening_cash,
      closing_cash: balance_sheet_cash,
      computed_closing_cash,
    },
    validation: {
      reconciled,
      discrepancy,
      balance_sheet_cash,
      messages,
    },
    flags: {
      negative_opening_cash: opening_cash < -EPS,
    },
  };
}
