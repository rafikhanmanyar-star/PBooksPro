import type pg from 'pg';
import { AppSettingsRepository } from '../modules/app-settings/repositories/AppSettingsRepository.js';

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
  await client.query(
    `INSERT INTO app_settings (tenant_id, key, value, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [tenantId, key, json]
  );
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
  const r = await client.query(`DELETE FROM app_settings WHERE tenant_id = $1 AND key = $2`, [
    tenantId,
    key,
  ]);
  const ok = (r.rowCount ?? 0) > 0;
  if (ok) {
    const { recordAppSettingChangeLog } = await import('./appStateBulkMutationService.js');
    await recordAppSettingChangeLog(client, tenantId, key, 'delete', userId);
  }
  return ok;
}
