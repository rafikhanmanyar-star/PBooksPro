/**
 * Subscription event log (audit trail for billing lifecycle).
 */

import type pg from 'pg';
import { SubscriptionEventRepository } from '../../modules/billing/repositories/SubscriptionEventRepository.js';

export type SubscriptionEventRow = {
  id: string;
  tenant_id: string | null;
  event_type: string;
  event_source: string;
  payload: Record<string, unknown>;
  created_at: string;
};

const eventRepo = new SubscriptionEventRepository();

export async function logSubscriptionEvent(
  client: pg.PoolClient,
  input: {
    tenantId?: string | null;
    eventType: string;
    eventSource?: string;
    payload?: Record<string, unknown>;
  }
): Promise<SubscriptionEventRow> {
  const row = await eventRepo.insert(client, input);

  try {
    const { handleSubscriptionEmailEvent } = await import('../emailAutomation/emailAutomationHooks.js');
    await handleSubscriptionEmailEvent(
      client,
      input.eventType,
      input.tenantId ?? null,
      input.payload ?? {}
    );
  } catch {
    /* email hooks must not break billing audit */
  }

  return row;
}

export async function listSubscriptionEvents(
  client: pg.PoolClient,
  tenantId: string,
  limit = 50
): Promise<SubscriptionEventRow[]> {
  return eventRepo.listForTenant(client, tenantId, limit);
}
