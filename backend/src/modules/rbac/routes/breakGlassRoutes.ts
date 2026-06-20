import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { withTransaction } from '../../../db/pool.js';
import { extractClientIp, extractUserAgent } from '../../../utils/requestContext.js';
import {
  isRbacV2BreakGlassEnabled,
  isRbacV2RoleManagementEnabled,
} from '../services/rbacV2FeatureFlag.js';
import {
  activateBreakGlassSession,
  deactivateBreakGlassSession,
  getBreakGlassStatus,
  BreakGlassError,
} from '../services/rbacBreakGlassService.js';

export const breakGlassRouter = Router();

function requireBreakGlassFeature(
  req: AuthedRequest,
  res: import('express').Response,
  next: import('express').NextFunction
) {
  if (!isRbacV2RoleManagementEnabled()) {
    sendFailure(res, 503, 'FEATURE_DISABLED', 'RBAC v2 role management is not enabled');
    return;
  }
  if (!isRbacV2BreakGlassEnabled()) {
    sendFailure(res, 503, 'FEATURE_DISABLED', 'RBAC v2 break-glass is not enabled');
    return;
  }
  next();
}

function handleBreakGlassError(res: import('express').Response, e: unknown): boolean {
  if (e instanceof BreakGlassError) {
    const status =
      e.code === 'CAPABILITY_DENIED' || e.code === 'FORBIDDEN'
        ? 403
        : e.code === 'SESSION_ALREADY_ACTIVE'
          ? 409
          : e.code === 'MFA_INVALID'
            ? 401
            : e.code === 'MFA_REQUIRED'
              ? 400
              : 400;
    sendFailure(res, status, e.code, e.message);
    return true;
  }
  return false;
}

const activateSchema = z
  .object({
    totpCode: z.string().min(6).max(8).optional(),
    recoveryCode: z.string().min(8).max(32).optional(),
    durationMinutes: z.number().int().min(1).max(60).optional(),
  })
  .refine((d) => d.totpCode || d.recoveryCode, {
    message: 'Provide totpCode or recoveryCode',
  });

breakGlassRouter.use(requireBreakGlassFeature);

breakGlassRouter.get('/rbac/break-glass/status', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    sendSuccess(res, await getBreakGlassStatus(tenantId, userId));
  } catch (e) {
    handleRouteError(res, e);
  }
});

breakGlassRouter.post('/rbac/break-glass/activate', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  const role = req.role;
  if (!tenantId || !userId || !role) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  if (req.sessionType === 'break_glass') {
    sendFailure(res, 409, 'SESSION_ALREADY_ACTIVE', 'Break-glass session already active');
    return;
  }
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
    return;
  }
  try {
    const result = await withTransaction((client) =>
      activateBreakGlassSession({
        tenantId,
        userId,
        role,
        totpCode: parsed.data.totpCode,
        recoveryCode: parsed.data.recoveryCode,
        durationMinutes: parsed.data.durationMinutes,
        ipAddress: extractClientIp(req),
        userAgent: extractUserAgent(req),
        client,
      })
    );
    sendSuccess(res, result, 201);
  } catch (e) {
    if (handleBreakGlassError(res, e)) return;
    handleRouteError(res, e);
  }
});

breakGlassRouter.post('/rbac/break-glass/deactivate', async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  const userId = req.userId;
  if (!tenantId || !userId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const ended = await withTransaction((client) =>
      deactivateBreakGlassSession({
        tenantId,
        userId,
        sessionId: req.breakGlassSessionId,
        client,
      })
    );
    sendSuccess(res, { deactivated: ended });
  } catch (e) {
    if (handleBreakGlassError(res, e)) return;
    handleRouteError(res, e);
  }
});
