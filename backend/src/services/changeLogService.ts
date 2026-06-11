import type pg from 'pg';
import {
  ChangeLogRepository,
  type ChangeLogAction,
  type ChangeLogRow,
} from '../core/repositories/ChangeLogRepository.js';

export type { ChangeLogAction, ChangeLogRow };

export async function appendChangeLog(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    entityType: string;
    entityId: string;
    action: ChangeLogAction;
    payload?: unknown;
    version?: number;
    changedBy?: string | null;
  }
): Promise<string> {
  return new ChangeLogRepository(input.tenantId).append(client, input);
}

/** Phase 1 conflict resolution: last-write-wins by version + updated_at. */
export async function assertLwwVersion(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    table: string;
    id: string;
    clientVersion: number;
  }
): Promise<{ serverVersion: number; updatedAt: string } | null> {
  return ChangeLogRepository.assertLwwVersion(client, input);
}

export function changeLogRowToApi(row: ChangeLogRow): Record<string, unknown> {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    version: row.version,
    changedAt: row.changed_at instanceof Date ? row.changed_at.toISOString() : row.changed_at,
    changedBy: row.changed_by ?? undefined,
    payload: row.payload_json ?? undefined,
  };
}

/** Incremental sync feed from Architecture v2 change_log table. */
export async function listChangeLogSince(
  client: pg.PoolClient,
  tenantId: string,
  since: Date
): Promise<ChangeLogRow[]> {
  return new ChangeLogRepository(tenantId).listSince(client, since);
}
