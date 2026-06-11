import crypto from 'node:crypto';
import type pg from 'pg';
import { getPool } from '../../../db/pool.js';

export type ModuleKey = 'real_estate' | 'rental';

export const DEFAULT_LICENSE_MODULES: ModuleKey[] = ['real_estate', 'rental'];

export type TenantLicenseRow = {
  id: string;
  license_type: string;
  license_status: string;
  trial_start_date: Date | string | null;
  license_expiry_date: Date | string | null;
  max_users?: number;
  max_projects?: number;
};

export class AdminLicenseRepository {
  async getTenantById(tenantId: string): Promise<TenantLicenseRow | null> {
    const pool = getPool();
    const { rows } = await pool.query(`SELECT * FROM tenants WHERE id = $1`, [tenantId]);
    return (rows[0] as TenantLicenseRow | undefined) ?? null;
  }

  async tenantExists(tenantId: string): Promise<boolean> {
    const pool = getPool();
    const { rows } = await pool.query(`SELECT id FROM tenants WHERE id = $1`, [tenantId]);
    return rows.length > 0;
  }

  async markLicenseExpired(tenantId: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE tenants SET license_status = 'expired', updated_at = NOW() WHERE id = $1`,
      [tenantId]
    );
  }

  async getActiveModuleKeys(tenantId: string): Promise<string[]> {
    const pool = getPool();
    const { rows } = await pool.query<{ module_key: string }>(
      `SELECT module_key FROM tenant_modules WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId]
    );
    return rows.map((m) => m.module_key);
  }

  async getTenantLicenseSummary(
    tenantId: string
  ): Promise<{ license_type: string; license_status: string } | null> {
    const pool = getPool();
    const { rows } = await pool.query<{ license_type: string; license_status: string }>(
      `SELECT license_type, license_status FROM tenants WHERE id = $1`,
      [tenantId]
    );
    return rows[0] ?? null;
  }

  async upsertTenantModule(
    tenantId: string,
    moduleKey: string,
    status: string,
    expiresAt: Date | null
  ): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO tenant_modules (tenant_id, module_key, status, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tenant_id, module_key)
       DO UPDATE SET status = EXCLUDED.status,
                     expires_at = EXCLUDED.expires_at,
                     updated_at = NOW()`,
      [tenantId, moduleKey, status, expiresAt]
    );
  }

  async getTenantLimits(tenantId: string): Promise<{ max_users: number; max_projects: number } | null> {
    const pool = getPool();
    const { rows } = await pool.query<{ max_users: number; max_projects: number }>(
      `SELECT max_users, max_projects FROM tenants WHERE id = $1`,
      [tenantId]
    );
    return rows[0] ?? null;
  }

  async renewTenantLicense(
    tenantId: string,
    licenseType: 'monthly' | 'yearly',
    expiryDate: Date,
    now: Date
  ): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE tenants
       SET license_type = $1,
           license_status = 'active',
           license_expiry_date = $2,
           last_renewal_date = $3,
           next_renewal_date = $2,
           updated_at = NOW()
       WHERE id = $4`,
      [licenseType, expiryDate, now, tenantId]
    );
  }

  async insertTrialTenant(input: {
    tenantId: string;
    name: string;
    companyName: string;
    email: string;
    phone: string | null;
    address: string | null;
    now: Date;
    isSupplier: boolean;
  }): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO tenants (
        id, name, company_name, email, phone, address,
        license_type, license_status, trial_start_date, is_supplier
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.tenantId,
        input.name,
        input.companyName,
        input.email,
        input.phone,
        input.address,
        'trial',
        'active',
        input.now,
        input.isSupplier,
      ]
    );
  }

  async logLicenseHistory(
    tenantId: string,
    licenseKeyId: string | null,
    action: string,
    data: {
      from_status?: string | null;
      to_status?: string | null;
      from_type?: string | null;
      to_type?: string | null;
      module_key?: string;
      status?: string;
      expires_at?: Date | null;
    },
    paymentId?: string
  ): Promise<string> {
    const historyId = `history_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const pool = getPool();
    await pool.query(
      `INSERT INTO license_history (
        id, tenant_id, license_key_id, action, from_status, to_status, from_type, to_type, payment_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        historyId,
        tenantId,
        licenseKeyId,
        action,
        data.from_status ?? null,
        data.to_status ?? null,
        data.from_type ?? null,
        data.to_type ?? null,
        paymentId ?? null,
      ]
    );
    return historyId;
  }

  async listLicenseKeys(filters: {
    status?: string;
    licenseType?: string;
    tenantId?: string;
  }): Promise<unknown[]> {
    const pool = getPool();
    let query = `
      SELECT lk.*, t.name as tenant_name, t.company_name, t.email as tenant_email
      FROM license_keys lk
      LEFT JOIN tenants t ON lk.tenant_id = t.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      query += ` AND lk.status = $${paramIndex++}`;
      params.push(filters.status);
    }
    if (filters.licenseType) {
      query += ` AND lk.license_type = $${paramIndex++}`;
      params.push(filters.licenseType);
    }
    if (filters.tenantId) {
      query += ` AND lk.tenant_id = $${paramIndex++}`;
      params.push(filters.tenantId);
    }

    query += ' ORDER BY lk.created_at DESC';
    const { rows } = await pool.query(query, params);
    return rows;
  }

  async listLicenseHistory(tenantId: string): Promise<unknown[]> {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT * FROM license_history WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return rows;
  }

  async revokeLicenseKey(licenseKeyId: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE license_keys SET status = 'revoked', updated_at = NOW() WHERE id = $1`,
      [licenseKeyId]
    );
  }

  async applyManualLicenseUpdate(
    client: pg.PoolClient,
    tenantId: string,
    licenseType: 'monthly' | 'yearly',
    expiryDate: Date,
    now: Date
  ): Promise<void> {
    await client.query(
      `UPDATE tenants
       SET license_type = $1,
           license_status = 'active',
           license_expiry_date = $2,
           last_renewal_date = $3,
           next_renewal_date = $2,
           updated_at = NOW()
       WHERE id = $4`,
      [licenseType, expiryDate, now, tenantId]
    );
  }

  async insertManualLicenseHistory(
    historyId: string,
    tenantId: string,
    fromStatus: string,
    fromType: string,
    licenseType: string
  ): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO license_history (
        id, tenant_id, action, from_status, to_status, from_type, to_type, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        historyId,
        tenantId,
        'manual_license_applied',
        fromStatus,
        'active',
        fromType,
        licenseType,
      ]
    );
  }
}

export class AdminUserRepository {
  async getById(adminId: string): Promise<{ id: string; email: string; name: string } | null> {
    const pool = getPool();
    const { rows } = await pool.query<{ id: string; email: string; name: string }>(
      `SELECT id, email, name FROM admin_users WHERE id = $1`,
      [adminId]
    );
    return rows[0] ?? null;
  }
}
