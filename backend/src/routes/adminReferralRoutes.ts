/**

 * Super-admin referral program management.

 */



import { Router } from 'express';

import { z } from 'zod';

import type { AuthedRequest } from '../middleware/authMiddleware.js';

import { requireRole } from '../middleware/rbacMiddleware.js';

import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';

import { getPool } from '../db/pool.js';

import {

  getAdminReferralStats,

  listAdminAttributions,

  listOpenFraudReviews,

  listPendingRewards,

  getReferralProgramConfig,

  updateReferralProgramConfig,

  resolveFraudReview,

} from '../services/referrals/adminReferralService.js';

import { approveReferralReward, rejectReferralReward } from '../services/referrals/referralRewardService.js';



export const adminReferralRouter = Router();



adminReferralRouter.use(requireRole('super_admin'));



adminReferralRouter.get('/admin/referrals/stats', async (_req, res) => {

  const pool = getPool();

  const client = await pool.connect();

  try {

    sendSuccess(res, await getAdminReferralStats(client));

  } catch (e) {

    handleRouteError(res, e, { route: 'GET /admin/referrals/stats' });

  } finally {

    client.release();

  }

});



adminReferralRouter.get('/admin/referrals/attributions', async (req, res) => {

  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

  const pool = getPool();

  const client = await pool.connect();

  try {

    const items = await listAdminAttributions(client, { status, limit });

    sendSuccess(res, { items, count: items.length });

  } catch (e) {

    handleRouteError(res, e, { route: 'GET /admin/referrals/attributions' });

  } finally {

    client.release();

  }

});



adminReferralRouter.get('/admin/referrals/fraud', async (req, res) => {

  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;

  const pool = getPool();

  const client = await pool.connect();

  try {

    const items = await listOpenFraudReviews(client, limit);

    sendSuccess(res, { items, count: items.length });

  } catch (e) {

    handleRouteError(res, e, { route: 'GET /admin/referrals/fraud' });

  } finally {

    client.release();

  }

});



adminReferralRouter.get('/admin/referrals/rewards/pending', async (req, res) => {

  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;

  const pool = getPool();

  const client = await pool.connect();

  try {

    const items = await listPendingRewards(client, limit);

    sendSuccess(res, { items, count: items.length });

  } catch (e) {

    handleRouteError(res, e, { route: 'GET /admin/referrals/rewards/pending' });

  } finally {

    client.release();

  }

});



adminReferralRouter.get('/admin/referrals/config', async (_req, res) => {

  const pool = getPool();

  const client = await pool.connect();

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



adminReferralRouter.put('/admin/referrals/config', async (req, res) => {

  const parsed = configSchema.safeParse(req.body);

  if (!parsed.success) {

    sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid config');

    return;

  }

  const pool = getPool();

  const client = await pool.connect();

  try {

    const updated = await updateReferralProgramConfig(client, parsed.data as Parameters<typeof updateReferralProgramConfig>[1]);

    sendSuccess(res, updated);

  } catch (e) {

    handleRouteError(res, e, { route: 'PUT /admin/referrals/config' });

  } finally {

    client.release();

  }

});



adminReferralRouter.post('/admin/referrals/rewards/:id/approve', async (req: AuthedRequest, res) => {

  const pool = getPool();

  const client = await pool.connect();

  try {

    await approveReferralReward(client, req.params.id, req.userId!);

    sendSuccess(res, { ok: true });

  } catch (e) {

    handleRouteError(res, e, { route: 'POST /admin/referrals/rewards/:id/approve' });

  } finally {

    client.release();

  }

});



adminReferralRouter.post('/admin/referrals/rewards/:id/reject', async (req: AuthedRequest, res) => {

  const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;

  const pool = getPool();

  const client = await pool.connect();

  try {

    await rejectReferralReward(client, req.params.id, req.userId!, notes);

    sendSuccess(res, { ok: true });

  } catch (e) {

    handleRouteError(res, e, { route: 'POST /admin/referrals/rewards/:id/reject' });

  } finally {

    client.release();

  }

});



adminReferralRouter.post('/admin/referrals/fraud/:id/resolve', async (req: AuthedRequest, res) => {

  const resolution = req.body?.resolution === 'confirmed' ? 'confirmed' : 'dismissed';

  const pool = getPool();

  const client = await pool.connect();

  try {

    await resolveFraudReview(client, req.params.id, req.userId!, resolution);

    sendSuccess(res, { ok: true });

  } catch (e) {

    handleRouteError(res, e, { route: 'POST /admin/referrals/fraud/:id/resolve' });

  } finally {

    client.release();

  }

});


