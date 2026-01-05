import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { LicenseService } from '../../services/licenseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// Get current tenant info (for authenticated tenant)
router.get('/me', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenants = await db.query(
      'SELECT id, name, company_name, email, license_type, license_status, license_expiry_date, trial_start_date FROM tenants WHERE id = $1',
      [req.tenantId]
    );
    
    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    res.json(tenants[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tenant info' });
  }
});

// Activate license
router.post('/activate-license', async (req: TenantRequest, res) => {
  try {
    const { licenseKey, deviceId } = req.body;
    const tenantId = req.tenantId!;

    const db = getDb();
    const licenseService = new LicenseService(db);
    const success = await licenseService.activateLicense(tenantId, licenseKey, deviceId);
    
    if (success) {
      const licenseInfo = await licenseService.checkLicenseStatus(tenantId);
      res.json({
        success: true,
        licenseInfo
      });
    } else {
      res.status(400).json({ error: 'Invalid license key' });
    }
  } catch (error) {
    console.error('License activation error:', error);
    res.status(500).json({ error: 'License activation failed' });
  }
});

// Check license status
router.get('/license-status', async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const db = getDb();
    const licenseService = new LicenseService(db);
    const licenseInfo = await licenseService.checkLicenseStatus(tenantId);
    res.json(licenseInfo);
  } catch (error) {
    console.error('License status check error:', error);
    res.status(500).json({ error: 'Failed to check license status' });
  }
});

// Renew license
router.post('/renew-license', async (req: TenantRequest, res) => {
  try {
    const { licenseType } = req.body; // 'monthly' or 'yearly'
    const tenantId = req.tenantId!;

    if (!['monthly', 'yearly'].includes(licenseType)) {
      return res.status(400).json({ error: 'Invalid license type' });
    }

    const db = getDb();
    const licenseService = new LicenseService(db);
    const success = await licenseService.renewLicense(tenantId, licenseType);
    
    if (success) {
      const licenseInfo = await licenseService.checkLicenseStatus(tenantId);
      res.json({
        success: true,
        licenseInfo
      });
    } else {
      res.status(400).json({ error: 'License renewal failed' });
    }
  } catch (error) {
    console.error('License renewal error:', error);
    res.status(500).json({ error: 'License renewal failed' });
  }
});

// Get total user count for the organization (including admin and all users)
router.get('/user-count', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    
    // Count all users for this tenant (including inactive users and admin)
    const result = await db.query(
      'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1',
      [tenantId]
    );
    
    const totalUsers = parseInt(result[0]?.count || '0', 10);
    
    res.json({ totalUsers });
  } catch (error) {
    console.error('Error fetching user count:', error);
    res.status(500).json({ error: 'Failed to fetch user count' });
  }
});

export default router;

