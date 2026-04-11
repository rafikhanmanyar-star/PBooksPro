import type pg from 'pg';

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
  const r = await client.query<{ key: string; value: unknown }>(
    `SELECT key, value FROM app_settings WHERE tenant_id = $1 ORDER BY key`,
    [tenantId]
  );
  const out: Record<string, unknown> = {};
  for (const row of r.rows) {
    out[row.key] = row.value;
  }
  return out;
}

export async function getSettingByKey(
  client: pg.PoolClient,
  tenantId: string,
  key: string
): Promise<unknown | null> {
  const r = await client.query<{ value: unknown }>(
    `SELECT value FROM app_settings WHERE tenant_id = $1 AND key = $2`,
    [tenantId, key]
  );
  return r.rows[0]?.value ?? null;
}

export async function upsertSetting(
  client: pg.PoolClient,
  tenantId: string,
  key: string,
  value: unknown
): Promise<void> {
  const json = JSON.stringify(value);
  await client.query(
    `INSERT INTO app_settings (tenant_id, key, value, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [tenantId, key, json]
  );
}

export async function bulkUpsertSettings(
  client: pg.PoolClient,
  tenantId: string,
  settings: Record<string, unknown>
): Promise<void> {
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) continue;
    await upsertSetting(client, tenantId, key, value);
  }
}

export async function deleteSetting(
  client: pg.PoolClient,
  tenantId: string,
  key: string
): Promise<boolean> {
  const r = await client.query(`DELETE FROM app_settings WHERE tenant_id = $1 AND key = $2`, [
    tenantId,
    key,
  ]);
  return (r.rowCount ?? 0) > 0;
}
