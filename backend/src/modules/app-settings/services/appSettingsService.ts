import type pg from 'pg';
import { AppSettingsRepository } from '../repositories/AppSettingsRepository.js';

/** Keys persisted for tenant (device-only keys stay in local SQLite only). */
export const TENANT_SETTING_KEYS = [
  'agreementSettings',
  'projectAgreementSettings',
  'rentalInvoiceSettings',
  'projectInvoiceSettings',
  'printSettings',
  'whatsAppTemplates',
  'dashboardConfig',
  'accountConsistency',
  'invoiceHtmlTemplate',
  'showSystemTransactions',
  'enableColorCoding',
  'enableBeepOnSave',
  'whatsAppMode',
  'pmCostPercentage',
  'defaultProjectId',
  'lastServiceChargeRun',
  'enableDatePreservation',
  'procurementSettings',
] as const;

export type TenantSettingKey = (typeof TENANT_SETTING_KEYS)[number];

export async function listAllSettings(
  client: pg.PoolClient,
  tenantId: string
): Promise<Record<string, unknown>> {
  const rows = await new AppSettingsRepository(tenantId).listAll(client);
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    out[row.key] = row.value;
  }
  return out;
}

export async function getSettingByKey(
  client: pg.PoolClient,
  tenantId: string,
  key: string
): Promise<unknown | null> {
  const row = await new AppSettingsRepository(tenantId).getByKey(client, key);
  return row?.value ?? null;
}

export async function upsertSetting(
  client: pg.PoolClient,
  tenantId: string,
  key: string,
  value: unknown,
  opts?: { userId?: string | null; skipChangeLog?: boolean }
): Promise<void> {
  const json = JSON.stringify(value);
  await new AppSettingsRepository(tenantId).upsertKey(client, key, json);
  if (!opts?.skipChangeLog) {
    const { recordAppSettingChangeLog } = await import('./appStateBulkMutationService.js');
    await recordAppSettingChangeLog(client, tenantId, key, 'update', opts?.userId);
  }
}

export async function bulkUpsertSettings(
  client: pg.PoolClient,
  tenantId: string,
  settings: Record<string, unknown>,
  userId?: string | null
): Promise<void> {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) continue;
    await upsertSetting(client, tenantId, key, value, { skipChangeLog: true });
    keys.push(key);
  }
  if (keys.length > 0) {
    const { recordBulkAppSettingsChangeLog } = await import('./appStateBulkMutationService.js');
    await recordBulkAppSettingsChangeLog(client, tenantId, keys, userId);
  }
}

export async function deleteSetting(
  client: pg.PoolClient,
  tenantId: string,
  key: string,
  userId?: string | null
): Promise<boolean> {
  const ok = await new AppSettingsRepository(tenantId).deleteKey(client, key);
  if (ok) {
    const { recordAppSettingChangeLog } = await import('./appStateBulkMutationService.js');
    await recordAppSettingChangeLog(client, tenantId, key, 'delete', userId);
  }
  return ok;
}
