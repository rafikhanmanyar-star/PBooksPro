/**
 * Cash flow statement (IAS 7 direct method) derived ONLY from journal_lines on Bank/Cash accounts.
 * Loads PostgreSQL data; classification logic lives in shared/financial-core/cashFlowJournalCore.ts.
 */
import type pg from 'pg';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart.js';
import { roundMoney } from '../financial/validation.js';
import { buildDimensionSql, isDimensionScopeActive, scopeFromReportFilters } from '../financial/dimensionScope.js';
import {
  addDaysYmd,
  buildCashFlowReportFromJournal,
  type CashFlowJournalLineInput,
  type CashFlowSiblingLineInput,
  type CashflowSection,
} from '../financial/cashFlowJournalCore.js';

export type { CashflowSection };

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

async function sumCashBalanceThrough(
  client: pg.PoolClient,
  tenantId: string,
  asOfInclusive: string,
  scope: ReturnType<typeof scopeFromReportFilters>
): Promise<number> {
  const params: unknown[] = [tenantId, GLOBAL_SYSTEM_TENANT_ID, asOfInclusive];
  const scopeSql = isDimensionScopeActive(scope)
    ? buildDimensionSql(scope, params, { lineAlias: 'jl', entryAlias: 'je' })
    : '';
  const r = await client.query<{ s: string }>(
    `SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0)::text AS s
     FROM journal_lines jl
     INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
     INNER JOIN accounts a ON a.id = jl.account_id AND (a.tenant_id = je.tenant_id OR a.tenant_id = $2)
     WHERE je.tenant_id = $1
       AND je.entry_date <= $3::date
       AND a.deleted_at IS NULL
       AND LOWER(a.type) IN ('bank', 'cash')
       ${scopeSql}`,
    params
  );
  return roundMoney(Number(r.rows[0]?.s ?? 0));
}

export async function getCashFlowReportFromJournal(
  client: pg.PoolClient,
  tenantId: string,
  from: string,
  to: string,
  selectedProjectId: string,
  selectedBuildingId: string = 'all',
  selectedCostCenterId: string = 'all'
): Promise<ReturnType<typeof buildCashFlowReportFromJournal> & { projectId: string }> {
  const scope = scopeFromReportFilters(selectedProjectId, selectedBuildingId, selectedCostCenterId);
  const mapping = await loadCashflowAccountMappings(client, tenantId);

  const params: unknown[] = [tenantId, GLOBAL_SYSTEM_TENANT_ID, from, to];
  const scopeSql = isDimensionScopeActive(scope)
    ? buildDimensionSql(scope, params, { lineAlias: 'jl', entryAlias: 'je' })
    : '';

  const cashLinesR = await client.query<{
    id: string;
    journal_entry_id: string;
    account_id: string;
    debit_amount: string | number;
    credit_amount: string | number;
    project_id: string | null;
    building_id: string | null;
    cost_center_id: string | null;
    entry_date: string;
    account_name: string;
    account_type: string;
  }>(
    `SELECT jl.id, jl.journal_entry_id, jl.account_id, jl.debit_amount, jl.credit_amount,
            jl.project_id, jl.building_id, jl.cost_center_id,
            je.entry_date::text AS entry_date,
            a.name AS account_name, a.type AS account_type
     FROM journal_lines jl
     INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
     INNER JOIN accounts a ON a.id = jl.account_id AND (a.tenant_id = je.tenant_id OR a.tenant_id = $2)
     WHERE je.tenant_id = $1
       AND je.entry_date >= $3::date AND je.entry_date <= $4::date
       AND a.deleted_at IS NULL
       AND LOWER(a.type) IN ('bank', 'cash')
       ${scopeSql}
     ORDER BY je.entry_date ASC, jl.line_number ASC`,
    params
  );

  const cashLines: CashFlowJournalLineInput[] = cashLinesR.rows.map((row) => ({
    id: String(row.id),
    journalEntryId: String(row.journal_entry_id),
    accountId: String(row.account_id),
    debit: roundMoney(Number(row.debit_amount)),
    credit: roundMoney(Number(row.credit_amount)),
    projectId: row.project_id,
    buildingId: row.building_id,
    costCenterId: row.cost_center_id,
    entryDate: String(row.entry_date).slice(0, 10),
    accountName: String(row.account_name),
    accountType: String(row.account_type),
  }));

  const entryIds = [...new Set(cashLines.map((r) => r.journalEntryId))];
  const siblingsByEntry = new Map<string, CashFlowSiblingLineInput[]>();
  if (entryIds.length > 0) {
    const ph = entryIds.map((_, i) => `$${i + 3}`).join(',');
    const sibParams: unknown[] = [tenantId, GLOBAL_SYSTEM_TENANT_ID, ...entryIds];
    const sib = await client.query<{
      id: string;
      journal_entry_id: string;
      account_id: string;
      debit_amount: number;
      credit_amount: number;
      account_name: string;
      account_type: string;
    }>(
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
      arr.push({
        id: String(row.id),
        journalEntryId: String(row.journal_entry_id),
        accountId: String(row.account_id),
        debit: roundMoney(Number(row.debit_amount)),
        credit: roundMoney(Number(row.credit_amount)),
        accountName: String(row.account_name),
        accountType: String(row.account_type),
      });
      siblingsByEntry.set(row.journal_entry_id, arr);
    }
  }

  const dayBeforeFrom = addDaysYmd(from, -1);
  const [opening_cash, closing_cash] = await Promise.all([
    sumCashBalanceThrough(client, tenantId, dayBeforeFrom, scope),
    sumCashBalanceThrough(client, tenantId, to, scope),
  ]);

  const report = buildCashFlowReportFromJournal({
    from,
    to,
    cashLines,
    siblingsByEntry,
    accountSectionMapping: mapping,
    openingCash: opening_cash,
    closingCash: closing_cash,
    scopeActive: isDimensionScopeActive(scope),
  });

  return { ...report, projectId: selectedProjectId };
}
