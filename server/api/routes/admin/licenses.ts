import { Router } from 'express';
import { AdminRequest } from '../../../middleware/adminAuthMiddleware.js';
import { getDatabaseService } from '../../../services/databaseService.js';
import { LicenseService } from '../../../services/licenseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// Generate license key (admin only)
router.post('/generate', async (req: AdminRequest, res) => {
  try {
    const { tenantId, licenseType, deviceId } = req.body;
    
    if (!['monthly', 'yearly', 'perpetual'].includes(licenseType)) {
      return res.status(400).json({ error: 'Invalid license type' });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const db = getDb();
    const licenseService = new LicenseService(db);
    const licenseKey = await licenseService.generateLicenseKey(
      tenantId,
      licenseType,
      deviceId
    );

    res.json({
      success: true,
      licenseKey,
      licenseType,
      message: 'License key generated successfully'
    });
  } catch (error) {
    console.error('Error generating license:', error);
    res.status(500).json({ error: 'Failed to generate license key' });
  }
});

// List all licenses
router.get('/', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const { status, licenseType, tenantId } = req.query;
    
    let query = `
      SELECT lk.*, t.name as tenant_name, t.company_name, t.email as tenant_email
      FROM license_keys lk
      LEFT JOIN tenants t ON lk.tenant_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND lk.status = $${paramIndex++}`;
      params.push(status);
    }
    if (licenseType) {
      query += ` AND lk.license_type = $${paramIndex++}`;
      params.push(licenseType);
    }
    if (tenantId) {
      query += ` AND lk.tenant_id = $${paramIndex++}`;
      params.push(tenantId);
    }

    query += ' ORDER BY lk.created_at DESC';

    const licenses = await db.query(query, params);
    res.json(licenses);
  } catch (error) {
    console.error('Error fetching licenses:', error);
    res.status(500).json({ error: 'Failed to fetch licenses' });
  }
});

// Get license history for tenant
router.get('/tenant/:tenantId/history', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const history = await db.query(
      `SELECT * FROM license_history 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC`,
      [req.params.tenantId]
    );
    res.json(history);
  } catch (error) {
    console.error('Error fetching license history:', error);
    res.status(500).json({ error: 'Failed to fetch license history' });
  }
});

// Revoke license
router.post('/:id/revoke', async (req: AdminRequest, res) => {
  try {
    await getDb().query(
      `UPDATE license_keys 
       SET status = 'revoked', updated_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );
    
    res.json({ success: true, message: 'License revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke license' });
  }
});

export default router;

