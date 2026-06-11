import type pg from 'pg';
import {
  appendAuditEvent,
  type AppendAuditEventInput,
  type AuditAction,
  type AuditModule,
  type AuditRequestContext,
} from '../services/enterpriseAuditService.js';

export type AuditMutationContext = {
  tenantId: string;
  userId?: string | null;
  email?: string | null;
  module: AuditModule | string;
  entityType: string;
  action: AuditAction | string;
  entityId?: string | null;
  summary?: string | null;
  oldValue?: unknown;
  requestCtx?: AuditRequestContext;
};

export type AuditMutationResult<T> = {
  result: T;
  auditEventId: string;
};

/**
 * Runs a mutation inside an open transaction and records audit_events.
 * Pass the same PoolClient used for the mutation.
 */
export async function withAudit<T>(
  client: pg.PoolClient,
  ctx: AuditMutationContext,
  fn: () => Promise<T>
): Promise<AuditMutationResult<T>> {
  const result = await fn();
  let entityId = ctx.entityId ?? null;
  if (!entityId && result && typeof result === 'object' && 'id' in result) {
    entityId = String((result as { id: unknown }).id);
  }

  const auditEventId = await appendAuditEvent(client, {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    email: ctx.email,
    module: ctx.module,
    action: ctx.action,
    entityType: ctx.entityType,
    entityId,
    summary: ctx.summary,
    oldValue: ctx.oldValue,
    newValue: result,
    ctx: ctx.requestCtx,
  } satisfies AppendAuditEventInput);

  return { result, auditEventId };
}

/**
 * Audit wrapper when old/new values are known explicitly (updates/deletes).
 */
export async function withAuditValues<T>(
  client: pg.PoolClient,
  ctx: AuditMutationContext & { newValue?: unknown },
  fn: () => Promise<T>
): Promise<AuditMutationResult<T>> {
  const result = await fn();
  const auditEventId = await appendAuditEvent(client, {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    email: ctx.email,
    module: ctx.module,
    action: ctx.action,
    entityType: ctx.entityType,
    entityId: ctx.entityId,
    summary: ctx.summary,
    oldValue: ctx.oldValue,
    newValue: ctx.newValue ?? result,
    ctx: ctx.requestCtx,
  });
  return { result, auditEventId };
}
