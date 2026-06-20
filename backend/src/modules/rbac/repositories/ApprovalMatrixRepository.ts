import { randomUUID } from 'crypto';
import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ApprovalEntityType, ApprovalMatrixRuleConditions } from '../../../auth/approvalTypes.js';

export type ApprovalMatrixRow = {
  tenant_id: string;
  version: number;
  is_active: boolean;
  updated_at: Date;
};

export type ApprovalCapabilityRow = {
  id: string;
  tenant_id: string;
  capability_key: string;
  entity_type: ApprovalEntityType;
  required_permission: string;
  max_level: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type ApprovalRuleRow = {
  id: string;
  tenant_id: string;
  entity_type: ApprovalEntityType;
  priority: number;
  approval_level: number;
  min_approvers: number;
  allow_self_approval: boolean;
  required_permission: string;
  conditions: ApprovalMatrixRuleConditions;
  is_mandatory: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type ApprovalAssignmentRow = {
  id: string;
  tenant_id: string;
  rule_id: string | null;
  capability_id: string | null;
  assignee_type: 'user' | 'role';
  assignee_id: string;
  approval_level: number;
  is_active: boolean;
  granted_by: string | null;
  granted_at: Date;
  updated_at: Date;
};

export class ApprovalMatrixRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async ensureMatrixRow(client: pg.PoolClient): Promise<ApprovalMatrixRow> {
    const existing = await client.query<ApprovalMatrixRow>(
      `SELECT * FROM rbac_approval_matrix WHERE tenant_id = $1`,
      [this.tenantId]
    );
    if (existing.rows[0]) return existing.rows[0];
    const r = await client.query<ApprovalMatrixRow>(
      `INSERT INTO rbac_approval_matrix (tenant_id, version, is_active)
       VALUES ($1, 1, TRUE) RETURNING *`,
      [this.tenantId]
    );
    return r.rows[0]!;
  }

  async bumpMatrixVersion(client: pg.PoolClient): Promise<number> {
    await this.ensureMatrixRow(client);
    const r = await client.query<{ version: number }>(
      `UPDATE rbac_approval_matrix SET version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 RETURNING version`,
      [this.tenantId]
    );
    return r.rows[0]?.version ?? 1;
  }

  async listCapabilities(): Promise<ApprovalCapabilityRow[]> {
    const r = await this.query<ApprovalCapabilityRow>(
      `SELECT * FROM rbac_approval_capabilities
       WHERE tenant_id = $1 ORDER BY entity_type, capability_key`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listRules(entityType?: ApprovalEntityType): Promise<ApprovalRuleRow[]> {
    if (entityType) {
      const r = await this.query<ApprovalRuleRow>(
        `SELECT * FROM rbac_approval_rules
         WHERE tenant_id = $1 AND entity_type = $2
         ORDER BY priority, approval_level`,
        [this.tenantId, entityType]
      );
      return r.rows;
    }
    const r = await this.query<ApprovalRuleRow>(
      `SELECT * FROM rbac_approval_rules WHERE tenant_id = $1 ORDER BY entity_type, priority, approval_level`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listAssignments(): Promise<ApprovalAssignmentRow[]> {
    const r = await this.query<ApprovalAssignmentRow>(
      `SELECT * FROM rbac_approval_assignments WHERE tenant_id = $1 ORDER BY assignee_type, assignee_id`,
      [this.tenantId]
    );
    return r.rows;
  }

  async upsertRule(
    client: pg.PoolClient,
    input: Omit<ApprovalRuleRow, 'tenant_id' | 'created_at' | 'updated_at'>
  ): Promise<ApprovalRuleRow> {
    const id = input.id || randomUUID();
    const r = await client.query<ApprovalRuleRow>(
      `INSERT INTO rbac_approval_rules (
         id, tenant_id, entity_type, priority, approval_level, min_approvers,
         allow_self_approval, required_permission, conditions, is_mandatory, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         entity_type = EXCLUDED.entity_type,
         priority = EXCLUDED.priority,
         approval_level = EXCLUDED.approval_level,
         min_approvers = EXCLUDED.min_approvers,
         allow_self_approval = EXCLUDED.allow_self_approval,
         required_permission = EXCLUDED.required_permission,
         conditions = EXCLUDED.conditions,
         is_mandatory = EXCLUDED.is_mandatory,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING *`,
      [
        id,
        this.tenantId,
        input.entity_type,
        input.priority,
        input.approval_level,
        input.min_approvers,
        input.allow_self_approval,
        input.required_permission,
        JSON.stringify(input.conditions ?? {}),
        input.is_mandatory,
        input.is_active,
      ]
    );
    return r.rows[0]!;
  }

  async insertAssignment(
    client: pg.PoolClient,
    input: {
      ruleId?: string | null;
      capabilityId?: string | null;
      assigneeType: 'user' | 'role';
      assigneeId: string;
      approvalLevel: number;
      grantedBy: string | null;
    }
  ): Promise<ApprovalAssignmentRow> {
    const id = randomUUID();
    const r = await client.query<ApprovalAssignmentRow>(
      `INSERT INTO rbac_approval_assignments (
         id, tenant_id, rule_id, capability_id, assignee_type, assignee_id,
         approval_level, is_active, granted_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8) RETURNING *`,
      [
        id,
        this.tenantId,
        input.ruleId ?? null,
        input.capabilityId ?? null,
        input.assigneeType,
        input.assigneeId,
        input.approvalLevel,
        input.grantedBy,
      ]
    );
    return r.rows[0]!;
  }

  async deactivateAssignment(client: pg.PoolClient, assignmentId: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE rbac_approval_assignments SET is_active = FALSE, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND is_active = TRUE`,
      [this.tenantId, assignmentId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async deactivateRule(client: pg.PoolClient, ruleId: string, isMandatory: boolean): Promise<boolean> {
    if (isMandatory) {
      throw Object.assign(new Error('Mandatory approval rules cannot be deactivated'), {
        code: 'MANDATORY_RULE',
      });
    }
    const r = await client.query(
      `UPDATE rbac_approval_rules SET is_active = FALSE, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND is_mandatory = FALSE`,
      [this.tenantId, ruleId]
    );
    return (r.rowCount ?? 0) > 0;
  }
}
