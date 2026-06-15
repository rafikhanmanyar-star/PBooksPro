/**
 * Backup security audit events (enterprise audit trail integration).
 */

import type pg from 'pg';
import type { Request } from 'express';
import {
  appendAuditEvent,
  auditContextFromRequest,
  type AuditRequestContext,
} from '../../../organization/services/enterpriseAuditService.js';

export type BackupAuditAction =
  | 'backup_created'
  | 'backup_downloaded'
  | 'backup_restored'
  | 'backup_deleted';

export type LogBackupAuditInput = {
  tenantId: string;
  userId?: string | null;
  email?: string | null;
  action: BackupAuditAction;
  entityId?: string | null;
  summary: string;
  details?: Record<string, unknown>;
  ctx?: AuditRequestContext;
};

export async function logBackupAudit(
  client: pg.PoolClient,
  input: LogBackupAuditInput
): Promise<string> {
  return appendAuditEvent(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    email: input.email,
    module: 'backups',
    action: input.action,
    entityType: 'backup',
    entityId: input.entityId ?? null,
    summary: input.summary,
    newValue: input.details ?? null,
    ctx: input.ctx,
  });
}

export function backupAuditContext(req: Request): AuditRequestContext {
  return auditContextFromRequest(req);
}
