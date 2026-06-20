/**
 * RBAC 2.0 — all catalog permission keys (break-glass effective union).
 */
import { PERMISSION_CATALOG } from '../../../auth/permissionCatalog.js';
import type { Permission } from '../../../auth/permissions.js';

export function allCatalogPermissionKeys(): Permission[] {
  return PERMISSION_CATALOG.map((entry) => entry.key) as Permission[];
}
