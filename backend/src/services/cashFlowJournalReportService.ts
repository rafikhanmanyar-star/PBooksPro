/**
 * Cash flow statement (IAS 7 direct method) derived ONLY from journal_lines on Bank/Cash accounts.
 * Classification uses sibling lines in the same journal entry + optional cashflow_category_mapping on the cash account.
 */
import type pg from 'pg';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart.js';
import { roundMoney } from '../financial/validation.js';

const EPS = 0.02;

export type CashflowSection = 'operating' | 'investing' | 'financing';

type JlRow = {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit_amount: string | number;
  credit_amount: string | number;
  project_id: string | null;
  entry_date: string;
  reference: string | null;
  description: string | null;
  source_module: string | null;
  account_name: string;
  account_type: string;
};

type SiblingRow = {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  account_name: string;
  account_type: string;
};

function isCashAccountType(t: string): boolean {
  const u = String(t).toLowerCase();
  return u === 'bank' || u === 'cash';
}

function addDaysYmd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function classifyFromSiblings(siblings: SiblingRow[]): { section: CashflowSection; label: string } {
  const nonCash = siblings.filter((l) => !isCashAccountType(l.account_type));
  if (nonCash.length === 0) {
    return { section: 'operating', label: 'Other operating cash flows (journal)' };
  }
  const tLower = (s: string) => s.toLowerCase();
  if (nonCash.some((l) => tLower(l.account_type) === 'equity')) {
    return { section: 'financing', label: 'Financing — equity and investor movements (journal)' };
  }
  if (nonCash.some((l) => tLower(l.account_type) === 'liability')) {
    const loanish = nonCash.some((l) => /loan|borrowing|term|facility|note payable|credit line/i.test(l.account_name));
    if (loanish) {
      return { section: 'financing', label: 'Financing — borrowings and repayments (journal)' };
    }
    return { section: 'operating', label: 'Operating — payables and liabilities (journal)' };
  }
  if (nonCash.some((l) => tLower(l.account_type) === 'asset')) {
    const longTerm = nonCash.some((l) =>
      /fixed|plant|equipment|property|vehicle|accumulated depreciation|long.term|capex/i.test(l.account_name)
    );
    if (longTerm) {
      return { section: 'investing', label: 'Investing — assets (journal)' };
    }
    return { section: 'operating', label: 'Operating — working capital / receivables (journal)' };
  }
  return { section: 'operating', label: 'Operating cash flows (journal)' };
}

async function loadCashflowAccountMappings(
  client: pg.PoolClient,
  tenantId: string
): Promise<Map<string, CashflowSection>> {
  const m = new Map<string, CashflowSection>();
  try {
    const r = await client.query<{ account_id: string; category: string }>(
      `SELECT account_id, category FROM cashflow_category_mapping WHERE tenant_id = $1 OR tenant_id = $2`,
      [tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    for (const row of r.rows) {
      const c = row.category as CashflowSection;
      if (c === 'operating' || c === 'investing' || c === 'financing') {
        m.set(row.account_id, c);
      }
    }
  } catch {
    /* table may be missing in old DBs */
  }
  return m;
}

/** Net cash effect on a Bank/Cash line (asset): debit increases cash, credit decreases. */
function cashLineNetEffect(debit: number, credit: number): number {
  return roundMoney(debit - credit);
}

async function sumCashBalanceThrough(
  client: pg.PoolClient,
  tenantId: string,
  asOfInclusive: string,
  projectId: string | 'all'
): Promise<number> {
  const params: unknown[] = [tenantId, GLOBAL_SYSTEM_TENANT_ID, asOfInclusive];
  let projCond = '';
  if (projectId !== 'all') {
    projCond = ` AND jl.project_id = $${params.length + 1}`;
    params.push(projectId);
  }
  const r = await client.query<{ s: string }>(
    `SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0)::text AS s
     FROM journal_lines jl
     INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
     INNER JOIN accounts a ON a.id = jl.account_id AND (a.tenant_id = je.tenant_id OR a.tenant_id = $2)
     WHERE je.tenant_id = $1
       AND je.entry_date <= $3::date
       AND a.deleted_at IS NULL
       AND LOWER(a.type) IN ('bank', 'cash')
       ${projCond}`,
    params
  );
  return roundMoney(Number(r.rows[0]?.s ?? 0));
}

export async function getCashFlowReportFromJournal(
  client: pg.PoolClient,
  tenantId: string,
  from: string,
  to: string,
  selectedProjectId: string
): Promise<{
  from: string;
  to: string;
  projectId: string;
  operating: { items: { label: string; amount: number; transactionIds: string[] }[]; total: number };
  investing: { items: { label: string; amount: number; transactionIds: string[] }[]; total: number };
  financing: { items: { label: string; amount: number; transactionIds: string[] }[]; total: number };
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
  flags: { negative_opening_cash: boolean; source: 'journal' };
  audit: Array<{
    journalEntryId: string;
    journalLineId: string;
    accountName: string;
    debit: number;
    credit: number;
    projectId: string | null;
    classification: CashflowSection;
    lineLabel: string;
    entryDate: string;
  }>;
  meta: { cashLineCount: number };
}> {
  const projectFilter = selectedProjectId === 'all' ? 'all' : selectedProjectId;
  const mapping = await loadCashflowAccountMappings(client, tenantId);

  const params: unknown[] = [tenantId, GLOBAL_SYSTEM_TENANT_ID, from, to];
  let projectSql = '';
  if (projectFilter !== 'all') {
    projectSql = ` AND jl.project_id = $${params.length + 1}`;
    params.push(projectFilter);
  }

  const cashLines = await client.query<JlRow>(
    `SELECT jl.id, jl.journal_entry_id, jl.account_id, jl.debit_amount, jl.credit_amount, jl.project_id,
            je.entry_date::text AS entry_date, je.reference, je.description, je.source_module,
            a.name AS account_name, a.type AS account_type
     FROM journal_lines jl
     INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
     INNER JOIN accounts a ON a.id = jl.account_id AND (a.tenant_id = je.tenant_id OR a.tenant_id = $2)
     WHERE je.tenant_id = $1
       AND je.entry_date >= $3::date AND je.entry_date <= $4::date
       AND a.deleted_at IS NULL
       AND LOWER(a.type) IN ('bank', 'cash')
       ${projectSql}
     ORDER BY je.entry_date ASC, jl.line_number ASC`,
    params
  );

  const entryIds = [...new Set(cashLines.rows.map((r) => r.journal_entry_id))];
  const siblingsByEntry = new Map<string, SiblingRow[]>();
  if (entryIds.length > 0) {
    const ph = entryIds.map((_, i) => `$${i + 3}`).join(',');
    const sibParams: unknown[] = [tenantId, GLOBAL_SYSTEM_TENANT_ID, ...entryIds];
    const sib = await client.query<SiblingRow>(
      `SELECT jl.id, jl.journal_entry_id, jl.account_id,
              jl.debit_amount::float AS debit_amount, jl.credit_amount::float AS credit_amount,
              a.name AS account_name, a.type AS account_type
       FROM journal_lines jl
       INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
       INNER JOIN accounts a ON a.id = jl.account_id AND (a.tenant_id = je.tenant_id OR a.tenant_id = $2)
       WHERE je.tenant_id = $1 AND jl.journal_entry_id IN (${ph})`,
      sibParams
    );
    for (const row of sib.rows) {
      const arr = siblingsByEntry.get(row.journal_entry_id) ?? [];
      arr.push(row);
      siblingsByEntry.set(row.journal_entry_id, arr);
    }
  }

  type Bucket = Map<string, { label: string; amount: number; ids: string[] }>;
  const operating: Bucket = new Map();
  const investing: Bucket = new Map();
  const financing: Bucket = new Map();
  const pickBucket = (s: CashflowSection): Bucket =>
    s === 'operating' ? operating : s === 'investing' ? investing : financing;

  const audit: Array<{
    journalEntryId: string;
    journalLineId: string;
    accountName: string;
    debit: number;
    credit: number;
    projectId: string | null;
    classification: CashflowSection;
    lineLabel: string;
    entryDate: string;
  }> = [];

  for (const row of cashLines.rows) {
    const d = roundMoney(Number(row.debit_amount));
    const c = roundMoney(Number(row.credit_amount));
    const net = cashLineNetEffect(d, c);
    if (Math.abs(net) < EPS) continue;

    const allSiblings = siblingsByEntry.get(row.journal_entry_id) ?? [];
    const siblingsExcl = allSiblings.filter((l) => l.id !== row.id);

    let section: CashflowSection;
    let label: string;
    const mapped = mapping.get(row.account_id);
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

    const bucket = pickBucket(section);
    const key = `${section}_${label}`;
    const cur = bucket.get(key);
    if (!cur) {
      bucket.set(key, { label, amount: net, ids: [row.journal_entry_id] });
    } else {
      cur.amount = roundMoney(cur.amount + net);
      if (!cur.ids.includes(row.journal_entry_id)) cur.ids.push(row.journal_entry_id);
    }

    audit.push({
      journalEntryId: row.journal_entry_id,
      journalLineId: row.id,
      accountName: row.account_name,
      debit: d,
      credit: c,
      projectId: row.project_id,
      classification: section,
      lineLabel: label,
      entryDate: row.entry_date.slice(0, 10),
    });
  }

  const toItems = (b: Bucket) =>
    [...b.values()]
      .sort((a, x) => a.label.localeCompare(x.label))
      .map((v) => ({
        label: v.label,
        amount: v.amount,
        transactionIds: v.ids,
      }));

  const opItems = toItems(operating);
  const invItems = toItems(investing);
  const finItems = toItems(financing);
  const netOperating = roundMoney(opItems.reduce((s, i) => s + i.amount, 0));
  const netInvesting = roundMoney(invItems.reduce((s, i) => s + i.amount, 0));
  const netFinancing = roundMoney(finItems.reduce((s, i) => s + i.amount, 0));
  const netChange = roundMoney(netOperating + netInvesting + netFinancing);

  const dayBeforeFrom = addDaysYmd(from, -1);
  const opening_cash = await sumCashBalanceThrough(client, tenantId, dayBeforeFrom, projectFilter);
  const balance_sheet_cash = await sumCashBalanceThrough(client, tenantId, to, projectFilter);
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
  if (projectFilter !== 'all' && cashLines.rows.some((r) => r.project_id == null)) {
    messages.push(
      'Some journal lines have no project_id; run migration 041 and repost or backfill project on lines for accurate project cash flow.'
    );
  }

  return {
    from,
    to,
    projectId: selectedProjectId,
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
    meta: { cashLineCount: cashLines.rows.length },
  };
}
