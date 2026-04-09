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

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

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
  /** Stable bucket id from the engine (e.g. inter_proj_out_<txId>, capital_payout). */
  key: string;
  label: string;
  /** Signed: inflow positive, outflow negative (presentation). */
  amount: number;
  transactionIds: string[];
  /**
   * Equity allocations through Internal Clearing / book-only legs — shown for project analysis only.
   * Excluded from net cash and from IAS 7 reconciliation (no cash/bank movement).
   */
  isNonCash?: boolean;
  /** e.g. linked project name for inter-project equity moves */
  note?: string;
  /**
   * Lines that roll up into a single “Equity transfers & payouts” summary row on the cash flow statement.
   */
  detailGroup?: 'equity_transfer_payout';
}

export interface CashFlowSectionResult {
  items: CashFlowLine[];
  total: number;
}

/** Trace row for debugging classification (cash and material non-cash equity flows). */
export interface CashFlowAuditRow {
  transactionId: string;
  transactionType: string;
  subtype?: string;
  date: string;
  projectId?: string;
  cashIn: number;
  cashOut: number;
  netCash: number;
  /** UI / support hint */
  sourceModule: string;
  section: 'operating' | 'investing' | 'financing' | 'none';
  lineLabel?: string;
  isNonCashMovement: boolean;
  linkedProjectId?: string;
  linkedProjectName?: string;
  batchId?: string;
  /** Non-cash equity amount (e.g. inter-project book transfer) for disclosure. */
  notionalAmount?: number;
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
  /** Optional diagnostic list (same period / project scope as the statement). */
  audit?: CashFlowAuditRow[];
}

type LineBucket = Map<string, { label: string; amount: number; ids: Set<string>; isNonCash?: boolean }>;

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
  signedAmount: number,
  isNonCash = false
): void {
  const cur = buckets.get(key);
  if (!cur) {
    buckets.set(key, { label, amount: signedAmount, ids: new Set([txId]), isNonCash });
  } else {
    cur.amount += signedAmount;
    cur.ids.add(txId);
    if (isNonCash) cur.isNonCash = true;
  }
}

function detailGroupForBucketKey(mapKey: string): CashFlowLine['detailGroup'] | undefined {
  if (mapKey.startsWith('inter_proj_') || mapKey === 'capital_payout') {
    return 'equity_transfer_payout';
  }
  return undefined;
}

function bucketsToLines(buckets: LineBucket): CashFlowLine[] {
  const lines: CashFlowLine[] = [];
  for (const [mapKey, v] of [...buckets.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label))) {
    lines.push({
      key: mapKey,
      label: v.label,
      amount: v.amount,
      transactionIds: [...v.ids],
      isNonCash: v.isNonCash,
      detailGroup: detailGroupForBucketKey(mapKey),
    });
  }
  return lines;
}

/**
 * Splits financing lines into those shown individually vs one summary row (inter-project + capital payout).
 */
export function partitionFinancingEquityTransferPayout(items: CashFlowLine[]): {
  mainLines: CashFlowLine[];
  equityTransferPayoutSummary: { lines: CashFlowLine[]; total: number } | null;
} {
  const rolled: CashFlowLine[] = [];
  const main: CashFlowLine[] = [];
  for (const it of items) {
    if (
      it.detailGroup === 'equity_transfer_payout' ||
      it.key.startsWith('inter_proj_') ||
      it.key === 'capital_payout'
    ) {
      rolled.push(it);
    } else {
      main.push(it);
    }
  }
  if (rolled.length === 0) {
    return { mainLines: items, equityTransferPayoutSummary: null };
  }
  const total = roundMoney(rolled.reduce((s, x) => s + x.amount, 0));
  return {
    mainLines: main,
    equityTransferPayoutSummary: { lines: rolled, total },
  };
}

/**
 * Operating / investing / financing: amounts that hit bank/cash in the period (IAS 7 reconciliation).
 * Lines with isNonCash (e.g. inter-project book transfers via Internal Clearing) are shown for disclosure
 * but excluded here so opening + net cash change ≈ closing cash on the balance sheet.
 */
function sectionTotal(lines: CashFlowLine[]): number {
  return lines.reduce((s, l) => s + (l.isNonCash ? 0 : l.amount), 0);
}

function pushAuditRow(
  rows: CashFlowAuditRow[],
  tx: Transaction,
  cashDelta: number,
  section: CashFlowAuditRow['section'],
  lineLabel: string,
  sourceModule: string,
  opts?: { isNonCash?: boolean; linkedProjectId?: string; linkedProjectName?: string }
): void {
  const isNc = opts?.isNonCash ?? false;
  const cin = cashDelta > 0 ? cashDelta : 0;
  const cout = cashDelta < 0 ? -cashDelta : 0;
  rows.push({
    transactionId: tx.id,
    transactionType: String(tx.type),
    subtype: tx.subtype ? String(tx.subtype) : undefined,
    date: tx.date,
    projectId: tx.projectId,
    cashIn: cin,
    cashOut: cout,
    netCash: cashDelta,
    sourceModule,
    section,
    lineLabel,
    isNonCashMovement: isNc,
    linkedProjectId: opts?.linkedProjectId,
    linkedProjectName: opts?.linkedProjectName,
    batchId: tx.batchId,
  });
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
  | 'projects'
>;

function findInterProjectPairedLeg(
  tx: Transaction,
  batchTxs: Transaction[] | undefined
): Transaction | undefined {
  if (!batchTxs?.length) return undefined;
  if (tx.subtype === EquityLedgerSubtype.MOVE_OUT) {
    const inv = tx.toAccountId;
    if (!inv) return undefined;
    return batchTxs.find(
      (t) => t.subtype === EquityLedgerSubtype.MOVE_IN && t.fromAccountId === inv
    );
  }
  if (tx.subtype === EquityLedgerSubtype.MOVE_IN) {
    const inv = tx.fromAccountId;
    if (!inv) return undefined;
    return batchTxs.find(
      (t) => t.subtype === EquityLedgerSubtype.MOVE_OUT && t.toAccountId === inv
    );
  }
  return undefined;
}

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

  const txsByBatchId = new Map<string, Transaction[]>();
  for (const t of state.transactions || []) {
    if (!t.batchId) continue;
    const arr = txsByBatchId.get(t.batchId) ?? [];
    arr.push(t);
    txsByBatchId.set(t.batchId, arr);
  }
  const projectsById = new Map((state.projects || []).map((p) => [p.id, p.name]));

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
        if (st === EquityLedgerSubtype.PROFIT_SHARE || st === EquityLedgerSubtype.PM_FEE_EQUITY) {
          ensureBucket(
            financing,
            'distributions',
            'Cash profit distributions to investors',
            tx.id,
            cashDelta
          );
        } else if (st === EquityLedgerSubtype.CAPITAL_PAYOUT) {
          ensureBucket(financing, 'capital_payout', 'Capital payout to investors', tx.id, cashDelta);
        } else if (
          st === EquityLedgerSubtype.WITHDRAWAL ||
          st === EquityLedgerSubtype.MOVE_OUT ||
          st === EquityLedgerSubtype.EQUITY_TRANSFER_BETWEEN
        ) {
          ensureBucket(financing, 'investor_withdrawals', 'Investor withdrawals', tx.id, cashDelta);
        } else if (st === EquityLedgerSubtype.INVESTMENT || st === EquityLedgerSubtype.MOVE_IN) {
          ensureBucket(financing, 'investor_contributions', 'Investor contributions', tx.id, cashDelta);
        } else {
          // Legacy / unspecified equity–cash transfer
          if (cashDelta > 0) {
            ensureBucket(financing, 'investor_contributions', 'Investor contributions', tx.id, cashDelta);
          } else {
            ensureBucket(financing, 'investor_withdrawals', 'Investor withdrawals', tx.id, cashDelta);
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

  // Inter-project equity moves (typically Clearing ↔ Equity): non-cash for IAS 7 but material for project view
  if (selectedProjectId !== 'all') {
    for (const tx of state.transactions || []) {
      if (!inPeriodInclusive(tx.date, fromDate, toDate)) continue;
      const pid = resolveProjectIdForTransaction(tx, state);
      if (pid !== selectedProjectId) continue;
      if (tx.subtype !== EquityLedgerSubtype.MOVE_OUT && tx.subtype !== EquityLedgerSubtype.MOVE_IN) {
        continue;
      }
      if (!tx.batchId) continue;
      const batch = txsByBatchId.get(tx.batchId);
      const paired = findInterProjectPairedLeg(tx, batch);
      const linkedPid = paired ? resolveProjectIdForTransaction(paired, state) : undefined;
      const linkedName = linkedPid ? projectsById.get(linkedPid) ?? linkedPid : undefined;

      if (tx.subtype === EquityLedgerSubtype.MOVE_OUT) {
        const label = linkedName
          ? `Inter-project equity transfer (to ${linkedName})`
          : 'Inter-project equity transfer (out)';
        ensureBucket(financing, `inter_proj_out_${tx.id}`, label, tx.id, -tx.amount, true);
      } else {
        const label = linkedName
          ? `Inter-project equity transfer (from ${linkedName})`
          : 'Inter-project equity transfer (in)';
        ensureBucket(financing, `inter_proj_in_${tx.id}`, label, tx.id, tx.amount, true);
      }
    }
  }

  const opLines = bucketsToLines(operating);
  const invLines = bucketsToLines(investing);
  const finLines = bucketsToLines(financing);

  const transactionsById = new Map((state.transactions || []).map((t) => [t.id, t]));
  const audit = buildCashFlowAuditFromLines(
    opLines,
    invLines,
    finLines,
    transactionsById,
    accountsById,
    clearingId,
    state
  );

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
    audit,
  };
}

function buildCashFlowAuditFromLines(
  operating: CashFlowLine[],
  investing: CashFlowLine[],
  financing: CashFlowLine[],
  transactionsById: Map<string, Transaction>,
  accountsById: Map<string, Account>,
  clearingId: string | undefined,
  state: StateIn
): CashFlowAuditRow[] {
  const txsByBatch = new Map<string, Transaction[]>();
  for (const t of state.transactions || []) {
    if (!t.batchId) continue;
    const arr = txsByBatch.get(t.batchId) ?? [];
    arr.push(t);
    txsByBatch.set(t.batchId, arr);
  }
  const projectsById = new Map((state.projects || []).map((p) => [p.id, p.name]));

  const rows: CashFlowAuditRow[] = [];
  const pushLine = (
    section: CashFlowAuditRow['section'],
    line: CashFlowLine,
    sourceModule: string
  ) => {
    for (const tid of line.transactionIds) {
      const tx = transactionsById.get(tid);
      if (!tx) continue;
      const net = getTransactionCashDelta(tx, accountsById, clearingId);
      const isNc = Boolean(line.isNonCash);
      const cin = net > 0 ? net : 0;
      const cout = net < 0 ? -net : 0;
      let linkedProjectId: string | undefined;
      let linkedProjectName: string | undefined;
      let notional: number | undefined;
      if (isNc && tx.batchId) {
        const paired = findInterProjectPairedLeg(tx, txsByBatch.get(tx.batchId));
        const lp = paired ? resolveProjectIdForTransaction(paired, state) : undefined;
        if (lp) {
          linkedProjectId = lp;
          linkedProjectName = projectsById.get(lp) ?? lp;
        }
        if (tx.subtype === EquityLedgerSubtype.MOVE_OUT) notional = -tx.amount;
        else if (tx.subtype === EquityLedgerSubtype.MOVE_IN) notional = tx.amount;
      }
      rows.push({
        transactionId: tx.id,
        transactionType: String(tx.type),
        subtype: tx.subtype ? String(tx.subtype) : undefined,
        date: tx.date,
        projectId: tx.projectId,
        cashIn: isNc ? 0 : cin,
        cashOut: isNc ? 0 : cout,
        netCash: isNc ? 0 : net,
        sourceModule,
        section,
        lineLabel: line.label,
        isNonCashMovement: isNc,
        batchId: tx.batchId,
        linkedProjectId,
        linkedProjectName,
        notionalAmount: notional,
      });
    }
  };
  for (const line of operating) pushLine('operating', line, 'Operating / AR-AP');
  for (const line of investing) pushLine('investing', line, 'Investing / assets');
  for (const line of financing) pushLine('financing', line, 'Investment management / equity');
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.transactionId.localeCompare(b.transactionId));
  return rows;
}
