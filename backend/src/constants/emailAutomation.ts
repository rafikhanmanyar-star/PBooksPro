/**

 * Email automation event catalog, template keys, and trial lifecycle schedule.

 */



export type EmailAutomationEventType =

  | 'trial_started'

  | 'trial_day_1'

  | 'trial_day_3'

  | 'trial_day_7'

  | 'trial_day_12'

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

  'trial_day_1',

  'trial_day_3',

  'trial_day_7',

  'trial_day_12',

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

    subject: 'Welcome to PBooks Pro — your 14-day trial has started',

    category: 'lifecycle',

    description: 'Free trial workflow — welcome email (day 0).',

  },

  {

    key: 'trial_day_1',

    eventType: 'trial_day_1',

    subject: 'Day 1: Quick-start tips for your PBooks Pro trial',

    category: 'lifecycle',

    description: 'Free trial workflow — day 1 setup tips.',

  },

  {

    key: 'trial_day_3',

    eventType: 'trial_day_3',

    subject: 'Day 3: Features to explore in PBooks Pro',

    category: 'lifecycle',

    description: 'Free trial workflow — day 3 feature highlights.',

  },

  {

    key: 'trial_day_7',

    eventType: 'trial_day_7',

    subject: 'Day 7: Benefits you are unlocking with PBooks Pro',

    category: 'lifecycle',

    description: 'Free trial workflow — day 7 benefits & upgrade CTA.',

  },

  {

    key: 'trial_day_12',

    eventType: 'trial_day_12',

    subject: 'Day 12: Your trial ends in 2 days',

    category: 'lifecycle',

    description: 'Free trial workflow — day 12 upgrade reminder.',

  },

  {

    key: 'trial_day_14',

    eventType: 'trial_day_14',

    subject: 'Day 14: Your PBooks Pro trial ends today',

    category: 'lifecycle',

    description: 'Free trial workflow — day 14 trial expiry.',

  },

  {

    key: 'trial_expiring',

    eventType: 'trial_expiring',

    subject: 'Your PBooks Pro trial ends soon',

    category: 'lifecycle',

    description: 'Legacy expiring notice (superseded by trial_day_12 for 14-day trials).',

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



/** Relative to trial start date — Free Trial workflow (6 emails). */

export const TRIAL_LIFECYCLE_SCHEDULE: TrialScheduleStep[] = [

  {

    eventType: 'trial_started',

    templateKey: 'trial_started',

    delayDays: 0,

    subject: 'Welcome to PBooks Pro — your 14-day trial has started',

  },

  {

    eventType: 'trial_day_1',

    templateKey: 'trial_day_1',

    delayDays: 1,

    subject: 'Day 1: Quick-start tips for your PBooks Pro trial',

  },

  {

    eventType: 'trial_day_3',

    templateKey: 'trial_day_3',

    delayDays: 3,

    subject: 'Day 3: Features to explore in PBooks Pro',

  },

  {

    eventType: 'trial_day_7',

    templateKey: 'trial_day_7',

    delayDays: 7,

    subject: 'Day 7: Benefits you are unlocking with PBooks Pro',

  },

  {

    eventType: 'trial_day_12',

    templateKey: 'trial_day_12',

    delayDays: 12,

    subject: 'Day 12: Your trial ends in 2 days',

  },

  {

    eventType: 'trial_day_14',

    templateKey: 'trial_day_14',

    delayDays: 14,

    subject: 'Day 14: Your PBooks Pro trial ends today',

  },

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


