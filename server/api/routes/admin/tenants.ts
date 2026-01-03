import { Router } from 'express';
import { AdminRequest } from '../../../middleware/adminAuthMiddleware.js';
import { getDatabaseService } from '../../../services/databaseService.js';
import { LicenseService } from '../../../services/licenseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// List all tenants
router.get('/', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const { status, licenseType, search } = req.query;
    
    let query = 'SELECT * FROM tenants WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND license_status = $${paramIndex++}`;
      params.push(status);
    }
    if (licenseType) {
      query += ` AND license_type = $${paramIndex++}`;
      params.push(licenseType);
    }
    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR company_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    const tenants = await db.query(query, params);
    res.json(tenants);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

// Get tenant details
router.get('/:id', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const tenants = await db.query(
      'SELECT * FROM tenants WHERE id = $1',
      [req.params.id]
    );
    
    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    res.json(tenants[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tenant' });
  }
});

// Get tenant statistics
router.get('/:id/stats', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.params.id;
    
    const [userCount, transactionCount, accountCount, contactCount] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM users WHERE tenant_id = $1', [tenantId]),
      db.query('SELECT COUNT(*) as count FROM transactions WHERE tenant_id = $1', [tenantId]),
      db.query('SELECT COUNT(*) as count FROM accounts WHERE tenant_id = $1', [tenantId]),
      db.query('SELECT COUNT(*) as count FROM contacts WHERE tenant_id = $1', [tenantId])
    ]);

    res.json({
      userCount: parseInt(userCount[0].count),
      transactionCount: parseInt(transactionCount[0].count),
      accountCount: parseInt(accountCount[0].count),
      contactCount: parseInt(contactCount[0].count)
    });
  } catch (error) {
    console.error('Error fetching tenant stats:', error);
    res.status(500).json({ error: 'Failed to fetch tenant statistics' });
  }
});

// Suspend tenant
router.post('/:id/suspend', async (req: AdminRequest, res) => {
  try {
    await getDb().query(
      `UPDATE tenants 
       SET license_status = 'suspended', updated_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );
    
    res.json({ success: true, message: 'Tenant suspended' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to suspend tenant' });
  }
});

// Activate tenant
router.post('/:id/activate', async (req: AdminRequest, res) => {
  try {
    await getDb().query(
      `UPDATE tenants 
       SET license_status = 'active', updated_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );
    
    res.json({ success: true, message: 'Tenant activated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to activate tenant' });
  }
});

// Update tenant
router.put('/:id', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const { name, companyName, email, phone, address, maxUsers, subscriptionTier } = req.body;
    
    await db.query(
      `UPDATE tenants 
       SET name = $1, company_name = $2, email = $3, phone = $4, 
           address = $5, max_users = $6, subscription_tier = $7, updated_at = NOW()
       WHERE id = $8`,
      [name, companyName, email, phone, address, maxUsers, subscriptionTier, req.params.id]
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

export default router;

