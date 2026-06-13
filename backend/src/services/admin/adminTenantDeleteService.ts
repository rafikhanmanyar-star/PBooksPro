/**
 * Permanently remove a tenant and all related data from PostgreSQL.
 * Uses session_replication_role = replica to bypass immutable audit/journal triggers.
 */
import type pg from 'pg';
import { withTransaction } from '../../db/pool.js';
import { wipeTenantBusinessData } from '../tenantDataManagementService.js';
import {
  DEMO_INTERNAL_TENANT_IDS,
  DEMO_PUBLIC_TENANT_ID,
  isDemoMasterTenant,
  isDemoPresentationTenant,
} from '../../constants/demoEnvironment.js';
import {
  TenantJournalMaintenanceRepository,
} from '../../core/repositories/TenantMaintenanceRepository.js';

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
  await client.query('SET session_replication_role = replica');
  try {
    await fn();
  } finally {
    await client.query('SET session_replication_role = DEFAULT');
  }
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

export async function purgeAndDeleteTenant(client: pg.PoolClient, tenantId: string): Promise<void> {
  assertAdminMayDeleteTenant(tenantId);

  const runDelete = async () => {
    await wipeTenantBusinessData(client, tenantId);

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

export async function deleteTenantCompletely(tenantId: string): Promise<void> {
  await withTransaction(async (client) => {
    await purgeAndDeleteTenant(client, tenantId);
  });
}
