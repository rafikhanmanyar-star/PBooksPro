/**
 * Permanently remove a tenant and all related data from PostgreSQL.
 * Tries session_replication_role = replica first; on managed Postgres (Render, etc.)
 * falls back to temporarily disabling immutable audit/journal triggers.
 */
import type pg from 'pg';
import { withSavepoint, withTransaction } from '../../db/pool.js';
import { wipeTenantBusinessData, wipeTenantBusinessDataAutocommit } from '../tenantDataManagementService.js';
import {
  DEMO_INTERNAL_TENANT_IDS,
  DEMO_PUBLIC_TENANT_ID,
  isDemoMasterTenant,
  isDemoPresentationTenant,
} from '../../constants/demoEnvironment.js';
import {
  TenantJournalMaintenanceRepository,
} from '../../core/repositories/TenantMaintenanceRepository.js';
import { logger } from '../../utils/logger.js';

const journalMaintenance = new TenantJournalMaintenanceRepository();

export function assertAdminMayDeleteTenant(tenantId: string): void {
  if (
    isDemoMasterTenant(tenantId) ||
    tenantId === DEMO_PUBLIC_TENANT_ID ||
    isDemoPresentationTenant(tenantId) ||
    DEMO_INTERNAL_TENANT_IDS.has(tenantId)
  ) {
    throw new Error('Protected system tenants cannot be deleted from the admin portal.');
  }
}

async function deleteWithReplicaRole(
  client: pg.PoolClient,
  fn: () => Promise<void>
): Promise<void> {
  await withSavepoint(client, 'tenant_delete_replica_role', async (c) => {
    await c.query('SET session_replication_role = replica');
    try {
      await fn();
    } finally {
      await c.query('SET session_replication_role = DEFAULT');
    }
  });
}

async function deleteWithTriggersDisabled(
  client: pg.PoolClient,
  fn: () => Promise<void>
): Promise<void> {
  const auditTriggers = ['login_events_immutable_del', 'audit_events_immutable_del'] as const;
  for (const trigger of auditTriggers) {
    const table = trigger.startsWith('login_events') ? 'login_events' : 'audit_events';
    await client.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
  }
  await journalMaintenance.setJournalImmutabilityTriggers(client, false);
  try {
    await fn();
  } finally {
    for (const trigger of auditTriggers) {
      const table = trigger.startsWith('login_events') ? 'login_events' : 'audit_events';
      await client.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
    }
    await journalMaintenance.setJournalImmutabilityTriggers(client, true);
  }
}

async function purgeAuditAndDeleteTenant(client: pg.PoolClient, tenantId: string): Promise<void> {
  const runDelete = async () => {
    await client.query('DELETE FROM login_events WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM audit_events WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM user_sessions WHERE tenant_id = $1', [tenantId]);

    const result = await client.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    if ((result.rowCount ?? 0) === 0) {
      throw new Error('Tenant not found');
    }
  };

  try {
    await deleteWithReplicaRole(client, runDelete);
  } catch (replicaErr) {
    await deleteWithTriggersDisabled(client, runDelete).catch((triggerErr) => {
      const replicaMsg = replicaErr instanceof Error ? replicaErr.message : String(replicaErr);
      const triggerMsg = triggerErr instanceof Error ? triggerErr.message : String(triggerErr);
      throw new Error(`Failed to delete tenant: ${triggerMsg} (replica mode: ${replicaMsg})`);
    });
  }
}

/** @deprecated Prefer deleteTenantCompletely — kept for callers that supply their own client/transaction. */
export async function purgeAndDeleteTenant(client: pg.PoolClient, tenantId: string): Promise<void> {
  assertAdminMayDeleteTenant(tenantId);
  const runDelete = async () => {
    await wipeTenantBusinessData(client, tenantId);
    await purgeAuditAndDeleteTenant(client, tenantId);
  };

  try {
    await deleteWithReplicaRole(client, runDelete);
  } catch (replicaErr) {
    await deleteWithTriggersDisabled(client, runDelete).catch((triggerErr) => {
      const replicaMsg = replicaErr instanceof Error ? replicaErr.message : String(replicaErr);
      const triggerMsg = triggerErr instanceof Error ? triggerErr.message : String(triggerErr);
      throw new Error(`Failed to delete tenant: ${triggerMsg} (replica mode: ${replicaMsg})`);
    });
  }
}

/**
 * Permanently delete a tenant. Runs in three phases so large tenants do not hold one
 * connection and transaction for minutes (which starves the pool on Render).
 */
export async function deleteTenantCompletely(tenantId: string): Promise<void> {
  assertAdminMayDeleteTenant(tenantId);
  logger.info('[admin] tenant delete started', { tenantId });

  await withTransaction(async (client) => {
    const exists = await client.query(`SELECT id FROM tenants WHERE id = $1`, [tenantId]);
    if ((exists.rowCount ?? 0) === 0) {
      throw new Error('Tenant not found');
    }
    await client.query(
      `UPDATE tenants SET license_status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [tenantId]
    );
    await client.query(`DELETE FROM user_sessions WHERE tenant_id = $1`, [tenantId]);
  });

  const wipeResult = await wipeTenantBusinessDataAutocommit(tenantId);
  logger.info('[admin] tenant business data wiped', wipeResult);

  await withTransaction(async (client) => {
    await purgeAuditAndDeleteTenant(client, tenantId);
  });

  logger.info('[admin] tenant delete completed', { tenantId });
}
