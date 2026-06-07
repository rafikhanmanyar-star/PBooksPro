import type pg from 'pg';
import { getReferralProgramConfig, updateReferralProgramConfig } from './referralProgramConfigService.js';
import type { AdminReferralStats, ReferralProgramConfig } from '../../constants/referralTypes.js';

export async function getAdminReferralStats(client: pg.PoolClient): Promise<AdminReferralStats> {
  const config = await getReferralProgramConfig(client);

  const { rows: counts } = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM referral_codes) AS codes,
       (SELECT COUNT(*)::int FROM referral_attributions) AS signups,
       (SELECT COUNT(*)::int FROM referral_attributions WHERE status IN ('converted', 'rewarded')) AS conversions,
       (SELECT COUNT(*)::int FROM referral_rewards WHERE status = 'pending') AS pending_rewards,
       (SELECT COUNT(*)::int FROM referral_fraud_reviews WHERE status = 'open') AS open_fraud`
  );
  const c = counts[0];

  const { rows: top } = await client.query(
    `SELECT t.id AS tenant_id, t.name AS tenant_name,
            COUNT(a.id)::int AS signups,
            COUNT(a.id) FILTER (WHERE a.status IN ('converted', 'rewarded'))::int AS conversions
     FROM referral_attributions a
     INNER JOIN tenants t ON t.id = a.referrer_tenant_id
     GROUP BY t.id, t.name
     ORDER BY conversions DESC, signups DESC
     LIMIT 10`
  );

  const signups = c.signups ?? 0;
  const conversions = c.conversions ?? 0;

  return {
    programEnabled: config.isEnabled,
    totalCodes: c.codes ?? 0,
    totalSignups: signups,
    totalConversions: conversions,
    pendingRewards: c.pending_rewards ?? 0,
    openFraudReviews: c.open_fraud ?? 0,
    conversionRate: signups > 0 ? Math.round((conversions / signups) * 100) : 0,
    topReferrers: top.map((r) => ({
      tenantId: r.tenant_id,
      tenantName: r.tenant_name,
      signups: r.signups,
      conversions: r.conversions,
    })),
  };
}

export async function listAdminAttributions(
  client: pg.PoolClient,
  options?: { status?: string; limit?: number }
): Promise<unknown[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
  const params: unknown[] = [limit];
  let filter = '';
  if (options?.status) {
    params.push(options.status);
    filter = `AND a.status = $${params.length}`;
  }

  const { rows } = await client.query(
    `SELECT a.*, rt.name AS referrer_name, rf.name AS referee_name, c.code
     FROM referral_attributions a
     INNER JOIN tenants rt ON rt.id = a.referrer_tenant_id
     INNER JOIN tenants rf ON rf.id = a.referee_tenant_id
     INNER JOIN referral_codes c ON c.id = a.referral_code_id
     WHERE 1=1 ${filter}
     ORDER BY a.signed_up_at DESC
     LIMIT $1`,
    params
  );
  return rows;
}

export async function listOpenFraudReviews(client: pg.PoolClient, limit = 50): Promise<unknown[]> {
  const { rows } = await client.query(
    `SELECT f.*, a.referee_email, a.referrer_tenant_id, a.fraud_score
     FROM referral_fraud_reviews f
     INNER JOIN referral_attributions a ON a.id = f.attribution_id
     WHERE f.status = 'open'
     ORDER BY f.created_at DESC
     LIMIT $1`,
    [Math.min(limit, 200)]
  );
  return rows;
}

export async function listPendingRewards(client: pg.PoolClient, limit = 50): Promise<unknown[]> {
  const { rows } = await client.query(
    `SELECT r.*, t.name AS beneficiary_name
     FROM referral_rewards r
     INNER JOIN tenants t ON t.id = r.beneficiary_tenant_id
     WHERE r.status = 'pending'
     ORDER BY r.created_at ASC
     LIMIT $1`,
    [Math.min(limit, 200)]
  );
  return rows;
}

export async function resolveFraudReview(
  client: pg.PoolClient,
  reviewId: string,
  userId: string,
  resolution: 'dismissed' | 'confirmed'
): Promise<void> {
  await client.query(
    `UPDATE referral_fraud_reviews SET
       status = $2,
       reviewed_by_user_id = $3,
       reviewed_at = NOW()
     WHERE id = $1`,
    [reviewId, resolution, userId]
  );

  if (resolution === 'confirmed') {
    const { rows } = await client.query(
      `SELECT attribution_id FROM referral_fraud_reviews WHERE id = $1`,
      [reviewId]
    );
    if (rows.length) {
      await client.query(
        `UPDATE referral_attributions SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
        [rows[0].attribution_id]
      );
    }
  }
}

export { getReferralProgramConfig, updateReferralProgramConfig };
export type { ReferralProgramConfig };
