import nodemailer from 'nodemailer';

function createTransport() {
  const host =
    process.env.ORG_APPROVAL_SMTP_HOST ||
    process.env.EMAIL_AUTOMATION_SMTP_HOST ||
    process.env.MARKETING_SMTP_HOST ||
    process.env.DR_SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(
      process.env.ORG_APPROVAL_SMTP_PORT ||
        process.env.EMAIL_AUTOMATION_SMTP_PORT ||
        process.env.MARKETING_SMTP_PORT ||
        process.env.DR_SMTP_PORT ||
        587
    ),
    secure: process.env.ORG_APPROVAL_SMTP_SECURE === 'true',
    auth:
      process.env.ORG_APPROVAL_SMTP_USER && process.env.ORG_APPROVAL_SMTP_PASS
        ? {
            user: process.env.ORG_APPROVAL_SMTP_USER,
            pass: process.env.ORG_APPROVAL_SMTP_PASS,
          }
        : undefined,
  });
}

function appLoginUrl(): string {
  return (
    process.env.ORG_APPROVAL_APP_URL ||
    process.env.EMAIL_AUTOMATION_APP_URL ||
    process.env.TRIAL_SIGNUP_APP_URL ||
    'https://app.pbookspro.com'
  ).replace(/\/$/, '');
}

function fromAddress(): string {
  return (
    process.env.ORG_APPROVAL_EMAIL_FROM?.trim() ||
    process.env.EMAIL_AUTOMATION_FROM?.trim() ||
    'noreply@pbookspro.com'
  );
}

async function sendOrgEmail(to: string, subject: string, text: string): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.warn('[Org Approval Email] SMTP not configured — email not sent:', subject);
    return;
  }
  await transport.sendMail({
    from: fromAddress(),
    to,
    subject,
    text,
    html: text.replace(/\n/g, '<br>'),
  });
}

export async function sendOrganizationApprovedEmail(to: string, organizationName: string): Promise<void> {
  const loginUrl = appLoginUrl();
  const text = `Congratulations!

Your organization "${organizationName}" has been approved.

You may now log in to PBooks Pro.

Login URL:
${loginUrl}`;

  await sendOrgEmail(to, 'Your PBooks Pro Account Has Been Approved', text);
}

export async function sendOrganizationRejectedEmail(
  to: string,
  organizationName: string,
  reason: string
): Promise<void> {
  const text = `Organization Registration Update

We were unable to approve the registration for "${organizationName}" at this time.

Reason:
${reason}

If you believe this was a mistake, please contact support.`;

  await sendOrgEmail(to, 'Organization Registration Update', text);
}
