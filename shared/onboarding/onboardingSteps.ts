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

/** Streamlined 4-step flow for free-trial signups */
export const TRIAL_ONBOARDING_STEP_IDS = [
  'welcome',
  'company_info',
  'property_setup',
  'fiscal_year',
  'user_setup',
  'completion',
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export type OnboardingFlow = 'standard' | 'trial';

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

export function getOnboardingFlow(stepData?: Record<string, unknown>): OnboardingFlow {
  return stepData?.onboarding_flow === 'trial' ? 'trial' : 'standard';
}

export function stepOrderForFlow(flow: OnboardingFlow): readonly OnboardingStepId[] {
  return flow === 'trial' ? TRIAL_ONBOARDING_STEP_IDS : ONBOARDING_STEP_IDS;
}

export function getStepsForFlow(flow: OnboardingFlow): OnboardingStepMeta[] {
  const order = stepOrderForFlow(flow).filter((id) => id !== 'completion');
  return order.map((id) => {
    const base = ONBOARDING_STEPS.find((s) => s.id === id)!;
    if (flow !== 'trial') return base;
    if (id === 'company_info') {
      return {
        ...base,
        title: 'Company Setup',
        shortTitle: 'Company Setup',
        description: 'Legal name, address, and branding for invoices and reports.',
      };
    }
    if (id === 'property_setup') {
      return { ...base, title: 'Property Setup', shortTitle: 'Property Setup' };
    }
    if (id === 'fiscal_year') {
      return {
        ...base,
        title: 'Financial Year Setup',
        shortTitle: 'Financial Year',
        description: 'Set your reporting year and open your first accounting period.',
      };
    }
    if (id === 'user_setup') {
      return {
        ...base,
        title: 'Invite Team',
        shortTitle: 'Invite Team',
        description: 'Add teammates with the right roles.',
        optional: false,
      };
    }
    return base;
  });
}

export function nextOnboardingStep(
  current: OnboardingStepId,
  flow: OnboardingFlow = 'standard'
): OnboardingStepId | null {
  const order = stepOrderForFlow(flow);
  const idx = order.indexOf(current);
  if (idx < 0 || idx >= order.length - 1) return null;
  return order[idx + 1];
}

export function prevOnboardingStep(
  current: OnboardingStepId,
  flow: OnboardingFlow = 'standard'
): OnboardingStepId | null {
  const order = stepOrderForFlow(flow);
  const idx = order.indexOf(current);
  if (idx <= 0) return null;
  return order[idx - 1];
}

export function onboardingProgressPercent(
  completedSteps: string[],
  flow: OnboardingFlow = 'standard'
): number {
  const actionable = stepOrderForFlow(flow).filter((id) => id !== 'completion');
  const done = actionable.filter((id) => completedSteps.includes(id)).length;
  return Math.round((done / actionable.length) * 100);
}
