/**
 * AUTO-GENERATED — do not edit. Source: shared/financial-core/cashFlowJournalCore.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

/**
 * IAS 7 cash flow (direct method) from journal_lines on Bank/Cash accounts only.
 * Single authoritative engine for desktop (SQLite) and cloud (PostgreSQL API).
 */

import { roundMoney } from './validation.js';

export type CashflowSection = 'operating' | 'investing' | 'financing';

const EPS = 0.02;

export interface CashFlowJournalLineInput {
  id: string;
  journalEntryId: string;
  accountId: string;
  debit: number;
  credit: number;
  projectId?: string | null;
  buildingId?: string | null;
  costCenterId?: string | null;
  entryDate: string;
  accountName: string;
  accountType: string;
}

export interface CashFlowSiblingLineInput {
  id: string;
  journalEntryId: string;
  accountId: string;
  debit: number;
  credit: number;
  accountName: string;
  accountType: string;
}

export interface CashFlowLineResult {
  key: string;
  label: string;
  amount: number;
  transactionIds: string[];
}

export interface CashFlowSectionResult {
  items: CashFlowLineResult[];
  total: number;
}

export interface CashFlowAuditRowResult {
  journalEntryId: string;
  journalLineId: string;
  accountName: string;
  debit: number;
  credit: number;
  projectId: string | null;
  buildingId: string | null;
  costCenterId: string | null;
  classification: CashflowSection;
  lineLabel: string;
  entryDate: string;
}

export interface CashFlowJournalReportResult {
  from: string;
  to: string;
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
    source: 'journal';
  };
  audit: CashFlowAuditRowResult[];
  meta: { cashLineCount: number };
}

export function addDaysYmd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isCashAccountType(t: string): boolean {
  const u = String(t).toLowerCase();
  return u === 'bank' || u === 'cash';
}

/** User investor equity accounts (investment management) — excludes system chart equity (retained earnings, etc.). */
function isInvestorEquityLine(l: CashFlowSiblingLineInput): boolean {
  if (String(l.accountType).toLowerCase() !== 'equity') return false;
  return !String(l.accountId ?? '').startsWith('sys-acc-');
}

function classifyFromSiblings(siblings: CashFlowSiblingLineInput[]): { section: CashflowSection; label: string } {
  const nonCash = siblings.filter((l) => !isCashAccountType(l.accountType));
  if (nonCash.length === 0) {
    return { section: 'operating', label: 'Other operating cash flows (journal)' };
  }
  const tLower = (s: string) => s.toLowerCase();
  if (nonCash.some(isInvestorEquityLine)) {
    return { section: 'investing', label: 'Investing — owner equity and investor movements (journal)' };
  }
  if (nonCash.some((l) => tLower(l.accountType) === 'equity')) {
    return { section: 'financing', label: 'Financing — equity movements (journal)' };
  }
  if (nonCash.some((l) => tLower(l.accountType) === 'liability')) {
    const loanish = nonCash.some((l) => /loan|borrowing|term|facility|note payable|credit line/i.test(l.accountName));
    if (loanish) {
      return { section: 'financing', label: 'Financing — borrowings and repayments (journal)' };
    }
    return { section: 'operating', label: 'Operating — payables and liabilities (journal)' };
  }
  if (nonCash.some((l) => tLower(l.accountType) === 'asset')) {
    const longTerm = nonCash.some((l) =>
      /fixed|plant|equipment|property|vehicle|accumulated depreciation|long.term|capex/i.test(l.accountName)
    );
    if (longTerm) {
      return { section: 'investing', label: 'Investing — assets (journal)' };
    }
    return { section: 'operating', label: 'Operating — working capital / receivables (journal)' };
  }
  return { section: 'operating', label: 'Operating cash flows (journal)' };
}

/** Net cash effect on a Bank/Cash line (asset): debit increases cash, credit decreases. */
export function cashLineNetEffect(debit: number, credit: number): number {
  return roundMoney(debit - credit);
}

type Bucket = Map<string, { label: string; amount: number; ids: string[] }>;

function pickBucket(s: CashflowSection, operating: Bucket, investing: Bucket, financing: Bucket): Bucket {
  return s === 'operating' ? operating : s === 'investing' ? investing : financing;
}

function toItems(b: Bucket): CashFlowLineResult[] {
  return [...b.entries()]
    .sort((a, x) => a[1].label.localeCompare(x[1].label))
    .map(([key, v]) => ({
      key,
      label: v.label,
      amount: v.amount,
      transactionIds: v.ids,
    }));
}

export interface BuildCashFlowFromJournalInput {
  from: string;
  to: string;
  cashLines: CashFlowJournalLineInput[];
  siblingsByEntry: ReadonlyMap<string, CashFlowSiblingLineInput[]>;
  accountSectionMapping?: ReadonlyMap<string, CashflowSection>;
  openingCash: number;
  closingCash: number;
  scopeActive?: boolean;
}

/**
 * Build a cash flow statement from pre-loaded journal cash lines and sibling metadata.
 */
export function buildCashFlowReportFromJournal(input: BuildCashFlowFromJournalInput): CashFlowJournalReportResult {
  const { from, to, cashLines, siblingsByEntry, openingCash, closingCash } = input;
  const mapping = input.accountSectionMapping ?? new Map<string, CashflowSection>();

  const operating: Bucket = new Map();
  const investing: Bucket = new Map();
  const financing: Bucket = new Map();

  const audit: CashFlowAuditRowResult[] = [];

  for (const row of cashLines) {
    const d = roundMoney(row.debit);
    const c = roundMoney(row.credit);
    const net = cashLineNetEffect(d, c);
    if (Math.abs(net) < EPS) continue;

    const allSiblings = siblingsByEntry.get(row.journalEntryId) ?? [];
    const siblingsExcl = allSiblings.filter((l) => l.id !== row.id);

    let section: CashflowSection;
    let label: string;
    const mapped = mapping.get(row.accountId);
    if (mapped) {
      section = mapped;
      label =
        section === 'operating'
          ? 'Operating (account mapping)'
          : section === 'investing'
            ? 'Investing (account mapping)'
            : 'Financing (account mapping)';
    } else {
      const cl = classifyFromSiblings(siblingsExcl);
      section = cl.section;
      label = cl.label;
    }

    const bucket = pickBucket(section, operating, investing, financing);
    const key = `${section}_${label}`;
    const cur = bucket.get(key);
    if (!cur) {
      bucket.set(key, { label, amount: net, ids: [row.journalEntryId] });
    } else {
      cur.amount = roundMoney(cur.amount + net);
      if (!cur.ids.includes(row.journalEntryId)) cur.ids.push(row.journalEntryId);
    }

    audit.push({
      journalEntryId: row.journalEntryId,
      journalLineId: row.id,
      accountName: row.accountName,
      debit: d,
      credit: c,
      projectId: row.projectId ?? null,
      buildingId: row.buildingId ?? null,
      costCenterId: row.costCenterId ?? null,
      classification: section,
      lineLabel: label,
      entryDate: row.entryDate.slice(0, 10),
    });
  }

  const opItems = toItems(operating);
  const invItems = toItems(investing);
  const finItems = toItems(financing);
  const netOperating = roundMoney(opItems.reduce((s, i) => s + i.amount, 0));
  const netInvesting = roundMoney(invItems.reduce((s, i) => s + i.amount, 0));
  const netFinancing = roundMoney(finItems.reduce((s, i) => s + i.amount, 0));
  const netChange = roundMoney(netOperating + netInvesting + netFinancing);

  const opening_cash = roundMoney(openingCash);
  const balance_sheet_cash = roundMoney(closingCash);
  const computed_closing_cash = roundMoney(opening_cash + netChange);
  const discrepancy = roundMoney(computed_closing_cash - balance_sheet_cash);
  const reconciled = Math.abs(discrepancy) <= EPS;

  const messages: string[] = [];
  if (opening_cash < -EPS) {
    messages.push('Opening cash is negative — verify bank/cash ledger balances.');
  }
  if (!reconciled) {
    messages.push(
      `Cash flow reconciliation (journal): computed closing ${computed_closing_cash.toFixed(2)} vs GL cash ${balance_sheet_cash.toFixed(2)} (discrepancy ${discrepancy.toFixed(2)}).`
    );
  }
  if (input.scopeActive && cashLines.length === 0) {
    messages.push(
      'No bank/cash journal lines matched this dimension scope — verify journal entries are posted with project/building/cost-center tags.'
    );
  }

  return {
    from,
    to,
    operating: { items: opItems, total: netOperating },
    investing: { items: invItems, total: netInvesting },
    financing: { items: finItems, total: netFinancing },
    summary: {
      net_change: netChange,
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
    flags: { negative_opening_cash: opening_cash < -EPS, source: 'journal' },
    audit,
    meta: { cashLineCount: cashLines.length },
  };
}
