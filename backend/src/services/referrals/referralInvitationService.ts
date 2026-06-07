import { randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { buildShareUrl, getOrCreateReferralCode } from './referralCodeService.js';
import { getReferralProgramConfig } from './referralProgramConfigService.js';
import { sendReferralEmail, invitationEmailSubject } from './referralEmailService.js';
import { logReferralEvent } from './referralEventService.js';
import { REFERRAL_EMAIL_TEMPLATES } from '../../constants/referralProgram.js';

function inviteToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function sendReferralInvitation(
  client: pg.PoolClient,
  input: {
    referrerTenantId: string;
    createdByUserId: string;
    inviterName: string;
    inviteeEmail: string;
    inviteeName?: string;
  }
): Promise<{ invitationId: string; sent: boolean }> {
  const config = await getReferralProgramConfig(client);
  if (!config.isEnabled) throw new Error('Referral program is disabled.');

  const code = await getOrCreateReferralCode(client, input.referrerTenantId, input.createdByUserId);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.invitationExpiryDays);

  const token = inviteToken();
  const invitationId = randomUUID();
  const shareUrl = `${buildShareUrl(config.signupBaseUrl, code.code)}&invite=${token}`;

  await client.query(
    `INSERT INTO referral_invitations (
       id, referrer_tenant_id, referral_code_id, invitee_email, invitee_name,
       invite_token, status, expires_at, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)`,
    [
      invitationId,
      input.referrerTenantId,
      code.id,
      input.inviteeEmail.trim().toLowerCase(),
      input.inviteeName?.trim() || null,
      token,
      expiresAt.toISOString(),
      input.createdByUserId,
    ]
  );

  let sent = false;
  try {
    await sendReferralEmail({
      to: input.inviteeEmail,
      inviterName: input.inviterName,
      inviteeName: input.inviteeName,
      shareUrl,
      templateKey: REFERRAL_EMAIL_TEMPLATES.invitation.templateKey,
      subject: invitationEmailSubject(input.inviterName),
    });
    sent = true;
    await client.query(
      `UPDATE referral_invitations SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [invitationId]
    );
  } catch (e) {
    console.error('[referral] invitation email failed:', e);
  }

  await logReferralEvent(client, {
    eventType: 'invite_sent',
    referrerTenantId: input.referrerTenantId,
    payload: { invitationId, inviteeEmail: input.inviteeEmail, sent },
  });

  return { invitationId, sent };
}

export async function markInvitationOpened(
  client: pg.PoolClient,
  token: string
): Promise<{ valid: boolean; inviteeEmail?: string; code?: string }> {
  const { rows } = await client.query(
    `SELECT i.*, c.code FROM referral_invitations i
     INNER JOIN referral_codes c ON c.id = i.referral_code_id
     WHERE i.invite_token = $1 LIMIT 1`,
    [token]
  );
  if (!rows.length) return { valid: false };
  const inv = rows[0];
  if (new Date(inv.expires_at) < new Date()) return { valid: false };

  if (inv.status === 'sent' || inv.status === 'pending') {
    await client.query(
      `UPDATE referral_invitations SET status = 'opened', opened_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [inv.id]
    );
    await logReferralEvent(client, {
      eventType: 'invite_opened',
      referrerTenantId: inv.referrer_tenant_id,
      payload: { invitationId: inv.id },
    });
  }

  return { valid: true, inviteeEmail: inv.invitee_email, code: inv.code };
}
