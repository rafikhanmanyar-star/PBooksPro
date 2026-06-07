import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { getPool } from '../db/pool.js';
import { signAccessToken, verifyAccessToken, verifyMfaToken } from '../auth/jwt.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../utils/apiResponse.js';
import {
  confirmMfaEnable,
  disableMfa,
  getMfaStatus,
  startMfaSetup,
  verifyMfaForLogin,
} from '../services/auth/mfaService.js';

export const mfaRouter = Router();

const mfaVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: { code: 'RATE_LIMIT', message: 'Too many MFA attempts. Try again later.' },
  },
});

type MfaAuthedRequest = AuthedRequest & {
  mfaSetupToken?: string;
  loginEventId?: string;
};

async function loadUserTenant(
  userId: string,
  tenantId: string
): Promise<{
  id: string;
  username: string;
  name: string;
  role: string;
  tenantId: string;
  displayTimezone: string | null;
  tenantName: string;
} | null> {
  const pool = getPool();
  const r = await pool.query<{
    id: string;
    username: string;
    name: string;
    role: string;
    tenant_id: string;
    display_timezone: string | null;
    tenant_name: string;
  }>(
    `SELECT u.id, u.username, u.name, u.role, u.tenant_id, u.display_timezone, t.name AS tenant_name
     FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     WHERE u.id = $1 AND u.tenant_id = $2 AND u.is_active = TRUE`,
    [userId, tenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    tenantId: row.tenant_id,
    displayTimezone: row.display_timezone ?? null,
    tenantName: row.tenant_name,
  };
}

function formatAuthPayload(
  user: NonNullable<Awaited<ReturnType<typeof loadUserTenant>>>,
  token: string,
  loginEventId?: string
) {
  return {
    token,
    loginEventId,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      displayTimezone: user.displayTimezone,
    },
    tenant: {
      id: user.tenantId,
      name: user.tenantName,
      companyName: user.tenantName,
    },
  };
}

/** Accepts Bearer access JWT or MFA setup JWT for setup/enable during forced enrollment. */
async function mfaSetupAuthMiddleware(
  req: MfaAuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Missing or invalid Authorization header');
    return;
  }
  const token = auth.slice(7);
  try {
    const access = verifyAccessToken(token);
    req.userId = access.sub;
    req.tenantId = access.tenantId;
    req.role = access.role;
    next();
    return;
  } catch {
    /* try setup token */
  }
  try {
    const setup = verifyMfaToken(token, 'mfa_setup');
    req.userId = setup.sub;
    req.tenantId = setup.tenantId;
    req.role = setup.role;
    req.mfaSetupToken = token;
    req.loginEventId = setup.loginEventId;
    next();
  } catch {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
}

const totpCodeSchema = z.object({
  code: z.string().min(6).max(8),
});

mfaRouter.get('/auth/mfa/status', authMiddleware, async (req, res) => {
  const authed = req as AuthedRequest;
  if (!authed.userId || !authed.role) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Not authenticated');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const status = await getMfaStatus(client, authed.userId, authed.role);
      sendSuccess(res, status);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

mfaRouter.post('/auth/mfa/setup', mfaSetupAuthMiddleware, async (req, res) => {
  const authed = req as MfaAuthedRequest;
  if (!authed.userId || !authed.tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Not authenticated');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const userRow = await client.query<{ username: string; email: string | null }>(
        `SELECT username, email FROM users WHERE id = $1 AND tenant_id = $2`,
        [authed.userId, authed.tenantId]
      );
      const u = userRow.rows[0];
      const label = u?.email ?? u?.username ?? authed.userId;
      const result = await startMfaSetup(client, {
        userId: authed.userId,
        tenantId: authed.tenantId,
        accountLabel: label,
      });
      sendSuccess(res, result);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

mfaRouter.post('/auth/mfa/enable', mfaSetupAuthMiddleware, async (req, res) => {
  const parsed = totpCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Valid authenticator code required');
    return;
  }
  const authed = req as MfaAuthedRequest;
  if (!authed.userId || !authed.tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Not authenticated');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const { backupCodes } = await confirmMfaEnable(client, authed.userId, parsed.data.code);
      const payload: Record<string, unknown> = { backupCodes };

      if (authed.mfaSetupToken) {
        const profile = await loadUserTenant(authed.userId, authed.tenantId);
        if (!profile) {
          sendFailure(res, 401, 'UNAUTHORIZED', 'User not found');
          return;
        }
        const token = signAccessToken(profile.id, profile.tenantId, profile.role);
        Object.assign(payload, formatAuthPayload(profile, token, authed.loginEventId));
      }

      sendSuccess(res, payload);
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

const verifySchema = z
  .object({
    mfaToken: z.string().min(1),
    totpCode: z.string().min(6).max(8).optional(),
    recoveryCode: z.string().min(8).max(32).optional(),
  })
  .refine((d) => d.totpCode || d.recoveryCode, {
    message: 'Provide totpCode or recoveryCode',
  });

mfaRouter.post('/auth/mfa/verify', mfaVerifyLimiter, async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'mfaToken and totpCode or recoveryCode required');
    return;
  }
  const { mfaToken, totpCode, recoveryCode } = parsed.data;
  try {
    const challenge = verifyMfaToken(mfaToken, 'mfa_challenge');
    const pool = getPool();
    const client = await pool.connect();
    try {
      const { usedRecoveryCode } = await verifyMfaForLogin(client, challenge.sub, {
        totpCode,
        recoveryCode,
      });
      const profile = await loadUserTenant(challenge.sub, challenge.tenantId);
      if (!profile) {
        sendFailure(res, 401, 'UNAUTHORIZED', 'User not found');
        return;
      }
      const token = signAccessToken(profile.id, profile.tenantId, profile.role);
      sendSuccess(res, {
        ...formatAuthPayload(profile, token, challenge.loginEventId),
        usedRecoveryCode,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});

mfaRouter.post('/auth/mfa/disable', authMiddleware, async (req, res) => {
  const parsed = totpCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Valid authenticator code required');
    return;
  }
  const authed = req as AuthedRequest;
  if (!authed.userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Not authenticated');
    return;
  }
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await disableMfa(client, authed.userId, parsed.data.code);
      sendSuccess(res, { ok: true });
    } finally {
      client.release();
    }
  } catch (e) {
    handleRouteError(res, e);
  }
});
