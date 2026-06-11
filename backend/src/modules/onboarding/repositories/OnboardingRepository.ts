import type pg from 'pg';
import {
  isValidOnboardingStep,
  getOnboardingFlow,
  progressPercentForFlow,
  type OnboardingStepId,
  type OnboardingStatus,
} from '../../../constants/onboardingSteps.js';

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
  onboardingFlow: 'standard' | 'trial';
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
  const stepData = parseStepData(row.step_data);
  const flow = getOnboardingFlow(stepData);

  return {
    tenantId: row.tenant_id,
    status: row.status,
    currentStep: isValidOnboardingStep(row.current_step) ? row.current_step : 'welcome',
    completedSteps,
    stepData,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    updatedAt: row.updated_at,
    progressPercent: progressPercentForFlow(flow, completedSteps),
    onboardingFlow: flow,
  };
}

export class OnboardingRepository {
  async getByTenant(client: pg.PoolClient, tenantId: string): Promise<OnboardingState | null> {
    const r = await client.query(`SELECT * FROM tenant_onboarding WHERE tenant_id = $1`, [tenantId]);
    return r.rows[0] ? mapRow(r.rows[0]) : null;
  }

  async insertDefault(client: pg.PoolClient, tenantId: string): Promise<void> {
    await client.query(
      `INSERT INTO tenant_onboarding (tenant_id, status, current_step)
       VALUES ($1, 'in_progress', 'welcome')
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId]
    );
  }

  async upsertTrial(client: pg.PoolClient, tenantId: string): Promise<void> {
    await client.query(
      `INSERT INTO tenant_onboarding (tenant_id, status, current_step, step_data)
       VALUES ($1, 'in_progress', 'welcome', '{"onboarding_flow":"trial"}'::jsonb)
       ON CONFLICT (tenant_id) DO UPDATE SET
         status = 'in_progress',
         current_step = 'welcome',
         step_data = tenant_onboarding.step_data || '{"onboarding_flow":"trial"}'::jsonb,
         updated_at = NOW()`,
      [tenantId]
    );
  }

  async patch(
    client: pg.PoolClient,
    tenantId: string,
    sets: string[],
    params: unknown[]
  ): Promise<OnboardingState> {
    await client.query(
      `UPDATE tenant_onboarding SET ${sets.join(', ')} WHERE tenant_id = $1`,
      params
    );
    const r = await client.query(`SELECT * FROM tenant_onboarding WHERE tenant_id = $1`, [tenantId]);
    return mapRow(r.rows[0]!);
  }

  async restart(client: pg.PoolClient, tenantId: string, stepDataJson: string): Promise<OnboardingState> {
    await client.query(
      `UPDATE tenant_onboarding SET
         status = 'in_progress',
         current_step = 'welcome',
         completed_steps = '[]'::jsonb,
         step_data = $2::jsonb,
         completed_at = NULL,
         updated_at = NOW()
       WHERE tenant_id = $1`,
      [tenantId, stepDataJson]
    );
    const r = await client.query(`SELECT * FROM tenant_onboarding WHERE tenant_id = $1`, [tenantId]);
    return mapRow(r.rows[0]!);
  }
}
