/**
 * Cash flow statement types and UI helpers.
 * Computation: shared/financial-core/cashFlowJournalCore.ts via fetchCashFlowReportUnified.
 */

export type CashflowStatementSection = 'operating' | 'investing' | 'financing';

export interface CashFlowLine {
  key: string;
  label: string;
  amount: number;
  transactionIds: string[];
  isNonCash?: boolean;
  note?: string;
  detailGroup?: 'equity_transfer_payout';
}

export interface CashFlowSectionResult {
  items: CashFlowLine[];
  total: number;
}

export interface CashFlowAuditRow {
  transactionId: string;
  transactionType: string;
  subtype?: string;
  date: string;
  projectId?: string;
  cashIn: number;
  cashOut: number;
  netCash: number;
  sourceModule: string;
  section: 'operating' | 'investing' | 'financing' | 'none';
  lineLabel?: string;
  isNonCashMovement: boolean;
  linkedProjectId?: string;
  linkedProjectName?: string;
  batchId?: string;
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
  audit?: CashFlowAuditRow[];
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
    const key = it.key ?? '';
    if (
      it.detailGroup === 'equity_transfer_payout' ||
      key.startsWith('inter_proj_') ||
      key === 'capital_payout'
    ) {
      rolled.push(it);
    } else {
      main.push(it);
    }
  }
  if (rolled.length === 0) {
    return { mainLines: items, equityTransferPayoutSummary: null };
  }
  const total = Math.round(rolled.reduce((s, x) => s + x.amount, 0) * 100) / 100;
  return {
    mainLines: main,
    equityTransferPayoutSummary: { lines: rolled, total },
  };
}

/** @deprecated Cash flow is journal-only — use fetchCashFlowReportUnified. */
export function computeCashFlowReport(): never {
  throw new Error('Cash flow uses journal_lines only. Call fetchCashFlowReportUnified instead.');
}

/** @deprecated */
export function getTransactionCashDelta(): never {
  throw new Error('Cash flow uses journal_lines only.');
}

/** @deprecated */
export function cashFlowCategoryMapFromEntries(): Record<string, never> {
  return {};
}
