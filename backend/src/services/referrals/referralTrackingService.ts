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
    const { rows: invites } = await client.query(
      `SELECT id, invitee_email, status, expires_at FROM referral_invitations
       WHERE invite_token = $1 AND referrer_tenant_id = $2 LIMIT 1`,
      [input.inviteToken, codeRow.tenantId]
    );
    if (!invites.length) return { attributed: false };
    const inv = invites[0];
    if (new Date(inv.expires_at) < new Date()) return { attributed: false };
    if (inv.invitee_email.toLowerCase() !== input.refereeEmail.toLowerCase()) {
      return { attributed: false, blocked: true };
    }
    invitationId = inv.id;
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

  await client.query(
    `INSERT INTO referral_attributions (
       id, referrer_tenant_id, referee_tenant_id, referral_code_id, invitation_id,
       status, referee_email, signup_ip_hash, fraud_score, fraud_notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      attributionId,
      codeRow.tenantId,
      input.refereeTenantId,
      codeRow.id,
      invitationId,
      status,
      input.refereeEmail,
      ipHash,
      fraud.score,
      fraud.reasons.map((r) => r.code).join(', ') || null,
    ]
  );

  await incrementReferralCodeMetric(client, codeRow.id, 'total_signups');

  if (invitationId) {
    await client.query(
      `UPDATE referral_invitations SET status = 'signed_up', updated_at = NOW() WHERE id = $1`,
      [invitationId]
    );
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

  const { rows } = await client.query(
    `SELECT * FROM referral_attributions
     WHERE referee_tenant_id = $1 AND status IN ('signed_up', 'trialing')
     LIMIT 1`,
    [refereeTenantId]
  );
  if (!rows.length) return;

  const attr = rows[0];
  if (attr.status === 'fraud_flagged' || attr.status === 'rejected') return;

  const signedUpAt = new Date(attr.signed_up_at);
  const daysSince = (Date.now() - signedUpAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < config.minDaysToConvert) return;

  if (config.requirePaidConversion && !options?.paidConversion) return;

  await client.query(
    `UPDATE referral_attributions SET status = 'converted', converted_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [attr.id]
  );

  await incrementReferralCodeMetric(client, attr.referral_code_id, 'total_conversions');

  await logReferralEvent(client, {
    eventType: 'conversion',
    referrerTenantId: attr.referrer_tenant_id,
    refereeTenantId: attr.referee_tenant_id,
    attributionId: attr.id,
  });

  await issueReferralRewardsForAttribution(client, attr.id);
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
