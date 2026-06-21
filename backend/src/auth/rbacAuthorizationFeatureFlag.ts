/// backend/src/auth/rbacAuthorizationFeatureFlag.ts

import { logger } from '../utils/logger.js';

export function isRbacV2AuthorizationEngineEnabled(): boolean {
  const raw = process.env.RBAC_V2_AUTHORIZATION_ENGINE;
  logger.info('[RBAC_DEBUG] AUTH_ENGINE_CHECK', {
    RBAC_V2_AUTHORIZATION_ENGINE: raw ?? null,
  });

  return raw === 'true';
}