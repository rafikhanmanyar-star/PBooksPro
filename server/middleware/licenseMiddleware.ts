import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { TenantRequest } from './tenantMiddleware.js';
import { LicenseInfo } from '../services/licenseService.js';

/**
 * License middleware - checks tenant license status before allowing API access.
 * 
 * IMPORTANT: This middleware runs INSIDE runWithTenantContext (from tenantMiddleware's next()),
 * so DatabaseService.query() would wrap every query in BEGIN/SET LOCAL/COMMIT transactions.
 * Since the license check only queries the `tenants` table (excluded from RLS), we bypass
 * the DatabaseService entirely and use pool.query() directly. This prevents connection pool
 * exhaustion when many concurrent requests arrive after login.
 */
export function licenseMiddleware(pool: Pool) {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        return res.status(401).json({ error: 'No tenant context' });
      }

      // Query tenants table directly via pool (bypasses tenant context / RLS wrapping)
      // The tenants table is excluded from RLS, so no SET LOCAL is needed.
      const result = await pool.query(
        'SELECT license_type, license_status, trial_start_date, license_expiry_date FROM tenants WHERE id = $1',
        [req.tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Tenant not found' });
      }

      const tenant = result.rows[0];
      const now = new Date();
      let licenseInfo: LicenseInfo;

      // Check if trial expired
      if (tenant.license_type === 'trial' && tenant.trial_start_date) {
        const trialEnd = new Date(tenant.trial_start_date);
        trialEnd.setDate(trialEnd.getDate() + 30); // 30-day trial

        if (now > trialEnd) {
          // Trial expired - update status (fire-and-forget, don't block the response)
          pool.query(
            `UPDATE tenants SET license_status = 'expired', updated_at = NOW() WHERE id = $1`,
            [req.tenantId]
          ).catch(err => console.error('Failed to update expired trial status:', err));

          return res.status(403).json({
            error: 'License expired',
            licenseInfo: {
              licenseType: 'trial',
              licenseStatus: 'expired',
              expiryDate: trialEnd,
              daysRemaining: 0,
              isExpired: true
            },
            message: 'Your trial period has expired. Please renew to continue using the application.'
          });
        }

        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        licenseInfo = {
          licenseType: 'trial',
          licenseStatus: 'active',
          expiryDate: trialEnd,
          daysRemaining,
          isExpired: false
        };
      } else if (tenant.license_expiry_date) {
        // Check if license expired
        const expiryDate = new Date(tenant.license_expiry_date);

        if (now > expiryDate) {
          // License expired - update status (fire-and-forget)
          pool.query(
            `UPDATE tenants SET license_status = 'expired', updated_at = NOW() WHERE id = $1`,
            [req.tenantId]
          ).catch(err => console.error('Failed to update expired license status:', err));

          return res.status(403).json({
            error: 'License expired',
            licenseInfo: {
              licenseType: tenant.license_type,
              licenseStatus: 'expired',
              expiryDate,
              daysRemaining: 0,
              isExpired: true
            },
            message: 'Your license has expired. Please renew to continue using the application.'
          });
        }

        const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        licenseInfo = {
          licenseType: tenant.license_type,
          licenseStatus: tenant.license_status,
          expiryDate,
          daysRemaining,
          isExpired: false
        };
      } else {
        // Perpetual license
        licenseInfo = {
          licenseType: tenant.license_type,
          licenseStatus: tenant.license_status,
          expiryDate: null,
          daysRemaining: Infinity,
          isExpired: false
        };
      }

      // Block if suspended
      if (licenseInfo.licenseStatus === 'suspended') {
        return res.status(403).json({
          error: 'License suspended',
          licenseInfo,
          message: 'Your license has been suspended. Please contact support.'
        });
      }

      // Add license info to request
      (req as any).licenseInfo = licenseInfo;

      next();
    } catch (error: any) {
      console.error('License middleware error:', error?.message || error);
      res.status(500).json({ error: 'License check failed', message: error?.message || 'Internal error' });
    }
  };
}

/**
 * Middleware to require a specific module to be enabled.
 * Uses pool.query() directly to avoid tenant context wrapping overhead.
 */
export function requireModule(pool: Pool, moduleKey: string) {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) {
        return res.status(401).json({ error: 'No tenant context' });
      }

      // Query tenant_modules directly via pool
      const result = await pool.query(
        "SELECT status FROM tenant_modules WHERE tenant_id = $1 AND module_key = $2 AND status = 'active'",
        [req.tenantId, moduleKey]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({
          error: 'Module not enabled',
          moduleKey,
          message: `The ${moduleKey} module is not part of your current subscription. Please enable it in the admin portal.`
        });
      }

      next();
    } catch (error: any) {
      console.error('Module requirement check failed:', error?.message || error);
      res.status(500).json({ error: 'Module authorization check failed' });
    }
  };
}

