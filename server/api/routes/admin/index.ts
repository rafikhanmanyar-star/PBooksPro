import { Router } from 'express';
import { adminAuthMiddleware } from '../../../middleware/adminAuthMiddleware.js';
import tenantRoutes from './tenants.js';
import licenseRoutes from './licenses.js';
import authRoutes from './auth.js';
import statsRoutes from './stats.js';
import userRoutes from './users.js';

const router = Router();

// Auth routes (login) should NOT require authentication
router.use('/auth', authRoutes);

// All other admin routes require authentication
router.use(adminAuthMiddleware());

router.use('/tenants', tenantRoutes);
router.use('/licenses', licenseRoutes);
router.use('/stats', statsRoutes);
router.use('/users', userRoutes);

export default router;

