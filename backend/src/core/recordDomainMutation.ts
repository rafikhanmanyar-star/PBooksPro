import type pg from 'pg';
import { appendAuditEvent, type AuditRequestContext } from '../services/enterpriseAuditService.js';
import { appendChangeLog, type ChangeLogAction } from '../services/changeLogService.js';
import { enqueueSyncMutation } from '../services/syncQueueService.js';

export type DomainMutationInput = {
  tenantId: string;
  userId?: string | null;
  module: string;
  entityType: string;
  entityId: string;
  /** Stored in change_log / sync_queue (create | update | delete). */
  action: ChangeLogAction;
  /** Optional richer audit_events action (defaults to `action`). */
  auditAction?: string;
  summary?: string;
  oldValue?: unknown;
  newValue?: unknown;
  version?: number;
  requestCtx?: AuditRequestContext;
  enqueueSync?: boolean;
};

/** Unified audit + change_log (+ optional sync_queue) for domain mutations. */
export async function recordDomainMutation(
  client: pg.PoolClient,
  input: DomainMutationInput
): Promise<string> {
  const auditEventId = await appendAuditEvent(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    module: input.module,
    action: input.auditAction ?? input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    oldValue: input.oldValue,
    newValue: input.newValue,
    ctx: input.requestCtx,
  });

  await appendChangeLog(client, {
    tenantId: input.tenantId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    payload: input.newValue,
    version: input.version,
    changedBy: input.userId,
  });

  if (input.enqueueSync) {
    await enqueueSyncMutation(client, {
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      payload: input.newValue ?? {},
      version: input.version,
    });
  }

  return auditEventId;
}
