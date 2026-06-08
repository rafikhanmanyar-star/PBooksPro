/**
 * Email automation event catalog, template keys, and trial lifecycle schedule.
 */

export type EmailAutomationEventType =
  | 'trial_started'
  | 'trial_day_3'
  | 'trial_day_7'
  | 'trial_day_14'
  | 'trial_expiring'
  | 'subscription_purchased'
  | 'payment_failed'
  | 'subscription_cancelled'
  | 'new_feature_announcement'
  | 're_engagement_campaign';

export type EmailAutomationCategory = 'lifecycle' | 'announcements' | 'marketing' | 'all';

export type EmailTemplateDef = {
  key: string;
  eventType: EmailAutomationEventType;
  subject: string;
  category: EmailAutomationCategory;
  description: string;
};

export const EMAIL_AUTOMATION_EVENTS: EmailAutomationEventType[] = [
  'trial_started',
  'trial_day_3',
  'trial_day_7',
  'trial_day_14',
  'trial_expiring',
  'subscription_purchased',
  'payment_failed',
  'subscription_cancelled',
  'new_feature_announcement',
  're_engagement_campaign',
];

export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    key: 'trial_started',
    eventType: 'trial_started',
    subject: 'Welcome to PBooks Pro — your trial has started',
    category: 'lifecycle',
    description: 'Sent immediately when a tenant begins a trial.',
  },
  {
    key: 'trial_day_3',
    eventType: 'trial_day_3',
    subject: 'Day 3: Set up your chart of accounts',
    category: 'lifecycle',
    description: 'Trial nurture — core setup reminder.',
  },
  {
    key: 'trial_day_7',
    eventType: 'trial_day_7',
    subject: 'Day 7: Record your first transactions',
    category: 'lifecycle',
    description: 'Trial nurture — first transaction encouragement.',
  },
  {
    key: 'trial_day_14',
    eventType: 'trial_day_14',
    subject: 'Day 14: Explore reports & dashboards',
    category: 'lifecycle',
    description: 'Trial nurture — reporting value highlight.',
  },
  {
    key: 'trial_expiring',
    eventType: 'trial_expiring',
    subject: 'Your PBooks Pro trial ends soon',
    category: 'lifecycle',
    description: 'Sent 2 days before trial end.',
  },
  {
    key: 'subscription_purchased',
    eventType: 'subscription_purchased',
    subject: 'Thank you for subscribing to PBooks Pro',
    category: 'lifecycle',
    description: 'Sent when a paid subscription activates.',
  },
  {
    key: 'payment_failed',
    eventType: 'payment_failed',
    subject: 'Action required: payment failed on your PBooks Pro subscription',
    category: 'lifecycle',
    description: 'Sent when subscription enters past_due.',
  },
  {
    key: 'subscription_cancelled',
    eventType: 'subscription_cancelled',
    subject: 'Your PBooks Pro subscription has been cancelled',
    category: 'lifecycle',
    description: 'Sent when subscription is cancelled.',
  },
  {
    key: 'new_feature_announcement',
    eventType: 'new_feature_announcement',
    subject: 'New in PBooks Pro',
    category: 'announcements',
    description: 'Admin broadcast for product updates.',
  },
  {
    key: 're_engagement_campaign',
    eventType: 're_engagement_campaign',
    subject: 'We miss you at PBooks Pro',
    category: 'marketing',
    description: 'Re-engagement for expired or inactive tenants.',
  },
];

export type TrialScheduleStep = {
  eventType: EmailAutomationEventType;
  templateKey: string;
  delayDays: number;
  subject: string;
};

/** Relative to trial start date. trial_expiring uses negative offset from trial end (handled separately). */
export const TRIAL_LIFECYCLE_SCHEDULE: TrialScheduleStep[] = [
  { eventType: 'trial_started', templateKey: 'trial_started', delayDays: 0, subject: 'Welcome to PBooks Pro — your trial has started' },
  { eventType: 'trial_day_3', templateKey: 'trial_day_3', delayDays: 3, subject: 'Day 3: Set up your chart of accounts' },
  { eventType: 'trial_day_7', templateKey: 'trial_day_7', delayDays: 7, subject: 'Day 7: Record your first transactions' },
  { eventType: 'trial_day_14', templateKey: 'trial_day_14', delayDays: 14, subject: 'Day 14: Explore reports & dashboards' },
];

export const TRIAL_EXPIRING_DAYS_BEFORE_END = 2;

export function templateForEvent(eventType: EmailAutomationEventType): EmailTemplateDef | undefined {
  return EMAIL_TEMPLATES.find((t) => t.eventType === eventType);
}

export function categoryForEvent(eventType: EmailAutomationEventType): EmailAutomationCategory {
  const tpl = templateForEvent(eventType);
  return tpl?.category ?? 'lifecycle';
}

export function getTemplateCatalog() {
  return EMAIL_TEMPLATES.map((t) => ({
    key: t.key,
    eventType: t.eventType,
    subject: t.subject,
    category: t.category,
    description: t.description,
  }));
}
