import type { EmailAutomationEventType } from '../../constants/emailAutomation.js';

export type TemplateRenderContext = {
  recipientName: string | null;
  tenantName: string | null;
  billingPortalUrl: string;
  appUrl: string;
  unsubscribeUrl: string;
  trialEndDate?: string;
  planName?: string;
  featureTitle?: string;
  featureBody?: string;
  customBody?: string;
};

function greeting(name: string | null): string {
  return name ? `Hi ${name},` : 'Hi there,';
}

function footer(ctx: TemplateRenderContext): string {
  return `\n\n— The PBooks Pro Team\n\nManage email preferences: ${ctx.unsubscribeUrl}`;
}

function bodies(ctx: TemplateRenderContext): Record<EmailAutomationEventType, string> {
  const g = greeting(ctx.recipientName);
  const org = ctx.tenantName ? ` for ${ctx.tenantName}` : '';
  const trialEnd = ctx.trialEndDate
    ? new Date(ctx.trialEndDate).toLocaleDateString('en-US', { dateStyle: 'medium' })
    : 'soon';

  return {
    trial_started: `${g}\n\nWelcome to PBooks Pro${org}! Your free trial is active.\n\nStart with the setup wizard, add your bank accounts, and record your first transaction.\n\nOpen the app: ${ctx.appUrl}\nBilling: ${ctx.billingPortalUrl}`,
    trial_day_3: `${g}\n\nYou're on day 3 of your PBooks Pro trial. Today's focus: chart of accounts and categories.\n\nAccurate accounts make every report trustworthy.\n\nOpen Settings → Chart of Accounts: ${ctx.appUrl}`,
    trial_day_7: `${g}\n\nOne week in — great progress! Record a rent receipt or vendor payment to see balances update in real time.\n\nNeed a walkthrough? Open Customer Success in Settings for guided tours.\n\n${ctx.appUrl}`,
    trial_day_14: `${g}\n\nTwo weeks of trial time — explore Trial Balance, P&L, and rental dashboards to see the full picture.\n\n${ctx.appUrl}`,
    trial_expiring: `${g}\n\nYour PBooks Pro trial ends on ${trialEnd}. Subscribe now to keep your data and workflows uninterrupted.\n\nUpgrade: ${ctx.billingPortalUrl}`,
    subscription_purchased: `${g}\n\nThank you for subscribing to PBooks Pro${ctx.planName ? ` (${ctx.planName})` : ''}! Your workspace is fully unlocked.\n\nBilling portal: ${ctx.billingPortalUrl}`,
    payment_failed: `${g}\n\nWe couldn't process your latest PBooks Pro payment. Update your payment method within the grace period to avoid interruption.\n\nFix billing: ${ctx.billingPortalUrl}`,
    subscription_cancelled: `${g}\n\nYour PBooks Pro subscription has been cancelled. You can reactivate anytime from the billing portal.\n\n${ctx.billingPortalUrl}`,
    new_feature_announcement: `${g}\n\n${ctx.featureTitle || 'New features are live in PBooks Pro'}\n\n${ctx.featureBody || ctx.customBody || 'Log in to explore the latest improvements.'}\n\n${ctx.appUrl}`,
    re_engagement_campaign: `${g}\n\nWe noticed you haven't been active on PBooks Pro lately. Your property finance workspace is ready when you are.\n\n${ctx.customBody || 'Log back in to pick up where you left off.'}\n\n${ctx.appUrl}`,
  };
}

export function renderEmailText(
  eventType: EmailAutomationEventType,
  ctx: TemplateRenderContext
): string {
  const body = bodies(ctx)[eventType] ?? `${greeting(ctx.recipientName)}\n\n${ctx.customBody ?? eventType}`;
  return body + footer(ctx);
}

export function renderEmailHtml(
  eventType: EmailAutomationEventType,
  ctx: TemplateRenderContext,
  trackingPixelUrl: string
): string {
  const text = renderEmailText(eventType, ctx);
  const paragraphs = text
    .split('\n\n')
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6;color:#334155;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');

  return `<!DOCTYPE html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc;">
<div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e2e8f0;">
<div style="margin-bottom:20px;font-weight:700;color:#4f46e5;font-size:18px;">PBooks Pro</div>
${paragraphs}
</div>
<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getPublicBaseUrl(): string {
  return (
    process.env.EMAIL_AUTOMATION_PUBLIC_BASE_URL ||
    process.env.REFERRAL_SIGNUP_BASE_URL ||
    'https://app.pbookspro.com'
  ).replace(/\/$/, '');
}

export function buildAppUrl(): string {
  return process.env.EMAIL_AUTOMATION_APP_URL || getPublicBaseUrl();
}

export function buildBillingPortalUrl(): string {
  return process.env.EMAIL_AUTOMATION_BILLING_URL || `${getPublicBaseUrl()}/settings?tab=billing`;
}
