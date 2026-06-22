/**
 * Tenant-scoped destructive data operations (factory reset, clear transactions).
 * Used by Settings → Data Management in LAN/API mode.
 */

import type pg from 'pg';
import { getPool, withSavepoint } from '../../../db/pool.js';
import { bootstrapTenantChart } from './tenantBootstrap.js';
import { logger } from '../../../utils/logger.js';
import {
  DEMO_INTERNAL_TENANT_IDS,
  DEMO_PUBLIC_TENANT_ID,
  isDemoMasterTenant,
  isDemoPresentationTenant,
} from '../../../constants/demoEnvironment.js';
import {
  TenantJournalMaintenanceRepository,
  TenantWipeRepository,
} from '../../../core/repositories/TenantMaintenanceRepository.js';

/** Child tables first. Missing tables are skipped (savepoint per table). */
const CLEAR_TRANSACTION_TABLES = [
  'bill_po_lines',
  'vendor_bill_advance_clearings',
  'contractor_bill_adjustments',
  'contractor_bills',
  'contractor_advances',
  'pm_cycle_allocations',
  'project_agreement_units',
  'sales_returns',
  'transaction_log',
  'transactions',
  'invoices',
  'bills',
  'goods_receipt_lines',
  'goods_receipts',
  'purchase_order_lines',
  'purchase_orders',
  'quotation_comparison_session_quotations',
  'quotation_comparison_sessions',
  'quotation_items',
  'quotation_attachments',
  'quotation_price_overrides',
  'vendor_price_history',
  'vendor_performance_ratings',
  'quotations',
  'approval_request_actions',
  'approval_requests',
  'recurring_invoice_templates',
  'contracts',
  'rental_agreements',
  'project_agreements',
  'project_received_assets',
] as const;

const FACTORY_RESET_EXTRA_TABLES = [
  'document_metadata',
  'documents',
  'budgets',
  'units',
  'properties',
  'property_ownership',
  'buildings',
  'projects',
  'vendors',
  'contacts',
  'installment_plans',
  'plan_amenities',
  'owner_balances',
  'monthly_owner_summary',
  'pl_category_mapping',
  'project_expense_vouchers',
  'project_expense_categories',
  'custom_report_templates',
  'report_builder_audit_log',
  'analytics_snapshots',
  'record_locks',
  'payslips',
  'payroll_transactions',
  'payroll_runs',
  'payroll_employees',
  'payroll_salary_components',
  'payroll_projects',
  'payroll_grades',
  'payroll_departments',
  'payroll_tenant_config',
  'personal_transactions',
  'personal_categories',
  'personal_tasks',
  'app_settings',
  'report_dashboard_pins',
  'report_favorites',
  'report_shares',
  'report_schedules',
  'report_definitions',
  'report_templates',
  'user_notifications',
  'chat_messages',
  'sync_queue',
  'change_log',
  'unposted_transactions',
  'whatsapp_menu_sessions',
  'whatsapp_messages',
  'whatsapp_configs',
  'audit_events',
  'login_events',
] as const;

export type TenantWipeResult = {
  tenantId: string;
  tablesCleared: number;
  recordsDeleted: number;
};

function assertTenantMayBeWiped(tenantId: string): void {
  if (
    isDemoMasterTenant(tenantId) ||
    tenantId === DEMO_PUBLIC_TENANT_ID ||
    isDemoPresentationTenant(tenantId) ||
    DEMO_INTERNAL_TENANT_IDS.has(tenantId)
  ) {
    throw new Error('This organization cannot be reset.');
  }
}

const journalMaintenance = new TenantJournalMaintenanceRepository();
const wipeRepo = new TenantWipeRepository();

/** Bypass journal immutability triggers (managed Postgres / Render). */
export async function purgeTenantJournal(client: pg.PoolClient, tenantId: string): Promise<void> {
  const purgeWithReplicaRole = () =>
    withSavepoint(client, 'tenant_journal_purge_replica', async (c) => {
      await c.query(`SET session_replication_role = replica`);
      try {
        await journalMaintenance.deleteTenantJournalRows(c, tenantId);
      } finally {
        await c.query(`SET session_replication_role = DEFAULT`);
      }
    });

  const purgeWithTriggersDisabled = () =>
    withSavepoint(client, 'tenant_journal_purge_triggers', async (c) => {
      await journalMaintenance.setJournalImmutabilityTriggers(c, false);
      try {
        await journalMaintenance.deleteTenantJournalRows(c, tenantId);
      } finally {
        await journalMaintenance.setJournalImmutabilityTriggers(c, true);
      }
    });

  try {
    await purgeWithReplicaRole();
  } catch (replicaErr) {
    try {
      await purgeWithTriggersDisabled();
    } catch (triggerErr) {
      logger.warn('Tenant journal purge skipped (stale GL rows may remain)', {
        tenantId,
        replicaErr: replicaErr instanceof Error ? replicaErr.message : String(replicaErr),
        triggerErr: triggerErr instanceof Error ? triggerErr.message : String(triggerErr),
      });
    }
  }
}

async function wipeTenantTables(
  client: pg.PoolClient,
  tenantId: string,
  tables: readonly string[]
): Promise<TenantWipeResult> {
  let tablesCleared = 0;
  let recordsDeleted = 0;

  await purgeTenantJournal(client, tenantId);
  tablesCleared += 1;
  recordsDeleted += 3;

  for (const table of tables) {
    try {
      const n = await withSavepoint(client, `wipe_${table}`, async (c) =>
        wipeRepo.deleteFromTenantTable(c, tenantId, table)
      );
      if (n > 0) tablesCleared += 1;
      recordsDeleted += n;
    } catch {
      /* table may not exist on older schemas */
    }
  }

  try {
    const n = await withSavepoint(client, 'wipe_tenant_accounts', async (c) =>
      wipeRepo.deleteTenantAccounts(c, tenantId)
    );
    recordsDeleted += n;
    tablesCleared += 1;
  } catch {
    /* optional */
  }

  try {
    const n = await withSavepoint(client, 'wipe_tenant_categories', async (c) =>
      wipeRepo.deleteNonPermanentCategories(c, tenantId)
    );
    recordsDeleted += n;
    tablesCleared += 1;
  } catch {
    /* optional */
  }

  return { tenantId, tablesCleared, recordsDeleted };
}

/** Wipe transactional data; preserve master entities (projects, contacts, etc.). */
export async function clearTenantTransactions(
  client: pg.PoolClient,
  tenantId: string
): Promise<TenantWipeResult> {
  assertTenantMayBeWiped(tenantId);
  return wipeTenantTables(client, tenantId, CLEAR_TRANSACTION_TABLES);
}

async function wipeTenantOrganizationDataUnchecked(
  client: pg.PoolClient,
  tenantId: string
): Promise<TenantWipeResult> {
  const tables = [...CLEAR_TRANSACTION_TABLES, ...FACTORY_RESET_EXTRA_TABLES];
  return wipeTenantTables(client, tenantId, tables);
}

/** Wipe all organization business data; preserve users, tenant record, and subscriptions. */
export async function wipeTenantOrganizationData(
  client: pg.PoolClient,
  tenantId: string
): Promise<TenantWipeResult> {
  assertTenantMayBeWiped(tenantId);
  return wipeTenantOrganizationDataUnchecked(client, tenantId);
}

/** Full factory reset: wipe data and re-bootstrap the system chart. */
export async function factoryResetTenant(
  client: pg.PoolClient,
  tenantId: string
): Promise<TenantWipeResult> {
  const result = await wipeTenantOrganizationData(client, tenantId);
  await bootstrapTenantChart(client, tenantId, { legacyIds: false });
  return result;
}

/**
 * Demo seed/reset only — bypasses assertTenantMayBeWiped so sandbox tenants can be rebuilt.
 * User-facing Settings → Data Management must use wipeTenantOrganizationData instead.
 */
export async function wipeTenantBusinessData(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  await wipeTenantOrganizationDataUnchecked(client, tenantId);
}

const ALL_TENANT_WIPE_TABLES = [...CLEAR_TRANSACTION_TABLES, ...FACTORY_RESET_EXTRA_TABLES] as const;

async function purgeTenantJournalAutocommit(tenantId: string): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query(`SET session_replication_role = replica`);
      await journalMaintenance.deleteTenantJournalRows(client, tenantId);
      await client.query(`SET session_replication_role = DEFAULT`);
      await client.query('COMMIT');
    } catch (replicaErr) {
      await client.query('ROLLBACK');
      await client.query('BEGIN');
      await journalMaintenance.setJournalImmutabilityTriggers(client, false);
      try {
        await journalMaintenance.deleteTenantJournalRows(client, tenantId);
        await client.query('COMMIT');
      } catch (triggerErr) {
        await client.query('ROLLBACK');
        logger.warn('Tenant journal purge skipped (stale GL rows may remain)', {
          tenantId,
          replicaErr: replicaErr instanceof Error ? replicaErr.message : String(replicaErr),
          triggerErr: triggerErr instanceof Error ? triggerErr.message : String(triggerErr),
        });
      } finally {
        await journalMaintenance.setJournalImmutabilityTriggers(client, true);
      }
    }
  } finally {
    client.release();
  }
}

/**
 * Wipe tenant business data without one long-lived transaction.
 * Used by admin portal tenant delete so the connection pool is not starved on large tenants.
 */
export async function wipeTenantBusinessDataAutocommit(tenantId: string): Promise<TenantWipeResult> {
  let tablesCleared = 0;
  let recordsDeleted = 0;

  await purgeTenantJournalAutocommit(tenantId);
  tablesCleared += 1;
  recordsDeleted += 3;

  const pool = getPool();
  for (const table of ALL_TENANT_WIPE_TABLES) {
    const client = await pool.connect();
    try {
      const n = await wipeRepo.deleteFromTenantTable(client, tenantId, table);
      if (n > 0) tablesCleared += 1;
      recordsDeleted += n;
    } catch {
      /* table may not exist on older schemas */
    } finally {
      client.release();
    }
  }

  for (const wipeFn of [
    (c: pg.PoolClient) => wipeRepo.deleteTenantAccounts(c, tenantId),
    (c: pg.PoolClient) => wipeRepo.deleteNonPermanentCategories(c, tenantId),
  ]) {
    const client = await pool.connect();
    try {
      const n = await wipeFn(client);
      recordsDeleted += n;
      if (n > 0) tablesCleared += 1;
    } catch {
      /* optional */
    } finally {
      client.release();
    }
  }

  return { tenantId, tablesCleared, recordsDeleted };
}
