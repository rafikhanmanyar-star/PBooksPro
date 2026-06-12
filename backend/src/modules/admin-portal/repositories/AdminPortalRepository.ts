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
  private pool = () => getPool();

  async getById(adminId: string): Promise<{ id: string; email: string; name: string } | null> {
    const { rows } = await this.pool().query<{ id: string; email: string; name: string }>(
      `SELECT id, email, name FROM admin_users WHERE id = $1`,
      [adminId]
    );
    return rows[0] ?? null;
  }

  async findActiveByUsername(username: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.pool().query(
      `SELECT * FROM admin_users WHERE username = $1 AND is_active = TRUE`,
      [username]
    );
    return (rows[0] as Record<string, unknown> | undefined) ?? null;
  }

  async updateLastLogin(adminId: string): Promise<void> {
    await this.pool().query(`UPDATE admin_users SET last_login = NOW() WHERE id = $1`, [adminId]);
  }

  async getPublicProfile(adminId: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.pool().query(
      `SELECT id, username, name, email, role, last_login FROM admin_users WHERE id = $1`,
      [adminId]
    );
    return (rows[0] as Record<string, unknown> | undefined) ?? null;
  }

  async listAdmins(filters: {
    search?: string;
    role?: string;
    isActive?: boolean;
  }): Promise<unknown[]> {
    let query =
      'SELECT id, username, name, email, role, is_active, last_login, created_at FROM admin_users WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.search) {
      query += ` AND (username ILIKE $${paramIndex} OR name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }
    if (filters.role) {
      query += ` AND role = $${paramIndex++}`;
      params.push(filters.role);
    }
    if (filters.isActive !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(filters.isActive);
    }

    query += ' ORDER BY created_at DESC';
    const { rows } = await this.pool().query(query, params);
    return rows;
  }

  async getPublicById(id: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.pool().query(
      `SELECT id, username, name, email, role, is_active, last_login, created_at FROM admin_users WHERE id = $1`,
      [id]
    );
    return (rows[0] as Record<string, unknown> | undefined) ?? null;
  }

  async exists(id: string): Promise<boolean> {
    const { rows } = await this.pool().query(`SELECT id FROM admin_users WHERE id = $1`, [id]);
    return rows.length > 0;
  }

  async usernameTaken(username: string, excludeId?: string): Promise<boolean> {
    const { rows } = excludeId
      ? await this.pool().query(
          `SELECT id FROM admin_users WHERE username = $1 AND id != $2`,
          [username, excludeId]
        )
      : await this.pool().query(`SELECT id FROM admin_users WHERE username = $1`, [username]);
    return rows.length > 0;
  }

  async emailTaken(email: string, excludeId?: string): Promise<boolean> {
    const { rows } = excludeId
      ? await this.pool().query(`SELECT id FROM admin_users WHERE email = $1 AND id != $2`, [
          email,
          excludeId,
        ])
      : await this.pool().query(`SELECT id FROM admin_users WHERE email = $1`, [email]);
    return rows.length > 0;
  }

  async createAdmin(input: {
    id: string;
    username: string;
    name: string;
    email: string;
    passwordHash: string;
    role: string;
  }): Promise<void> {
    await this.pool().query(
      `INSERT INTO admin_users (id, username, name, email, password, role)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.id, input.username, input.name, input.email, input.passwordHash, input.role]
    );
  }

  async updateAdminDynamic(id: string, setClause: string, params: unknown[]): Promise<void> {
    await this.pool().query(`UPDATE admin_users SET ${setClause} WHERE id = $${params.length}`, params);
  }

  async deleteAdmin(id: string): Promise<void> {
    await this.pool().query(`DELETE FROM admin_users WHERE id = $1`, [id]);
  }

  async upsertBootstrapAdmin(input: {
    id: string;
    username: string;
    name: string;
    email: string;
    passwordHash: string;
    role: string;
  }): Promise<void> {
    await this.pool().query(
      `INSERT INTO admin_users (id, username, name, email, password, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), NOW())
       ON CONFLICT (username) DO UPDATE
       SET password = EXCLUDED.password, is_active = TRUE, updated_at = NOW()`,
      [input.id, input.username, input.name, input.email, input.passwordHash, input.role]
    );
  }
}
