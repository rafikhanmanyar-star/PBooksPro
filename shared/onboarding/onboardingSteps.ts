/**
 * Onboarding wizard step definitions (shared client + server).
 */

export const ONBOARDING_STEP_IDS = [
  'welcome',
  'business_setup',
  'company_info',
  'fiscal_year',
  'chart_of_accounts',
  'property_setup',
  'user_setup',
  'first_transaction',
  'completion',
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export type OnboardingStatus = 'in_progress' | 'completed' | 'skipped';

export type OnboardingStepMeta = {
  id: OnboardingStepId;
  title: string;
  shortTitle: string;
  description: string;
  optional?: boolean;
};

export const ONBOARDING_STEPS: OnboardingStepMeta[] = [
  {
    id: 'welcome',
    title: 'Welcome to PBooksPro',
    shortTitle: 'Welcome',
    description: 'Get oriented and start your setup journey.',
  },
  {
    id: 'business_setup',
    title: 'Business Setup',
    shortTitle: 'Business',
    description: 'Tell us how you run your property business.',
  },
  {
    id: 'company_info',
    title: 'Company Information',
    shortTitle: 'Company',
    description: 'Legal name, address, and branding for documents.',
  },
  {
    id: 'fiscal_year',
    title: 'Fiscal Year Setup',
    shortTitle: 'Fiscal year',
    description: 'Set your reporting year and open your first period.',
  },
  {
    id: 'chart_of_accounts',
    title: 'Chart of Accounts',
    shortTitle: 'Accounts',
    description: 'Confirm your ledger structure is ready.',
  },
  {
    id: 'property_setup',
    title: 'Property Setup',
    shortTitle: 'Property',
    description: 'Add your first building and rental property.',
  },
  {
    id: 'user_setup',
    title: 'User Setup',
    shortTitle: 'Users',
    description: 'Invite teammates with the right roles.',
    optional: true,
  },
  {
    id: 'first_transaction',
    title: 'First Transaction',
    shortTitle: 'Transaction',
    description: 'Record an opening balance or sample entry.',
    optional: true,
  },
  {
    id: 'completion',
    title: 'Setup Complete',
    shortTitle: 'Complete',
    description: 'Review your progress and launch the app.',
  },
];

export function isValidOnboardingStep(step: string): step is OnboardingStepId {
  return (ONBOARDING_STEP_IDS as readonly string[]).includes(step);
}

export function nextOnboardingStep(current: OnboardingStepId): OnboardingStepId | null {
  const idx = ONBOARDING_STEP_IDS.indexOf(current);
  if (idx < 0 || idx >= ONBOARDING_STEP_IDS.length - 1) return null;
  return ONBOARDING_STEP_IDS[idx + 1];
}

export function prevOnboardingStep(current: OnboardingStepId): OnboardingStepId | null {
  const idx = ONBOARDING_STEP_IDS.indexOf(current);
  if (idx <= 0) return null;
  return ONBOARDING_STEP_IDS[idx - 1];
}

export function onboardingProgressPercent(completedSteps: string[]): number {
  const actionable = ONBOARDING_STEP_IDS.filter((id) => id !== 'completion');
  const done = actionable.filter((id) => completedSteps.includes(id)).length;
  return Math.round((done / actionable.length) * 100);
}
