import type pg from 'pg';
import { getReferralProgramConfig } from './referralProgramConfigService.js';
import { logReferralEvent } from './referralEventService.js';
import {
  ReferralFraudRepository,
  ReferralAttributionRepository,
} from '../../modules/referrals/repositories/ReferralRepository.js';

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

const fraudRepo = new ReferralFraudRepository();
const attributionRepo = new ReferralAttributionRepository();

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
    const referrerEmails = await fraudRepo.listReferrerEmails(client, input.referrerTenantId);
    const refereeDomain = emailDomain(input.refereeEmail);
    const sameDomain = referrerEmails.some(
      (email) => emailDomain(email) === refereeDomain && refereeDomain.length > 0
    );
    if (sameDomain) {
      reasons.push({ code: 'same_email_domain', severity: 'high', details: { domain: refereeDomain } });
      score += 40;
    }
  }

  const monthlyCount = await attributionRepo.countMonthlyByReferrer(client, input.referrerTenantId);
  if (monthlyCount >= config.maxReferralsPerMonth) {
    reasons.push({ code: 'monthly_cap_exceeded', severity: 'critical' });
    score += 60;
  }

  if (input.signupIpHash) {
    const ipDupes = await attributionRepo.countRecentIpDupes(
      client,
      input.referrerTenantId,
      input.signupIpHash
    );
    if (ipDupes >= 2) {
      reasons.push({ code: 'duplicate_ip_cluster', severity: 'medium' });
      score += 25;
    }
  }

  if (await attributionRepo.hasDuplicateRefereeEmail(client, input.refereeEmail)) {
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
    await fraudRepo.insertReview(client, {
      attributionId,
      reasonCode: reason.code,
      severity: reason.severity,
      details: reason.details ?? {},
    });
  }
}

export async function flagAttributionFraud(
  client: pg.PoolClient,
  attributionId: string,
  fraudScore: number,
  notes: string,
  reasons: FraudCheckResult['reasons']
): Promise<void> {
  await attributionRepo.flagFraud(client, attributionId, fraudScore, notes);
  await recordFraudReviews(client, attributionId, reasons);

  const attr = await attributionRepo.getById(client, attributionId);
  if (attr) {
    await logReferralEvent(client, {
      eventType: 'fraud_flagged',
      referrerTenantId: attr.referrer_tenant_id as string,
      refereeTenantId: attr.referee_tenant_id as string,
      attributionId,
      payload: { fraudScore, reasons },
    });
  }
}
