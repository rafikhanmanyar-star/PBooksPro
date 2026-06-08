import type pg from 'pg';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  TENANT_BACKUP_FORMAT_V2,
  TENANT_BACKUP_FORMAT_V1,
  TENANT_BACKUP_TABLES,
  filterBackupTables,
} from './tenantBackupRegistry.js';

export type TenantBackupPayloadV2 = {
  format: typeof TENANT_BACKUP_FORMAT_V2;
  exportedAt: string;
  sourceTenantId: string;
  sourceTenantName?: string;
  scope: string[];
  tables: Record<string, unknown[]>;
};

export type TenantBackupPayloadV1 = {
  format: typeof TENANT_BACKUP_FORMAT_V1;
  exportedAt: string;
  tenantId: string;
  tables: Record<string, unknown[]>;
};

export type TenantBackupPayload = TenantBackupPayloadV2 | TenantBackupPayloadV1;

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
  if (table === 'payroll_tenant_config') {
    const r = await client.query(`SELECT * FROM payroll_tenant_config WHERE tenant_id = $1`, [
      tenantId,
    ]);
    return r.rows;
  }
  const r = await client.query(`SELECT * FROM ${table} WHERE tenant_id = $1`, [tenantId]);
  return r.rows;
}

export async function buildTenantBackupPayload(
  client: pg.PoolClient,
  tenantId: string
): Promise<TenantBackupPayloadV2> {
  const tenantCheck = await client.query(`SELECT id, name FROM tenants WHERE id = $1`, [tenantId]);
  if (tenantCheck.rows.length === 0) {
    throw new Error('Organization not found.');
  }
  const tenantName = String(tenantCheck.rows[0].name ?? '');

  const tables: Record<string, unknown[]> = {};
  for (const table of TENANT_BACKUP_TABLES) {
    if (!(await tableExists(client, table))) continue;
    try {
      const rows = await exportTenantTable(client, table, tenantId);
      if (rows.length > 0) tables[table] = rows;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('tenant_id') || msg.includes('does not exist')) continue;
      throw e;
    }
  }

  return {
    format: TENANT_BACKUP_FORMAT_V2,
    exportedAt: new Date().toISOString(),
    sourceTenantId: tenantId,
    sourceTenantName: tenantName,
    scope: Object.keys(tables),
    tables,
  };
}

export function compressTenantBackup(payload: TenantBackupPayload): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(payload), 'utf-8'));
}

export function decompressTenantBackup(buffer: Buffer): TenantBackupPayload {
  let json: string;
  try {
    json = gunzipSync(buffer).toString('utf-8');
  } catch {
    json = buffer.toString('utf-8');
  }
  const parsed = JSON.parse(json) as TenantBackupPayload;
  if (
    parsed.format !== TENANT_BACKUP_FORMAT_V2 &&
    parsed.format !== TENANT_BACKUP_FORMAT_V1
  ) {
    throw new Error('Invalid tenant backup format.');
  }
  return parsed;
}

export function normalizeTenantBackupPayload(payload: TenantBackupPayload): TenantBackupPayloadV2 {
  if (payload.format === TENANT_BACKUP_FORMAT_V2) {
    return {
      ...payload,
      tables: filterBackupTables(payload.tables),
    };
  }
  return {
    format: TENANT_BACKUP_FORMAT_V2,
    exportedAt: payload.exportedAt,
    sourceTenantId: payload.tenantId,
    scope: Object.keys(filterBackupTables(payload.tables)),
    tables: filterBackupTables(payload.tables),
  };
}

export function getSourceTenantId(payload: TenantBackupPayload): string {
  return payload.format === TENANT_BACKUP_FORMAT_V2 ? payload.sourceTenantId : payload.tenantId;
}
