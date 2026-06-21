// @ts-nocheck
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { AdminUserRepository } from '../repositories/AdminPortalRepository.js';
import { isAdminBootstrapEnabled } from '../adminBootstrapGate.js';
import { validatePassword } from '../../../utils/passwordPolicy.js';
import { extractClientIp, extractUserAgent } from '../../../utils/requestContext.js';

const router = Router();
const adminUserRepo = new AdminUserRepository();

/**
 * Development-only platform admin bootstrap.
 *
 * Credentials are taken exclusively from environment variables — no hardcoded
 * password. The route is normally not even mounted (see adminBootstrapGate); the
 * in-handler guard is defense-in-depth so the endpoint fails closed even if it is
 * ever wired up by mistake outside development.
 */
router.post('/', async (req, res) => {
  // Defense-in-depth: refuse to run outside the development-only window.
  if (!isAdminBootstrapEnabled()) {
    return res.status(404).json({ error: 'Not found' });
  }

  const username = process.env.ADMIN_BOOTSTRAP_USERNAME;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const name = process.env.ADMIN_BOOTSTRAP_NAME || 'Bootstrap Admin';

  if (!username || !password || !email) {
    return res.status(400).json({
      error: 'Bootstrap credentials not configured',
      message:
        'Set ADMIN_BOOTSTRAP_USERNAME, ADMIN_BOOTSTRAP_PASSWORD and ADMIN_BOOTSTRAP_EMAIL to use this endpoint.',
    });
  }

  const policyError = validatePassword(password);
  if (policyError) {
    return res.status(400).json({
      error: 'Bootstrap password does not meet policy',
      message: policyError,
    });
  }

  // Audit log: this privileged endpoint was invoked.
  console.warn(
    JSON.stringify({
      event: 'ADMIN_BOOTSTRAP_USED',
      severity: 'critical',
      message: 'Unauthenticated admin bootstrap endpoint invoked',
      username,
      email,
      ip: extractClientIp(req),
      userAgent: extractUserAgent(req),
      timestamp: new Date().toISOString(),
    })
  );

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await adminUserRepo.upsertBootstrapAdmin({
      id: 'admin_1',
      username,
      name,
      email,
      passwordHash: hashedPassword,
      role: 'super_admin',
    });

    return res.json({
      success: true,
      message: 'Admin user created successfully',
      username,
    });
  } catch (error: any) {
    console.error('Error creating admin user:', error);
    return res.status(500).json({ error: error.message || 'Failed to create admin user' });
  }
});

export default router;
