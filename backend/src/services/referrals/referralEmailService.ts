import nodemailer from 'nodemailer';
import { REFERRAL_EMAIL_TEMPLATES } from '../../constants/referralProgram.js';

export type ReferralEmailPayload = {
  to: string;
  inviterName: string;
  inviteeName?: string | null;
  shareUrl: string;
  templateKey: string;
  subject: string;
};

function createTransport() {
  const host = process.env.REFERRAL_SMTP_HOST || process.env.MARKETING_SMTP_HOST || process.env.DR_SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.REFERRAL_SMTP_PORT || process.env.MARKETING_SMTP_PORT || process.env.DR_SMTP_PORT || 587),
    secure: process.env.REFERRAL_SMTP_SECURE === 'true',
    auth:
      process.env.REFERRAL_SMTP_USER && process.env.REFERRAL_SMTP_PASS
        ? { user: process.env.REFERRAL_SMTP_USER, pass: process.env.REFERRAL_SMTP_PASS }
        : process.env.MARKETING_SMTP_USER && process.env.MARKETING_SMTP_PASS
          ? { user: process.env.MARKETING_SMTP_USER, pass: process.env.MARKETING_SMTP_PASS }
          : undefined,
  });
}

function renderReferralEmailBody(payload: ReferralEmailPayload): string {
  const greeting = payload.inviteeName ? `Hi ${payload.inviteeName},` : 'Hi there,';
  const inviter = payload.inviterName || 'A PBooks Pro user';

  const templates: Record<string, string> = {
    referral_invitation: `${greeting}

${inviter} thinks PBooks Pro would help your property or construction finance team.

PBooks Pro unifies rental management, project costing, and accounting in one platform — with real-time KPIs and 30+ reports.

Start your free trial using this personal invitation link:
${payload.shareUrl}

This link is tied to your email address and expires in 30 days.

— The PBooks Pro Team`,

    referral_invitation_reminder: `${greeting}

Just a friendly reminder — you still have an open invitation to try PBooks Pro:

${payload.shareUrl}

Questions? Reply to this email or visit pbookspro.com.

— The PBooks Pro Team`,

    referral_reward_earned: `${greeting}

Great news — you earned a referral reward on PBooks Pro!

Sign in to your account and open Settings → Referral Program to see your reward details.

— The PBooks Pro Team`,
  };

  return templates[payload.templateKey] || `${greeting}\n\n${payload.shareUrl}\n\n— The PBooks Pro Team`;
}

export async function sendReferralEmail(payload: ReferralEmailPayload): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[referral-email] SMTP not configured; would send:', payload.to, payload.subject);
      return;
    }
    throw new Error('Referral SMTP is not configured');
  }

  const from =
    process.env.REFERRAL_EMAIL_FROM ||
    process.env.MARKETING_EMAIL_FROM ||
    process.env.DR_ALERT_EMAIL_FROM ||
    'hello@pbookspro.com';

  await transport.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    text: renderReferralEmailBody(payload),
  });
}

export function invitationEmailSubject(inviterName: string): string {
  return REFERRAL_EMAIL_TEMPLATES.invitation.subject.replace('{{inviterName}}', inviterName);
}
