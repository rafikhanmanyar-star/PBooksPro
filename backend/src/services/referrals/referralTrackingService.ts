import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  findReferralCodeByCode,
  getOrCreateReferralCode,
  hashSignupIp,
  incrementReferralCodeMetric,
} from './referralCodeService.js';
import { getReferralProgramConfig } from './referralProgramConfigService.js';
import { flagAttributionFraud, runReferralFraudChecks } from './referralFraudService.js';
import { logReferralEvent } from './referralEventService.js';
import { issueReferralRewardsForAttribution } from './referralRewardService.js';
import { ReferralAttributionRepository } from '../../modules/referrals/repositories/ReferralRepository.js';

const attributionRepo = new ReferralAttributionRepository();

export async function recordReferralClick(
  client: pg.PoolClient,
  code: string
): Promise<{ ok: boolean }> {
  const config = await getReferralProgramConfig(client);
  if (!config.isEnabled) return { ok: false };

  const row = await findReferralCodeByCode(client, code);
  if (!row) return { ok: false };

  await incrementReferralCodeMetric(client, row.id, 'total_clicks');
  await logReferralEvent(client, {
    eventType: 'link_clicked',
    referrerTenantId: row.tenantId,
    payload: { code: row.code },
  });
  return { ok: true };
}

export async function attributeReferralSignup(
  client: pg.PoolClient,
  input: {
    refereeTenantId: string;
    refereeEmail: string;
    referralCode?: string;
    inviteToken?: string;
    signupIp?: string;
  }
): Promise<{ attributed: boolean; attributionId?: string; blocked?: boolean }> {
  const config = await getReferralProgramConfig(client);
  if (!config.isEnabled || !input.referralCode) return { attributed: false };

  const codeRow = await findReferralCodeByCode(client, input.referralCode);
  if (!codeRow || codeRow.tenantId === input.refereeTenantId) {
    return { attributed: false };
  }

  let invitationId: string | null = null;
  if (input.inviteToken) {
    const inv = await attributionRepo.getInvitationByToken(
      client,
      input.inviteToken,
      codeRow.tenantId
    );
    if (!inv) return { attributed: false };
    if (new Date(inv.expires_at as string) < new Date()) return { attributed: false };
    if (String(inv.invitee_email).toLowerCase() !== input.refereeEmail.toLowerCase()) {
      return { attributed: false, blocked: true };
    }
    invitationId = inv.id as string;
  }

  const ipHash = hashSignupIp(input.signupIp);
  const fraud = await runReferralFraudChecks(client, {
    referrerTenantId: codeRow.tenantId,
    refereeEmail: input.refereeEmail,
    signupIpHash: ipHash,
    referralCodeId: codeRow.id,
  });

  const attributionId = randomUUID();
  const status = fraud.blocked ? 'fraud_flagged' : 'signed_up';

  await attributionRepo.insert(client, {
    id: attributionId,
    referrerTenantId: codeRow.tenantId,
    refereeTenantId: input.refereeTenantId,
    referralCodeId: codeRow.id,
    invitationId,
    status,
    refereeEmail: input.refereeEmail,
    signupIpHash: ipHash,
    fraudScore: fraud.score,
    fraudNotes: fraud.reasons.map((r) => r.code).join(', ') || null,
  });

  await incrementReferralCodeMetric(client, codeRow.id, 'total_signups');

  if (invitationId) {
    await attributionRepo.markInvitationSignedUp(client, invitationId);
  }

  await logReferralEvent(client, {
    eventType: 'signup_attributed',
    referrerTenantId: codeRow.tenantId,
    refereeTenantId: input.refereeTenantId,
    attributionId,
    payload: { code: codeRow.code, fraudScore: fraud.score },
  });

  if (fraud.blocked) {
    await flagAttributionFraud(
      client,
      attributionId,
      fraud.score,
      fraud.reasons.map((r) => r.code).join(', '),
      fraud.reasons
    );
    return { attributed: true, attributionId, blocked: true };
  }

  return { attributed: true, attributionId };
}

export async function processReferralConversion(
  client: pg.PoolClient,
  refereeTenantId: string,
  options?: { paidConversion?: boolean }
): Promise<void> {
  const config = await getReferralProgramConfig(client);
  if (!config.isEnabled) return;

  const attr = await attributionRepo.getPendingConversion(client, refereeTenantId);
  if (!attr) return;

  if (attr.status === 'fraud_flagged' || attr.status === 'rejected') return;

  const signedUpAt = new Date(attr.signed_up_at as string);
  const daysSince = (Date.now() - signedUpAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < config.minDaysToConvert) return;

  if (config.requirePaidConversion && !options?.paidConversion) return;

  await attributionRepo.markConverted(client, attr.id as string);

  await incrementReferralCodeMetric(client, attr.referral_code_id as string, 'total_conversions');

  await logReferralEvent(client, {
    eventType: 'conversion',
    referrerTenantId: attr.referrer_tenant_id as string,
    refereeTenantId: attr.referee_tenant_id as string,
    attributionId: attr.id as string,
  });

  await issueReferralRewardsForAttribution(client, attr.id as string);
}

export async function ensureReferrerCode(
  client: pg.PoolClient,
  tenantId: string,
  userId?: string | null
) {
  const code = await getOrCreateReferralCode(client, tenantId, userId);
  await logReferralEvent(client, {
    eventType: 'code_created',
    referrerTenantId: tenantId,
    payload: { code: code.code },
  });
  return code;
}
