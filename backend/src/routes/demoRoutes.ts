import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { signAccessToken } from '../auth/jwt.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import {
  DEMO_DEFAULT_USERNAME,
  DEMO_PUBLIC_TENANT_ID,
  DEMO_PUBLIC_TENANT_NAME,
  isDemoEnvironmentEnabled,
  isDemoPublicLoginEnabled,
} from '../constants/demoEnvironment.js';
import { resetPublicDemoTenant } from '../services/demo/demoResetService.js';
import { recordLoginEvent, auditContextFromRequest } from '../services/enterpriseAuditService.js';
import { publicIntrospectionLimiter } from '../middleware/introspectionGuard.js';

export const demoRouter = Router();

const enterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMIT', message: 'Too many demo session requests. Try again later.' },
  },
});

const analyticsSchema = z.object({
  event: z.string().min(1).max(120),
  properties: z.record(z.unknown()).optional(),
  sessionId: z.string().max(128).optional(),
});

/** Public demo metadata for marketing site / demo-login page. */
demoRouter.get('/demo/info', publicIntrospectionLimiter, (_req, res) => {
  sendSuccess(res, {
    enabled: isDemoPublicLoginEnabled(),
    tenantId: DEMO_PUBLIC_TENANT_ID,
    tenantName: DEMO_PUBLIC_TENANT_NAME,
    username: DEMO_DEFAULT_USERNAME,
    tourEnabled: true,
    readOnly: process.env.DEMO_READ_ONLY === 'true',
    resetsDaily: process.env.DEMO_AUTO_RESET === 'true',
  });
});

/**
 * Passwordless demo entry for public marketing site.
 * Issues a short-lived session for the shared demo user.
 */
demoRouter.post('/demo/enter', enterLimiter, async (req, res) => {
  if (!isDemoPublicLoginEnabled()) {
    sendFailure(res, 503, 'DEMO_DISABLED', 'Live demo is not available right now.');
    return;
  }

  try {
    const pool = getPool();
    const r = await pool.query<{
      id: string;
      username: string;
      name: string;
      role: string;
      tenant_id: string;
    }>(
      `SELECT id, username, name, role, tenant_id FROM users
       WHERE tenant_id = $1 AND LOWER(username) = LOWER($2) AND is_active = TRUE
       LIMIT 1`,
      [DEMO_PUBLIC_TENANT_ID, DEMO_DEFAULT_USERNAME]
    );

    const user = r.rows[0];
    if (!user) {
      sendFailure(res, 503, 'DEMO_NOT_PROVISIONED', 'Demo environment is being prepared. Please try again shortly.');
      return;
    }

    const token = signAccessToken(user.id, user.tenant_id, user.role);

    const auditClient = await pool.connect();
    let loginEventId: string;
    try {
      loginEventId = await recordLoginEvent(auditClient, {
        tenantId: user.tenant_id,
        userId: user.id,
        email: user.username,
        status: 'success',
        ctx: auditContextFromRequest(req),
      });
    } finally {
      auditClient.release();
    }

    sendSuccess(res, {
      token,
      loginEventId,
      demo: true,
      tourRecommended: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        tenantId: user.tenant_id,
      },
      tenant: {
        id: DEMO_PUBLIC_TENANT_ID,
        name: DEMO_PUBLIC_TENANT_NAME,
        companyName: DEMO_PUBLIC_TENANT_NAME,
      },
    });
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /demo/enter' });
  }
});

/** Lightweight analytics sink for demo funnel (no PII). */
demoRouter.post('/demo/analytics', publicIntrospectionLimiter, async (req, res) => {
  if (!isDemoEnvironmentEnabled()) {
    sendSuccess(res, { recorded: false });
    return;
  }
  try {
    const body = analyticsSchema.parse(req.body ?? {});
    // Extend with warehouse export; for now structured log only.
    console.info('[demo-analytics]', JSON.stringify({
      event: body.event,
      sessionId: body.sessionId,
      properties: body.properties,
      at: new Date().toISOString(),
    }));
    sendSuccess(res, { recorded: true });
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /demo/analytics' });
  }
});

/** Admin/cron reset — requires DEMO_RESET_SECRET header. */
demoRouter.post('/demo/reset', async (req, res) => {
  const secret = process.env.DEMO_RESET_SECRET?.trim();
  if (!secret || req.header('x-demo-reset-secret') !== secret) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Invalid reset credentials.');
    return;
  }
  if (!isDemoEnvironmentEnabled()) {
    sendFailure(res, 503, 'DEMO_DISABLED', 'Demo environment is not enabled.');
    return;
  }
  try {
    const result = await resetPublicDemoTenant();
    sendSuccess(res, result);
  } catch (e) {
    handleRouteError(res, e, { route: 'POST /demo/reset' });
  }
});
