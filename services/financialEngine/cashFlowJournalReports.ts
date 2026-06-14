/**
 * Journal-based cash flow for local SQLite (Electron) and LAN/API (delegates to REST).
 */

import { isLocalOnlyMode } from '../../config/apiUrl';
import { fetchCashFlowReport } from '../api/financialReportsApi';
import { roundMoney } from './validation';
import {
  buildDimensionSql,
  isDimensionScopeActive,
  ledgerTenantIdsForLocalQuery,
  scopeFromReportFilters,
} from './trialBalanceCore';
import {
  addDaysYmd,
  buildCashFlowReportFromJournal,
  type CashFlowJournalLineInput,
  type CashFlowSiblingLineInput,
  type CashflowSection,
} from '../../shared/financial-core/cashFlowJournalCore';
import type { CashFlowReportResult } from '../../components/reports/cashFlowEngine';

function getBridge() {
  if (typeof window === 'undefined' || !window.sqliteBridge?.query) {
    throw new Error('Cash flow reports require Electron SQLite bridge.');
  }
  return window.sqliteBridge;
}

function mapJournalReportToUi(
  report: ReturnType<typeof buildCashFlowReportFromJournal>
): CashFlowReportResult {
  return {
    operating: report.operating,
    investing: report.investing,
    financing: report.financing,
    summary: report.summary,
    validation: report.validation,
    flags: { negative_opening_cash: report.flags.negative_opening_cash },
    audit: report.audit.map((row) => ({
      transactionId: row.journalEntryId,
      transactionType: 'journal',
      date: row.entryDate,
      projectId: row.projectId ?? undefined,
      cashIn: row.debit > row.credit ? roundMoney(row.debit - row.credit) : 0,
      cashOut: row.credit > row.debit ? roundMoney(row.credit - row.debit) : 0,
      netCash: roundMoney(row.debit - row.credit),
      sourceModule: 'journal',
      section: row.classification,
      lineLabel: row.lineLabel,
      isNonCashMovement: false,
    })),
  };
}

async function loadLocalCashflowMappings(
  bridge: NonNullable<typeof window.sqliteBridge>,
  tenantPlaceholders: string,
  tenantIds: string[]
): Promise<Map<string, CashflowSection>> {
  const m = new Map<string, CashflowSection>();
  try {
    const r = await bridge.query(
      `SELECT account_id, category FROM cashflow_category_mapping WHERE tenant_id IN (${tenantPlaceholders})`,
      tenantIds
    );
    if (!r.ok) return m;
    for (const row of r.rows || []) {
      const rec = row as Record<string, unknown>;
      const c = String(rec.category) as CashflowSection;
      if (c === 'operating' || c === 'investing' || c === 'financing') {
        m.set(String(rec.account_id), c);
      }
    }
  } catch {
    /* optional table */
  }
  return m;
}

async function sumLocalCashBalance(
  bridge: NonNullable<typeof window.sqliteBridge>,
  tenantPlaceholders: string,
  tenantIds: string[],
  asOfInclusive: string,
  scope: ReturnType<typeof scopeFromReportFilters>
): Promise<number> {
  const params: unknown[] = [...tenantIds, asOfInclusive];
  const scopeSql = isDimensionScopeActive(scope)
    ? buildDimensionSql(scope, params, { paramStyle: 'sqlite' })
    : '';
  const r = await bridge.query(
    `SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) AS s
     FROM journal_lines jl
     INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
     INNER JOIN accounts a ON a.id = jl.account_id
     WHERE je.tenant_id IN (${tenantPlaceholders})
       AND je.entry_date <= ?
       AND a.deleted_at IS NULL
       AND LOWER(a.type) IN ('bank', 'cash')
       ${scopeSql}`,
    params
  );
  if (!r.ok) throw new Error(r.error || 'Cash balance query failed');
  return roundMoney(Number((r.rows?.[0] as Record<string, unknown>)?.s ?? 0));
}

async function fetchLocalCashFlowFromJournal(
  tenantId: string,
  options: {
    from: string;
    to: string;
    projectId?: string;
    buildingId?: string;
    costCenterId?: string;
  }
): Promise<CashFlowReportResult> {
  const bridge = getBridge();
  const tenantIds = ledgerTenantIdsForLocalQuery(tenantId);
  const tenantPlaceholders = tenantIds.map(() => '?').join(', ');
  const scope = scopeFromReportFilters(options.projectId, options.buildingId, options.costCenterId);

  const params: unknown[] = [...tenantIds, options.from, options.to];
  const scopeSql = isDimensionScopeActive(scope)
    ? buildDimensionSql(scope, params, { paramStyle: 'sqlite' })
    : '';

  const cashR = await bridge.query(
    `SELECT jl.id, jl.journal_entry_id, jl.account_id, jl.debit_amount, jl.credit_amount,
            jl.project_id, jl.building_id, jl.cost_center_id,
            je.entry_date AS entry_date,
            a.name AS account_name, a.type AS account_type
     FROM journal_lines jl
     INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
     INNER JOIN accounts a ON a.id = jl.account_id
     WHERE je.tenant_id IN (${tenantPlaceholders})
       AND je.entry_date >= ? AND je.entry_date <= ?
       AND a.deleted_at IS NULL
       AND LOWER(a.type) IN ('bank', 'cash')
       ${scopeSql}
     ORDER BY je.entry_date ASC, jl.line_number ASC`,
    params
  );
  if (!cashR.ok) throw new Error(cashR.error || 'Cash flow journal query failed');

  const cashLines: CashFlowJournalLineInput[] = (cashR.rows || []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      journalEntryId: String(r.journal_entry_id),
      accountId: String(r.account_id),
      debit: roundMoney(Number(r.debit_amount)),
      credit: roundMoney(Number(r.credit_amount)),
      projectId: r.project_id != null ? String(r.project_id) : null,
      buildingId: r.building_id != null ? String(r.building_id) : null,
      costCenterId: r.cost_center_id != null ? String(r.cost_center_id) : null,
      entryDate: String(r.entry_date).slice(0, 10),
      accountName: String(r.account_name),
      accountType: String(r.account_type),
    };
  });

  const entryIds = [...new Set(cashLines.map((l) => l.journalEntryId))];
  const siblingsByEntry = new Map<string, CashFlowSiblingLineInput[]>();
  if (entryIds.length > 0) {
    const ph = entryIds.map(() => '?').join(',');
    const sibParams: unknown[] = [...tenantIds, ...entryIds];
    const sibR = await bridge.query(
      `SELECT jl.id, jl.journal_entry_id, jl.account_id, jl.debit_amount, jl.credit_amount,
              a.name AS account_name, a.type AS account_type
       FROM journal_lines jl
       INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
       INNER JOIN accounts a ON a.id = jl.account_id
       WHERE je.tenant_id IN (${tenantPlaceholders})
         AND jl.journal_entry_id IN (${ph})`,
      sibParams
    );
    if (!sibR.ok) throw new Error(sibR.error || 'Cash flow siblings query failed');
    for (const row of sibR.rows || []) {
      const r = row as Record<string, unknown>;
      const entryId = String(r.journal_entry_id);
      const arr = siblingsByEntry.get(entryId) ?? [];
      arr.push({
        id: String(r.id),
        journalEntryId: entryId,
        accountId: String(r.account_id),
        debit: roundMoney(Number(r.debit_amount)),
        credit: roundMoney(Number(r.credit_amount)),
        accountName: String(r.account_name),
        accountType: String(r.account_type),
      });
      siblingsByEntry.set(entryId, arr);
    }
  }

  const mapping = await loadLocalCashflowMappings(bridge, tenantPlaceholders, tenantIds);
  const dayBefore = addDaysYmd(options.from, -1);
  const [openingCash, closingCash] = await Promise.all([
    sumLocalCashBalance(bridge, tenantPlaceholders, tenantIds, dayBefore, scope),
    sumLocalCashBalance(bridge, tenantPlaceholders, tenantIds, options.to, scope),
  ]);

  const report = buildCashFlowReportFromJournal({
    from: options.from,
    to: options.to,
    cashLines,
    siblingsByEntry,
    accountSectionMapping: mapping,
    openingCash,
    closingCash,
    scopeActive: isDimensionScopeActive(scope),
  });

  return mapJournalReportToUi(report);
}

/** Single entry: journal_lines only (SQLite local or PostgreSQL API). */
export async function fetchCashFlowReportUnified(options: {
  tenantId: string;
  from: string;
  to: string;
  projectId?: string;
  buildingId?: string;
  costCenterId?: string;
}): Promise<CashFlowReportResult> {
  if (isLocalOnlyMode()) {
    return fetchLocalCashFlowFromJournal(options.tenantId, options);
  }
  return fetchCashFlowReport({
    from: options.from,
    to: options.to,
    projectId: options.projectId,
    buildingId: options.buildingId,
    costCenterId: options.costCenterId,
  });
}
