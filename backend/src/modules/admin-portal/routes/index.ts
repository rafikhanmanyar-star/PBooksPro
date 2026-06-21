// @ts-nocheck
import { Router } from 'express';
import { adminAuthMiddleware } from '../../../adminPortal/middleware/adminAuthMiddleware.js';
import { isAdminBootstrapEnabled, ADMIN_BOOTSTRAP_WARNING } from '../adminBootstrapGate.js';
import tenantRoutes from './tenants.js';
import licenseRoutes from './licenses.js';
import authRoutes from './auth.js';
import statsRoutes from './stats.js';
import userRoutes from './users.js';
import marketplaceRoutes from './marketplace.js';
import createAdminRoutes from './create-admin.js';
import systemMetricsRoutes from './system-metrics.js';
import leadsRoutes from './leads.js';
import organizationRequestsRoutes from './organizationRequests.js';
import subscriptionsRoutes from './subscriptions.js';
import referralsRoutes from './referrals.js';
import monitoringRoutes from './monitoring.js';
import emailAutomationRoutes from './emailAutomation.js';

const router = Router();

// Privileged, UNAUTHENTICATED super-admin bootstrap endpoint.
// Disabled by default. Mounted ONLY in local development with an explicit opt-in
// (NODE_ENV=development AND ENABLE_ADMIN_BOOTSTRAP=true). Never mounted in
// staging or production. See modules/admin-portal/adminBootstrapGate.ts.
if (isAdminBootstrapEnabled()) {
  console.warn(ADMIN_BOOTSTRAP_WARNING);
  router.use('/create-admin', createAdminRoutes);
}

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
router.use('/leads', leadsRoutes);
router.use('/organization-requests', organizationRequestsRoutes);

// Cross-tenant platform administration — relocated from the tenant API so that only
// authenticated admin_users (not tenant Super Admins) can reach cross-tenant data.
router.use('/subscriptions', subscriptionsRoutes);
router.use('/referrals', referralsRoutes);
router.use('/monitoring', monitoringRoutes);
router.use('/email-automation', emailAutomationRoutes);

export default router;

