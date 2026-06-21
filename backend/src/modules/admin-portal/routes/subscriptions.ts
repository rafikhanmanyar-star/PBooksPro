// @ts-nocheck
/**
 * Platform admin portal — cross-tenant subscription administration.
 * Mounted at /api/admin/subscriptions behind adminAuthMiddleware (admin_users).
 * Relocated from the tenant API (was /api/v1/admin/subscriptions) to enforce
 * tenant isolation — no tenant token may reach cross-tenant billing data.
 */
import { Router } from 'express';
import { sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { getPool } from '../../../db/pool.js';
import {
  getAdminSubscriptionStats,
  listAdminSubscriptions,
  listAdminWebhookDeliveries,
} from '../../../services/billing/adminSubscriptionService.js';
import { runSubscriptionMaintenance } from '../../../services/billing/subscriptionLifecycleService.js';
import { requireAdminPortalSuperAdmin } from '../../../adminPortal/middleware/requireAdminPortalSuperAdmin.js';

const router = Router();

router.get('/stats', async (_req, res) => {
  const client = await getPool().connect();
  try {
    sendSuccess(res, await getAdminSubscriptionStats(client));
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/subscriptions/stats' });
  } finally {
    client.release();
  }
});

router.get('/', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const client = await getPool().connect();
  try {
    const items = await listAdminSubscriptions(client, { status, limit });
    sendSuccess(res, { items, count: items.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/subscriptions' });
  } finally {
    client.release();
  }
});

router.get('/webhooks', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const client = await getPool().connect();
  try {
    const items = await listAdminWebhookDeliveries(client, { status, limit });
    sendSuccess(res, { items, count: items.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/subscriptions/webhooks' });
  } finally {
    client.release();
  }
});

router.post('/maintenance', requireAdminPortalSuperAdmin(), async (req, res) => {
  const client = await getPool().connect();
  try {
    const result = await runSubscriptionMaintenance(client);
    sendSuccess(res, { ok: true, result, triggeredBy: req.adminId ?? null });
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /admin/subscriptions/maintenance' });
  } finally {
    client.release();
  }
});

export default router;
