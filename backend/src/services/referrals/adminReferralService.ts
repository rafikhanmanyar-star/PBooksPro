import type pg from 'pg';
import { getReferralProgramConfig, updateReferralProgramConfig } from './referralProgramConfigService.js';
import type { AdminReferralStats, ReferralProgramConfig } from '../../constants/referralTypes.js';
import {
  AdminReferralRepository,
  ReferralAttributionRepository,
  ReferralFraudRepository,
  ReferralRewardRepository,
} from '../../modules/referrals/repositories/ReferralRepository.js';

const adminRepo = new AdminReferralRepository();
const attributionRepo = new ReferralAttributionRepository();
const fraudRepo = new ReferralFraudRepository();
const rewardRepo = new ReferralRewardRepository();

export async function getAdminReferralStats(client: pg.PoolClient): Promise<AdminReferralStats> {
  const config = await getReferralProgramConfig(client);
  return adminRepo.buildAdminStats(client, config);
}

export async function listAdminAttributions(
  client: pg.PoolClient,
  options?: { status?: string; limit?: number }
): Promise<unknown[]> {
  return attributionRepo.listAdmin(client, options);
}

export async function listOpenFraudReviews(client: pg.PoolClient, limit = 50): Promise<unknown[]> {
  return fraudRepo.listOpenAdmin(client, limit);
}

export async function listPendingRewards(client: pg.PoolClient, limit = 50): Promise<unknown[]> {
  return rewardRepo.listPendingAdmin(client, limit);
}

export async function resolveFraudReview(
  client: pg.PoolClient,
  reviewId: string,
  userId: string,
  resolution: 'dismissed' | 'confirmed'
): Promise<void> {
  const attributionId = await fraudRepo.resolveReview(client, reviewId, userId, resolution);
  if (attributionId) {
    await attributionRepo.reject(client, attributionId);
  }
}

export { getReferralProgramConfig, updateReferralProgramConfig };
export type { ReferralProgramConfig };
