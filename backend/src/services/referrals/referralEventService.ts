import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export type ReferralEventType =
  | 'code_created'
  | 'link_clicked'
  | 'invite_sent'
  | 'invite_opened'
  | 'signup_attributed'
  | 'conversion'
  | 'reward_issued'
  | 'reward_applied'
  | 'fraud_flagged'
  | 'fraud_cleared'
  | 'admin_action';

export async function logReferralEvent(
  client: pg.PoolClient,
  input: {
    eventType: ReferralEventType;
    referrerTenantId?: string | null;
    refereeTenantId?: string | null;
    attributionId?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO referral_events (id, referrer_tenant_id, referee_tenant_id, attribution_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      randomUUID(),
      input.referrerTenantId ?? null,
      input.refereeTenantId ?? null,
      input.attributionId ?? null,
      input.eventType,
      JSON.stringify(input.payload ?? {}),
    ]
  );
}
