/**
 * Responsive, brand-consistent HTML email layout for PBooks Pro lifecycle & marketing emails.
 */

export const EMAIL_BRAND = {
  name: 'PBooks Pro',
  primary: '#4f46e5',
  primaryDark: '#4338ca',
  text: '#334155',
  muted: '#64748b',
  bg: '#f1f5f9',
  card: '#ffffff',
  border: '#e2e8f0',
  accent: '#eef2ff',
} as const;

export type EmailCta = {
  label: string;
  href: string;
};

export type EmailLayoutInput = {
  previewText?: string;
  headline?: string;
  greeting?: string;
  paragraphs: string[];
  bullets?: string[];
  cta?: EmailCta;
  secondaryCta?: EmailCta;
  footerNote?: string;
  unsubscribeUrl: string;
  trackingPixelUrl: string;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getEmailPublicBaseUrl(): string {
  return (
    process.env.EMAIL_AUTOMATION_PUBLIC_BASE_URL ||
    process.env.MARKETING_SITE_URL ||
    process.env.REFERRAL_SIGNUP_BASE_URL ||
    'https://app.pbookspro.com'
  ).replace(/\/$/, '');
}

export function getMarketingSiteUrl(): string {
  return (process.env.MARKETING_SITE_URL || 'https://www.pbookspro.com').replace(/\/$/, '');
}

export function getAppUrl(): string {
  return (process.env.EMAIL_AUTOMATION_APP_URL || getEmailPublicBaseUrl()).replace(/\/$/, '');
}

export function getBillingUrl(): string {
  return (
    process.env.EMAIL_AUTOMATION_BILLING_URL || `${getEmailPublicBaseUrl()}/settings?tab=billing`
  ).replace(/\/$/, '');
}

export function getTrialSignupUrl(): string {
  return `${getMarketingSiteUrl()}/download.html`;
}

export function getDemoUrl(): string {
  return `${getMarketingSiteUrl()}/demo.html`;
}

/** Wrap outbound link for open/click tracking. */
export function trackedLink(trackingToken: string, targetUrl: string, baseUrl?: string): string {
  const base = (baseUrl || getEmailPublicBaseUrl()).replace(/\/$/, '');
  return `${base}/api/email/track/click/${encodeURIComponent(trackingToken)}?url=${encodeURIComponent(targetUrl)}`;
}

export function trackingPixelUrl(trackingToken: string, baseUrl?: string): string {
  const base = (baseUrl || getEmailPublicBaseUrl()).replace(/\/$/, '');
  return `${base}/api/email/track/open/${encodeURIComponent(trackingToken)}`;
}

function renderCta(cta: EmailCta): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
<tr><td style="border-radius:8px;background:${EMAIL_BRAND.primary};">
<a href="${cta.href}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(cta.label)}</a>
</td></tr></table>`;
}

export function renderEmailHtml(input: EmailLayoutInput): string {
  const preview = input.previewText ? escapeHtml(input.previewText) : '';
  const headline = input.headline
    ? `<h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:${EMAIL_BRAND.text};font-weight:700;">${escapeHtml(input.headline)}</h1>`
    : '';
  const greeting = input.greeting
    ? `<p style="margin:0 0 16px;line-height:1.6;color:${EMAIL_BRAND.text};font-size:15px;">${escapeHtml(input.greeting)}</p>`
    : '';

  const paragraphs = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;line-height:1.65;color:${EMAIL_BRAND.text};font-size:15px;">${escapeHtml(p)}</p>`
    )
    .join('');

  const bullets = input.bullets?.length
    ? `<ul style="margin:0 0 20px;padding-left:20px;color:${EMAIL_BRAND.text};font-size:15px;line-height:1.65;">
${input.bullets.map((b) => `<li style="margin-bottom:8px;">${escapeHtml(b)}</li>`).join('')}
</ul>`
    : '';

  const secondaryCta = input.secondaryCta
    ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.6;">
<a href="${input.secondaryCta.href}" style="color:${EMAIL_BRAND.primary};font-weight:600;text-decoration:none;">${escapeHtml(input.secondaryCta.label)} →</a>
</p>`
    : '';

  const footerNote = input.footerNote
    ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:${EMAIL_BRAND.muted};">${escapeHtml(input.footerNote)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>${escapeHtml(EMAIL_BRAND.name)}</title>
${preview ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preview}</div>` : ''}
</head>
<body style="margin:0;padding:0;background:${EMAIL_BRAND.bg};font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BRAND.bg};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 0 16px;text-align:center;">
<span style="font-size:20px;font-weight:800;color:${EMAIL_BRAND.primary};letter-spacing:-0.02em;">${EMAIL_BRAND.name}</span>
</td></tr>
<tr><td style="background:${EMAIL_BRAND.card};border-radius:12px;border:1px solid ${EMAIL_BRAND.border};padding:32px 28px;">
${headline}${greeting}${paragraphs}${bullets}
${input.cta ? renderCta(input.cta) : ''}${secondaryCta}${footerNote}
</td></tr>
<tr><td style="padding:20px 8px 0;text-align:center;font-size:12px;line-height:1.6;color:${EMAIL_BRAND.muted};">
<p style="margin:0 0 8px;">© ${new Date().getFullYear()} ${EMAIL_BRAND.name}. Property &amp; construction accounting software.</p>
<p style="margin:0;">
<a href="${input.unsubscribeUrl}" style="color:${EMAIL_BRAND.muted};text-decoration:underline;">Unsubscribe</a>
&nbsp;·&nbsp;
<a href="${getMarketingSiteUrl()}/privacy.html" style="color:${EMAIL_BRAND.muted};text-decoration:underline;">Privacy</a>
</p>
</td></tr>
</table>
</td></tr>
</table>
<img src="${input.trackingPixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;"/>
</body>
</html>`;
}

export function renderEmailText(input: Omit<EmailLayoutInput, 'trackingPixelUrl'> & { signOff?: string }): string {
  const lines: string[] = [];
  if (input.greeting) lines.push(input.greeting, '');
  if (input.headline) lines.push(input.headline, '');
  lines.push(...input.paragraphs);
  if (input.bullets?.length) {
    lines.push('');
    for (const b of input.bullets) lines.push(`• ${b}`);
  }
  if (input.cta) {
    lines.push('', `${input.cta.label}: ${input.cta.href}`);
  }
  if (input.secondaryCta) {
    lines.push(`${input.secondaryCta.label}: ${input.secondaryCta.href}`);
  }
  if (input.footerNote) {
    lines.push('', input.footerNote);
  }
  lines.push('', `— The ${EMAIL_BRAND.name} Team`, '', `Unsubscribe: ${input.unsubscribeUrl}`);
  return lines.join('\n');
}
