import crypto from 'crypto';
import { DatabaseService } from './databaseService.js';

const SECRET_SALT = process.env.LICENSE_SECRET_SALT || 'PBOOKSPRO_SECURE_SALT_2024';

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
   * Generate a license key for a tenant
   */
  async generateLicenseKey(
    tenantId: string,
    licenseType: 'monthly' | 'yearly' | 'perpetual',
    deviceId?: string
  ): Promise<string> {
    // Generate random segment
    const randomSegment = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // Use tenant_id or device_id for checksum
    const identifier = deviceId || tenantId;
    const rawString = `${randomSegment}-${identifier}-${SECRET_SALT}`;
    const checksum = this.hashCode(rawString).toString(16).toUpperCase().slice(0, 4).padStart(4, '0');
    
    const licenseKey = `MA-${randomSegment}-${checksum}`;
    
    // Calculate expiry date
    let expiryDate: Date | null = null;
    if (licenseType === 'monthly') {
      expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 1);
    } else if (licenseType === 'yearly') {
      expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    }
    // perpetual: expiryDate remains null
    
    // Save license key to database
    const licenseKeyId = `license_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await this.db.query(
      `INSERT INTO license_keys (
        id, license_key, tenant_id, license_type, device_id, 
        expiry_date, status, is_used
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        licenseKeyId,
        licenseKey,
        tenantId,
        licenseType,
        deviceId || null,
        expiryDate,
        'pending',
        false
      ]
    );
    
    return licenseKey;
  }

  /**
   * Validate license key
   */
  validateLicenseKey(key: string, identifier: string): boolean {
    const parts = key.trim().toUpperCase().split('-');
    if (parts.length !== 3) return false;
    
    const [prefix, randomSegment, checksum] = parts;
    if (prefix !== 'MA') return false;
    
    const rawString = `${randomSegment}-${identifier}-${SECRET_SALT}`;
    const expectedChecksum = this.hashCode(rawString).toString(16).toUpperCase().slice(0, 4).padStart(4, '0');
    
    return checksum === expectedChecksum;
  }

  /**
   * Activate license for tenant
   */
  async activateLicense(tenantId: string, licenseKey: string, deviceId?: string): Promise<boolean> {
    // Find license key
    const licenses = await this.db.query(
      `SELECT * FROM license_keys 
       WHERE license_key = $1 AND (tenant_id IS NULL OR tenant_id = $2)`,
      [licenseKey, tenantId]
    );
    
    if (licenses.length === 0) return false;
    const license = licenses[0];
    
    // Validate checksum
    const identifier = deviceId || tenantId;
    if (!this.validateLicenseKey(licenseKey, identifier)) return false;
    
    // Check if already used
    if (license.is_used && license.tenant_id !== tenantId) return false;
    
    // Calculate dates
    const now = new Date();
    let expiryDate: Date | null = null;
    
    if (license.license_type === 'monthly') {
      expiryDate = new Date(now);
      expiryDate.setMonth(expiryDate.getMonth() + 1);
    } else if (license.license_type === 'yearly') {
      expiryDate = new Date(now);
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    }
    // perpetual: expiryDate remains null
    
    // Update tenant license
    await this.db.query(
      `UPDATE tenants 
       SET license_type = $1,
           license_status = 'active',
           license_key = $2,
           license_start_date = $3,
           license_expiry_date = $4,
           last_renewal_date = $3,
           next_renewal_date = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [license.license_type, licenseKey, now, expiryDate, tenantId]
    );
    
    // Update license key
    await this.db.query(
      `UPDATE license_keys 
       SET tenant_id = $1, 
           device_id = $2,
           activated_date = $3,
           status = 'active',
           is_used = TRUE
       WHERE id = $4`,
      [tenantId, deviceId || null, now, license.id]
    );
    
    // Log history
    await this.logLicenseHistory(tenantId, license.id, 'license_activated', {
      from_status: 'trial',
      to_status: 'active',
      from_type: 'trial',
      to_type: license.license_type
    });
    
    return true;
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
  }): Promise<{ tenantId: string; daysRemaining: number }> {
    const tenantId = `tenant_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date();
    
    await this.db.query(
      `INSERT INTO tenants (
        id, name, company_name, email, phone, address,
        license_type, license_status, trial_start_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        tenantId,
        data.name,
        data.companyName,
        data.email,
        data.phone || null,
        data.address || null,
        'trial',
        'active',
        now
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

