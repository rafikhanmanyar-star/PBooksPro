import { Router } from 'express';
import { AdminRequest } from '../../../middleware/adminAuthMiddleware.js';
import { getDatabaseService } from '../../../services/databaseService.js';
import { LicenseService } from '../../../services/licenseService.js';
import bcrypt from 'bcryptjs';

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

    const maxUsers = tenantInfo[0]?.max_users ?? 20;
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

// ============================================================================
// TENANT USER MANAGEMENT
// ============================================================================

// Get all users for a tenant
router.get('/:id/users', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.params.id;

    // Verify tenant exists
    const tenants = await db.query('SELECT id, email FROM tenants WHERE id = $1', [tenantId]);
    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const tenantEmail = tenants[0].email;

    // Get all users for this tenant, including login_status
    const users = await db.query(
      `SELECT 
        id, 
        username, 
        name, 
        role, 
        email, 
        is_active, 
        login_status,
        last_login, 
        created_at 
      FROM users 
      WHERE tenant_id = $1 
      ORDER BY 
        CASE WHEN role = 'Admin' THEN 0 ELSE 1 END,
        created_at ASC`,
      [tenantId]
    );

    // Mark tenant admin - user with role='Admin' or email matching tenant email
    const usersWithAdminFlag = users.map((user: any) => ({
      ...user,
      is_tenant_admin: user.role === 'Admin' || user.email === tenantEmail
    }));

    res.json(usersWithAdminFlag);
  } catch (error: any) {
    console.error('Error fetching tenant users:', error);
    res.status(500).json({ error: 'Failed to fetch tenant users' });
  }
});

// Reset user password
router.post('/:id/users/:userId/reset-password', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.params.id;
    const userId = req.params.userId;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Verify tenant exists
    const tenants = await db.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify user belongs to tenant
    const users = await db.query(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
      [hashedPassword, userId, tenantId]
    );

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error: any) {
    console.error('Error resetting user password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Delete user account
router.delete('/:id/users/:userId', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.params.id;
    const userId = req.params.userId;

    // Verify tenant exists
    const tenants = await db.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify user belongs to tenant and get user info
    const users = await db.query(
      'SELECT id, role, username FROM users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    // Prevent deleting the last Admin user
    if (user.role === 'Admin') {
      const adminCount = await db.query(
        'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1 AND role = $2 AND is_active = true',
        [tenantId, 'Admin']
      );

      if (parseInt(adminCount[0].count) <= 1) {
        return res.status(400).json({
          error: 'Cannot delete the last admin user',
          message: 'At least one admin user must remain in the organization.'
        });
      }
    }

    // Delete user sessions first
    await db.query('DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);

    // Delete user
    await db.query('DELETE FROM users WHERE id = $1 AND tenant_id = $2', [userId, tenantId]);

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Force logout user (invalidate all sessions and set login_status = false)
router.post('/:id/users/:userId/force-logout', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.params.id;
    const userId = req.params.userId;

    // Verify tenant exists
    const tenants = await db.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Verify user belongs to tenant
    const users = await db.query(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete all user sessions
    await db.query('DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);

    // Set login_status to false
    await db.query(
      'UPDATE users SET login_status = FALSE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );

    res.json({ success: true, message: 'User logged out successfully from all sessions' });
  } catch (error: any) {
    console.error('Error forcing user logout:', error);
    res.status(500).json({ error: 'Failed to force logout' });
  }
});

// ============================================================================
// TENANT MODULE MANAGEMENT
// ============================================================================

// Get all modules for a tenant
router.get('/:id/modules', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const licenseService = new LicenseService(db);
    const tenantId = req.params.id;

    // Verify tenant exists
    const tenants = await db.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const modules = await db.query(
      'SELECT module_key, status, activated_at, expires_at FROM tenant_modules WHERE tenant_id = $1',
      [tenantId]
    );

    res.json(modules);
  } catch (error: any) {
    console.error('Error fetching tenant modules:', error);
    res.status(500).json({ error: 'Failed to fetch tenant modules' });
  }
});

// Update or enable a module for a tenant
router.post('/:id/modules', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const licenseService = new LicenseService(db);
    const tenantId = req.params.id;
    const { moduleKey, status, expiresAt } = req.body;

    if (!moduleKey) {
      return res.status(400).json({ error: 'Module key is required' });
    }

    // Verify tenant exists
    const tenants = await db.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    await licenseService.updateTenantModule(
      tenantId,
      moduleKey,
      status || 'active',
      expiresAt ? new Date(expiresAt) : null
    );

    res.json({ success: true, message: `Module ${moduleKey} updated successfully` });
  } catch (error: any) {
    console.error('Error updating tenant module:', error);
    res.status(500).json({ error: 'Failed to update tenant module' });
  }
});

export default router;

