/**
 * DR email notifications (SMTP when configured).
 */

import nodemailer from 'nodemailer';

export type DrEmailPayload = {
  subject: string;
  text: string;
  html?: string;
};

function smtpConfigured(): boolean {
  return !!process.env.DR_SMTP_HOST?.trim();
}

function createTransport() {
  const host = process.env.DR_SMTP_HOST!.trim();
  const port = Number(process.env.DR_SMTP_PORT ?? 587);
  const user = process.env.DR_SMTP_USER?.trim();
  const pass = process.env.DR_SMTP_PASS?.trim();
  const secure = process.env.DR_SMTP_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
}

export async function sendDrEmail(
  recipients: string[],
  payload: DrEmailPayload
): Promise<{ sent: boolean; error?: string }> {
  const emails = recipients.map((e) => e.trim()).filter(Boolean);
  if (emails.length === 0) {
    return { sent: false, error: 'No email recipients configured.' };
  }
  if (!smtpConfigured()) {
    console.warn('[DR Email] DR_SMTP_HOST not set — alert logged only.');
    return { sent: false, error: 'SMTP not configured (set DR_SMTP_HOST).' };
  }

  const from =
    process.env.DR_ALERT_EMAIL_FROM?.trim() ||
    process.env.DR_SMTP_USER?.trim() ||
    'pbooks-dr@localhost';

  try {
    const transport = createTransport();
    await transport.sendMail({
      from,
      to: emails.join(', '),
      subject: payload.subject,
      text: payload.text,
      html: payload.html ?? payload.text.replace(/\n/g, '<br>'),
    });
    return { sent: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error('[DR Email] Send failed:', error);
    return { sent: false, error };
  }
}
