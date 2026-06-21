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
import { isV2AuthorizationActive } from '../../../auth/authorizationMode.js';
import { hasPermission } from '../../../auth/permissionEvaluator.js';

export const permissionsRouter = Router();

/** Current user's resolved permissions (any authenticated user). */
permissionsRouter.get('/permissions/me', async (req: AuthedRequest, res) => {
  const role = req.role ?? '';
  const enterpriseRole = resolveEnterpriseRole(role);

  let permissions;
  if (isV2AuthorizationActive() && req.effectiveAccess) {
    // Derive the v1 permission set by evaluating each known v1 key against the V2 effective
    // access context. This handles V2 roles that use only granular keys (e.g.
    // 'accounting.access') — toLegacyPermissionArray would return [] for those, causing a
    // wrong fallback to the legacy role matrix.
    permissions = ALL_PERMISSIONS.filter((p) => hasPermission(req.effectiveAccess!, p, enterpriseRole));
  } else if (req.resolvedPermissions && req.resolvedPermissions.length > 0) {
    permissions = req.resolvedPermissions;
  } else {
    permissions = permissionsForRole(role);
  }

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
