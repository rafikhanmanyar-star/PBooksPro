import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { AdminRequest } from '../../../middleware/adminAuthMiddleware.js';
import { getDatabaseService } from '../../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// List all admin users
router.get('/', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const { search, role, isActive } = req.query;
    
    let query = 'SELECT id, username, name, email, role, is_active, last_login, created_at FROM admin_users WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (username ILIKE $${paramIndex} OR name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (role) {
      query += ` AND role = $${paramIndex++}`;
      params.push(role);
    }
    if (isActive !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(isActive === 'true');
    }

    query += ' ORDER BY created_at DESC';

    const users = await db.query(query, params);
    res.json(users);
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ error: 'Failed to fetch admin users' });
  }
});

// Get admin user by ID
router.get('/:id', async (req: AdminRequest, res) => {
  try {
    const db = getDb();
    const users = await db.query(
      'SELECT id, username, name, email, role, is_active, last_login, created_at FROM admin_users WHERE id = $1',
      [req.params.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    res.json(users[0]);
  } catch (error) {
    console.error('Error fetching admin user:', error);
    res.status(500).json({ error: 'Failed to fetch admin user' });
  }
});

// Create new admin user
router.post('/', async (req: AdminRequest, res) => {
  try {
    const { username, name, email, password, role } = req.body;

    if (!username || !name || !email || !password) {
      return res.status(400).json({ error: 'Username, name, email, and password are required' });
    }

    // Validate role
    if (role && !['super_admin', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be super_admin or admin' });
    }

    const db = getDb();

    // Check if username already exists
    const existingUsername = await db.query(
      'SELECT id FROM admin_users WHERE username = $1',
      [username]
    );
    if (existingUsername.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if email already exists
    const existingEmail = await db.query(
      'SELECT id FROM admin_users WHERE email = $1',
      [email]
    );
    if (existingEmail.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate ID
    const userId = `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Insert new admin user
    await db.query(
      `INSERT INTO admin_users (id, username, name, email, password, role)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, username, name, email, hashedPassword, role || 'admin']
    );

    // Fetch and return the created user (without password)
    const newUser = await db.query(
      'SELECT id, username, name, email, role, is_active, last_login, created_at FROM admin_users WHERE id = $1',
      [userId]
    );

    res.status(201).json(newUser[0]);
  } catch (error: any) {
    console.error('Error creating admin user:', error);
    res.status(500).json({ error: error.message || 'Failed to create admin user' });
  }
});

// Update admin user
router.put('/:id', async (req: AdminRequest, res) => {
  try {
    const { id } = req.params;
    const { username, name, email, password, role, is_active } = req.body;

    const db = getDb();

    // Check if user exists
    const existing = await db.query('SELECT id FROM admin_users WHERE id = $1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (username !== undefined) {
      // Check if username is already taken by another user
      const usernameCheck = await db.query(
        'SELECT id FROM admin_users WHERE username = $1 AND id != $2',
        [username, id]
      );
      if (usernameCheck.length > 0) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      updates.push(`username = $${paramIndex++}`);
      params.push(username);
    }

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }

    if (email !== undefined) {
      // Check if email is already taken by another user
      const emailCheck = await db.query(
        'SELECT id FROM admin_users WHERE email = $1 AND id != $2',
        [email, id]
      );
      if (emailCheck.length > 0) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      updates.push(`email = $${paramIndex++}`);
      params.push(email);
    }

    if (password !== undefined && password !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push(`password = $${paramIndex++}`);
      params.push(hashedPassword);
    }

    if (role !== undefined) {
      if (!['super_admin', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be super_admin or admin' });
      }
      updates.push(`role = $${paramIndex++}`);
      params.push(role);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    await db.query(
      `UPDATE admin_users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    // Fetch and return updated user
    const updatedUser = await db.query(
      'SELECT id, username, name, email, role, is_active, last_login, created_at FROM admin_users WHERE id = $1',
      [id]
    );

    res.json(updatedUser[0]);
  } catch (error: any) {
    console.error('Error updating admin user:', error);
    res.status(500).json({ error: error.message || 'Failed to update admin user' });
  }
});

// Delete admin user
router.delete('/:id', async (req: AdminRequest, res) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).adminId;

    // Prevent deleting yourself
    if (id === adminId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const db = getDb();

    // Check if user exists
    const existing = await db.query('SELECT id FROM admin_users WHERE id = $1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    // Delete user
    await db.query('DELETE FROM admin_users WHERE id = $1', [id]);

    res.json({ message: 'Admin user deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting admin user:', error);
    res.status(500).json({ error: error.message || 'Failed to delete admin user' });
  }
});

export default router;

