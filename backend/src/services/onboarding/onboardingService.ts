/**
 * Tenant onboarding wizard — persisted progress and step data.
 */

import type pg from 'pg';
import {
  isValidOnboardingStep,
  getOnboardingFlow,
  nextStepForFlow,
  stepOrderForFlow,
  type OnboardingStepId,
  type OnboardingStatus,
} from '../../constants/onboardingSteps.js';
import {
  OnboardingRepository,
  type OnboardingState,
} from '../../modules/onboarding/repositories/OnboardingRepository.js';

export type { OnboardingState };

const onboardingRepo = new OnboardingRepository();

export async function getOrCreateOnboarding(
  client: pg.PoolClient,
  tenantId: string
): Promise<OnboardingState> {
  const existing = await onboardingRepo.getByTenant(client, tenantId);
  if (existing) return existing;

  await onboardingRepo.insertDefault(client, tenantId);
  const row = await onboardingRepo.getByTenant(client, tenantId);
  if (!row) throw new Error('Failed to initialize onboarding.');
  return row;
}

export async function initializeTrialOnboarding(
  client: pg.PoolClient,
  tenantId: string
): Promise<OnboardingState> {
  await onboardingRepo.upsertTrial(client, tenantId);
  const row = await onboardingRepo.getByTenant(client, tenantId);
  if (!row) throw new Error('Failed to initialize trial onboarding.');
  return row;
}

export async function updateOnboarding(
  client: pg.PoolClient,
  tenantId: string,
  patch: {
    currentStep?: OnboardingStepId;
    completedSteps?: OnboardingStepId[];
    stepData?: Record<string, unknown>;
    status?: OnboardingStatus;
  }
): Promise<OnboardingState> {
  await getOrCreateOnboarding(client, tenantId);

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (patch.currentStep) {
    if (!isValidOnboardingStep(patch.currentStep)) {
      throw new Error(`Invalid onboarding step: ${patch.currentStep}`);
    }
    sets.push(`current_step = $${idx++}`);
    params.push(patch.currentStep);
  }

  if (patch.completedSteps) {
    sets.push(`completed_steps = $${idx++}::jsonb`);
    params.push(JSON.stringify(patch.completedSteps));
  }

  if (patch.stepData) {
    sets.push(`step_data = step_data || $${idx++}::jsonb`);
    params.push(JSON.stringify(patch.stepData));
  }

  if (patch.status) {
    sets.push(`status = $${idx++}`);
    params.push(patch.status);
    if (patch.status === 'completed' || patch.status === 'skipped') {
      sets.push(`completed_at = COALESCE(completed_at, NOW())`);
    }
  }

  return onboardingRepo.patch(client, tenantId, sets, params);
}

export async function completeOnboardingStep(
  client: pg.PoolClient,
  tenantId: string,
  stepId: OnboardingStepId,
  stepData?: Record<string, unknown>
): Promise<OnboardingState> {
  const current = await getOrCreateOnboarding(client, tenantId);
  const flow = getOnboardingFlow(current.stepData);
  const completed = new Set(current.completedSteps);
  completed.add(stepId);

  const nextStep = nextStepForFlow(flow, stepId) ?? 'completion';
  const mergedData = stepData ? { ...current.stepData, [stepId]: stepData } : current.stepData;
  const actionable = stepOrderForFlow(flow).filter((id) => id !== 'completion');
  const allDone = actionable.every((id) => completed.has(id));

  return updateOnboarding(client, tenantId, {
    currentStep: nextStep,
    completedSteps: [...completed],
    stepData: mergedData,
    status: allDone || stepId === 'completion' ? 'completed' : current.status,
  });
}

export async function skipOnboarding(client: pg.PoolClient, tenantId: string): Promise<OnboardingState> {
  return updateOnboarding(client, tenantId, { status: 'skipped' });
}

export async function restartOnboarding(client: pg.PoolClient, tenantId: string): Promise<OnboardingState> {
  const current = await getOrCreateOnboarding(client, tenantId);
  const flowFlag = current.onboardingFlow === 'trial' ? { onboarding_flow: 'trial' } : {};
  const restarted = await onboardingRepo.restart(client, tenantId, JSON.stringify(flowFlag));
  if (restarted) return restarted;
  return getOrCreateOnboarding(client, tenantId);
}
