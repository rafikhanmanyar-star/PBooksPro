import type pg from 'pg';
import { DEFAULT_REFERRAL_CONFIG } from '../../constants/referralProgram.js';
import type { ReferralProgramConfig, ReferralRewardType, ReferralRewardValue } from '../../constants/referralTypes.js';

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

export async function getReferralProgramConfig(
  client: pg.PoolClient
): Promise<ReferralProgramConfig> {
  const { rows } = await client.query(
    `SELECT * FROM referral_program_config WHERE id = 'default' LIMIT 1`
  );
  if (!rows.length) return DEFAULT_REFERRAL_CONFIG;
  return mapConfig(rows[0]);
}

export async function updateReferralProgramConfig(
  client: pg.PoolClient,
  patch: Partial<ReferralProgramConfig>
): Promise<ReferralProgramConfig> {
  const current = await getReferralProgramConfig(client);
  const next = { ...current, ...patch };

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

  return getReferralProgramConfig(client);
}
