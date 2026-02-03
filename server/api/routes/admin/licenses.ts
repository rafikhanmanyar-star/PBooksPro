import { Router } from 'express';
import { AdminRequest } from '../../../middleware/adminAuthMiddleware.js';
import { getDatabaseService } from '../../../services/databaseService.js';
import { LicenseService } from '../../../services/licenseService.js';

const router = Router();
const getDb = () => getDatabaseService();

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

// Apply manual license
router.post('/apply-manual', async (req: AdminRequest, res) => {
  try {
    const { tenantId, licenseType } = req.body;

    if (!tenantId || !['monthly', 'yearly'].includes(licenseType)) {
      return res.status(400).json({ error: 'Tenant ID and valid license type (monthly/yearly) are required' });
    }

    const db = getDb();
    const licenseService = new LicenseService(db);

    // Check if tenant exists
    const tenants = await db.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const now = new Date();
    let expiryDate = new Date(now);

    if (licenseType === 'monthly') {
      expiryDate.setMonth(expiryDate.getMonth() + 1);
    } else {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    }

    await db.query(
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

    // Get current license status to determine from_status for history
    const currentStatus = await licenseService.checkLicenseStatus(tenantId);

    // Log history
    const historyId = `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await db.query(
      `INSERT INTO license_history (
        id, tenant_id, action, from_status, to_status, from_type, to_type, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        historyId,
        tenantId,
        'manual_license_applied',
        currentStatus.licenseStatus,
        'active',
        currentStatus.licenseType,
        licenseType
      ]
    );

    res.json({ success: true, message: `Manual ${licenseType} license applied successfully`, expiryDate });
  } catch (error) {
    console.error('Error applying manual license:', error);
    res.status(500).json({ error: 'Failed to apply manual license' });
  }
});

export default router;

