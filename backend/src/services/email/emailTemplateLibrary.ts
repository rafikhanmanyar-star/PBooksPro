import type { EmailAutomationEventType } from '../../constants/emailAutomation.js';
import type { MarketingEmailTemplateKey } from '../../constants/marketingEmailTemplates.js';
import {
  EMAIL_BRAND,
  getAppUrl,
  getBillingUrl,
  getDemoUrl,
  getMarketingSiteUrl,
  getTrialSignupUrl,
  renderEmailHtml,
  renderEmailText,
  trackedLink,
  trackingPixelUrl,
  type EmailLayoutInput,
} from './emailBrandLayout.js';

export type EmailRenderContext = {
  recipientName: string | null;
  tenantName?: string | null;
  trackingToken: string;
  unsubscribeUrl: string;
  trialEndDate?: string;
  planName?: string;
  featureTitle?: string;
  featureBody?: string;
  customBody?: string;
  bookingRef?: string;
  preferredSlot?: string;
  companyName?: string;
  calendlyUrl?: string;
  bookingStatusUrl?: string;
  leadMagnetUrl?: string;
  leadMagnetTitle?: string;
};

function greeting(name: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : 'Hi there,';
}

function formatDate(iso?: string): string {
  if (!iso) return 'soon';
  try {
    return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' });
  } catch {
    return 'soon';
  }
}

function baseLayout(ctx: EmailRenderContext, content: Omit<EmailLayoutInput, 'unsubscribeUrl' | 'trackingPixelUrl'>): {
  html: string;
  text: string;
} {
  const layout: EmailLayoutInput = {
    ...content,
    unsubscribeUrl: ctx.unsubscribeUrl,
    trackingPixelUrl: trackingPixelUrl(ctx.trackingToken),
  };
  return { html: renderEmailHtml(layout), text: renderEmailText(layout) };
}

function link(ctx: EmailRenderContext, url: string): string {
  return trackedLink(ctx.trackingToken, url);
}

// ─── Marketing / lead nurture templates ─────────────────────────────────────

const MARKETING_BUILDERS: Record<
  MarketingEmailTemplateKey,
  (ctx: EmailRenderContext) => { html: string; text: string }
> = {
  demo_confirmation: (ctx) =>
    baseLayout(ctx, {
      previewText: 'Your PBooks Pro demo request is confirmed.',
      headline: 'Your demo request is confirmed',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        'Thank you for booking a PBooks Pro demo. Our team will confirm your session within one business day.',
        ctx.bookingRef ? `Reference: ${ctx.bookingRef}` : '',
        ctx.companyName ? `Company: ${ctx.companyName}` : '',
        ctx.preferredSlot ? `Preferred time: ${ctx.preferredSlot}` : '',
      ].filter(Boolean),
      cta: ctx.calendlyUrl
        ? { label: 'Pick a time on our calendar', href: link(ctx, ctx.calendlyUrl) }
        : { label: 'View booking status', href: link(ctx, ctx.bookingStatusUrl || getDemoUrl()) },
      secondaryCta: ctx.bookingStatusUrl
        ? { label: 'View your booking status', href: link(ctx, ctx.bookingStatusUrl) }
        : undefined,
      footerNote: 'Reply to this email if you need to reschedule.',
    }),

  demo_reminder: (ctx) =>
    baseLayout(ctx, {
      previewText: 'Reminder: your PBooks Pro demo is coming up.',
      headline: 'Reminder — your demo is almost here',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        'This is a friendly reminder about your PBooks Pro demo request.',
        'If you have not picked a time yet, choose a slot that works for you. If you already scheduled, we look forward to showing you rental accounting, construction costing, and reporting in one workspace.',
      ],
      bullets: [
        'Prepare 2–3 questions about your current property or construction workflows',
        'Invite a colleague from finance or operations if helpful',
        'Have a sample rent roll or project cost sheet ready (optional)',
      ],
      cta: ctx.calendlyUrl
        ? { label: 'Schedule your demo', href: link(ctx, ctx.calendlyUrl) }
        : { label: 'Book a demo', href: link(ctx, getDemoUrl()) },
      footerNote: 'Need to reschedule? Reply to this email.',
    }),

  demo_followup: (ctx) =>
    baseLayout(ctx, {
      previewText: 'Following up on your PBooks Pro demo.',
      headline: 'How did your demo go?',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        'We hope your PBooks Pro walkthrough was useful. Many property and construction teams start with a free trial to map their chart of accounts, properties, and first reports.',
        'Your trial includes the full setup wizard, rental dashboards, and construction project costing — no credit card required.',
      ],
      cta: { label: 'Start your 14-day free trial', href: link(ctx, getTrialSignupUrl()) },
      secondaryCta: { label: 'Book another demo', href: link(ctx, getDemoUrl()) },
    }),

  newsletter_welcome: (ctx) =>
    baseLayout(ctx, {
      previewText: 'Welcome to PBooks Pro insights.',
      headline: 'Welcome to PBooks Pro insights',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        'You are subscribed to practical finance tips for property managers, developers, and construction finance teams across Pakistan, the GCC, and beyond.',
        'Expect concise guides on rental accounting, project costing, compliance, and software best practices — no spam.',
      ],
      cta: { label: 'Explore our blog', href: link(ctx, `${getMarketingSiteUrl()}/blog.html`) },
      footerNote: 'Your lead magnet is on its way in a separate email.',
    }),

  newsletter_lead_magnet: (ctx) =>
    baseLayout(ctx, {
      previewText: ctx.leadMagnetTitle || 'Your free resource is ready.',
      headline: ctx.leadMagnetTitle || 'Your free resource is ready',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        'Thanks for subscribing. Here is the resource we promised — a practical guide you can share with your finance and operations team.',
        'Use it to audit rent collection, project WIP, and month-end close workflows before you migrate from spreadsheets.',
      ],
      cta: {
        label: 'Download your guide',
        href: link(
          ctx,
          ctx.leadMagnetUrl ||
            `${getMarketingSiteUrl()}/blog/property-management-accounting-guide.html`
        ),
      },
      secondaryCta: { label: 'See PBooks Pro in action', href: link(ctx, getDemoUrl()) },
    }),

  lead_checklist_instant: (ctx) =>
    baseLayout(ctx, {
      previewText: 'Your Property Management & Accounting Checklist.',
      headline: 'Your checklist is ready',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        'Thanks for downloading the Property Management & Accounting Checklist.',
        'Use it to standardize rent rolls, owner statements, construction WIP, and month-end close across your portfolio.',
      ],
      cta: {
        label: 'Open your checklist',
        href: link(
          ctx,
          ctx.leadMagnetUrl ||
            process.env.MARKETING_CHECKLIST_URL ||
            `${getMarketingSiteUrl()}/blog/property-management-accounting-guide.html`
        ),
      },
    }),

  lead_checklist_day2: (ctx) =>
    baseLayout(ctx, {
      previewText: '3 accounting mistakes property managers make.',
      headline: '3 accounting mistakes to avoid',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        'Most portfolio issues trace back to the same three gaps: inconsistent rent recognition, manual project cost allocation, and delayed bank reconciliation.',
        'Fixing these early prevents painful year-end adjustments and owner disputes.',
      ],
      bullets: [
        'Recording rent when received instead of when earned',
        'Mixing construction WIP with operating expenses',
        'Skipping periodic balance-sheet reconciliation',
      ],
      cta: { label: 'See how PBooks Pro helps', href: link(ctx, getDemoUrl()) },
    }),

  lead_checklist_day5: (ctx) =>
    baseLayout(ctx, {
      previewText: 'See rentals and construction in one workspace.',
      headline: 'One system for rentals & construction',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        'PBooks Pro unifies property management accounting and construction ERP — shared chart of accounts, project budgets, and executive reporting.',
        'Book a 20-minute demo tailored to your portfolio size and markets.',
      ],
      cta: { label: 'Book a live demo', href: link(ctx, getDemoUrl()) },
    }),

  lead_checklist_day10: (ctx) =>
    baseLayout(ctx, {
      previewText: 'Ready to replace spreadsheets?',
      headline: 'Start your free trial',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        'Teams that complete our 4-step onboarding wizard typically have properties, fiscal year, and first reports configured within a day.',
        'Your 14-day trial includes full access — upgrade only when you are ready.',
      ],
      cta: { label: 'Create your trial account', href: link(ctx, getTrialSignupUrl()) },
    }),

  newsletter_week2: (ctx) =>
    baseLayout(ctx, {
      previewText: 'Property finance KPIs worth tracking monthly.',
      headline: 'KPIs worth tracking every month',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        'Strong operators review the same core metrics monthly: occupancy, delinquency, NOI trend, construction budget variance, and cash runway.',
        'We publish deeper dives on our blog — here is a starting framework for your leadership review.',
      ],
      bullets: [
        'Occupancy & weighted average rent',
        'Aged receivables and collection rate',
        'Project cost variance vs. budget',
        'Operating cash flow vs. prior month',
      ],
      cta: { label: 'Read the latest articles', href: link(ctx, `${getMarketingSiteUrl()}/blog.html`) },
    }),
};

// ─── Tenant lifecycle (trial / billing) templates ───────────────────────────

function trialWelcome(ctx: EmailRenderContext) {
  const org = ctx.tenantName ? ` for ${ctx.tenantName}` : '';
  return baseLayout(ctx, {
    previewText: 'Your 14-day PBooks Pro trial has started.',
    headline: `Welcome to ${EMAIL_BRAND.name}`,
    greeting: greeting(ctx.recipientName),
    paragraphs: [
      `Your 14-day free trial${org} is active. Complete the setup wizard to configure your company, properties, fiscal year, and team invites.`,
      'Most teams configure their first rent roll or project budget on day one.',
    ],
    bullets: [
      'Step 1 — Company & fiscal year',
      'Step 2 — Properties or projects',
      'Step 3 — Chart of accounts',
      'Step 4 — Invite your team',
    ],
    cta: { label: 'Open PBooks Pro', href: link(ctx, getAppUrl()) },
    secondaryCta: { label: 'View billing & plans', href: link(ctx, getBillingUrl()) },
  });
}

function trialDay1(ctx: EmailRenderContext) {
  return baseLayout(ctx, {
    previewText: 'Day 1 tips to get the most from your trial.',
    headline: 'Day 1 — Quick-start tips',
    greeting: greeting(ctx.recipientName),
    paragraphs: [
      'A strong first day sets up the rest of your trial. Focus on one workflow you run every week — rent invoicing, owner statements, or project cost tracking.',
    ],
    bullets: [
      'Finish the onboarding wizard if you have not already',
      'Import or create your first property or construction project',
      'Post one real transaction to validate your chart of accounts',
      'Bookmark the reports you will share with leadership',
    ],
    cta: { label: 'Continue setup', href: link(ctx, getAppUrl()) },
  });
}

function trialDay3(ctx: EmailRenderContext) {
  return baseLayout(ctx, {
    previewText: 'Explore features that save hours each month.',
    headline: 'Day 3 — Features to explore',
    greeting: greeting(ctx.recipientName),
    paragraphs: [
      'By now your workspace should have baseline data. Explore the features that differentiate PBooks Pro from generic accounting tools.',
    ],
    bullets: [
      'Rental dashboards — occupancy, collections, and delinquency',
      'Construction project budgets & WIP tracking',
      'Multi-entity reporting for developers and PM firms',
      'Owner statements and investor-ready exports',
    ],
    cta: { label: 'Explore your workspace', href: link(ctx, getAppUrl()) },
  });
}

function trialDay7(ctx: EmailRenderContext) {
  return baseLayout(ctx, {
    previewText: 'Halfway through your trial — see the benefits.',
    headline: 'Day 7 — Trial benefits so far',
    greeting: greeting(ctx.recipientName),
    paragraphs: [
      'You are halfway through your 14-day trial. Teams that reach day 7 with live data typically report faster month-end close and clearer project visibility.',
      'If you have questions, reply to this email or book a quick walkthrough with our team.',
    ],
    bullets: [
      'Single source of truth for property & construction finance',
      'Role-based access for finance, site, and executive teams',
      'Audit-ready transaction history',
    ],
    cta: { label: 'Upgrade & keep your data', href: link(ctx, getBillingUrl()) },
    secondaryCta: { label: 'Continue in the app', href: link(ctx, getAppUrl()) },
  });
}

function trialDay12(ctx: EmailRenderContext) {
  const end = formatDate(ctx.trialEndDate);
  return baseLayout(ctx, {
    previewText: 'Your trial ends in 2 days.',
    headline: 'Day 12 — Upgrade reminder',
    greeting: greeting(ctx.recipientName),
    paragraphs: [
      `Your PBooks Pro trial ends in 2 days (on ${end}). Subscribe now to keep your data, workflows, team access, and reports without interruption.`,
    ],
    cta: { label: 'Choose a plan', href: link(ctx, getBillingUrl()) },
    footerNote: 'Questions about pricing? Reply to this email.',
  });
}

function trialDay14(ctx: EmailRenderContext) {
  return baseLayout(ctx, {
    previewText: 'Last day of your PBooks Pro trial.',
    headline: 'Day 14 — Trial ends today',
    greeting: greeting(ctx.recipientName),
    paragraphs: [
      'Today is the last day of your PBooks Pro trial. Upgrade now to avoid losing access to your workspace, historical transactions, and team permissions.',
    ],
    cta: { label: 'Upgrade now', href: link(ctx, getBillingUrl()) },
    secondaryCta: { label: 'Open app', href: link(ctx, getAppUrl()) },
  });
}

const LIFECYCLE_BUILDERS: Partial<
  Record<EmailAutomationEventType, (ctx: EmailRenderContext) => { html: string; text: string }>
> = {
  trial_started: trialWelcome,
  trial_day_1: trialDay1,
  trial_day_3: trialDay3,
  trial_day_7: trialDay7,
  trial_day_12: trialDay12,
  trial_day_14: trialDay14,
  trial_expiring: (ctx) => {
    const end = formatDate(ctx.trialEndDate);
    return baseLayout(ctx, {
      headline: 'Your trial ends soon',
      greeting: greeting(ctx.recipientName),
      paragraphs: [`Your PBooks Pro trial ends on ${end}. Subscribe to keep uninterrupted access.`],
      cta: { label: 'Upgrade', href: link(ctx, getBillingUrl()) },
    });
  },
  subscription_purchased: (ctx) =>
    baseLayout(ctx, {
      headline: 'Thank you for subscribing',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        `Thank you for subscribing to ${EMAIL_BRAND.name}${ctx.planName ? ` (${ctx.planName})` : ''}. Your workspace is fully unlocked.`,
      ],
      cta: { label: 'Open billing portal', href: link(ctx, getBillingUrl()) },
    }),
  payment_failed: (ctx) =>
    baseLayout(ctx, {
      headline: 'Payment action required',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        'We could not process your latest subscription payment. Update your payment method within the grace period to avoid service interruption.',
      ],
      cta: { label: 'Update payment method', href: link(ctx, getBillingUrl()) },
    }),
  subscription_cancelled: (ctx) =>
    baseLayout(ctx, {
      headline: 'Subscription cancelled',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        'Your PBooks Pro subscription has been cancelled. You can reactivate anytime from the billing portal.',
      ],
      cta: { label: 'Reactivate', href: link(ctx, getBillingUrl()) },
    }),
  new_feature_announcement: (ctx) =>
    baseLayout(ctx, {
      headline: ctx.featureTitle || 'New features are live',
      greeting: greeting(ctx.recipientName),
      paragraphs: [ctx.featureBody || ctx.customBody || 'Log in to explore the latest improvements.'],
      cta: { label: 'Open PBooks Pro', href: link(ctx, getAppUrl()) },
    }),
  re_engagement_campaign: (ctx) =>
    baseLayout(ctx, {
      headline: 'We miss you at PBooks Pro',
      greeting: greeting(ctx.recipientName),
      paragraphs: [
        ctx.customBody ||
          'Your property finance workspace is ready when you are. Log back in to pick up where you left off.',
      ],
      cta: { label: 'Log in', href: link(ctx, getAppUrl()) },
    }),
};

export function renderMarketingTemplate(
  templateKey: MarketingEmailTemplateKey,
  ctx: EmailRenderContext
): { html: string; text: string } {
  const builder = MARKETING_BUILDERS[templateKey];
  if (!builder) {
    return baseLayout(ctx, {
      greeting: greeting(ctx.recipientName),
      paragraphs: [ctx.customBody || templateKey],
    });
  }
  return builder(ctx);
}

export function renderLifecycleTemplate(
  eventType: EmailAutomationEventType,
  ctx: EmailRenderContext
): { html: string; text: string } {
  const builder = LIFECYCLE_BUILDERS[eventType];
  if (!builder) {
    return baseLayout(ctx, {
      greeting: greeting(ctx.recipientName),
      paragraphs: [ctx.customBody || eventType],
    });
  }
  return builder(ctx);
}
