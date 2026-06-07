import nodemailer from 'nodemailer';
import type { EmailAutomationEventType } from '../../constants/emailAutomation.js';
import {
  buildAppUrl,
  buildBillingPortalUrl,
  getPublicBaseUrl,
  renderEmailHtml,
  renderEmailText,
  type TemplateRenderContext,
} from './emailAutomationTemplates.js';

export type SendAutomationEmailInput = {
  to: string;
  subject: string;
  eventType: EmailAutomationEventType;
  recipientName: string | null;
  tenantName: string | null;
  trackingToken: string;
  unsubscribeUrl: string;
  trialEndDate?: string;
  planName?: string;
  featureTitle?: string;
  featureBody?: string;
  customBody?: string;
};

function createTransport() {
  const host =
    process.env.EMAIL_AUTOMATION_SMTP_HOST ||
    process.env.MARKETING_SMTP_HOST ||
    process.env.DR_SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(
      process.env.EMAIL_AUTOMATION_SMTP_PORT ||
        process.env.MARKETING_SMTP_PORT ||
        process.env.DR_SMTP_PORT ||
        587
    ),
    secure: process.env.EMAIL_AUTOMATION_SMTP_SECURE === 'true',
    auth:
      (process.env.EMAIL_AUTOMATION_SMTP_USER || process.env.MARKETING_SMTP_USER) &&
      (process.env.EMAIL_AUTOMATION_SMTP_PASS || process.env.MARKETING_SMTP_PASS)
        ? {
            user: process.env.EMAIL_AUTOMATION_SMTP_USER || process.env.MARKETING_SMTP_USER,
            pass: process.env.EMAIL_AUTOMATION_SMTP_PASS || process.env.MARKETING_SMTP_PASS,
          }
        : undefined,
  });
}

export function isEmailAutomationSendEnabled(): boolean {
  return process.env.EMAIL_AUTOMATION_SEND_ENABLED === 'true';
}

export async function sendAutomationEmail(input: SendAutomationEmailInput): Promise<void> {
  const base = getPublicBaseUrl();
  const ctx: TemplateRenderContext = {
    recipientName: input.recipientName,
    tenantName: input.tenantName,
    appUrl: buildAppUrl(),
    billingPortalUrl: buildBillingPortalUrl(),
    unsubscribeUrl: input.unsubscribeUrl,
    trialEndDate: input.trialEndDate,
    planName: input.planName,
    featureTitle: input.featureTitle,
    featureBody: input.featureBody,
    customBody: input.customBody,
  };

  const trackingPixelUrl = `${base}/api/email/track/open/${input.trackingToken}`;
  const text = renderEmailText(input.eventType, ctx);
  const html = renderEmailHtml(input.eventType, ctx, trackingPixelUrl);

  if (!isEmailAutomationSendEnabled()) {
    const { logger } = await import('../../utils/logger.js');
    logger.info('[email-automation] Would send', {
      to: input.to,
      subject: input.subject,
      eventType: input.eventType,
    });
    return;
  }

  const transport = createTransport();
  if (!transport) {
    throw new Error('Email automation SMTP is not configured');
  }

  const from =
    process.env.EMAIL_AUTOMATION_EMAIL_FROM ||
    process.env.MARKETING_EMAIL_FROM ||
    process.env.DR_ALERT_EMAIL_FROM ||
    'hello@pbookspro.com';

  await transport.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text,
    html,
    list: {
      unsubscribe: {
        url: ctx.unsubscribeUrl,
        comment: 'Unsubscribe from PBooks Pro emails',
      },
    },
  });
}
