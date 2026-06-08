/**
 * Super-admin subscription dashboard API.
 */

import { Router } from 'express';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import { getPool } from '../db/pool.js';
import {
  getAdminSubscriptionStats,
  listAdminSubscriptions,
  listAdminWebhookDeliveries,
} from '../services/billing/adminSubscriptionService.js';
import { runSubscriptionMaintenance } from '../services/billing/subscriptionLifecycleService.js';

export const adminSubscriptionRouter = Router();

adminSubscriptionRouter.get('/admin/subscriptions/stats', async (_req, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const stats = await getAdminSubscriptionStats(client);
    sendSuccess(res, stats);
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/subscriptions/stats' });
  } finally {
    client.release();
  }
});

adminSubscriptionRouter.get('/admin/subscriptions', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

  const pool = getPool();
  const client = await pool.connect();
  try {
    const items = await listAdminSubscriptions(client, {
      status,
      limit: limitRaw,
    });
    sendSuccess(res, { items, count: items.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/subscriptions' });
  } finally {
    client.release();
  }
});

adminSubscriptionRouter.get('/admin/subscriptions/webhooks', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

  const pool = getPool();
  const client = await pool.connect();
  try {
    const items = await listAdminWebhookDeliveries(client, { status, limit: limitRaw });
    sendSuccess(res, { items, count: items.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/subscriptions/webhooks' });
  } finally {
    client.release();
  }
});

adminSubscriptionRouter.post('/admin/subscriptions/maintenance', async (req: AuthedRequest, res) => {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await runSubscriptionMaintenance(client);
    sendSuccess(res, { ok: true, result, triggeredBy: req.userId ?? null });
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /admin/subscriptions/maintenance' });
  } finally {
    client.release();
  }
});
