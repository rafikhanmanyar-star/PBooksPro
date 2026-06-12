import type { PoolClient } from 'pg';

import { buildCsvBuffer, buildPdfGridBuffer, buildXlsxBuffer } from '../exports/renderFormats.js';
import {
  claimDueSchedules,
  markScheduleRun,
  type ReportScheduleRow,
} from '../repositories/reportScheduleRepository.js';
import type { CustomReportGeneratePayload } from '../validators/reportConfigurationSchema.js';
import { runCustomReport } from './customReportRunService.js';
import { sendScheduledReportEmail } from './reportScheduleEmailService.js';
import { logger } from '../../../utils/logger.js';

function parseRecipients(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0 && v.includes('@'));
}

function buildRunPayload(row: ReportScheduleRow): CustomReportGeneratePayload {
  const cfg =
    row.configuration_json && typeof row.configuration_json === 'object'
      ? (row.configuration_json as Record<string, unknown>)
      : {};
  const reportType =
    (typeof cfg.reportType === 'string' && cfg.reportType) ||
    row.definition_report_type ||
    'tabular';
  const fields = Array.isArray(cfg.fields)
    ? cfg.fields.filter((f): f is string => typeof f === 'string')
    : undefined;
  const columns = Array.isArray(cfg.columns) ? cfg.columns : undefined;
  return {
    module: row.definition_module ?? 'project_selling',
    reportType: reportType === 'tabular' ? undefined : reportType,
    fields,
    columns,
    filters: Array.isArray(cfg.filters) ? cfg.filters : undefined,
    groupBy: Array.isArray(cfg.groupBy) ? cfg.groupBy : undefined,
    sortBy: Array.isArray(cfg.sortBy) ? cfg.sortBy : undefined,
    aggregates: Array.isArray(cfg.aggregates) ? cfg.aggregates : undefined,
    formulas: Array.isArray(cfg.formulas) ? cfg.formulas : undefined,
    search: typeof cfg.search === 'string' ? cfg.search : undefined,
    page: 1,
    pageSize: 5000,
    forPrint: true,
  } as CustomReportGeneratePayload;
}

async function renderExportBuffer(
  row: ReportScheduleRow,
  data: Awaited<ReturnType<typeof runCustomReport>>
): Promise<{ buf: Buffer; contentType: string; ext: string }> {
  const colOrder = data.columns.map((c) => c.key);
  const labels: Record<string, string> = {};
  for (const c of data.columns) labels[c.key] = c.label;
  const title = row.definition_name?.trim() || 'Report';
  if (row.export_format === 'csv') {
    return {
      buf: buildCsvBuffer(data.rows, colOrder, labels),
      contentType: 'text/csv; charset=utf-8',
      ext: 'csv',
    };
  }
  if (row.export_format === 'xlsx') {
    return {
      buf: await buildXlsxBuffer(data.rows, colOrder, labels),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: 'xlsx',
    };
  }
  return {
    buf: await buildPdfGridBuffer({ title, columns: colOrder, labels, rows: data.rows }),
    contentType: 'application/pdf',
    ext: 'pdf',
  };
}

async function processSchedule(client: PoolClient, row: ReportScheduleRow): Promise<void> {
  const recipients = parseRecipients(row.recipients_json);
  if (recipients.length === 0) {
    logger.warn('[report-schedule] Skipping schedule with no recipients', { id: row.id });
    await markScheduleRun(client, row.id, row.tenant_id, row.cadence);
    return;
  }

  const payload = buildRunPayload(row);
  const data = await runCustomReport(client, row.tenant_id, payload, 'export');
  const rendered = await renderExportBuffer(row, data);
  const safeName = (row.definition_name ?? 'report').replace(/[^\w\s\-_.]/g, '').slice(0, 80) || 'report';

  await sendScheduledReportEmail({
    to: recipients,
    reportName: row.definition_name ?? 'Report',
    attachmentName: `${safeName}.${rendered.ext}`,
    attachmentBuffer: rendered.buf,
    contentType: rendered.contentType,
  });

  await markScheduleRun(client, row.id, row.tenant_id, row.cadence);
  logger.info('[report-schedule] Delivered scheduled report', {
    scheduleId: row.id,
    tenantId: row.tenant_id,
    recipients: recipients.length,
    rows: data.rows.length,
  });
}

export async function processDueReportSchedules(client: PoolClient): Promise<number> {
  const due = await claimDueSchedules(client, 5);
  let processed = 0;
  for (const row of due) {
    try {
      await processSchedule(client, row);
      processed += 1;
    } catch (err) {
      logger.error('[report-schedule] Failed to process schedule', {
        scheduleId: row.id,
        tenantId: row.tenant_id,
        err,
      });
      await markScheduleRun(client, row.id, row.tenant_id, row.cadence);
    }
  }
  return processed;
}
