import type pg from 'pg';
import { buildShareUrl, getOrCreateReferralCode } from './referralCodeService.js';
import { getReferralProgramConfig } from './referralProgramConfigService.js';
import type { ReferralDashboardStats } from '../../constants/referralTypes.js';
import { ReferralDashboardRepository } from '../../modules/referrals/repositories/ReferralRepository.js';

const dashboardRepo = new ReferralDashboardRepository();

export async function getReferralDashboard(
  client: pg.PoolClient,
  tenantId: string,
  userId?: string | null
): Promise<ReferralDashboardStats> {
  const config = await getReferralProgramConfig(client);
  const codeRow = config.isEnabled
    ? await getOrCreateReferralCode(client, tenantId, userId)
    : null;

  const balance = await dashboardRepo.getCreditBalance(client, tenantId);
  const rewardCounts = await dashboardRepo.getRewardCounts(client, tenantId);
  const recentReferrals = await dashboardRepo.listRecentAttributions(client, tenantId);
  const recentInvitations = await dashboardRepo.listRecentInvitations(client, tenantId);

  const totalClicks = codeRow?.totalClicks ?? 0;
  const totalSignups = codeRow?.totalSignups ?? 0;
  const totalConversions = codeRow?.totalConversions ?? 0;

  return {
    code: codeRow?.code ?? null,
    shareUrl: codeRow ? buildShareUrl(config.signupBaseUrl, codeRow.code) : null,
    totalClicks,
    totalSignups,
    totalConversions,
    pendingRewards: rewardCounts.pending,
    appliedRewards: rewardCounts.applied,
    discountCreditCents: balance?.discount_credit_cents ?? 0,
    freeMonthsPending: balance?.free_months_pending ?? 0,
    conversionRate: totalSignups > 0 ? Math.round((totalConversions / totalSignups) * 100) : 0,
    recentReferrals,
    recentInvitations,
  };
}
