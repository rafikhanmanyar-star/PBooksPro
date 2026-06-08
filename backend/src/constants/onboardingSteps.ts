/** Keep in sync with shared/onboarding/onboardingSteps.ts */

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

export function isValidOnboardingStep(step: string): step is OnboardingStepId {
  return (ONBOARDING_STEP_IDS as readonly string[]).includes(step);
}
