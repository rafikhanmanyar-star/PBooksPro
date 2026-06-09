import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { MarketingEmailTemplateKey } from '../../constants/marketingEmailTemplates.js';
import { signUnsubscribe } from '../emailAutomation/emailAutomationUnsubscribeService.js';
import { getEmailPublicBaseUrl } from '../email/emailBrandLayout.js';
import { renderMarketingTemplate, type EmailRenderContext } from '../email/emailTemplateLibrary.js';

export type MarketingEmailPayload = {
  to: string;
  name: string | null;
  subject: string;
  templateKey: MarketingEmailTemplateKey | string;
  trackingToken?: string;
  unsubscribeUrl?: string;
  context?: Partial<EmailRenderContext>;
};

function createTransport() {
  const host =
    process.env.MARKETING_SMTP_HOST ||
    process.env.EMAIL_AUTOMATION_SMTP_HOST ||
    process.env.DR_SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(
      process.env.MARKETING_SMTP_PORT ||
        process.env.EMAIL_AUTOMATION_SMTP_PORT ||
        process.env.DR_SMTP_PORT ||
        587
    ),
    secure: process.env.MARKETING_SMTP_SECURE === 'true',
    auth:
      process.env.MARKETING_SMTP_USER && process.env.MARKETING_SMTP_PASS
        ? {
            user: process.env.MARKETING_SMTP_USER,
            pass: process.env.MARKETING_SMTP_PASS,
          }
        : process.env.EMAIL_AUTOMATION_SMTP_USER && process.env.EMAIL_AUTOMATION_SMTP_PASS
          ? {
              user: process.env.EMAIL_AUTOMATION_SMTP_USER,
              pass: process.env.EMAIL_AUTOMATION_SMTP_PASS,
            }
          : undefined,
  });
}

export function buildMarketingUnsubscribeUrl(email: string): string {
  const sig = signUnsubscribe(email, null, 'marketing');
  const base = getEmailPublicBaseUrl();
  return `${base}/api/email/unsubscribe?email=${encodeURIComponent(email)}&tenant=&category=marketing&sig=${sig}`;
}

export async function sendMarketingEmail(payload: MarketingEmailPayload): Promise<string> {
  const trackingToken = payload.trackingToken || randomUUID();
  const unsubscribeUrl = payload.unsubscribeUrl || buildMarketingUnsubscribeUrl(payload.to);

  const ctx: EmailRenderContext = {
    recipientName: payload.name,
    trackingToken,
    unsubscribeUrl,
    leadMagnetUrl:
      process.env.MARKETING_LEAD_MAGNET_URL ||
      process.env.MARKETING_CHECKLIST_URL ||
      undefined,
    leadMagnetTitle: 'Your free property finance guide',
    ...(payload.context ?? {}),
  };

  const { html, text } = renderMarketingTemplate(
    payload.templateKey as MarketingEmailTemplateKey,
    ctx
  );

  if (process.env.MARKETING_EMAIL_SEND_ENABLED !== 'true') {
    const { logger } = await import('../../utils/logger.js');
    logger.info('[marketing-email] Would send', {
      to: payload.to,
      subject: payload.subject,
      templateKey: payload.templateKey,
    });
    return trackingToken;
  }

  const transport = createTransport();
  if (!transport) {
    throw new Error('Marketing SMTP is not configured');
  }

  const from =
    process.env.MARKETING_EMAIL_FROM ||
    process.env.EMAIL_AUTOMATION_EMAIL_FROM ||
    process.env.DR_ALERT_EMAIL_FROM ||
    'hello@pbookspro.com';

  await transport.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    text,
    html,
    list: {
      unsubscribe: {
        url: unsubscribeUrl,
        comment: 'Unsubscribe from PBooks Pro marketing emails',
      },
    },
  });

  return trackingToken;
}
