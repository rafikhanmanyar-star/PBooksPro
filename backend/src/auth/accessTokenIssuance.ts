/**
 * RBAC 2.0 Phase 3 — access token issuance with optional av claim.
 */
import type pg from 'pg';
import { signAccessToken, signBreakGlassAccessToken } from './jwt.js';
import { isRbacV2AuthorizationEngineEnabled } from './rbacAuthorizationFeatureFlag.js';
import { computeCurrentAccessVersionHash } from './accessVersionService.js';
import { computeBreakGlassAccessHash } from '../modules/rbac/services/rbacRoleVersionService.js';

export async function issueStandardAccessToken(
  userId: string,
  tenantId: string,
  role: string,
  client?: pg.PoolClient
): Promise<string> {
  const av =
    isRbacV2AuthorizationEngineEnabled()
      ? await computeCurrentAccessVersionHash(tenantId, userId, client)
      : undefined;
  return signAccessToken(userId, tenantId, role, { av });
}

export async function issueBreakGlassAccessToken(input: {
  userId: string;
  tenantId: string;
  role: string;
  sessionId: string;
  expiresAt: Date;
  client?: pg.PoolClient;
}): Promise<string> {
  const accessHash = computeBreakGlassAccessHash({
    tenantId: input.tenantId,
    userId: input.userId,
    sessionId: input.sessionId,
    expiresAt: input.expiresAt.toISOString(),
  });
  const av =
    isRbacV2AuthorizationEngineEnabled()
      ? await computeCurrentAccessVersionHash(input.tenantId, input.userId, input.client, {
          breakGlassSessionId: input.sessionId,
        })
      : undefined;
  return signBreakGlassAccessToken({
    userId: input.userId,
    tenantId: input.tenantId,
    role: input.role,
    sessionId: input.sessionId,
    expiresAt: input.expiresAt,
    accessHash,
    av,
  });
}
