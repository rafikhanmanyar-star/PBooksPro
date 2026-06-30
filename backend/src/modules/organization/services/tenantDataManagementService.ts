/**
 * Tenant-scoped destructive data operations (factory reset, clear transactions).
 * Used by Settings → Data Management in LAN/API mode.
 */

import type pg from 'pg';
import { withSavepoint } from '../../../db/pool.js';
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
  'project_expense_vouchers',
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
  'quotation_price_overrides',
  'quotation_items',
  'quotation_attachments',
  'quotations',
  'recurring_invoice_templates',
  'contracts',
  'rental_agreements',
  'project_agreements',
  'project_received_assets',
] as const;

const FACTORY_RESET_EXTRA_TABLES = [
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
] as const;

export type TenantWipeResult = {
  tenantId: string;
  tablesCleared: number;
  recordsDeleted: number;
  accountsReset?: number;
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

type PurgeTenantJournalOptions = {
  /** When true, abort the wipe if journal rows cannot be removed (needed before account reset). */
  strict?: boolean;
};

async function purgeJournalRowsWithReplicaRole(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  await client.query(`SET session_replication_role = replica`);
  try {
    await journalMaintenance.deleteTenantJournalRows(client, tenantId);
  } finally {
    await client.query(`SET session_replication_role = DEFAULT`);
  }
}

async function purgeJournalRowsWithTriggersDisabled(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  await journalMaintenance.setJournalImmutabilityTriggers(client, false);
  try {
    await journalMaintenance.deleteTenantJournalRows(client, tenantId);
  } finally {
    await journalMaintenance.setJournalImmutabilityTriggers(client, true);
  }
}

/** Bypass journal immutability triggers (managed Postgres / Render). Call after dependent rows are removed. */
export async function purgeTenantJournal(
  client: pg.PoolClient,
  tenantId: string,
  opts?: PurgeTenantJournalOptions
): Promise<void> {
  await journalMaintenance.clearJournalForeignKeyReferences(client, tenantId);

  try {
    await purgeJournalRowsWithReplicaRole(client, tenantId);
  } catch (replicaErr) {
    try {
      await purgeJournalRowsWithTriggersDisabled(client, tenantId);
    } catch (triggerErr) {
      const replicaMsg = replicaErr instanceof Error ? replicaErr.message : String(replicaErr);
      const triggerMsg = triggerErr instanceof Error ? triggerErr.message : String(triggerErr);
      const message = 'Failed to purge journal entries; account balances cannot be reset safely.';
      if (opts?.strict) {
        throw new Error(`${message} (${triggerMsg}; replica: ${replicaMsg})`, {
          cause: triggerErr instanceof Error ? triggerErr : replicaErr,
        });
      }
      logger.warn('Tenant journal purge skipped (stale GL rows may remain)', {
        tenantId,
        replicaErr: replicaMsg,
        triggerErr: triggerMsg,
      });
    }
  }
}

type WipeTenantTablesOptions = {
  /** Clear transactions: preserve chart rows and reset balances. Factory reset: delete tenant accounts. */
  preserveAccounts?: boolean;
  /** Clear transactions: keep custom categories. Factory reset: remove non-permanent categories. */
  preserveCategories?: boolean;
  /** Require journal purge to succeed before continuing (clear transactions). */
  strictJournalPurge?: boolean;
};

async function wipeTenantTables(
  client: pg.PoolClient,
  tenantId: string,
  tables: readonly string[],
  opts: WipeTenantTablesOptions = {}
): Promise<TenantWipeResult> {
  const { preserveAccounts = false, preserveCategories = false, strictJournalPurge = false } = opts;
  let tablesCleared = 0;
  let recordsDeleted = 0;
  let accountsReset = 0;

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

  await purgeTenantJournal(client, tenantId, { strict: strictJournalPurge });
  tablesCleared += 1;
  recordsDeleted += 3;

  if (preserveAccounts) {
    accountsReset = await withSavepoint(client, 'reset_tenant_account_balances', async (c) =>
      wipeRepo.resetTenantAccountBalances(c, tenantId)
    );
    if (accountsReset > 0) tablesCleared += 1;
  } else {
    try {
      const n = await withSavepoint(client, 'wipe_tenant_accounts', async (c) =>
        wipeRepo.deleteTenantAccounts(c, tenantId)
      );
      recordsDeleted += n;
      tablesCleared += 1;
    } catch {
      /* optional */
    }
  }

  if (!preserveCategories) {
    try {
      const n = await withSavepoint(client, 'wipe_tenant_categories', async (c) =>
        wipeRepo.deleteNonPermanentCategories(c, tenantId)
      );
      recordsDeleted += n;
      tablesCleared += 1;
    } catch {
      /* optional */
    }
  }

  return { tenantId, tablesCleared, recordsDeleted, accountsReset };
}

/** Wipe transactional data; preserve master entities (projects, contacts, etc.). */
export async function clearTenantTransactions(
  client: pg.PoolClient,
  tenantId: string
): Promise<TenantWipeResult> {
  assertTenantMayBeWiped(tenantId);
  return wipeTenantTables(client, tenantId, CLEAR_TRANSACTION_TABLES, {
    preserveAccounts: true,
    preserveCategories: true,
    strictJournalPurge: true,
  });
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
