import { apiClient } from './client';
import type { OnboardingStepId, OnboardingStatus } from '../../shared/onboarding/onboardingSteps';

export type OnboardingState = {
  tenantId: string;
  status: OnboardingStatus;
  currentStep: OnboardingStepId;
  completedSteps: OnboardingStepId[];
  stepData: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
  progressPercent: number;
};

const LOCAL_KEY_PREFIX = 'pbooks_onboarding_';

function localKey(tenantOrCompanyId: string): string {
  return `${LOCAL_KEY_PREFIX}${tenantOrCompanyId}`;
}

export function loadLocalOnboarding(tenantOrCompanyId: string): OnboardingState | null {
  try {
    const raw = localStorage.getItem(localKey(tenantOrCompanyId));
    if (!raw) return null;
    return JSON.parse(raw) as OnboardingState;
  } catch {
    return null;
  }
}

export function saveLocalOnboarding(tenantOrCompanyId: string, state: OnboardingState): void {
  try {
    localStorage.setItem(localKey(tenantOrCompanyId), JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export const onboardingApi = {
  async get(): Promise<OnboardingState> {
    return apiClient.get<OnboardingState>('/onboarding');
  },

  async save(payload: {
    currentStep?: OnboardingStepId;
    completedSteps?: OnboardingStepId[];
    stepData?: Record<string, unknown>;
  }): Promise<OnboardingState> {
    return apiClient.put<OnboardingState>('/onboarding', payload);
  },

  async completeStep(stepId: OnboardingStepId, stepData?: Record<string, unknown>): Promise<OnboardingState> {
    return apiClient.post<OnboardingState>('/onboarding/complete-step', { stepId, stepData });
  },

  async skip(): Promise<OnboardingState> {
    return apiClient.post<OnboardingState>('/onboarding/skip', {});
  },

  async restart(): Promise<OnboardingState> {
    return apiClient.post<OnboardingState>('/onboarding/restart', {});
  },
};
