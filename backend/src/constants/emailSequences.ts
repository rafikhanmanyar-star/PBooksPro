/**
 * Lead nurture sequence definitions — triggers on marketing_leads.source.
 * Templates: constants/marketingEmailTemplates.ts + services/email/emailTemplateLibrary.ts
 */
import type { MarketingEmailTemplateKey } from './marketingEmailTemplates.js';

export type EmailSequenceStep = {
  id: string;
  delayDays: number;
  /** Additional delay after delayDays (e.g. lead magnet 1h after welcome). */
  delayMinutes?: number;
  subject: string;
  templateKey: MarketingEmailTemplateKey;
  previewText?: string;
};

export type EmailSequenceDefinition = {
  id: string;
  name: string;
  description: string;
  triggerSources: string[];
  steps: EmailSequenceStep[];
};

export const EMAIL_SEQUENCES: EmailSequenceDefinition[] = [
  {
    id: 'demo_request_nurture',
    name: 'Demo Request Workflow',
    description: 'Confirmation is sent instantly on booking; this sequence sends reminder + follow-up.',
    triggerSources: ['demo_booking'],
    steps: [
      {
        id: 'reminder',
        delayDays: 1,
        subject: 'Reminder: your PBooks Pro demo',
        templateKey: 'demo_reminder',
        previewText: 'Pick a time or prepare for your upcoming session',
      },
      {
        id: 'followup',
        delayDays: 3,
        subject: 'Following up on your PBooks Pro demo',
        templateKey: 'demo_followup',
        previewText: 'Start your 14-day free trial',
      },
    ],
  },
  {
    id: 'newsletter_nurture',
    name: 'Newsletter Signup Workflow',
    description: 'Welcome email + lead magnet delivery for footer and blog subscribers',
    triggerSources: ['newsletter'],
    steps: [
      {
        id: 'welcome',
        delayDays: 0,
        subject: 'Welcome to PBooks Pro insights',
        templateKey: 'newsletter_welcome',
        previewText: 'Practical property & construction finance tips',
      },
      {
        id: 'lead_magnet',
        delayDays: 0,
        delayMinutes: 60,
        subject: 'Your free property finance guide',
        templateKey: 'newsletter_lead_magnet',
        previewText: 'Download your guide',
      },
      {
        id: 'week_2',
        delayDays: 14,
        subject: 'Property finance KPIs worth tracking monthly',
        templateKey: 'newsletter_week2',
      },
    ],
  },
  {
    id: 'checklist_welcome',
    name: 'Checklist / Exit-Intent Lead Magnet',
    description: 'Delivered after checklist download or exit-intent popup',
    triggerSources: ['checklist', 'exit_intent'],
    steps: [
      {
        id: 'instant_delivery',
        delayDays: 0,
        subject: 'Your Property Management & Accounting Checklist',
        templateKey: 'lead_checklist_instant',
        previewText: 'Download link and setup tips inside',
      },
      {
        id: 'day_2_tips',
        delayDays: 2,
        subject: '3 accounting mistakes property managers make',
        templateKey: 'lead_checklist_day2',
      },
      {
        id: 'day_5_demo',
        delayDays: 5,
        subject: 'See PBooksPro handle rentals & construction in one place',
        templateKey: 'lead_checklist_day5',
      },
      {
        id: 'day_10_trial',
        delayDays: 10,
        subject: 'Ready to replace spreadsheets? Start your free trial',
        templateKey: 'lead_checklist_day10',
      },
    ],
  },
];

export function sequenceForSource(source: string): EmailSequenceDefinition | undefined {
  return EMAIL_SEQUENCES.find((seq) => seq.triggerSources.includes(source));
}
