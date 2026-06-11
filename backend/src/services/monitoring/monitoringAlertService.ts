import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { MonitoringCategory, MonitoringSeverity } from '../../constants/monitoring.js';
import { logger } from '../../utils/logger.js';
import {
  MonitoringAlertRepository,
  MonitoringEventRepository,
} from '../../modules/monitoring/repositories/MonitoringRepository.js';

const SEVERITY_RANK: Record<MonitoringSeverity, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  critical: 4,
};

const alertRepo = new MonitoringAlertRepository();
const eventRepo = new MonitoringEventRepository();

export type AlertIncidentRow = {
  id: string;
  rule_id: string;
  rule_name?: string;
  status: string;
  event_count: number;
  sample_message: string | null;
  triggered_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
};

export async function evaluateAlertRules(
  client: pg.PoolClient,
  category: MonitoringCategory,
  severity: MonitoringSeverity,
  sampleEventId: string,
  sampleMessage: string
): Promise<void> {
  const rules = await alertRepo.listEnabledRulesForCategory(client, category);

  for (const rule of rules) {
    if (SEVERITY_RANK[severity] < SEVERITY_RANK[rule.min_severity]) continue;

    const count = await eventRepo.countSeverityEventsInWindow(client, category, rule.window_minutes);
    if (count < rule.threshold_count) continue;

    const hasOpen = await alertRepo.hasOpenIncidentInWindow(client, rule.id, rule.window_minutes);
    if (hasOpen) continue;

    const incidentId = randomUUID();
    await alertRepo.insertIncident(client, {
      id: incidentId,
      ruleId: rule.id,
      eventCount: count,
      sampleMessage: sampleMessage.slice(0, 500),
      sampleEventId,
      metadataJson: JSON.stringify({ category, severity }),
    });

    const channels = Array.isArray(rule.notify_channels) ? rule.notify_channels : ['log'];
    if (channels.includes('log')) {
      logger.error('[monitoring-alert] Threshold breached', {
        rule: rule.name,
        category,
        count,
        windowMinutes: rule.window_minutes,
        incidentId,
      });
    }
  }
}

export async function listOpenAlerts(client: pg.PoolClient, limit = 50): Promise<AlertIncidentRow[]> {
  const rows = await alertRepo.listOpen(client, limit);
  return rows.map((row) => ({
    id: row.id,
    rule_id: row.rule_id,
    rule_name: row.rule_name,
    status: row.status,
    event_count: row.event_count,
    sample_message: row.sample_message,
    triggered_at: row.triggered_at,
    acknowledged_at: row.acknowledged_at,
    resolved_at: row.resolved_at,
  }));
}

export async function acknowledgeAlert(
  client: pg.PoolClient,
  incidentId: string,
  userId: string
): Promise<void> {
  await alertRepo.acknowledge(client, incidentId, userId);
}

export async function resolveAlert(client: pg.PoolClient, incidentId: string): Promise<void> {
  await alertRepo.resolve(client, incidentId);
}
