import type pg from 'pg';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  TENANT_BACKUP_FORMAT_V2,
  TENANT_BACKUP_FORMAT_V1,
  TENANT_BACKUP_TABLES,
  filterBackupTables,
} from './tenantBackupRegistry.js';
import { TenantBackupRepository } from '../repositories/TenantBackupRepository.js';

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

const backupRepo = new TenantBackupRepository();

export async function buildTenantBackupPayload(
  client: pg.PoolClient,
  tenantId: string
): Promise<TenantBackupPayloadV2> {
  const tenant = await backupRepo.getTenantById(client, tenantId);
  if (!tenant) {
    throw new Error('Organization not found.');
  }

  const tables: Record<string, unknown[]> = {};
  for (const table of TENANT_BACKUP_TABLES) {
    if (!(await backupRepo.tableExists(client, table))) continue;
    try {
      const rows = await backupRepo.exportTenantTable(client, table, tenantId);
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
    sourceTenantName: String(tenant.name ?? ''),
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
