// @ts-nocheck
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { AdminRequest } from '../../../adminPortal/middleware/adminAuthMiddleware.js';
import { AdminUserRepository } from '../repositories/AdminPortalRepository.js';

const router = Router();
const adminUserRepo = new AdminUserRepository();

router.get('/', async (req: AdminRequest, res) => {
  try {
    const users = await adminUserRepo.listAdmins({
      search: req.query.search as string | undefined,
      role: req.query.role as string | undefined,
      isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ error: 'Failed to fetch admin users' });
  }
});

router.get('/:id', async (req: AdminRequest, res) => {
  try {
    const user = await adminUserRepo.getPublicById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Admin user not found' });
    res.json(user);
  } catch (error) {
    console.error('Error fetching admin user:', error);
    res.status(500).json({ error: 'Failed to fetch admin user' });
  }
});

router.post('/', async (req: AdminRequest, res) => {
  try {
    const { username, name, email, password, role } = req.body;
    if (!username || !name || !email || !password) {
      return res.status(400).json({ error: 'Username, name, email, and password are required' });
    }
    if (role && !['super_admin', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be super_admin or admin' });
    }
    if (await adminUserRepo.usernameTaken(username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    if (await adminUserRepo.emailTaken(email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const userId = `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await adminUserRepo.createAdmin({
      id: userId,
      username,
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: role || 'admin',
    });

    const newUser = await adminUserRepo.getPublicById(userId);
    res.status(201).json(newUser);
  } catch (error: any) {
    console.error('Error creating admin user:', error);
    res.status(500).json({ error: error.message || 'Failed to create admin user' });
  }
});

router.put('/:id', async (req: AdminRequest, res) => {
  try {
    const { id } = req.params;
    const { username, name, email, password, role, is_active } = req.body;

    if (!(await adminUserRepo.exists(id))) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (username !== undefined) {
      if (await adminUserRepo.usernameTaken(username, id)) {
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
      if (await adminUserRepo.emailTaken(email, id)) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      updates.push(`email = $${paramIndex++}`);
      params.push(email);
    }
    if (password !== undefined && password !== '') {
      updates.push(`password = $${paramIndex++}`);
      params.push(await bcrypt.hash(password, 10));
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

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = NOW()');
    params.push(id);
    await adminUserRepo.updateAdminDynamic(id, updates.join(', '), params);

    res.json(await adminUserRepo.getPublicById(id));
  } catch (error: any) {
    console.error('Error updating admin user:', error);
    res.status(500).json({ error: error.message || 'Failed to update admin user' });
  }
});

router.delete('/:id', async (req: AdminRequest, res) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).adminId;
    if (id === adminId) return res.status(400).json({ error: 'Cannot delete your own account' });
    if (!(await adminUserRepo.exists(id))) {
      return res.status(404).json({ error: 'Admin user not found' });
    }
    await adminUserRepo.deleteAdmin(id);
    res.json({ message: 'Admin user deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting admin user:', error);
    res.status(500).json({ error: error.message || 'Failed to delete admin user' });
  }
});

export default router;
