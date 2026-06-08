import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import { getPool, withTransaction } from '../db/pool.js';
import { signAccessToken, signMfaToken } from '../auth/jwt.js';
import { getMfaStatus, isMfaEnforcementEnabled, userRoleRequiresMfa } from '../services/auth/mfaService.js';
import { bootstrapTenantChart } from '../services/tenantBootstrap.js';
import { startTrialSubscription } from '../services/billing/subscriptionService.js';
import { getOrCreateOnboarding } from '../services/onboarding/onboardingService.js';
import { requireLegalAcceptances } from '../services/legal/legalAcceptanceService.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import { validatePassword } from '../utils/passwordPolicy.js';
import {
  optionalAuthMiddleware,
} from '../middleware/authMiddleware.js';
import {
  auditContextFromRequest,
  recordLoginEvent,
  recordLogoutEvent,
} from '../services/enterpriseAuditService.js';
import {
  publicIntrospectionLimiter,
  requireDiscoveryToken,
  requireTenantDirectoryAccess,
  tenantDirectoryLimiter,
} from '../middleware/introspectionGuard.js';
import { isInternalDemoTenantId } from '../middleware/demoEnvironmentMiddleware.js';
import { attributeReferralSignup } from '../services/referrals/referralTrackingService.js';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  tenantId: z.string().optional(),
});

const registerTenantSchema = z.object({
  companyName: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(80).optional(),
  address: z.string().max(500).optional(),
  adminUsername: z.string().min(3).max(64),
  adminPassword: z.string().min(8).max(256),
  adminName: z.string().min(1).max(200),
  isSupplier: z.boolean().optional(),
  requestedTenantId: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z
      .string()
      .min(2)
      .max(63)
      .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Organization ID must be lowercase letters, numbers, and hyphens')
      .optional()
  ),
  legalAcceptances: z
    .array(
      z.object({
        documentType: z.string().min(1),
        documentVersion: z.string().min(1),
      })
    )
    .min(1, 'Legal document acceptance is required.'),
  referralCode: z.string().max(32).optional(),
  inviteToken: z.string().max(128).optional(),
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMIT', message: 'Too many registration attempts. Try again later.' },
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMIT', message: 'Too many login attempts. Try again later.' },
  },
});

const RESERVED_TENANT_IDS = new Set(['default', 'admin', 'api', 'system', 'www', 'mail', 'ftp']);

function slugify(s: string): string {
  const x = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return x || 'org';
}

function generateTenantId(companyName: string): string {
  const base = slugify(companyName);
  const suffix = randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}

/**
 * Public directory of organizations for the login screen (LAN / self-hosted).
 * Returns id + display name only; no secrets.
 */
authRouter.get(
  '/auth/tenants',
  tenantDirectoryLimiter,
  optionalAuthMiddleware,
  requireTenantDirectoryAccess,
  async (_req, res) => {
  try {
    const pool = getPool();
    const r = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM tenants
       WHERE id !~ '^__'
       ORDER BY LOWER(name) ASC, id ASC`
    );
    sendSuccess(res, r.rows);
  } catch (e) {
    handleRouteError(res, e);
  }
});

/**
 * Stateless JWT clients: record logout audit and close login session when authenticated.
 */
authRouter.post('/auth/logout', optionalAuthMiddleware, async (req, res) => {
  const authed = req as import('../middleware/authMiddleware.js').AuthedRequest;
  const ctx = auditContextFromRequest(req);
  const loginEventId =
    typeof req.body?.loginEventId === 'string' ? req.body.loginEventId : undefined;

  if (authed.userId && authed.tenantId) {
    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const emailRow = await client.query<{ email: string | null }>(
          `SELECT email FROM users WHERE id = $1 AND tenant_id = $2`,
          [authed.userId, authed.tenantId]
        );
        await recordLogoutEvent(client, {
          tenantId: authed.tenantId,
          userId: authed.userId,
          email: emailRow.rows[0]?.email ?? authed.userId,
          loginEventId: loginEventId ?? null,
          ctx,
        });
      } finally {
        client.release();
      }
    } catch {
      /* best-effort audit on logout */
    }
  }
  sendSuccess(res, { ok: true });
});

authRouter.post('/auth/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'username and password required');
    return;
  }
  const { username, password, tenantId: bodyTenant } = parsed.data;
  const tenantId = bodyTenant || 'default';

  if (isInternalDemoTenantId(tenantId)) {
    sendFailure(res, 403, 'DEMO_MASTER_PROTECTED', 'This organization is not available for login.');
    return;
  }

  try {
    const pool = getPool();
    const r = await pool.query<{
      id: string;
      password_hash: string;
      name: string;
      role: string;
      tenant_id: string;
      username: string;
      tenant_name: string;
      display_timezone: string | null;
      email: string | null;
    }>(
      `SELECT u.id, u.password_hash, u.name, u.role, u.tenant_id, u.username, u.email, t.name AS tenant_name,
              u.display_timezone
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.tenant_id = $1 AND LOWER(u.username) = LOWER($2) AND u.is_active = TRUE`,
      [tenantId, username]
    );
    if (r.rows.length === 0) {
      const failClient = await pool.connect();
      try {
        await recordLoginEvent(failClient, {
          tenantId,
          email: username,
          status: 'failed',
          ctx: auditContextFromRequest(req),
        });
      } finally {
        failClient.release();
      }
      sendFailure(res, 401, 'AUTH_FAILED', 'Invalid credentials');
      return;
    }
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    const ctx = auditContextFromRequest(req);
    const auditClient = await pool.connect();
    if (!ok) {
      try {
        await recordLoginEvent(auditClient, {
          tenantId,
          userId: user.id,
          email: user.email ?? user.username,
          status: 'failed',
          ctx,
        });
      } finally {
        auditClient.release();
      }
      sendFailure(res, 401, 'AUTH_FAILED', 'Invalid credentials');
      return;
    }
    // Ensure every organization has a trial subscription (legacy tenants created before billing).
    const trialClient = await pool.connect();
    try {
      await startTrialSubscription(trialClient, user.tenant_id);
    } finally {
      trialClient.release();
    }

    let loginEventId: string;
    try {
      loginEventId = await recordLoginEvent(auditClient, {
        tenantId,
        userId: user.id,
        email: user.email ?? user.username,
        status: 'success',
        ctx,
      });
      const { captureMonitoringEvent } = await import('../services/monitoring/monitoringCapture.js');
      captureMonitoringEvent({
        category: 'user_activity',
        severity: 'info',
        message: `User login: ${user.username}`,
        code: 'LOGIN_SUCCESS',
        tenantId,
        userId: user.id,
        metadata: { loginEventId },
      });
    } finally {
      auditClient.release();
    }

    const userPayload = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      tenantId: user.tenant_id,
      displayTimezone: user.display_timezone ?? null,
    };
    const tenantPayload = {
      id: user.tenant_id,
      name: user.tenant_name,
      companyName: user.tenant_name,
    };

    if (isMfaEnforcementEnabled() && userRoleRequiresMfa(user.role)) {
      const mfaClient = await pool.connect();
      try {
        const mfaStatus = await getMfaStatus(mfaClient, user.id, user.role);
        if (mfaStatus.enabled) {
          sendSuccess(res, {
            mfaRequired: true,
            mfaToken: signMfaToken(user.id, user.tenant_id, user.role, 'mfa_challenge', loginEventId),
            loginEventId,
            user: userPayload,
            tenant: tenantPayload,
          });
          return;
        }
        sendSuccess(res, {
          mfaSetupRequired: true,
          mfaSetupToken: signMfaToken(user.id, user.tenant_id, user.role, 'mfa_setup', loginEventId),
          loginEventId,
          user: userPayload,
          tenant: tenantPayload,
        });
        return;
      } finally {
        mfaClient.release();
      }
    }

    const token = signAccessToken(user.id, user.tenant_id, user.role);
    sendSuccess(res, {
      token,
      loginEventId,
      user: userPayload,
      tenant: tenantPayload,
    });
  } catch (e) {
    handleRouteError(res, e);
  }
});

authRouter.post('/auth/register-tenant', registerLimiter, async (req, res) => {
  const allow = process.env.ALLOW_SELF_SIGNUP === 'true';
  if (!allow) {
    sendFailure(
      res,
      403,
      'SELF_SIGNUP_DISABLED',
      'Self-service registration is disabled. Set ALLOW_SELF_SIGNUP=true on the API server to enable it.'
    );
    return;
  }

  const parsed = registerTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg = Object.values(first).flat()[0] || 'Invalid registration data';
    sendFailure(res, 400, 'VALIDATION_ERROR', msg);
    return;
  }

  const {
    companyName,
    email,
    adminUsername,
    adminPassword,
    adminName,
    requestedTenantId,
    legalAcceptances,
    referralCode,
    inviteToken,
  } = parsed.data;

  const passwordError = validatePassword(adminPassword);
  if (passwordError) {
    sendFailure(res, 400, 'VALIDATION_ERROR', passwordError);
    return;
  }

  let tenantId: string;
  if (requestedTenantId) {
    tenantId = requestedTenantId.toLowerCase();
    if (RESERVED_TENANT_IDS.has(tenantId)) {
      sendFailure(res, 400, 'INVALID_TENANT_ID', 'This organization ID is reserved.');
      return;
    }
  } else {
    tenantId = generateTenantId(companyName);
  }

  const pool = getPool();
  if (requestedTenantId) {
    const exists = await pool.query('SELECT 1 FROM tenants WHERE id = $1', [tenantId]);
    if (exists.rows.length > 0) {
      sendFailure(res, 409, 'DUPLICATE', 'This organization ID is already in use.');
      return;
    }
  } else {
    for (let attempt = 0; attempt < 12; attempt++) {
      const exists = await pool.query('SELECT 1 FROM tenants WHERE id = $1', [tenantId]);
      if (exists.rows.length === 0) break;
      tenantId = generateTenantId(companyName);
      if (attempt === 11) {
        sendFailure(res, 500, 'SERVER_ERROR', 'Could not allocate a unique organization ID.');
        return;
      }
    }
  }

  const userId = `user_${randomUUID().replace(/-/g, '')}`;
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const tenantDisplayName = companyName.trim();
  const emailVal = email.trim().toLowerCase();

  try {
    await withTransaction(async (client) => {
      await client.query(`INSERT INTO tenants (id, name) VALUES ($1, $2)`, [tenantId, tenantDisplayName]);

      await client.query(
        `INSERT INTO users (id, tenant_id, username, name, role, password_hash, email, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)`,
        [userId, tenantId, adminUsername.trim(), adminName.trim(), 'Admin', passwordHash, emailVal]
      );

      await bootstrapTenantChart(client, tenantId, { legacyIds: false });
      await startTrialSubscription(client, tenantId);
      await getOrCreateOnboarding(client, tenantId);
      await requireLegalAcceptances(client, {
        acceptances: legalAcceptances,
        context: 'registration',
        tenantId,
        userId,
        req,
      });

      if (referralCode?.trim()) {
        const signupIp =
          (typeof req.headers['x-forwarded-for'] === 'string'
            ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
            : undefined) || req.socket.remoteAddress;
        await attributeReferralSignup(client, {
          refereeTenantId: tenantId,
          refereeEmail: emailVal,
          referralCode: referralCode.trim(),
          inviteToken: inviteToken?.trim(),
          signupIp,
        });
      }
    });

    const trialDaysRemaining = 30;

    sendSuccess(
      res,
      {
        tenantId,
        trialDaysRemaining,
        message: `Organization "${tenantDisplayName}" created. Sign in with your admin username and this organization ID.`,
      },
      201
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === '23505') {
      sendFailure(res, 409, 'DUPLICATE', 'This organization ID or username already exists.');
      return;
    }
    handleRouteError(res, e);
  }
});
