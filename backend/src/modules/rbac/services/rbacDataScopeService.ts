/**
 * A5.1.4 — RBAC data scope administration service.
 */
import type pg from 'pg';
import { z } from 'zod';
import { withTransaction } from '../../../db/pool.js';
import { invalidateAuthUserCache } from '../../../middleware/authMiddleware.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { isScopeDimension, SCOPE_DIMENSIONS, type ScopeDimension } from '../../../auth/dataScopeTypes.js';
import { isRbacV2DataScopeEnabled } from '../../../auth/rbacDataScopeFeatureFlag.js';
import { recordRbacScopeAssignment, recordRbacScopeHashChange } from '../../../auth/rbacV2Metrics.js';
import { DataScopeRepository } from '../repositories/DataScopeRepository.js';
import { RbacRepository } from '../repositories/RbacRepository.js';
import { appendRbacAuditLog } from './rbacAuditService.js';
import { buildRbacAuditMeta } from './rbacAuditMeta.js';

export const assignUserScopeSchema = z.object({
  userId: z.string().min(1),
  dimension: z.enum(SCOPE_DIMENSIONS),
  mode: z.enum(['all', 'assigned']),
  entityIds: z.array(z.string().min(1)).optional(),
  reason: z.string().max(500).optional(),
});

export type UserScopeSummary = {
  userId: string;
  scopes: {
    dimension: ScopeDimension;
    mode: 'all' | 'assigned';
    entityIds: string[];
    rows: { id: string; entityId: string | null }[];
  }[];
};

function requireDataScopeEnabled(): void {
  if (!isRbacV2DataScopeEnabled()) {
    throw Object.assign(new Error('RBAC v2 data scope is not enabled'), { code: 'FEATURE_DISABLED' });
  }
}

export async function listUserDataScopes(tenantId: string, userId: string): Promise<UserScopeSummary> {
  requireDataScopeEnabled();
  const repo = new DataScopeRepository(tenantId);
  const rows = await repo.listActiveUserScopes(userId);
  const scopes = SCOPE_DIMENSIONS.map((dimension) => {
    const dimRows = rows.filter((r) => r.dimension === dimension);
    if (dimRows.length === 0) {
      return { dimension, mode: 'all' as const, entityIds: [] as string[], rows: [] };
    }
    if (dimRows.some((r) => r.entity_id === null)) {
      return {
        dimension,
        mode: 'all' as const,
        entityIds: [],
        rows: dimRows.map((r) => ({ id: r.id, entityId: r.entity_id })),
      };
    }
    const entityIds = dimRows.map((r) => r.entity_id!).filter(Boolean);
    return {
      dimension,
      mode: 'assigned' as const,
      entityIds,
      rows: dimRows.map((r) => ({ id: r.id, entityId: r.entity_id })),
    };
  });
  return { userId, scopes };
}

export async function assignUserDataScope(
  req: AuthedRequest,
  tenantId: string,
  actorUserId: string,
  body: z.infer<typeof assignUserScopeSchema>
): Promise<UserScopeSummary> {
  requireDataScopeEnabled();
  if (!isScopeDimension(body.dimension)) {
    throw Object.assign(new Error('Invalid scope dimension'), { code: 'VALIDATION_ERROR' });
  }
  if (body.mode === 'assigned' && (!body.entityIds || body.entityIds.length === 0)) {
    throw Object.assign(new Error('entityIds required when mode is assigned'), { code: 'VALIDATION_ERROR' });
  }

  const meta = buildRbacAuditMeta(req);
  const before = await listUserDataScopes(tenantId, body.userId);

  await withTransaction(async (client) => {
    const scopeRepo = new DataScopeRepository(tenantId, client);
    const rbacRepo = new RbacRepository(tenantId, client);

    await scopeRepo.deactivateUserDimensionScopes(client, body.userId, body.dimension);

    if (body.mode === 'all') {
      await scopeRepo.insertUserScope(client, {
        userId: body.userId,
        dimension: body.dimension,
        entityId: null,
        grantedBy: actorUserId,
        reason: body.reason ?? null,
      });
    } else {
      for (const entityId of body.entityIds ?? []) {
        await scopeRepo.insertUserScope(client, {
          userId: body.userId,
          dimension: body.dimension,
          entityId,
          grantedBy: actorUserId,
          reason: body.reason ?? null,
        });
      }
    }

    await rbacRepo.incrementUserAccessVersion(body.userId);

    const after = await listUserDataScopes(tenantId, body.userId);
    await appendRbacAuditLog(client, {
      tenantId,
      actorUserId,
      actorType: meta.actorType,
      sessionId: meta.sessionId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      action: before.scopes.some((s) => s.dimension === body.dimension && s.rows.length > 0)
        ? 'SCOPE_UPDATED'
        : 'SCOPE_ASSIGNED',
      targetType: 'user',
      targetUserId: body.userId,
      reason: body.reason ?? null,
      beforeState: before,
      afterState: after,
    });
  });

  invalidateAuthUserCache(body.userId, tenantId);
  recordRbacScopeAssignment(req, 'assign');
  recordRbacScopeHashChange(req);

  return listUserDataScopes(tenantId, body.userId);
}

export async function removeUserDataScope(
  req: AuthedRequest,
  tenantId: string,
  actorUserId: string,
  scopeId: string,
  reason?: string
): Promise<UserScopeSummary | null> {
  requireDataScopeEnabled();
  const meta = buildRbacAuditMeta(req);

  let targetUserId: string | null = null;
  await withTransaction(async (client) => {
    const scopeRepo = new DataScopeRepository(tenantId, client);
    const rbacRepo = new RbacRepository(tenantId, client);

    const existing = await client.query<{ user_id: string; dimension: ScopeDimension }>(
      `SELECT user_id, dimension FROM rbac_user_data_scopes
       WHERE tenant_id = $1 AND id = $2 AND is_active = TRUE`,
      [tenantId, scopeId]
    );
    if (existing.rows.length === 0) {
      throw Object.assign(new Error('Scope assignment not found'), { code: 'NOT_FOUND' });
    }
    targetUserId = existing.rows[0].user_id;
    const before = await listUserDataScopes(tenantId, targetUserId);

    const ok = await scopeRepo.deactivateUserScopeById(client, scopeId);
    if (!ok) {
      throw Object.assign(new Error('Scope assignment not found'), { code: 'NOT_FOUND' });
    }

    await rbacRepo.incrementUserAccessVersion(targetUserId);

    const after = await listUserDataScopes(tenantId, targetUserId);
    await appendRbacAuditLog(client, {
      tenantId,
      actorUserId,
      actorType: meta.actorType,
      sessionId: meta.sessionId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      action: 'SCOPE_REMOVED',
      targetType: 'user',
      targetUserId,
      reason: reason ?? null,
      beforeState: before,
      afterState: after,
    });
  });

  if (!targetUserId) return null;
  invalidateAuthUserCache(targetUserId, tenantId);
  recordRbacScopeAssignment(req, 'remove');
  recordRbacScopeHashChange(req);
  return listUserDataScopes(tenantId, targetUserId);
}
