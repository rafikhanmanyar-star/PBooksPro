// @ts-nocheck
/**
 * Platform admin portal — cross-tenant referral program administration.
 * Mounted at /api/admin/referrals behind adminAuthMiddleware (admin_users).
 * Relocated from the tenant API to enforce tenant isolation.
 */
import { Router } from 'express';
import { z } from 'zod';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { getPool } from '../../../db/pool.js';
import {
  getAdminReferralStats,
  listAdminAttributions,
  listOpenFraudReviews,
  listPendingRewards,
  getReferralProgramConfig,
  updateReferralProgramConfig,
  resolveFraudReview,
} from '../../../services/referrals/adminReferralService.js';
import {
  approveReferralReward,
  rejectReferralReward,
} from '../../../services/referrals/referralRewardService.js';
import { requireAdminPortalSuperAdmin } from '../../../adminPortal/middleware/requireAdminPortalSuperAdmin.js';

const router = Router();

router.get('/stats', async (_req, res) => {
  const client = await getPool().connect();
  try {
    sendSuccess(res, await getAdminReferralStats(client));
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/referrals/stats' });
  } finally {
    client.release();
  }
});

router.get('/attributions', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const client = await getPool().connect();
  try {
    const items = await listAdminAttributions(client, { status, limit });
    sendSuccess(res, { items, count: items.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/referrals/attributions' });
  } finally {
    client.release();
  }
});

router.get('/fraud', async (req, res) => {
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
  const client = await getPool().connect();
  try {
    const items = await listOpenFraudReviews(client, limit);
    sendSuccess(res, { items, count: items.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/referrals/fraud' });
  } finally {
    client.release();
  }
});

router.get('/rewards/pending', async (req, res) => {
  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
  const client = await getPool().connect();
  try {
    const items = await listPendingRewards(client, limit);
    sendSuccess(res, { items, count: items.length });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/referrals/rewards/pending' });
  } finally {
    client.release();
  }
});

router.get('/config', async (_req, res) => {
  const client = await getPool().connect();
  try {
    sendSuccess(res, await getReferralProgramConfig(client));
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /admin/referrals/config' });
  } finally {
    client.release();
  }
});

const configSchema = z.object({
  isEnabled: z.boolean().optional(),
  referrerRewardType: z.enum(['free_months', 'discount_credit', 'plan_upgrade']).optional(),
  referrerRewardValue: z.record(z.unknown()).optional(),
  refereeRewardType: z.enum(['free_months', 'discount_credit', 'plan_upgrade']).nullable().optional(),
  refereeRewardValue: z.record(z.unknown()).optional(),
  minDaysToConvert: z.number().int().min(0).max(365).optional(),
  maxReferralsPerMonth: z.number().int().min(1).max(1000).optional(),
  blockSameEmailDomain: z.boolean().optional(),
  requirePaidConversion: z.boolean().optional(),
  invitationExpiryDays: z.number().int().min(1).max(90).optional(),
  signupBaseUrl: z.string().url().optional(),
});

router.put('/config', requireAdminPortalSuperAdmin(), async (req, res) => {
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid config');
    return;
  }
  const client = await getPool().connect();
  try {
    const updated = await updateReferralProgramConfig(client, parsed.data);
    sendSuccess(res, updated);
  } catch (e) {
    handleRouteError(res, e, { route: 'PUT /admin/referrals/config' });
  } finally {
    client.release();
  }
});

router.post('/rewards/:id/approve', requireAdminPortalSuperAdmin(), async (req, res) => {
  const client = await getPool().connect();
  try {
    await approveReferralReward(client, req.params.id, req.adminId);
    sendSuccess(res, { ok: true });
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /admin/referrals/rewards/:id/approve' });
  } finally {
    client.release();
  }
});

router.post('/rewards/:id/reject', requireAdminPortalSuperAdmin(), async (req, res) => {
  const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;
  const client = await getPool().connect();
  try {
    await rejectReferralReward(client, req.params.id, req.adminId, notes);
    sendSuccess(res, { ok: true });
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /admin/referrals/rewards/:id/reject' });
  } finally {
    client.release();
  }
});

router.post('/fraud/:id/resolve', requireAdminPortalSuperAdmin(), async (req, res) => {
  const resolution = req.body?.resolution === 'confirmed' ? 'confirmed' : 'dismissed';
  const client = await getPool().connect();
  try {
    await resolveFraudReview(client, req.params.id, req.adminId, resolution);
    sendSuccess(res, { ok: true });
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /admin/referrals/fraud/:id/resolve' });
  } finally {
    client.release();
  }
});

export default router;
