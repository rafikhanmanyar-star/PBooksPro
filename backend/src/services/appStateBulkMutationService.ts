import type pg from 'pg';
import { recordDomainMutation } from '../core/recordDomainMutation.js';

/**
 * Architecture v2 — record change_log after bulk app_settings writes
 * (used by POST /app-settings/bulk and client settings sync).
 */
export async function recordBulkAppSettingsChangeLog(
  client: pg.PoolClient,
  tenantId: string,
  keys: string[],
  userId?: string | null
): Promise<void> {
  if (keys.length === 0) return;
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'app_settings',
    entityType: 'app_settings',
    entityId: tenantId,
    action: 'update',
    summary: `Bulk app settings updated (${keys.length} key(s))`,
    newValue: { keys, count: keys.length },
  });
}

/**
 * Architecture v2 — summary change_log row after bulk personal transaction import.
 */
export async function recordBulkPersonalTransactionsChangeLog(
  client: pg.PoolClient,
  tenantId: string,
  imported: number,
  userId?: string | null
): Promise<void> {
  if (imported <= 0) return;
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'personal_finance',
    entityType: 'personal_transaction_bulk',
    entityId: tenantId,
    action: 'create',
    summary: `Bulk personal transactions imported (${imported})`,
    newValue: { imported },
  });
}

/** Architecture v2 — change_log for a single app_settings key write or delete. */
export async function recordAppSettingChangeLog(
  client: pg.PoolClient,
  tenantId: string,
  key: string,
  action: 'update' | 'delete',
  userId?: string | null
): Promise<void> {
  await recordDomainMutation(client, {
    tenantId,
    userId: userId ?? null,
    module: 'app_settings',
    entityType: 'app_settings',
    entityId: tenantId,
    action,
    summary: `App setting ${key} ${action === 'delete' ? 'deleted' : 'updated'}`,
    newValue: action === 'update' ? { keys: [key], count: 1 } : undefined,
    oldValue: action === 'delete' ? { key } : undefined,
  });
}
