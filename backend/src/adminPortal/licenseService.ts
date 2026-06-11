// @ts-nocheck
import crypto from 'crypto';
import {
  AdminLicenseRepository,
  DEFAULT_LICENSE_MODULES,
  type ModuleKey,
} from '../../modules/admin-portal/repositories/AdminPortalRepository.js';

export type { ModuleKey };
export { DEFAULT_LICENSE_MODULES };

export interface TenantModule {
  id: string;
  tenantId: string;
  moduleKey: ModuleKey;
  status: 'active' | 'expired' | 'suspended' | 'inactive';
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

const licenseRepo = new AdminLicenseRepository();

/** @deprecated Use AdminLicenseRepository via LicenseService — kept for admin portal routes. */
export class LicenseService {
  private repo = licenseRepo;

  constructor(_db?: unknown) {
    /* db param ignored — repository uses shared pool */
  }

  async checkLicenseStatus(tenantId: string): Promise<LicenseInfo> {
    const tenant = await this.repo.getTenantById(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const now = new Date();

    if (tenant.license_type === 'trial' && tenant.trial_start_date) {
      const trialEnd = new Date(tenant.trial_start_date);
      trialEnd.setDate(trialEnd.getDate() + 30);

      if (now > trialEnd) {
        await this.repo.markLicenseExpired(tenantId);
        await this.repo.logLicenseHistory(tenantId, null, 'trial_expired', {
          from_status: 'active',
          to_status: 'expired',
        });

        return {
          licenseType: 'trial',
          licenseStatus: 'expired',
          expiryDate: trialEnd,
          daysRemaining: 0,
          isExpired: true,
        };
      }

      const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        licenseType: 'trial',
        licenseStatus: 'active',
        expiryDate: trialEnd,
        daysRemaining,
        isExpired: false,
      };
    }

    if (tenant.license_expiry_date) {
      const expiryDate = new Date(tenant.license_expiry_date);

      if (now > expiryDate) {
        await this.repo.markLicenseExpired(tenantId);
        await this.repo.logLicenseHistory(tenantId, null, 'license_expired', {
          from_status: 'active',
          to_status: 'expired',
        });

        return {
          licenseType: tenant.license_type as LicenseInfo['licenseType'],
          licenseStatus: 'expired',
          expiryDate,
          daysRemaining: 0,
          isExpired: true,
        };
      }

      const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        licenseType: tenant.license_type as LicenseInfo['licenseType'],
        licenseStatus: tenant.license_status as LicenseInfo['licenseStatus'],
        expiryDate,
        daysRemaining,
        isExpired: false,
      };
    }

    return {
      licenseType: tenant.license_type as LicenseInfo['licenseType'],
      licenseStatus: tenant.license_status as LicenseInfo['licenseStatus'],
      expiryDate: null,
      daysRemaining: Infinity,
      isExpired: false,
    };
  }

  async isModuleEnabled(tenantId: string, moduleKey: string): Promise<boolean> {
    const modules = await this.repo.getActiveModuleKeys(tenantId);
    const active = modules.filter((key) => DEFAULT_LICENSE_MODULES.includes(key as ModuleKey));
    if (active.some((key) => key === moduleKey)) return true;

    const allModules = await this.getTenantModules(tenantId);
    return allModules.includes(moduleKey);
  }

  async getTenantModules(tenantId: string): Promise<string[]> {
    const fromDb = (await this.repo.getActiveModuleKeys(tenantId)).filter((key) =>
      DEFAULT_LICENSE_MODULES.includes(key as ModuleKey)
    );
    if (fromDb.length > 0) return fromDb;

    const tenant = await this.repo.getTenantLicenseSummary(tenantId);
    if (!tenant) return [];
    const paidActive =
      (tenant.license_type === 'yearly' ||
        tenant.license_type === 'monthly' ||
        tenant.license_type === 'perpetual') &&
      tenant.license_status === 'active';
    if (paidActive) return [...DEFAULT_LICENSE_MODULES];
    return [];
  }

  async updateTenantModule(
    tenantId: string,
    moduleKey: string,
    status: 'active' | 'expired' | 'suspended' | 'inactive',
    expiresAt?: Date | null
  ): Promise<void> {
    if (!DEFAULT_LICENSE_MODULES.includes(moduleKey as ModuleKey)) {
      throw new Error(`Unknown or removed module: ${moduleKey}`);
    }

    await this.repo.upsertTenantModule(tenantId, moduleKey, status, expiresAt ?? null);
    await this.repo.logLicenseHistory(tenantId, null, 'module_updated', {
      module_key: moduleKey,
      status,
      expires_at: expiresAt ?? null,
    });
  }

  async getTenantLimits(tenantId: string): Promise<{ maxUsers: number; maxProjects: number }> {
    const row = await this.repo.getTenantLimits(tenantId);
    if (!row) {
      return { maxUsers: 1, maxProjects: 10 };
    }
    return {
      maxUsers: row.max_users || 1,
      maxProjects: row.max_projects || 10,
    };
  }

  async renewLicense(tenantId: string, licenseType: 'monthly' | 'yearly'): Promise<boolean> {
    return this.renewLicenseWithPayment(tenantId, licenseType);
  }

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

    await this.repo.renewTenantLicense(tenantId, licenseType, expiryDate, now);

    const currentStatus = await this.checkLicenseStatus(tenantId);
    const fromStatus = currentStatus.isExpired ? 'expired' : currentStatus.licenseStatus;

    await this.repo.logLicenseHistory(
      tenantId,
      null,
      'license_renewed',
      {
        from_status: fromStatus,
        to_status: 'active',
        from_type: currentStatus.licenseType,
        to_type: licenseType,
      },
      paymentId
    );

    return true;
  }

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

    await this.repo.insertTrialTenant({
      tenantId,
      name: data.name,
      companyName: data.companyName,
      email: data.email,
      phone: data.phone || null,
      address: data.address || null,
      now,
      isSupplier: data.isSupplier || false,
    });

    await this.repo.logLicenseHistory(tenantId, null, 'trial_started', {
      to_status: 'active',
      to_type: 'trial',
    });

    return {
      tenantId,
      daysRemaining: 30,
    };
  }
}
