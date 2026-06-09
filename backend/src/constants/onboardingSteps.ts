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

export const TRIAL_ONBOARDING_STEP_IDS = [
  'welcome',
  'company_info',
  'property_setup',
  'fiscal_year',
  'user_setup',
  'completion',
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export type OnboardingStatus = 'in_progress' | 'completed' | 'skipped';

export type OnboardingFlow = 'standard' | 'trial';

export function isValidOnboardingStep(step: string): step is OnboardingStepId {
  return (ONBOARDING_STEP_IDS as readonly string[]).includes(step);
}

export function getOnboardingFlow(stepData: Record<string, unknown>): OnboardingFlow {
  return stepData.onboarding_flow === 'trial' ? 'trial' : 'standard';
}

export function stepOrderForFlow(flow: OnboardingFlow): readonly OnboardingStepId[] {
  return flow === 'trial' ? TRIAL_ONBOARDING_STEP_IDS : ONBOARDING_STEP_IDS;
}

export function progressPercentForFlow(
  flow: OnboardingFlow,
  completedSteps: OnboardingStepId[]
): number {
  const actionable = stepOrderForFlow(flow).filter((id) => id !== 'completion');
  const done = actionable.filter((id) => completedSteps.includes(id)).length;
  return Math.round((done / actionable.length) * 100);
}

export function nextStepForFlow(
  flow: OnboardingFlow,
  current: OnboardingStepId
): OnboardingStepId | null {
  const order = stepOrderForFlow(flow);
  const idx = order.indexOf(current);
  if (idx < 0 || idx >= order.length - 1) return null;
  return order[idx + 1];
}
