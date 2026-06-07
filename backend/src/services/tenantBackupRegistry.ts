/**
 * Tenant backup scope — business data only (no system config, no users).
 * Order: parents before children for FK-safe restore.
 */

export const TENANT_BACKUP_FORMAT_V2 = 'pbooks-tenant-json-v2' as const;
export const TENANT_BACKUP_FORMAT_V1 = 'pbooks-tenant-json-v1' as const;

/** Tables included in tenant backup/restore (whitelist). */
export const TENANT_BACKUP_TABLES = [
  'categories',
  'accounts',
  'contacts',
  'vendors',
  'projects',
  'payroll_departments',
  'payroll_grades',
  'payroll_employees',
  'payroll_runs',
  'payslips',
  'payroll_tenant_config',
  'invoices',
  'bills',
  'journal_entries',
  'journal_lines',
  'transactions',
] as const;

export type TenantBackupTable = (typeof TENANT_BACKUP_TABLES)[number];

/** Human-readable scope labels for UI. */
export const TENANT_BACKUP_SCOPE_LABELS: Record<string, string> = {
  contacts: 'Customers & contacts',
  vendors: 'Vendors',
  accounts: 'Accounts',
  transactions: 'Transactions',
  invoices: 'Invoices',
  projects: 'Projects',
  bills: 'Bills',
  categories: 'Categories (supporting)',
  payroll_departments: 'Payroll — departments',
  payroll_grades: 'Payroll — grades',
  payroll_employees: 'Payroll — employees',
  payroll_runs: 'Payroll — runs',
  payslips: 'Payroll — payslips',
  payroll_tenant_config: 'Payroll — configuration',
  journal_entries: 'Journal entries',
  journal_lines: 'Journal lines',
};

/** Tables never imported (system / security / excluded by requirement). */
export const TENANT_BACKUP_EXCLUDED_TABLES = new Set([
  'users',
  'app_settings',
  'tenants',
  'custom_report_templates',
  'report_builder_audit_log',
  'audit_events',
  'login_events',
  'schema_migrations',
  'backup_jobs',
  'backup_job_runs',
  'backup_storage_settings',
  'backup_offsite_uploads',
  'tenant_restore_runs',
]);

export function isAllowedBackupTable(table: string): table is TenantBackupTable {
  return (TENANT_BACKUP_TABLES as readonly string[]).includes(table);
}

export function filterBackupTables(
  tables: Record<string, unknown[]>
): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const table of TENANT_BACKUP_TABLES) {
    const rows = tables[table];
    if (Array.isArray(rows) && rows.length > 0) {
      out[table] = rows;
    }
  }
  return out;
}
