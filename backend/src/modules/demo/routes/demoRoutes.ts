import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getPool } from '../../../db/pool.js';
import { signAccessToken } from '../../../auth/jwt.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import {
  DEMO_DEFAULT_USERNAME,
  DEMO_PUBLIC_TENANT_ID,
  DEMO_PUBLIC_TENANT_NAME,
  isDemoEnvironmentEnabled,
  isDemoPublicLoginEnabled,
} from '../../../constants/demoEnvironment.js';
import {
  getDemoPublicTenantInfo,
  resolveDemoPublicLoginUser,
} from '../../../services/demo/demoAuthService.js';
import { resetPublicDemoTenant } from '../../../services/demo/demoResetService.js';
import { recordLoginEvent, auditContextFromRequest } from '../../organization/services/enterpriseAuditService.js';
import { publicIntrospectionLimiter } from '../../../middleware/introspectionGuard.js';
import {
  assertPublicDemoLoginAllowed,
  DemoLoginBlockedError,
  isPublicDemoTrialExpired,
  syncPublicDemoTrialSubscription,
} from '../../../services/demo/demoLicenseService.js';
import { getDemoTrialDays } from '../../../constants/demoEnvironment.js';

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
demoRouter.get('/demo/info', publicIntrospectionLimiter, async (_req, res) => {
  try {
    const pool = getPool();
    const client = await pool.connect();
    let trialExpired = false;
    try {
      await syncPublicDemoTrialSubscription(client);
      trialExpired = await isPublicDemoTrialExpired(client);
    } finally {
      client.release();
    }
    sendSuccess(res, {
      enabled: isDemoPublicLoginEnabled() && !trialExpired,
      tenantId: DEMO_PUBLIC_TENANT_ID,
      tenantName: DEMO_PUBLIC_TENANT_NAME,
      username: DEMO_DEFAULT_USERNAME,
      trialDays: getDemoTrialDays(),
      trialExpired,
      tourEnabled: true,
      readOnly: process.env.DEMO_READ_ONLY === 'true',
      resetsDaily: process.env.DEMO_AUTO_RESET === 'true',
    });
  } catch (e) {
    handleRouteError(res, e, { route: 'GET /demo/info' });
  }
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
    const licenseClient = await pool.connect();
    try {
      await assertPublicDemoLoginAllowed(licenseClient);
    } catch (e) {
      if (e instanceof DemoLoginBlockedError) {
        sendFailure(res, 403, e.code, e.message);
        return;
      }
      throw e;
    } finally {
      licenseClient.release();
    }

    const user = await resolveDemoPublicLoginUser(pool);
    if (!user) {
      sendFailure(res, 503, 'DEMO_NOT_PROVISIONED', 'Demo environment is being prepared. Please try again shortly.');
      return;
    }

    const tenant = await getDemoPublicTenantInfo();
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
        id: tenant.id,
        name: tenant.name,
        companyName: tenant.companyName,
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
