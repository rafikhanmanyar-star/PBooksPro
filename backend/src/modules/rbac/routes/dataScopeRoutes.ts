import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requirePermissionV2 } from '../../../auth/authorizeV2.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { isRbacV2DataScopeEnabled, assertRbacV2DataScopeConfiguration } from '../../../auth/rbacDataScopeFeatureFlag.js';
import {
  assignUserDataScope,
  assignUserScopeSchema,
  listUserDataScopes,
  removeUserDataScope,
} from '../services/rbacDataScopeService.js';

export const dataScopeRouter = Router();

function requireDataScopeFeature(_req: AuthedRequest, res: import('express').Response, next: import('express').NextFunction) {
  const config = assertRbacV2DataScopeConfiguration();
  if (!config.ok) {
    sendFailure(res, 503, config.code, config.message);
    return;
  }
  if (!isRbacV2DataScopeEnabled()) {
    sendFailure(res, 503, 'FEATURE_DISABLED', 'RBAC v2 data scope is not enabled');
    return;
  }
  next();
}

dataScopeRouter.use(requireDataScopeFeature);

dataScopeRouter.get(
  '/rbac/scopes/users/:userId',
  requirePermissionV2('administration.scopes.edit', 'users.read'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const { userId } = req.params;
    if (!tenantId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const summary = await listUserDataScopes(tenantId, userId);
      sendSuccess(res, summary);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

dataScopeRouter.put(
  '/rbac/scopes/users/:userId',
  requirePermissionV2('administration.scopes.edit'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const actorId = req.userId;
    const { userId } = req.params;
    if (!tenantId || !actorId || !userId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = assignUserScopeSchema.safeParse({ ...req.body, userId });
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid body');
      return;
    }
    try {
      const summary = await assignUserDataScope(req, tenantId, actorId, parsed.data);
      sendSuccess(res, summary);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'VALIDATION_ERROR') {
        sendFailure(res, 400, 'VALIDATION_ERROR', err.message ?? 'Validation error');
        return;
      }
      handleRouteError(res, e);
    }
  }
);

dataScopeRouter.delete(
  '/rbac/scopes/:scopeId',
  requirePermissionV2('administration.scopes.edit'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const actorId = req.userId;
    const { scopeId } = req.params;
    if (!tenantId || !actorId || !scopeId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    try {
      const summary = await removeUserDataScope(req, tenantId, actorId, scopeId, reason);
      if (!summary) {
        sendFailure(res, 404, 'NOT_FOUND', 'Scope assignment not found');
        return;
      }
      sendSuccess(res, summary);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'NOT_FOUND') {
        sendFailure(res, 404, 'NOT_FOUND', err.message ?? 'Not found');
        return;
      }
      handleRouteError(res, e);
    }
  }
);
