import { Router } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requireAnyPermission } from '../../../middleware/rbacMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError } from '../../../utils/apiResponse.js';
import { buildRbacV2CatalogResponse } from '../services/rbacV2CatalogService.js';

export const securityCatalogRouter = Router();

/** Read-only RBAC 2.0 permission catalog (metadata only — no assignment or mutation). */
securityCatalogRouter.get(
  '/security/permissions/catalog',
  requireAnyPermission('permissions.view', 'permissions.read', 'permissions.manage'),
  (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      sendSuccess(res, buildRbacV2CatalogResponse());
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);
