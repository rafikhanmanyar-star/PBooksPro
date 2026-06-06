import type pg from 'pg';
import { gzipSync } from 'node:zlib';

/** Tenant-scoped tables exported in order (parents before children where practical). */
const TENANT_TABLES = [
  'tenants',
  'users',
  'accounts',
  'contacts',
  'categories',
  'projects',
  'buildings',
  'properties',
  'units',
  'vendors',
  'invoices',
  'bills',
  'transactions',
  'journal_entries',
  'journal_lines',
  'rental_agreements',
  'project_agreements',
  'project_agreement_units',
  'budgets',
  'contracts',
  'app_settings',
  'payroll_runs',
  'payslips',
  'payroll_employees',
  'payroll_departments',
  'payroll_grades',
] as const;

export type TenantBackupPayload = {
  format: 'pbooks-tenant-json-v1';
  exportedAt: string;
  tenantId: string;
  tables: Record<string, unknown[]>;
};

async function tableExists(client: pg.PoolClient, table: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [table]
  );
  return r.rows.length > 0;
}

async function exportTenantTable(
  client: pg.PoolClient,
  table: string,
  tenantId: string
): Promise<unknown[]> {
  if (table === 'tenants') {
    const r = await client.query(`SELECT * FROM tenants WHERE id = $1`, [tenantId]);
    return r.rows;
  }
  const r = await client.query(`SELECT * FROM ${table} WHERE tenant_id = $1`, [tenantId]);
  return r.rows;
}

export async function buildTenantBackupPayload(
  client: pg.PoolClient,
  tenantId: string
): Promise<TenantBackupPayload> {
  const tenantCheck = await client.query(`SELECT id FROM tenants WHERE id = $1`, [tenantId]);
  if (tenantCheck.rows.length === 0) {
    throw new Error('Organization not found.');
  }

  const tables: Record<string, unknown[]> = {};
  for (const table of TENANT_TABLES) {
    if (!(await tableExists(client, table))) continue;
    try {
      tables[table] = await exportTenantTable(client, table, tenantId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('tenant_id') || msg.includes('does not exist')) continue;
      throw e;
    }
  }

  return {
    format: 'pbooks-tenant-json-v1',
    exportedAt: new Date().toISOString(),
    tenantId,
    tables,
  };
}

export function compressTenantBackup(payload: TenantBackupPayload): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(payload), 'utf-8'));
}
