import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabaseService } from '../../../services/databaseService.js';

const router = Router();
const getDb = () => getDatabaseService();

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const db = getDb();
    // Find admin user
    const admins = await db.query(
      'SELECT * FROM admin_users WHERE username = $1 AND is_active = TRUE',
      [username]
    );

    if (admins.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = admins[0];

    // Verify password
    if (!await bcrypt.compare(password, admin.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await getDb().query(
      'UPDATE admin_users SET last_login = NOW() WHERE id = $1',
      [admin.id]
    );

    // Generate JWT
    const token = jwt.sign(
      {
        adminId: admin.id,
        username: admin.username,
        role: admin.role
      },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current admin (requires authentication - handled by middleware in index.ts)
router.get('/me', async (req, res) => {
  try {
    const adminId = (req as any).adminId;
    const admins = await getDb().query(
      'SELECT id, username, name, email, role, last_login FROM admin_users WHERE id = $1',
      [adminId]
    );

    if (admins.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json(admins[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admin info' });
  }
});

export default router;

