import nodemailer from 'nodemailer';

export type MarketingEmailPayload = {
  to: string;
  name: string | null;
  subject: string;
  templateKey: string;
};

function createTransport() {
  const host = process.env.MARKETING_SMTP_HOST || process.env.DR_SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.MARKETING_SMTP_PORT || process.env.DR_SMTP_PORT || 587),
    secure: process.env.MARKETING_SMTP_SECURE === 'true',
    auth:
      process.env.MARKETING_SMTP_USER && process.env.MARKETING_SMTP_PASS
        ? {
            user: process.env.MARKETING_SMTP_USER,
            pass: process.env.MARKETING_SMTP_PASS,
          }
        : undefined,
  });
}

function renderBody(templateKey: string, name: string | null): string {
  const greeting = name ? `Hi ${name},` : 'Hi there,';
  const checklistUrl =
    process.env.MARKETING_CHECKLIST_URL ||
    'https://www.pbookspro.com/assets/checklists/property-management-accounting-checklist.html';

  const bodies: Record<string, string> = {
    lead_checklist_instant: `${greeting}\n\nThanks for downloading the Property Management & Accounting Checklist.\n\nAccess it here: ${checklistUrl}\n\n— The PBooksPro Team`,
    newsletter_welcome: `${greeting}\n\nWelcome to PBooksPro insights — practical finance tips for property and construction teams.\n\n— The PBooksPro Team`,
  };

  return bodies[templateKey] || `${greeting}\n\n${templateKey}\n\n— The PBooksPro Team`;
}

export async function sendMarketingEmail(payload: MarketingEmailPayload): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    throw new Error('Marketing SMTP is not configured');
  }

  const from =
    process.env.MARKETING_EMAIL_FROM ||
    process.env.DR_ALERT_EMAIL_FROM ||
    'hello@pbookspro.com';

  await transport.sendMail({
    from,
    to: payload.to,
    subject: payload.subject,
    text: renderBody(payload.templateKey, payload.name),
  });
}
