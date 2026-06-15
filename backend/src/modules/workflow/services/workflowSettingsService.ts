import type pg from 'pg';
import { TenantSettingsRepository } from '../repositories/TenantSettingsRepository.js';
import type { WorkflowConfig } from '../../../workflow/workflowTypes.js';
import { DEFAULT_WORKFLOW_CONFIG } from '../../../workflow/workflowTypes.js';

export type WorkflowSettingsApi = {
  approvalWorkflowEnabled: boolean;
  workflowConfig: WorkflowConfig;
  updatedAt?: string;
};

export function rowToWorkflowSettingsApi(row: {
  approval_workflow_enabled: boolean;
  workflow_config: WorkflowConfig;
  updated_at?: Date;
}): WorkflowSettingsApi {
  return {
    approvalWorkflowEnabled: row.approval_workflow_enabled,
    workflowConfig: row.workflow_config ?? DEFAULT_WORKFLOW_CONFIG,
    updatedAt: row.updated_at?.toISOString(),
  };
}

export async function getWorkflowSettings(
  client: pg.PoolClient,
  tenantId: string
): Promise<WorkflowSettingsApi> {
  const repo = new TenantSettingsRepository(tenantId);
  const row = await repo.getOrCreate(client);
  return rowToWorkflowSettingsApi(row);
}

export async function isApprovalWorkflowEnabled(
  client: pg.PoolClient,
  tenantId: string
): Promise<boolean> {
  const settings = await getWorkflowSettings(client, tenantId);
  return settings.approvalWorkflowEnabled;
}

export async function updateWorkflowSettings(
  client: pg.PoolClient,
  tenantId: string,
  input: { approvalWorkflowEnabled?: boolean; workflowConfig?: WorkflowConfig },
  userId: string | null
): Promise<WorkflowSettingsApi> {
  const repo = new TenantSettingsRepository(tenantId);
  const updated = await repo.updateWorkflow(client, {
    approvalWorkflowEnabled: input.approvalWorkflowEnabled,
    workflowConfig: input.workflowConfig,
  });

  const { recordDomainMutation } = await import('../../../core/recordDomainMutation.js');
  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'workflow',
    entityType: 'tenant_settings',
    entityId: tenantId,
    action: 'update',
    auditAction: 'workflow_settings_updated',
    summary: `Workflow settings updated (enabled=${updated.approval_workflow_enabled})`,
    newValue: rowToWorkflowSettingsApi(updated),
  });

  return rowToWorkflowSettingsApi(updated);
}
