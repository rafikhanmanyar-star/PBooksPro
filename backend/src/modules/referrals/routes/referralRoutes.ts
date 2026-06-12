/**

 * Tenant referral program API + public validation endpoints.

 */



import { Router } from 'express';

import { z } from 'zod';

import type { AuthedRequest } from '../../../middleware/authMiddleware.js';

import { authMiddleware } from '../../../middleware/authMiddleware.js';

import { requirePermission } from '../../../middleware/rbacMiddleware.js';

import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';

import { getPool } from '../../../db/pool.js';

import { validateReferralCode } from '../../../services/referrals/referralCodeService.js';

import { getReferralDashboard } from '../../../services/referrals/referralDashboardService.js';

import { sendReferralInvitation, markInvitationOpened } from '../../../services/referrals/referralInvitationService.js';

import { recordReferralClick } from '../../../services/referrals/referralTrackingService.js';



export const referralRouter = Router();



/** Public: validate referral code (signup pre-check). */

referralRouter.get('/referrals/validate/:code', async (req, res) => {

  const pool = getPool();

  const client = await pool.connect();

  try {

    const result = await validateReferralCode(client, req.params.code);

    sendSuccess(res, result);

  } catch (e) {

    handleRouteError(res, e, { route: 'GET /referrals/validate/:code' });

  } finally {

    client.release();

  }

});



/** Public: track link click. */

referralRouter.post('/referrals/click', async (req, res) => {

  const code = typeof req.body?.code === 'string' ? req.body.code : '';

  if (!code) {

    sendFailure(res, 400, 'VALIDATION_ERROR', 'code is required');

    return;

  }

  const pool = getPool();

  const client = await pool.connect();

  try {

    const result = await recordReferralClick(client, code);

    sendSuccess(res, result);

  } catch (e) {

    handleRouteError(res, e, { route: 'POST /referrals/click' });

  } finally {

    client.release();

  }

});



/** Public: resolve invitation token (landing page). */

referralRouter.get('/referrals/invite/:token', async (req, res) => {

  const pool = getPool();

  const client = await pool.connect();

  try {

    const result = await markInvitationOpened(client, req.params.token);

    sendSuccess(res, result);

  } catch (e) {

    handleRouteError(res, e, { route: 'GET /referrals/invite/:token' });

  } finally {

    client.release();

  }

});



const inviteSchema = z.object({

  inviteeEmail: z.string().email(),

  inviteeName: z.string().max(200).optional(),

});



referralRouter.use(authMiddleware);

referralRouter.use(requirePermission('users.read'));



referralRouter.get('/referrals/dashboard', async (req: AuthedRequest, res) => {

  const pool = getPool();

  const client = await pool.connect();

  try {

    const dashboard = await getReferralDashboard(client, req.tenantId!, req.userId);

    sendSuccess(res, dashboard);

  } catch (e) {

    handleRouteError(res, e, { route: 'GET /referrals/dashboard' });

  } finally {

    client.release();

  }

});



referralRouter.post('/referrals/invitations', async (req: AuthedRequest, res) => {

  const parsed = inviteSchema.safeParse(req.body);

  if (!parsed.success) {

    sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid invitation data');

    return;

  }



  const pool = getPool();

  const client = await pool.connect();

  try {

    const { rows: users } = await client.query(
      `SELECT name FROM users WHERE id = $1 LIMIT 1`,
      [req.userId]
    );
    const inviterName = (users[0]?.name as string) || 'A PBooks Pro user';

    const result = await sendReferralInvitation(client, {

      referrerTenantId: req.tenantId!,

      createdByUserId: req.userId!,

      inviterName,

      inviteeEmail: parsed.data.inviteeEmail,

      inviteeName: parsed.data.inviteeName,

    });

    sendSuccess(res, result, 201);

  } catch (e) {

    handleRouteError(res, e, { route: 'POST /referrals/invitations' });

  } finally {

    client.release();

  }

});


