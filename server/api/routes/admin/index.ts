import { Router } from 'express';
import { adminAuthMiddleware } from '../../../middleware/adminAuthMiddleware.js';
import tenantRoutes from './tenants.js';
import licenseRoutes from './licenses.js';
import authRoutes from './auth.js';
import statsRoutes from './stats.js';
import userRoutes from './users.js';
import marketplaceRoutes from './marketplace.js';
import createAdminRoutes from './create-admin.js';
import systemMetricsRoutes from './system-metrics.js';

const router = Router();

// Temporary endpoint to create admin user (NO AUTH REQUIRED)
// SECURITY: Remove this after creating admin user
// MUST be before adminAuthMiddleware() to be accessible without auth
router.use('/create-admin', createAdminRoutes);

// Auth routes (login) should NOT require authentication
router.use('/auth', authRoutes);

// All other admin routes require authentication
router.use(adminAuthMiddleware());

router.use('/tenants', tenantRoutes);
router.use('/licenses', licenseRoutes);
router.use('/stats', statsRoutes);
router.use('/users', userRoutes);
router.use('/marketplace', marketplaceRoutes);
router.use('/system-metrics', systemMetricsRoutes);

export default router;

