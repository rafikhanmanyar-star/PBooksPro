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
    
    const [tenantInfo, userCount, transactionCount, accountCount, contactCount] = await Promise.all([
      db.query('SELECT max_users FROM tenants WHERE id = $1', [tenantId]),
      db.query('SELECT COUNT(*) as count FROM users WHERE tenant_id = $1', [tenantId]),
      db.query('SELECT COUNT(*) as count FROM transactions WHERE tenant_id = $1', [tenantId]),
      db.query('SELECT COUNT(*) as count FROM accounts WHERE tenant_id = $1', [tenantId]),
      db.query('SELECT COUNT(*) as count FROM contacts WHERE tenant_id = $1', [tenantId])
    ]);

    const maxUsers = tenantInfo[0]?.max_users || 5;
    const currentUserCount = parseInt(userCount[0].count);

    res.json({
      userCount: currentUserCount,
      maxUsers: maxUsers,
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
    const tenantId = req.params.id;
    const { name, companyName, email, phone, address, maxUsers, subscriptionTier, licenseType, licenseStatus } = req.body;
    
    // First, check if tenant exists
    const existingTenants = await db.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
    if (existingTenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const existing = existingTenants[0];
    
    // Build dynamic update query for partial updates
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (companyName !== undefined) {
      updates.push(`company_name = $${paramIndex++}`);
      params.push(companyName);
    }
    if (email !== undefined) {
      // Check if email is already taken by another tenant
      const emailCheck = await db.query('SELECT id FROM tenants WHERE email = $1 AND id != $2', [email, tenantId]);
      if (emailCheck.length > 0) {
        return res.status(400).json({ error: 'Email already in use by another tenant' });
      }
      updates.push(`email = $${paramIndex++}`);
      params.push(email);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      params.push(phone);
    }
    if (address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      params.push(address);
    }
    if (maxUsers !== undefined) {
      if (maxUsers < 1) {
        return res.status(400).json({ error: 'Maximum users must be at least 1' });
      }
      updates.push(`max_users = $${paramIndex++}`);
      params.push(maxUsers);
    }
    if (subscriptionTier !== undefined) {
      updates.push(`subscription_tier = $${paramIndex++}`);
      params.push(subscriptionTier);
    }
    if (licenseType !== undefined) {
      if (!['trial', 'monthly', 'yearly', 'perpetual'].includes(licenseType)) {
        return res.status(400).json({ error: 'Invalid license type' });
      }
      updates.push(`license_type = $${paramIndex++}`);
      params.push(licenseType);
    }
    if (licenseStatus !== undefined) {
      if (!['active', 'expired', 'suspended', 'cancelled'].includes(licenseStatus)) {
        return res.status(400).json({ error: 'Invalid license status' });
      }
      updates.push(`license_status = $${paramIndex++}`);
      params.push(licenseStatus);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    // Always update updated_at
    updates.push(`updated_at = NOW()`);
    
    // Add tenant ID as last parameter
    params.push(tenantId);
    
    const query = `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramIndex}`;
    
    await db.query(query, params);
    
    // Return updated tenant
    const updatedTenants = await db.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
    res.json(updatedTenants[0]);
  } catch (error: any) {
    console.error('Error updating tenant:', error);
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'Email already in use' });
    }
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// Delete tenant
router.delete('/:id', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.params.id;
    
    // Check if tenant exists
    const tenants = await db.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    // Delete tenant (CASCADE will handle related data)
    await db.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    
    res.json({ success: true, message: 'Tenant deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting tenant:', error);
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

export default router;

