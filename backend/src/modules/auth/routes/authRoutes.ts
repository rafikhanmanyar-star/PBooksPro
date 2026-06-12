import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import { getPool, withTransaction } from '../../../db/pool.js';
import { verifyTenantSelectionToken } from '../../../auth/jwt.js';
import { requireLegalAcceptances } from '../../../services/legal/legalAcceptanceService.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { validatePassword } from '../../../utils/passwordPolicy.js';
import {
  authMiddleware,
  optionalAuthMiddleware,
  type AuthedRequest,
} from '../../../middleware/authMiddleware.js';
import {
  auditContextFromRequest,
  recordLoginEvent,
  recordLogoutEvent,
} from '../../../services/enterpriseAuditService.js';
import { publicIntrospectionLimiter } from '../../../middleware/introspectionGuard.js';
import {
  findAccountsByLoginIdentifier,
  filterAccountsByPassword,
  findAccountForTenantByLoginIdentifier,
  getUserTenantsForUser,
  userHasTenantAccess,
} from '../../../services/auth/userTenantService.js';
import {
  buildCompanySelectionResponse,
  completeLoginForAccount,
} from '../../../services/auth/loginSessionService.js';
import { ensureUserTenantMembership } from '../../../services/auth/userTenantService.js';
import {
  assertUserIdentityAvailable,
  identityConflictApiDetails,
  UserIdentityConflictError,
} from '../../../services/auth/userIdentityService.js';
import { isInternalDemoTenantId } from '../../../middleware/demoEnvironmentMiddleware.js';
import {
  isDemoPublicLoginEnabled,
  isDemoPublicTenant,
} from '../../../constants/demoEnvironment.js';
import { resolveDemoPublicLoginUser } from '../../../services/demo/demoAuthService.js';
import {
  assertPublicDemoLoginAllowed,
  DemoLoginBlockedError,
} from '../../../services/demo/demoLicenseService.js';
import { attributeReferralSignup } from '../../../services/referrals/referralTrackingService.js';
import { isEnvFlagEnabled } from '../../../utils/envFlag.js';
import {
  bootstrapNewOrganizationData,
  OrganizationAccessDeniedError,
  assertAccountMayLogin,
  filterLoginEligibleAccounts,
  organizationLoginBlockError,
  registerPendingOrganization,
} from '../../../services/organization/organizationApprovalService.js';
import { isOrganizationApprovalEnabled } from '../../../constants/organizationStatus.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().optional().default(''),
  username: z.string().optional().default(''),
  password: z.string().optional().default(''),
  /** @deprecated Demo-only; normal login must not send tenantId. */
  tenantId: z.string().optional(),
});

const selectCompanySchema = z.object({
  companyId: z.string().min(1),
  selectionToken: z.string().optional(),
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
  country: z.string().max(120).optional(),
  captchaToken: z.string().max(4096).optional(),
});

const registerRateLimitMax = Number(process.env.ORG_REGISTRATION_RATE_LIMIT_MAX ?? 5);
const registerRateLimitWindowMs = Number(process.env.ORG_REGISTRATION_RATE_LIMIT_WINDOW_MS ?? 60 * 60 * 1000);

const registerLimiter = rateLimit({
  windowMs: registerRateLimitWindowMs,
  max: Number.isFinite(registerRateLimitMax) && registerRateLimitMax > 0 ? registerRateLimitMax : 5,
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

function sendOrganizationAccessFailure(res: import('express').Response, err: OrganizationAccessDeniedError): void {
  sendFailure(res, 403, err.code, err.message, {
    title: err.title,
    organizationStatus: err.orgStatus,
    rejectionReason: err.rejectionReason ?? undefined,
  });
}

function clientIpFromRequest(req: import('express').Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim();
  return req.socket.remoteAddress ?? undefined;
}

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
 * Organizations assigned to the authenticated user (never public).
 */
authRouter.get('/auth/my-companies', authMiddleware, async (req, res) => {
  const authed = req as AuthedRequest;
  try {
    const pool = getPool();
    const companies = await getUserTenantsForUser(pool, authed.userId!, authed.tenantId!);
    sendSuccess(res, companies);
  } catch (e) {
    handleRouteError(res, e);
  }
});

/**
 * Stateless JWT clients: record logout audit and close login session when authenticated.
 */
authRouter.post('/auth/logout', optionalAuthMiddleware, async (req, res) => {
  const authed = req as import('../../../middleware/authMiddleware.js').AuthedRequest;
  const ctx = auditContextFromRequest(req);
  const loginEventId =
    typeof req.body?.loginEventId === 'string' ? req.body.loginEventId : undefined;

  if (authed.userId && authed.tenantId) {
    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        const emailRow = await client.query<{ email: string | null }>(
          `SELECT email FROM users WHERE id = $1`,
          [authed.userId]
        );
        await recordLogoutEvent(client, {
          tenantId: authed.tenantId,
          userId: authed.userId,
          email: emailRow.rows[0]?.email ?? authed.userId,
          loginEventId: loginEventId ?? null,
          ctx,
        });
        const { deleteUserSession, markUserLoggedOut } = await import(
          '../../../services/auth/userSessionService.js'
        );
        await deleteUserSession(client, authed.userId, authed.tenantId);
        await markUserLoggedOut(client, authed.userId, authed.tenantId);
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
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid login request');
    return;
  }
  const { email, username, password, tenantId: bodyTenant } = parsed.data;
  const loginIdentifier = (email || username).trim();
  const tenantId = bodyTenant || '';
  const isDemoPasswordless =
    !!tenantId && isDemoPublicTenant(tenantId) && isDemoPublicLoginEnabled();

  if (!isDemoPasswordless && (!loginIdentifier || !password)) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Email and password are required');
    return;
  }

  if (tenantId && isInternalDemoTenantId(tenantId)) {
    sendFailure(res, 403, 'DEMO_MASTER_PROTECTED', 'This organization is not available for login.');
    return;
  }

  try {
    const pool = getPool();
    const ctx = auditContextFromRequest(req);

    if (isDemoPasswordless) {
      const demoLicenseClient = await pool.connect();
      try {
        await assertPublicDemoLoginAllowed(demoLicenseClient);
      } catch (e) {
        if (e instanceof DemoLoginBlockedError) {
          sendFailure(res, 403, e.code, e.message);
          return;
        }
        throw e;
      } finally {
        demoLicenseClient.release();
      }

      const demoUser = await resolveDemoPublicLoginUser(pool, loginIdentifier);
      if (!demoUser) {
        sendFailure(res, 503, 'DEMO_NOT_PROVISIONED', 'Demo environment is being prepared. Please try again shortly.');
        return;
      }
      const tenantRow = await pool.query<{ tenant_name: string }>(
        `SELECT name AS tenant_name FROM tenants WHERE id = $1`,
        [tenantId]
      );
      const account = {
        userId: demoUser.id,
        tenantId: demoUser.tenant_id,
        role: demoUser.role,
        username: demoUser.username,
        name: demoUser.name,
        passwordHash: '',
        tenantName: tenantRow.rows[0]?.tenant_name ?? demoUser.tenant_id,
        displayTimezone: demoUser.display_timezone ?? null,
        interfaceMode: demoUser.interface_mode ?? 'auto',
        email: demoUser.email,
        lastTenantId: null,
        organizationStatus: 'ACTIVE',
        rejectionReason: null,
      };
      const client = await pool.connect();
      try {
        const result = await completeLoginForAccount(client, account, ctx);
        if (result.kind === 'mfa_required') {
          sendSuccess(res, {
            mfaRequired: true,
            mfaToken: result.mfaToken,
            loginEventId: result.loginEventId,
            user: result.user,
            tenant: result.tenant,
            company: result.company,
          });
          return;
        }
        if (result.kind === 'mfa_setup_required') {
          sendSuccess(res, {
            mfaSetupRequired: true,
            mfaSetupToken: result.mfaSetupToken,
            loginEventId: result.loginEventId,
            user: result.user,
            tenant: result.tenant,
            company: result.company,
          });
          return;
        }
        sendSuccess(res, {
          requiresCompanySelection: false,
          token: result.token,
          loginEventId: result.loginEventId,
          user: result.user,
          tenant: result.tenant,
          company: result.company,
        });
      } finally {
        client.release();
      }
      return;
    }

    const candidates = await findAccountsByLoginIdentifier(pool, loginIdentifier);
    const matched = await filterAccountsByPassword(candidates, password);
    const orgBlock = organizationLoginBlockError(matched);
    if (orgBlock) {
      sendOrganizationAccessFailure(res, orgBlock);
      return;
    }
    const loginEligible = filterLoginEligibleAccounts(matched);

    if (loginEligible.length === 0) {
      const failTenantId = candidates[0]?.tenantId;
      if (failTenantId) {
        const failClient = await pool.connect();
        try {
          await recordLoginEvent(failClient, {
            tenantId: failTenantId,
            email: loginIdentifier,
            status: 'failed',
            ctx,
          });
        } finally {
          failClient.release();
        }
      }
      sendFailure(res, 401, 'AUTH_FAILED', 'Invalid credentials');
      return;
    }

    if (loginEligible.length > 1) {
      const auditClient = await pool.connect();
      let loginEventId: string | undefined;
      try {
        loginEventId = await recordLoginEvent(auditClient, {
          tenantId: loginEligible[0]!.tenantId,
          userId: loginEligible[0]!.userId,
          email: loginEligible[0]!.email ?? loginIdentifier,
          status: 'success',
          ctx,
        });
      } finally {
        auditClient.release();
      }
      sendSuccess(res, buildCompanySelectionResponse(loginEligible, loginEventId));
      return;
    }

    const client = await pool.connect();
    try {
      assertAccountMayLogin(loginEligible[0]!);
      const result = await completeLoginForAccount(client, loginEligible[0]!, ctx);
      const { captureMonitoringEvent } = await import('../../../services/monitoring/monitoringCapture.js');
      captureMonitoringEvent({
        category: 'user_activity',
        severity: 'info',
        message: `User login: ${loginEligible[0]!.username}`,
        code: 'LOGIN_SUCCESS',
        tenantId: loginEligible[0]!.tenantId,
        userId: loginEligible[0]!.userId,
        metadata: { loginEventId: result.loginEventId },
      });

      if (result.kind === 'mfa_required') {
        sendSuccess(res, {
          mfaRequired: true,
          mfaToken: result.mfaToken,
          loginEventId: result.loginEventId,
          user: result.user,
          tenant: result.tenant,
          company: result.company,
        });
        return;
      }
      if (result.kind === 'mfa_setup_required') {
        sendSuccess(res, {
          mfaSetupRequired: true,
          mfaSetupToken: result.mfaSetupToken,
          loginEventId: result.loginEventId,
          user: result.user,
          tenant: result.tenant,
          company: result.company,
        });
        return;
      }

      sendSuccess(res, {
        requiresCompanySelection: false,
        token: result.token,
        loginEventId: result.loginEventId,
        user: result.user,
        tenant: result.tenant,
        company: result.company,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    if (e instanceof OrganizationAccessDeniedError) {
      sendOrganizationAccessFailure(res, e);
      return;
    }
    handleRouteError(res, e);
  }
});

authRouter.post('/auth/select-company', loginLimiter, optionalAuthMiddleware, async (req, res) => {
  const parsed = selectCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'companyId is required');
    return;
  }

  const { companyId, selectionToken } = parsed.data;
  const authed = req as AuthedRequest;
  const ctx = auditContextFromRequest(req);

  if (isInternalDemoTenantId(companyId)) {
    sendFailure(res, 403, 'DEMO_MASTER_PROTECTED', 'This organization is not available for login.');
    return;
  }

  try {
    const pool = getPool();
    let account = null as Awaited<ReturnType<typeof userHasTenantAccess>>;

    if (selectionToken) {
      const payload = verifyTenantSelectionToken(selectionToken);
      const match = payload.accounts.find((a) => a.tenantId === companyId);
      if (!match) {
        sendFailure(res, 403, 'FORBIDDEN', 'You do not have access to this organization');
        return;
      }
      account = await userHasTenantAccess(pool, match.userId, companyId);
    } else if (authed.userId && authed.tenantId) {
      const identityRow = await pool.query<{ email: string | null; username: string }>(
        `SELECT email, username FROM users WHERE id = $1`,
        [authed.userId]
      );
      const loginIdentifier =
        identityRow.rows[0]?.email?.trim() || identityRow.rows[0]?.username?.trim() || '';
      if (!loginIdentifier) {
        sendFailure(res, 403, 'FORBIDDEN', 'You do not have access to this organization');
        return;
      }
      account = await findAccountForTenantByLoginIdentifier(pool, companyId, loginIdentifier);
    } else {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Authentication required to select an organization');
      return;
    }

    if (!account) {
      sendFailure(res, 403, 'FORBIDDEN', 'You do not have access to this organization');
      return;
    }

    try {
      assertAccountMayLogin(account);
    } catch (e) {
      if (e instanceof OrganizationAccessDeniedError) {
        sendOrganizationAccessFailure(res, e);
        return;
      }
      throw e;
    }

    const client = await pool.connect();
    try {
      const result = await completeLoginForAccount(client, account, ctx, {
        skipTrialBootstrap: true,
      });

      if (result.kind === 'mfa_required') {
        sendSuccess(res, {
          mfaRequired: true,
          mfaToken: result.mfaToken,
          loginEventId: result.loginEventId,
          user: result.user,
          tenant: result.tenant,
          company: result.company,
        });
        return;
      }
      if (result.kind === 'mfa_setup_required') {
        sendSuccess(res, {
          mfaSetupRequired: true,
          mfaSetupToken: result.mfaSetupToken,
          loginEventId: result.loginEventId,
          user: result.user,
          tenant: result.tenant,
          company: result.company,
        });
        return;
      }

      sendSuccess(res, {
        token: result.token,
        loginEventId: result.loginEventId,
        user: result.user,
        tenant: result.tenant,
        company: result.company,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    if (e instanceof OrganizationAccessDeniedError) {
      sendOrganizationAccessFailure(res, e);
      return;
    }
    if (e instanceof Error && e.message.includes('tenant selection token')) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Organization selection session expired. Please sign in again.');
      return;
    }
    handleRouteError(res, e);
  }
});

/**
 * Legacy pre-login org picker (removed from cloud UI). Old cached clients call this
 * without a JWT; return an empty list instead of falling through to authMiddleware.
 */
authRouter.get('/auth/tenants', publicIntrospectionLimiter, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  sendSuccess(res, []);
});

authRouter.get('/auth/public-config', publicIntrospectionLimiter, (_req, res) => {
  sendSuccess(res, {
    selfSignupEnabled: isEnvFlagEnabled('ALLOW_SELF_SIGNUP'),
    trialSignupEnabled:
      isEnvFlagEnabled('ALLOW_TRIAL_SIGNUP') || isEnvFlagEnabled('ALLOW_SELF_SIGNUP'),
    organizationApprovalRequired: isOrganizationApprovalEnabled(),
    captchaRequired: false,
    captcha: null,
  });
});

authRouter.post('/auth/register-tenant', registerLimiter, async (req, res) => {
  const allow = isEnvFlagEnabled('ALLOW_SELF_SIGNUP');
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
    phone,
    address,
    country,
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

  let registrationReference = '';

  try {
    await withTransaction(async (client) => {
      await assertUserIdentityAvailable(client, {
        email: emailVal,
        username: adminUsername.trim(),
      });

      const reg = await registerPendingOrganization(client, {
        tenantId,
        companyName: tenantDisplayName,
        email: emailVal,
        phone: phone?.trim(),
        address: address?.trim(),
        country: country?.trim(),
      });
      registrationReference = reg.registrationReference;

      await client.query(
        `INSERT INTO users (id, tenant_id, username, name, role, password_hash, email, is_active, last_tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $2)`,
        [userId, tenantId, adminUsername.trim(), adminName.trim(), 'Admin', passwordHash, emailVal]
      );

      await ensureUserTenantMembership(client, userId, tenantId, 'Admin');

      await bootstrapNewOrganizationData(client, tenantId, {
        skipTrial: isOrganizationApprovalEnabled(),
      });
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

    const pending = isOrganizationApprovalEnabled();
    sendSuccess(
      res,
      {
        tenantId,
        registrationReference,
        status: pending ? 'PENDING' : 'ACTIVE',
        pendingApproval: pending,
        trialDaysRemaining: pending ? 0 : 14,
        message: pending
          ? 'Your organization registration has been submitted and is awaiting approval.'
          : `Organization "${tenantDisplayName}" created. Sign in with your email and password.`,
      },
      201
    );
  } catch (e: unknown) {
    if (e instanceof UserIdentityConflictError) {
      sendFailure(res, 409, e.code, e.message, identityConflictApiDetails(e.conflicts));
      return;
    }
    const err = e as { code?: string };
    if (err.code === '23505') {
      sendFailure(res, 409, 'DUPLICATE', 'This organization ID, email, or username already exists.');
      return;
    }
    handleRouteError(res, e);
  }
});
