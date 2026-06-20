import type pg from 'pg';
import type { CashFlowJournalReportResult } from '../../../financial/cashFlowJournalCore.js';
import { getCashFlowReportFromJournal } from './cashFlowJournalReportService.js';
import { loadBalanceSheetStateInput } from './balanceSheetReportService.js';
import { buildCashFlowReportFromTransactions } from '../../../reportEngines/index.js';
import type { DataScopeEnforcementContext } from '../../../auth/tenantRepositoryScope.js';

/**
 * LAN/API cash flow: journal GL when bank/cash lines exist; otherwise operational transactions
 * (same scope rules as P&L drill-down when journal mirrors are incomplete).
 */
export async function getCashFlowReportJson(
  client: pg.PoolClient,
  tenantId: string,
  from: string,
  to: string,
  selectedProjectId: string,
  selectedBuildingId: string = 'all',
  selectedCostCenterId: string = 'all',
  scopeCtx?: DataScopeEnforcementContext
) {
  const journalReport = await getCashFlowReportFromJournal(
    client,
    tenantId,
    from,
    to,
    selectedProjectId,
    selectedBuildingId,
    selectedCostCenterId,
    scopeCtx
  );

  let report: CashFlowJournalReportResult = journalReport;
  if (journalReport.meta.cashLineCount === 0) {
    const stateIn = await loadBalanceSheetStateInput(client, tenantId, to, scopeCtx);
    report = buildCashFlowReportFromTransactions({
      from,
      to,
      state: stateIn as never,
      selectedProjectId,
      selectedBuildingId,
      selectedCostCenterId,
    }) as CashFlowJournalReportResult;
  }

  return {
    from: report.from,
    to: report.to,
    projectId: selectedProjectId,
    operating: report.operating,
    investing: report.investing,
    financing: report.financing,
    summary: report.summary,
    validation: report.validation,
    flags: report.flags,
    audit: report.audit,
    meta: report.meta,
  };
}
