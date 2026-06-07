/**
 * Nurture sequence definitions — swap template_key for ESP/CRM templates when integrating.
 */
export type EmailSequenceStep = {
  id: string;
  delayDays: number;
  subject: string;
  templateKey: string;
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
    id: 'checklist_welcome',
    name: 'Checklist Lead Magnet Nurture',
    description: 'Delivered after Property Management & Accounting Checklist download',
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
  {
    id: 'newsletter_nurture',
    name: 'Newsletter Subscriber Nurture',
    description: 'Light-touch sequence for footer and blog newsletter signups',
    triggerSources: ['newsletter'],
    steps: [
      {
        id: 'welcome',
        delayDays: 0,
        subject: 'Welcome to PBooksPro insights',
        templateKey: 'newsletter_welcome',
      },
      {
        id: 'week_2',
        delayDays: 14,
        subject: 'Property finance KPIs worth tracking monthly',
        templateKey: 'newsletter_week2',
      },
    ],
  },
];

export function sequenceForSource(source: string): EmailSequenceDefinition | undefined {
  return EMAIL_SEQUENCES.find((seq) => seq.triggerSources.includes(source));
}
