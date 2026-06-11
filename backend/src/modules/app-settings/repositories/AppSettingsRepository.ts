import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type AppSettingRow = {
  tenant_id: string;
  key: string;
  value: unknown;
  updated_at: Date;
};

export class AppSettingsRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async listAll(client: pg.PoolClient): Promise<AppSettingRow[]> {
    const r = await client.query<AppSettingRow>(
      `SELECT tenant_id, key, value, updated_at
       FROM app_settings WHERE tenant_id = $1 ORDER BY key`,
      [this.tenantId]
    );
    return r.rows;
  }

  async getByKey(client: pg.PoolClient, key: string): Promise<AppSettingRow | null> {
    const r = await client.query<AppSettingRow>(
      `SELECT tenant_id, key, value, updated_at
       FROM app_settings WHERE tenant_id = $1 AND key = $2`,
      [this.tenantId, key]
    );
    return r.rows[0] ?? null;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<AppSettingRow[]> {
    const r = await client.query<AppSettingRow>(
      `SELECT tenant_id, key, value, updated_at
       FROM app_settings WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async upsertKey(client: pg.PoolClient, key: string, jsonValue: string): Promise<void> {
    await client.query(
      `INSERT INTO app_settings (tenant_id, key, value, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [this.tenantId, key, jsonValue]
    );
  }

  async deleteKey(client: pg.PoolClient, key: string): Promise<boolean> {
    const r = await client.query(
      `DELETE FROM app_settings WHERE tenant_id = $1 AND key = $2`,
      [this.tenantId, key]
    );
    return (r.rowCount ?? 0) > 0;
  }
}
