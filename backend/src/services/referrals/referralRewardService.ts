import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getReferralProgramConfig } from './referralProgramConfigService.js';
import { logReferralEvent } from './referralEventService.js';
import { extendSubscriptionTrialByMonths } from '../billing/subscriptionService.js';
import type { ReferralRewardType, ReferralRewardValue } from '../../constants/referralTypes.js';

type RewardSpec = {
  beneficiaryTenantId: string;
  appliesTo: 'referrer' | 'referee';
  rewardType: ReferralRewardType;
  rewardValue: ReferralRewardValue;
};

async function upsertCreditBalance(
  client: pg.PoolClient,
  tenantId: string,
  patch: { discountCreditCents?: number; freeMonthsPending?: number; planUpgradePending?: string | null }
): Promise<void> {
  await client.query(
    `INSERT INTO referral_credit_balances (tenant_id, discount_credit_cents, free_months_pending, plan_upgrade_pending)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id) DO UPDATE SET
       discount_credit_cents = referral_credit_balances.discount_credit_cents + EXCLUDED.discount_credit_cents,
       free_months_pending = referral_credit_balances.free_months_pending + EXCLUDED.free_months_pending,
       plan_upgrade_pending = COALESCE(EXCLUDED.plan_upgrade_pending, referral_credit_balances.plan_upgrade_pending),
       updated_at = NOW()`,
    [
      tenantId,
      patch.discountCreditCents ?? 0,
      patch.freeMonthsPending ?? 0,
      patch.planUpgradePending ?? null,
    ]
  );
}

export async function createReferralReward(
  client: pg.PoolClient,
  input: {
    attributionId: string;
    spec: RewardSpec;
    autoApprove?: boolean;
  }
): Promise<string> {
  const rewardId = randomUUID();
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 12);

  const status = input.autoApprove ? 'approved' : 'pending';

  await client.query(
    `INSERT INTO referral_rewards (
       id, attribution_id, beneficiary_tenant_id, reward_type, reward_value,
       status, applies_to, expires_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
    [
      rewardId,
      input.attributionId,
      input.spec.beneficiaryTenantId,
      input.spec.rewardType,
      JSON.stringify(input.spec.rewardValue),
      status,
      input.spec.appliesTo,
      expiresAt.toISOString(),
    ]
  );

  const { rows } = await client.query(
    `SELECT referrer_tenant_id, referee_tenant_id FROM referral_attributions WHERE id = $1`,
    [input.attributionId]
  );

  await logReferralEvent(client, {
    eventType: 'reward_issued',
    referrerTenantId: rows[0]?.referrer_tenant_id,
    refereeTenantId: rows[0]?.referee_tenant_id,
    attributionId: input.attributionId,
    payload: { rewardId, ...input.spec },
  });

  if (input.autoApprove) {
    await applyReferralReward(client, rewardId, null);
  }

  return rewardId;
}

export async function issueReferralRewardsForAttribution(
  client: pg.PoolClient,
  attributionId: string
): Promise<void> {
  const config = await getReferralProgramConfig(client);
  const { rows } = await client.query(`SELECT * FROM referral_attributions WHERE id = $1`, [attributionId]);
  if (!rows.length) return;
  const attr = rows[0];
  if (attr.status === 'fraud_flagged') return;

  const specs: RewardSpec[] = [
    {
      beneficiaryTenantId: attr.referrer_tenant_id,
      appliesTo: 'referrer',
      rewardType: config.referrerRewardType,
      rewardValue: config.referrerRewardValue,
    },
  ];

  if (config.refereeRewardType) {
    specs.push({
      beneficiaryTenantId: attr.referee_tenant_id,
      appliesTo: 'referee',
      rewardType: config.refereeRewardType,
      rewardValue: config.refereeRewardValue,
    });
  }

  const autoApprove = attr.fraud_score < 25;

  for (const spec of specs) {
    await createReferralReward(client, { attributionId, spec, autoApprove });
  }

  await client.query(
    `UPDATE referral_attributions SET status = 'rewarded', rewarded_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [attributionId]
  );
}

export async function applyReferralReward(
  client: pg.PoolClient,
  rewardId: string,
  approvedByUserId: string | null
): Promise<void> {
  const { rows } = await client.query(`SELECT * FROM referral_rewards WHERE id = $1`, [rewardId]);
  if (!rows.length) throw new Error('Reward not found.');
  const reward = rows[0];
  if (reward.status === 'applied' || reward.status === 'rejected') return;

  const value = reward.reward_value as ReferralRewardValue;

  if (reward.reward_type === 'free_months' && 'months' in value && value.months > 0) {
    await extendSubscriptionTrialByMonths(client, reward.beneficiary_tenant_id, value.months);
    await upsertCreditBalance(client, reward.beneficiary_tenant_id, { freeMonthsPending: value.months });
  }

  if (reward.reward_type === 'discount_credit' && 'creditCents' in value && value.creditCents > 0) {
    await upsertCreditBalance(client, reward.beneficiary_tenant_id, {
      discountCreditCents: value.creditCents,
    });
  }

  if (reward.reward_type === 'plan_upgrade' && 'planCode' in value) {
    await upsertCreditBalance(client, reward.beneficiary_tenant_id, {
      planUpgradePending: value.planCode,
    });
  }

  await client.query(
    `UPDATE referral_rewards SET
       status = 'applied',
       approved_by_user_id = COALESCE($2, approved_by_user_id),
       applied_at = NOW(),
       updated_at = NOW()
     WHERE id = $1`,
    [rewardId, approvedByUserId]
  );

  await logReferralEvent(client, {
    eventType: 'reward_applied',
    referrerTenantId: reward.applies_to === 'referrer' ? reward.beneficiary_tenant_id : null,
    refereeTenantId: reward.applies_to === 'referee' ? reward.beneficiary_tenant_id : null,
    attributionId: reward.attribution_id,
    payload: { rewardId },
  });
}

export async function approveReferralReward(
  client: pg.PoolClient,
  rewardId: string,
  userId: string
): Promise<void> {
  await client.query(
    `UPDATE referral_rewards SET status = 'approved', approved_by_user_id = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [rewardId, userId]
  );
  await applyReferralReward(client, rewardId, userId);
}

export async function rejectReferralReward(
  client: pg.PoolClient,
  rewardId: string,
  userId: string,
  notes?: string
): Promise<void> {
  await client.query(
    `UPDATE referral_rewards SET status = 'rejected', approved_by_user_id = $2, notes = $3, updated_at = NOW()
     WHERE id = $1`,
    [rewardId, userId, notes ?? null]
  );
}
