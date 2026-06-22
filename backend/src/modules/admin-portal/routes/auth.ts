// @ts-nocheck
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AdminUserRepository } from '../repositories/AdminPortalRepository.js';
import {
  adminAuthMiddleware,
  type AdminRequest,
} from '../../../adminPortal/middleware/adminAuthMiddleware.js';

const router = Router();
const adminUserRepo = new AdminUserRepository();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET environment variable is not set');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'JWT_SECRET is not configured',
      });
    }

    let admin;
    try {
      admin = await adminUserRepo.findActiveByUsername(username);
    } catch (queryError: any) {
      console.error('❌ Database query error:', queryError);
      if (
        queryError?.message?.includes('relation "admin_users" does not exist') ||
        queryError?.code === '42P01'
      ) {
        return res.status(500).json({
          error: 'Database schema error',
          message: 'admin_users table does not exist. Please run database migrations.',
        });
      }
      throw queryError;
    }

    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!admin.password) {
      console.error('❌ Admin user has no password set:', { username, id: admin.id });
      return res.status(500).json({
        error: 'Admin account error',
        message: 'Admin account is not properly configured',
      });
    }

    const passwordValid = await bcrypt.compare(password, String(admin.password));
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    try {
      await adminUserRepo.updateLastLogin(String(admin.id));
    } catch (updateError: any) {
      console.error('⚠️ Failed to update last_login (non-critical):', updateError);
    }

    const token = jwt.sign(
      { adminId: admin.id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error: any) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error?.message || 'Unknown error',
    });
  }
});

router.get('/me', adminAuthMiddleware(), async (req: AdminRequest, res) => {
  try {
    const admin = await adminUserRepo.getPublicProfile(req.adminId!);
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    res.json(admin);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admin info' });
  }
});

export default router;
