import { Router } from 'express';
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  buildPermissionMatrix,
  permissionsForRole,
  resolveEnterpriseRole,
  ENTERPRISE_ROLE_LABELS,
  PERMISSION_LABELS,
  ALL_PERMISSIONS,
} from '../auth/permissions.js';

export const permissionsRouter = Router();

/** Current user's resolved permissions (any authenticated user). */
permissionsRouter.get('/permissions/me', async (req: AuthedRequest, res) => {
  const role = req.role ?? '';
  const enterpriseRole = resolveEnterpriseRole(role);
  sendSuccess(res, {
    role,
    enterpriseRole,
    enterpriseRoleLabel: ENTERPRISE_ROLE_LABELS[enterpriseRole],
    permissions: permissionsForRole(role),
  });
});

/** Full permission matrix (admin / finance roles). */
permissionsRouter.get('/permissions/matrix', requirePermission('permissions.read'), async (_req, res) => {
  const matrix = buildPermissionMatrix();
  sendSuccess(res, {
    permissions: ALL_PERMISSIONS.map((p) => ({ key: p, label: PERMISSION_LABELS[p] })),
    roles: matrix.map((row) => ({
      role: row.role,
      label: row.label,
      permissions: row.permissions,
    })),
  });
});
