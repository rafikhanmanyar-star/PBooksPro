import type pg from 'pg';
import { buildShareUrl, getOrCreateReferralCode } from './referralCodeService.js';
import { getReferralProgramConfig } from './referralProgramConfigService.js';
import type {
  ReferralDashboardStats,
  ReferralAttributionSummary,
  ReferralInvitationSummary,
} from '../../constants/referralTypes.js';

export async function getReferralDashboard(
  client: pg.PoolClient,
  tenantId: string,
  userId?: string | null
): Promise<ReferralDashboardStats> {
  const config = await getReferralProgramConfig(client);
  const codeRow = config.isEnabled
    ? await getOrCreateReferralCode(client, tenantId, userId)
    : null;

  const { rows: balanceRows } = await client.query(
    `SELECT discount_credit_cents, free_months_pending FROM referral_credit_balances WHERE tenant_id = $1`,
    [tenantId]
  );
  const balance = balanceRows[0];

  const { rows: rewardCounts } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('pending', 'approved'))::int AS pending,
       COUNT(*) FILTER (WHERE status = 'applied')::int AS applied
     FROM referral_rewards WHERE beneficiary_tenant_id = $1`,
    [tenantId]
  );

  const { rows: recentAttrs } = await client.query(
    `SELECT a.id, a.referee_email, a.status, a.signed_up_at, a.converted_at, a.fraud_score, t.name AS tenant_name
     FROM referral_attributions a
     INNER JOIN tenants t ON t.id = a.referee_tenant_id
     WHERE a.referrer_tenant_id = $1
     ORDER BY a.signed_up_at DESC
     LIMIT 10`,
    [tenantId]
  );

  const { rows: recentInvites } = await client.query(
    `SELECT id, invitee_email, invitee_name, status, sent_at, expires_at
     FROM referral_invitations
     WHERE referrer_tenant_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [tenantId]
  );

  const totalClicks = codeRow?.totalClicks ?? 0;
  const totalSignups = codeRow?.totalSignups ?? 0;
  const totalConversions = codeRow?.totalConversions ?? 0;

  const recentReferrals: ReferralAttributionSummary[] = recentAttrs.map((r) => ({
    id: r.id,
    refereeTenantName: r.tenant_name,
    refereeEmail: r.referee_email,
    status: r.status,
    signedUpAt: r.signed_up_at,
    convertedAt: r.converted_at,
    fraudScore: r.fraud_score,
  }));

  const recentInvitations: ReferralInvitationSummary[] = recentInvites.map((r) => ({
    id: r.id,
    inviteeEmail: r.invitee_email,
    inviteeName: r.invitee_name,
    status: r.status,
    sentAt: r.sent_at,
    expiresAt: r.expires_at,
  }));

  return {
    code: codeRow?.code ?? null,
    shareUrl: codeRow ? buildShareUrl(config.signupBaseUrl, codeRow.code) : null,
    totalClicks,
    totalSignups,
    totalConversions,
    pendingRewards: rewardCounts[0]?.pending ?? 0,
    appliedRewards: rewardCounts[0]?.applied ?? 0,
    discountCreditCents: balance?.discount_credit_cents ?? 0,
    freeMonthsPending: balance?.free_months_pending ?? 0,
    conversionRate: totalSignups > 0 ? Math.round((totalConversions / totalSignups) * 100) : 0,
    recentReferrals,
    recentInvitations,
  };
}
