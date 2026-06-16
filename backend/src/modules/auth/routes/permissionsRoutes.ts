import { Router } from 'express';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { requirePermission, requireAnyPermission } from '../../../middleware/rbacMiddleware.js';
import { sendSuccess } from '../../../utils/apiResponse.js';
import {
  buildPermissionMatrix,
  permissionsForRole,
  resolveEnterpriseRole,
  ENTERPRISE_ROLE_LABELS,
  PERMISSION_LABELS,
  ALL_PERMISSIONS,
} from '../../../auth/permissions.js';
import { buildStaticMatrixWithDbRoles } from '../../rbac/services/rbacService.js';

export const permissionsRouter = Router();

/** Current user's resolved permissions (any authenticated user). */
permissionsRouter.get('/permissions/me', async (req: AuthedRequest, res) => {
  const role = req.role ?? '';
  const enterpriseRole = resolveEnterpriseRole(role);
  const permissions =
    req.resolvedPermissions && req.resolvedPermissions.length > 0
      ? req.resolvedPermissions
      : permissionsForRole(role);
  sendSuccess(res, {
    role,
    enterpriseRole,
    enterpriseRoleLabel: ENTERPRISE_ROLE_LABELS[enterpriseRole],
    permissions,
  });
});

/** Full permission matrix (admin / finance roles). */
permissionsRouter.get('/permissions/matrix', requireAnyPermission('permissions.read', 'permissions.view'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  let matrix = buildPermissionMatrix();
  if (tenantId) {
    try {
      const dbRoles = await buildStaticMatrixWithDbRoles(tenantId);
      if (dbRoles.length > 0) {
        matrix = dbRoles.map((row) => ({
          role: row.role as typeof matrix[number]['role'],
          label: row.label,
          permissions: row.permissions,
        }));
      }
    } catch {
      /* fall back to static matrix */
    }
  }
  sendSuccess(res, {
    permissions: ALL_PERMISSIONS.map((p) => ({ key: p, label: PERMISSION_LABELS[p] })),
    roles: matrix.map((row) => ({
      role: row.role,
      label: row.label,
      permissions: row.permissions,
    })),
  });
});
