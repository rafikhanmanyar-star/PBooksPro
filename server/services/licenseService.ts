import crypto from 'crypto';
import { DatabaseService } from './databaseService.js';

const SECRET_SALT = process.env.LICENSE_SECRET_SALT || 'PBOOKSPRO_SECURE_SALT_2024';

export type ModuleKey = 'real_estate' | 'rental' | 'tasks' | 'biz_planet' | 'shop';

export interface TenantModule {
  id: string;
  tenantId: string;
  moduleKey: ModuleKey;
  status: 'active' | 'expired' | 'suspended';
  activatedAt: Date;
  expiresAt: Date | null;
  settings: any;
}

export interface LicenseInfo {
  licenseType: 'trial' | 'monthly' | 'yearly' | 'perpetual';
  licenseStatus: 'active' | 'expired' | 'suspended' | 'cancelled';
  expiryDate: Date | null;
  daysRemaining: number;
  isExpired: boolean;
}

export class LicenseService {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  /**
   * Check and update license status
   */
  async checkLicenseStatus(tenantId: string): Promise<LicenseInfo> {
    const tenants = await this.db.query(
      'SELECT * FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (tenants.length === 0) {
      throw new Error('Tenant not found');
    }

    const tenant = tenants[0];
    const now = new Date();

    // Check if trial expired
    if (tenant.license_type === 'trial' && tenant.trial_start_date) {
      const trialEnd = new Date(tenant.trial_start_date);
      trialEnd.setDate(trialEnd.getDate() + 30); // 30-day trial

      if (now > trialEnd) {
        // Trial expired
        await this.db.query(
          `UPDATE tenants 
           SET license_status = 'expired', updated_at = NOW()
           WHERE id = $1`,
          [tenantId]
        );

        await this.logLicenseHistory(tenantId, null, 'trial_expired', {
          from_status: 'active',
          to_status: 'expired'
        });

        return {
          licenseType: 'trial',
          licenseStatus: 'expired',
          expiryDate: trialEnd,
          daysRemaining: 0,
          isExpired: true
        };
      }

      const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        licenseType: 'trial',
        licenseStatus: 'active',
        expiryDate: trialEnd,
        daysRemaining,
        isExpired: false
      };
    }

    // Check if license expired
    if (tenant.license_expiry_date) {
      const expiryDate = new Date(tenant.license_expiry_date);

      if (now > expiryDate) {
        // License expired
        await this.db.query(
          `UPDATE tenants 
           SET license_status = 'expired', updated_at = NOW()
           WHERE id = $1`,
          [tenantId]
        );

        await this.logLicenseHistory(tenantId, null, 'license_expired', {
          from_status: 'active',
          to_status: 'expired'
        });

        return {
          licenseType: tenant.license_type as any,
          licenseStatus: 'expired',
          expiryDate,
          daysRemaining: 0,
          isExpired: true
        };
      }

      const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        licenseType: tenant.license_type as any,
        licenseStatus: tenant.license_status as any,
        expiryDate,
        daysRemaining,
        isExpired: false
      };
    }

    // Perpetual license
    return {
      licenseType: tenant.license_type as any,
      licenseStatus: tenant.license_status as any,
      expiryDate: null,
      daysRemaining: Infinity,
      isExpired: false
    };
  }

  /**
   * Check if a specific module is enabled for a tenant
   */
  async isModuleEnabled(tenantId: string, moduleKey: string): Promise<boolean> {
    const modules = await this.db.query(
      "SELECT status FROM tenant_modules WHERE tenant_id = $1 AND module_key = $2 AND status = 'active'",
      [tenantId, moduleKey]
    );

    // Some modules might be part of the core license or trial
    // For now, only check the tenant_modules table
    return modules.length > 0;
  }

  /**
   * Get all active modules for a tenant
   */
  async getTenantModules(tenantId: string): Promise<string[]> {
    const modules = await this.db.query(
      "SELECT module_key FROM tenant_modules WHERE tenant_id = $1 AND status = 'active'",
      [tenantId]
    );
    return modules.map(m => m.module_key);
  }

  /**
   * Update or enable a module for a tenant
   */
  async updateTenantModule(
    tenantId: string,
    moduleKey: string,
    status: 'active' | 'expired' | 'suspended',
    expiresAt?: Date | null
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO tenant_modules (tenant_id, module_key, status, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tenant_id, module_key) 
       DO UPDATE SET status = EXCLUDED.status, 
                     expires_at = EXCLUDED.expires_at,
                     updated_at = NOW()`,
      [tenantId, moduleKey, status, expiresAt || null]
    );

    await this.logLicenseHistory(tenantId, null, 'module_updated', {
      module_key: moduleKey,
      status: status,
      expires_at: expiresAt
    });
  }

  /**
   * Get tenant limits (users, projects, etc.)
   */
  async getTenantLimits(tenantId: string): Promise<{ maxUsers: number; maxProjects: number }> {
    const tenants = await this.db.query(
      'SELECT max_users, max_projects FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (tenants.length === 0) {
      return { maxUsers: 1, maxProjects: 10 };
    }

    return {
      maxUsers: tenants[0].max_users || 1,
      maxProjects: tenants[0].max_projects || 10
    };
  }

  /**
   * Renew license
   */
  async renewLicense(tenantId: string, licenseType: 'monthly' | 'yearly'): Promise<boolean> {
    return this.renewLicenseWithPayment(tenantId, licenseType);
  }

  /**
   * Renew license with optional payment tracking
   */
  async renewLicenseWithPayment(
    tenantId: string,
    licenseType: 'monthly' | 'yearly',
    paymentId?: string
  ): Promise<boolean> {
    const now = new Date();
    let expiryDate = new Date(now);

    if (licenseType === 'monthly') {
      expiryDate.setMonth(expiryDate.getMonth() + 1);
    } else {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    }

    await this.db.query(
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

    // Get current license status to determine from_status
    const currentStatus = await this.checkLicenseStatus(tenantId);
    const fromStatus = currentStatus.isExpired ? 'expired' : currentStatus.licenseStatus;

    // Log history with payment link if provided
    const historyId = await this.logLicenseHistory(tenantId, null, 'license_renewed', {
      from_status: fromStatus,
      to_status: 'active',
      from_type: currentStatus.licenseType,
      to_type: licenseType
    }, paymentId);

    return true;
  }

  /**
   * Create new tenant with free trial
   */
  async createTenantWithTrial(data: {
    name: string;
    companyName: string;
    email: string;
    phone?: string;
    address?: string;
    isSupplier?: boolean;
  }): Promise<{ tenantId: string; daysRemaining: number }> {
    const tenantId = `tenant_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date();

    await this.db.query(
      `INSERT INTO tenants (
        id, name, company_name, email, phone, address,
        license_type, license_status, trial_start_date, is_supplier
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        tenantId,
        data.name,
        data.companyName,
        data.email,
        data.phone || null,
        data.address || null,
        'trial',
        'active',
        now,
        data.isSupplier || false
      ]
    );

    await this.logLicenseHistory(tenantId, null, 'trial_started', {
      to_status: 'active',
      to_type: 'trial'
    });

    return {
      tenantId,
      daysRemaining: 30
    };
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private async logLicenseHistory(
    tenantId: string,
    licenseKeyId: string | null,
    action: string,
    data: any,
    paymentId?: string
  ): Promise<string> {
    const historyId = `history_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await this.db.query(
      `INSERT INTO license_history (
        id, tenant_id, license_key_id, action, from_status, to_status, from_type, to_type, payment_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        historyId,
        tenantId,
        licenseKeyId,
        action,
        data.from_status || null,
        data.to_status || null,
        data.from_type || null,
        data.to_type || null,
        paymentId || null
      ]
    );
    return historyId;
  }
}

