/**
 * RBAC 2.0 C2 — SYSTEM_OWNER break-glass session service.
 */
import type pg from 'pg';
import { issueBreakGlassAccessToken } from '../../../auth/accessTokenIssuance.js';
import { invalidateAuthUserCache } from '../../../middleware/authMiddleware.js';
import { verifyMfaForLogin, getUserMfaSettings } from '../../../services/auth/mfaService.js';
import { appendRbacAuditLog } from './rbacAuditService.js';
import { BreakGlassRepository, type BreakGlassSessionRow } from '../repositories/BreakGlassRepository.js';

export const BREAK_GLASS_DEFAULT_MINUTES = 15;
export const BREAK_GLASS_MAX_MINUTES = 60;
export const BREAK_GLASS_MAX_CAPABILITIES_PER_TENANT = 2;

export class BreakGlassError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'BreakGlassError';
    this.code = code;
  }
}

export function clampBreakGlassDurationMinutes(requested?: number): number {
  const value = requested ?? BREAK_GLASS_DEFAULT_MINUTES;
  return Math.min(BREAK_GLASS_MAX_MINUTES, Math.max(1, value));
}

export type BreakGlassStatus = {
  active: boolean;
  sessionId?: string;
  expiresAt?: string;
  activatedAt?: string;
  userId?: string;
};

export async function activateBreakGlassSession(input: {
  tenantId: string;
  userId: string;
  role: string;
  totpCode?: string;
  recoveryCode?: string;
  durationMinutes?: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  client: pg.PoolClient;
}): Promise<{ token: string; sessionId: string; expiresAt: string }> {
  const repo = new BreakGlassRepository(input.client);
  await repo.expireStaleSessions();

  const hasCapability = await repo.userHasCapability(input.tenantId, input.userId);
  if (!hasCapability) {
    throw new BreakGlassError('CAPABILITY_DENIED', 'User is not authorized for break-glass activation');
  }

  const mfaSettings = await getUserMfaSettings(input.client, input.userId);
  if (!mfaSettings?.enabled) {
    throw new BreakGlassError('MFA_REQUIRED', 'MFA must be enabled before break-glass activation');
  }

  if (!input.totpCode && !input.recoveryCode) {
    throw new BreakGlassError('MFA_REQUIRED', 'TOTP code or recovery code is required');
  }

  try {
    await verifyMfaForLogin(input.client, input.userId, {
      totpCode: input.totpCode,
      recoveryCode: input.recoveryCode,
    });
  } catch {
    throw new BreakGlassError('MFA_INVALID', 'Invalid MFA verification code');
  }

  const existingTenantSession = await repo.getActiveSessionForTenant(input.tenantId);
  if (existingTenantSession && existingTenantSession.user_id !== input.userId) {
    throw new BreakGlassError(
      'SESSION_ALREADY_ACTIVE',
      'Another break-glass session is already active for this organization'
    );
  }

  const durationMinutes = clampBreakGlassDurationMinutes(input.durationMinutes);
  const expiresAt = new Date(Date.now() + durationMinutes * 60_000);

  let sessionId: string;
  if (existingTenantSession?.user_id === input.userId) {
    await repo.endSession(existingTenantSession.id, 'superseded');
    const session = await repo.createSession({
      tenantId: input.tenantId,
      userId: input.userId,
      expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    sessionId = session.id;
  } else {
    const session = await repo.createSession({
      tenantId: input.tenantId,
      userId: input.userId,
      expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    sessionId = session.id;
  }

  const token = await issueBreakGlassAccessToken({
    userId: input.userId,
    tenantId: input.tenantId,
    role: input.role,
    sessionId,
    expiresAt,
    client: input.client,
  });

  await appendRbacAuditLog(input.client, {
    tenantId: input.tenantId,
    actorUserId: input.userId,
    actorType: 'system_owner',
    action: 'BREAK_GLASS_ACTIVATED',
    targetType: 'user',
    targetUserId: input.userId,
    sessionId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    afterState: {
      sessionId,
      expiresAt: expiresAt.toISOString(),
      durationMinutes,
    },
  });

  invalidateAuthUserCache(input.userId, input.tenantId);
  return { token, sessionId, expiresAt: expiresAt.toISOString() };
}

export async function deactivateBreakGlassSession(input: {
  tenantId: string;
  userId: string;
  sessionId?: string;
  client: pg.PoolClient;
}): Promise<boolean> {
  const repo = new BreakGlassRepository(input.client);
  await repo.expireStaleSessions();

  const active =
    (input.sessionId ? await repo.getSessionById(input.sessionId) : null) ??
    (await repo.getActiveSessionForUser(input.tenantId, input.userId));

  if (!active || active.ended_at || active.expires_at <= new Date()) {
    return false;
  }
  if (active.user_id !== input.userId) {
    throw new BreakGlassError('FORBIDDEN', 'Only the session holder may deactivate break-glass');
  }

  const ended = await repo.endSession(active.id, 'manual');
  if (!ended) return false;

  await appendRbacAuditLog(input.client, {
    tenantId: input.tenantId,
    actorUserId: input.userId,
    actorType: 'system_owner',
    action: 'BREAK_GLASS_EXPIRED',
    targetType: 'user',
    targetUserId: input.userId,
    sessionId: active.id,
    reason: 'manual',
    beforeState: { sessionId: active.id, expiresAt: active.expires_at.toISOString() },
  });

  invalidateAuthUserCache(input.userId, input.tenantId);
  return true;
}

export async function getBreakGlassStatus(
  tenantId: string,
  userId: string,
  client?: pg.PoolClient
): Promise<BreakGlassStatus> {
  const pool = client;
  if (!pool) {
    const { getPool } = await import('../../../db/pool.js');
    const conn = await getPool().connect();
    try {
      return getBreakGlassStatus(tenantId, userId, conn);
    } finally {
      conn.release();
    }
  }

  const repo = new BreakGlassRepository(pool);
  await repo.expireStaleSessions();
  const session = await repo.getActiveSessionForUser(tenantId, userId);
  if (!session) {
    return { active: false };
  }
  return {
    active: true,
    sessionId: session.id,
    expiresAt: session.expires_at.toISOString(),
    activatedAt: session.activated_at.toISOString(),
    userId: session.user_id,
  };
}

export async function validateBreakGlassSession(
  sessionId: string,
  tenantId: string,
  userId: string,
  client: pg.PoolClient
): Promise<BreakGlassSessionRow | null> {
  const repo = new BreakGlassRepository(client);
  await repo.expireStaleSessions();
  const session = await repo.getSessionById(sessionId);
  if (
    !session ||
    session.tenant_id !== tenantId ||
    session.user_id !== userId ||
    session.ended_at ||
    session.expires_at <= new Date()
  ) {
    if (session && !session.ended_at && session.expires_at <= new Date()) {
      await repo.endSession(session.id, 'expired');
      await appendRbacAuditLog(client, {
        tenantId: session.tenant_id,
        actorUserId: session.user_id,
        actorType: 'system_owner',
        action: 'BREAK_GLASS_EXPIRED',
        targetType: 'user',
        targetUserId: session.user_id,
        sessionId: session.id,
        reason: 'expired',
      }).catch(() => undefined);
    }
    return null;
  }
  return session;
}

export async function expireBreakGlassSessionById(
  client: pg.PoolClient,
  sessionId: string,
  reason: 'expired' | 'manual' | 'superseded' = 'expired'
): Promise<void> {
  const repo = new BreakGlassRepository(client);
  const session = await repo.getSessionById(sessionId);
  if (!session || session.ended_at) return;
  await repo.endSession(sessionId, reason);
  if (reason === 'expired') {
    await appendRbacAuditLog(client, {
      tenantId: session.tenant_id,
      actorUserId: session.user_id,
      actorType: 'system_owner',
      action: 'BREAK_GLASS_EXPIRED',
      targetType: 'user',
      targetUserId: session.user_id,
      sessionId,
      reason: 'expired',
    });
  }
}
