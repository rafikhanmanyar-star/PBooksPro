import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getReferralProgramConfig } from './referralProgramConfigService.js';
import { logReferralEvent } from './referralEventService.js';
import { extendSubscriptionTrialByMonths } from '../billing/subscriptionService.js';
import type { ReferralRewardType, ReferralRewardValue } from '../../constants/referralTypes.js';
import {
  ReferralRewardRepository,
  ReferralAttributionRepository,
} from '../../modules/referrals/repositories/ReferralRepository.js';

type RewardSpec = {
  beneficiaryTenantId: string;
  appliesTo: 'referrer' | 'referee';
  rewardType: ReferralRewardType;
  rewardValue: ReferralRewardValue;
};

const rewardRepo = new ReferralRewardRepository();
const attributionRepo = new ReferralAttributionRepository();

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

  await rewardRepo.insert(client, {
    id: rewardId,
    attributionId: input.attributionId,
    beneficiaryTenantId: input.spec.beneficiaryTenantId,
    rewardType: input.spec.rewardType,
    rewardValue: input.spec.rewardValue,
    status,
    appliesTo: input.spec.appliesTo,
    expiresAt: expiresAt.toISOString(),
  });

  const tenants = await rewardRepo.getAttributionTenants(client, input.attributionId);

  await logReferralEvent(client, {
    eventType: 'reward_issued',
    referrerTenantId: tenants?.referrer_tenant_id,
    refereeTenantId: tenants?.referee_tenant_id,
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
  const attr = await attributionRepo.getById(client, attributionId);
  if (!attr) return;
  if (attr.status === 'fraud_flagged') return;

  const specs: RewardSpec[] = [
    {
      beneficiaryTenantId: attr.referrer_tenant_id as string,
      appliesTo: 'referrer',
      rewardType: config.referrerRewardType,
      rewardValue: config.referrerRewardValue,
    },
  ];

  if (config.refereeRewardType) {
    specs.push({
      beneficiaryTenantId: attr.referee_tenant_id as string,
      appliesTo: 'referee',
      rewardType: config.refereeRewardType,
      rewardValue: config.refereeRewardValue,
    });
  }

  const autoApprove = (attr.fraud_score as number) < 25;

  for (const spec of specs) {
    await createReferralReward(client, { attributionId, spec, autoApprove });
  }

  await attributionRepo.markRewarded(client, attributionId);
}

export async function applyReferralReward(
  client: pg.PoolClient,
  rewardId: string,
  approvedByUserId: string | null
): Promise<void> {
  const reward = await rewardRepo.getById(client, rewardId);
  if (!reward) throw new Error('Reward not found.');
  if (reward.status === 'applied' || reward.status === 'rejected') return;

  const value = reward.reward_value as ReferralRewardValue;

  if (reward.reward_type === 'free_months' && 'months' in value && value.months > 0) {
    await extendSubscriptionTrialByMonths(client, reward.beneficiary_tenant_id as string, value.months);
    await rewardRepo.upsertCreditBalance(client, reward.beneficiary_tenant_id as string, {
      freeMonthsPending: value.months,
    });
  }

  if (reward.reward_type === 'discount_credit' && 'creditCents' in value && value.creditCents > 0) {
    await rewardRepo.upsertCreditBalance(client, reward.beneficiary_tenant_id as string, {
      discountCreditCents: value.creditCents,
    });
  }

  if (reward.reward_type === 'plan_upgrade' && 'planCode' in value) {
    await rewardRepo.upsertCreditBalance(client, reward.beneficiary_tenant_id as string, {
      planUpgradePending: value.planCode,
    });
  }

  await rewardRepo.markApplied(client, rewardId, approvedByUserId);

  await logReferralEvent(client, {
    eventType: 'reward_applied',
    referrerTenantId: reward.applies_to === 'referrer' ? (reward.beneficiary_tenant_id as string) : null,
    refereeTenantId: reward.applies_to === 'referee' ? (reward.beneficiary_tenant_id as string) : null,
    attributionId: reward.attribution_id as string,
    payload: { rewardId },
  });
}

export async function approveReferralReward(
  client: pg.PoolClient,
  rewardId: string,
  userId: string
): Promise<void> {
  await rewardRepo.approve(client, rewardId, userId);
  await applyReferralReward(client, rewardId, userId);
}

export async function rejectReferralReward(
  client: pg.PoolClient,
  rewardId: string,
  userId: string,
  notes?: string
): Promise<void> {
  await rewardRepo.reject(client, rewardId, userId, notes ?? null);
}
