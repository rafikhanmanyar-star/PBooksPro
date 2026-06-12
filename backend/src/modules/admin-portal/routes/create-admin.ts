// @ts-nocheck
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { AdminUserRepository } from '../repositories/AdminPortalRepository.js';

const router = Router();
const adminUserRepo = new AdminUserRepository();

router.post('/', async (_req, res) => {
  try {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await adminUserRepo.upsertBootstrapAdmin({
      id: 'admin_1',
      username: 'Admin',
      name: 'Super Admin',
      email: 'admin@pbookspro.com',
      passwordHash: hashedPassword,
      role: 'super_admin',
    });

    res.json({
      success: true,
      message: 'Admin user created successfully',
      username: 'Admin',
      password: 'admin123',
      warning: 'REMOVE THIS ENDPOINT AFTER USE FOR SECURITY',
    });
  } catch (error: any) {
    console.error('Error creating admin user:', error);
    res.status(500).json({ error: error.message || 'Failed to create admin user' });
  }
});

export default router;
