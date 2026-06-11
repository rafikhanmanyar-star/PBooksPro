import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { DEFAULT_REFERRAL_CONFIG } from '../../../constants/referralProgram.js';
import type {
  ReferralProgramConfig,
  ReferralRewardType,
  ReferralRewardValue,
} from '../../../constants/referralTypes.js';
import type { ReferralCodeRow } from '../../../services/referrals/referralCodeService.js';
import type { ReferralEventType } from '../../../services/referrals/referralEventService.js';
import type {
  ReferralDashboardStats,
  ReferralAttributionSummary,
  ReferralInvitationSummary,
  AdminReferralStats,
} from '../../../constants/referralTypes.js';

function parseRewardValue(raw: unknown): ReferralRewardValue {
  if (!raw || typeof raw !== 'object') return { months: 1 };
  const o = raw as Record<string, unknown>;
  if (typeof o.months === 'number') return { months: o.months };
  if (typeof o.creditCents === 'number') {
    return { creditCents: o.creditCents, currency: typeof o.currency === 'string' ? o.currency : 'USD' };
  }
  if (typeof o.planCode === 'string') {
    return {
      planCode: o.planCode,
      billingCycle: o.billingCycle === 'annual' ? 'annual' : 'monthly',
    };
  }
  return { months: 1 };
}

function mapConfig(row: pg.QueryResultRow): ReferralProgramConfig {
  return {
    isEnabled: row.is_enabled,
    referrerRewardType: row.referrer_reward_type as ReferralRewardType,
    referrerRewardValue: parseRewardValue(row.referrer_reward_value),
    refereeRewardType: row.referee_reward_type as ReferralRewardType | null,
    refereeRewardValue: parseRewardValue(row.referee_reward_value),
    minDaysToConvert: row.min_days_to_convert,
    maxReferralsPerMonth: row.max_referrals_per_month,
    blockSameEmailDomain: row.block_same_email_domain,
    requirePaidConversion: row.require_paid_conversion,
    invitationExpiryDays: row.invitation_expiry_days,
    signupBaseUrl: row.signup_base_url,
  };
}

function mapCodeRow(row: pg.QueryResultRow): ReferralCodeRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    isActive: row.is_active,
    totalClicks: row.total_clicks,
    totalSignups: row.total_signups,
    totalConversions: row.total_conversions,
  };
}

export class ReferralProgramConfigRepository {
  async get(client: pg.PoolClient): Promise<ReferralProgramConfig> {
    const r = await client.query(
      `SELECT * FROM referral_program_config WHERE id = 'default' LIMIT 1`
    );
    if (!r.rows.length) return DEFAULT_REFERRAL_CONFIG;
    return mapConfig(r.rows[0]!);
  }

  async update(client: pg.PoolClient, next: ReferralProgramConfig): Promise<void> {
    await client.query(
      `UPDATE referral_program_config SET
         is_enabled = $1,
         referrer_reward_type = $2,
         referrer_reward_value = $3::jsonb,
         referee_reward_type = $4,
         referee_reward_value = $5::jsonb,
         min_days_to_convert = $6,
         max_referrals_per_month = $7,
         block_same_email_domain = $8,
         require_paid_conversion = $9,
         invitation_expiry_days = $10,
         signup_base_url = $11,
         updated_at = NOW()
       WHERE id = 'default'`,
      [
        next.isEnabled,
        next.referrerRewardType,
        JSON.stringify(next.referrerRewardValue),
        next.refereeRewardType,
        JSON.stringify(next.refereeRewardValue),
        next.minDaysToConvert,
        next.maxReferralsPerMonth,
        next.blockSameEmailDomain,
        next.requirePaidConversion,
        next.invitationExpiryDays,
        next.signupBaseUrl,
      ]
    );
  }
}

export class ReferralCodeRepository {
  async getByTenant(client: pg.PoolClient, tenantId: string): Promise<ReferralCodeRow | null> {
    const r = await client.query(`SELECT * FROM referral_codes WHERE tenant_id = $1 LIMIT 1`, [
      tenantId,
    ]);
    return r.rows[0] ? mapCodeRow(r.rows[0]) : null;
  }

  async insert(
    client: pg.PoolClient,
    input: { id: string; tenantId: string; code: string; createdByUserId: string | null }
  ): Promise<ReferralCodeRow> {
    await client.query(
      `INSERT INTO referral_codes (id, tenant_id, code, created_by_user_id)
       VALUES ($1, $2, $3, $4)`,
      [input.id, input.tenantId, input.code, input.createdByUserId]
    );
    const r = await client.query(`SELECT * FROM referral_codes WHERE id = $1`, [input.id]);
    return mapCodeRow(r.rows[0]!);
  }

  async findByCode(client: pg.PoolClient, code: string): Promise<ReferralCodeRow | null> {
    const r = await client.query(
      `SELECT * FROM referral_codes WHERE LOWER(code) = LOWER($1) AND is_active = TRUE LIMIT 1`,
      [code.trim()]
    );
    return r.rows[0] ? mapCodeRow(r.rows[0]) : null;
  }

  async incrementMetric(
    client: pg.PoolClient,
    codeId: string,
    metric: 'total_clicks' | 'total_signups' | 'total_conversions'
  ): Promise<void> {
    await client.query(
      `UPDATE referral_codes SET ${metric} = ${metric} + 1, updated_at = NOW() WHERE id = $1`,
      [codeId]
    );
  }

  async getTenantName(client: pg.PoolClient, tenantId: string): Promise<string | undefined> {
    const r = await client.query(`SELECT name FROM tenants WHERE id = $1`, [tenantId]);
    return r.rows[0]?.name as string | undefined;
  }
}

export class ReferralEventRepository {
  async insert(
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
}

export class ReferralAttributionRepository {
  async getInvitationByToken(
    client: pg.PoolClient,
    token: string,
    referrerTenantId: string
  ): Promise<pg.QueryResultRow | null> {
    const r = await client.query(
      `SELECT id, invitee_email, status, expires_at FROM referral_invitations
       WHERE invite_token = $1 AND referrer_tenant_id = $2 LIMIT 1`,
      [token, referrerTenantId]
    );
    return r.rows[0] ?? null;
  }

  async insert(
    client: pg.PoolClient,
    input: {
      id: string;
      referrerTenantId: string;
      refereeTenantId: string;
      referralCodeId: string;
      invitationId: string | null;
      status: string;
      refereeEmail: string;
      signupIpHash: string | null;
      fraudScore: number;
      fraudNotes: string | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO referral_attributions (
         id, referrer_tenant_id, referee_tenant_id, referral_code_id, invitation_id,
         status, referee_email, signup_ip_hash, fraud_score, fraud_notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.id,
        input.referrerTenantId,
        input.refereeTenantId,
        input.referralCodeId,
        input.invitationId,
        input.status,
        input.refereeEmail,
        input.signupIpHash,
        input.fraudScore,
        input.fraudNotes,
      ]
    );
  }

  async markInvitationSignedUp(client: pg.PoolClient, invitationId: string): Promise<void> {
    await client.query(
      `UPDATE referral_invitations SET status = 'signed_up', updated_at = NOW() WHERE id = $1`,
      [invitationId]
    );
  }

  async getPendingConversion(
    client: pg.PoolClient,
    refereeTenantId: string
  ): Promise<pg.QueryResultRow | null> {
    const r = await client.query(
      `SELECT * FROM referral_attributions
       WHERE referee_tenant_id = $1 AND status IN ('signed_up', 'trialing')
       LIMIT 1`,
      [refereeTenantId]
    );
    return r.rows[0] ?? null;
  }

  async markConverted(client: pg.PoolClient, attributionId: string): Promise<void> {
    await client.query(
      `UPDATE referral_attributions SET status = 'converted', converted_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [attributionId]
    );
  }

  async getById(client: pg.PoolClient, attributionId: string): Promise<pg.QueryResultRow | null> {
    const r = await client.query(`SELECT * FROM referral_attributions WHERE id = $1`, [attributionId]);
    return r.rows[0] ?? null;
  }

  async markRewarded(client: pg.PoolClient, attributionId: string): Promise<void> {
    await client.query(
      `UPDATE referral_attributions SET status = 'rewarded', rewarded_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [attributionId]
    );
  }

  async flagFraud(
    client: pg.PoolClient,
    attributionId: string,
    fraudScore: number,
    notes: string
  ): Promise<void> {
    await client.query(
      `UPDATE referral_attributions SET
         status = 'fraud_flagged',
         fraud_score = $2,
         fraud_notes = $3,
         updated_at = NOW()
       WHERE id = $1`,
      [attributionId, fraudScore, notes]
    );
  }

  async reject(client: pg.PoolClient, attributionId: string): Promise<void> {
    await client.query(
      `UPDATE referral_attributions SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
      [attributionId]
    );
  }

  async countMonthlyByReferrer(client: pg.PoolClient, referrerTenantId: string): Promise<number> {
    const r = await client.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM referral_attributions
       WHERE referrer_tenant_id = $1 AND signed_up_at >= NOW() - INTERVAL '30 days'`,
      [referrerTenantId]
    );
    return r.rows[0]?.cnt ?? 0;
  }

  async countRecentIpDupes(
    client: pg.PoolClient,
    referrerTenantId: string,
    signupIpHash: string
  ): Promise<number> {
    const r = await client.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM referral_attributions
       WHERE referrer_tenant_id = $1 AND signup_ip_hash = $2
         AND signed_up_at >= NOW() - INTERVAL '7 days'`,
      [referrerTenantId, signupIpHash]
    );
    return r.rows[0]?.cnt ?? 0;
  }

  async hasDuplicateRefereeEmail(client: pg.PoolClient, refereeEmail: string): Promise<boolean> {
    const r = await client.query(
      `SELECT id FROM referral_attributions WHERE LOWER(referee_email) = LOWER($1) LIMIT 1`,
      [refereeEmail]
    );
    return r.rows.length > 0;
  }

  async listAdmin(
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
    const r = await client.query(
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
    return r.rows;
  }
}

export class ReferralInvitationRepository {
  async insert(
    client: pg.PoolClient,
    input: {
      id: string;
      referrerTenantId: string;
      referralCodeId: string;
      inviteeEmail: string;
      inviteeName: string | null;
      inviteToken: string;
      expiresAt: string;
      createdByUserId: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO referral_invitations (
         id, referrer_tenant_id, referral_code_id, invitee_email, invitee_name,
         invite_token, status, expires_at, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)`,
      [
        input.id,
        input.referrerTenantId,
        input.referralCodeId,
        input.inviteeEmail,
        input.inviteeName,
        input.inviteToken,
        input.expiresAt,
        input.createdByUserId,
      ]
    );
  }

  async markSent(client: pg.PoolClient, invitationId: string): Promise<void> {
    await client.query(
      `UPDATE referral_invitations SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [invitationId]
    );
  }

  async getByTokenWithCode(
    client: pg.PoolClient,
    token: string
  ): Promise<pg.QueryResultRow | null> {
    const r = await client.query(
      `SELECT i.*, c.code FROM referral_invitations i
       INNER JOIN referral_codes c ON c.id = i.referral_code_id
       WHERE i.invite_token = $1 LIMIT 1`,
      [token]
    );
    return r.rows[0] ?? null;
  }

  async markOpened(client: pg.PoolClient, invitationId: string): Promise<void> {
    await client.query(
      `UPDATE referral_invitations SET status = 'opened', opened_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [invitationId]
    );
  }
}

export class ReferralRewardRepository {
  async upsertCreditBalance(
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

  async insert(
    client: pg.PoolClient,
    input: {
      id: string;
      attributionId: string;
      beneficiaryTenantId: string;
      rewardType: string;
      rewardValue: ReferralRewardValue;
      status: string;
      appliesTo: string;
      expiresAt: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO referral_rewards (
         id, attribution_id, beneficiary_tenant_id, reward_type, reward_value,
         status, applies_to, expires_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [
        input.id,
        input.attributionId,
        input.beneficiaryTenantId,
        input.rewardType,
        JSON.stringify(input.rewardValue),
        input.status,
        input.appliesTo,
        input.expiresAt,
      ]
    );
  }

  async getAttributionTenants(
    client: pg.PoolClient,
    attributionId: string
  ): Promise<{ referrer_tenant_id: string; referee_tenant_id: string } | null> {
    const r = await client.query(
      `SELECT referrer_tenant_id, referee_tenant_id FROM referral_attributions WHERE id = $1`,
      [attributionId]
    );
    return r.rows[0] ?? null;
  }

  async getById(client: pg.PoolClient, rewardId: string): Promise<pg.QueryResultRow | null> {
    const r = await client.query(`SELECT * FROM referral_rewards WHERE id = $1`, [rewardId]);
    return r.rows[0] ?? null;
  }

  async markApplied(client: pg.PoolClient, rewardId: string, approvedByUserId: string | null): Promise<void> {
    await client.query(
      `UPDATE referral_rewards SET
         status = 'applied',
         approved_by_user_id = COALESCE($2, approved_by_user_id),
         applied_at = NOW(),
         updated_at = NOW()
       WHERE id = $1`,
      [rewardId, approvedByUserId]
    );
  }

  async approve(client: pg.PoolClient, rewardId: string, userId: string): Promise<void> {
    await client.query(
      `UPDATE referral_rewards SET status = 'approved', approved_by_user_id = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [rewardId, userId]
    );
  }

  async reject(
    client: pg.PoolClient,
    rewardId: string,
    userId: string,
    notes: string | null
  ): Promise<void> {
    await client.query(
      `UPDATE referral_rewards SET status = 'rejected', approved_by_user_id = $2, notes = $3, updated_at = NOW()
       WHERE id = $1`,
      [rewardId, userId, notes]
    );
  }

  async listPendingAdmin(client: pg.PoolClient, limit: number): Promise<unknown[]> {
    const r = await client.query(
      `SELECT r.*, t.name AS beneficiary_name
       FROM referral_rewards r
       INNER JOIN tenants t ON t.id = r.beneficiary_tenant_id
       WHERE r.status = 'pending'
       ORDER BY r.created_at ASC
       LIMIT $1`,
      [Math.min(limit, 200)]
    );
    return r.rows;
  }
}

export class ReferralFraudRepository {
  async listReferrerEmails(client: pg.PoolClient, referrerTenantId: string): Promise<string[]> {
    const r = await client.query(
      `SELECT email FROM users WHERE tenant_id = $1 AND email IS NOT NULL`,
      [referrerTenantId]
    );
    return r.rows.map((row) => String(row.email));
  }

  async insertReview(
    client: pg.PoolClient,
    input: {
      attributionId: string;
      reasonCode: string;
      severity: string;
      details: Record<string, unknown>;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO referral_fraud_reviews (id, attribution_id, reason_code, severity, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        randomUUID(),
        input.attributionId,
        input.reasonCode,
        input.severity,
        JSON.stringify(input.details),
      ]
    );
  }

  async listOpenAdmin(client: pg.PoolClient, limit: number): Promise<unknown[]> {
    const r = await client.query(
      `SELECT f.*, a.referee_email, a.referrer_tenant_id, a.fraud_score
       FROM referral_fraud_reviews f
       INNER JOIN referral_attributions a ON a.id = f.attribution_id
       WHERE f.status = 'open'
       ORDER BY f.created_at DESC
       LIMIT $1`,
      [Math.min(limit, 200)]
    );
    return r.rows;
  }

  async resolveReview(
    client: pg.PoolClient,
    reviewId: string,
    userId: string,
    resolution: 'dismissed' | 'confirmed'
  ): Promise<string | null> {
    await client.query(
      `UPDATE referral_fraud_reviews SET
         status = $2,
         reviewed_by_user_id = $3,
         reviewed_at = NOW()
       WHERE id = $1`,
      [reviewId, resolution, userId]
    );
    if (resolution !== 'confirmed') return null;
    const r = await client.query<{ attribution_id: string }>(
      `SELECT attribution_id FROM referral_fraud_reviews WHERE id = $1`,
      [reviewId]
    );
    return r.rows[0]?.attribution_id ?? null;
  }
}

export class ReferralDashboardRepository {
  async getCreditBalance(
    client: pg.PoolClient,
    tenantId: string
  ): Promise<{ discount_credit_cents: number; free_months_pending: number } | null> {
    const r = await client.query(
      `SELECT discount_credit_cents, free_months_pending FROM referral_credit_balances WHERE tenant_id = $1`,
      [tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getRewardCounts(
    client: pg.PoolClient,
    tenantId: string
  ): Promise<{ pending: number; applied: number }> {
    const r = await client.query<{ pending: number; applied: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('pending', 'approved'))::int AS pending,
         COUNT(*) FILTER (WHERE status = 'applied')::int AS applied
       FROM referral_rewards WHERE beneficiary_tenant_id = $1`,
      [tenantId]
    );
    return { pending: r.rows[0]?.pending ?? 0, applied: r.rows[0]?.applied ?? 0 };
  }

  async listRecentAttributions(client: pg.PoolClient, tenantId: string): Promise<ReferralAttributionSummary[]> {
    const r = await client.query(
      `SELECT a.id, a.referee_email, a.status, a.signed_up_at, a.converted_at, a.fraud_score, t.name AS tenant_name
       FROM referral_attributions a
       INNER JOIN tenants t ON t.id = a.referee_tenant_id
       WHERE a.referrer_tenant_id = $1
       ORDER BY a.signed_up_at DESC
       LIMIT 10`,
      [tenantId]
    );
    return r.rows.map((row) => ({
      id: row.id,
      refereeTenantName: row.tenant_name,
      refereeEmail: row.referee_email,
      status: row.status,
      signedUpAt: row.signed_up_at,
      convertedAt: row.converted_at,
      fraudScore: row.fraud_score,
    }));
  }

  async listRecentInvitations(client: pg.PoolClient, tenantId: string): Promise<ReferralInvitationSummary[]> {
    const r = await client.query(
      `SELECT id, invitee_email, invitee_name, status, sent_at, expires_at
       FROM referral_invitations
       WHERE referrer_tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [tenantId]
    );
    return r.rows.map((row) => ({
      id: row.id,
      inviteeEmail: row.invitee_email,
      inviteeName: row.invitee_name,
      status: row.status,
      sentAt: row.sent_at,
      expiresAt: row.expires_at,
    }));
  }
}

export class AdminReferralRepository {
  async getStatsCounts(client: pg.PoolClient): Promise<{
    codes: number;
    signups: number;
    conversions: number;
    pending_rewards: number;
    open_fraud: number;
  }> {
    const r = await client.query<{
      codes: number;
      signups: number;
      conversions: number;
      pending_rewards: number;
      open_fraud: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM referral_codes) AS codes,
         (SELECT COUNT(*)::int FROM referral_attributions) AS signups,
         (SELECT COUNT(*)::int FROM referral_attributions WHERE status IN ('converted', 'rewarded')) AS conversions,
         (SELECT COUNT(*)::int FROM referral_rewards WHERE status = 'pending') AS pending_rewards,
         (SELECT COUNT(*)::int FROM referral_fraud_reviews WHERE status = 'open') AS open_fraud`
    );
    return r.rows[0] ?? { codes: 0, signups: 0, conversions: 0, pending_rewards: 0, open_fraud: 0 };
  }

  async listTopReferrers(client: pg.PoolClient): Promise<
    Array<{ tenant_id: string; tenant_name: string; signups: number; conversions: number }>
  > {
    const r = await client.query(
      `SELECT t.id AS tenant_id, t.name AS tenant_name,
              COUNT(a.id)::int AS signups,
              COUNT(a.id) FILTER (WHERE a.status IN ('converted', 'rewarded'))::int AS conversions
       FROM referral_attributions a
       INNER JOIN tenants t ON t.id = a.referrer_tenant_id
       GROUP BY t.id, t.name
       ORDER BY conversions DESC, signups DESC
       LIMIT 10`
    );
    return r.rows;
  }

  async buildAdminStats(
    client: pg.PoolClient,
    config: ReferralProgramConfig
  ): Promise<AdminReferralStats> {
    const c = await this.getStatsCounts(client);
    const top = await this.listTopReferrers(client);
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
}

export { randomUUID as newReferralId };
