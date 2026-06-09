/**
 * Marketing / lead nurture email template catalog.
 * Keys map to HTML builders in services/email/emailTemplateLibrary.ts
 */

export type MarketingEmailTemplateKey =
  | 'demo_confirmation'
  | 'demo_reminder'
  | 'demo_followup'
  | 'newsletter_welcome'
  | 'newsletter_lead_magnet'
  | 'lead_checklist_instant'
  | 'lead_checklist_day2'
  | 'lead_checklist_day5'
  | 'lead_checklist_day10'
  | 'newsletter_week2';

export type MarketingEmailTemplateDef = {
  key: MarketingEmailTemplateKey;
  subject: string;
  description: string;
  workflow: 'demo_request' | 'free_trial' | 'newsletter' | 'lead_magnet';
};

export const MARKETING_EMAIL_TEMPLATES: MarketingEmailTemplateDef[] = [
  {
    key: 'demo_confirmation',
    subject: 'Your PBooks Pro demo request is confirmed',
    description: 'Demo workflow — Email 1: instant confirmation after booking.',
    workflow: 'demo_request',
  },
  {
    key: 'demo_reminder',
    subject: 'Reminder: your PBooks Pro demo',
    description: 'Demo workflow — Email 2: schedule reminder (+1 day).',
    workflow: 'demo_request',
  },
  {
    key: 'demo_followup',
    subject: 'Following up on your PBooks Pro demo',
    description: 'Demo workflow — Email 3: post-demo trial CTA (+3 days).',
    workflow: 'demo_request',
  },
  {
    key: 'newsletter_welcome',
    subject: 'Welcome to PBooks Pro insights',
    description: 'Newsletter workflow — Email 1: welcome & expectations.',
    workflow: 'newsletter',
  },
  {
    key: 'newsletter_lead_magnet',
    subject: 'Your free property finance guide',
    description: 'Newsletter workflow — Email 2: lead magnet delivery.',
    workflow: 'newsletter',
  },
  {
    key: 'lead_checklist_instant',
    subject: 'Your Property Management & Accounting Checklist',
    description: 'Checklist / exit-intent — instant delivery.',
    workflow: 'lead_magnet',
  },
  {
    key: 'lead_checklist_day2',
    subject: '3 accounting mistakes property managers make',
    description: 'Checklist nurture — day 2 tips.',
    workflow: 'lead_magnet',
  },
  {
    key: 'lead_checklist_day5',
    subject: 'See PBooks Pro handle rentals & construction in one place',
    description: 'Checklist nurture — day 5 demo CTA.',
    workflow: 'lead_magnet',
  },
  {
    key: 'lead_checklist_day10',
    subject: 'Ready to replace spreadsheets? Start your free trial',
    description: 'Checklist nurture — day 10 trial CTA.',
    workflow: 'lead_magnet',
  },
  {
    key: 'newsletter_week2',
    subject: 'Property finance KPIs worth tracking monthly',
    description: 'Newsletter nurture — week 2 value email.',
    workflow: 'newsletter',
  },
];

export function getMarketingTemplateCatalog() {
  return MARKETING_EMAIL_TEMPLATES;
}
