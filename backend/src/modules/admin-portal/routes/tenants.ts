// @ts-nocheck
import { Router } from 'express';
import { AdminRequest } from '../../../adminPortal/middleware/adminAuthMiddleware.js';
import { LicenseService, DEFAULT_LICENSE_MODULES } from '../../../adminPortal/licenseService.js';
import { AdminTenantRepository } from '../repositories/AdminTenantRepository.js';
import bcrypt from 'bcryptjs';

const router = Router();
const tenantRepo = new AdminTenantRepository();

router.get('/', async (req: AdminRequest, res) => {
  try {
    const tenants = await tenantRepo.listTenants({
      status: req.query.status as string | undefined,
      licenseType: req.query.licenseType as string | undefined,
      search: req.query.search as string | undefined,
    });
    res.json(tenants);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

router.get('/:id', async (req: AdminRequest, res) => {
  try {
    const tenant = await tenantRepo.getTenantRow(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json(tenant);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tenant' });
  }
});

router.get('/:id/stats', async (req: AdminRequest, res) => {
  try {
    const stats = await tenantRepo.getTenantUsageStats(req.params.id);
    res.json({
      userCount: stats.userCount,
      maxUsers: stats.maxUsers,
      transactionCount: stats.transactionCount,
      accountCount: stats.accountCount,
      contactCount: stats.contactCount,
    });
  } catch (error) {
    console.error('Error fetching tenant stats:', error);
    res.status(500).json({ error: 'Failed to fetch tenant statistics' });
  }
});

router.post('/:id/suspend', async (req: AdminRequest, res) => {
  try {
    await tenantRepo.setLicenseStatus(req.params.id, 'suspended');
    res.json({ success: true, message: 'Tenant suspended' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to suspend tenant' });
  }
});

router.post('/:id/activate', async (req: AdminRequest, res) => {
  try {
    await tenantRepo.setLicenseStatus(req.params.id, 'active');
    res.json({ success: true, message: 'Tenant activated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to activate tenant' });
  }
});

router.put('/:id', async (req: AdminRequest, res) => {
  try {
    const tenantId = req.params.id;
    const { name, companyName, email, phone, address, maxUsers, subscriptionTier, licenseType, licenseStatus } =
      req.body;

    const existing = await tenantRepo.getTenantRow(tenantId);
    if (!existing) return res.status(404).json({ error: 'Tenant not found' });

    const updates: string[] = [];
    const params: unknown[] = [];
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
      if (await tenantRepo.isEmailUsedByOtherTenant(email, tenantId)) {
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
      if (maxUsers < 1) return res.status(400).json({ error: 'Maximum users must be at least 1' });
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

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = NOW()');
    params.push(tenantId);
    await tenantRepo.updateTenantDynamic(tenantId, updates.join(', '), params);

    const updated = await tenantRepo.getTenantRow(tenantId);
    res.json(updated);
  } catch (error: any) {
    console.error('Error updating tenant:', error);
    if (error.code === '23505') return res.status(400).json({ error: 'Email already in use' });
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

router.delete('/:id', async (req: AdminRequest, res) => {
  try {
    const tenantId = req.params.id;
    if (!(await tenantRepo.getTenantRow(tenantId))) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    await tenantRepo.deleteTenant(tenantId);
    res.json({ success: true, message: 'Tenant deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting tenant:', error);
    const message = error?.message || 'Failed to delete tenant';
    const statusCode =
      message.includes('Protected system tenants') || message.includes('cannot be deleted')
        ? 400
        : 500;
    res.status(statusCode).json({ error: message });
  }
});

router.get('/:id/users', async (req: AdminRequest, res) => {
  try {
    const tenantId = req.params.id;
    const tenant = await tenantRepo.getTenantIdAndEmail(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const users = await tenantRepo.listTenantUsers(tenantId);
    const usersWithAdminFlag = users.map((user: any) => ({
      ...user,
      is_tenant_admin: user.role === 'Admin' || user.email === tenant.email,
    }));
    res.json(usersWithAdminFlag);
  } catch (error: any) {
    console.error('Error fetching tenant users:', error);
    res.status(500).json({ error: 'Failed to fetch tenant users' });
  }
});

router.post('/:id/users/:userId/reset-password', async (req: AdminRequest, res) => {
  try {
    const { id: tenantId, userId } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    if (!(await tenantRepo.tenantExists(tenantId))) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    if (!(await tenantRepo.userBelongsToTenant(userId, tenantId))) {
      return res.status(404).json({ error: 'User not found' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await tenantRepo.resetTenantUserPassword(tenantId, userId, hashedPassword);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error: any) {
    console.error('Error resetting user password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.delete('/:id/users/:userId', async (req: AdminRequest, res) => {
  try {
    const { id: tenantId, userId } = req.params;
    if (!(await tenantRepo.tenantExists(tenantId))) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    const user = await tenantRepo.getTenantUser(userId, tenantId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'Admin') {
      const adminCount = await tenantRepo.countActiveAdmins(tenantId);
      if (adminCount <= 1) {
        return res.status(400).json({
          error: 'Cannot delete the last admin user',
          message: 'At least one admin user must remain in the organization.',
        });
      }
    }

    await tenantRepo.deleteUserSessions(tenantId, userId);
    await tenantRepo.deleteTenantUser(tenantId, userId);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.post('/:id/users/:userId/force-logout', async (req: AdminRequest, res) => {
  try {
    const { id: tenantId, userId } = req.params;
    if (!(await tenantRepo.tenantExists(tenantId))) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    if (!(await tenantRepo.userBelongsToTenant(userId, tenantId))) {
      return res.status(404).json({ error: 'User not found' });
    }
    await tenantRepo.forceLogoutTenantUser(tenantId, userId);
    res.json({ success: true, message: 'User logged out successfully from all sessions' });
  } catch (error: any) {
    console.error('Error forcing user logout:', error);
    res.status(500).json({ error: 'Failed to force logout' });
  }
});

router.get('/:id/modules', async (req: AdminRequest, res) => {
  try {
    const tenantId = req.params.id;
    if (!(await tenantRepo.tenantExists(tenantId))) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    const modules = await tenantRepo.listTenantModules(tenantId);
    res.json(
      modules.filter((m: { module_key: string }) =>
        DEFAULT_LICENSE_MODULES.includes(m.module_key as (typeof DEFAULT_LICENSE_MODULES)[number])
      )
    );
  } catch (error: any) {
    console.error('Error fetching tenant modules:', error);
    res.status(500).json({ error: 'Failed to fetch tenant modules' });
  }
});

router.post('/:id/modules', async (req: AdminRequest, res) => {
  try {
    const licenseService = new LicenseService();
    const tenantId = req.params.id;
    const { moduleKey, status, expiresAt } = req.body;
    if (!moduleKey) return res.status(400).json({ error: 'Module key is required' });
    if (!(await tenantRepo.tenantExists(tenantId))) {
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
    const message = error?.message || 'Failed to update tenant module';
    const statusCode = message.includes('Unknown or removed module') ? 400 : 500;
    res.status(statusCode).json({ error: message });
  }
});

export default router;
