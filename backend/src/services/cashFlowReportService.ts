import type pg from 'pg';
import { getCashFlowReportFromJournal } from './cashFlowJournalReportService.js';

/**
 * LAN/API cash flow: derived ONLY from journal_lines on Bank/Cash accounts (same source as Trial Balance).
 * Project scope resolves project from journal line, journal entry, or source transaction (same as Trial Balance / P&L).
 */
export async function getCashFlowReportJson(
  client: pg.PoolClient,
  tenantId: string,
  from: string,
  to: string,
  selectedProjectId: string,
  selectedBuildingId: string = 'all'
) {
  const report = await getCashFlowReportFromJournal(
    client,
    tenantId,
    from,
    to,
    selectedProjectId,
    selectedBuildingId
  );

  return {
    from: report.from,
    to: report.to,
    projectId: report.projectId,
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
