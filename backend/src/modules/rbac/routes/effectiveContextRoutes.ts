import { Router } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { isRbacV2AuthorizationEngineEnabled } from '../../../auth/rbacAuthorizationFeatureFlag.js';
import {
  serializeEffectiveContext,
  validateEffectiveContextAccess,
} from './effectiveContextPolicy.js';

export const effectiveContextRouter = Router();

effectiveContextRouter.get('/rbac/effective-context', async (req: AuthedRequest, res) => {
  try {
    const err = validateEffectiveContextAccess({
      engineEnabled: isRbacV2AuthorizationEngineEnabled(),
      tenantId: req.tenantId,
      userId: req.userId,
      hasUserIdQueryParam: 'userId' in req.query,
      effectiveAccess: req.effectiveAccess,
    });
    if (err) {
      sendFailure(res, err.status, err.code, err.message);
      return;
    }
    sendSuccess(res, serializeEffectiveContext(req.effectiveAccess!));
  } catch (e) {
    handleRouteError(res, e);
  }
});
