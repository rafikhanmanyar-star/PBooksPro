/**
 * Tenant onboarding wizard — persisted progress and step data.
 */

import type pg from 'pg';
import {
  isValidOnboardingStep,
  ONBOARDING_STEP_IDS,
  type OnboardingStepId,
  type OnboardingStatus,
} from '../../constants/onboardingSteps.js';

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

function parseCompletedSteps(raw: unknown): OnboardingStepId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is OnboardingStepId => typeof s === 'string' && isValidOnboardingStep(s));
}

function parseStepData(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function mapRow(row: pg.QueryResultRow): OnboardingState {
  const completedSteps = parseCompletedSteps(row.completed_steps);
  const actionable = ONBOARDING_STEP_IDS.filter((id) => id !== 'completion');
  const done = actionable.filter((id) => completedSteps.includes(id)).length;
  const progressPercent = Math.round((done / actionable.length) * 100);

  return {
    tenantId: row.tenant_id,
    status: row.status,
    currentStep: isValidOnboardingStep(row.current_step) ? row.current_step : 'welcome',
    completedSteps,
    stepData: parseStepData(row.step_data),
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    updatedAt: row.updated_at,
    progressPercent,
  };
}

export async function getOrCreateOnboarding(
  client: pg.PoolClient,
  tenantId: string
): Promise<OnboardingState> {
  const { rows } = await client.query(
    `SELECT * FROM tenant_onboarding WHERE tenant_id = $1`,
    [tenantId]
  );

  if (rows.length) return mapRow(rows[0]);

  await client.query(
    `INSERT INTO tenant_onboarding (tenant_id, status, current_step)
     VALUES ($1, 'in_progress', 'welcome')
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );

  const again = await client.query(`SELECT * FROM tenant_onboarding WHERE tenant_id = $1`, [tenantId]);
  if (!again.rows.length) throw new Error('Failed to initialize onboarding.');
  return mapRow(again.rows[0]);
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

  await client.query(`UPDATE tenant_onboarding SET ${sets.join(', ')} WHERE tenant_id = $1`, params);

  const { rows } = await client.query(`SELECT * FROM tenant_onboarding WHERE tenant_id = $1`, [tenantId]);
  return mapRow(rows[0]);
}

export async function completeOnboardingStep(
  client: pg.PoolClient,
  tenantId: string,
  stepId: OnboardingStepId,
  stepData?: Record<string, unknown>
): Promise<OnboardingState> {
  const current = await getOrCreateOnboarding(client, tenantId);
  const completed = new Set(current.completedSteps);
  completed.add(stepId);

  const nextIdx = ONBOARDING_STEP_IDS.indexOf(stepId);
  const nextStep =
    nextIdx >= 0 && nextIdx < ONBOARDING_STEP_IDS.length - 1
      ? ONBOARDING_STEP_IDS[nextIdx + 1]
      : 'completion';

  const mergedData = stepData ? { ...current.stepData, [stepId]: stepData } : current.stepData;
  const allDone = ONBOARDING_STEP_IDS.filter((id) => id !== 'completion').every((id) =>
    completed.has(id)
  );

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
  await client.query(
    `UPDATE tenant_onboarding SET
       status = 'in_progress',
       current_step = 'welcome',
       completed_steps = '[]'::jsonb,
       step_data = '{}'::jsonb,
       completed_at = NULL,
       updated_at = NOW()
     WHERE tenant_id = $1`,
    [tenantId]
  );
  const { rows } = await client.query(`SELECT * FROM tenant_onboarding WHERE tenant_id = $1`, [tenantId]);
  if (rows.length) return mapRow(rows[0]);
  return getOrCreateOnboarding(client, tenantId);
}
