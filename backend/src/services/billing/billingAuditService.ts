/**
 * Enterprise audit trail entries for billing actions.
 */

import type pg from 'pg';
import { appendAuditEvent } from '../enterpriseAuditService.js';

export type BillingAuditAction =
  | 'customer_created'
  | 'customer_updated'
  | 'checkout_created'
  | 'subscription_changed'
  | 'subscription_canceled'
  | 'subscription_reactivated'
  | 'invoice_synced'
  | 'webhook_processed'
  | 'webhook_failed';

export async function logBillingAudit(
  client: pg.PoolClient,
  input: {
    tenantId: string;
    userId?: string | null;
    email?: string | null;
    action: BillingAuditAction | string;
    summary: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await appendAuditEvent(client, {
    tenantId: input.tenantId,
    userId: input.userId,
    email: input.email,
    module: 'billing',
    action: input.action,
    entityType: 'subscription',
    summary: input.summary,
    newValue: input.details ?? null,
  });
}
