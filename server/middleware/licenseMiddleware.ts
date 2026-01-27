import { Request, Response, NextFunction } from 'express';
import { TenantRequest } from './tenantMiddleware.js';
import { LicenseService } from '../services/licenseService.js';
import { getDatabaseService } from '../services/databaseService.js';

export function licenseMiddleware() {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDatabaseService();
      const licenseService = new LicenseService(db);
      
      if (!req.tenantId) {
        return res.status(401).json({ error: 'No tenant context' });
      }

      // Check license status
      const licenseInfo = await licenseService.checkLicenseStatus(req.tenantId);

      // Block access if expired
      if (licenseInfo.isExpired || licenseInfo.licenseStatus === 'expired') {
        return res.status(403).json({
          error: 'License expired',
          licenseInfo,
          message: 'Your trial period or license has expired. Please renew to continue using the application.'
        });
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
    } catch (error) {
      console.error('License middleware error:', error);
      res.status(500).json({ error: 'License check failed' });
    }
  };
}

