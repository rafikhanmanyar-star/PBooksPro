/**
 * RBAC 2.0 read-only security catalog (Phase 1 — no runtime authorization).
 */
import { buildSecurityCatalogPayload } from '../../../auth/permissionCatalog.js';

export function buildRbacV2CatalogResponse() {
  return buildSecurityCatalogPayload();
}
