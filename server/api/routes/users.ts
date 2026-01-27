import { Router } from 'express';
import { TenantRequest } from '../../middleware/tenantMiddleware.js';
import { getDatabaseService } from '../../services/databaseService.js';
import { adminOnlyMiddleware } from '../../middleware/adminOnlyMiddleware.js';
import bcrypt from 'bcryptjs';

const router = Router();
const getDb = () => getDatabaseService();

// Helper function to check user limit
async function checkUserLimit(tenantId: string, db: any): Promise<{ allowed: boolean; currentCount: number; maxUsers: number; error?: string }> {
  const tenantInfo = await db.query(
    'SELECT max_users FROM tenants WHERE id = $1',
    [tenantId]
  );
  const maxUsers = tenantInfo[0]?.max_users ?? 20;
  
  const userCountResult = await db.query(
    'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1 AND is_active = true',
    [tenantId]
  );
  const currentUserCount = parseInt(userCountResult[0]?.count || '0');
  
  if (currentUserCount >= maxUsers) {
    return {
      allowed: false,
      currentCount: currentUserCount,
      maxUsers,
      error: `User limit reached. Current users: ${currentUserCount}/${maxUsers}. Please contact your administrator to increase the limit.`
    };
  }
  
  return {
    allowed: true,
    currentCount: currentUserCount,
    maxUsers
  };
}

// GET all users for the current tenant - accessible to all logged in users for display purposes
router.get('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    
    // Non-admins get limited info but need 'role' for approval workflows
    const selectFields = req.userRole === 'Admin' 
      ? 'id, username, name, role, email, is_active, last_login, created_at'
      : 'id, username, name, role'; // Include 'role' for approval dropdowns

    const users = await db.query(
      `SELECT ${selectFields} FROM users WHERE tenant_id = $1 AND is_active = true ORDER BY name ASC`,
      [tenantId]
    );
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin-only routes for user management
router.use(adminOnlyMiddleware());

// Get user by ID
router.get('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const userId = req.params.id;
    
    const users = await db.query(
      'SELECT id, username, name, role, email, is_active, last_login, created_at FROM users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(users[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create new user
router.post('/', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const { username, name, email, password, role } = req.body;
    
    if (!username || !name || !password) {
      return res.status(400).json({ error: 'Username, name, and password are required' });
    }
    
    // Check user limit
    const limitCheck = await checkUserLimit(tenantId, db);
    if (!limitCheck.allowed) {
      return res.status(403).json({ 
        error: 'User limit reached',
        message: limitCheck.error,
        currentCount: limitCheck.currentCount,
        maxUsers: limitCheck.maxUsers
      });
    }
    
    // Check if username already exists for this tenant
    const existing = await db.query(
      'SELECT id FROM users WHERE tenant_id = $1 AND username = $2',
      [tenantId, username]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate ID
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Insert new user
    await db.query(
      `INSERT INTO users (id, tenant_id, username, name, role, password, email, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, tenantId, username, name, role || 'Accounts', hashedPassword, email || null, true]
    );
    
    // Fetch and return the created user (without password)
    const newUser = await db.query(
      'SELECT id, username, name, role, email, is_active, last_login, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    res.status(201).json(newUser[0]);
  } catch (error: any) {
    // Enhanced error logging with full details
    console.error('❌ POST /users - Error Details:', {
      errorMessage: error.message,
      errorCode: error.code,
      errorName: error.name,
      errorStack: error.stack?.substring(0, 500),
      constraint: error.constraint,
      detail: error.detail,
      table: error.table,
      column: error.column,
      tenantId: req.tenantId,
      requestBody: JSON.stringify(req.body).substring(0, 300)
    });
    
    // Handle specific database errors
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ 
        error: 'Duplicate user',
        message: 'A user with this username already exists'
      });
    }
    
    if (error.code === '23502') { // NOT NULL violation
      return res.status(400).json({ 
        error: 'Validation error',
        message: `Required field '${error.column}' is missing`
      });
    }
    
    if (error.code === '23503') { // Foreign key violation
      return res.status(400).json({ 
        error: 'Validation error',
        message: 'Invalid reference to related entity'
      });
    }
    
    res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

// Update user
router.put('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const userId = req.params.id;
    const { username, name, email, password, role, is_active } = req.body;
    
    // Verify user belongs to tenant
    const existing = await db.query(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if username is being changed and if it conflicts
    if (username) {
      const usernameCheck = await db.query(
        'SELECT id FROM users WHERE tenant_id = $1 AND username = $2 AND id != $3',
        [tenantId, username, userId]
      );
      
      if (usernameCheck.length > 0) {
        return res.status(400).json({ error: 'Username already exists' });
      }
    }
    
    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (username !== undefined) {
      updates.push(`username = $${paramIndex++}`);
      values.push(username);
    }
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }
    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (password !== undefined && password !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push(`password = $${paramIndex++}`);
      values.push(hashedPassword);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(userId, tenantId);
    
    await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}`,
      values
    );
    
    // Fetch and return updated user
    const updatedUser = await db.query(
      'SELECT id, username, name, role, email, is_active, last_login, created_at FROM users WHERE id = $1',
      [userId]
    );
    
    res.json(updatedUser[0]);
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: error.message || 'Failed to update user' });
  }
});

// Delete user
router.delete('/:id', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const userId = req.params.id;
    
    // Verify user belongs to tenant
    const existing = await db.query(
      'SELECT id, username, name, role FROM users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userToDelete = existing[0];
    
    // First, ensure transaction_audit_log.user_id column is nullable
    // This handles cases where the migration hasn't been applied yet
    try {
      await db.query(`
        DO $$
        BEGIN
          -- Check if column exists and has NOT NULL constraint
          IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'transaction_audit_log' 
            AND column_name = 'user_id'
            AND is_nullable = 'NO'
          ) THEN
            -- Alter the column to allow NULL values
            ALTER TABLE transaction_audit_log 
            ALTER COLUMN user_id DROP NOT NULL;
          END IF;
        END $$;
      `);
    } catch (migrationError: any) {
      // If migration fails, log but continue - column might already be nullable
      console.warn('Warning: Could not ensure transaction_audit_log.user_id is nullable:', migrationError.message);
    }
    
    // Set user_id to NULL in transaction_audit_log before deleting the user
    // This preserves the audit trail (user_name and user_role remain)
    try {
      await db.query(
        'UPDATE transaction_audit_log SET user_id = NULL WHERE user_id = $1 AND tenant_id = $2',
        [userId, tenantId]
      );
    } catch (updateError: any) {
      // If update fails, log but continue - might not have any audit log entries
      console.warn('Warning: Could not update transaction_audit_log:', updateError.message);
    }
    
    // Delete user
    await db.query(
      'DELETE FROM users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId]
    );
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: error.message || 'Failed to delete user' });
  }
});

// Get user limit info
router.get('/limit/info', async (req: TenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    
    const limitInfo = await checkUserLimit(tenantId, db);
    res.json({
      currentCount: limitInfo.currentCount,
      maxUsers: limitInfo.maxUsers,
      remaining: Math.max(0, limitInfo.maxUsers - limitInfo.currentCount),
      limitReached: !limitInfo.allowed
    });
  } catch (error: any) {
    console.error('Error fetching user limit info:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch user limit info' });
  }
});

export default router;

