import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ApprovalActionType } from '../../../workflow/workflowTypes.js';

export type ApprovalRequestActionRow = {
  id: string;
  tenant_id: string;
  approval_request_id: string;
  action: ApprovalActionType;
  actor_id: string | null;
  approval_level: number | null;
  previous_status: string | null;
  new_status: string | null;
  comments: string | null;
  delegate_to_user_id: string | null;
  created_at: Date;
};

export class ApprovalRequestActionRepository extends TenantRepository {
  async insertAction(client: import('pg').PoolClient, row: {
      id: string;
      approval_request_id: string;
      action: ApprovalActionType;
      actor_id?: string | null;
      approval_level?: number | null;
      previous_status?: string | null;
      new_status?: string | null;
      comments?: string | null;
      delegate_to_user_id?: string | null;
    }
  ): Promise<ApprovalRequestActionRow> {
    const r = await client.query<ApprovalRequestActionRow>(
      `INSERT INTO approval_request_actions (
        id, tenant_id, approval_request_id, action, actor_id, approval_level,
        previous_status, new_status, comments, delegate_to_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        row.id,
        this.tenantId,
        row.approval_request_id,
        row.action,
        row.actor_id ?? null,
        row.approval_level ?? null,
        row.previous_status ?? null,
        row.new_status ?? null,
        row.comments ?? null,
        row.delegate_to_user_id ?? null,
      ]
    );
    return r.rows[0];
  }

  async listForRequest(
    client: import('pg').PoolClient,
    approvalRequestId: string
  ): Promise<ApprovalRequestActionRow[]> {
    const r = await client.query<ApprovalRequestActionRow>(
      `SELECT * FROM approval_request_actions
       WHERE tenant_id = $1 AND approval_request_id = $2
       ORDER BY created_at ASC`,
      [this.tenantId, approvalRequestId]
    );
    return r.rows;
  }
}
