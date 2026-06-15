import { TenantRepository } from '../../../core/TenantRepository.js';
import type { WorkflowConfig } from '../../../workflow/workflowTypes.js';
import { DEFAULT_WORKFLOW_CONFIG } from '../../../workflow/workflowTypes.js';

export type TenantSettingsRow = {
  tenant_id: string;
  approval_workflow_enabled: boolean;
  workflow_config: WorkflowConfig;
  created_at: Date;
  updated_at: Date;
};

function parseWorkflowConfig(raw: unknown): WorkflowConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_WORKFLOW_CONFIG;
  const o = raw as Record<string, unknown>;
  const levels = o.levels === 1 || o.levels === 2 || o.levels === 3 ? o.levels : 3;
  const rules = Array.isArray(o.rules) ? o.rules : [];
  return { levels, rules: rules as WorkflowConfig['rules'] };
}

export class TenantSettingsRepository extends TenantRepository {
  async getOrCreate(client: import('pg').PoolClient): Promise<TenantSettingsRow> {
    const r = await client.query<TenantSettingsRow>(
      `SELECT tenant_id, approval_workflow_enabled, workflow_config, created_at, updated_at
       FROM tenant_settings WHERE tenant_id = $1`,
      [this.tenantId]
    );
    if (r.rows[0]) {
      return {
        ...r.rows[0],
        workflow_config: parseWorkflowConfig(r.rows[0].workflow_config),
      };
    }
    await client.query(
      `INSERT INTO tenant_settings (tenant_id, approval_workflow_enabled, workflow_config)
       VALUES ($1, FALSE, $2::jsonb)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [this.tenantId, JSON.stringify(DEFAULT_WORKFLOW_CONFIG)]
    );
    const again = await client.query<TenantSettingsRow>(
      `SELECT tenant_id, approval_workflow_enabled, workflow_config, created_at, updated_at
       FROM tenant_settings WHERE tenant_id = $1`,
      [this.tenantId]
    );
    const row = again.rows[0];
    if (!row) throw new Error('Failed to initialize tenant settings.');
    return { ...row, workflow_config: parseWorkflowConfig(row.workflow_config) };
  }

  async updateWorkflow(
    client: import('pg').PoolClient,
    input: { approvalWorkflowEnabled?: boolean; workflowConfig?: WorkflowConfig }
  ): Promise<TenantSettingsRow> {
    await this.getOrCreate(client);
    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [this.tenantId];
    let idx = 2;
    if (input.approvalWorkflowEnabled !== undefined) {
      sets.push(`approval_workflow_enabled = $${idx++}`);
      params.push(input.approvalWorkflowEnabled);
    }
    if (input.workflowConfig !== undefined) {
      sets.push(`workflow_config = $${idx++}::jsonb`);
      params.push(JSON.stringify(input.workflowConfig));
    }
    const r = await client.query<TenantSettingsRow>(
      `UPDATE tenant_settings SET ${sets.join(', ')}
       WHERE tenant_id = $1
       RETURNING tenant_id, approval_workflow_enabled, workflow_config, created_at, updated_at`,
      params
    );
    const row = r.rows[0];
    if (!row) throw new Error('Tenant settings not found.');
    return { ...row, workflow_config: parseWorkflowConfig(row.workflow_config) };
  }
}
