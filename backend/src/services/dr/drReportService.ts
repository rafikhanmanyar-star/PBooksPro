/**
 * Disaster recovery reports.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getDrDashboard } from './drDashboardService.js';
import { listAlerts } from './drAlertService.js';
import { listRestoreTests } from './drRestoreTestService.js';
import { listVerificationRuns } from './drVerificationService.js';
import { listBackupHistory } from '../backupSchedulerService.js';

export type DrReportRow = {
  id: string;
  report_type: 'daily_health' | 'manual' | 'weekly';
  health_score: number;
  summary: Record<string, unknown>;
  requested_by: string | null;
  generated_at: string;
};

function mapRow(row: pg.QueryResultRow): DrReportRow {
  return {
    id: row.id,
    report_type: row.report_type,
    health_score: row.health_score,
    summary:
      row.summary && typeof row.summary === 'object'
        ? (row.summary as Record<string, unknown>)
        : {},
    requested_by: row.requested_by,
    generated_at: row.generated_at,
  };
}

export async function generateDrReport(
  client: pg.PoolClient,
  opts: {
    reportType: 'daily_health' | 'manual' | 'weekly';
    requestedBy: string | null;
  }
): Promise<DrReportRow> {
  const dashboard = await getDrDashboard(client);
  const [backupHistory, verifications, restoreTests, alerts] = await Promise.all([
    listBackupHistory(client, { limit: 10 }),
    listVerificationRuns(client, 10),
    listRestoreTests(client, 10),
    listAlerts(client, { limit: 20 }),
  ]);

  const summary = {
    generatedAt: new Date().toISOString(),
    dashboard,
    recentBackups: backupHistory.items,
    recentVerifications: verifications,
    recentRestoreTests: restoreTests,
    openAlerts: alerts.filter((a) => !a.acknowledged),
    recommendations: buildRecommendations(dashboard),
  };

  const id = randomUUID();
  await client.query(
    `INSERT INTO dr_reports (id, report_type, health_score, summary, requested_by)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [id, opts.reportType, dashboard.backupHealth.score, JSON.stringify(summary), opts.requestedBy]
  );

  const { rows } = await client.query(`SELECT * FROM dr_reports WHERE id = $1`, [id]);
  return mapRow(rows[0]);
}

function buildRecommendations(dashboard: Awaited<ReturnType<typeof getDrDashboard>>): string[] {
  const recs: string[] = [];
  const { backupHealth } = dashboard;

  for (const f of backupHealth.factors) {
    if (f.status === 'fail') {
      if (f.id === 'recent_backup') recs.push('Run or fix the backup scheduler immediately.');
      if (f.id === 'verification') recs.push('Run backup verification on the latest dump.');
      if (f.id === 'offsite') recs.push('Configure offsite storage and upload the latest backup.');
      if (f.id === 'restore_test') recs.push('Run a restore simulation to validate recoverability.');
      if (f.id === 'alerts') recs.push('Review and acknowledge open critical DR alerts.');
    }
  }

  if (backupHealth.score >= 80 && recs.length === 0) {
    recs.push('Backup health is good. Continue scheduled backups and monthly restore tests.');
  }

  return recs;
}

export async function listDrReports(
  client: pg.PoolClient,
  limit = 20
): Promise<DrReportRow[]> {
  const { rows } = await client.query(
    `SELECT * FROM dr_reports ORDER BY generated_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map(mapRow);
}

export async function getDrReport(
  client: pg.PoolClient,
  reportId: string
): Promise<DrReportRow | null> {
  const { rows } = await client.query(`SELECT * FROM dr_reports WHERE id = $1`, [reportId]);
  return rows.length ? mapRow(rows[0]) : null;
}
