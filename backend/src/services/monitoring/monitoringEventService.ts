/**
 * Monitoring event persistence and queries.
 */

import type pg from 'pg';
import type { MonitoringCategory, MonitoringSeverity } from '../../constants/monitoring.js';
import {
  MonitoringEventRepository,
} from '../../modules/monitoring/repositories/MonitoringRepository.js';

export type MonitoringEventRow = {
  id: string;
  category: MonitoringCategory;
  severity: MonitoringSeverity;
  message: string;
  code: string | null;
  tenant_id: string | null;
  user_id: string | null;
  route: string | null;
  method: string | null;
  status_code: number | null;
  duration_ms: number | null;
  request_id: string | null;
  stack_trace: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type RecordMonitoringEventInput = {
  category: MonitoringCategory;
  severity?: MonitoringSeverity;
  message: string;
  code?: string;
  tenantId?: string | null;
  userId?: string | null;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  requestId?: string;
  stackTrace?: string;
  metadata?: Record<string, unknown>;
};

const eventRepo = new MonitoringEventRepository();

export async function recordMonitoringEvent(
  client: pg.PoolClient,
  input: RecordMonitoringEventInput
): Promise<MonitoringEventRow> {
  const id = await eventRepo.insert(client, input);
  const row = await eventRepo.getById(client, id);
  if (!row) throw new Error('Failed to load monitoring event after insert');
  return row;
}

export type ListMonitoringEventsOptions = {
  category?: MonitoringCategory;
  severity?: MonitoringSeverity;
  tenantId?: string;
  search?: string;
  since?: string;
  limit?: number;
  offset?: number;
};

export async function listMonitoringEvents(
  client: pg.PoolClient,
  options: ListMonitoringEventsOptions = {}
): Promise<{ items: MonitoringEventRow[]; total: number }> {
  const limit = Math.min(options.limit ?? 100, 500);
  const offset = options.offset ?? 0;
  const search = options.search?.trim().toLowerCase();

  const filter = {
    category: options.category,
    severity: options.severity,
    tenantId: options.tenantId,
    since: options.since,
    search: search ?? null,
  };

  const [total, items] = await Promise.all([
    eventRepo.countFiltered(client, filter),
    eventRepo.listFiltered(client, { ...filter, limit, offset }),
  ]);

  return { items, total };
}

export async function getMonitoringStats(
  client: pg.PoolClient,
  hours = 24
): Promise<{
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  recentErrors: number;
  slowRequests: number;
}> {
  const [catRows, sevRows] = await Promise.all([
    eventRepo.countByCategorySinceHours(client, hours),
    eventRepo.countBySeveritySinceHours(client, hours),
  ]);

  const byCategory: Record<string, number> = {};
  for (const r of catRows) byCategory[r.category] = Number(r.count);

  const bySeverity: Record<string, number> = {};
  for (const r of sevRows) bySeverity[r.severity] = Number(r.count);

  return {
    byCategory,
    bySeverity,
    recentErrors: (bySeverity.error ?? 0) + (bySeverity.critical ?? 0),
    slowRequests: byCategory.performance ?? 0,
  };
}
