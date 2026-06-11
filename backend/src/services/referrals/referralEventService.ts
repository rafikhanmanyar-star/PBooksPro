import type pg from 'pg';
import { ReferralEventRepository } from '../../modules/referrals/repositories/ReferralRepository.js';

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

const eventRepo = new ReferralEventRepository();

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
  await eventRepo.insert(client, input);
}
