import type pg from 'pg';
import {
  type AuditAction,
  type AuditModule,
  type AuditRequestContext,
} from '../services/enterpriseAuditService.js';
import { recordDomainMutation } from './recordDomainMutation.js';

export type AuditMutationContext = {
  tenantId: string;
  userId?: string | null;
  email?: string | null;
  module: AuditModule | string;
  entityType: string;
  action: AuditAction | string;
  /** change_log action when it differs from audit action (e.g. workflow submit → update). */
  changeLogAction?: 'create' | 'update' | 'delete';
  entityId?: string | null;
  summary?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  requestCtx?: AuditRequestContext;
  version?: number;
  enqueueSync?: boolean;
};

export type AuditMutationResult<T> = {
  result: T;
  auditEventId: string;
};

/**
 * Runs a mutation inside an open transaction and records audit + change_log via recordDomainMutation.
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
  if (!entityId) {
    throw new Error('withAudit requires entityId on context or id on mutation result');
  }

  const changeLogAction =
    ctx.changeLogAction ??
    (ctx.action === 'create' || ctx.action === 'update' || ctx.action === 'delete'
      ? ctx.action
      : 'update');

  const auditEventId = await recordDomainMutation(client, {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    module: ctx.module,
    entityType: ctx.entityType,
    entityId,
    action: changeLogAction,
    auditAction: ctx.action,
    summary: ctx.summary ?? undefined,
    oldValue: ctx.oldValue,
    newValue: ctx.newValue ?? result,
    version: ctx.version,
    requestCtx: ctx.requestCtx,
    enqueueSync: ctx.enqueueSync,
  });

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
  return withAudit(client, ctx, fn);
}
