import { randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { buildShareUrl, getOrCreateReferralCode } from './referralCodeService.js';
import { getReferralProgramConfig } from './referralProgramConfigService.js';
import { sendReferralEmail, invitationEmailSubject } from './referralEmailService.js';
import { logReferralEvent } from './referralEventService.js';
import { REFERRAL_EMAIL_TEMPLATES } from '../../constants/referralProgram.js';
import { ReferralInvitationRepository } from '../../modules/referrals/repositories/ReferralRepository.js';

const invitationRepo = new ReferralInvitationRepository();

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

  await invitationRepo.insert(client, {
    id: invitationId,
    referrerTenantId: input.referrerTenantId,
    referralCodeId: code.id,
    inviteeEmail: input.inviteeEmail.trim().toLowerCase(),
    inviteeName: input.inviteeName?.trim() || null,
    inviteToken: token,
    expiresAt: expiresAt.toISOString(),
    createdByUserId: input.createdByUserId,
  });

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
    await invitationRepo.markSent(client, invitationId);
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
  const inv = await invitationRepo.getByTokenWithCode(client, token);
  if (!inv) return { valid: false };
  if (new Date(inv.expires_at as string) < new Date()) return { valid: false };

  if (inv.status === 'sent' || inv.status === 'pending') {
    await invitationRepo.markOpened(client, inv.id as string);
    await logReferralEvent(client, {
      eventType: 'invite_opened',
      referrerTenantId: inv.referrer_tenant_id as string,
      payload: { invitationId: inv.id },
    });
  }

  return { valid: true, inviteeEmail: inv.invitee_email as string, code: inv.code as string };
}
