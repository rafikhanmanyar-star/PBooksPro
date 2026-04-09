import type pg from 'pg';
import { getCashFlowReportFromJournal } from './cashFlowJournalReportService.js';

/**
 * LAN/API cash flow: derived ONLY from journal_lines on Bank/Cash accounts (same source as Trial Balance).
 * Requires migration `041_journal_lines_project_id.sql` for per-line project_id; lines without project_id are excluded from project-scoped reports.
 */
export async function getCashFlowReportJson(
  client: pg.PoolClient,
  tenantId: string,
  from: string,
  to: string,
  selectedProjectId: string
) {
  const report = await getCashFlowReportFromJournal(client, tenantId, from, to, selectedProjectId);

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
