import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getReferralProgramConfig } from './referralProgramConfigService.js';
import { logReferralEvent } from './referralEventService.js';

export type FraudCheckInput = {
  referrerTenantId: string;
  refereeEmail: string;
  signupIpHash: string | null;
  referralCodeId: string;
};

export type FraudCheckResult = {
  score: number;
  reasons: Array<{ code: string; severity: 'low' | 'medium' | 'high' | 'critical'; details?: Record<string, unknown> }>;
  blocked: boolean;
};

function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

export async function runReferralFraudChecks(
  client: pg.PoolClient,
  input: FraudCheckInput
): Promise<FraudCheckResult> {
  const config = await getReferralProgramConfig(client);
  const reasons: FraudCheckResult['reasons'] = [];
  let score = 0;

  if (config.blockSameEmailDomain) {
    const { rows: referrerUsers } = await client.query(
      `SELECT email FROM users WHERE tenant_id = $1 AND email IS NOT NULL`,
      [input.referrerTenantId]
    );
    const refereeDomain = emailDomain(input.refereeEmail);
    const sameDomain = referrerUsers.some(
      (u) => emailDomain(String(u.email)) === refereeDomain && refereeDomain.length > 0
    );
    if (sameDomain) {
      reasons.push({ code: 'same_email_domain', severity: 'high', details: { domain: refereeDomain } });
      score += 40;
    }
  }

  const { rows: monthlyCount } = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM referral_attributions
     WHERE referrer_tenant_id = $1 AND signed_up_at >= NOW() - INTERVAL '30 days'`,
    [input.referrerTenantId]
  );
  if ((monthlyCount[0]?.cnt ?? 0) >= config.maxReferralsPerMonth) {
    reasons.push({ code: 'monthly_cap_exceeded', severity: 'critical' });
    score += 60;
  }

  if (input.signupIpHash) {
    const { rows: ipDupes } = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM referral_attributions
       WHERE referrer_tenant_id = $1 AND signup_ip_hash = $2
         AND signed_up_at >= NOW() - INTERVAL '7 days'`,
      [input.referrerTenantId, input.signupIpHash]
    );
    if ((ipDupes[0]?.cnt ?? 0) >= 2) {
      reasons.push({ code: 'duplicate_ip_cluster', severity: 'medium' });
      score += 25;
    }
  }

  const { rows: emailDupes } = await client.query(
    `SELECT id FROM referral_attributions WHERE LOWER(referee_email) = LOWER($1) LIMIT 1`,
    [input.refereeEmail]
  );
  if (emailDupes.length) {
    reasons.push({ code: 'duplicate_referee_email', severity: 'critical' });
    score += 80;
  }

  const blocked = reasons.some((r) => r.severity === 'critical') || score >= 80;

  return { score, reasons, blocked };
}

export async function recordFraudReviews(
  client: pg.PoolClient,
  attributionId: string,
  reasons: FraudCheckResult['reasons']
): Promise<void> {
  for (const reason of reasons) {
    await client.query(
      `INSERT INTO referral_fraud_reviews (id, attribution_id, reason_code, severity, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [randomUUID(), attributionId, reason.code, reason.severity, JSON.stringify(reason.details ?? {})]
    );
  }
}

export async function flagAttributionFraud(
  client: pg.PoolClient,
  attributionId: string,
  fraudScore: number,
  notes: string,
  reasons: FraudCheckResult['reasons']
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
  await recordFraudReviews(client, attributionId, reasons);

  const { rows } = await client.query(
    `SELECT referrer_tenant_id, referee_tenant_id FROM referral_attributions WHERE id = $1`,
    [attributionId]
  );
  if (rows.length) {
    await logReferralEvent(client, {
      eventType: 'fraud_flagged',
      referrerTenantId: rows[0].referrer_tenant_id,
      refereeTenantId: rows[0].referee_tenant_id,
      attributionId,
      payload: { fraudScore, reasons },
    });
  }
}
